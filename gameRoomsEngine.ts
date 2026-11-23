import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import {
  MountainGameConfig,
  MountainGameMode,
  MountainGameRoomState,
  MountainPlayerRoundDelta,
  MountainPlayerState,
  MountainQuestionItem,
  MountainTimeMode,
} from './src/types/exam';
import {
  DEFAULT_MOUNTAIN_STARTER_QUESTIONS,
  MOUNTAIN_PETS,
} from './src/data/mountainPets';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROUND_RESULT_DURATION_MS = 3500;
const ROOM_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function getCapacityForMode(mode: MountainGameMode): number {
  if (mode === 'solo') return 1;
  if (mode === 'duo') return 2;
  return 60;
}

function sanitizeQuestions(rawQuestions?: MountainQuestionItem[]): MountainQuestionItem[] {
  const source = Array.isArray(rawQuestions) && rawQuestions.length > 0
    ? rawQuestions
    : DEFAULT_MOUNTAIN_STARTER_QUESTIONS;

  const cleaned: MountainQuestionItem[] = [];
  source.forEach((q, idx) => {
    if (!q || typeof q.question !== 'string' || !q.question.trim()) return;
    const opts = Array.isArray(q.options)
      ? q.options.map((o) => String(o ?? '').trim()).filter(Boolean)
      : [];
    if (opts.length < 2) return;
    const correctIdx =
      typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < opts.length
        ? q.correctAnswer
        : 0;
    cleaned.push({
      id: String(q.id || `mq_${idx + 1}`).trim(),
      question: q.question.trim(),
      imageUrl: typeof q.imageUrl === 'string' && q.imageUrl.trim() ? q.imageUrl.trim() : undefined,
      options: opts.slice(0, 6),
      correctAnswer: correctIdx,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      sourceTitle: typeof q.sourceTitle === 'string' ? q.sourceTitle.trim() : undefined,
    });
  });

  if (cleaned.length === 0) {
    return DEFAULT_MOUNTAIN_STARTER_QUESTIONS.map((q) => ({ ...q, options: [...q.options] }));
  }
  return cleaned;
}

function sanitizeConfig(
  raw: Partial<MountainGameConfig> | undefined,
  availableQuestionsCount: number
): MountainGameConfig {
  const mode: MountainGameMode =
    raw?.mode === 'solo' || raw?.mode === 'duo' || raw?.mode === 'multi'
      ? raw.mode
      : 'multi';
  const timeMode: MountainTimeMode =
    raw?.timeMode === 'total_game' ? 'total_game' : 'per_question';
  const maxQ = Math.max(1, availableQuestionsCount);
  const questionCount = clampInt(raw?.questionCount, 1, maxQ, Math.min(10, maxQ));

  return {
    mode,
    timeMode,
    questionTimeSec: clampInt(raw?.questionTimeSec, 5, 300, 15),
    totalTimeSec: clampInt(raw?.totalTimeSec, 30, 3600, 180),
    summitSteps: clampInt(raw?.summitSteps, 4, 60, 20),
    rank1Bonus: clampInt(raw?.rank1Bonus, 1, 10, 4),
    rank2Bonus: clampInt(raw?.rank2Bonus, 1, 10, 3),
    baseCorrectBonus: clampInt(raw?.baseCorrectBonus, 1, 10, 2),
    wrongPenalty: clampInt(raw?.wrongPenalty, 0, 5, 1),
    questionCount,
    sourceExamId: String(raw?.sourceExamId || 'starter_mixed'),
    sourceTitle: String(raw?.sourceTitle || 'Bộ câu hỏi Khởi động Đa môn (10 câu)'),
  };
}

function sanitizePetId(petId?: string): string {
  if (petId && MOUNTAIN_PETS.some((p) => p.id === petId)) {
    return petId;
  }
  return MOUNTAIN_PETS[0].id;
}

function sanitizePlayerName(name?: string, fallbackPrefix = 'Nhà leo núi'): string {
  const trimmed = String(name || '').trim().slice(0, 40);
  return trimmed || `${fallbackPrefix} #${Math.floor(100 + Math.random() * 900)}`;
}

