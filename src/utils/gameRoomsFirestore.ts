import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  MountainQuestionItem,
  ObstacleGameConfig,
  ObstacleGameRoomState,
  ObstaclePlayerState,
  RankedObstaclePlayer,
} from '../types/exam';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function generateObstacleRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function createStableGamePlayerId(uid: string): string {
  const cleanUid = String(uid || 'player').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const storageKey = 'edutest_obstacle_tab_player_nonce_v1';
  let nonce = '';
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      nonce = window.sessionStorage.getItem(storageKey) || '';
      if (!nonce) {
        nonce = Math.random().toString(36).slice(2, 8);
        window.sessionStorage.setItem(storageKey, nonce);
      }
    }
  } catch {
    nonce = Math.random().toString(36).slice(2, 8);
  }
  return `${cleanUid}_${nonce || 'p1'}`.slice(0, 120);
}

function getCurrentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Bạn cần đăng nhập để tham gia phòng chơi trực tuyến.');
  }
  return uid;
}

function sanitizeQuestionsForFirestore(questions: MountainQuestionItem[]): MountainQuestionItem[] {
  return questions.slice(0, 60).map((q, idx) => {
    const cleanInlineImages: Record<string, string> = {};
    if (q.inlineImages && typeof q.inlineImages === 'object') {
      Object.entries(q.inlineImages).slice(0, 12).forEach(([k, v]) => {
        if (k && typeof v === 'string' && v.trim()) {
          cleanInlineImages[String(k).slice(0, 80)] = v.trim().slice(0, 45000);
        }
      });
    }
    return {
      id: String(q.id || `q_${idx + 1}`).slice(0, 100),
      question: String(q.question || '').slice(0, 4000),
      ...(q.imageUrl ? { imageUrl: String(q.imageUrl).slice(0, 45000) } : {}),
      options: (q.options || []).slice(0, 6).map((o) => String(o || '')),
      correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
      explanation: q.explanation ? String(q.explanation).slice(0, 2000) : '',
      ...(q.explanationImageUrl ? { explanationImageUrl: String(q.explanationImageUrl).slice(0, 45000) } : {}),
      ...(Object.keys(cleanInlineImages).length > 0 ? { inlineImages: cleanInlineImages } : {}),
      sourceTitle: q.sourceTitle ? String(q.sourceTitle).slice(0, 160) : '',
    };
  });
}

function normalizeConfig(config: ObstacleGameConfig): ObstacleGameConfig {
  return {
    playMode: config.playMode,
    questionTimeSec: Math.max(0, Math.min(300, Number(config.questionTimeSec) || 0)),
    totalTimeSec: Math.max(0, Math.min(3600, Number(config.totalTimeSec) || 0)),
    sourceType: config.sourceType,
    sourceId: String(config.sourceId || 'sample_katex_mix').slice(0, 128),
    sourceTitle: String(config.sourceTitle || 'Bộ câu hỏi chuẩn').slice(0, 180),
    obstacleCount: Math.max(3, Math.min(30, Number(config.obstacleCount) || 10)),
    correctPoints: Math.max(10, Math.min(1000, Number(config.correctPoints) || 100)),
    speedBonusMax: Math.max(0, Math.min(500, Number(config.speedBonusMax) || 0)),
    wrongPointsPenalty: Math.max(0, Math.min(500, Number(config.wrongPointsPenalty) || 0)),
    timeBonusSec: Math.max(0, Math.min(60, Number(config.timeBonusSec) || 0)),
    timePenaltySec: Math.max(0, Math.min(60, Number(config.timePenaltySec) || 0)),
    wrongStepBack: Math.max(0, Math.min(3, Number(config.wrongStepBack) || 0)),
    wrongCooldownSec: Math.max(0, Math.min(15, Number(config.wrongCooldownSec) || 0)),
    survivalLives: Math.max(1, Math.min(10, Number(config.survivalLives) || 3)),
    hostIsSpectator: Boolean(config.hostIsSpectator),
  };
}

