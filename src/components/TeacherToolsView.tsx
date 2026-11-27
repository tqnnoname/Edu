import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import {
  Classroom,
  Exam,
  ExamBundle,
  ExamResult,
  Scoreboard,
  ScoreboardDisplayMode,
  ScoreboardParticipant,
  ScoreboardRound,
  TeacherSpecialMode,
  UserAccount,
} from '../types/exam';
import {
  getAllScoreboards,
  saveScoreboard,
  deleteScoreboard,
  saveCustomExam,
  markDirtyCloudEntity,
  triggerCloudSync,
  isExamHiddenFromStudents,
  isMasterAdminUser,
} from '../utils/storage';
import {
  patchExamFieldsInFirestore,
  patchScoreboardFieldsInFirestore,
} from '../utils/firebase';
import { ConfirmModal } from './ConfirmModal';
import { UnsavedChangesModal, UnsavedNavigationGuard } from './UnsavedChangesModal';
import {
  OdometerScore,
  OdometerDecimalMode,
  computeOdometerMaxRevealMs,
} from './OdometerScore';
import { ExamScorePresentationView } from './ExamScorePresentationView';
import {
  RevealMusicStyle,
  playRevealFanfare,
  startRevealRollMusic,
  stopRevealAudio,
} from '../utils/revealAudio';
import {
  Award,
  Plus,
  Edit3,
  Trash2,
  Save,
  Play,
  Users,
  Crown,
  Sparkles,
  CheckCircle2,
  EyeOff,
  Eye,
  Radio,
  RotateCcw,
  UserPlus,
  Layers,
  ChevronRight,
  MonitorPlay,
  FileText,
  AlertTriangle,
  X,
  Clock,
  Music,
  Volume2,
  VolumeX,
  Trophy,
} from 'lucide-react';

interface TeacherToolsViewProps {
  currentUser: UserAccount | null;
  allExams: Exam[];
  allBundles?: ExamBundle[];
  results?: ExamResult[];
  classrooms: Classroom[];
  initialSubSection?: 'scoreboards' | 'exam_presentation' | 'exam_modes';
  initialPresentationExamId?: string | null;
  onExamsChanged?: () => void;
  onEditExam?: (exam: Exam) => void;
  onRegisterUnsavedGuard?: (guard: UnsavedNavigationGuard | null) => void;
}

const SPECIAL_MODE_META: Record<
  TeacherSpecialMode,
  { label: string; desc: string; badgeClass: string; activeBtnClass: string }
> = {
  normal: {
    label: 'Bình thường',
    desc: 'Chế độ quản lý chuẩn, sẵn sàng đồng bộ.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    activeBtnClass: 'bg-slate-900 text-white border-slate-900',
  },
  creator: {
    label: 'Người ra đề',
    desc: 'Chỉ người ra đề & Quản trị viên tối cao nhìn thấy; ẩn khỏi Web, Lớp học, Học sinh.',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    activeBtnClass: 'bg-amber-600 text-white border-amber-600',
  },
  grading: {
    label: 'Đang chấm điểm',
    desc: 'Tối ưu nhập điểm từng phần thi cho từng thí sinh.',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    activeBtnClass: 'bg-blue-600 text-white border-blue-600',
  },
  presenting: {
    label: 'Trình chiếu công bố',
    desc: 'Sân khấu công bố từng thí sinh với hiệu ứng chạy số & đảo hạng động.',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    activeBtnClass: 'bg-purple-600 text-white border-purple-600',
  },
};

function computeParticipantTotal(
  p: ScoreboardParticipant,
  rounds: ScoreboardRound[],
  useRevealedOnly: boolean
): number {
  const source = useRevealedOnly ? p.revealedScores || {} : p.scores || {};
  return rounds.reduce((sum, r) => sum + (Number(source[r.id]) || 0), 0);
}

