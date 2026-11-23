import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Anchor,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Flame,
  Gamepad2,
  HelpCircle,
  Link2,
  LogOut,
  Mountain,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shuffle,
  Sparkles,
  Timer,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import heroMountainImg from '../assets/images/hero_mountain_quest_1795428795600.jpg';
import type {
  Exam,
  MountainGameConfig,
  MountainGameMode,
  MountainGameRoomState,
  MountainQuestionItem,
  MountainTimeMode,
  Question,
  UserAccount,
  UserRole,
} from '../types/exam';
import {
  DEFAULT_MOUNTAIN_STARTER_QUESTIONS,
  MOUNTAIN_PETS,
  getMountainPetById,
} from '../data/mountainPets';
import { RichContentRenderer } from './RichContentRenderer';
import { MountainClimbMap } from './MountainClimbMap';
import {
  getGameAudioMuted,
  playGameStartChime,
  playGameWrongSound,
  playPetClimbSound,
  playSummitAnchorSound,
  playTickWarningSound,
  playVictoryFanfareSound,
  setGameAudioMuted,
} from '../utils/gameAudio';

interface MountainGamesViewProps {
  visibleExams: Exam[];
  currentUser: UserAccount | null;
  userRole: UserRole;
  initialRoomCode?: string;
  onRoomCodeChange?: (roomCode?: string) => void;
  onBackToHome: () => void;
}

const SESSION_STORAGE_KEY = 'edutest_mountain_game_session_v1';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function generateClientRoomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return out;
}

function extractSingleChoiceFromExam(exam: Exam): MountainQuestionItem[] {
  const list: MountainQuestionItem[] = [];

  const pushQuestion = (q: Question, idxLabel: string) => {
    if (
      q.type === 'single_choice' &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      typeof q.correctAnswer === 'number' &&
      q.correctAnswer >= 0 &&
      q.correctAnswer < q.options.length
    ) {
      list.push({
        id: `${exam.id}_${q.id || idxLabel}`,
        question: q.question,
        imageUrl: q.imageUrl,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || '',
        sourceTitle: exam.title,
      });
    } else if (q.type === 'grouped' && Array.isArray(q.subQuestions)) {
      q.subQuestions.forEach((sub, sIdx) => {
        if (
          sub.type === 'single_choice' &&
          Array.isArray(sub.options) &&
          sub.options.length >= 2 &&
          typeof sub.correctAnswer === 'number'
        ) {
          list.push({
            id: `${exam.id}_${q.id}_${sub.id || sIdx}`,
            question: q.question ? `${q.question}\n\n${sub.question}` : sub.question,
            imageUrl: sub.imageUrl || q.imageUrl,
            options: sub.options,
            correctAnswer: sub.correctAnswer,
            explanation: sub.explanation || '',
            sourceTitle: exam.title,
          });
        }
      });
    }
  };

  exam.questions.forEach((q, idx) => pushQuestion(q, String(idx + 1)));
  return list;
}