function mapDocToRoomState(data: Record<string, any>): ObstacleGameRoomState {
  return {
    id: String(data.id || data.code || ''),
    code: String(data.code || data.id || ''),
    hostUid: String(data.hostUid || ''),
    hostName: String(data.hostName || 'Chủ trò'),
    hostEmail: data.hostEmail ? String(data.hostEmail) : '',
    hostIsSpectator: Boolean(data.hostIsSpectator),
    status: (data.status as ObstacleGameRoomState['status']) || 'WAITING',
    config: normalizeConfig((data.config || {}) as ObstacleGameConfig),
    questions: Array.isArray(data.questions) ? data.questions : [],
    startedAtMs: Number(data.startedAtMs || 0),
    endsAtMs: Number(data.endsAtMs || 0),
    finishedAtMs: Number(data.finishedAtMs || 0),
    finishReason: data.finishReason ? String(data.finishReason) : undefined,
  };
}

function mapDocToPlayerState(data: Record<string, any>): ObstaclePlayerState {
  return {
    id: String(data.id || ''),
    uid: String(data.uid || ''),
    roomCode: String(data.roomCode || ''),
    name: String(data.name || ''),
    petId: String(data.petId || 'fox'),
    isHost: Boolean(data.isHost),
    stageIndex: Number(data.stageIndex || 0),
    score: Number(data.score || 0),
    lives: Number(data.lives ?? 3),
    correctQuestionsCount: Number(data.correctQuestionsCount || 0),
    wrongQuestionsCount: Number(data.wrongQuestionsCount || 0),
    totalCorrectAttempts: Number(data.totalCorrectAttempts || 0),
    totalWrongAttempts: Number(data.totalWrongAttempts || 0),
    correctQuestionIds: Array.isArray(data.correctQuestionIds) ? data.correctQuestionIds : [],
    wrongQuestionIds: Array.isArray(data.wrongQuestionIds) ? data.wrongQuestionIds : [],
    bonusTimeSec: Number(data.bonusTimeSec || 0),
    cooldownUntilMs: Number(data.cooldownUntilMs || 0),
    questionStartedAtMs: Number(data.questionStartedAtMs || 0),
    lastAnsweredAtMs: Number(data.lastAnsweredAtMs || 0),
    finished: Boolean(data.finished),
    eliminated: Boolean(data.eliminated),
    finishedAtMs: Number(data.finishedAtMs || 0),
    joinedAtMs: Number(data.joinedAtMs || 0),
  };
}