export const TeacherToolsView: React.FC<TeacherToolsViewProps> = ({
  currentUser,
  allExams,
  allBundles = [],
  results = [],
  classrooms,
  initialSubSection = 'scoreboards',
  initialPresentationExamId = null,
  onExamsChanged,
  onEditExam,
  onRegisterUnsavedGuard,
}) => {
  const [subSection, setSubSection] = useState<'scoreboards' | 'exam_presentation' | 'exam_modes'>(
    initialSubSection
  );
  const [scoreboards, setScoreboards] = useState<Scoreboard[]>(() => getAllScoreboards());
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const all = getAllScoreboards();
    return all[0]?.id || null;
  });

  // Form / Structure Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMode, setFormMode] = useState<ScoreboardDisplayMode>('group');
  const [formTopN, setFormTopN] = useState<number>(3);
  const [formClassId, setFormClassId] = useState<string>('');
  const [formRounds, setFormRounds] = useState<ScoreboardRound[]>([]);
  const [formParticipants, setFormParticipants] = useState<ScoreboardParticipant[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantCode, setNewParticipantCode] = useState('');
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string>('');

  // Draft Scores for Per-Contestant Per-Part Editing
  const [draftScores, setDraftScores] = useState<{
    [participantId: string]: { [roundId: string]: string };
  }>({});

  // Presentation / Live Reveal Session State
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [useRevealedLeaderboard, setUseRevealedLeaderboard] = useState(false);
  const [activeAnnounceRoundId, setActiveAnnounceRoundId] = useState<string>('');
  const [rollingParticipantId, setRollingParticipantId] = useState<string | null>(null);
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);
  const [rollingTargetTotal, setRollingTargetTotal] = useState<number>(0);
  const [rollTriggerSeq, setRollTriggerSeq] = useState<number>(0);
  const [revealDurationSec, setRevealDurationSec] = useState<number>(4);
  const [revealMusicStyle, setRevealMusicStyle] = useState<RevealMusicStyle>('dramatic');
  const [decimalMode, setDecimalMode] = useState<OdometerDecimalMode>('auto_decimal');

  // FLIP Animation Refs
  const rowRefs = useRef<{ [participantId: string]: HTMLDivElement | null }>({});
  const prevTopRectsRef = useRef<{ [participantId: string]: number }>({});
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopMusicRef = useRef<(() => void) | null>(null);
  const rollingParticipantIdRef = useRef<string | null>(null);
  rollingParticipantIdRef.current = rollingParticipantId;

  // Sync Toast & Modals
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [localConfirmAction, setLocalConfirmAction] = useState<(() => void) | null>(null);

  const selectedBoard = useMemo(
    () => scoreboards.find((s) => s.id === selectedId) || null,
    [scoreboards, selectedId]
  );

  // Refresh from local storage if cloud updated in background (skip while Odometer roll is in-flight)
  useEffect(() => {
    const syncList = () => {
      if (rollingParticipantIdRef.current) return;
      const latest = getAllScoreboards();
      setScoreboards(latest);
    };
    window.addEventListener('storage', syncList);
    return () => {
      window.removeEventListener('storage', syncList);
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
      if (stopMusicRef.current) {
        stopMusicRef.current();
      }
      stopRevealAudio();
    };
  }, []);

  // Re-initialize draftScores cleanly when selectedBoard changes (without clobbering while dirty unless switched)
  useEffect(() => {
    if (!selectedBoard) {
      setDraftScores({});
      setActiveAnnounceRoundId('');
      return;
    }
    const nextDraft: { [pId: string]: { [rId: string]: string } } = {};
    for (const p of selectedBoard.participants) {
      nextDraft[p.id] = {};
      for (const r of selectedBoard.rounds) {
        const val = p.scores?.[r.id];
        nextDraft[p.id][r.id] = val !== undefined && val !== null ? String(val) : '';
      }
    }
    setDraftScores(nextDraft);
    setActiveAnnounceRoundId((prev) =>
      selectedBoard.rounds.some((r) => r.id === prev) ? prev : selectedBoard.rounds[0]?.id || ''
    );
    setRollingParticipantId(null);
    setSpotlightParticipantId(null);
    setUseRevealedLeaderboard(selectedBoard.specialMode === 'presenting');
  }, [selectedBoard?.id]);

  // Helper to show transient toast
  const flashNotice = useCallback((msg: string) => {
    setSyncNotice(msg);
    setTimeout(() => {
      setSyncNotice((cur) => (cur === msg ? null : cur));
    }, 3200);
  }, []);

  // Track Dirty / Unsaved Changes Guard
  const isParticipantRowDirty = useCallback(
    (p: ScoreboardParticipant): boolean => {
      if (!selectedBoard) return false;
      const pDraft = draftScores[p.id] || {};
      return selectedBoard.rounds.some((r) => {
        const savedVal = p.scores?.[r.id];
        const savedStr = savedVal !== undefined && savedVal !== null ? String(savedVal) : '';
        const draftStr = (pDraft[r.id] ?? '').trim();
        return savedStr !== draftStr;
      });
    },
    [selectedBoard, draftScores]
  );

  const hasUnsavedScores = useMemo(() => {
    if (!selectedBoard) return false;
    return selectedBoard.participants.some((p) => isParticipantRowDirty(p));
  }, [selectedBoard, isParticipantRowDirty]);

  const currentFormSnapshot = useMemo(
    () =>
      JSON.stringify({
        formTitle,
        formDescription,
        formMode,
        formTopN,
        formClassId,
        formRounds,
        formParticipants,
      }),
    [formTitle, formDescription, formMode, formTopN, formClassId, formRounds, formParticipants]
  );

  const hasUnsavedEditorChanges = useMemo(
    () => isEditorOpen && currentFormSnapshot !== initialFormSnapshot,
    [isEditorOpen, currentFormSnapshot, initialFormSnapshot]
  );

  const isPresentationActive = isPresentationOpen || rollingParticipantId !== null;

  const isAnyTaskDirty = hasUnsavedEditorChanges || hasUnsavedScores || isPresentationActive;

  const discardAllPendingWork = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    if (stopMusicRef.current) {
      stopMusicRef.current();
      stopMusicRef.current = null;
    }
    stopRevealAudio();
    setIsEditorOpen(false);
    setIsPresentationOpen(false);
    setRollingParticipantId(null);
    setSpotlightParticipantId(null);
    if (selectedBoard) {
      const resetDraft: { [pId: string]: { [rId: string]: string } } = {};
      for (const p of selectedBoard.participants) {
        resetDraft[p.id] = {};
        for (const r of selectedBoard.rounds) {
          const val = p.scores?.[r.id];
          resetDraft[p.id][r.id] = val !== undefined && val !== null ? String(val) : '';
        }
      }
      setDraftScores(resetDraft);
    }
  }, [selectedBoard]);

  // Register outer App.tsx Unsaved Navigation Guard
  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      isDirty: () => isAnyTaskDirty,
      variant: 'confirm-discard',
      title: 'Cảnh báo thao tác chưa hoàn tất',
      message:
        'Bạn đang có thao tác chưa hoàn tất/chưa lưu. Bạn có chắc chắn muốn thoát khỏi tác vụ này không?',
      stayLabel: 'Tiếp tục ở lại',
      discardLabel: 'Thoát & Hủy thay đổi',
      saveAndExit: () => true,
      discardChanges: discardAllPendingWork,
    });
    return () => onRegisterUnsavedGuard(null);
  }, [onRegisterUnsavedGuard, isAnyTaskDirty, discardAllPendingWork]);

  // Guard inner tab/board switches cleanly
  const runWithUnsavedGuard = (action: () => void) => {
    if (isAnyTaskDirty) {
      setLocalConfirmAction(() => action);
    } else {
      action();
    }
  };

  // --- CRUD Operations ---
  const openCreateEditor = () => {
    const defaultRounds: ScoreboardRound[] = [
      { id: 'r_1_' + Date.now(), name: 'Vòng 1: Khởi động', maxPoints: 100, order: 1 },
      { id: 'r_2_' + (Date.now() + 1), name: 'Vòng 2: Tăng tốc', maxPoints: 100, order: 2 },
      { id: 'r_3_' + (Date.now() + 2), name: 'Vòng 3: Về đích', maxPoints: 100, order: 3 },
    ];
    const defaultParticipants: ScoreboardParticipant[] = [
      { id: 'p_1_' + Date.now(), name: 'Thí sinh 1', code: 'TS01', scores: {}, revealedScores: {} },
      { id: 'p_2_' + (Date.now() + 1), name: 'Thí sinh 2', code: 'TS02', scores: {}, revealedScores: {} },
    ];
    setEditingBoardId(null);
    setFormTitle('Bảng Vinh Danh Thi Đấu');
    setFormDescription('');
    setFormMode('group');
    setFormTopN(3);
    setFormClassId('');
    setFormRounds(defaultRounds);
    setFormParticipants(defaultParticipants);
    setInitialFormSnapshot(
      JSON.stringify({
        formTitle: 'Bảng Vinh Danh Thi Đấu',
        formDescription: '',
        formMode: 'group',
        formTopN: 3,
        formClassId: '',
        formRounds: defaultRounds,
        formParticipants: defaultParticipants,
      })
    );
    setIsEditorOpen(true);
  };

  const openEditEditor = (sb: Scoreboard) => {
    setEditingBoardId(sb.id);
    setFormTitle(sb.title);
    setFormDescription(sb.description || '');
    setFormMode(sb.mode);
    setFormTopN(sb.topN || 3);
    setFormClassId(sb.classId || '');
    setFormRounds(sb.rounds.map((r) => ({ ...r })));
    setFormParticipants(sb.participants.map((p) => ({ ...p })));
    setInitialFormSnapshot(
      JSON.stringify({
        formTitle: sb.title,
        formDescription: sb.description || '',
        formMode: sb.mode,
        formTopN: sb.topN || 3,
        formClassId: sb.classId || '',
        formRounds: sb.rounds,
        formParticipants: sb.participants,
      })
    );
    setIsEditorOpen(true);
  };

  const handleImportStudentsFromClass = (classId: string) => {
    const cls = classrooms.find((c) => c.id === classId);
    if (!cls) return;
    const imported: ScoreboardParticipant[] = (cls.students || []).map((st) => {
      const existing = formParticipants.find(
        (p) =>
          (st.email && p.email && p.email.toLowerCase() === st.email.toLowerCase()) ||
          p.code === st.studentCode
      );
      return (
        existing || {
          id: 'p_' + st.id,
          name: st.name,
          code: st.studentCode,
          email: st.email,
          scores: {},
          revealedScores: {},
        }
      );
    });
    if (imported.length > 0) {
      setFormParticipants(imported);
    }
  };

  const handleSaveEditor = () => {
    const cleanTitle = formTitle.trim();
    if (!cleanTitle) return;
    const cleanRounds =
      formRounds.length > 0
        ? formRounds.map((r, idx) => ({
            ...r,
            name: r.name.trim() || `Vòng ${idx + 1}`,
            order: idx + 1,
          }))
        : [{ id: 'r_1_' + Date.now(), name: 'Vòng 1', maxPoints: 100, order: 1 }];

    const existing = editingBoardId
      ? scoreboards.find((s) => s.id === editingBoardId)
      : undefined;
    const cls = formClassId ? classrooms.find((c) => c.id === formClassId) : undefined;
    const nowIso = new Date().toISOString();

    const saved: Scoreboard = {
      id: existing?.id || 'sb_' + Date.now(),
      title: cleanTitle,
      description: formDescription.trim() || undefined,
      mode: formMode,
      topN: formMode === 'top_n' ? Math.max(1, Number(formTopN) || 3) : undefined,
      specialMode: existing?.specialMode || 'normal',
      classId: cls?.id,
      className: cls?.name,
      rounds: cleanRounds,
      participants: formParticipants,
      creatorId: existing?.creatorId || currentUser?.uid || currentUser?.id,
      creatorUid: existing?.creatorUid || currentUser?.uid || currentUser?.id,
      creatorEmail: existing?.creatorEmail || currentUser?.email,
      creatorName: existing?.creatorName || currentUser?.fullName,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    saveScoreboard(saved);
    void triggerCloudSync();
    setScoreboards(getAllScoreboards());
    setSelectedId(saved.id);
    setIsEditorOpen(false);
    flashNotice(`Đã lưu cấu trúc bảng điểm "${saved.title}"!`);
  };

  const handleConfirmDeleteBoard = () => {
    if (!deleteTargetId) return;
    deleteScoreboard(deleteTargetId, { confirmedByUser: true });
    void triggerCloudSync();
    const remaining = getAllScoreboards();
    setScoreboards(remaining);
    if (selectedId === deleteTargetId) {
      setSelectedId(remaining[0]?.id || null);
    }
    setDeleteTargetId(null);
    flashNotice('Đã xóa bảng điểm và đồng bộ lên Cloud.');
  };

  // --- Instant Special Mode Sync ---
  const handleSwitchSpecialMode = (mode: TeacherSpecialMode) => {
    if (!selectedBoard) return;
    const updated: Scoreboard = {
      ...selectedBoard,
      specialMode: mode,
      updatedAt: new Date().toISOString(),
    };
    saveScoreboard(updated, { skipCloudSync: true });
    void patchScoreboardFieldsInFirestore(updated.id, { specialMode: mode }).then((ok) => {
      if (!ok) {
        markDirtyCloudEntity('scoreboards', updated.id);
        void triggerCloudSync();
      }
    });
    setScoreboards(getAllScoreboards());
    setUseRevealedLeaderboard(mode === 'presenting');
    if (mode === 'presenting') {
      setIsPresentationOpen(true);
    }
    flashNotice(
      `Đã bật & đồng bộ ngay trạng thái "${SPECIAL_MODE_META[mode].label}"!`
    );
  };

  // --- Save Per-Contestant Scores ---
  const handleDraftScoreChange = (participantId: string, roundId: string, val: string) => {
    setDraftScores((prev) => ({
      ...prev,
      [participantId]: {
        ...(prev[participantId] || {}),
        [roundId]: val,
      },
    }));
  };

  const commitParticipantScores = (participantId: string): Scoreboard | null => {
    if (!selectedBoard) return null;
    const pDraft = draftScores[participantId] || {};
    const updatedParticipants = selectedBoard.participants.map((p) => {
      if (p.id !== participantId) return p;
      const nextScores: { [roundId: string]: number } = {};
      for (const r of selectedBoard.rounds) {
        const raw = (pDraft[r.id] ?? '').trim().replace(',', '.');
        if (raw !== '') {
          const num = Number(raw);
          if (Number.isFinite(num)) {
            nextScores[r.id] = num;
          }
        }
      }
      return { ...p, scores: nextScores };
    });

    const updated: Scoreboard = {
      ...selectedBoard,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString(),
    };
    saveScoreboard(updated, { skipCloudSync: true });
    void patchScoreboardFieldsInFirestore(updated.id, { participants: updatedParticipants }).then((ok) => {
      if (!ok) {
        markDirtyCloudEntity('scoreboards', updated.id);
        void triggerCloudSync();
      }
    });
    setScoreboards(getAllScoreboards());
    return updated;
  };

  const handleSaveParticipantRow = (participant: ScoreboardParticipant) => {
    commitParticipantScores(participant.id);
    flashNotice(`Đã lưu điểm từng phần cho thí sinh "${participant.name}".`);
  };

  const handleSaveAllScores = () => {
    if (!selectedBoard) return;
    const updatedParticipants = selectedBoard.participants.map((p) => {
      const pDraft = draftScores[p.id] || {};
      const nextScores: { [roundId: string]: number } = {};
      for (const r of selectedBoard.rounds) {
        const raw = (pDraft[r.id] ?? '').trim().replace(',', '.');
        if (raw !== '') {
          const num = Number(raw);
          if (Number.isFinite(num)) {
            nextScores[r.id] = num;
          }
        }
      }
      return { ...p, scores: nextScores };
    });

    const updated: Scoreboard = {
      ...selectedBoard,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString(),
    };
    saveScoreboard(updated, { skipCloudSync: true });
    void patchScoreboardFieldsInFirestore(updated.id, { participants: updatedParticipants }).then((ok) => {
      if (!ok) {
        markDirtyCloudEntity('scoreboards', updated.id);
        void triggerCloudSync();
      }
    });
    setScoreboards(getAllScoreboards());
    flashNotice('Đã lưu toàn bộ điểm các phần thi!');
  };

  // --- Dynamic Per-Participant Score Reveal (Odometer + FLIP) ---
  const sortedParticipants = useMemo(() => {
    if (!selectedBoard) return [];
    const list = [...selectedBoard.participants];
    list.sort((a, b) => {
      const totalA = computeParticipantTotal(a, selectedBoard.rounds, useRevealedLeaderboard);
      const totalB = computeParticipantTotal(b, selectedBoard.rounds, useRevealedLeaderboard);
      if (totalB !== totalA) return totalB - totalA;
      return a.name.localeCompare(b.name, 'vi');
    });
    if (selectedBoard.mode === 'top_n' && selectedBoard.topN && selectedBoard.topN > 0) {
      return list;
    }
    return list;
  }, [selectedBoard, useRevealedLeaderboard]);

  const activeDecimalPlaces: 0 | 1 | 2 = useMemo(() => {
    if (decimalMode === '0') return 0;
    if (decimalMode === '1') return 1;
    if (decimalMode === '2') return 2;
    // 'auto_decimal': always display at least 1 decimal digit (.0), or 2 (.00) if any hundredth exists
    if (!selectedBoard) return 1;
    const hasHundredths = selectedBoard.participants.some((p) => {
      const vals = [
        ...Object.values(p.scores || {}),
        ...Object.values(p.revealedScores || {}),
      ];
      return vals.some((v) => {
        if (!Number.isFinite(v)) return false;
        const scaled = Math.round(v * 100);
        return scaled % 10 !== 0;
      });
    });
    return hasHundredths ? 2 : 1;
  }, [decimalMode, selectedBoard]);

  // FLIP animation execution on every rank reorder
  useLayoutEffect(() => {
    const prevTops = prevTopRectsRef.current;
    const keys = Object.keys(prevTops);
    if (keys.length === 0) return;

    sortedParticipants.forEach((p) => {
      const el = rowRefs.current[p.id];
      const oldTop = prevTops[p.id];
      if (!el || oldTop === undefined) return;
      const newTop = el.getBoundingClientRect().top;
      const deltaY = oldTop - newTop;
      if (Math.abs(deltaY) < 1) return;

      el.style.transition = 'none';
      el.style.transform = `translateY(${deltaY}px)`;
      // Force layout reflow
      el.getBoundingClientRect();

      requestAnimationFrame(() => {
        el.style.transition = 'transform 620ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = 'translateY(0)';
      });
    });

    prevTopRectsRef.current = {};
  }, [sortedParticipants]);

  // Capture DOM positions right before leaderboard reorders for smooth FLIP glide
  const captureRowRects = () => {
    const rects: { [id: string]: number } = {};
    sortedParticipants.forEach((p) => {
      const el = rowRefs.current[p.id];
      if (el) {
        rects[p.id] = el.getBoundingClientRect().top;
      }
    });
    prevTopRectsRef.current = rects;
  };

  const handleRevealContestantRound = (participant: ScoreboardParticipant, roundId: string) => {
    if (!selectedBoard) return;
    if (rollingParticipantId) return;

    // Auto-save any typed draft for this participant first
    const committedBoard = commitParticipantScores(participant.id) || selectedBoard;
    const latestParticipant =
      committedBoard.participants.find((p) => p.id === participant.id) || participant;
    const targetRound = committedBoard.rounds.find((r) => r.id === roundId);
    if (!targetRound) return;

    setUseRevealedLeaderboard(true);
    setIsPresentationOpen(true);
    if (committedBoard.specialMode !== 'presenting') {
      const syncedBoard: Scoreboard = {
        ...committedBoard,
        specialMode: 'presenting',
        updatedAt: new Date().toISOString(),
      };
      saveScoreboard(syncedBoard, { skipCloudSync: true });
      void patchScoreboardFieldsInFirestore(syncedBoard.id, { specialMode: 'presenting' }).then((ok) => {
        if (!ok) {
          markDirtyCloudEntity('scoreboards', syncedBoard.id);
          void triggerCloudSync();
        }
      });
      setScoreboards(getAllScoreboards());
    }

    const prevRevealedMap = latestParticipant.revealedScores || {};
    const prevTotal = computeParticipantTotal(latestParticipant, committedBoard.rounds, true);
    const oldRoundScore = Number(prevRevealedMap[roundId]) || 0;
    const newRoundScore = Number(latestParticipant.scores?.[roundId]) || 0;
    const delta = Number((newRoundScore - oldRoundScore).toFixed(2));
    const nextTotal = Number((prevTotal + delta).toFixed(2));
    const requestedMs = Math.max(1000, Math.min(30000, (Number(revealDurationSec) || 4) * 1000));
    const revealWaitMs = computeOdometerMaxRevealMs(
      prevTotal,
      nextTotal,
      activeDecimalPlaces,
      requestedMs
    );

    if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
    if (stopMusicRef.current) stopMusicRef.current();

    setSpotlightParticipantId(latestParticipant.id);
    setRollingParticipantId(latestParticipant.id);
    setRollingTargetTotal(prevTotal);

    stopMusicRef.current = startRevealRollMusic(revealMusicStyle, revealWaitMs);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRollTriggerSeq((s) => s + 1);
        setRollingTargetTotal(nextTotal);
      });
    });

    // Strictly wait until roll completes before updating leaderboard + FLIP reorder
    revealTimeoutRef.current = setTimeout(() => {
      if (stopMusicRef.current) {
        stopMusicRef.current();
        stopMusicRef.current = null;
      }
      stopRevealAudio();
      playRevealFanfare(revealMusicStyle);

      captureRowRects();
      const nowIso = new Date().toISOString();
      const freshList = getAllScoreboards();
      const latestBoard = freshList.find((s) => s.id === committedBoard.id) || committedBoard;
      const updatedParticipants = latestBoard.participants.map((p) => {
        if (p.id !== latestParticipant.id) return p;
        return {
          ...p,
          revealedScores: {
            ...(p.revealedScores || {}),
            [roundId]: newRoundScore,
          },
          lastAnnouncedRoundId: roundId,
          lastAnnouncedDelta: delta,
          lastAnnouncedAt: nowIso,
        };
      });

      const finalBoard: Scoreboard = {
        ...latestBoard,
        participants: updatedParticipants,
        updatedAt: nowIso,
      };
      saveScoreboard(finalBoard, { skipCloudSync: true });
      void patchScoreboardFieldsInFirestore(finalBoard.id, { participants: updatedParticipants }).then((ok) => {
        if (!ok) {
          markDirtyCloudEntity('scoreboards', finalBoard.id);
          void triggerCloudSync();
        }
      });
      setScoreboards(getAllScoreboards());
      setRollingParticipantId(null);
      revealTimeoutRef.current = null;
    }, revealWaitMs + 80);
  };

  const handleResetRevealedBoard = () => {
    if (!selectedBoard) return;
    if (stopMusicRef.current) {
      stopMusicRef.current();
      stopMusicRef.current = null;
    }
    stopRevealAudio();
    captureRowRects();
    const updatedParticipants = selectedBoard.participants.map((p) => ({
      ...p,
      revealedScores: {},
      lastAnnouncedRoundId: undefined,
      lastAnnouncedDelta: undefined,
      lastAnnouncedAt: undefined,
    }));
    const updated: Scoreboard = {
      ...selectedBoard,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString(),
    };
    saveScoreboard(updated, { skipCloudSync: true });
    void patchScoreboardFieldsInFirestore(updated.id, { participants: updatedParticipants }).then((ok) => {
      if (!ok) {
        markDirtyCloudEntity('scoreboards', updated.id);
        void triggerCloudSync();
      }
    });
    setScoreboards(getAllScoreboards());
    setSpotlightParticipantId(null);
    setUseRevealedLeaderboard(true);
    flashNotice('Đã đặt lại sân khấu trình chiếu về trạng thái chưa công bố!');
  };

  // --- Instant Exam Mode Sync (Người ra đề / Đang chấm điểm / Trình chiếu / Bình thường) ---
  const teacherOwnedExams = useMemo(() => {
    return allExams.filter((ex) => {
      if (!ex.isCustom) return false;
      if (!currentUser) return false;
      if (isMasterAdminUser(currentUser)) return true;
      return (
        ex.creatorId === currentUser.id ||
        ex.creatorId === currentUser.uid ||
        (ex.creatorEmail &&
          currentUser.email &&
          ex.creatorEmail.toLowerCase() === currentUser.email.toLowerCase())
      );
    });
  }, [allExams, currentUser]);

  const handleInstantExamModeUpdate = (exam: Exam, mode: TeacherSpecialMode) => {
    const isCreator = mode === 'creator';
    const nextVisibility = isCreator
      ? exam.visibility
      : exam.visibility === 'private'
      ? exam.assignedClassId
        ? 'class'
        : 'public'
      : exam.visibility;
    const updated: Exam = {
      ...exam,
      teacherMode: mode,
      isCreatorOnlyMode: isCreator,
      visibility: nextVisibility,
      updatedAt: new Date().toISOString(),
    };
    void patchExamFieldsInFirestore(updated.id, {
      teacherMode: mode,
      isCreatorOnlyMode: isCreator,
      visibility: nextVisibility,
    }).then((patched) => {
      if (!patched) {
        saveCustomExam(updated);
      } else {
        try {
          const raw = localStorage.getItem('edutest_custom_exams_v1');
          const list: Exam[] = raw ? JSON.parse(raw) : [];
          const next = [updated, ...list.filter((e) => e.id !== updated.id)];
          localStorage.setItem('edutest_custom_exams_v1', JSON.stringify(next));
        } catch {}
      }
    });
    if (onExamsChanged) onExamsChanged();
    flashNotice(
      isCreator
        ? `Đề "${exam.title}" đã chuyển sang chế độ "Người ra đề" — Chỉ người ra đề & Quản trị viên tối cao nhìn thấy!`
        : `Đã đồng bộ trạng thái "${SPECIAL_MODE_META[mode].label}" cho đề "${exam.title}".`
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 font-sans">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Công Cụ Giáo Viên — Bảng Điểm & Trình Chiếu Vinh Danh
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Quản lý bảng điểm đối kháng 1v1, nhóm/lớp, Top N dẫn đầu, trình chiếu công bố từng chữ số & đồng bộ trạng thái đề thi tức thì.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runWithUnsavedGuard(() => setSubSection('exam_presentation'))}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              subSection === 'exam_presentation'
                ? 'bg-slate-900 text-amber-300 border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <MonitorPlay className="w-4 h-4" />
            <span>Trình chiếu điểm Phòng thi</span>
          </button>

          <button
            type="button"
            onClick={() => runWithUnsavedGuard(() => setSubSection('scoreboards'))}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              subSection === 'scoreboards'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Bảng điểm & Vinh danh ({scoreboards.length})</span>
          </button>

          <button
            type="button"
            onClick={() => runWithUnsavedGuard(() => setSubSection('exam_modes'))}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              subSection === 'exam_modes'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Trạng thái & Ẩn đề thi ({teacherOwnedExams.length})</span>
          </button>
        </div>
      </div>

      {/* Sync Toast */}
      {syncNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* SUBSECTION 1: SCOREBOARD MANAGEMENT & LIVE REVEAL */}
      {subSection === 'scoreboards' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Scoreboards List */}
          <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Danh sách Bảng điểm
              </h2>
              <button
                type="button"
                onClick={() => runWithUnsavedGuard(openCreateEditor)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo mới</span>
              </button>
            </div>

            {scoreboards.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2.5">
                <Award className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">
                  Chưa có bảng điểm vinh danh nào. Hãy tạo bảng điểm đầu tiên để chấm & trình chiếu!
                </p>
                <button
                  type="button"
                  onClick={openCreateEditor}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
                >
                  + Tạo bảng điểm ngay
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                {scoreboards.map((sb) => {
                  const isActive = sb.id === selectedBoard?.id;
                  const meta = SPECIAL_MODE_META[sb.specialMode || 'normal'];
                  return (
                    <div
                      key={sb.id}
                      onClick={() =>
                        runWithUnsavedGuard(() => {
                          setSelectedId(sb.id);
                          setIsPresentationOpen(false);
                        })
                      }
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50/70 border-indigo-400 ring-1 ring-indigo-300'
                          : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">
                            {sb.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                            <span className="font-semibold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                              {sb.mode === '1v1'
                                ? 'Đối kháng 1v1'
                                : sb.mode === 'top_n'
                                ? `Top ${sb.topN || 3}`
                                : 'Xếp hạng nhóm/lớp'}
                            </span>
                            <span>{sb.participants.length} thí sinh</span>
                            <span>·</span>
                            <span>{sb.rounds.length} phần</span>
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isActive ? 'text-indigo-600' : 'text-slate-400'
                          }`}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200/70">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>

                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => runWithUnsavedGuard(() => openEditEditor(sb))}
                            className="p-1 text-slate-500 hover:text-indigo-700 rounded hover:bg-white cursor-pointer"
                            title="Sửa tên & cấu trúc bảng"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(sb.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-white cursor-pointer"
                            title="Xóa bảng điểm"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right Column: Active Scoreboard Management & Presentation */}
          <section className="lg:col-span-8 space-y-5">
            {!selectedBoard ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3 shadow-xs">
                <Sparkles className="w-10 h-10 text-indigo-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-900">
                  Chọn hoặc tạo mới một Bảng điểm để bắt đầu
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  Hỗ trợ nhập điểm theo từng vòng thi cho từng thí sinh và công bố điểm chạy số từng chữ số kèm hiệu ứng hoán đổi thứ hạng trực tiếp.
                </p>
              </div>
            ) : (
              <>
                {/* Top Controls & Instant Mode Switcher */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-extrabold text-slate-900">
                          {selectedBoard.title}
                        </h2>
                        {selectedBoard.className && (
                          <span className="text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md">
                            Lớp: {selectedBoard.className}
                          </span>
                        )}
                      </div>
                      {selectedBoard.description && (
                        <p className="text-xs text-slate-500 mt-1">{selectedBoard.description}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => runWithUnsavedGuard(() => openEditEditor(selectedBoard))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa cấu trúc</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isPresentationOpen) {
                            runWithUnsavedGuard(() => {
                              setIsPresentationOpen(false);
                              setUseRevealedLeaderboard(false);
                            });
                          } else {
                            setIsPresentationOpen(true);
                            setUseRevealedLeaderboard(true);
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors ${
                          isPresentationOpen
                            ? 'bg-purple-700 text-white hover:bg-purple-800'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        <MonitorPlay className="w-3.5 h-3.5" />
                        <span>
                          {isPresentationOpen ? 'Đang mở Trình chiếu' : 'Mở Sân khấu Trình chiếu'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Special Mode Quick Sync Buttons */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Radio className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Trạng thái đồng bộ tức thì:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(Object.keys(SPECIAL_MODE_META) as TeacherSpecialMode[]).map((mKey) => {
                        const m = SPECIAL_MODE_META[mKey];
                        const isActive = (selectedBoard.specialMode || 'normal') === mKey;
                        return (
                          <button
                            key={mKey}
                            type="button"
                            onClick={() => handleSwitchSpecialMode(mKey)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                              isActive
                                ? m.activeBtnClass + ' shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                            title={m.desc}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* LIVE PRESENTATION 50/50 SPLIT-SCREEN STAGE */}
                {isPresentationOpen && (
                  <div className="@container bg-slate-950 text-white rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-2xl space-y-5 max-w-full overflow-x-hidden">
                    <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300 break-words">
                          Sân Khấu Công Bố Điểm · {selectedBoard.title}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={decimalMode}
                          onChange={(e) => setDecimalMode(e.target.value as OdometerDecimalMode)}
                          disabled={rollingParticipantId !== null}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-amber-200 focus:outline-none max-w-full min-w-0"
                        >
                          <option value="auto_decimal">Thập phân: Tự động</option>
                          <option value="1">1 số lẻ (.0)</option>
                          <option value="2">2 số lẻ (.00)</option>
                          <option value="0">Số nguyên</option>
                        </select>

                        <select
                          value={activeAnnounceRoundId}
                          onChange={(e) => setActiveAnnounceRoundId(e.target.value)}
                          disabled={rollingParticipantId !== null}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white focus:outline-none max-w-full sm:max-w-[240px] min-w-0"
                        >
                          {selectedBoard.rounds.map((r) => (
                            <option key={r.id} value={r.id}>
                              Phần: {r.name}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs">
                          <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span className="text-slate-400">Chạy:</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            disabled={rollingParticipantId !== null}
                            value={revealDurationSec}
                            onChange={(e) =>
                              setRevealDurationSec(Math.max(1, Math.min(30, Number(e.target.value) || 4)))
                            }
                            className="w-11 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-center font-mono font-bold text-amber-300"
                          />
                          <span className="text-slate-400">giây</span>
                        </div>

                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs">
                          {revealMusicStyle === 'mute' ? (
                            <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <select
                            value={revealMusicStyle}
                            onChange={(e) => setRevealMusicStyle(e.target.value as RevealMusicStyle)}
                            className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
                          >
                            <option value="dramatic" className="bg-slate-900">Nhạc Kịch tính</option>
                            <option value="ceremonial" className="bg-slate-900">Nhạc Trang trọng</option>
                            <option value="mute" className="bg-slate-900">Tắt nhạc</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={handleResetRevealedBoard}
                          disabled={rollingParticipantId !== null}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Đặt lại</span>
                        </button>
                      </div>
                    </div>

                    {/* 50/50 Split Screen */}
                    <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-5 min-w-0">
                      {/* LEFT 50%: ĐIỂM THI & NÚT CÔNG BỐ (KHÔNG HIỆN ĐIỂM TRƯỚC) */}
                      <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 flex-wrap">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 shrink-0" />
                            <span>Điểm thi thí sinh</span>
                          </span>
                          {rollingParticipantId && revealMusicStyle !== 'mute' && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300">
                              <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                              <span>Đang phát nhạc</span>
                            </span>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 rounded-xl bg-gradient-to-b from-slate-950 via-indigo-950/40 to-slate-950 border border-slate-800 text-center min-h-[210px] min-w-0">
                          {!spotlightParticipantId ? (
                            <div className="space-y-2 max-w-sm">
                              <Trophy className="w-10 h-10 text-amber-400/70 mx-auto" />
                              <p className="text-xs sm:text-sm text-slate-400">
                                Chọn thí sinh bên dưới và bấm <strong>Công bố</strong> để chạy điểm.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4 w-full min-w-0 flex flex-col items-center">
                              <div className="text-xl sm:text-2xl font-black text-white break-words max-w-full">
                                {selectedBoard.participants.find((p) => p.id === spotlightParticipantId)?.name || ''}
                              </div>
                              <div className="px-4 sm:px-6 py-3 sm:py-4 rounded-2xl bg-white text-slate-950 border-4 border-amber-400 shadow-2xl inline-flex items-center justify-center max-w-full overflow-x-auto">
                                <OdometerScore
                                  value={rollingTargetTotal}
                                  decimalPlaces={activeDecimalPlaces}
                                  totalDurationMs={revealDurationSec * 1000}
                                  rollTrigger={rollTriggerSeq}
                                  isRolling={rollingParticipantId !== null}
                                  size="xl"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                          {selectedBoard.participants.map((p) => (
                            <div
                              key={p.id}
                              className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-white truncate">{p.name}</div>
                                {p.code && (
                                  <div className="font-mono text-[11px] text-slate-400">{p.code}</div>
                                )}
                              </div>
                              {activeAnnounceRoundId && (
                                <button
                                  type="button"
                                  disabled={rollingParticipantId !== null}
                                  onClick={() => handleRevealContestantRound(p, activeAnnounceRoundId)}
                                  className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-40"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Công bố</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* RIGHT 50%: BẢNG XẾP HẠNG (CHỈ HIỆN THỨ HẠNG, TÊN, ĐIỂM; CẬP NHẬT SAU KHI CHẠY XONG) */}
                      <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                            <Crown className="w-4 h-4" />
                            <span>Bảng xếp hạng</span>
                          </span>
                        </div>

                        <div className="flex-1 space-y-2 max-h-[430px] overflow-y-auto pr-1">
                          {(() => {
                            const announcedRows = sortedParticipants.filter(
                              (p) => Object.keys(p.revealedScores || {}).length > 0
                            );
                            if (announcedRows.length === 0) {
                              return (
                                <div className="h-full min-h-[240px] flex items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl p-6">
                                  Bảng xếp hạng sẽ tự động cập nhật sau khi điểm từng thí sinh chạy xong.
                                </div>
                              );
                            }
                            return announcedRows.map((p, rankIdx) => {
                              const rank = rankIdx + 1;
                              const isTopCutoff =
                                selectedBoard.mode === 'top_n' &&
                                rank > (selectedBoard.topN || 3);
                              const revealedTotal = computeParticipantTotal(p, selectedBoard.rounds, true);

                              return (
                                <div
                                  key={p.id}
                                  ref={(el) => {
                                    rowRefs.current[p.id] = el;
                                  }}
                                  className={`px-3.5 py-3 rounded-xl border flex items-center justify-between gap-3 ${
                                    rank === 1
                                      ? 'bg-amber-500/15 border-amber-400/70'
                                      : rank === 2
                                      ? 'bg-slate-800/95 border-slate-500/70'
                                      : rank === 3
                                      ? 'bg-amber-900/20 border-amber-700/60'
                                      : isTopCutoff
                                      ? 'bg-slate-900/40 border-slate-800/70 opacity-65'
                                      : 'bg-slate-950/85 border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`w-8 h-8 rounded-lg font-black text-xs flex items-center justify-center shrink-0 tabular-nums ${
                                        rank === 1
                                          ? 'bg-amber-400 text-slate-950'
                                          : rank === 2
                                          ? 'bg-slate-300 text-slate-950'
                                          : rank === 3
                                          ? 'bg-amber-700 text-white'
                                          : 'bg-slate-800 text-slate-200'
                                      }`}
                                    >
                                      #{rank}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-sm sm:text-base text-white truncate">
                                        {p.name}
                                      </div>
                                      {p.code && (
                                        <div className="font-mono text-[11px] text-slate-400">
                                          {p.code}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-black text-lg sm:text-xl text-amber-300 tabular-nums">
                                      {activeDecimalPlaces === 0
                                        ? Math.round(revealedTotal)
                                        : revealedTotal.toFixed(activeDecimalPlaces)}
                                    </span>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PER-PART SCORE ENTRY TABLE & INDIVIDUAL SAVE / REVEAL */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">
                        Nhập điểm từng phần thi & Công bố từng thí sinh
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Nhập điểm cho từng vòng (Vòng 1, Vòng 2...), bấm Lưu riêng từng thí sinh hoặc Công bố trực tiếp lên bảng xếp hạng.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasUnsavedScores && (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Có điểm chưa lưu
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveAllScores}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Lưu tất cả điểm</span>
                      </button>
                    </div>
                  </div>

                  {selectedBoard.participants.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 rounded-xl text-xs text-slate-500">
                      Chưa có thí sinh nào trong bảng. Hãy bấm &quot;Sửa cấu trúc&quot; để thêm thí sinh hoặc nhập từ lớp học.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-y border-slate-200 text-slate-600">
                            <th className="py-2.5 px-3 font-bold">Hạng</th>
                            <th className="py-2.5 px-3 font-bold min-w-[160px]">Thí sinh</th>
                            {selectedBoard.rounds.map((r) => (
                              <th key={r.id} className="py-2.5 px-2.5 font-bold min-w-[125px]">
                                <div>{r.name}</div>
                                {r.maxPoints !== undefined && (
                                  <div className="text-[10px] font-normal text-slate-400">
                                    Tối đa {r.maxPoints}đ
                                  </div>
                                )}
                              </th>
                            ))}
                            <th className="py-2.5 px-3 font-bold text-right">Tổng điểm</th>
                            <th className="py-2.5 px-3 font-bold text-right min-w-[120px]">
                              Thao tác
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedParticipants.map((p, idx) => {
                            const rowDirty = isParticipantRowDirty(p);
                            const savedTotal = computeParticipantTotal(
                              p,
                              selectedBoard.rounds,
                              false
                            );
                            const isTopHighlighted =
                              selectedBoard.mode === 'top_n'
                                ? idx < (selectedBoard.topN || 3)
                                : selectedBoard.mode === '1v1'
                                ? idx < 2
                                : idx < 3;

                            return (
                              <tr
                                key={p.id}
                                className={`hover:bg-slate-50/80 ${
                                  isTopHighlighted ? 'bg-indigo-50/20' : ''
                                }`}
                              >
                                <td className="py-3 px-3 font-mono font-extrabold text-slate-700">
                                  #{idx + 1}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-bold text-slate-900">{p.name}</div>
                                  {p.code && (
                                    <div className="text-[11px] font-mono text-slate-400">
                                      {p.code}
                                    </div>
                                  )}
                                </td>

                                {selectedBoard.rounds.map((r) => {
                                  const rawDraft = draftScores[p.id]?.[r.id] ?? '';
                                  const savedVal = p.scores?.[r.id];
                                  const savedStr =
                                    savedVal !== undefined && savedVal !== null
                                      ? String(savedVal)
                                      : '';
                                  const cellDirty = rawDraft.trim() !== savedStr;
                                  const isRevealedMatch =
                                    p.revealedScores?.[r.id] !== undefined &&
                                    p.revealedScores?.[r.id] === savedVal;

                                  return (
                                    <td key={r.id} className="py-2.5 px-2.5">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          step="any"
                                          value={rawDraft}
                                          onChange={(e) =>
                                            handleDraftScoreChange(p.id, r.id, e.target.value)
                                          }
                                          placeholder="0"
                                          className={`w-20 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                            cellDirty
                                              ? 'border-amber-400 bg-amber-50 text-amber-950'
                                              : 'border-slate-200 bg-white text-slate-900'
                                          }`}
                                        />
                                        <button
                                          type="button"
                                          disabled={rollingParticipantId !== null}
                                          onClick={() => handleRevealContestantRound(p, r.id)}
                                          className={`p-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40 ${
                                            isRevealedMatch
                                              ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                              : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                          }`}
                                          title={`Công bố điểm ${r.name} của ${p.name}`}
                                        >
                                          <Play className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  );
                                })}

                                <td className="py-3 px-3 text-right font-mono font-black text-indigo-700">
                                  {savedTotal}
                                </td>

                                <td className="py-3 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveParticipantRow(p)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                      rowDirty
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <Save className="w-3 h-3" />
                                    <span>{rowDirty ? 'Lưu điểm' : 'Đã lưu'}</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* SUBSECTION: FULLSCREEN EXAM ROOM SCORE PRESENTATION */}
      {subSection === 'exam_presentation' && (
        <ExamScorePresentationView
          exams={allExams}
          bundles={allBundles}
          results={results}
          classrooms={classrooms}
          initialExamId={initialPresentationExamId}
        />
      )}

      {/* SUBSECTION 2: INSTANT EXAM SPECIAL MODES & CREATOR-ONLY HIDING */}
      {subSection === 'exam_modes' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Đồng Bộ Trạng Thái Chế Độ & Quy Tắc Ẩn Đề Thi Trong Lớp
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Khi bật chế độ <strong className="text-amber-800">&quot;Người ra đề&quot;</strong> (hoặc trạng thái Nháp / Riêng tư), đề thi sẽ đồng bộ ngay lập tức và <strong>tuyệt đối không hiển thị</strong> trong giao diện Học sinh & Lớp học.
              </p>
            </div>
          </div>

          {teacherOwnedExams.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs sm:text-sm text-slate-500">
              Bạn chưa tạo đề thi tự tạo nào. Hãy tạo đề thi trong mục &quot;Soạn Đề Thi&quot; để bật chế độ đồng bộ tại đây.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {teacherOwnedExams.map((ex) => {
                const currentMode: TeacherSpecialMode =
                  ex.teacherMode || (ex.isCreatorOnlyMode ? 'creator' : 'normal');
                const hidden = isExamHiddenFromStudents(ex);

                return (
                  <div
                    key={ex.id}
                    className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm sm:text-base text-slate-900">
                          {ex.title}
                        </span>
                        {hidden ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                            <EyeOff className="w-3 h-3" />
                            Đang ẩn trên toàn Web &amp; Lớp học
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Eye className="w-3 h-3" />
                            Hiển thị theo phạm vi ({ex.visibility === 'class' ? 'Trong lớp' : 'Công khai'})
                          </span>
                        )}
                        {ex.isOfficialClassExam && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                            Thi chính thức (Khóa HS lớp)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                        <span>{ex.grade}</span>
                        <span>·</span>
                        <span>{ex.questions.length} câu</span>
                        {ex.assignedClassName && (
                          <>
                            <span>·</span>
                            <span>Lớp: {ex.assignedClassName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {onEditExam && (
                        <button
                          type="button"
                          onClick={() => onEditExam(ex)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer flex items-center gap-1"
                          title="Mở trình soạn thảo để chỉnh sửa đề thi này"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Sửa đề</span>
                        </button>
                      )}
                      {(Object.keys(SPECIAL_MODE_META) as TeacherSpecialMode[]).map((mKey) => {
                        const meta = SPECIAL_MODE_META[mKey];
                        const isActive = currentMode === mKey;
                        return (
                          <button
                            key={mKey}
                            type="button"
                            onClick={() => handleInstantExamModeUpdate(ex, mKey)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              isActive
                                ? meta.activeBtnClass + ' shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT SCOREBOARD STRUCTURE MODAL */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[105] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Award className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold">
                  {editingBoardId ? 'Chỉnh sửa Bảng điểm & Cấu trúc' : 'Tạo Bảng điểm Vinh danh mới'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => runWithUnsavedGuard(() => setIsEditorOpen(false))}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              {/* Name & Display Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên Bảng điểm / Cuộc thi *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ví dụ: Đường lên đỉnh Olympia Lớp 12A1..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chế độ hiển thị / thi đấu
                  </label>
                  <select
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value as ScoreboardDisplayMode)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold bg-white"
                  >
                    <option value="group">Bảng xếp hạng nhiều người (Nhóm / Cả lớp)</option>
                    <option value="1v1">Đối kháng 2 người (1v1)</option>
                    <option value="top_n">Top N người dẫn đầu</option>
                  </select>
                </div>

                {formMode === 'top_n' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số lượng Top N dẫn đầu
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formTopN}
                      onChange={(e) => setFormTopN(Math.max(1, Number(e.target.value) || 3))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Gắn với Lớp học (tùy chọn)
                    </label>
                    <select
                      value={formClassId}
                      onChange={(e) => {
                        setFormClassId(e.target.value);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white"
                    >
                      <option value="">-- Tự do (Không gắn lớp) --</option>
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.students.length} HS)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Rounds Structure */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 uppercase">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Các phần thi / Vòng thi ({formRounds.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormRounds((prev) => [
                        ...prev,
                        {
                          id: 'r_' + Date.now() + '_' + prev.length,
                          name: `Vòng ${prev.length + 1}`,
                          maxPoints: 100,
                          order: prev.length + 1,
                        },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                  >
                    + Thêm vòng
                  </button>
                </div>

                <div className="space-y-2">
                  {formRounds.map((r, idx) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <span className="w-6 text-center font-mono text-xs font-bold text-slate-400">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) =>
                          setFormRounds((prev) =>
                            prev.map((item) =>
                              item.id === r.id ? { ...item, name: e.target.value } : item
                            )
                          )
                        }
                        placeholder={`Tên vòng ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                      />
                      <input
                        type="number"
                        value={r.maxPoints ?? ''}
                        onChange={(e) =>
                          setFormRounds((prev) =>
                            prev.map((item) =>
                              item.id === r.id
                                ? { ...item, maxPoints: Number(e.target.value) || 0 }
                                : item
                            )
                          )
                        }
                        placeholder="Max"
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                        title="Điểm tối đa của phần này"
                      />
                      {formRounds.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormRounds((prev) => prev.filter((item) => item.id !== r.id))
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Participants Management */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 uppercase">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>Danh sách thí sinh / đội thi ({formParticipants.length})</span>
                  </div>

                  {formClassId && (
                    <button
                      type="button"
                      onClick={() => handleImportStudentsFromClass(formClassId)}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold cursor-pointer"
                    >
                      Nạp học sinh từ lớp đã chọn
                    </button>
                  )}
                </div>

                {/* Quick add contestant */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newParticipantName}
                    onChange={(e) => setNewParticipantName(e.target.value)}
                    placeholder="Họ tên thí sinh hoặc Tên đội..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                  <input
                    type="text"
                    value={newParticipantCode}
                    onChange={(e) => setNewParticipantCode(e.target.value)}
                    placeholder="SBD / Mã (tùy chọn)"
                    className="w-full sm:w-36 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newParticipantName.trim();
                      if (!clean) return;
                      setFormParticipants((prev) => [
                        ...prev,
                        {
                          id: 'p_' + Date.now() + '_' + prev.length,
                          name: clean,
                          code: newParticipantCode.trim() || undefined,
                          scores: {},
                          revealedScores: {},
                        },
                      ]);
                      setNewParticipantName('');
                      setNewParticipantCode('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Thêm</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {formParticipants.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs"
                    >
                      <span className="font-mono text-slate-400 w-5">{idx + 1}.</span>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) =>
                          setFormParticipants((prev) =>
                            prev.map((item) =>
                              item.id === p.id ? { ...item, name: e.target.value } : item
                            )
                          )
                        }
                        className="flex-1 font-semibold text-slate-900 bg-transparent focus:outline-none"
                      />
                      {p.code && (
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {p.code}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setFormParticipants((prev) => prev.filter((item) => item.id !== p.id))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => runWithUnsavedGuard(() => setIsEditorOpen(false))}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSaveEditor}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu bảng điểm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Scoreboard Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deleteTargetId)}
        title="Xác nhận xóa bảng điểm"
        message="Bạn có chắc chắn muốn xóa vĩnh viễn bảng điểm vinh danh này không? Dữ liệu điểm trong bảng sẽ không thể khôi phục."
        confirmText="Xóa bảng điểm"
        cancelText="Hủy"
        onConfirm={handleConfirmDeleteBoard}
        onClose={() => setDeleteTargetId(null)}
      />

      {/* Local Unsaved Changes Guard Modal (2 buttons strictly as requested) */}
      <UnsavedChangesModal
        isOpen={Boolean(localConfirmAction)}
        variant="confirm-discard"
        title="Cảnh báo thao tác chưa hoàn tất"
        message="Bạn đang có thao tác chưa hoàn tất/chưa lưu. Bạn có chắc chắn muốn thoát khỏi tác vụ này không?"
        stayLabel="Tiếp tục ở lại"
        discardLabel="Thoát & Hủy thay đổi"
        onSaveAndExit={() => true}
        onDiscardAndExit={() => {
          discardAllPendingWork();
          const fn = localConfirmAction;
          setLocalConfirmAction(null);
          if (fn) fn();
        }}
        onCancel={() => setLocalConfirmAction(null)}
      />
    </div>
  );
};