export const MountainGamesView: React.FC<MountainGamesViewProps> = ({
  visibleExams,
  currentUser,
  userRole,
  initialRoomCode,
  onRoomCodeChange,
  onBackToHome,
}) => {
  const isTeacherView = userRole === 'teacher' || currentUser?.role === 'teacher';

  // --- Player Identity & Pet Selection ---
  const [playerName, setPlayerName] = useState<string>(
    () => currentUser?.fullName || currentUser?.name || currentUser?.username || 'Nhà leo núi'
  );
  const [selectedPetId, setSelectedPetId] = useState<string>(MOUNTAIN_PETS[0].id);
  const [lobbyActionTab, setLobbyActionTab] = useState<'create' | 'join'>(() =>
    initialRoomCode ? 'join' : 'create'
  );
  const [joinCodeInput, setJoinCodeInput] = useState<string>(
    () => (initialRoomCode || '').toUpperCase()
  );

  // --- Pre-game Teacher / Host Config ---
  const [mode, setMode] = useState<MountainGameMode>('multi');
  const [useCustomCode, setUseCustomCode] = useState<boolean>(false);
  const [customRoomCode, setCustomRoomCode] = useState<string>(() => generateClientRoomCode());
  const [timeMode, setTimeMode] = useState<MountainTimeMode>('per_question');
  const [questionTimeSec, setQuestionTimeSec] = useState<number>(15);
  const [totalTimeSec, setTotalTimeSec] = useState<number>(180);
  const [summitSteps, setSummitSteps] = useState<number>(20);
  const [rank1Bonus, setRank1Bonus] = useState<number>(4);
  const [rank2Bonus, setRank2Bonus] = useState<number>(3);
  const [baseCorrectBonus, setBaseCorrectBonus] = useState<number>(2);
  const [wrongPenalty, setWrongPenalty] = useState<number>(1);
  const [sourceExamId, setSourceExamId] = useState<string>('starter_mixed');
  const [questionCount, setQuestionCount] = useState<number>(10);

  // --- Active Room & Network State ---
  const [room, setRoom] = useState<MountainGameRoomState | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => getGameAudioMuted());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);
  const [showReviewPanel, setShowReviewPanel] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const prevPhaseKeyRef = useRef<string>('');
  const prevStepRef = useRef<number>(0);
  const lastWarnSecRef = useRef<number>(-1);

  // Keep playerName synced if user logs in while on lobby
  useEffect(() => {
    if (!room && currentUser) {
      const nextName = currentUser.fullName || currentUser.name || currentUser.username;
      if (nextName && playerName === 'Nhà leo núi') {
        setPlayerName(nextName);
      }
    }
  }, [currentUser, room, playerName]);

  // Extract eligible exams (must contain >= 1 single_choice question)
  const eligibleExamOptions = useMemo(() => {
    return visibleExams
      .map((ex) => ({
        exam: ex,
        questions: extractSingleChoiceFromExam(ex),
      }))
      .filter((item) => item.questions.length > 0);
  }, [visibleExams]);

  const activeQuestionPool = useMemo<MountainQuestionItem[]>(() => {
    if (sourceExamId === 'starter_mixed') {
      return DEFAULT_MOUNTAIN_STARTER_QUESTIONS;
    }
    const found = eligibleExamOptions.find((e) => e.exam.id === sourceExamId);
    if (found && found.questions.length > 0) {
      return found.questions;
    }
    return DEFAULT_MOUNTAIN_STARTER_QUESTIONS;
  }, [sourceExamId, eligibleExamOptions]);

  const activeSourceTitle = useMemo(() => {
    if (sourceExamId === 'starter_mixed') {
      return 'Bộ câu hỏi Khởi động Đa môn (Toán · Lý · Hóa · Anh · Địa)';
    }
    return (
      eligibleExamOptions.find((e) => e.exam.id === sourceExamId)?.exam.title ||
      'Bộ câu hỏi Đề thi'
    );
  }, [sourceExamId, eligibleExamOptions]);

  // Clamp questionCount when pool changes
  useEffect(() => {
    setQuestionCount((prev) => Math.max(1, Math.min(activeQuestionPool.length, prev || activeQuestionPool.length)));
  }, [activeQuestionPool.length]);

  // Live countdown ticker
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [room?.status, room?.code]);

  // Generate QR code when in lobby or waiting room
  useEffect(() => {
    if (!room?.code || typeof window === 'undefined') {
      setQrDataUrl('');
      return;
    }
    const inviteUrl = `${window.location.origin}/tro-choi/${room.code}`;
    QRCode.toDataURL(inviteUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [room?.code]);

  // Attempt session recovery on mount or initialRoomCode change
  useEffect(() => {
    if (room) return;
    if (initialRoomCode) {
      setLobbyActionTab('join');
      setJoinCodeInput(initialRoomCode.toUpperCase());
    }
    try {
      const savedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!savedRaw) return;
      const saved = JSON.parse(savedRaw);
      if (!saved?.roomCode || !saved?.playerId) return;
      if (initialRoomCode && saved.roomCode !== initialRoomCode.toUpperCase()) return;

      fetch(`/api/games/rooms/${encodeURIComponent(saved.roomCode)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const foundRoom: MountainGameRoomState | undefined = data?.room;
          if (foundRoom && foundRoom.players.some((p) => p.id === saved.playerId)) {
            setRoom(foundRoom);
            setPlayerId(saved.playerId);
            onRoomCodeChange?.(foundRoom.code);
          } else {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
          }
        })
        .catch(() => {});
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomCode]);

  // WebSocket + lightweight fallback sync while inside a room
  useEffect(() => {
    if (!room?.code || !playerId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let closedIntentionally = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      if (closedIntentionally || typeof window === 'undefined') return;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/ws/games?room=${encodeURIComponent(
        room.code
      )}&playerId=${encodeURIComponent(playerId)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.type === 'room_state' && msg.room) {
            setRoom(msg.room);
            setSubmittingAnswer(false);
          } else if (msg?.type === 'error' && msg.message) {
            setErrorMsg(msg.message);
            setSubmittingAnswer(false);
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedIntentionally) {
          reconnectTimer = setTimeout(connectWs, 1500);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connectWs();

    const fallbackPoll = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      fetch(`/api/games/rooms/${encodeURIComponent(room.code)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.room) setRoom(data.room);
        })
        .catch(() => {});
    }, 3000);

    return () => {
      closedIntentionally = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(fallbackPoll);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room?.code, playerId]);

  // Sound Effects triggered by authoritative state transitions
  useEffect(() => {
    if (!room) {
      prevPhaseKeyRef.current = '';
      prevStepRef.current = 0;
      return;
    }

    const me = room.players.find((p) => p.id === playerId);
    const phaseKey = `${room.status}_${room.stage}_${room.roundPhase}_${room.currentMainIndex}`;

    if (prevPhaseKeyRef.current && prevPhaseKeyRef.current !== phaseKey) {
      if (room.status === 'playing' && prevPhaseKeyRef.current.startsWith('lobby')) {
        playGameStartChime();
      } else if (room.status === 'finished') {
        playVictoryFanfareSound();
      } else if (room.roundPhase === 'round_result' && me && room.lastRoundSummary) {
        const myDelta = room.lastRoundSummary.deltas.find((d) => d.playerId === me.id);
        if (myDelta) {
          if (myDelta.isCorrect) {
            if (me.step >= room.config.summitSteps && !me.officiallyFinished) {
              playSummitAnchorSound();
            } else {
              playPetClimbSound(myDelta.stepDelta);
            }
          } else {
            playGameWrongSound();
          }
        }
      }
    }

    // Retry feedback audio
    if (
      room.stage === 'retry' &&
      me?.lastRetryFeedback &&
      prevStepRef.current !== me.lastRetryFeedback.timestamp
    ) {
      prevStepRef.current = me.lastRetryFeedback.timestamp;
      if (me.lastRetryFeedback.isCorrect) {
        playPetClimbSound(1);
      } else {
        playGameWrongSound();
      }
    }

    prevPhaseKeyRef.current = phaseKey;
  }, [room, playerId]);

  const myPlayer = useMemo(
    () => room?.players.find((p) => p.id === playerId) || null,
    [room, playerId]
  );
  const isHost = Boolean(room && myPlayer && room.hostId === myPlayer.id);

  // Countdown calculation
  const remainingSec = useMemo(() => {
    if (!room || room.status !== 'playing') return 0;
    if (room.config.timeMode === 'total_game' && room.gameEndsAt) {
      return Math.max(0, Math.ceil((room.gameEndsAt - nowMs) / 1000));
    }
    if (room.stage === 'main' && room.roundPhase === 'question' && room.questionEndsAt) {
      return Math.max(0, Math.ceil((room.questionEndsAt - nowMs) / 1000));
    }
    if (room.stage === 'main' && room.roundPhase === 'round_result' && room.roundResultEndsAt) {
      return Math.max(0, Math.ceil((room.roundResultEndsAt - nowMs) / 1000));
    }
    if (
      room.stage === 'retry' &&
      myPlayer &&
      !myPlayer.officiallyFinished &&
      myPlayer.currentRetryStartedAt
    ) {
      const endTs = myPlayer.currentRetryStartedAt + room.config.questionTimeSec * 1000;
      return Math.max(0, Math.ceil((endTs - nowMs) / 1000));
    }
    return 0;
  }, [room, nowMs, myPlayer]);

  // Warning tick sound on last 5 seconds of a question
  useEffect(() => {
    if (
      room?.status === 'playing' &&
      ((room.stage === 'main' && room.roundPhase === 'question') ||
        (room.stage === 'retry' && myPlayer && !myPlayer.officiallyFinished))
    ) {
      if (remainingSec > 0 && remainingSec <= 5 && lastWarnSecRef.current !== remainingSec) {
        lastWarnSecRef.current = remainingSec;
        playTickWarningSound();
      }
    } else {
      lastWarnSecRef.current = -1;
    }
  }, [remainingSec, room?.status, room?.stage, room?.roundPhase, myPlayer]);

  // Sorted leaderboard (Official finish -> step -> 1st try correct -> avg reaction time)
  const rankedPlayers = useMemo(() => {
    if (!room) return [];
    return [...room.players].sort((a, b) => {
      if (a.officiallyFinished !== b.officiallyFinished) {
        return a.officiallyFinished ? -1 : 1;
      }
      if (a.officiallyFinished && b.officiallyFinished && a.finishedAt !== b.finishedAt) {
        // Tie break by steps first, then finish time
        if (b.step !== a.step) return b.step - a.step;
        return (a.finishedAt || 0) - (b.finishedAt || 0);
      }
      if (b.step !== a.step) return b.step - a.step;
      if (b.firstTryCorrectCount !== a.firstTryCorrectCount) {
        return b.firstTryCorrectCount - a.firstTryCorrectCount;
      }
      const avgA = a.answeredCountForAvg > 0 ? a.totalReactionMs / a.answeredCountForAvg : 999999;
      const avgB = b.answeredCountForAvg > 0 ? b.totalReactionMs / b.answeredCountForAvg : 999999;
      return avgA - avgB;
    });
  }, [room]);

  // --- Handlers ---
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    setGameAudioMuted(next);
  };

  const handleCopyText = (text: string, type: 'code' | 'link') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCreateRoom = async () => {
    setErrorMsg(null);
    if (!playerName.trim()) {
      setErrorMsg('Vui lòng nhập tên hiển thị trước khi tạo phòng.');
      return;
    }

    setBusyAction(true);
    try {
      const clientPlayerId =
        currentUser?.uid ||
        currentUser?.id ||
        `host_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const configPayload: Partial<MountainGameConfig> = {
        mode,
        timeMode,
        questionTimeSec,
        totalTimeSec,
        summitSteps,
        rank1Bonus,
        rank2Bonus,
        baseCorrectBonus,
        wrongPenalty,
        questionCount: Math.min(questionCount, activeQuestionPool.length),
        sourceExamId,
        sourceTitle: activeSourceTitle,
      };

      const res = await fetch('/api/games/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customCode: useCustomCode ? customRoomCode.trim().toUpperCase() : undefined,
          hostId: clientPlayerId,
          hostName: playerName.trim(),
          petId: selectedPetId,
          config: configPayload,
          questions: activeQuestionPool,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || 'Không thể tạo phòng chơi.');
        return;
      }

      setRoom(data.room);
      setPlayerId(data.playerId);
      setShowReviewPanel(false);
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode: data.room.code, playerId: data.playerId })
      );
      onRoomCodeChange?.(data.room.code);
    } catch {
      setErrorMsg('Lỗi kết nối tới máy chủ phòng chơi.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleJoinRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setErrorMsg('Vui lòng nhập mã phòng chơi.');
      return;
    }
    if (!playerName.trim()) {
      setErrorMsg('Vui lòng nhập tên hiển thị của bạn.');
      return;
    }

    setBusyAction(true);
    try {
      const clientPlayerId =
        currentUser?.uid ||
        currentUser?.id ||
        `ply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const res = await fetch(`/api/games/rooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: clientPlayerId,
          playerName: playerName.trim(),
          petId: selectedPetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || 'Không thể tham gia phòng chơi.');
        return;
      }

      setRoom(data.room);
      setPlayerId(data.playerId);
      setShowReviewPanel(false);
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode: data.room.code, playerId: data.playerId })
      );
      onRoomCodeChange?.(data.room.code);
    } catch {
      setErrorMsg('Lỗi kết nối khi vào phòng chơi.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (room && playerId) {
      try {
        await fetch(`/api/games/rooms/${encodeURIComponent(room.code)}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        });
      } catch {}
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setRoom(null);
    setPlayerId('');
    setErrorMsg(null);
    onRoomCodeChange?.(undefined);
  };

  const handleStartGame = async () => {
    if (!room || !isHost) return;
    setErrorMsg(null);
    setBusyAction(true);
    try {
      const res = await fetch(`/api/games/rooms/${encodeURIComponent(room.code)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || 'Không thể bắt đầu trận đấu.');
        return;
      }
      setRoom(data.room);
      setShowReviewPanel(false);
    } catch {
      setErrorMsg('Không thể bắt đầu trận đấu.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleRestartToLobby = async () => {
    if (!room || !isHost) return;
    setErrorMsg(null);
    setBusyAction(true);
    try {
      const res = await fetch(`/api/games/rooms/${encodeURIComponent(room.code)}/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: playerId }),
      });
      const data = await res.json();
      if (res.ok && data?.room) {
        setRoom(data.room);
        setShowReviewPanel(false);
      } else {
        setErrorMsg(data?.error || 'Không thể mở ván mới.');
      }
    } catch {
      setErrorMsg('Lỗi kết nối.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAdvanceRound = async () => {
    if (!room || !isHost) return;
    try {
      const res = await fetch(`/api/games/rooms/${encodeURIComponent(room.code)}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: playerId }),
      });
      const data = await res.json();
      if (res.ok && data?.room) setRoom(data.room);
    } catch {}
  };

  const handleSubmitOption = useCallback(
    async (questionId: string, selectedIndex: number) => {
      if (!room || !playerId || submittingAnswer) return;
      setSubmittingAnswer(true);
      setErrorMsg(null);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'submit_answer',
            questionId,
            selectedIndex,
          })
        );
        return;
      }

      try {
        const res = await fetch(`/api/games/rooms/${encodeURIComponent(room.code)}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, questionId, selectedIndex }),
        });
        const data = await res.json();
        if (res.ok && data?.room) {
          setRoom(data.room);
        } else if (data?.error) {
          setErrorMsg(data.error);
        }
      } catch {
        setErrorMsg('Lỗi gửi đáp án. Vui lòng thử lại.');
      } finally {
        setSubmittingAnswer(false);
      }
    },
    [room, playerId, submittingAnswer]
  );

  const selectedPet = getMountainPetById(selectedPetId);
  const inviteLink =
    typeof window !== 'undefined' && room?.code
      ? `${window.location.origin}/tro-choi/${room.code}`
      : '';

  // =========================================================================
  // RENDER 1: ACTIVE ROOM (WAITING LOBBY / PLAYING / FINISHED)
  // =========================================================================
  if (room) {
    const currentMainQuestion = room.questions[room.currentMainIndex];
    const currentRetryQuestionId = myPlayer?.wrongQueueIds[0];
    const currentRetryQuestion = currentRetryQuestionId
      ? room.questions.find((q) => q.id === currentRetryQuestionId)
      : undefined;

    const myMainAnswer =
      myPlayer?.currentAnswer && myPlayer.currentAnswer.questionIndex === room.currentMainIndex
        ? myPlayer.currentAnswer
        : null;

    const totalTimerTargetSec =
      room.config.timeMode === 'total_game'
        ? room.config.totalTimeSec
        : room.config.questionTimeSec;
    const timerPercent =
      totalTimerTargetSec > 0
        ? Math.max(0, Math.min(100, (remainingSec / totalTimerTargetSec) * 100))
        : 0;

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-5 font-sans">
        {/* Room Top Status Strip */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-2xl shrink-0">
              {getMountainPetById(myPlayer?.petId || selectedPetId).emoji}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                  Vượt Chướng Ngại Vật — Chinh Phục Đỉnh Núi
                </h2>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono text-xs font-black tracking-wider">
                  MÃ: {room.code}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mt-1">
                <span>
                  Chế độ:{' '}
                  <strong className="text-white">
                    {room.config.mode === 'solo'
                      ? '1 người chơi'
                      : room.config.mode === 'duo'
                      ? '2 người đối đầu'
                      : `Nhiều người (${room.players.length})`}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  {room.config.timeMode === 'per_question'
                    ? `${room.config.questionTimeSec}s / câu`
                    : `Tổng ${room.config.totalTimeSec}s`}
                </span>
                <span>·</span>
                <span className={wsConnected ? 'text-emerald-400 font-semibold' : 'text-amber-300'}>
                  {wsConnected ? 'Đồng bộ trực tiếp' : 'Đang đồng bộ lại...'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              title={isMuted ? 'Bật âm thanh trò chơi' : 'Tắt âm thanh trò chơi'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              <span className="hidden sm:inline">{isMuted ? 'Đang tắt tiếng' : 'Âm thanh'}</span>
            </button>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="min-h-[40px] px-3.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Rời phòng</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center justify-between gap-3">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold underline cursor-pointer shrink-0"
            >
              Đóng
            </button>
          </div>
        )}

        {/* --- SUB-VIEW A: WAITING LOBBY --- */}
        {room.status === 'lobby' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Invite, Room Code & QR */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Sảnh chờ phòng chơi
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                    Đang mở phòng
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 text-white text-center space-y-2">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Mã phòng tham gia
                  </div>
                  <div className="text-3xl sm:text-4xl font-mono font-black tracking-[0.22em] text-amber-300 select-all">
                    {room.code}
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyText(room.code, 'code')}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedType === 'code' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Đã chép mã</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép mã</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyText(inviteLink, 'link')}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedType === 'link' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Đã chép link mời</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Sao chép link mời</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {qrDataUrl && (
                  <div className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <img
                      src={qrDataUrl}
                      alt={`Mã QR vào phòng ${room.code}`}
                      className="w-24 h-24 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                        <QrCode className="w-4 h-4 text-blue-600" />
                        <span>Quét QR vào phòng nhanh</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Học sinh quét mã bằng camera điện thoại hoặc nhập mã{' '}
                        <strong className="font-mono text-slate-900">{room.code}</strong> tại tab Trò chơi.
                      </p>
                    </div>
                  </div>
                )}

                {/* Rules Digest */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 text-xs">
                  <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Settings2 className="w-4 h-4 text-slate-600" />
                    <span>Thông số trận leo núi</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <div className="text-[11px] text-slate-500">Số câu hỏi</div>
                      <div className="font-extrabold text-slate-900 tabular-nums">
                        {room.questions.length} câu
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <div className="text-[11px] text-slate-500">Đỉnh núi</div>
                      <div className="font-extrabold text-slate-900 tabular-nums">
                        {room.config.summitSteps} bậc
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200 col-span-2">
                      <div className="text-[11px] text-slate-500">Cộng / trừ bước</div>
                      <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                        Nhất +{room.config.rank1Bonus} · Nhì +{room.config.rank2Bonus} · Đúng +
                        {room.config.baseCorrectBonus} · Sai -{room.config.wrongPenalty}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Player Roster & Start CTA */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <span>
                      Người chơi đã sẵn sàng ({room.players.length}
                      {room.config.mode === 'solo'
                        ? '/1'
                        : room.config.mode === 'duo'
                        ? '/2'
                        : ''}
                      )
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Nguồn câu hỏi: {room.config.sourceTitle}
                  </p>
                </div>

                {isHost ? (
                  <button
                    type="button"
                    disabled={
                      busyAction ||
                      (room.config.mode === 'duo' && room.players.length < 2)
                    }
                    onClick={handleStartGame}
                    className="min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Bắt đầu chinh phục đỉnh núi</span>
                  </button>
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                    Đang chờ chủ phòng bấm Bắt đầu...
                  </div>
                )}
              </div>

              {room.config.mode === 'duo' && room.players.length < 2 && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                  Chế độ 2 người đối đầu cần thêm 1 người chơi nhập mã phòng{' '}
                  <strong className="font-mono">{room.code}</strong> để bắt đầu.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {room.players.map((p) => {
                  const pet = getMountainPetById(p.petId);
                  const isMe = p.id === playerId;
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isMe
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${pet.bgClass} ${pet.borderClass}`}
                        >
                          {pet.emoji}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-slate-900 truncate">
                              {p.name}
                            </span>
                            {isMe && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                                Bạn
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{pet.name}</span>
                            {p.isHost && (
                              <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold">
                                <Crown className="w-3 h-3" /> Chủ phòng
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-bold shrink-0 ${
                          p.connected ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {p.connected ? 'Sẵn sàng' : 'Mất kết nối'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- SUB-VIEW B: ACTIVE GAMEPLAY --- */}
        {room.status === 'playing' && (
          <div className="@container">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* Left Column: Winding Mountain Map & Live Standings */}
              <div className="xl:col-span-7 space-y-4 min-w-0">
                <MountainClimbMap
                  players={room.players}
                  summitSteps={room.config.summitSteps}
                  currentPlayerId={playerId}
                  totalQuestions={room.questions.length}
                />

                {/* Live Race Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <span>Bảng xếp hạng trực tiếp ({room.players.length})</span>
                    </h4>
                    <span className="text-xs text-slate-500 font-semibold tabular-nums">
                      {room.stage === 'main'
                        ? `Câu chính ${room.currentMainIndex + 1}/${room.questions.length}`
                        : 'Vòng ôn sửa câu sai'}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {rankedPlayers.map((p, idx) => {
                      const pet = getMountainPetById(p.petId);
                      const isMe = p.id === playerId;
                      const isAnchored = p.step >= room.config.summitSteps && !p.officiallyFinished;
                      return (
                        <div
                          key={p.id}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
                            isMe ? 'bg-emerald-50/60' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-md font-extrabold flex items-center justify-center tabular-nums shrink-0 ${
                                idx === 0
                                  ? 'bg-amber-400 text-slate-950'
                                  : idx === 1
                                  ? 'bg-slate-300 text-slate-900'
                                  : idx === 2
                                  ? 'bg-orange-200 text-orange-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="text-xl shrink-0">{pet.emoji}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {p.name} {isMe && <span className="text-emerald-700">(Bạn)</span>}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {p.officiallyFinished ? (
                                  <span className="text-emerald-700 font-bold">
                                    ✓ Về đích chính thức
                                  </span>
                                ) : isAnchored ? (
                                  <span className="text-amber-700 font-bold">
                                    ⚓ Neo đỉnh · Còn {room.stage === 'main' ? `${room.questions.length - p.mainAnsweredCount} câu` : `${p.wrongQueueIds.length} câu sai`}
                                  </span>
                                ) : room.stage === 'retry' ? (
                                  <span className="text-orange-700 font-semibold">
                                    Đang sửa {p.wrongQueueIds.length} câu sai
                                  </span>
                                ) : p.currentAnswer?.questionIndex === room.currentMainIndex ? (
                                  <span className="text-blue-700 font-semibold">Đã chốt đáp án</span>
                                ) : (
                                  <span>Đang suy nghĩ...</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 tabular-nums">
                            <div className="font-extrabold text-slate-900">
                              Bậc {p.step}/{room.config.summitSteps}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Đúng {p.firstTryCorrectCount}/{room.questions.length}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Question Card / Round Speed Ranking / Retry Loop */}
              <div className="xl:col-span-5 space-y-4 min-w-0">
                {/* Timer & Stage Header Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {room.stage === 'main' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-extrabold tabular-nums">
                          Câu {room.currentMainIndex + 1} / {room.questions.length}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-extrabold inline-flex items-center gap-1">
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Vòng ôn sửa câu sai</span>
                        </span>
                      )}
                      {room.stage === 'main' && room.roundPhase === 'round_result' && (
                        <span className="text-xs font-bold text-emerald-700">
                          Tổng kết nhanh lượt thi
                        </span>
                      )}
                    </div>

                    <div
                      className={`px-3 py-1 rounded-lg font-mono text-sm font-black tabular-nums inline-flex items-center gap-1.5 ${
                        remainingSec <= 5
                          ? 'bg-rose-100 text-rose-700 border border-rose-300'
                          : 'bg-slate-100 text-slate-900 border border-slate-200'
                      }`}
                    >
                      <Timer className="w-4 h-4" />
                      <span>{remainingSec}s</span>
                    </div>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        remainingSec <= 5 ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${timerPercent}%` }}
                    />
                  </div>
                </div>

                {/* STAGE 1A: ACTIVE QUESTION */}
                {room.stage === 'main' &&
                  room.roundPhase === 'question' &&
                  currentMainQuestion && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
                      <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
                        <RichContentRenderer
                          content={currentMainQuestion.question}
                          imageUrl={currentMainQuestion.imageUrl}
                        />
                      </div>

                      <div className="space-y-2.5">
                        {currentMainQuestion.options.map((opt, idx) => {
                          const isChosen = myMainAnswer?.selectedIndex === idx;
                          const locked = Boolean(myMainAnswer);
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={locked || submittingAnswer}
                              onClick={() => handleSubmitOption(currentMainQuestion.id, idx)}
                              className={`w-full min-h-[52px] p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                                isChosen
                                  ? 'bg-blue-600 border-blue-700 text-white shadow-sm'
                                  : locked
                                  ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-default'
                                  : 'bg-white border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 text-slate-900 cursor-pointer'
                              }`}
                            >
                              <span
                                className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 ${
                                  isChosen
                                    ? 'bg-white text-blue-700'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {OPTION_LETTERS[idx] || idx + 1}
                              </span>
                              <div className="flex-1 min-w-0 text-sm font-semibold leading-snug pt-0.5">
                                <RichContentRenderer content={opt} />
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {myMainAnswer && (
                        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold flex items-center justify-between gap-2">
                          <span>
                            Đã gửi đáp án trong {(myMainAnswer.reactionMs / 1000).toFixed(2)}s · Đang chờ các người chơi khác...
                          </span>
                          {isHost && (
                            <button
                              type="button"
                              onClick={handleAdvanceRound}
                              className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold cursor-pointer shrink-0"
                            >
                              Chốt lượt ngay
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {/* STAGE 1B: ROUND SPEED & STEP DELTA SUMMARY */}
                {room.stage === 'main' &&
                  room.roundPhase === 'round_result' &&
                  room.lastRoundSummary && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                          <Zap className="w-5 h-5 text-amber-500" />
                          <span>Kết quả lượt câu {room.lastRoundSummary.questionIndex + 1}</span>
                        </h4>
                        {isHost && (
                          <button
                            type="button"
                            onClick={handleAdvanceRound}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Câu tiếp theo</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Correct Answer Box */}
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                        <div className="text-xs font-extrabold text-emerald-800">
                          Đáp án đúng: Phương án{' '}
                          {OPTION_LETTERS[room.lastRoundSummary.correctAnswer] ||
                            room.lastRoundSummary.correctAnswer + 1}
                        </div>
                        {currentMainQuestion?.options[room.lastRoundSummary.correctAnswer] && (
                          <div className="text-sm font-bold text-slate-900">
                            <RichContentRenderer
                              content={
                                currentMainQuestion.options[room.lastRoundSummary.correctAnswer]
                              }
                            />
                          </div>
                        )}
                        {room.lastRoundSummary.explanation && (
                          <div className="text-xs text-slate-700 pt-1 border-t border-emerald-200/70">
                            <RichContentRenderer content={room.lastRoundSummary.explanation} />
                          </div>
                        )}
                      </div>

                      {/* Player Deltas */}
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {room.lastRoundSummary.deltas.map((d) => {
                          const pet = getMountainPetById(d.petId);
                          const isMe = d.playerId === playerId;
                          return (
                            <div
                              key={d.playerId}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                                d.isCorrect
                                  ? d.rankInRound === 1
                                    ? 'bg-amber-50 border-amber-300'
                                    : 'bg-emerald-50/70 border-emerald-200'
                                  : 'bg-rose-50/70 border-rose-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-xl shrink-0">{pet.emoji}</span>
                                <div className="min-w-0">
                                  <div className="font-extrabold text-slate-900 truncate">
                                    {d.playerName} {isMe ? '(Bạn)' : ''}
                                  </div>
                                  <div className="text-[11px] font-semibold text-slate-600">
                                    {d.badgeLabel}
                                    {d.reactionMs ? ` · ${(d.reactionMs / 1000).toFixed(2)}s` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded-md font-extrabold ${
                                    d.stepDelta > 0
                                      ? 'bg-emerald-600 text-white'
                                      : d.stepDelta < 0
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {d.stepDelta > 0 ? `+${d.stepDelta}` : d.stepDelta} bước
                                </span>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Bậc {d.newStep}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* STAGE 2: MANDATORY WRONG-QUESTION RETRY LOOP */}
                {room.stage === 'retry' && myPlayer && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    {myPlayer.officiallyFinished ? (
                      <div className="py-6 text-center space-y-3">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h4 className="text-lg font-extrabold text-slate-900">
                          Bạn đã Về đích chính thức!
                        </h4>
                        <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                          Bạn đã hoàn thành toàn bộ câu hỏi và sửa sạch mọi câu sai. Đang chờ các người chơi khác hoàn tất vòng ôn để công bố bảng tổng kết.
                        </p>
                      </div>
                    ) : currentRetryQuestion ? (
                      <>
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1">
                          <div className="font-extrabold flex items-center gap-1.5">
                            <RotateCcw className="w-4 h-4 text-amber-700" />
                            <span>
                              Còn {myPlayer.wrongQueueIds.length} câu cần làm lại đúng để Về đích chính thức
                            </span>
                          </div>
                          <p className="text-amber-800">
                            Dù bạn đang ở bậc {myPlayer.step}/{room.config.summitSteps}, hệ thống bắt buộc phải sửa đúng hết các câu từng sai mới được tính về đích.
                          </p>
                        </div>

                        {myPlayer.lastRetryFeedback && (
                          <div
                            className={`p-3 rounded-xl border text-xs font-semibold ${
                              myPlayer.lastRetryFeedback.isCorrect
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-rose-50 border-rose-200 text-rose-900'
                            }`}
                          >
                            {myPlayer.lastRetryFeedback.isCorrect ? (
                              <span>
                                ✓ Câu ôn vừa rồi chính xác! (+{myPlayer.lastRetryFeedback.stepDelta} bước)
                              </span>
                            ) : (
                              <span>
                                ✕ Chưa đúng ({myPlayer.lastRetryFeedback.stepDelta} bước) — câu đó đã được xếp xuống cuối hàng đợi để bạn làm lại!
                              </span>
                            )}
                          </div>
                        )}

                        <div className="text-base font-bold text-slate-900 leading-relaxed">
                          <RichContentRenderer
                            content={currentRetryQuestion.question}
                            imageUrl={currentRetryQuestion.imageUrl}
                          />
                        </div>

                        <div className="space-y-2.5">
                          {currentRetryQuestion.options.map((opt, idx) => (
                            <button
                              key={`${currentRetryQuestion.id}_${idx}`}
                              type="button"
                              disabled={submittingAnswer}
                              onClick={() => handleSubmitOption(currentRetryQuestion.id, idx)}
                              className="w-full min-h-[52px] p-3.5 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 bg-white text-left transition-all flex items-start gap-3 cursor-pointer"
                            >
                              <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                                {OPTION_LETTERS[idx] || idx + 1}
                              </span>
                              <div className="flex-1 min-w-0 text-sm font-semibold text-slate-900 leading-snug pt-0.5">
                                <RichContentRenderer content={opt} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- SUB-VIEW C: END-GAME SUMMARY & PODIUM --- */}
        {room.status === 'finished' && (
          <div className="space-y-6">
            {/* Victory Banner */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 shadow-md">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 text-amber-300 text-xs font-extrabold uppercase tracking-wider">
                  <Trophy className="w-4 h-4" />
                  <span>Tổng kết hành trình Chinh phục Đỉnh núi</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {rankedPlayers[0]?.officiallyFinished
                    ? `Chúc mừng ${rankedPlayers[0].name} dẫn đầu bảng vàng!`
                    : 'Cuộc đua leo núi đã khép lại!'}
                </h2>
                <p className="text-sm text-slate-300">
                  Xếp hạng ưu tiên người hoàn tất đủ {room.questions.length} câu hỏi &amp; sửa hết câu sai (Về đích chính thức), sau đó xét bậc leo núi và tốc độ phản hồi.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {isHost && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleRestartToLobby}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Chơi ván mới</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm cursor-pointer"
                >
                  Về sảnh Trò chơi
                </button>
              </div>
            </div>

            {/* Top 3 Podium */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rankedPlayers.slice(0, 3).map((p, idx) => {
                const pet = getMountainPetById(p.petId);
                const avgSec =
                  p.answeredCountForAvg > 0
                    ? (p.totalReactionMs / p.answeredCountForAvg / 1000).toFixed(2)
                    : '—';
                const cardStyle =
                  idx === 0
                    ? 'bg-amber-50 border-amber-300 shadow-sm'
                    : idx === 1
                    ? 'bg-slate-50 border-slate-300'
                    : 'bg-orange-50/70 border-orange-200';
                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between gap-3 ${cardStyle}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        {idx === 0 ? '🥇 Hạng Nhất' : idx === 1 ? '🥈 Hạng Nhì' : '🥉 Hạng Ba'}
                      </span>
                      {p.officiallyFinished ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-bold">
                          Về đích chính thức
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-bold">
                          Chưa xong hết câu
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl shrink-0">
                        {pet.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold text-slate-900 truncate">
                          {p.name}
                        </div>
                        <div className="text-xs text-slate-600">{pet.name}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 text-center text-xs tabular-nums">
                      <div>
                        <div className="text-[11px] text-slate-500">Vị trí</div>
                        <div className="font-extrabold text-slate-900">
                          {p.step}/{room.config.summitSteps}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Đúng lần 1</div>
                        <div className="font-extrabold text-emerald-700">
                          {p.firstTryCorrectCount}/{room.questions.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">TB phản hồi</div>
                        <div className="font-extrabold text-slate-900">{avgSec}s</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full Standings Table + Map Replay */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-6">
                <MountainClimbMap
                  players={room.players}
                  summitSteps={room.config.summitSteps}
                  currentPlayerId={playerId}
                  totalQuestions={room.questions.length}
                />
              </div>

              <div className="xl:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Chi tiết kết quả tất cả người chơi
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowReviewPanel((v) => !v)}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    {showReviewPanel ? 'Ẩn đáp án đề thi' : 'Xem lại đáp án & lời giải'}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
                      <tr>
                        <th className="px-4 py-3 font-bold">Hạng</th>
                        <th className="px-4 py-3 font-bold">Người chơi</th>
                        <th className="px-4 py-3 font-bold">Trạng thái</th>
                        <th className="px-4 py-3 font-bold text-right">Bậc</th>
                        <th className="px-4 py-3 font-bold text-right">Đúng đầu</th>
                        <th className="px-4 py-3 font-bold text-right">TB (s)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {rankedPlayers.map((p, idx) => {
                        const pet = getMountainPetById(p.petId);
                        const avgSec =
                          p.answeredCountForAvg > 0
                            ? (p.totalReactionMs / p.answeredCountForAvg / 1000).toFixed(2)
                            : '—';
                        return (
                          <tr key={p.id} className={p.id === playerId ? 'bg-emerald-50/50' : ''}>
                            <td className="px-4 py-3 font-extrabold text-slate-800">#{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 font-bold text-slate-900">
                                <span className="text-lg">{pet.emoji}</span>
                                <span>{p.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {p.officiallyFinished ? (
                                <span className="text-emerald-700 font-bold">
                                  ✓ Về đích chính thức
                                </span>
                              ) : (
                                <span className="text-amber-700 font-semibold">
                                  Còn {p.wrongQueueIds.length} câu sai
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                              {p.step}/{room.config.summitSteps}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-700">
                              {p.firstTryCorrectCount}/{room.questions.length}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">{avgSec}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Answer Key Review Accordion */}
            {showReviewPanel && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
                <h3 className="text-base font-extrabold text-slate-900">
                  Đáp án &amp; Lời giải chi tiết ({room.questions.length} câu)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {room.questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                    >
                      <div className="font-extrabold text-slate-900">
                        Câu {idx + 1}:
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        <RichContentRenderer content={q.question} imageUrl={q.imageUrl} />
                      </div>
                      {typeof q.correctAnswer === 'number' && q.options[q.correctAnswer] && (
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                          Đáp án {OPTION_LETTERS[q.correctAnswer]}:{' '}
                          <RichContentRenderer content={q.options[q.correctAnswer]} />
                        </div>
                      )}
                      {q.explanation && (
                        <div className="text-slate-600">
                          <RichContentRenderer content={q.explanation} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // RENDER 2: LOBBY SETUP (CHOOSE PET + CREATE ROOM OR JOIN BY CODE)
  // =========================================================================
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 font-sans">
      {/* Expedition Hero Header */}
      <section className="relative rounded-3xl overflow-hidden bg-slate-900 text-white shadow-md min-h-[210px] flex items-end">
        {!heroImgFailed && (
          <img
            src={heroMountainImg}
            alt="Minh họa hành trình leo núi Vượt chướng ngại vật"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center opacity-45"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-900/40" />

        <div className="relative z-10 w-full p-6 sm:p-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 text-amber-300 text-xs font-extrabold uppercase tracking-wider">
              <Mountain className="w-4 h-4" />
              <span>Trò chơi tương tác EduTest</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
              Vượt chướng ngại vật — Chinh phục đỉnh núi
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              Chọn linh vật yêu thích, thi đấu tốc độ trả lời câu hỏi cùng bạn bè hoặc luyện tập cá nhân. Hoàn thành toàn bộ câu hỏi và sửa hết câu sai để chạm mốc về đích chính thức.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[40px] px-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              <span>{isMuted ? 'Tắt tiếng' : 'Bật âm thanh'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="min-h-[40px] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white cursor-pointer"
            >
              Quay lại Ngân hàng đề
            </button>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-bold underline cursor-pointer shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Split Lobby Configurator */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): Player Profile + 20 Pet Mascot Selector */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>Bước 1: Nhập tên &amp; Chọn thú cưng đồng hành (20 mẫu)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Linh vật bạn chọn sẽ xuất hiện và leo từng bậc trên bản đồ đỉnh núi
              </p>
            </div>

            {/* Selected Pet Summary Chip */}
            <div
              className={`px-3.5 py-2 rounded-xl border flex items-center gap-2.5 ${selectedPet.bgClass} ${selectedPet.borderClass}`}
            >
              <span className="text-2xl">{selectedPet.emoji}</span>
              <div>
                <div className={`text-xs font-extrabold ${selectedPet.textClass}`}>
                  {selectedPet.name}
                </div>
                <div className="text-[10px] text-slate-600">{selectedPet.trait}</div>
              </div>
            </div>
          </div>

          {/* Player Name Input */}
          <div>
            <label
              htmlFor="mountain-player-name"
              className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Tên hiển thị trên đường đua
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="mountain-player-name"
                type="text"
                maxLength={40}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Nhập tên hoặc biệt danh của bạn..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-emerald-600 focus:outline-none text-sm font-bold text-slate-900"
              />
            </div>
          </div>

          {/* 20 Pet Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Bộ sưu tập 20 linh vật leo núi
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                Đang chọn: {selectedPet.emoji} {selectedPet.name}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {MOUNTAIN_PETS.map((pet) => {
                const isSelected = pet.id === selectedPetId;
                return (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => setSelectedPetId(pet.id)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[92px] ${
                      isSelected
                        ? `${pet.bgClass} ${pet.borderClass} ring-2 ring-emerald-600 shadow-sm -translate-y-0.5`
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-3xl leading-none">{pet.emoji}</span>
                    <span className="text-xs font-extrabold text-slate-900 leading-tight mt-1">
                      {pet.name}
                    </span>
                    <span className="text-[10px] text-slate-500 leading-none">{pet.trait}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Create Room Config OR Join By Code */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
          {/* Action Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
            <button
              type="button"
              onClick={() => setLobbyActionTab('create')}
              className={`min-h-[42px] rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                lobbyActionTab === 'create'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Tạo phòng mới</span>
            </button>
            <button
              type="button"
              onClick={() => setLobbyActionTab('join')}
              className={`min-h-[42px] rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                lobbyActionTab === 'join'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              <span>Vào bằng mã phòng</span>
            </button>
          </div>

          {/* JOIN ROOM TAB */}
          {lobbyActionTab === 'join' && (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Tham gia phòng chơi đang mở
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Nhập mã phòng do giáo viên hoặc bạn bè chia sẻ (ví dụ 6 ký tự in hoa), kiểm tra lại linh vật đã chọn ở bên trái rồi nhấn Vào chơi.
                </p>
              </div>

              <div>
                <label
                  htmlFor="mountain-join-code"
                  className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Mã phòng chơi
                </label>
                <input
                  id="mountain-join-code"
                  type="text"
                  maxLength={12}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="Nhập mã phòng (VD: K9M4P2)..."
                  className="w-full min-h-[48px] px-4 py-2 rounded-xl border-2 border-slate-300 focus:border-emerald-600 focus:outline-none text-center font-mono text-xl font-black tracking-[0.2em] uppercase text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={busyAction}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
              >
                <span>{selectedPet.emoji}</span>
                <span>{busyAction ? 'Đang vào phòng...' : 'Vào chơi ngay'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* CREATE ROOM TAB */}
          {lobbyActionTab === 'create' && (
            <div className="space-y-4">
              {/* 3 Play Modes */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
                  Chế độ chơi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'solo', label: '1 người', desc: 'Luyện tập', icon: User },
                      { id: 'duo', label: '2 người', desc: 'Đối đầu', icon: Zap },
                      { id: 'multi', label: 'Nhiều người', desc: 'Cả lớp', icon: Users },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMode(m.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 mb-1 ${
                            active ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        />
                        <div className="text-xs font-extrabold text-slate-900">{m.label}</div>
                        <div className="text-[10px] text-slate-500">{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Room Code Customization */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-800">Mã phòng chơi</span>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setUseCustomCode(false)}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        !useCustomCode
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Ngẫu nhiên 6 ký tự
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseCustomCode(true)}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        useCustomCode
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Tùy chỉnh
                    </button>
                  </div>
                </div>

                {useCustomCode && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={12}
                      value={customRoomCode}
                      onChange={(e) =>
                        setCustomRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
                      }
                      placeholder="VD: TOAN10A"
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-sm font-bold uppercase text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomRoomCode(generateClientRoomCode())}
                      className="min-h-[38px] px-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                      title="Sinh mã ngẫu nhiên mới"
                    >
                      <Shuffle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Question Bank Source */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Bộ câu hỏi sử dụng ({activeQuestionPool.length} câu trắc nghiệm)
                </label>
                <select
                  value={sourceExamId}
                  onChange={(e) => setSourceExamId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                >
                  <option value="starter_mixed">
                    Bộ câu hỏi Khởi động Đa môn (10 câu có công thức Toán)
                  </option>
                  {eligibleExamOptions.map(({ exam, questions }) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title} ({questions.length} câu 1 đáp án)
                    </option>
                  ))}
                </select>

                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-600">Số câu hỏi trong trận:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={activeQuestionPool.length}
                      value={questionCount}
                      onChange={(e) =>
                        setQuestionCount(
                          Math.max(1, Math.min(activeQuestionPool.length, Number(e.target.value) || 1))
                        )
                      }
                      className="w-20 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 text-center font-bold tabular-nums"
                    />
                    <span className="text-slate-500">/ {activeQuestionPool.length}</span>
                  </div>
                </div>
              </div>

              {/* Time Limit Config */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Giới hạn thời gian</span>
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setTimeMode('per_question')}
                      className={`px-2 py-1 rounded-md cursor-pointer ${
                        timeMode === 'per_question'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Mỗi câu hỏi
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeMode('total_game')}
                      className={`px-2 py-1 rounded-md cursor-pointer ${
                        timeMode === 'total_game'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Tổng màn chơi
                    </button>
                  </div>
                </div>

                {timeMode === 'per_question' ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[10, 15, 20, 30, 45].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setQuestionTimeSec(sec)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums cursor-pointer ${
                          questionTimeSec === sec
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={questionTimeSec}
                        onChange={(e) =>
                          setQuestionTimeSec(Math.max(5, Math.min(300, Number(e.target.value) || 15)))
                        }
                        className="w-16 min-h-[34px] px-2 rounded-lg border border-slate-300 bg-white text-center text-xs font-bold tabular-nums"
                      />
                      <span className="text-xs text-slate-500">giây</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[120, 180, 300].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setTotalTimeSec(sec)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums cursor-pointer ${
                          totalTimeSec === sec
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {sec / 60} phút
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <input
                        type="number"
                        min={30}
                        max={3600}
                        value={totalTimeSec}
                        onChange={(e) =>
                          setTotalTimeSec(Math.max(30, Math.min(3600, Number(e.target.value) || 180)))
                        }
                        className="w-18 min-h-[34px] px-2 rounded-lg border border-slate-300 bg-white text-center text-xs font-bold tabular-nums"
                      />
                      <span className="text-xs text-slate-500">giây</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step Rewards & Mountain Summit Configuration */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">
                    Thưởng / phạt bước đi &amp; Đỉnh núi
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSummitSteps(20);
                      setRank1Bonus(4);
                      setRank2Bonus(3);
                      setBaseCorrectBonus(2);
                      setWrongPenalty(1);
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    Mặc định
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <label className="bg-white p-2 rounded-lg border border-slate-200 block">
                    <span className="text-slate-500 block">Số bậc đỉnh núi</span>
                    <input
                      type="number"
                      min={4}
                      max={60}
                      value={summitSteps}
                      onChange={(e) => setSummitSteps(Math.max(4, Math.min(60, Number(e.target.value) || 20)))}
                      className="w-full mt-0.5 font-extrabold text-slate-900 tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="bg-white p-2 rounded-lg border border-slate-200 block">
                    <span className="text-slate-500 block">Hạng 1 nhanh (+)</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={rank1Bonus}
                      onChange={(e) => setRank1Bonus(Math.max(1, Math.min(10, Number(e.target.value) || 4)))}
                      className="w-full mt-0.5 font-extrabold text-emerald-700 tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="bg-white p-2 rounded-lg border border-slate-200 block">
                    <span className="text-slate-500 block">Hạng 2 nhanh (+)</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={rank2Bonus}
                      onChange={(e) => setRank2Bonus(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                      className="w-full mt-0.5 font-extrabold text-blue-700 tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="bg-white p-2 rounded-lg border border-slate-200 block">
                    <span className="text-slate-500 block">Đúng cơ bản (+)</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={baseCorrectBonus}
                      onChange={(e) =>
                        setBaseCorrectBonus(Math.max(1, Math.min(10, Number(e.target.value) || 2)))
                      }
                      className="w-full mt-0.5 font-extrabold text-slate-900 tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="bg-white p-2 rounded-lg border border-slate-200 block col-span-2 sm:col-span-2">
                    <span className="text-slate-500 block">Trừ khi sai / hết giờ (-)</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={wrongPenalty}
                      onChange={(e) =>
                        setWrongPenalty(Math.max(0, Math.min(5, Number(e.target.value) || 0)))
                      }
                      className="w-full mt-0.5 font-extrabold text-rose-700 tabular-nums focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              {/* Create & Enter Room CTA */}
              <button
                type="button"
                disabled={busyAction}
                onClick={handleCreateRoom}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
              >
                <span>{selectedPet.emoji}</span>
                <span>
                  {busyAction
                    ? 'Đang mở phòng...'
                    : isTeacherView
                    ? 'Tạo phòng & Vào chơi ngay'
                    : 'Mở phòng & Vào chơi'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