function generateRoomCode(existingCodes: Set<string>): string {
  for (let attempt = 0; attempt < 30; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  return `M${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

function normalizeCustomRoomCode(raw?: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (cleaned.length < 4 || cleaned.length > 12) return null;
  return cleaned;
}

function createInitialPlayerState(params: {
  id: string;
  name: string;
  petId: string;
  isHost: boolean;
}): MountainPlayerState {
  return {
    id: params.id,
    name: sanitizePlayerName(params.name),
    petId: sanitizePetId(params.petId),
    isHost: params.isHost,
    connected: true,
    step: 0,
    rawSteps: 0,
    mainAnsweredCount: 0,
    firstTryCorrectCount: 0,
    wrongAttemptCount: 0,
    retryClearedCount: 0,
    wrongQueueIds: [],
    currentAnswer: null,
    currentRetryStartedAt: null,
    lastRetryFeedback: null,
    totalReactionMs: 0,
    answeredCountForAvg: 0,
    reachedSummitAt: null,
    officiallyFinished: false,
    finishedAt: null,
  };
}

interface InternalRoom {
  state: MountainGameRoomState;
  questionPool: MountainQuestionItem[];
  sockets: Map<string, Set<WebSocket>>;
}

export class MountainGameEngine {
  private rooms = new Map<string, InternalRoom>();
  private wss: WebSocketServer;
  private tickInterval: NodeJS.Timeout;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWebSocketEvents();
    this.tickInterval = setInterval(() => this.tickRooms(), 400);
  }

  public dispose(): void {
    clearInterval(this.tickInterval);
    this.wss.close();
  }

  public handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const host = req.headers.host || 'localhost';
    let urlObj: URL;
    try {
      urlObj = new URL(req.url || '/', `http://${host}`);
    } catch {
      return false;
    }

    if (urlObj.pathname !== '/ws/games') {
      return false;
    }

    const roomCode = (urlObj.searchParams.get('room') || '').trim().toUpperCase();
    const playerId = (urlObj.searchParams.get('playerId') || '').trim();

    if (!roomCode || !this.rooms.has(roomCode)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return true;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req, { roomCode, playerId });
    });
    return true;
  }

  private setupWebSocketEvents(): void {
    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage, meta?: { roomCode: string; playerId: string }) => {
      const roomCode = meta?.roomCode || '';
      const playerId = meta?.playerId || '';
      const internal = this.rooms.get(roomCode);
      if (!internal) {
        ws.close(1008, 'Room not found');
        return;
      }

      const key = playerId || `spectator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let set = internal.sockets.get(key);
      if (!set) {
        set = new Set();
        internal.sockets.set(key, set);
      }
      set.add(ws);

      const player = internal.state.players.find((p) => p.id === playerId);
      if (player && !player.connected) {
        player.connected = true;
        internal.state.updatedAt = Date.now();
        this.broadcastRoom(roomCode);
      } else {
        this.sendToSocket(ws, {
          type: 'room_state',
          room: this.sanitizeRoomForClient(internal.state),
        });
      }

      ws.on('message', (rawBuf) => {
        try {
          const msg = JSON.parse(rawBuf.toString('utf-8'));
          if (!msg || typeof msg !== 'object') return;

          if (msg.type === 'ping') {
            this.sendToSocket(ws, { type: 'pong', serverTime: Date.now() });
            return;
          }

          if (msg.type === 'submit_answer' && playerId) {
            const result = this.submitAnswer(roomCode, {
              playerId,
              questionId: String(msg.questionId || ''),
              selectedIndex: Number(msg.selectedIndex),
            });
            if (!result.ok) {
              this.sendToSocket(ws, { type: 'error', message: result.error });
            }
            return;
          }

          if (msg.type === 'advance_round' && playerId) {
            this.forceAdvanceRound(roomCode, playerId);
            return;
          }
        } catch {
          // Ignore malformed JSON frames
        }
      });

      ws.on('close', () => {
        const currentRoom = this.rooms.get(roomCode);
        if (!currentRoom) return;
        const playerSockets = currentRoom.sockets.get(key);
        if (playerSockets) {
          playerSockets.delete(ws);
          if (playerSockets.size === 0) {
            currentRoom.sockets.delete(key);
            const targetPlayer = currentRoom.state.players.find((p) => p.id === playerId);
            if (targetPlayer) {
              targetPlayer.connected = false;
              currentRoom.state.updatedAt = Date.now();
              this.broadcastRoom(roomCode);
            }
          }
        }
      });
    });
  }

  private sendToSocket(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private broadcastRoom(roomCode: string): void {
    const internal = this.rooms.get(roomCode);
    if (!internal) return;
    const sanitized = this.sanitizeRoomForClient(internal.state);
    const encoded = JSON.stringify({ type: 'room_state', room: sanitized });

    internal.sockets.forEach((socketSet) => {
      socketSet.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encoded);
        }
      });
    });
  }

  public sanitizeRoomForClient(state: MountainGameRoomState): MountainGameRoomState {
    const hideAnswers = state.status === 'playing';
    return {
      ...state,
      questions: state.questions.map((q) =>
        hideAnswers
          ? {
              id: q.id,
              question: q.question,
              imageUrl: q.imageUrl,
              options: q.options,
              sourceTitle: q.sourceTitle,
            }
          : q
      ),
      players: state.players.map((p) => ({
        ...p,
        wrongQueueIds: [...p.wrongQueueIds],
      })),
    };
  }

  public getRoom(roomCode: string): MountainGameRoomState | null {
    const normalized = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalized);
    if (!internal) return null;
    return this.sanitizeRoomForClient(internal.state);
  }

  public createRoom(params: {
    customCode?: string;
    hostId: string;
    hostName: string;
    petId: string;
    config?: Partial<MountainGameConfig>;
    questions?: MountainQuestionItem[];
  }): { ok: true; room: MountainGameRoomState; playerId: string } | { ok: false; error: string } {
    let code: string;
    if (params.customCode && params.customCode.trim()) {
      const normalized = normalizeCustomRoomCode(params.customCode);
      if (!normalized) {
        return {
          ok: false,
          error: 'Mã phòng tùy chỉnh phải dài 4–12 ký tự (chữ cái không dấu, số, _ hoặc -).',
        };
      }
      if (this.rooms.has(normalized)) {
        return { ok: false, error: `Mã phòng "${normalized}" đã tồn tại. Hãy chọn mã khác.` };
      }
      code = normalized;
    } else {
      code = generateRoomCode(new Set(this.rooms.keys()));
    }

    const questionPool = sanitizeQuestions(params.questions);
    const config = sanitizeConfig(params.config, questionPool.length);
    const activeQuestions = questionPool.slice(0, config.questionCount);
    const hostId = String(params.hostId || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const hostPlayer = createInitialPlayerState({
      id: hostId,
      name: params.hostName,
      petId: params.petId,
      isHost: true,
    });

    const now = Date.now();
    const state: MountainGameRoomState = {
      code,
      hostId,
      status: 'lobby',
      stage: 'main',
      roundPhase: 'question',
      config,
      questions: activeQuestions,
      players: [hostPlayer],
      currentMainIndex: 0,
      questionStartedAt: null,
      questionEndsAt: null,
      roundResultEndsAt: null,
      gameStartedAt: null,
      gameEndsAt: null,
      lastRoundSummary: null,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(code, {
      state,
      questionPool,
      sockets: new Map(),
    });

    return { ok: true, room: this.sanitizeRoomForClient(state), playerId: hostId };
  }

  public joinRoom(
    roomCode: string,
    params: { playerId?: string; playerName: string; petId: string }
  ): { ok: true; room: MountainGameRoomState; playerId: string } | { ok: false; error: string } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) {
      return { ok: false, error: `Không tìm thấy phòng chơi mã "${normalizedCode}".` };
    }

    const { state } = internal;
    const requestedId = String(params.playerId || '').trim();
    const existing = requestedId ? state.players.find((p) => p.id === requestedId) : undefined;

    if (existing) {
      existing.connected = true;
      if (state.status === 'lobby') {
        existing.name = sanitizePlayerName(params.playerName, existing.name);
        existing.petId = sanitizePetId(params.petId);
      }
      state.updatedAt = Date.now();
      this.broadcastRoom(normalizedCode);
      return { ok: true, room: this.sanitizeRoomForClient(state), playerId: existing.id };
    }

    if (state.status !== 'lobby') {
      return {
        ok: false,
        error: 'Phòng chơi này đã bắt đầu hoặc đã kết thúc, không thể tham gia thêm người mới.',
      };
    }

    const cap = getCapacityForMode(state.config.mode);
    if (state.players.length >= cap) {
      const modeName =
        state.config.mode === 'solo'
          ? '1 người chơi'
          : state.config.mode === 'duo'
          ? '2 người chơi (đối đầu)'
          : 'Nhiều người chơi';
      return {
        ok: false,
        error: `Phòng chế độ ${modeName} đã đủ số lượng tối đa (${cap} người).`,
      };
    }

    const newPlayerId =
      requestedId || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const player = createInitialPlayerState({
      id: newPlayerId,
      name: params.playerName,
      petId: params.petId,
      isHost: false,
    });
    state.players.push(player);
    state.updatedAt = Date.now();
    this.broadcastRoom(normalizedCode);
    return { ok: true, room: this.sanitizeRoomForClient(state), playerId: newPlayerId };
  }

  public leaveRoom(roomCode: string, playerId: string): { ok: boolean } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) return { ok: false };

    const { state } = internal;
    const idx = state.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return { ok: false };

    state.players.splice(idx, 1);
    if (state.players.length === 0) {
      this.rooms.delete(normalizedCode);
      return { ok: true };
    }

    if (state.hostId === playerId) {
      state.players[0].isHost = true;
      state.hostId = state.players[0].id;
    }

    state.updatedAt = Date.now();
    this.broadcastRoom(normalizedCode);
    return { ok: true };
  }

  public updateLobbyConfig(
    roomCode: string,
    params: {
      hostId: string;
      config?: Partial<MountainGameConfig>;
      questions?: MountainQuestionItem[];
    }
  ): { ok: true; room: MountainGameRoomState } | { ok: false; error: string } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) return { ok: false, error: 'Phòng không tồn tại.' };

    const { state } = internal;
    if (state.hostId !== params.hostId) {
      return { ok: false, error: 'Chỉ chủ phòng / giáo viên mới được thay đổi cấu hình.' };
    }
    if (state.status !== 'lobby') {
      return { ok: false, error: 'Không thể thay đổi cấu hình khi trò chơi đang diễn ra.' };
    }

    if (Array.isArray(params.questions) && params.questions.length > 0) {
      internal.questionPool = sanitizeQuestions(params.questions);
    }

    const nextConfig = sanitizeConfig(
      { ...state.config, ...(params.config || {}) },
      internal.questionPool.length
    );

    const nextCap = getCapacityForMode(nextConfig.mode);
    if (state.players.length > nextCap) {
      return {
        ok: false,
        error: `Phòng đang có ${state.players.length} người, không thể thu hẹp xuống chế độ tối đa ${nextCap} người.`,
      };
    }

    state.config = nextConfig;
    state.questions = internal.questionPool.slice(0, nextConfig.questionCount);
    state.updatedAt = Date.now();
    this.broadcastRoom(normalizedCode);
    return { ok: true, room: this.sanitizeRoomForClient(state) };
  }

  public startGame(
    roomCode: string,
    hostId: string
  ): { ok: true; room: MountainGameRoomState } | { ok: false; error: string } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) return { ok: false, error: 'Phòng không tồn tại.' };

    const { state } = internal;
    if (state.hostId !== hostId) {
      return { ok: false, error: 'Chỉ chủ phòng mới có quyền bắt đầu trò chơi.' };
    }
    if (state.players.length === 0) {
      return { ok: false, error: 'Phòng chưa có người chơi nào.' };
    }
    if (state.config.mode === 'duo' && state.players.length < 2) {
      return {
        ok: false,
        error: 'Chế độ 2 người chơi đối đầu cần đủ 2 người trong phòng trước khi bắt đầu.',
      };
    }

    const now = Date.now();
    state.questions = internal.questionPool.slice(0, state.config.questionCount);
    state.players = state.players.map((p) => ({
      ...p,
      step: 0,
      rawSteps: 0,
      mainAnsweredCount: 0,
      firstTryCorrectCount: 0,
      wrongAttemptCount: 0,
      retryClearedCount: 0,
      wrongQueueIds: [],
      currentAnswer: null,
      currentRetryStartedAt: null,
      lastRetryFeedback: null,
      totalReactionMs: 0,
      answeredCountForAvg: 0,
      reachedSummitAt: null,
      officiallyFinished: false,
      finishedAt: null,
    }));

    state.status = 'playing';
    state.stage = 'main';
    state.roundPhase = 'question';
    state.currentMainIndex = 0;
    state.lastRoundSummary = null;
    state.roundResultEndsAt = null;
    state.questionStartedAt = now;
    if (state.config.timeMode === 'per_question') {
      state.questionEndsAt = now + state.config.questionTimeSec * 1000;
      state.gameStartedAt = now;
      state.gameEndsAt = null;
    } else {
      state.gameStartedAt = now;
      state.gameEndsAt = now + state.config.totalTimeSec * 1000;
      state.questionEndsAt = null;
    }
    state.updatedAt = now;

    this.broadcastRoom(normalizedCode);
    return { ok: true, room: this.sanitizeRoomForClient(state) };
  }

  public restartToLobby(
    roomCode: string,
    hostId: string
  ): { ok: true; room: MountainGameRoomState } | { ok: false; error: string } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) return { ok: false, error: 'Phòng không tồn tại.' };
    const { state } = internal;
    if (state.hostId !== hostId) {
      return { ok: false, error: 'Chỉ chủ phòng mới được mở ván mới.' };
    }

    state.status = 'lobby';
    state.stage = 'main';
    state.roundPhase = 'question';
    state.currentMainIndex = 0;
    state.questionStartedAt = null;
    state.questionEndsAt = null;
    state.roundResultEndsAt = null;
    state.gameStartedAt = null;
    state.gameEndsAt = null;
    state.lastRoundSummary = null;
    state.players = state.players.map((p) => ({
      ...p,
      step: 0,
      rawSteps: 0,
      mainAnsweredCount: 0,
      firstTryCorrectCount: 0,
      wrongAttemptCount: 0,
      retryClearedCount: 0,
      wrongQueueIds: [],
      currentAnswer: null,
      currentRetryStartedAt: null,
      lastRetryFeedback: null,
      totalReactionMs: 0,
      answeredCountForAvg: 0,
      reachedSummitAt: null,
      officiallyFinished: false,
      finishedAt: null,
    }));
    state.updatedAt = Date.now();
    this.broadcastRoom(normalizedCode);
    return { ok: true, room: this.sanitizeRoomForClient(state) };
  }

  public submitAnswer(
    roomCode: string,
    params: { playerId: string; questionId: string; selectedIndex: number }
  ): { ok: true; room: MountainGameRoomState } | { ok: false; error: string } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) return { ok: false, error: 'Phòng chơi không tồn tại.' };

    const { state } = internal;
    if (state.status !== 'playing') {
      return { ok: false, error: 'Trò chơi chưa bắt đầu hoặc đã kết thúc.' };
    }

    const player = state.players.find((p) => p.id === params.playerId);
    if (!player) {
      return { ok: false, error: 'Bạn không nằm trong danh sách người chơi của phòng này.' };
    }

    const now = Date.now();

    if (state.stage === 'main') {
      if (state.roundPhase !== 'question') {
        return { ok: false, error: 'Lượt này đã chốt kết quả, đang chuẩn bị chuyển câu.' };
      }
      const currentQ = state.questions[state.currentMainIndex];
      if (!currentQ) {
        return { ok: false, error: 'Câu hỏi hiện tại không hợp lệ.' };
      }
      if (params.questionId && params.questionId !== currentQ.id) {
        return { ok: false, error: 'Câu hỏi không khớp với lượt hiện tại.' };
      }
      if (
        player.currentAnswer &&
        player.currentAnswer.questionIndex === state.currentMainIndex
      ) {
        return { ok: true, room: this.sanitizeRoomForClient(state) };
      }

      const selectedIdx = Number(params.selectedIndex);
      if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= currentQ.options.length) {
        return { ok: false, error: 'Phương án chọn không hợp lệ.' };
      }

      const reactionMs = Math.max(40, now - (state.questionStartedAt || now));
      player.currentAnswer = {
        questionIndex: state.currentMainIndex,
        selectedIndex: selectedIdx,
        reactionMs,
      };
      player.totalReactionMs += reactionMs;
      player.answeredCountForAvg += 1;
      state.updatedAt = now;

      const allAnswered = state.players.every(
        (p) => p.currentAnswer && p.currentAnswer.questionIndex === state.currentMainIndex
      );

      if (allAnswered) {
        this.resolveMainRound(internal, now);
      } else {
        this.broadcastRoom(normalizedCode);
      }
      return { ok: true, room: this.sanitizeRoomForClient(state) };
    }

    // --- Retry loop stage ---
    if (player.officiallyFinished || player.wrongQueueIds.length === 0) {
      return { ok: true, room: this.sanitizeRoomForClient(state) };
    }

    const targetQId = player.wrongQueueIds[0];
    if (params.questionId && params.questionId !== targetQId) {
      return { ok: false, error: 'Câu hỏi ôn lại không khớp với câu hiện tại trong hàng đợi.' };
    }
    const targetQ = state.questions.find((q) => q.id === targetQId);
    if (!targetQ) {
      player.wrongQueueIds.shift();
      if (player.wrongQueueIds.length === 0) {
        player.officiallyFinished = true;
        player.finishedAt = now;
      }
      this.checkAndFinishRoom(internal, now);
      this.broadcastRoom(normalizedCode);
      return { ok: true, room: this.sanitizeRoomForClient(state) };
    }

    const selectedIdx = Number(params.selectedIndex);
    if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= targetQ.options.length) {
      return { ok: false, error: 'Phương án chọn không hợp lệ.' };
    }

    const isCorrect = selectedIdx === targetQ.correctAnswer;
    let stepDelta = 0;

    if (isCorrect) {
      player.wrongQueueIds.shift();
      player.retryClearedCount += 1;
      stepDelta = Math.min(1, state.config.baseCorrectBonus);
      player.rawSteps = Math.max(0, player.rawSteps + stepDelta);
      player.step = Math.min(state.config.summitSteps, player.rawSteps);
      if (player.step >= state.config.summitSteps && !player.reachedSummitAt) {
        player.reachedSummitAt = now;
      }
      if (player.wrongQueueIds.length === 0) {
        player.officiallyFinished = true;
        player.finishedAt = now;
        player.currentRetryStartedAt = null;
      } else {
        player.currentRetryStartedAt = now;
      }
    } else {
      player.wrongAttemptCount += 1;
      const rotatedId = player.wrongQueueIds.shift()!;
      player.wrongQueueIds.push(rotatedId);
      stepDelta = -Math.min(1, state.config.wrongPenalty);
      player.rawSteps = Math.max(0, player.rawSteps + stepDelta);
      player.step = Math.min(state.config.summitSteps, player.rawSteps);
      player.currentRetryStartedAt = now;
    }

    player.lastRetryFeedback = {
      questionId: targetQ.id,
      isCorrect,
      correctAnswer: targetQ.correctAnswer ?? 0,
      explanation: targetQ.explanation || '',
      stepDelta,
      remainingWrongCount: player.wrongQueueIds.length,
      timestamp: now,
    };
    state.updatedAt = now;

    this.checkAndFinishRoom(internal, now);
    this.broadcastRoom(normalizedCode);
    return { ok: true, room: this.sanitizeRoomForClient(state) };
  }

  public forceAdvanceRound(
    roomCode: string,
    hostId: string
  ): { ok: true; room: MountainGameRoomState } | { ok: false; error: string } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const internal = this.rooms.get(normalizedCode);
    if (!internal) return { ok: false, error: 'Phòng không tồn tại.' };
    const { state } = internal;
    if (state.hostId !== hostId) {
      return { ok: false, error: 'Chỉ chủ phòng mới có quyền chuyển lượt.' };
    }
    if (state.status !== 'playing' || state.stage !== 'main') {
      return { ok: true, room: this.sanitizeRoomForClient(state) };
    }
    const now = Date.now();
    if (state.roundPhase === 'question') {
      this.resolveMainRound(internal, now);
    } else if (state.roundPhase === 'round_result') {
      this.advanceFromRoundResult(internal, now);
    }
    return { ok: true, room: this.sanitizeRoomForClient(state) };
  }

  private resolveMainRound(internal: InternalRoom, now: number): void {
    const { state } = internal;
    const q = state.questions[state.currentMainIndex];
    if (!q) return;

    const correctIdx = q.correctAnswer ?? 0;

    // Sort players who answered correctly by fastest reaction time
    const correctEntries = state.players
      .filter(
        (p) =>
          p.currentAnswer &&
          p.currentAnswer.questionIndex === state.currentMainIndex &&
          p.currentAnswer.selectedIndex === correctIdx
      )
      .sort((a, b) => (a.currentAnswer!.reactionMs - b.currentAnswer!.reactionMs));

    const rankByPlayerId = new Map<string, number>();
    correctEntries.forEach((p, idx) => {
      rankByPlayerId.set(p.id, idx + 1);
    });

    const deltas: MountainPlayerRoundDelta[] = [];

    state.players.forEach((p) => {
      const ans =
        p.currentAnswer && p.currentAnswer.questionIndex === state.currentMainIndex
          ? p.currentAnswer
          : null;
      const rank = rankByPlayerId.get(p.id) ?? null;
      const isCorrect = rank !== null;

      let stepDelta = 0;
      let badgeLabel = '';

      if (isCorrect) {
        p.firstTryCorrectCount += 1;
        if (state.config.mode === 'solo') {
          stepDelta = state.config.baseCorrectBonus;
          badgeLabel = `Chính xác +${stepDelta} bước`;
        } else if (rank === 1) {
          stepDelta = state.config.rank1Bonus;
          badgeLabel = `Hạng 1 nhanh nhất +${stepDelta} bước`;
        } else if (rank === 2) {
          stepDelta = state.config.rank2Bonus;
          badgeLabel = `Hạng 2 nhanh nhì +${stepDelta} bước`;
        } else {
          stepDelta = state.config.baseCorrectBonus;
          badgeLabel = `Trả lời đúng +${stepDelta} bước`;
        }
      } else {
        p.wrongAttemptCount += 1;
        if (!p.wrongQueueIds.includes(q.id)) {
          p.wrongQueueIds.push(q.id);
        }
        stepDelta = -state.config.wrongPenalty;
        badgeLabel = ans
          ? state.config.wrongPenalty > 0
            ? `Chưa đúng -${state.config.wrongPenalty} bước`
            : 'Chưa đúng · Giữ vị trí'
          : state.config.wrongPenalty > 0
          ? `Hết giờ -${state.config.wrongPenalty} bước`
          : 'Hết giờ · Giữ vị trí';
      }

      p.rawSteps = Math.max(0, p.rawSteps + stepDelta);
      p.step = Math.min(state.config.summitSteps, p.rawSteps);
      p.mainAnsweredCount = Math.max(p.mainAnsweredCount, state.currentMainIndex + 1);
      if (p.step >= state.config.summitSteps && !p.reachedSummitAt) {
        p.reachedSummitAt = now;
      }

      deltas.push({
        playerId: p.id,
        playerName: p.name,
        petId: p.petId,
        isCorrect,
        selectedOptionIndex: ans ? ans.selectedIndex : null,
        reactionMs: ans ? ans.reactionMs : null,
        rankInRound: rank,
        stepDelta,
        badgeLabel,
        newStep: p.step,
      });
    });

    state.lastRoundSummary = {
      questionIndex: state.currentMainIndex,
      questionId: q.id,
      correctAnswer: correctIdx,
      explanation: q.explanation || '',
      fastestPlayerId: correctEntries[0]?.id,
      secondPlayerId: correctEntries[1]?.id,
      deltas,
      resolvedAt: now,
    };

    state.roundPhase = 'round_result';
    state.questionEndsAt = null;
    state.roundResultEndsAt = now + ROUND_RESULT_DURATION_MS;
    state.updatedAt = now;
    this.broadcastRoom(state.code);
  }

  private advanceFromRoundResult(internal: InternalRoom, now: number): void {
    const { state } = internal;
    state.roundResultEndsAt = null;

    if (state.currentMainIndex + 1 < state.questions.length) {
      state.currentMainIndex += 1;
      state.roundPhase = 'question';
      state.questionStartedAt = now;
      state.questionEndsAt =
        state.config.timeMode === 'per_question'
          ? now + state.config.questionTimeSec * 1000
          : null;
      state.players.forEach((p) => {
        p.currentAnswer = null;
      });
      state.updatedAt = now;
      this.broadcastRoom(state.code);
      return;
    }

    // All main questions have been completed.
    state.players.forEach((p) => {
      p.currentAnswer = null;
      if (p.wrongQueueIds.length === 0) {
        p.officiallyFinished = true;
        if (!p.finishedAt) p.finishedAt = now;
      } else {
        p.currentRetryStartedAt = now;
      }
    });

    const allFinished = state.players.every((p) => p.officiallyFinished);
    if (allFinished) {
      state.status = 'finished';
      state.updatedAt = now;
      this.broadcastRoom(state.code);
      return;
    }

    // Switch room to mandatory retry loop for unfinished players
    state.stage = 'retry';
    state.roundPhase = 'retry_loop';
    state.questionStartedAt = null;
    state.questionEndsAt = null;
    state.updatedAt = now;
    this.broadcastRoom(state.code);
  }

  private checkAndFinishRoom(internal: InternalRoom, now: number): void {
    const { state } = internal;
    if (state.players.every((p) => p.officiallyFinished)) {
      state.status = 'finished';
      state.questionEndsAt = null;
      state.roundResultEndsAt = null;
      state.updatedAt = now;
    }
  }

  private tickRooms(): void {
    const now = Date.now();

    for (const [code, internal] of this.rooms.entries()) {
      const { state } = internal;

      // Garbage collect stale inactive rooms
      if (now - state.updatedAt > ROOM_IDLE_TTL_MS && internal.sockets.size === 0) {
        this.rooms.delete(code);
        continue;
      }

      if (state.status !== 'playing') continue;

      // Global total_game timer check
      if (state.config.timeMode === 'total_game' && state.gameEndsAt && now >= state.gameEndsAt) {
        state.status = 'finished';
        state.questionEndsAt = null;
        state.roundResultEndsAt = null;
        state.updatedAt = now;
        this.broadcastRoom(code);
        continue;
      }

      if (state.stage === 'main') {
        if (
          state.roundPhase === 'question' &&
          state.config.timeMode === 'per_question' &&
          state.questionEndsAt &&
          now >= state.questionEndsAt
        ) {
          this.resolveMainRound(internal, now);
          continue;
        }

        if (
          state.roundPhase === 'round_result' &&
          state.roundResultEndsAt &&
          now >= state.roundResultEndsAt
        ) {
          this.advanceFromRoundResult(internal, now);
          continue;
        }
      } else if (state.stage === 'retry' && state.config.timeMode === 'per_question') {
        let changed = false;
        const limitMs = state.config.questionTimeSec * 1000;
        for (const p of state.players) {
          if (
            !p.officiallyFinished &&
            p.wrongQueueIds.length > 0 &&
            p.currentRetryStartedAt &&
            now - p.currentRetryStartedAt >= limitMs
          ) {
            const qId = p.wrongQueueIds.shift()!;
            p.wrongQueueIds.push(qId);
            p.wrongAttemptCount += 1;
            const delta = -Math.min(1, state.config.wrongPenalty);
            p.rawSteps = Math.max(0, p.rawSteps + delta);
            p.step = Math.min(state.config.summitSteps, p.rawSteps);
            p.currentRetryStartedAt = now;
            const q = state.questions.find((item) => item.id === qId);
            p.lastRetryFeedback = {
              questionId: qId,
              isCorrect: false,
              correctAnswer: q?.correctAnswer ?? 0,
              explanation: q?.explanation || '',
              stepDelta: delta,
              remainingWrongCount: p.wrongQueueIds.length,
              timestamp: now,
            };
            changed = true;
          }
        }
        if (changed) {
          state.updatedAt = now;
          this.broadcastRoom(code);
        }
      }
    }
  }
}

export const mountainGameEngine = new MountainGameEngine();