export async function createObstacleGameRoom(params: {
  customCode?: string;
  hostName: string;
  hostEmail?: string;
  config: ObstacleGameConfig;
  questions: MountainQuestionItem[];
  competingPlayer?: {
    playerId: string;
    name: string;
    petId: string;
  };
}): Promise<{ room: ObstacleGameRoomState; playerId: string | null }> {
  const uid = getCurrentUid();
  const safeConfig = normalizeConfig(params.config);
  const cleanQuestions = sanitizeQuestionsForFirestore(params.questions);
  if (cleanQuestions.length === 0) {
    throw new Error('Bộ câu hỏi cần ít nhất 1 câu trắc nghiệm hợp lệ.');
  }

  let roomCode = normalizeRoomCode(params.customCode || '');
  if (roomCode.length !== 6) {
    roomCode = generateObstacleRoomCode();
  }

  // Ensure code is unused (try up to 4 times if random collision)
  for (let attempt = 0; attempt < 4; attempt++) {
    const existingSnap = await getDoc(doc(db, 'gameRooms', roomCode));
    if (!existingSnap.exists()) break;
    if (params.customCode && normalizeRoomCode(params.customCode).length === 6) {
      throw new Error(`Mã phòng ${roomCode} đã tồn tại. Vui lòng chọn mã khác hoặc để trống để tạo ngẫu nhiên.`);
    }
    roomCode = generateObstacleRoomCode();
  }

  const roomPath = `gameRooms/${roomCode}`;
  const roomPayload = {
    id: roomCode,
    code: roomCode,
    hostUid: uid,
    hostName: String(params.hostName || 'Chủ trò').trim().slice(0, 100) || 'Chủ trò',
    hostEmail: String(params.hostEmail || '').trim().slice(0, 180),
    hostIsSpectator: safeConfig.hostIsSpectator,
    status: 'WAITING' as const,
    config: safeConfig,
    questions: cleanQuestions,
    startedAtMs: 0,
    endsAtMs: 0,
    finishedAtMs: 0,
    finishReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'gameRooms', roomCode), roomPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, roomPath);
  }

  let createdPlayerId: string | null = null;
  if (!safeConfig.hostIsSpectator && params.competingPlayer) {
    const pId = params.competingPlayer.playerId;
    const playerPath = `gameRooms/${roomCode}/players/${pId}`;
    const now = Date.now();
    try {
      await setDoc(doc(db, 'gameRooms', roomCode, 'players', pId), {
        id: pId,
        uid,
        roomCode,
        name: params.competingPlayer.name.trim().slice(0, 20),
        petId: params.competingPlayer.petId,
        isHost: true,
        stageIndex: 0,
        score: 0,
        lives: safeConfig.survivalLives,
        correctQuestionsCount: 0,
        wrongQuestionsCount: 0,
        totalCorrectAttempts: 0,
        totalWrongAttempts: 0,
        correctQuestionIds: [],
        wrongQuestionIds: [],
        bonusTimeSec: 0,
        cooldownUntilMs: 0,
        questionStartedAtMs: 0,
        lastAnsweredAtMs: 0,
        finished: false,
        eliminated: false,
        finishedAtMs: 0,
        joinedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdPlayerId = pId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, playerPath);
    }
  }

  return {
    room: mapDocToRoomState(roomPayload),
    playerId: createdPlayerId,
  };
}

export async function validateWaitingGameRoom(rawCode: string): Promise<{
  room: ObstacleGameRoomState;
  players: ObstaclePlayerState[];
}> {
  getCurrentUid();
  const roomCode = normalizeRoomCode(rawCode);
  if (roomCode.length !== 6) {
    throw new Error('Mã phòng phải gồm đúng 6 ký tự chữ/số.');
  }

  const roomPath = `gameRooms/${roomCode}`;
  let roomSnap;
  try {
    roomSnap = await getDoc(doc(db, 'gameRooms', roomCode));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, roomPath);
  }

  if (!roomSnap.exists()) {
    throw new Error(`Không tìm thấy phòng chơi có mã "${roomCode}".`);
  }

  const room = mapDocToRoomState(roomSnap.data());
  if (room.status !== 'WAITING') {
    throw new Error(
      room.status === 'PLAYING'
        ? `Phòng ${roomCode} đã bắt đầu trận đấu, không thể tham gia lúc này.`
        : `Phòng ${roomCode} đã kết thúc.`
    );
  }

  const playersPath = `gameRooms/${roomCode}/players`;
  let playersSnap;
  try {
    playersSnap = await getDocs(collection(db, 'gameRooms', roomCode, 'players'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, playersPath);
  }

  const players = playersSnap.docs.map((d) => mapDocToPlayerState(d.data()));
  return { room, players };
}

