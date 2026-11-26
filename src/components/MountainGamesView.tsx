import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Eye,
  FileText,
  Flame,
  Gamepad2,
  Heart,
  HelpCircle,
  Home,
  Layers,
  Link2,
  LogOut,
  Medal,
  Mountain,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Upload,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  Classroom,
  Exam,
  MicroCourse,
  MountainQuestionItem,
  ObstacleGameConfig,
  ObstacleGameRoomState,
  ObstaclePlayMode,
  ObstaclePlayerState,
  ObstacleQuestionSourceType,
  UserAccount,
  UserRole,
} from '../types/exam';
import { publishCloudNotification } from '../utils/notificationsFirestore';
import {
  MOUNTAIN_PETS,
  MOUNTAIN_SAMPLE_DATASETS,
  getMountainPetById,
} from '../data/mountainPets';
import { RichContentRenderer } from './RichContentRenderer';
import {
  MountainMinimap,
  MountainProgressiveMap,
  MountainSpectatorMap,
} from './MountainClimbMap';
import {
  buildObstacleQuestionList,
  extractSingleChoiceFromCourse,
  extractSingleChoiceFromExam,
  extractTextFromUploadedDocument,
  parseQuizDocumentText,
} from '../utils/questionParsers';
import {
  computeStandardCompetitionRanking,
  createObstacleGameRoom,
  createStableGamePlayerId,
  finishObstacleGameRoom,
  joinObstacleGameRoom,
  leaveObstacleGameRoom,
  normalizeRoomCode,
  resetObstacleGameRoomToWaiting,
  startObstacleGameRoom,
  submitObstaclePlayerAnswer,
  subscribeObstacleGameRoom,
  validateWaitingGameRoom,
} from '../utils/gameRoomsFirestore';
import {
  getGameAudioMuted,
  playGameStartChime,
  playGameWrongSound,
  playPetClimbSound,
  playVictoryFanfareSound,
  setGameAudioMuted,
} from '../utils/gameAudio';
import { ensureCourseHydrated } from '../utils/storage';

interface MountainGamesViewProps {
  visibleExams: Exam[];
  visibleCourses?: MicroCourse[];
  classrooms?: Classroom[];
  currentUser: UserAccount | null;
  userRole: UserRole;
  initialRoomCode?: string;
  onRoomCodeChange?: (roomCode?: string) => void;
  onBackToHome: () => void;
}

type MainEntryTab = 'join' | 'create';
type FlowStep = 'step1_config' | 'step2_name' | 'step3_avatar' | 'waiting_room';
type JoinStep = 'enter_code' | 'step2_name' | 'step3_avatar' | 'waiting_room';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const DEFAULT_CONFIG: ObstacleGameConfig = {
  playMode: 'speed_race',
  questionTimeSec: 20,
  totalTimeSec: 300,
  sourceType: 'sample',
  sourceId: MOUNTAIN_SAMPLE_DATASETS[0].id,
  sourceTitle: MOUNTAIN_SAMPLE_DATASETS[0].title,
  obstacleCount: 8,
  correctPoints: 100,
  speedBonusMax: 50,
  wrongPointsPenalty: 25,
  timeBonusSec: 0,
  timePenaltySec: 0,
  wrongStepBack: 1,
  wrongCooldownSec: 2,
  survivalLives: 3,
  hostIsSpectator: false,
};

function formatClockSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getPlayModeLabel(mode: ObstaclePlayMode): string {
  if (mode === 'speed_race') return 'Đua tốc độ';
  if (mode === 'accuracy') return 'Tính điểm chuẩn xác';
  return 'Sinh tồn';
}