export async function joinObstacleGameRoom(params: {
  roomCode: string;
  playerId: string;
  name: string;
  petId: string;
}): Promise<ObstaclePlayerState> {
  const uid = getCurrentUid();
  const roomCode = normalizeRoomCode(params.roomCode);
  const trimmedName = String(params.name || '').trim();
  if (trimmedName.length < 2 || trimmedName.length > 20) {
    throw new Error('Tên hiển thị phải từ 2 đến 20 ký tự.');
  }

  const { room, players } = await validateWaitingGameRoom(roomCode);
  const duplicate = players.find(
    (p) => p.id !== params.playerId && p.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Tên "${trimmedName}" đã có người sử dụng trong phòng. Vui lòng chọn tên khác.`);
  }

  const now = Date.now();
  const playerDoc = {
    id: params.playerId,
    uid,
    roomCode,
    name: trimmedName,
    petId: params.petId,
    isHost: false,
    stageIndex: 0,
    score: 0,
    lives: room.config.survivalLives || 3,
    correctQuestionsCount: 0,
    wrongQuestionsCount: 0,
    totalCorrectAttempts: 0,
    totalWrongAttempts: 0,
    correctQuestionIds: [],
    wrongQuestionIds: [],
    bonusTimeSec: 0,
    cooldownUntilMs: 0,
    questionStartedAtMs: 0,
    lastAnsweredAtMs: 0,
    finished: false,
    eliminated: false,
    finishedAtMs: 0,
    joinedAtMs: now,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const playerPath = `gameRooms/${roomCode}/players/${params.playerId}`;
  try {
    await setDoc(doc(db, 'gameRooms', roomCode, 'players', params.playerId), playerDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, playerPath);
  }

  return mapDocToPlayerState(playerDoc);
}

export async function leaveObstacleGameRoom(roomCode: string, playerId: string): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  if (!code || !playerId) return;
  const path = `gameRooms/${code}/players/${playerId}`;
  try {
    await deleteDoc(doc(db, 'gameRooms', code, 'players', playerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function startObstacleGameRoom(
  roomCode: string,
  config: ObstacleGameConfig
): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const now = Date.now();
  const endsAtMs = config.totalTimeSec > 0 ? now + config.totalTimeSec * 1000 : 0;

  const playersSnap = await getDocs(collection(db, 'gameRooms', code, 'players'));
  if (playersSnap.empty) {
    throw new Error('Phòng cần ít nhất 1 người chơi tham gia trước khi bắt đầu.');
  }

  const batch = writeBatch(db);
  playersSnap.docs.forEach((pDoc) => {
    batch.update(pDoc.ref, {
      stageIndex: 0,
      score: 0,
      lives: config.survivalLives || 3,
      correctQuestionsCount: 0,
      wrongQuestionsCount: 0,
      totalCorrectAttempts: 0,
      totalWrongAttempts: 0,
      correctQuestionIds: [],
      wrongQuestionIds: [],
      bonusTimeSec: 0,
      cooldownUntilMs: 0,
      questionStartedAtMs: now,
      lastAnsweredAtMs: 0,
      finished: false,
      eliminated: false,
      finishedAtMs: 0,
      updatedAt: serverTimestamp(),
    });
  });

  batch.update(doc(db, 'gameRooms', code), {
    status: 'PLAYING',
    startedAtMs: now,
    endsAtMs,
    finishedAtMs: 0,
    finishReason: '',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `gameRooms/${code}`);
  }
}

export async function finishObstacleGameRoom(
  roomCode: string,
  reason: 'all_finished' | 'timeout' | 'host_ended'
): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const path = `gameRooms/${code}`;
  try {
    await updateDoc(doc(db, 'gameRooms', code), {
      status: 'FINISHED',
      finishedAtMs: Date.now(),
      finishReason: reason,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resetObstacleGameRoomToWaiting(
  roomCode: string,
  config: ObstacleGameConfig
): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const playersSnap = await getDocs(collection(db, 'gameRooms', code, 'players'));
  const batch = writeBatch(db);

  playersSnap.docs.forEach((pDoc) => {
    batch.update(pDoc.ref, {
      stageIndex: 0,
      score: 0,
      lives: config.survivalLives || 3,
      correctQuestionsCount: 0,
      wrongQuestionsCount: 0,
      totalCorrectAttempts: 0,
      totalWrongAttempts: 0,
      correctQuestionIds: [],
      wrongQuestionIds: [],
      bonusTimeSec: 0,
      cooldownUntilMs: 0,
      questionStartedAtMs: 0,
      lastAnsweredAtMs: 0,
      finished: false,
      eliminated: false,
      finishedAtMs: 0,
      updatedAt: serverTimestamp(),
    });
  });

  batch.update(doc(db, 'gameRooms', code), {
    status: 'WAITING',
    startedAtMs: 0,
    endsAtMs: 0,
    finishedAtMs: 0,
    finishReason: '',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `gameRooms/${code}`);
  }
}

export interface ObstacleAnswerOutcome {
  isCorrect: boolean;
  isTimeout: boolean;
  correctAnswerIndex: number;
  pointsDelta: number;
  timeDeltaSec: number;
  stageDelta: number;
  newStageIndex: number;
  cooldownSec: number;
  finished: boolean;
  eliminated: boolean;
}

export async function submitObstaclePlayerAnswer(params: {
  room: ObstacleGameRoomState;
  player: ObstaclePlayerState;
  selectedIndex: number; // -1 for question timeout
}): Promise<ObstacleAnswerOutcome> {
  const { room, player, selectedIndex } = params;
  const totalStages = room.questions.length;
  const cfg = room.config;
  const now = Date.now();

  if (player.finished || player.eliminated || player.stageIndex >= totalStages) {
    return {
      isCorrect: false,
      isTimeout: false,
      correctAnswerIndex: 0,
      pointsDelta: 0,
      timeDeltaSec: 0,
      stageDelta: 0,
      newStageIndex: player.stageIndex,
      cooldownSec: 0,
      finished: player.finished,
      eliminated: player.eliminated,
    };
  }

  const currentQuestion = room.questions[player.stageIndex];
  const correctAnswerIndex = typeof currentQuestion?.correctAnswer === 'number' ? currentQuestion.correctAnswer : 0;
  const isTimeout = selectedIndex < 0;
  const isCorrect = !isTimeout && selectedIndex === correctAnswerIndex;

  const correctSet = new Set(player.correctQuestionIds || []);
  const wrongSet = new Set(player.wrongQuestionIds || []);
  const qId = currentQuestion?.id || `stage_${player.stageIndex + 1}`;

  let nextStage = player.stageIndex;
  let pointsDelta = 0;
  let timeDeltaSec = 0;
  let nextLives = player.lives;
  let nextCooldownUntilMs = 0;
  let totalCorrectAttempts = player.totalCorrectAttempts;
  let totalWrongAttempts = player.totalWrongAttempts;
  let eliminated = false;
  let finished = false;
  let finishedAtMs = player.finishedAtMs || 0;

  if (isCorrect) {
    totalCorrectAttempts += 1;
    correctSet.add(qId);

    const elapsedMs = Math.max(0, now - (player.questionStartedAtMs || room.startedAtMs || now));
    let speedBonus = 0;
    if (cfg.speedBonusMax > 0) {
      const capMs = (cfg.questionTimeSec > 0 ? cfg.questionTimeSec : 20) * 1000;
      const ratio = Math.max(0, 1 - elapsedMs / Math.max(3000, capMs));
      speedBonus = Math.round(cfg.speedBonusMax * ratio);
    }

    pointsDelta = cfg.correctPoints + (cfg.playMode === 'speed_race' ? speedBonus : Math.round(speedBonus * 0.4));
    timeDeltaSec = cfg.timeBonusSec;
    nextStage = Math.min(totalStages, player.stageIndex + 1);
    if (nextStage >= totalStages) {
      finished = true;
      finishedAtMs = now;
    }
  } else {
    totalWrongAttempts += 1;
    wrongSet.add(qId);

    pointsDelta = -cfg.wrongPointsPenalty;
    timeDeltaSec = -cfg.timePenaltySec;
    nextStage = Math.max(0, player.stageIndex - cfg.wrongStepBack);
    nextCooldownUntilMs = cfg.wrongCooldownSec > 0 ? now + cfg.wrongCooldownSec * 1000 : 0;

    if (cfg.playMode === 'survival') {
      nextLives = Math.max(0, player.lives - 1);
      if (nextLives <= 0) {
        eliminated = true;
        finished = true;
        finishedAtMs = now;
      }
    }
  }

  const nextScore = Math.max(0, player.score + pointsDelta);
  const nextBonusTimeSec = player.bonusTimeSec + timeDeltaSec;
  const nextQuestionStartedAtMs = now + (nextCooldownUntilMs > now ? nextCooldownUntilMs - now : 0);

  const playerPath = `gameRooms/${room.code}/players/${player.id}`;
  try {
    await updateDoc(doc(db, 'gameRooms', room.code, 'players', player.id), {
      stageIndex: nextStage,
      score: nextScore,
      lives: nextLives,
      correctQuestionsCount: correctSet.size,
      wrongQuestionsCount: wrongSet.size,
      totalCorrectAttempts,
      totalWrongAttempts,
      correctQuestionIds: Array.from(correctSet).slice(0, 200),
      wrongQuestionIds: Array.from(wrongSet).slice(0, 200),
      bonusTimeSec: nextBonusTimeSec,
      cooldownUntilMs: nextCooldownUntilMs,
      questionStartedAtMs: nextQuestionStartedAtMs,
      lastAnsweredAtMs: now,
      finished,
      eliminated,
      finishedAtMs,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, playerPath);
  }

  return {
    isCorrect,
    isTimeout,
    correctAnswerIndex,
    pointsDelta,
    timeDeltaSec,
    stageDelta: nextStage - player.stageIndex,
    newStageIndex: nextStage,
    cooldownSec: cfg.wrongCooldownSec,
    finished,
    eliminated,
  };
}

export function subscribeObstacleGameRoom(
  roomCode: string,
  callbacks: {
    onRoom: (room: ObstacleGameRoomState | null) => void;
    onPlayers: (players: ObstaclePlayerState[]) => void;
    onError: (err: Error) => void;
  }
): Unsubscribe {
  const code = normalizeRoomCode(roomCode);
  const roomPath = `gameRooms/${code}`;
  const playersPath = `gameRooms/${code}/players`;

  const unsubRoom = onSnapshot(
    doc(db, 'gameRooms', code),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onRoom(null);
        return;
      }
      callbacks.onRoom(mapDocToRoomState(snap.data()));
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, roomPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubPlayers = onSnapshot(
    collection(db, 'gameRooms', code, 'players'),
    (snap) => {
      const list = snap.docs
        .map((d) => mapDocToPlayerState(d.data()))
        .sort((a, b) => a.joinedAtMs - b.joinedAtMs);
      callbacks.onPlayers(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, playersPath);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubRoom();
    unsubPlayers();
  };
}

/**
 * Standard Competition Ranking (1, 1, 3, 4) based on:
 * 1) score DESC
 * 2) stageIndex DESC
 * 3) finishedAtMs / lastAnsweredAtMs ASC (earlier finisher wins tie if stats differ; exact ties share rank)
 */
export function computeStandardCompetitionRanking(
  players: ObstaclePlayerState[]
): RankedObstaclePlayer[] {
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.stageIndex !== a.stageIndex) return b.stageIndex - a.stageIndex;
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    const aTime = a.finishedAtMs > 0 ? a.finishedAtMs : a.lastAnsweredAtMs || Number.MAX_SAFE_INTEGER;
    const bTime = b.finishedAtMs > 0 ? b.finishedAtMs : b.lastAnsweredAtMs || Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.name.localeCompare(b.name, 'vi');
  });

  const ranked: RankedObstaclePlayer[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    let rank = i + 1;
    if (i > 0) {
      const prev = sorted[i - 1];
      const isTied =
        p.score === prev.score &&
        p.stageIndex === prev.stageIndex &&
        p.eliminated === prev.eliminated;
      if (isTied) {
        rank = ranked[i - 1].rank;
      }
    }
    const totalAttempts = p.totalCorrectAttempts + p.totalWrongAttempts;
    const accuracyPercent =
      totalAttempts > 0 ? Math.round((p.totalCorrectAttempts / totalAttempts) * 1000) / 10 : 0;
    const wrongPercent =
      totalAttempts > 0 ? Math.round((p.totalWrongAttempts / totalAttempts) * 1000) / 10 : 0;

    ranked.push({
      player: p,
      rank,
      totalAttempts,
      accuracyPercent,
      wrongPercent,
    });
  }
  return ranked;
}