export const MountainGamesView: React.FC<MountainGamesViewProps> = ({
  visibleExams,
  visibleCourses = [],
  classrooms = [],
  currentUser,
  initialRoomCode,
  onRoomCodeChange,
  onBackToHome,
}) => {
  const myStablePlayerId = useMemo(
    () => createStableGamePlayerId(currentUser?.uid || currentUser?.id || 'guest'),
    [currentUser?.uid, currentUser?.id]
  );

  // --- Global UI & Audio State ---
  const [activeTab, setActiveTab] = useState<MainEntryTab>(() =>
    initialRoomCode ? 'join' : 'create'
  );
  const [createStep, setCreateStep] = useState<FlowStep>('step1_config');
  const [joinStep, setJoinStep] = useState<JoinStep>('enter_code');
  const [audioMuted, setAudioMuted] = useState<boolean>(() => getGameAudioMuted());
  const [busy, setBusy] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // --- Shared Room State (Synced live via Firestore onSnapshot) ---
  const [activeRoomCode, setActiveRoomCode] = useState<string>('');
  const [room, setRoom] = useState<ObstacleGameRoomState | null>(null);
  const [players, setPlayers] = useState<ObstaclePlayerState[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  // --- Join Tab Form State ---
  const [joinCodeInput, setJoinCodeInput] = useState<string>(() =>
    normalizeRoomCode(initialRoomCode || '')
  );
  const [verifiedJoinRoom, setVerifiedJoinRoom] = useState<ObstacleGameRoomState | null>(null);

  // --- Player Identity State (Steps 2 & 3) ---
  const [displayName, setDisplayName] = useState<string>(() => {
    const raw = currentUser?.fullName || currentUser?.name || currentUser?.username || '';
    return raw.trim().slice(0, 20);
  });
  const [selectedPetId, setSelectedPetId] = useState<string>(MOUNTAIN_PETS[0].id);

  // --- Host Step 1 Config State ---
  const [config, setConfig] = useState<ObstacleGameConfig>(DEFAULT_CONFIG);
  const [customRoomCode, setCustomRoomCode] = useState<string>('');
  const [pastedDocText, setPastedDocText] = useState<string>(
    `Câu 1: Giải phương trình $2x - 6 = 0$\nA. $x = 2$\nB. $x = 3$\nC. $x = -3$\nD. $x = 6$\nĐáp án: B\n\nCâu 2: Giá trị $\\sqrt{49}$ bằng bao nhiêu?\nA. $6$\nB. $7$\nC. $8$\nD. $9$\nĐáp án: B`
  );
  const [uploadedDocName, setUploadedDocName] = useState<string>('');

  // --- Room Sharing & QR ---
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [confirmEarlyEnd, setConfirmEarlyEnd] = useState<boolean>(false);
  const [inviteTargetScope, setInviteTargetScope] = useState<string>('all_students');
  const [sendingInviteNotif, setSendingInviteNotif] = useState<boolean>(false);

  // --- Gameplay Local Reaction & Timers ---
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [answeringLock, setAnsweringLock] = useState<boolean>(false);
  const [pushedBackNotice, setPushedBackNotice] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{
    isCorrect: boolean;
    isTimeout: boolean;
    selectedIndex: number;
    correctAnswerIndex: number;
    pointsDelta: number;
    timeDeltaSec: number;
    stageDelta: number;
    explanation?: string;
    explanationImageUrl?: string;
    inlineImages?: Record<string, string>;
    cooldownSec: number;
  } | null>(null);
  const timeoutSubmittedForStageRef = useRef<string>('');
  const finishTriggeredForMatchRef = useRef<string>('');
  const victorySoundPlayedRef = useRef<boolean>(false);
  const lastAutoHandledRoomCodeRef = useRef<string>('');

  // Helper toast
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Derived Question Pools for Step 1 Source Selector
  const examOptions = useMemo(() => {
    return visibleExams
      .map((ex) => ({
        exam: ex,
        questions: extractSingleChoiceFromExam(ex),
      }))
      .filter((item) => item.questions.length > 0);
  }, [visibleExams]);

  const [hydratedCoursesById, setHydratedCoursesById] = useState<Record<string, MicroCourse>>({});
  const [isHydratingGameCourses, setIsHydratingGameCourses] = useState(false);

  useEffect(() => {
    if (config.sourceType !== 'course') return;
    const unhydrated = visibleCourses.filter(
      (c) => c.schemaVersion === 2 && c.detailsLoaded === false && !hydratedCoursesById[c.id]
    );
    if (unhydrated.length === 0) return;
    let cancelled = false;
    setIsHydratingGameCourses(true);
    void Promise.all(
      unhydrated.map((c) => ensureCourseHydrated(c.id, c).catch(() => null))
    )
      .then((results) => {
        if (cancelled) return;
        const patch: Record<string, MicroCourse> = {};
        results.forEach((res) => {
          if (res?.id) patch[res.id] = res;
        });
        if (Object.keys(patch).length > 0) {
          setHydratedCoursesById((prev) => ({ ...prev, ...patch }));
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydratingGameCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.sourceType, visibleCourses, hydratedCoursesById]);

  const courseOptions = useMemo(() => {
    return visibleCourses
      .map((rawCourse) => {
        const course = hydratedCoursesById[rawCourse.id] || rawCourse;
        return {
          course,
          questions: extractSingleChoiceFromCourse(course, visibleExams),
        };
      })
      .filter((item) => item.questions.length > 0);
  }, [visibleCourses, visibleExams, hydratedCoursesById]);

  const parsedDocQuestions = useMemo(() => {
    return parseQuizDocumentText(pastedDocText, uploadedDocName || 'Tài liệu soạn thảo');
  }, [pastedDocText, uploadedDocName]);

  const activeSourcePool: MountainQuestionItem[] = useMemo(() => {
    if (config.sourceType === 'sample') {
      const ds =
        MOUNTAIN_SAMPLE_DATASETS.find((d) => d.id === config.sourceId) ||
        MOUNTAIN_SAMPLE_DATASETS[0];
      return ds.questions;
    }
    if (config.sourceType === 'exam') {
      const found =
        examOptions.find((e) => e.exam.id === config.sourceId) || examOptions[0];
      return found ? found.questions : [];
    }
    if (config.sourceType === 'course') {
      const found =
        courseOptions.find((c) => c.course.id === config.sourceId) || courseOptions[0];
      return found ? found.questions : [];
    }
    return parsedDocQuestions;
  }, [config.sourceType, config.sourceId, examOptions, courseOptions, parsedDocQuestions]);

  // Live Clock Tick during active room
  useEffect(() => {
    if (!room || room.status !== 'PLAYING') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [room?.status]);

  // Real-time Firestore room subscription + clean teardown on unmount or tab unload
  useEffect(() => {
    if (!activeRoomCode) return;
    const unsub = subscribeObstacleGameRoom(activeRoomCode, {
      onRoom: (nextRoom) => {
        setRoom(nextRoom);
        if (!nextRoom) {
          setErrorBanner('Phòng chơi đã đóng hoặc không còn tồn tại.');
          setActiveRoomCode('');
        }
      },
      onPlayers: (nextPlayers) => {
        setPlayers(nextPlayers);
      },
      onError: (err) => {
        console.error('Firestore room listener error:', err);
        setErrorBanner(
          'Không thể đồng bộ trạng thái phòng chơi. Vui lòng kiểm tra kết nối và thử lại.'
        );
      },
    });
    const handleBeforeUnload = () => {
      unsub();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      unsub();
    };
  }, [activeRoomCode]);

  // Sync URL room code cleanly
  useEffect(() => {
    if (onRoomCodeChange) {
      onRoomCodeChange(activeRoomCode || undefined);
    }
  }, [activeRoomCode, onRoomCodeChange]);

  // Generate QR code when in room
  useEffect(() => {
    const code = room?.code;
    if (!code) {
      setQrDataUrl('');
      return;
    }
    const url = `${window.location.origin}/tro-choi/${code}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then((data) => setQrDataUrl(data))
      .catch(() => setQrDataUrl(''));
  }, [room?.code]);

  const myPlayer = useMemo(
    () => players.find((p) => p.id === (myPlayerId || myStablePlayerId)) || null,
    [players, myPlayerId, myStablePlayerId]
  );

  const isRoomHost = Boolean(
    room && (room.hostUid === currentUser?.uid || room.hostUid === currentUser?.id)
  );
  const isSpectatorHost = Boolean(room && room.hostIsSpectator && isRoomHost);

  // Auto-finish room when ALL players finish OR global match timer expires (strictly once per match)
  useEffect(() => {
    if (!room || room.status !== 'PLAYING') {
      victorySoundPlayedRef.current = false;
      finishTriggeredForMatchRef.current = '';
      return;
    }

    const allDone =
      players.length > 0 && players.every((p) => p.finished || p.eliminated);
    const maxEffectiveEndsAt = players.reduce(
      (maxMs, p) => Math.max(maxMs, room.endsAtMs + (p.bonusTimeSec || 0) * 1000),
      room.endsAtMs
    );
    const totalExpired =
      room.config.totalTimeSec > 0 && room.endsAtMs > 0 && nowMs >= maxEffectiveEndsAt;

    if (!allDone && !totalExpired) return;

    const reason: 'all_finished' | 'timeout' = allDone ? 'all_finished' : 'timeout';
    const matchKey = `${room.code}_${room.startedAtMs}_${reason}`;
    if (finishTriggeredForMatchRef.current === matchKey) return;

    // Host updates immediately; non-host waits 1500ms fallback in case host disconnected
    if (isRoomHost) {
      finishTriggeredForMatchRef.current = matchKey;
      void finishObstacleGameRoom(room.code, reason).catch(() => {
        finishTriggeredForMatchRef.current = '';
      });
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      if (finishTriggeredForMatchRef.current === matchKey) return;
      finishTriggeredForMatchRef.current = matchKey;
      void finishObstacleGameRoom(room.code, reason).catch(() => {
        finishTriggeredForMatchRef.current = '';
      });
    }, 1500);
    return () => window.clearTimeout(fallbackTimer);
  }, [room, players, nowMs, isRoomHost]);

  // Play victory sound once on FINISHED
  useEffect(() => {
    if (room?.status === 'FINISHED' && !victorySoundPlayedRef.current) {
      victorySoundPlayedRef.current = true;
      playVictoryFanfareSound();
    }
  }, [room?.status]);

  // Auto-handle per-question timeout for active player
  useEffect(() => {
    if (!room || room.status !== 'PLAYING' || !myPlayer || isSpectatorHost) return;
    if (myPlayer.finished || myPlayer.eliminated) return;
    if (room.config.questionTimeSec <= 0) return;

    const cooldownLeft = Math.max(0, myPlayer.cooldownUntilMs - nowMs);
    if (cooldownLeft > 0) return;

    const qStart = myPlayer.questionStartedAtMs || room.startedAtMs;
    const elapsedSec = (nowMs - qStart) / 1000;
    const stageKey = `${room.code}_${room.startedAtMs}_${myPlayer.stageIndex}_${qStart}`;

    if (
      elapsedSec >= room.config.questionTimeSec &&
      !answeringLock &&
      timeoutSubmittedForStageRef.current !== stageKey
    ) {
      timeoutSubmittedForStageRef.current = stageKey;
      void handleSelectAnswer(-1);
    }
  }, [
    room?.code,
    room?.status,
    room?.startedAtMs,
    room?.config.questionTimeSec,
    myPlayer?.stageIndex,
    myPlayer?.questionStartedAtMs,
    myPlayer?.cooldownUntilMs,
    myPlayer?.finished,
    myPlayer?.eliminated,
    isSpectatorHost,
    answeringLock,
    nowMs,
  ]);

  const handleToggleAudio = () => {
    const next = !audioMuted;
    setAudioMuted(next);
    setGameAudioMuted(next);
  };

  // --- Document upload handler for Step 1 ---
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorBanner(null);
    try {
      const text = await extractTextFromUploadedDocument(file);
      setUploadedDocName(file.name);
      setPastedDocText(text);
      setConfig((prev) => ({
        ...prev,
        sourceType: 'document',
        sourceId: 'uploaded_doc',
        sourceTitle: file.name,
      }));
      showToast(`Đã nạp tài liệu "${file.name}".`);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Không thể đọc tệp tài liệu. Hãy thử tệp .docx, .txt hoặc .md.'
      );
    } finally {
      e.target.value = '';
    }
  };

  // --- Step validation & handlers ---
  const handleHostCreateRoom = async (asSpectator: boolean, playerName?: string, petId?: string) => {
    setErrorBanner(null);
    const questionList = buildObstacleQuestionList(activeSourcePool, config.obstacleCount);
    if (questionList.length === 0) {
      setErrorBanner('Nguồn câu hỏi hiện chưa có câu trắc nghiệm hợp lệ. Hãy kiểm tra lại bước cấu hình.');
      return;
    }

    const finalConfig: ObstacleGameConfig = {
      ...config,
      hostIsSpectator: asSpectator,
      obstacleCount: questionList.length,
    };

    const hostDisplay =
      playerName?.trim() ||
      currentUser?.fullName ||
      currentUser?.name ||
      currentUser?.username ||
      'Chủ trò';

    setBusy(true);
    try {
      const res = await createObstacleGameRoom({
        customCode: customRoomCode,
        hostName: hostDisplay,
        hostEmail: currentUser?.email || '',
        config: finalConfig,
        questions: questionList,
        competingPlayer: asSpectator
          ? undefined
          : {
              playerId: myStablePlayerId,
              name: hostDisplay,
              petId: petId || selectedPetId,
            },
      });
      setRoom(res.room);
      setActiveRoomCode(res.room.code);
      setMyPlayerId(res.playerId);
      setCreateStep('waiting_room');
      showToast(`Đã tạo phòng ${res.room.code} thành công!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể tạo phòng chơi.');
    } finally {
      setBusy(false);
    }
  };

  const handleStep1Next = async () => {
    setErrorBanner(null);
    if (activeSourcePool.length === 0) {
      setErrorBanner('Chưa có câu hỏi hợp lệ từ nguồn bạn chọn. Vui lòng chọn nguồn khác hoặc kiểm tra định dạng.');
      return;
    }
    if (config.hostIsSpectator) {
      // Bỏ qua bước nhập tên và chọn nhân vật -> tạo phòng ngay và chuyển thẳng tới Chờ phòng!
      await handleHostCreateRoom(true);
    } else {
      setCreateStep('step2_name');
    }
  };

  const validateDisplayName = (rawName: string, checkPlayersList: ObstaclePlayerState[]): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) return 'Tên hiển thị không được để trống.';
    if (trimmed.length < 2 || trimmed.length > 20) {
      return 'Tên hiển thị phải có độ dài từ 2 đến 20 ký tự.';
    }
    const dup = checkPlayersList.find(
      (p) =>
        p.id !== myStablePlayerId &&
        p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (dup) {
      return `Tên "${trimmed}" đã tồn tại trong phòng. Vui lòng chọn tên khác.`;
    }
    return null;
  };

  // --- Join Tab Actions ---
  const handleJoinValidateCode = async (overrideCode?: string) => {
    setErrorBanner(null);
    const code = normalizeRoomCode(overrideCode ?? joinCodeInput);
    if (code.length !== 6) {
      setErrorBanner('Mã phòng phải gồm đúng 6 ký tự chữ hoặc số.');
      return;
    }
    setBusy(true);
    try {
      const res = await validateWaitingGameRoom(code);
      setVerifiedJoinRoom(res.room);
      setPlayers(res.players);
      setJoinCodeInput(res.room.code);
      setJoinStep('step2_name');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Mã phòng không hợp lệ.');
    } finally {
      setBusy(false);
    }
  };

  // Auto-open join flow when arriving via deep link / notification (/tro-choi/CODE)
  useEffect(() => {
    const normalized = normalizeRoomCode(initialRoomCode || '');
    if (normalized.length !== 6) return;
    if (normalized === activeRoomCode || normalized === lastAutoHandledRoomCodeRef.current) return;
    lastAutoHandledRoomCodeRef.current = normalized;
    setActiveTab('join');
    setJoinCodeInput(normalized);
    setJoinStep('enter_code');
    void handleJoinValidateCode(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomCode]);

  const handleJoinFinishAndEnterWaiting = async () => {
    setErrorBanner(null);
    const targetCode = verifiedJoinRoom?.code || normalizeRoomCode(joinCodeInput);
    const nameErr = validateDisplayName(displayName, players);
    if (nameErr) {
      setErrorBanner(nameErr);
      setJoinStep('step2_name');
      return;
    }

    setBusy(true);
    try {
      const joinedPlayer = await joinObstacleGameRoom({
        roomCode: targetCode,
        playerId: myStablePlayerId,
        name: displayName.trim(),
        petId: selectedPetId,
      });
      if (verifiedJoinRoom) {
        setRoom(verifiedJoinRoom);
      }
      setPlayers((prev) => {
        const filtered = prev.filter((p) => p.id !== joinedPlayer.id);
        return [...filtered, joinedPlayer].sort((a, b) => a.joinedAtMs - b.joinedAtMs);
      });
      setMyPlayerId(myStablePlayerId);
      setActiveRoomCode(targetCode);
      setJoinStep('waiting_room');
      showToast(`Đã tham gia phòng ${targetCode}!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể vào phòng.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveCurrentRoom = async () => {
    setErrorBanner(null);
    const codeToLeave = room?.code || activeRoomCode;
    const pid = myPlayerId || myPlayer?.id;
    try {
      if (codeToLeave && pid) {
        await leaveObstacleGameRoom(codeToLeave, pid);
      }
    } catch {
      // Ignore cleanup failures
    } finally {
      setActiveRoomCode('');
      setRoom(null);
      setPlayers([]);
      setMyPlayerId(null);
      setVerifiedJoinRoom(null);
      setAnswerFeedback(null);
      setPushedBackNotice(null);
      setConfirmEarlyEnd(false);
      setCreateStep('step1_config');
      setJoinStep('enter_code');
    }
  };

  const handleStartMatch = async () => {
    if (!room) return;
    setErrorBanner(null);
    setBusy(true);
    try {
      await startObstacleGameRoom(room.code, room.config);
      playGameStartChime();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể bắt đầu trận đấu.');
    } finally {
      setBusy(false);
    }
  };

  const handleEndMatchEarly = async () => {
    if (!room) return;
    setBusy(true);
    try {
      await finishObstacleGameRoom(room.code, 'host_ended');
      setConfirmEarlyEnd(false);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể kết thúc trận sớm.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestartToWaiting = async () => {
    if (!room) return;
    setBusy(true);
    try {
      setAnswerFeedback(null);
      setPushedBackNotice(null);
      await resetObstacleGameRoomToWaiting(room.code, room.config);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể đặt lại phòng chờ.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAnswer = async (selectedIndex: number) => {
    if (!room || !myPlayer || answeringLock) return;
    if (room.status !== 'PLAYING' || myPlayer.finished || myPlayer.eliminated) return;
    const cooldownLeft = Math.max(0, myPlayer.cooldownUntilMs - Date.now());
    if (cooldownLeft > 0) return;

    const currentQ = room.questions[myPlayer.stageIndex];
    setAnsweringLock(true);
    setErrorBanner(null);

    try {
      const outcome = await submitObstaclePlayerAnswer({
        room,
        player: myPlayer,
        selectedIndex,
      });

      if (outcome.isCorrect) {
        playPetClimbSound(1);
        setPushedBackNotice(null);
      } else {
        playGameWrongSound();
        if (outcome.stageDelta < 0) {
          setPushedBackNotice(`Trả lời sai! Bị lùi ${Math.abs(outcome.stageDelta)} chặng — mở lại chặng cũ`);
        }
      }

      setAnswerFeedback({
        isCorrect: outcome.isCorrect,
        isTimeout: outcome.isTimeout,
        selectedIndex,
        correctAnswerIndex: outcome.correctAnswerIndex,
        pointsDelta: outcome.pointsDelta,
        timeDeltaSec: outcome.timeDeltaSec,
        stageDelta: outcome.stageDelta,
        explanation: currentQ?.explanation,
        explanationImageUrl: currentQ?.explanationImageUrl,
        inlineImages: currentQ?.inlineImages,
        cooldownSec: outcome.cooldownSec,
      });

      window.setTimeout(() => {
        setAnswerFeedback(null);
        setAnsweringLock(false);
      }, outcome.isCorrect ? 1100 : Math.max(1200, outcome.cooldownSec * 1000));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi khi gửi đáp án.');
      setAnsweringLock(false);
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Đã sao chép ${label}!`);
    } catch {
      showToast(`${label}: ${text}`);
    }
  };

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================
  const renderStep2NameView = (mode: 'create' | 'join') => {
    const trimmed = displayName.trim();
    const liveError = trimmed ? validateDisplayName(displayName, mode === 'join' ? players : []) : null;

    return (
      <div className="max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
              Bước 2 / {mode === 'create' ? '4' : '3'}
            </span>
            {mode === 'join' && verifiedJoinRoom && (
              <span className="px-2.5 py-0.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-extrabold">
                Phòng {verifiedJoinRoom.code} • {verifiedJoinRoom.questions.length} chặng
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Đặt tên hiển thị
          </h2>
          <p className="text-sm text-slate-600">
            Nhập tên từ 2 đến 20 ký tự để hiển thị trên màn hình chủ trò. Tiếp theo bạn sẽ chọn con vật đại diện.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Tên nhân vật leo núi
          </label>
          <input
            type="text"
            value={displayName}
            maxLength={20}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setErrorBanner(null);
            }}
            placeholder="Ví dụ: Minh Anh, Sóc Siêu Tốc..."
            data-testid="display-name-input"
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none text-base font-bold text-slate-900"
          />
          <div className="flex items-center justify-between text-xs">
            <span className={liveError ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
              {liveError || 'Tên hợp lệ để tham gia phòng.'}
            </span>
            <span className="font-bold text-slate-400 tabular-nums">
              {trimmed.length}/20
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setErrorBanner(null);
              if (mode === 'create') setCreateStep('step1_config');
              else {
                void handleLeaveCurrentRoom();
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>

          <button
            type="button"
            data-testid="step2-next-btn"
            onClick={() => {
              const err = validateDisplayName(displayName, mode === 'join' ? players : []);
              if (err) {
                setErrorBanner(err);
                return;
              }
              setErrorBanner(null);
              if (mode === 'create') setCreateStep('step3_avatar');
              else setJoinStep('step3_avatar');
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          >
            Tiếp theo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderStep3AvatarView = (mode: 'create' | 'join') => {
    const chosenPet = getMountainPetById(selectedPetId);

    return (
      <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                Bước 3 / {mode === 'create' ? '4' : '3'}
              </span>
              {mode === 'join' && verifiedJoinRoom && (
                <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-extrabold">
                  Phòng {verifiedJoinRoom.code}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Chọn con vật đại diện
            </h2>
            <p className="text-sm text-slate-600">
              Linh vật sẽ đại diện cho <span className="font-bold text-slate-900">{displayName.trim()}</span> và hiển thị ngay trên màn hình chủ trò khi vào phòng.
            </p>
          </div>

          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70">
            <span className="text-4xl leading-none" aria-hidden="true">
              {chosenPet.emoji}
            </span>
            <div>
              <div className="text-xs font-bold text-emerald-700">Đang chọn</div>
              <div className="text-sm font-extrabold text-slate-900">{chosenPet.name}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {MOUNTAIN_PETS.map((pet) => {
            const selected = pet.id === selectedPetId;
            return (
              <button
                key={pet.id}
                type="button"
                onClick={() => setSelectedPetId(pet.id)}
                data-testid={`pet-option-${pet.id}`}
                className={`relative flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                  selected
                    ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-400/40 shadow-md scale-[1.02]'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {selected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-2 border ${pet.bgClass} ${pet.borderClass}`}
                >
                  <span className="text-4xl leading-none" aria-hidden="true">
                    {pet.emoji}
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight">
                  {pet.name}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {pet.trait}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              setErrorBanner(null);
              if (mode === 'create') setCreateStep('step2_name');
              else setJoinStep('step2_name');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>

          <button
            type="button"
            disabled={busy}
            data-testid="step3-enter-waiting-btn"
            onClick={() => {
              if (mode === 'create') {
                void handleHostCreateRoom(false, displayName.trim(), selectedPetId);
              } else {
                void handleJoinFinishAndEnterWaiting();
              }
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-extrabold shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          >
            {busy ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {mode === 'create' ? 'Tạo phòng & Vào phòng chờ' : 'Vào phòng chờ'}
          </button>
        </div>
      </div>
    );
  };

  const handleSendRoomInviteNotification = async () => {
    if (!room) return;
    setSendingInviteNotif(true);
    setErrorBanner(null);
    try {
      const targetCls =
        inviteTargetScope !== 'all_students'
          ? classrooms.find((c) => c.id === inviteTargetScope)
          : undefined;
      const recipientEmails = targetCls
        ? Array.from(
            new Set(
              (targetCls.students || [])
                .map((s) => (s.email || '').trim().toLowerCase())
                .filter(Boolean)
            )
          )
        : undefined;
      if (targetCls && (!recipientEmails || recipientEmails.length === 0)) {
        setErrorBanner(`Lớp "${targetCls.name}" chưa có học sinh có email để gửi thông báo.`);
        return;
      }
      await publishCloudNotification({
        title: `Mời tham gia trò chơi Vượt chướng ngại vật (Phòng ${room.code})`,
        message: `${room.hostName} vừa mở phòng chơi "${room.config.sourceTitle}" (${room.questions.length} chặng). Nhấn để vào chọn con vật đại diện và thi đấu ngay!`,
        category: 'game',
        targetType: 'game_room',
        targetId: room.code,
        targetLabel: `Vào phòng ${room.code}`,
        classId: targetCls?.id,
        className: targetCls?.name,
        actionPath: `/tro-choi/${room.code}`,
        recipientScope: targetCls ? 'class' : 'students',
        recipientEmails,
        senderName: currentUser?.fullName || room.hostName,
        senderEmail: currentUser?.email || room.hostEmail || '',
      });
      showToast(
        targetCls
          ? `Đã gửi thông báo mời vào phòng ${room.code} tới lớp ${targetCls.name}!`
          : `Đã gửi thông báo mời vào phòng ${room.code} tới học sinh!`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Không thể gửi thông báo mời.');
    } finally {
      setSendingInviteNotif(false);
    }
  };

  // =========================================================================
  // STATE 1: WAITING ROOM (`WAITING`)
  // =========================================================================
  const isWaitingRoomVisible =
    Boolean(room && room.status === 'WAITING') &&
    (isRoomHost
      ? createStep === 'waiting_room'
      : joinStep === 'waiting_room' && Boolean(myPlayer || myPlayerId));

  if (room && room.status === 'WAITING' && isWaitingRoomVisible) {
    const inviteUrl = `${window.location.origin}/tro-choi/${room.code}`;
    const externalParticipantsCount = players.filter((p) => !p.isHost).length;
    const canStartMatch = isRoomHost && players.length >= 1;

    return (
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6" data-testid="waiting-room-view">
        {errorBanner && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Header: Room Code & Quick Copy */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-700">
              <Sparkles className="w-4 h-4" />
              <span>Phòng chờ trận đấu (WAITING)</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="text-3xl sm:text-4xl font-black tracking-[0.2em] text-slate-900 bg-slate-100 border border-slate-200 px-4 py-2 rounded-2xl tabular-nums select-all"
                data-testid="waiting-room-code"
              >
                {room.code}
              </span>
              <button
                type="button"
                onClick={() => handleCopyText(room.code, 'mã phòng')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                Sao chép mã
              </button>
              <button
                type="button"
                onClick={() => handleCopyText(inviteUrl, 'đường dẫn mời')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" />
                Link mời
              </button>
              {qrDataUrl && (
                <button
                  type="button"
                  onClick={() => setShowQrModal((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Mã QR
                </button>
              )}
            </div>

            {isRoomHost && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {classrooms.length > 0 && (
                  <select
                    value={inviteTargetScope}
                    onChange={(e) => setInviteTargetScope(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"
                  >
                    <option value="all_students">Gửi thông báo tới: Tất cả học sinh</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        Gửi thông báo tới: Lớp {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={sendingInviteNotif}
                  onClick={handleSendRoomInviteNotification}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {sendingInviteNotif ? 'Đang gửi...' : 'Gửi thông báo mời vào phòng'}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleLeaveCurrentRoom}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Rời phòng
            </button>

            {isRoomHost && canStartMatch ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleStartMatch}
                data-testid="start-match-btn"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-extrabold shadow-sm cursor-pointer whitespace-nowrap shrink-0 animate-in fade-in duration-150"
              >
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Bắt đầu ({players.length} người)
              </button>
            ) : isRoomHost ? (
              <span
                data-testid="waiting-for-participant-hint"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-extrabold"
              >
                <Users className="w-4 h-4" />
                Chờ ít nhất 1 người tham gia để hiện nút Bắt đầu ({externalParticipantsCount} đã vào)
              </span>
            ) : null}
          </div>
        </div>

        {showQrModal && qrDataUrl && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col sm:flex-row items-center gap-5 shadow-xs">
            <img src={qrDataUrl} alt="QR mời vào phòng" className="w-36 h-36 rounded-xl border border-slate-200" />
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-sm font-extrabold text-slate-900">Quét mã QR để vào nhanh phòng {room.code}</div>
              <div className="text-xs text-slate-500 break-all">{inviteUrl}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Match Config Summary */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Settings2 className="w-4 h-4 text-sky-700" />
              <h3 className="text-sm font-extrabold text-slate-900">Cấu hình trận đấu</h3>
            </div>
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-semibold">Chế độ chơi</dt>
                <dd className="font-extrabold text-slate-900">{getPlayModeLabel(room.config.playMode)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-semibold">Chướng ngại vật</dt>
                <dd className="font-extrabold text-slate-900 tabular-nums">{room.questions.length} chặng</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-semibold">Thời gian mỗi câu</dt>
                <dd className="font-extrabold text-slate-900 tabular-nums">
                  {room.config.questionTimeSec > 0 ? `${room.config.questionTimeSec} giây` : 'Không giới hạn'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-semibold">Tổng thời gian</dt>
                <dd className="font-extrabold text-slate-900 tabular-nums">
                  {room.config.totalTimeSec > 0 ? `${room.config.totalTimeSec} giây` : 'Không giới hạn'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-semibold">Thưởng trả lời đúng</dt>
                <dd className="font-extrabold text-emerald-700 tabular-nums">
                  +{room.config.correctPoints} điểm{room.config.timeBonusSec > 0 ? ` / +${room.config.timeBonusSec}s` : ''}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 font-semibold">Phạt trả lời sai</dt>
                <dd className="font-extrabold text-rose-700 tabular-nums">
                  -{room.config.wrongPointsPenalty} điểm
                  {room.config.wrongStepBack > 0 ? ` • Lùi ${room.config.wrongStepBack} chặng` : ''}
                  {room.config.wrongCooldownSec > 0 ? ` • Chờ ${room.config.wrongCooldownSec}s` : ''}
                </dd>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <dt className="text-slate-500 font-semibold mb-0.5">Nguồn bộ đề</dt>
                <dd className="font-bold text-slate-800">{room.config.sourceTitle}</dd>
              </div>
            </dl>
          </div>

          {/* Room Members List: Animal Avatar LEFT + Display Name RIGHT */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  Danh sách người trong phòng ({players.length} thi đấu)
                </h3>
              </div>
              {!isRoomHost && (
                <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg">
                  Đang chờ chủ trò bắt đầu...
                </span>
              )}
            </div>

            {room.hostIsSpectator && (
              <div
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border-2 border-amber-200 bg-amber-50/75"
                data-testid="host-observer-banner"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                    <Eye className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">{room.hostName}</div>
                    <div className="text-xs font-bold text-amber-800">Chủ trò đang quan sát</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-extrabold whitespace-nowrap shrink-0">
                  Chủ trò đang quan sát
                </span>
              </div>
            )}

            {players.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 py-10 px-4 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  Chưa có thí sinh nào vào phòng
                </p>
                <p className="text-xs text-slate-500">
                  Chia sẻ mã phòng <span className="font-extrabold text-slate-800">{room.code}</span> để học sinh tham gia từ tab "Vào phòng".
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {players.map((p) => {
                  const pet = getMountainPetById(p.petId);
                  const isSelf = p.id === (myPlayerId || myStablePlayerId);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3.5 p-3 rounded-2xl border-2 ${
                        isSelf
                          ? 'bg-emerald-50/70 border-emerald-400'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      {/* Con vật hóa thân bên TRÁI */}
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${pet.bgClass} ${pet.borderClass}`}
                      >
                        <span className="text-3xl leading-none" aria-hidden="true">
                          {pet.emoji}
                        </span>
                      </div>

                      {/* Tên hiển thị bên PHẢI */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-extrabold text-slate-900 truncate">
                            {p.name}
                          </span>
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold">
                              Bạn
                            </span>
                          )}
                          {p.isHost && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold">
                              Chủ trò
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 mt-0.5">
                          {pet.name} • Sẵn sàng
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE 2: ACTIVE GAMEPLAY (`PLAYING`)
  // =========================================================================
  if (room && room.status === 'PLAYING' && (isRoomHost || Boolean(myPlayer))) {
    const totalMatchLeftSec =
      room.config.totalTimeSec > 0 && room.endsAtMs > 0
        ? Math.max(
            0,
            Math.ceil(
              (room.endsAtMs + ((myPlayer && !isSpectatorHost ? myPlayer.bonusTimeSec : 0) || 0) * 1000 - nowMs) /
                1000
            )
          )
        : null;

    // -----------------------------------------------------------------------
    // B. CHẾ ĐỘ CHỦ TRÒ QUAN SÁT ("Chỉ quan sát ở bên ngoài")
    // -----------------------------------------------------------------------
    if (isSpectatorHost) {
      const sortedLive = computeStandardCompetitionRanking(players);
      return (
        <div className="max-w-7xl mx-auto px-4 py-5 space-y-5" data-testid="spectator-gameplay-view">
          {/* Top Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wide text-amber-700">
                  Chế độ Chủ trò quan sát • Phòng {room.code}
                </div>
                <div className="text-sm font-bold text-slate-700">
                  {getPlayModeLabel(room.config.playMode)} • {players.length} thí sinh đang thi đấu
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {totalMatchLeftSec !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-extrabold tabular-nums ${
                    totalMatchLeftSec <= 15
                      ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{formatClockSeconds(totalMatchLeftSec)}</span>
                </div>
              )}

              {!confirmEarlyEnd ? (
                <button
                  type="button"
                  onClick={() => setConfirmEarlyEnd(true)}
                  data-testid="end-match-early-btn"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-extrabold shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Square className="w-4 h-4" />
                  Kết thúc trận sớm
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-300 rounded-xl px-3 py-1.5">
                  <span className="text-xs font-bold text-rose-800 whitespace-nowrap">
                    Xác nhận kết thúc?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleEndMatchEarly}
                    data-testid="confirm-end-early-btn"
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-extrabold cursor-pointer whitespace-nowrap"
                  >
                    Kết thúc ngay
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmEarlyEnd(false)}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Dominant Panorama Map */}
          <MountainSpectatorMap
            players={players}
            totalObstacles={room.questions.length}
          />

          {/* Live Monitoring Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                Bảng theo dõi trực tiếp từng thí sinh
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                Tự động cập nhật thời gian thực
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">
                    <th className="py-3 px-4">Hạng</th>
                    <th className="py-3 px-4">Người chơi</th>
                    <th className="py-3 px-4">Chặng hiện tại</th>
                    <th className="py-3 px-4">Điểm</th>
                    <th className="py-3 px-4">Số câu đúng</th>
                    <th className="py-3 px-4">Số câu sai</th>
                    <th className="py-3 px-4">Số lần sai</th>
                    <th className="py-3 px-4">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {sortedLive.map(({ player: p, rank }) => {
                    const pet = getMountainPetById(p.petId);
                    const inCooldown = p.cooldownUntilMs > nowMs;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-extrabold text-slate-900 tabular-nums">
                          #{rank}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl leading-none" aria-hidden="true">
                              {pet.emoji}
                            </span>
                            <span className="font-bold text-slate-900">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 tabular-nums">
                          {p.stageIndex}/{room.questions.length}
                        </td>
                        <td className="py-3 px-4 font-extrabold text-emerald-700 tabular-nums">
                          {p.score}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-700 tabular-nums">
                          {p.correctQuestionsCount}
                        </td>
                        <td className="py-3 px-4 font-bold text-rose-600 tabular-nums">
                          {p.wrongQuestionsCount}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 tabular-nums">
                          {p.totalWrongAttempts}
                        </td>
                        <td className="py-3 px-4">
                          {p.eliminated ? (
                            <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold whitespace-nowrap">
                              Bị loại
                            </span>
                          ) : p.finished ? (
                            <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold whitespace-nowrap">
                              Đã về đích
                            </span>
                          ) : inCooldown ? (
                            <span className="px-2 py-1 rounded-lg bg-orange-100 text-orange-800 text-xs font-bold whitespace-nowrap">
                              Đang chờ phạt
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold whitespace-nowrap">
                              Đang leo núi
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // -----------------------------------------------------------------------
    // A. CHẾ ĐỘ NGƯỜI CHƠI (VÀ CHỦ TRÒ THAM GIA THI ĐẤU)
    // -----------------------------------------------------------------------
    const totalStages = room.questions.length;
    const currentStageIndex = myPlayer?.stageIndex ?? 0;
    const currentQuestion =
      currentStageIndex < totalStages ? room.questions[currentStageIndex] : null;

    const cooldownLeftSec = myPlayer
      ? Math.max(0, Math.ceil((myPlayer.cooldownUntilMs - nowMs) / 1000))
      : 0;

    const questionTimeLeftSec =
      room.config.questionTimeSec > 0 && myPlayer
        ? Math.max(
            0,
            Math.ceil(
              room.config.questionTimeSec -
                Math.max(0, (nowMs - (myPlayer.questionStartedAtMs || room.startedAtMs)) / 1000)
            )
          )
        : null;

    return (
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-4" data-testid="player-gameplay-view">
        {/* Top Info Bar: Đồng hồ đếm ngược, Điểm hiện tại, Tiến độ chặng */}
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
            {/* Clock(s) */}
            {(totalMatchLeftSec !== null || questionTimeLeftSec !== null) && (
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-extrabold tabular-nums ${
                  (questionTimeLeftSec !== null && questionTimeLeftSec <= 5) ||
                  (totalMatchLeftSec !== null && totalMatchLeftSec <= 15)
                    ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
                }`}
                data-testid="gameplay-countdown-clock"
              >
                <Timer className="w-4 h-4 shrink-0" />
                {questionTimeLeftSec !== null && (
                  <span>Câu: {questionTimeLeftSec}s</span>
                )}
                {questionTimeLeftSec !== null && totalMatchLeftSec !== null && (
                  <span className="text-slate-300">|</span>
                )}
                {totalMatchLeftSec !== null && (
                  <span>Trận: {formatClockSeconds(totalMatchLeftSec)}</span>
                )}
              </div>
            )}

            {/* Current Score */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-extrabold tabular-nums"
              data-testid="gameplay-score-badge"
            >
              <Award className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Điểm: {myPlayer?.score ?? 0}</span>
            </div>

            {/* Stage Progress */}
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-extrabold tabular-nums"
              data-testid="gameplay-stage-badge"
            >
              <Mountain className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {myPlayer?.finished && !myPlayer?.eliminated
                  ? `Đích ${totalStages}/${totalStages}`
                  : `Chặng ${Math.min(totalStages, currentStageIndex + 1)}/${totalStages}`}
              </span>
            </div>

            {/* Lives indicator for Survival mode */}
            {room.config.playMode === 'survival' && myPlayer && (
              <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-extrabold tabular-nums">
                <Heart className="w-4 h-4 fill-rose-500 text-rose-600 shrink-0" />
                <span>{myPlayer.lives} mạng</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAudio}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
              title={audioMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {isRoomHost && (
              <button
                type="button"
                onClick={handleEndMatchEarly}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
                Kết thúc sớm
              </button>
            )}
          </div>
        </div>

        {/* Map Row: Map 1 (Minimap Top-Left, Collapsed by Default) + Map 2 (Main Progressive Track) */}
        <div className="flex flex-col lg:flex-row items-start gap-4">
          {/* Map 1 - Top Left */}
          <MountainMinimap
            players={players}
            totalObstacles={totalStages}
            currentPlayerId={myPlayer?.id}
          />

          {/* Map 2 - Progressive Road */}
          <div className="w-full flex-1 min-w-0">
            <MountainProgressiveMap
              players={players}
              totalObstacles={totalStages}
              currentPlayerId={myPlayer?.id}
              pushedBackNotice={pushedBackNotice}
            />
          </div>
        </div>

        {/* Question & Interaction Zone */}
        {myPlayer?.eliminated ? (
          <div className="bg-white rounded-3xl border-2 border-rose-200 p-8 text-center space-y-3 shadow-xs">
            <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto" />
            <h3 className="text-xl font-extrabold text-slate-900">
              Bạn đã hết mạng trong chế độ Sinh tồn
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Bạn đạt {myPlayer.score} điểm tại Chặng {myPlayer.stageIndex}/{totalStages}. Hệ thống sẽ hiển thị bảng tổng kết ngay khi các thí sinh còn lại hoàn tất!
            </p>
          </div>
        ) : myPlayer?.finished ? (
          <div className="bg-white rounded-3xl border-2 border-emerald-300 p-8 text-center space-y-3 shadow-xs">
            <Trophy className="w-12 h-12 text-amber-500 mx-auto" />
            <h3 className="text-xl font-extrabold text-slate-900">
              Tuyệt vời! Bạn đã vượt qua tất cả {totalStages} chướng ngại vật!
            </h3>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Tổng điểm hiện tại: <span className="font-extrabold text-emerald-700">{myPlayer.score} điểm</span>. Vui lòng chờ các thí sinh khác hoàn thành hoặc xem trực tiếp trên bản đồ tổng quát.
            </p>
          </div>
        ) : currentQuestion ? (
          <div
            className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-sm space-y-5"
            data-testid="question-interaction-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-900 text-xs font-extrabold tabular-nums">
                  Chướng ngại vật {currentStageIndex + 1}/{totalStages}
                </span>
                {currentQuestion.sourceTitle && (
                  <span className="text-xs font-semibold text-slate-500 truncate max-w-[240px]">
                    {currentQuestion.sourceTitle}
                  </span>
                )}
              </div>

              {cooldownLeftSec > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 text-xs font-extrabold animate-pulse tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  Chờ phạt {cooldownLeftSec}s trước khi thử lại...
                </span>
              )}
            </div>

            {/* Prompt with KaTeX support */}
            <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed">
              <RichContentRenderer
                content={currentQuestion.question}
                imageUrl={currentQuestion.imageUrl}
                inlineImages={currentQuestion.inlineImages}
              />
            </div>

            {/* Feedback Banner on Answer */}
            {answerFeedback && (
              <div
                data-testid="answer-feedback-banner"
                className={`rounded-2xl border-2 p-4 space-y-2 transition-all ${
                  answerFeedback.isCorrect
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : 'bg-rose-50 border-rose-400 text-rose-950'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base">
                    {answerFeedback.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>Chính xác! Vượt chướng ngại vật thành công!</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>
                          {answerFeedback.isTimeout ? 'Hết thời gian câu hỏi!' : 'Chưa chính xác!'}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold tabular-nums">
                    <span
                      className={`px-2 py-0.5 rounded-md ${
                        answerFeedback.pointsDelta >= 0
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {answerFeedback.pointsDelta >= 0
                        ? `+${answerFeedback.pointsDelta}`
                        : answerFeedback.pointsDelta}{' '}
                      điểm
                    </span>
                    {answerFeedback.stageDelta !== 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white">
                        {answerFeedback.stageDelta > 0
                          ? `+${answerFeedback.stageDelta} chặng`
                          : `Lùi ${Math.abs(answerFeedback.stageDelta)} chặng`}
                      </span>
                    )}
                    {answerFeedback.timeDeltaSec !== 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-700 text-white">
                        {answerFeedback.timeDeltaSec > 0
                          ? `+${answerFeedback.timeDeltaSec}s`
                          : `${answerFeedback.timeDeltaSec}s`}
                      </span>
                    )}
                  </div>
                </div>

                {(answerFeedback.explanation || answerFeedback.explanationImageUrl) && (
                  <div className="text-xs sm:text-sm text-slate-700 pt-1 border-t border-black/10">
                    <RichContentRenderer
                      content={answerFeedback.explanation || ''}
                      imageUrl={answerFeedback.explanationImageUrl}
                      inlineImages={answerFeedback.inlineImages || currentQuestion.inlineImages}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentQuestion.options.map((opt, idx) => {
                const isSelected = answerFeedback?.selectedIndex === idx;
                const isCorrectOpt = answerFeedback?.correctAnswerIndex === idx;
                const disabled = answeringLock || cooldownLeftSec > 0;

                let btnStyle =
                  'bg-slate-50/75 hover:bg-sky-50 border-slate-200 hover:border-sky-400 text-slate-900';
                if (answerFeedback) {
                  if (isCorrectOpt) {
                    btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-300';
                  } else if (isSelected && !answerFeedback.isCorrect) {
                    btnStyle = 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-300';
                  } else {
                    btnStyle = 'bg-slate-50 border-slate-200 opacity-65';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelectAnswer(idx)}
                    data-testid={`answer-option-${idx}`}
                    className={`group flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all cursor-pointer disabled:cursor-not-allowed ${btnStyle}`}
                  >
                    <span
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 border ${
                        answerFeedback && isCorrectOpt
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : answerFeedback && isSelected && !answerFeedback.isCorrect
                            ? 'bg-rose-600 border-rose-700 text-white'
                            : 'bg-white border-slate-300 text-slate-800 group-hover:border-sky-500 group-hover:text-sky-700'
                      }`}
                    >
                      {OPTION_LETTERS[idx] || idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 text-sm sm:text-base font-semibold pt-0.5">
                      <RichContentRenderer content={opt} inlineImages={currentQuestion.inlineImages} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // =========================================================================
  // STATE 3: SUMMARY SCREEN (`FINISHED`)
  // =========================================================================
  if (room && room.status === 'FINISHED' && (isRoomHost || Boolean(myPlayer))) {
    const rankedList = computeStandardCompetitionRanking(players);
    const podiumTop = rankedList.slice(0, 3);

    return (
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-7" data-testid="finished-summary-view">
        {/* Finish Banner */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 text-amber-600 flex items-center justify-center shrink-0">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
                Tổng kết trận đấu • Phòng {room.code}
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                Kết quả Vượt chướng ngại vật
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                {room.finishReason === 'host_ended'
                  ? 'Chủ trò đã kết thúc trận đấu.'
                  : room.finishReason === 'timeout'
                    ? 'Đã hết tổng thời gian trận đấu.'
                    : 'Tất cả người chơi đã hoàn thành hành trình.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isRoomHost && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRestartToWaiting}
                data-testid="play-again-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Chơi lại (Về phòng chờ)
              </button>
            )}
            <button
              type="button"
              onClick={handleLeaveCurrentRoom}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Thoát phòng
            </button>
          </div>
        </div>

        {/* MỤC 1: BẢNG TỔNG KẾT CHUNG (Podium + Bảng xếp hạng chuẩn Standard Competition Ranking 1, 1, 3) */}
        <section className="space-y-4" data-testid="summary-general-section">
          <div className="flex items-center gap-2">
            <Medal className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              1. Bảng tổng kết chung
            </h3>
          </div>

          {/* Podium Cards */}
          {podiumTop.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {podiumTop.map(({ player: p, rank }) => {
                const pet = getMountainPetById(p.petId);
                const rankStyle =
                  rank === 1
                    ? 'bg-linear-to-b from-amber-50 to-white border-amber-400 ring-2 ring-amber-200'
                    : rank === 2
                      ? 'bg-linear-to-b from-slate-50 to-white border-slate-300'
                      : 'bg-linear-to-b from-orange-50/70 to-white border-orange-300';
                return (
                  <div
                    key={p.id}
                    data-testid={`podium-card-rank-${rank}`}
                    className={`rounded-3xl border-2 p-5 shadow-xs flex flex-col items-center text-center gap-3 ${rankStyle}`}
                  >
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-black tabular-nums">
                      {rank === 1 && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                      <span>Hạng {rank}</span>
                    </div>
                    <div
                      className={`w-20 h-20 rounded-2xl flex items-center justify-center border-2 shadow-sm ${pet.bgClass} ${pet.borderClass}`}
                    >
                      <span className="text-5xl leading-none" aria-hidden="true">
                        {pet.emoji}
                      </span>
                    </div>
                    <div>
                      <div className="text-base font-extrabold text-slate-900">{p.name}</div>
                      <div className="text-xs font-semibold text-slate-500">{pet.name}</div>
                    </div>
                    <div className="w-full pt-2 border-t border-slate-100 flex items-center justify-around text-xs">
                      <div>
                        <div className="text-slate-400 font-semibold">Tổng điểm</div>
                        <div className="text-lg font-black text-emerald-700 tabular-nums">
                          {p.score}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-semibold">Tiến độ</div>
                        <div className="text-lg font-black text-slate-900 tabular-nums">
                          {p.stageIndex}/{room.questions.length}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Leaderboard */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase text-slate-600">
                    <th className="py-3.5 px-4">Thứ hạng</th>
                    <th className="py-3.5 px-4">Thí sinh</th>
                    <th className="py-3.5 px-4">Chặng đạt được</th>
                    <th className="py-3.5 px-4">Tổng điểm</th>
                    <th className="py-3.5 px-4">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {rankedList.map(({ player: p, rank }) => {
                    const pet = getMountainPetById(p.petId);
                    const isSelf = p.id === (myPlayerId || myStablePlayerId);
                    return (
                      <tr
                        key={p.id}
                        data-testid={`leaderboard-row-${p.id}`}
                        className={isSelf ? 'bg-emerald-50/50' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-3.5 px-4 font-black text-slate-900 tabular-nums">
                          #{rank}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl leading-none" aria-hidden="true">
                              {pet.emoji}
                            </span>
                            <span className="font-extrabold text-slate-900">{p.name}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold">
                                Bạn
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-700 tabular-nums">
                          {p.stageIndex}/{room.questions.length}
                        </td>
                        <td className="py-3.5 px-4 font-black text-emerald-700 tabular-nums">
                          {p.score}
                        </td>
                        <td className="py-3.5 px-4">
                          {p.eliminated ? (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold whitespace-nowrap">
                              Hết mạng
                            </span>
                          ) : p.finished ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold whitespace-nowrap">
                              Về đích
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold whitespace-nowrap">
                              Chưa về đích
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* MỤC 2: BẢNG THỐNG KÊ CHI TIẾT */}
        <section className="space-y-4" data-testid="summary-detailed-stats-section">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-700" />
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              2. Bảng thống kê chi tiết
            </h3>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase text-slate-600">
                    <th className="py-3.5 px-4">Thí sinh</th>
                    <th className="py-3.5 px-4">Số câu đúng / sai</th>
                    <th className="py-3.5 px-4">Tổng số lần trả lời đúng / sai</th>
                    <th className="py-3.5 px-4">Tỉ lệ đúng / sai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {rankedList.map(({ player: p, accuracyPercent, wrongPercent }) => {
                    const pet = getMountainPetById(p.petId);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl leading-none" aria-hidden="true">
                              {pet.emoji}
                            </span>
                            <div>
                              <div className="font-extrabold text-slate-900">{p.name}</div>
                              <div className="text-xs text-slate-500">{pet.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 tabular-nums">
                          <div className="flex items-center gap-2 font-extrabold">
                            <span className="text-emerald-700">{p.correctQuestionsCount} đúng</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-rose-600">{p.wrongQuestionsCount} sai</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 tabular-nums">
                          <div className="flex items-center gap-2 font-extrabold">
                            <span className="text-emerald-700">{p.totalCorrectAttempts} lần đúng</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-rose-600">{p.totalWrongAttempts} lần sai</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 min-w-[200px] tabular-nums">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-extrabold">
                              <span className="text-emerald-700">{accuracyPercent}% đúng</span>
                              <span className="text-rose-600">{wrongPercent}% sai</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-rose-200 overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${accuracyPercent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // START SCREEN: 2 TABS ("Vào phòng" & "Vượt chướng ngại vật")
  // =========================================================================
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              Trò chơi tương tác
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Tham gia phòng đang mở hoặc tạo trận đấu Vượt chướng ngại vật thời gian thực.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleAudio}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            title={audioMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Home className="w-4 h-4" />
            Trang chủ
          </button>
        </div>
      </div>

      {/* Mandatory 2-Tab Navigation */}
      <div
        role="tablist"
        aria-label="Chế độ trò chơi"
        className="inline-flex p-1.5 rounded-2xl bg-slate-100 border border-slate-200 gap-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'join'}
          data-testid="tab-join-room"
          onClick={() => {
            setActiveTab('join');
            setErrorBanner(null);
          }}
          className={`px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 ${
            activeTab === 'join'
              ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Vào phòng
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'create'}
          data-testid="tab-create-obstacle"
          onClick={() => {
            setActiveTab('create');
            setErrorBanner(null);
          }}
          className={`px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 ${
            activeTab === 'create'
              ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Mountain className="w-4 h-4" />
          Vượt chướng ngại vật
        </button>
      </div>

      {/* Inline Toast / Error */}
      {toastMsg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {errorBanner && (
        <div
          data-testid="games-error-banner"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* TAB 1: VÀO PHÒNG */}
      {activeTab === 'join' && (
        <div className="space-y-6">
          {joinStep === 'enter_code' && (
            <div className="max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900">
                  Nhập mã phòng để tham gia
                </h2>
                <p className="text-sm text-slate-600">
                  Nhập mã gồm 6 ký tự chữ/số do chủ trò cung cấp. Chỉ phòng đang ở trạng thái chờ (<span className="font-bold">WAITING</span>) mới có thể tham gia.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Mã phòng (6 ký tự, tự động viết hoa)
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  maxLength={6}
                  onChange={(e) => {
                    setJoinCodeInput(normalizeRoomCode(e.target.value));
                    setErrorBanner(null);
                  }}
                  placeholder="VD: AB12CD"
                  data-testid="join-room-code-input"
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-slate-200 focus:border-sky-500 focus:outline-none text-center text-2xl font-black tracking-[0.28em] uppercase text-slate-900 tabular-nums"
                />
              </div>

              <button
                type="button"
                disabled={busy || joinCodeInput.length !== 6}
                onClick={() => void handleJoinValidateCode()}
                data-testid="join-continue-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-extrabold shadow-xs cursor-pointer"
              >
                {busy ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                Tiếp tục
              </button>
            </div>
          )}

          {joinStep === 'step2_name' && renderStep2NameView('join')}
          {joinStep === 'step3_avatar' && renderStep3AvatarView('join')}
        </div>
      )}

      {/* TAB 2: VƯỢT CHƯỚNG NGẠI VẬT (STEP-BY-STEP WIZARD) */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Wizard Stepper Progress Header */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'step1_config', num: 1, label: 'Cấu hình trận đấu', skipped: false },
                { key: 'step2_name', num: 2, label: 'Đặt tên hiển thị', skipped: config.hostIsSpectator },
                { key: 'step3_avatar', num: 3, label: 'Chọn nhân vật', skipped: config.hostIsSpectator },
                { key: 'waiting_room', num: 4, label: 'Chờ phòng', skipped: false },
              ].map((st) => {
                const isActive = createStep === st.key;
                return (
                  <div
                    key={st.key}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-bold ${
                      isActive
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                        : st.skipped
                          ? 'bg-slate-50 border-dashed border-slate-200 text-slate-400'
                          : 'bg-slate-50/60 border-slate-200 text-slate-600'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center font-black shrink-0 ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      {st.num}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate">{st.label}</div>
                      {st.skipped && (
                        <div className="text-[10px] font-semibold">Bỏ qua khi quan sát</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bước 1: Cấu hình trận đấu */}
          {createStep === 'step1_config' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-7">
              {/* 1. Chế độ chơi & Vai trò chủ trò */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Play Mode */}
                <div className="space-y-3">
                  <label className="block text-sm font-extrabold text-slate-900">
                    1. Chế độ chơi
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      {
                        id: 'speed_race' as ObstaclePlayMode,
                        title: 'Đua tốc độ',
                        desc: 'Cộng thưởng tốc độ khi trả lời nhanh',
                        icon: <Zap className="w-4 h-4 text-amber-600" />,
                      },
                      {
                        id: 'accuracy' as ObstaclePlayMode,
                        title: 'Chuẩn xác',
                        desc: 'Tối đa điểm số chuẩn từng chặng',
                        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
                      },
                      {
                        id: 'survival' as ObstaclePlayMode,
                        title: 'Sinh tồn',
                        desc: 'Giới hạn số mạng, sai hết mạng bị loại',
                        icon: <Flame className="w-4 h-4 text-rose-600" />,
                      },
                    ].map((m) => {
                      const active = config.playMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setConfig((p) => ({ ...p, playMode: m.id }))}
                          data-testid={`mode-${m.id}`}
                          className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer space-y-1 ${
                            active
                              ? 'bg-emerald-50/70 border-emerald-500 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-extrabold text-xs sm:text-sm text-slate-900">
                            {m.icon}
                            <span>{m.title}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">{m.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Host Role */}
                <div className="space-y-3">
                  <label className="block text-sm font-extrabold text-slate-900">
                    2. Vai trò của chủ trò
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setConfig((p) => ({ ...p, hostIsSpectator: false }))}
                      data-testid="host-role-compete"
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer space-y-1 ${
                        !config.hostIsSpectator
                          ? 'bg-emerald-50/70 border-emerald-500 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900">
                        <UserCheck className="w-4 h-4 text-emerald-700" />
                        <span>Tham gia thi đấu</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Chủ trò đặt tên, chọn nhân vật và cùng leo núi thi đấu.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfig((p) => ({ ...p, hostIsSpectator: true }))}
                      data-testid="host-role-observer"
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer space-y-1 ${
                        config.hostIsSpectator
                          ? 'bg-amber-50/80 border-amber-500 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-extrabold text-sm text-slate-900">
                        <Eye className="w-4 h-4 text-amber-700" />
                        <span>Chỉ quan sát ở bên ngoài</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Tạo phòng ngay, theo dõi toàn cảnh bản đồ & bảng thống kê trực tiếp.
                      </p>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Thời gian & Mã phòng tùy chỉnh */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-slate-700">
                    Thời gian mỗi câu (giây, 0 = không giới hạn)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    {[0, 10, 15, 20, 30].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setConfig((p) => ({ ...p, questionTimeSec: sec }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer tabular-nums ${
                          config.questionTimeSec === sec
                            ? 'bg-sky-600 text-white border-sky-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sec === 0 ? 'Không giới hạn' : `${sec}s`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={config.questionTimeSec}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, questionTimeSec: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold tabular-nums"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-slate-700">
                    Tổng thời gian trận (giây, 0 = không giới hạn)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    {[0, 180, 300, 600].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setConfig((p) => ({ ...p, totalTimeSec: sec }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer tabular-nums ${
                          config.totalTimeSec === sec
                            ? 'bg-sky-600 text-white border-sky-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sec === 0 ? 'Không giới hạn' : `${sec / 60} phút`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={config.totalTimeSec}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, totalTimeSec: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold tabular-nums"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-slate-700">
                    Mã phòng tùy chỉnh (tùy chọn 6 ký tự)
                  </label>
                  <input
                    type="text"
                    value={customRoomCode}
                    maxLength={6}
                    onChange={(e) => setCustomRoomCode(normalizeRoomCode(e.target.value))}
                    placeholder="Bỏ trống = tạo ngẫu nhiên"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-extrabold uppercase tracking-widest"
                  />
                  <p className="text-[11px] text-slate-500">
                    Để trống hệ thống tự sinh mã 6 ký tự ngẫu nhiên.
                  </p>
                </div>
              </div>

              {/* 4. Nguồn bộ đề (Mở rộng: Mẫu có sẵn / Ngân hàng đề / Khóa học / Tải & dán tài liệu) */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-sm font-extrabold text-slate-900">
                    3. Nguồn bộ đề & Số lượng chướng ngại vật
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Số chướng ngại vật:</span>
                    {[5, 8, 10, 12].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setConfig((p) => ({ ...p, obstacleCount: cnt }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border cursor-pointer tabular-nums ${
                          config.obstacleCount === cnt
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={3}
                      max={30}
                      value={config.obstacleCount}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          obstacleCount: Math.max(3, Math.min(30, Number(e.target.value) || 8)),
                        }))
                      }
                      className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs font-extrabold text-center tabular-nums"
                    />
                  </div>
                </div>

                {/* Source Type Tabs */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'sample' as ObstacleQuestionSourceType, label: 'Bộ dữ liệu mẫu (KaTeX)', icon: <Sparkles className="w-3.5 h-3.5" /> },
                    { id: 'exam' as ObstacleQuestionSourceType, label: `Ngân hàng đề (${examOptions.length})`, icon: <BookOpen className="w-3.5 h-3.5" /> },
                    { id: 'course' as ObstacleQuestionSourceType, label: `Khóa học (${courseOptions.length})`, icon: <Layers className="w-3.5 h-3.5" /> },
                    { id: 'document' as ObstacleQuestionSourceType, label: 'Tải / Dán tài liệu', icon: <FileText className="w-3.5 h-3.5" /> },
                  ].map((src) => {
                    const active = config.sourceType === src.id;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => {
                          let nextId = config.sourceId;
                          let nextTitle = config.sourceTitle;
                          if (src.id === 'sample') {
                            nextId = MOUNTAIN_SAMPLE_DATASETS[0].id;
                            nextTitle = MOUNTAIN_SAMPLE_DATASETS[0].title;
                          } else if (src.id === 'exam' && examOptions[0]) {
                            nextId = examOptions[0].exam.id;
                            nextTitle = examOptions[0].exam.title;
                          } else if (src.id === 'course' && courseOptions[0]) {
                            nextId = courseOptions[0].course.id;
                            nextTitle = courseOptions[0].course.title;
                          } else if (src.id === 'document') {
                            nextId = 'uploaded_doc';
                            nextTitle = uploadedDocName || 'Tài liệu tùy chỉnh';
                          }
                          setConfig((p) => ({
                            ...p,
                            sourceType: src.id,
                            sourceId: nextId,
                            sourceTitle: nextTitle,
                          }));
                        }}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-sky-600 text-white border-sky-700 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {src.icon}
                        <span>{src.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Source Content Selector */}
                {config.sourceType === 'sample' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {MOUNTAIN_SAMPLE_DATASETS.map((ds) => {
                      const selected = config.sourceId === ds.id;
                      return (
                        <button
                          key={ds.id}
                          type="button"
                          onClick={() =>
                            setConfig((p) => ({
                              ...p,
                              sourceId: ds.id,
                              sourceTitle: ds.title,
                            }))
                          }
                          className={`p-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                            selected
                              ? 'bg-sky-50 border-sky-500 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-extrabold text-slate-900">{ds.title}</div>
                          <p className="text-[11px] text-slate-500 mt-1">{ds.subtitle}</p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {config.sourceType === 'exam' && (
                  <div className="space-y-2">
                    {examOptions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                        Chưa có đề thi trắc nghiệm nào trong ngân hàng đề. Hãy dùng Bộ dữ liệu mẫu hoặc dán tài liệu.
                      </div>
                    ) : (
                      <select
                        value={config.sourceId}
                        onChange={(e) => {
                          const found = examOptions.find((x) => x.exam.id === e.target.value);
                          if (found) {
                            setConfig((p) => ({
                              ...p,
                              sourceId: found.exam.id,
                              sourceTitle: found.exam.title,
                            }));
                          }
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900"
                      >
                        {examOptions.map((item) => (
                          <option key={item.exam.id} value={item.exam.id}>
                            {item.exam.title} ({item.questions.length} câu trắc nghiệm)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {config.sourceType === 'course' && (
                  <div className="space-y-2">
                    {isHydratingGameCourses ? (
                      <div className="rounded-2xl border border-slate-200 p-4 text-xs text-slate-600 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                        <span>Đang tải câu hỏi từ các khóa học...</span>
                      </div>
                    ) : courseOptions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                        Các khóa học hiện tại chưa có câu hỏi trắc nghiệm tương tác. Bạn có thể chọn Bộ dữ liệu mẫu hoặc Ngân hàng đề.
                      </div>
                    ) : (
                      <select
                        value={config.sourceId}
                        onChange={(e) => {
                          const found = courseOptions.find((x) => x.course.id === e.target.value);
                          if (found) {
                            setConfig((p) => ({
                              ...p,
                              sourceId: found.course.id,
                              sourceTitle: found.course.title,
                            }));
                          }
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900"
                      >
                        {courseOptions.map((item) => (
                          <option key={item.course.id} value={item.course.id}>
                            {item.course.title} ({item.questions.length} câu hỏi)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {config.sourceType === 'document' && (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-bold text-slate-700">
                        Tải tệp (.docx, .txt, .md) hoặc dán nội dung câu hỏi trắc nghiệm (hỗ trợ KaTeX `$...$`):
                      </div>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        Chọn tệp tải lên
                        <input
                          type="file"
                          accept=".txt,.md,.docx"
                          onChange={handleDocumentUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <textarea
                      rows={5}
                      value={pastedDocText}
                      onChange={(e) => setPastedDocText(e.target.value)}
                      placeholder="Câu 1: ...&#10;A. ...&#10;B. ...&#10;Đáp án: B"
                      className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                    />
                    <div className="text-xs font-bold text-emerald-700 tabular-nums">
                      Đã nhận diện {parsedDocQuestions.length} câu hỏi hợp lệ từ tài liệu.
                    </div>
                  </div>
                )}

                <div className="text-xs font-semibold text-slate-500">
                  Nguồn hiện tại có <span className="font-extrabold text-slate-900 tabular-nums">{activeSourcePool.length}</span> câu gốc • Trận đấu sẽ tạo <span className="font-extrabold text-emerald-700 tabular-nums">{config.obstacleCount}</span> chướng ngại vật.
                </div>
              </div>

              {/* 5. Quy tắc thưởng / phạt */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block text-sm font-extrabold text-slate-900">
                  4. Quy tắc thưởng / phạt
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      + Điểm khi đúng
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      value={config.correctPoints}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, correctPoints: Math.max(10, Number(e.target.value) || 100) }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      - Điểm khi sai
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={config.wrongPointsPenalty}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, wrongPointsPenalty: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Lùi chặng khi sai
                    </label>
                    <select
                      value={config.wrongStepBack}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, wrongStepBack: Number(e.target.value) || 0 }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                    >
                      <option value={0}>Không lùi (0)</option>
                      <option value={1}>Lùi 1 chặng</option>
                      <option value={2}>Lùi 2 chặng</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Chờ phạt sai (giây)
                    </label>
                    <select
                      value={config.wrongCooldownSec}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, wrongCooldownSec: Number(e.target.value) || 0 }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold"
                    >
                      <option value={0}>0 giây</option>
                      <option value={2}>2 giây</option>
                      <option value={3}>3 giây</option>
                      <option value={5}>5 giây</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      + / - Giây (đúng/sai)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        title="Cộng giây khi đúng"
                        value={config.timeBonusSec}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, timeBonusSec: Math.max(0, Number(e.target.value) || 0) }))
                        }
                        className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 text-xs font-bold text-emerald-700 tabular-nums"
                      />
                      <input
                        type="number"
                        min={0}
                        max={60}
                        title="Trừ giây khi sai"
                        value={config.timePenaltySec}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, timePenaltySec: Math.max(0, Number(e.target.value) || 0) }))
                        }
                        className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 text-xs font-bold text-rose-700 tabular-nums"
                      />
                    </div>
                  </div>
                  {config.playMode === 'survival' && (
                    <div>
                      <label className="block text-[11px] font-bold text-rose-700 mb-1">
                        Số mạng Sinh tồn
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={config.survivalLives}
                        onChange={(e) =>
                          setConfig((p) => ({ ...p, survivalLives: Math.max(1, Math.min(10, Number(e.target.value) || 3)) }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-rose-300 bg-rose-50/50 text-sm font-bold text-rose-900 tabular-nums"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleStep1Next}
                  data-testid="step1-next-btn"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-extrabold shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                >
                  {busy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : config.hostIsSpectator ? (
                    <Play className="w-4 h-4" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {config.hostIsSpectator ? 'Tạo phòng & Vào phòng chờ' : 'Tiếp theo'}
                </button>
              </div>
            </div>
          )}

          {/* Bước 2: Đặt tên hiển thị */}
          {createStep === 'step2_name' && renderStep2NameView('create')}

          {/* Bước 3: Chọn nhân vật */}
          {createStep === 'step3_avatar' && renderStep3AvatarView('create')}
        </div>
      )}
    </div>
  );
};
