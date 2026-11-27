import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  CandidateAnswerValue, 
  Exam, 
  ExamResult, 
  Question,
  UserRole
} from '../types/exam';
import { 
  Clock, 
  Flag, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  Calculator as CalcIcon, 
  Edit3, 
  Maximize2, 
  Minimize2, 
  AlertTriangle,
  Lightbulb,
  X,
  RotateCcw,
  BookOpen,
  Shuffle,
  Info,
  Eye,
  Save,
  Lock,
  Columns2,
  CheckSquare,
  Square,
  LayoutGrid
} from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import { MiniCalculator } from './MiniCalculator';
import { ScratchpadModal } from './ScratchpadModal';
import { RichContentRenderer } from './RichContentRenderer';
import { MatchingQuestionView } from './MatchingQuestionView';
import { QuickQuestionEditorModal } from './QuickQuestionEditorModal';
import { ConfirmModal } from './ConfirmModal';
import { ExamPreviewModal } from './ExamPreviewModal';
import { MathToolbar } from './MathToolbar';
import { CopyContentButton } from './CopyContentButton';
import { RoomLockGuard, tryEnterKioskFullscreen } from './RoomLockGuard';
import { InlineImageStrip, InlineImageTitleModal } from './InlineImageTitleModal';
import { insertTextAtEditableElement } from '../utils/cursorInsert';
import {
  collectUsedInlineImages,
  extractImageFileFromClipboardEvent,
  formatInlineImageToken,
  registerImplicitImage,
  registerImplicitImagesMap,
} from '../utils/inlineImages';
import { processImageFile } from '../utils/imageUpload';
import { uploadImageOrKeepFallback } from '../utils/courseMedia';
import {
  gradeEntireExam,
  gradeQuestion,
  shuffleExamQuestionsAndOptions,
  formatTrueFalseScoringRule,
  buildQuestionClusters,
  formatShortAnswerDecimalComma,
} from '../utils/scoring';
import { renderMath } from '../utils/renderMath';
import {
  saveCustomExam,
  saveActiveSession,
  loadExamDraft,
  saveExamDraft,
  clearExamDraft,
} from '../utils/storage';

interface ExamTakingViewProps {
  exam: Exam;
  mode: 'exam' | 'practice';
  userRole?: UserRole;
  candidateName?: string;
  studentCode?: string;
  onComplete: (result: ExamResult) => void;
  onExit: () => void;
  onUpdateExam?: (updatedExam: Exam) => void;
  isOfficialLocked?: boolean;
}

export const ExamTakingView: React.FC<ExamTakingViewProps> = ({
  exam: initialExam,
  mode,
  userRole = 'student',
  candidateName,
  studentCode,
  onComplete,
  onExit,
  onUpdateExam,
  isOfficialLocked = false,
}) => {
  const [liveExam, setLiveExam] = useState<Exam>(initialExam);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [saveDraftToast, setSaveDraftToast] = useState<string | null>(null);

  // Check if shuffle settings are on, or user can toggle
  const [shuffleQuestions, setShuffleQuestions] = useState(
    Boolean(initialExam.settings?.shuffleQuestions)
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    Boolean(initialExam.settings?.shuffleOptions)
  );

  // The active exam instance (may be shuffled — cluster order preserved if groupByQuestionType is on)
  const exam = useMemo(() => {
    return shuffleExamQuestionsAndOptions(liveExam, shuffleQuestions, shuffleOptions);
  }, [liveExam, shuffleQuestions, shuffleOptions]);

  const isGroupedByType = Boolean(exam.settings?.groupByQuestionType);
  const questionClusters = useMemo(() => {
    if (!isGroupedByType) return [];
    return buildQuestionClusters(exam.questions, exam.settings?.questionTypeOrder);
  }, [exam.questions, isGroupedByType, exam.settings?.questionTypeOrder]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [questionId: string]: CandidateAnswerValue }>({});
  const [flagged, setFlagged] = useState<{ [questionId: string]: boolean }>({});

  const handleSaveQuestion = (updatedQ: Question) => {
    const updatedQuestions = liveExam.questions.map((q) => (q.id === updatedQ.id ? updatedQ : q));
    const totalPts = updatedQuestions.reduce((acc, q) => acc + (q.points || 1.0), 0);
    const updatedExam: Exam = {
      ...liveExam,
      questions: updatedQuestions,
      totalPoints: Number(totalPts.toFixed(2)),
    };
    setLiveExam(updatedExam);
    saveCustomExam(updatedExam);
    if (onUpdateExam) onUpdateExam(updatedExam);
  };

  const handleDeleteQuestion = (questionId: string) => {
    let updatedQuestions = liveExam.questions.filter((q) => q.id !== questionId);
    if (updatedQuestions.length === 0) {
      updatedQuestions = [
        {
          id: 'q_' + Date.now(),
          type: 'single_choice',
          points: 1.0,
          question: 'Câu hỏi mới (Hãy nhấp "Sửa câu này" để nhập nội dung)',
          options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
          correctAnswer: 0,
          explanation: 'Chưa có lời giải.',
        },
      ];
    }
    const totalPts = updatedQuestions.reduce((acc, q) => acc + (q.points || 1.0), 0);
    const updatedExam: Exam = {
      ...liveExam,
      questions: updatedQuestions,
      totalQuestions: updatedQuestions.length,
      totalPoints: Number(totalPts.toFixed(2)),
    };
    setLiveExam(updatedExam);
    saveCustomExam(updatedExam);
    if (currentIndex >= updatedQuestions.length) {
      setCurrentIndex(Math.max(0, updatedQuestions.length - 1));
    }
    if (onUpdateExam) onUpdateExam(updatedExam);
  };
  const [remainingSeconds, setRemainingSeconds] = useState(exam.durationMinutes * 60);
  const [practiceElapsedSeconds, setPracticeElapsedSeconds] = useState(0);
  const [practiceQueue, setPracticeQueue] = useState<{ qIndex: number; isRetry: boolean }[]>(() =>
    exam.questions.map((_, idx) => ({ qIndex: idx, isRetry: false }))
  );
  const [practiceCursor, setPracticeCursor] = useState(0);
  const [practiceRetryToast, setPracticeRetryToast] = useState<string | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [isLockdownNoticeOpen, setIsLockdownNoticeOpen] = useState(false);
  const [isEarlySubmitNoticeOpen, setIsEarlySubmitNoticeOpen] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [isSplitView, setIsSplitView] = useState(true);
  const [isMobileMatrixOpen, setIsMobileMatrixOpen] = useState(false);
  const [revealedExplanations, setRevealedExplanations] = useState<{ [questionId: string]: boolean }>({});

  const isRoomLockActive = Boolean(
    (exam.lockExitUntilTimeout || isOfficialLocked) &&
      mode === 'exam' &&
      userRole === 'student' &&
      remainingSeconds > 0
  );

  // Tab switch anti-cheat state
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
  const [copyToastNotice, setCopyToastNotice] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const draftRestoredForRef = useRef<string | null>(null);

  const startTime = useMemo(() => Date.now(), []);
  const activePracticeItem = mode === 'practice' ? practiceQueue[practiceCursor] : undefined;
  const effectiveQuestionIndex =
    mode === 'practice' && activePracticeItem ? activePracticeItem.qIndex : currentIndex;
  const currentQuestion: Question =
    exam.questions[effectiveQuestionIndex] || exam.questions[0];
  const questionContainerRef = useRef<HTMLElement>(null);
  const essayTextareaRef = useRef<HTMLTextAreaElement>(null);
  const shortAnswerInputRef = useRef<HTMLInputElement>(null);
  const [showEssayPreview, setShowEssayPreview] = useState(true);
  const [essayInlineImages, setEssayInlineImages] = useState<Record<string, string>>({});
  const [essayPasteModal, setEssayPasteModal] = useState<{
    imageSrc: string;
    defaultTitle: string;
    el: HTMLTextAreaElement | null;
    range: { start: number; end: number } | null;
    targetSubQuestionId?: string;
  } | null>(null);

  // Auto-restore saved draft for current exam + mode on mount / exam change
  useEffect(() => {
    const key = `${initialExam.id}_${mode}`;
    if (draftRestoredForRef.current === key) return;
    draftRestoredForRef.current = key;
    const draft = loadExamDraft(initialExam.id, mode);
    if (!draft) return;
    const hasProgress =
      (draft.answers && Object.keys(draft.answers).length > 0) ||
      (draft.flagged && Object.keys(draft.flagged).length > 0) ||
      draft.currentIndex > 0;
    if (!hasProgress) return;

    if (draft.answers) setAnswers(draft.answers);
    if (draft.flagged) setFlagged(draft.flagged);
    if (draft.essayInlineImages) {
      registerImplicitImagesMap(draft.essayInlineImages);
      setEssayInlineImages(draft.essayInlineImages);
    }
    if (typeof draft.currentIndex === 'number' && draft.currentIndex >= 0 && draft.currentIndex < initialExam.questions.length) {
      setCurrentIndex(draft.currentIndex);
    }
    if (mode === 'exam' && typeof draft.remainingSeconds === 'number' && draft.remainingSeconds > 0) {
      setRemainingSeconds(Math.min(initialExam.durationMinutes * 60, draft.remainingSeconds));
    }
    if (mode === 'practice') {
      if (typeof draft.practiceElapsedSeconds === 'number' && draft.practiceElapsedSeconds >= 0) {
        setPracticeElapsedSeconds(draft.practiceElapsedSeconds);
      }
      if (Array.isArray(draft.practiceQueue) && draft.practiceQueue.length > 0) {
        setPracticeQueue(draft.practiceQueue);
      }
      if (typeof draft.practiceCursor === 'number' && draft.practiceCursor >= 0) {
        setPracticeCursor(draft.practiceCursor);
      }
    }
    setSaveDraftToast('✓ Đã tự động khôi phục bài làm dở trước đó!');
    const timer = window.setTimeout(() => setSaveDraftToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [initialExam.id, initialExam.durationMinutes, initialExam.questions.length, mode]);

  useEffect(() => {
    liveExam.questions.forEach((q) => {
      registerImplicitImagesMap(q.inlineImages);
      q.subQuestions?.forEach((sq) => registerImplicitImagesMap(sq.inlineImages));
    });
  }, [liveExam.questions]);

  useEffect(() => {
    if (mode !== 'practice') return;
    setPracticeQueue((prev) => {
      if (prev.length === 0 && exam.questions.length > 0) {
        return exam.questions.map((_, idx) => ({ qIndex: idx, isRetry: false }));
      }
      const valid = prev.filter((item) => item.qIndex >= 0 && item.qIndex < exam.questions.length);
      return valid.length > 0
        ? valid
        : exam.questions.map((_, idx) => ({ qIndex: idx, isRetry: false }));
    });
  }, [mode, exam.id, exam.questions.length]);

  useEffect(() => {
    if (mode === 'practice' && activePracticeItem && activePracticeItem.qIndex !== currentIndex) {
      setCurrentIndex(activePracticeItem.qIndex);
    }
  }, [mode, activePracticeItem, currentIndex]);

  useEffect(() => {
    renderMath(questionContainerRef.current);
  }, [
    currentIndex,
    practiceCursor,
    currentQuestion?.id,
    isSplitView,
    fontSize,
    revealedExplanations,
    showEssayPreview,
    answers,
  ]);

  // Anti-copy enabled check
  const isAntiCopyEnabled = exam.allowCopy === false || exam.settings?.allowCopy === false;
  // Live score display toggle
  const isLiveScoreVisible = Boolean(exam.showLiveScoreDuringExam || exam.settings?.showLiveScoreDuringExam);

  // Early submit lockout check: students in exam mode cannot submit early;
  // if minSubmitMinutes > 0 wait until minSubmitMinutes, else wait until full exam time expires.
  const minSubmitMinutes = exam.minSubmitMinutes || 0;
  const totalDurationSeconds = Math.max(1, exam.durationMinutes * 60);
  const timeSpentSeconds = totalDurationSeconds - remainingSeconds;
  const minRequiredSeconds =
    minSubmitMinutes > 0
      ? Math.min(totalDurationSeconds, minSubmitMinutes * 60)
      : totalDurationSeconds;
  const isEarlySubmitBlocked =
    mode === 'exam' &&
    userRole === 'student' &&
    timeSpentSeconds < minRequiredSeconds;
  const remainingEarlySeconds = Math.max(0, minRequiredSeconds - timeSpentSeconds);

  // Helper to submit exam (double-tap protected)
  const handleSubmitExam = useCallback((customReason?: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const timeSpent =
      mode === 'practice'
        ? practiceElapsedSeconds
        : Math.round((Date.now() - startTime) / 1000);
    const result = gradeEntireExam(exam, answers, timeSpent);
    
    // Attach candidate profile, anti-cheat metadata and settings snapshot
    result.studentName = candidateName;
    result.studentCode = studentCode;
    result.examCode = exam.examCode;
    result.tabSwitchCount = tabSwitchCount;
    if (customReason) {
      result.submissionReason = customReason;
    }
    result.showScoreAfterExam = exam.showScoreAfterExam ?? exam.settings?.showScoreAfterExam ?? true;
    result.showAnswersAfterExam = exam.showAnswersAfterExam ?? exam.settings?.showAnswersAfterExam ?? true;
    result.showOnlyStudentAnswersAfterExam = exam.showOnlyStudentAnswersAfterExam ?? false;

    const answerTexts: string[] = [];
    Object.values(answers).forEach((val) => {
      if (typeof val === 'string') {
        answerTexts.push(val);
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.values(val).forEach((subVal) => {
          if (typeof subVal === 'string') answerTexts.push(subVal);
        });
      }
    });
    const usedEssayImgs = collectUsedInlineImages(answerTexts, essayInlineImages);
    if (usedEssayImgs) {
      result.inlineImages = usedEssayImgs;
    }

    clearExamDraft(exam.id, mode);
    onComplete(result);
  }, [exam, answers, essayInlineImages, mode, practiceElapsedSeconds, startTime, tabSwitchCount, candidateName, studentCode, onComplete]);

  // Continuous automatic draft backup (on answer change, timer interval, and page hide)
  const persistDraftNow = useCallback(() => {
    if (isSubmittingRef.current) return;
    saveExamDraft({
      examId: exam.id,
      mode,
      answers,
      flagged,
      essayInlineImages: Object.keys(essayInlineImages).length > 0 ? essayInlineImages : undefined,
      currentIndex,
      remainingSeconds,
      practiceElapsedSeconds,
      practiceCursor: mode === 'practice' ? practiceCursor : undefined,
      practiceQueue: mode === 'practice' ? practiceQueue : undefined,
      savedAt: Date.now(),
    });
  }, [
    exam.id,
    mode,
    answers,
    flagged,
    essayInlineImages,
    currentIndex,
    remainingSeconds,
    practiceElapsedSeconds,
    practiceCursor,
    practiceQueue,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      persistDraftNow();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, flagged, essayInlineImages, currentIndex, persistDraftNow]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      persistDraftNow();
    }, 12000);
    const handleHide = () => {
      if (document.visibilityState === 'hidden') {
        persistDraftNow();
      }
    };
    window.addEventListener('pagehide', persistDraftNow);
    document.addEventListener('visibilitychange', handleHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', persistDraftNow);
      document.removeEventListener('visibilitychange', handleHide);
    };
  }, [persistDraftNow]);

  // Handle saving draft in-place
  const handleSaveDraftExam = () => {
    persistDraftNow();
    saveActiveSession({
      examId: exam.id,
      examCode: exam.examCode,
      candidateName,
      candidateCode: studentCode,
      mode,
      answers,
      flagged,
      essayInlineImages: Object.keys(essayInlineImages).length > 0 ? essayInlineImages : undefined,
      currentQuestionIndex: currentIndex,
      startTime,
      remainingSeconds,
      isSubmitted: false,
    });
    const nowTime = new Date().toLocaleTimeString('vi-VN');
    setSaveDraftToast(`✓ Đã lưu bài làm tạm thời thành công lúc ${nowTime}!`);
    setTimeout(() => setSaveDraftToast(null), 3500);
  };

  // Tab switch / visibilitychange listener
  useEffect(() => {
    if (mode !== 'exam') return;
    const maxSwitches = exam.maxTabSwitches ?? 0;
    if (maxSwitches <= 0) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount((prev) => {
          const next = prev + 1;
          if (next >= maxSwitches) {
            // Auto submit immediately!
            handleSubmitExam(`Tự động thu bài do rời màn hình quá số lần quy định (${next}/${maxSwitches} lần)`);
          } else {
            setShowTabSwitchWarning(true);
          }
          return next;
        });
      }
    };

    const handleWindowBlur = () => {
      // Secondary check for window losing focus
      setTabSwitchCount((prev) => {
        const next = prev + 1;
        if (next >= maxSwitches) {
          handleSubmitExam(`Tự động thu bài do rời màn hình quá số lần quy định (${next}/${maxSwitches} lần)`);
        } else {
          setShowTabSwitchWarning(true);
        }
        return next;
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [mode, exam.maxTabSwitches, handleSubmitExam]);

  // Anti-copy event interception
  useEffect(() => {
    if (!isAntiCopyEnabled) return;

    const isEditableElementTarget = (target: EventTarget | null) =>
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const handleCopy = (e: ClipboardEvent) => {
      if (isEditableElementTarget(e.target)) return;
      e.preventDefault();
      setCopyToastNotice('🚫 Chế độ phòng thi: Đã khóa tính năng sao chép (Copy) để đảm bảo tính công bằng!');
      setTimeout(() => setCopyToastNotice(null), 3500);
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isEditableElementTarget(e.target)) return;
      e.preventDefault();
      setCopyToastNotice('🚫 Chế độ phòng thi: Đã khóa thao tác chuột phải (Context Menu)!');
      setTimeout(() => setCopyToastNotice(null), 3500);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isEditingInput = isEditableElementTarget(e.target);
      if (isEditingInput && (e.ctrlKey || e.metaKey) && ['a', 'A', 'c', 'C', 'x', 'X', 'v', 'V'].includes(e.key)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ['c', 'C', 'u', 'U', 'p', 'P', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        setCopyToastNotice('🚫 Chế độ phòng thi: Phím tắt sao chép bị vô hiệu hóa!');
        setTimeout(() => setCopyToastNotice(null), 3500);
      }
      if (e.key === 'F12') {
        e.preventDefault();
      }
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCopy);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCopy);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAntiCopyEnabled]);

  // Lockdown room until timeout: prevent window close / refresh if lockExitUntilTimeout is on
  useEffect(() => {
    if (exam.lockExitUntilTimeout && mode === 'exam' && userRole === 'student' && remainingSeconds > 0) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = 'Phòng thi đang bị khóa cho đến khi hết giờ làm bài!';
        return 'Phòng thi đang bị khóa cho đến khi hết giờ làm bài!';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [exam.lockExitUntilTimeout, mode, userRole, remainingSeconds]);

  // Live score calculation
  const currentLiveEarnedPoints = useMemo(() => {
    if (!isLiveScoreVisible && mode !== 'practice') return 0;
    const graded = gradeEntireExam(exam, answers, 0);
    return graded.earnedPoints;
  }, [exam, answers, isLiveScoreVisible, mode]);

  // Timer countdown for exam mode, count-up from 00:00 for practice mode
  useEffect(() => {
    if (mode !== 'exam') return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam('Hết thời gian làm bài quy định');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, handleSubmitExam]);

  useEffect(() => {
    if (mode !== 'practice') return;

    const timer = setInterval(() => {
      setPracticeElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [mode]);

  const isQuestionCorrectForPractice = useCallback(
    (q?: Question): boolean => {
      if (!q) return true;
      const detail = gradeQuestion(q, answers[q.id]);
      if (q.type === 'essay') {
        return !detail.isSkipped;
      }
      return detail.isFullyCorrect;
    },
    [answers]
  );

  const handlePracticeNextOrFinish = () => {
    if (mode !== 'practice') {
      if (currentIndex < exam.questions.length - 1) {
        setCurrentIndex((prev) => Math.min(exam.questions.length - 1, prev + 1));
      } else if (isEarlySubmitBlocked) {
        setIsEarlySubmitNoticeOpen(true);
      } else {
        setIsSubmitModalOpen(true);
      }
      return;
    }

    const curItem = practiceQueue[practiceCursor];
    if (!curItem) {
      setIsSubmitModalOpen(true);
      return;
    }

    const curQ = exam.questions[curItem.qIndex];
    const isCorrect = isQuestionCorrectForPractice(curQ);
    const alreadyQueuedAhead = practiceQueue
      .slice(practiceCursor + 1)
      .some((it) => it.qIndex === curItem.qIndex);

    let nextQueue = practiceQueue;
    if (!isCorrect && !alreadyQueuedAhead) {
      nextQueue = [...practiceQueue, { qIndex: curItem.qIndex, isRetry: true }];
      setPracticeQueue(nextQueue);
      if (curQ?.id) {
        setRevealedExplanations((prev) => {
          if (!prev[curQ.id]) return prev;
          const copy = { ...prev };
          delete copy[curQ.id];
          return copy;
        });
      }
      setPracticeRetryToast(
        `Câu ${curItem.qIndex + 1} chưa chính xác — đã đưa xuống cuối để bạn làm lại!`
      );
      setTimeout(() => setPracticeRetryToast(null), 2800);
    }

    const nextCursor = practiceCursor + 1;
    if (nextCursor < nextQueue.length) {
      setPracticeCursor(nextCursor);
      setCurrentIndex(nextQueue[nextCursor].qIndex);
    } else {
      setIsSubmitModalOpen(true);
    }
  };

  const handlePracticePrev = () => {
    if (mode !== 'practice') {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (practiceCursor > 0) {
      const prevCursor = practiceCursor - 1;
      setPracticeCursor(prevCursor);
      setCurrentIndex(practiceQueue[prevCursor]?.qIndex ?? 0);
    }
  };

  const handleJumpToQuestion = (idx: number) => {
    if (mode !== 'practice') {
      setCurrentIndex(idx);
      return;
    }
    const foundAt = practiceQueue.findIndex((it, pos) => pos >= practiceCursor && it.qIndex === idx);
    const fallbackAt = foundAt !== -1 ? foundAt : practiceQueue.findIndex((it) => it.qIndex === idx);
    if (fallbackAt !== -1) {
      setPracticeCursor(fallbackAt);
    }
    setCurrentIndex(idx);
  };

  // Sync browser fullscreen state
  useEffect(() => {
    const syncFs = () => {
      const docAny = document as any;
      setIsFullscreen(Boolean(document.fullscreenElement || docAny.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  // Fullscreen toggle (locked exams cannot manually exit fullscreen)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void tryEnterKioskFullscreen().then((res) => {
        if (res.ok) setIsFullscreen(true);
      });
    } else if (!isRoomLockActive) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    } else {
      setIsLockdownNoticeOpen(true);
    }
  };

  const formatTime = (secs: number) => {
    const safe = Math.max(0, Math.floor(secs));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Check if a question is answered
  const isQuestionAnswered = useCallback((q: Question) => {
    const ans = answers[q.id];
    if (ans === undefined || ans === null) return false;

    if (q.type === 'single_choice') {
      return typeof ans === 'number';
    }
    if (q.type === 'multiple_choice') {
      return Array.isArray(ans) && ans.length > 0;
    }
    if (q.type === 'true_false') {
      const map = ans as { [itemId: string]: boolean };
      const items = q.tfItems || [];
      return items.length > 0 && items.every((item) => map[item.id] !== undefined);
    }
    if (q.type === 'text_input' || q.type === 'essay') {
      return typeof ans === 'string' && ans.trim().length > 0;
    }
    if (q.type === 'matching') {
      const map = ans as { [leftId: string]: string };
      const leftItems = q.matchingLeftItems || [];
      return (
        leftItems.length > 0 &&
        leftItems.every((item) => {
          const val = map[item.id];
          if (!val) return false;
          if (val.startsWith('__raw__:')) {
            return val.slice('__raw__:'.length).trim().length > 0;
          }
          return val.trim().length > 0;
        })
      );
    }
    if (q.type === 'grouped') {
      const subMap = ans as { [subId: string]: CandidateAnswerValue };
      const subQs = q.subQuestions || [];
      return subQs.length > 0 && subQs.some((sub) => subMap[sub.id] !== undefined && subMap[sub.id] !== null);
    }
    return false;
  }, [answers]);

  const answeredCount = exam.questions.filter((q) => isQuestionAnswered(q)).length;
  const unansweredCount = exam.questions.length - answeredCount;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  // Handlers for answering current question
  const handleSetSingleChoice = (optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIndex }));
  };

  const handleToggleMultipleChoice = (optIdx: number) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[currentQuestion.id])
        ? [...(prev[currentQuestion.id] as number[])]
        : [];
      const existsIdx = current.indexOf(optIdx);
      if (existsIdx > -1) {
        current.splice(existsIdx, 1);
      } else {
        current.push(optIdx);
      }
      return {
        ...prev,
        [currentQuestion.id]: current.sort((a, b) => a - b),
      };
    });
  };

  const handleSetTrueFalse = (itemId: string, choice: boolean) => {
    setAnswers((prev) => {
      const currentMap = (prev[currentQuestion.id] as { [id: string]: boolean }) || {};
      return {
        ...prev,
        [currentQuestion.id]: {
          ...currentMap,
          [itemId]: choice,
        },
      };
    });
  };

  const handleSetTextInput = (text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: text,
    }));
  };

  const handleSetMatching = (updatedMap: { [leftId: string]: string }) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: updatedMap,
    }));
  };

  const handleSetGroupedSubAnswer = (subQId: string, value: CandidateAnswerValue) => {
    setAnswers((prev) => {
      const currentSubMap = (prev[currentQuestion.id] as { [id: string]: CandidateAnswerValue }) || {};
      return {
        ...prev,
        [currentQuestion.id]: {
          ...currentSubMap,
          [subQId]: value,
        },
      };
    });
  };

  const handleSetGroupedSubTrueFalse = (subQId: string, itemId: string, val: boolean) => {
    setAnswers((prev) => {
      const currentSubMap = (prev[currentQuestion.id] as { [id: string]: CandidateAnswerValue }) || {};
      const currentSubAns = (currentSubMap[subQId] as { [id: string]: boolean }) || {};
      return {
        ...prev,
        [currentQuestion.id]: {
          ...currentSubMap,
          [subQId]: {
            ...currentSubAns,
            [itemId]: val,
          },
        },
      };
    });
  };

  const handleToggleGroupedSubMultipleChoice = (subQId: string, optIdx: number) => {
    setAnswers((prev) => {
      const currentSubMap = (prev[currentQuestion.id] as { [id: string]: CandidateAnswerValue }) || {};
      const currentList = Array.isArray(currentSubMap[subQId]) ? [...(currentSubMap[subQId] as number[])] : [];
      const exIdx = currentList.indexOf(optIdx);
      if (exIdx > -1) currentList.splice(exIdx, 1);
      else currentList.push(optIdx);
      return {
        ...prev,
        [currentQuestion.id]: {
          ...currentSubMap,
          [subQId]: currentList.sort((a, b) => a - b),
        },
      };
    });
  };

  const handleClearCurrentAnswer = () => {
    const newAnswers = { ...answers };
    delete newAnswers[currentQuestion.id];
    setAnswers(newAnswers);
  };

  const renderAnswerForm = () => {
    return (
      <div className="space-y-4">
        {/* FORMAT 1: Single Choice */}
        {currentQuestion.type === 'single_choice' && (
          <div className="space-y-3">
            {(currentQuestion.options || []).map((optText, optIdx) => {
              const isSelected = answers[currentQuestion.id] === optIdx;
              const letter = String.fromCharCode(65 + optIdx);
              const isRevealed = revealedExplanations[currentQuestion.id];
              const isCorrect = currentQuestion.correctAnswer === optIdx;

              let stateClasses = 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/20';
              let letterClasses = 'bg-slate-100 text-slate-700 border-slate-200';

              if (isSelected) {
                stateClasses = 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500';
                letterClasses = 'bg-blue-600 text-white border-blue-600';
              }

              if (mode === 'practice' && isRevealed) {
                if (isCorrect) {
                  stateClasses = 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500';
                  letterClasses = 'bg-emerald-600 text-white border-emerald-600';
                } else if (isSelected && !isCorrect) {
                  stateClasses = 'bg-rose-50 border-rose-500 text-rose-950 ring-1 ring-rose-500';
                  letterClasses = 'bg-rose-600 text-white border-rose-600';
                }
              }

              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => handleSetSingleChoice(optIdx)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-150 flex items-start gap-3.5 cursor-pointer ${stateClasses}`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border mt-0.5 ${letterClasses}`}
                  >
                    {letter}
                  </span>
                  <div
                    className={`flex-1 leading-relaxed ${
                      fontSize === 'large' ? 'text-base' : 'text-sm'
                    }`}
                  >
                    <RichContentRenderer content={optText} inlineImages={currentQuestion.inlineImages} />
                    {currentQuestion.optionImages?.[optIdx] && (
                      <div className="mt-2.5">
                        <ResilientImage
                          src={currentQuestion.optionImages[optIdx]}
                          alt={`Phương án ${letter}`}
                          fallbackLabel={`Phương án ${letter}`}
                          className="max-h-48 rounded-lg border border-slate-200 object-contain bg-white shadow-2xs"
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* FORMAT 2: Multiple Choice (Nhiều phương án đúng) */}
        {currentQuestion.type === 'multiple_choice' && (
          <div className="space-y-3">
            <div className="text-xs text-blue-800 bg-blue-50/70 p-2.5 rounded-lg border border-blue-200 flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Dạng chọn <strong>nhiều phương án đúng</strong> (nhấp để chọn hoặc bỏ chọn).</span>
            </div>
            {(currentQuestion.options || []).map((optText, optIdx) => {
              const selectedArr = Array.isArray(answers[currentQuestion.id])
                ? (answers[currentQuestion.id] as number[])
                : [];
              const isSelected = selectedArr.includes(optIdx);
              const letter = String.fromCharCode(65 + optIdx);
              const isRevealed = revealedExplanations[currentQuestion.id];
              const isCorrectOption = (currentQuestion.correctAnswers || []).includes(optIdx);

              let stateClasses = 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/20';
              let letterClasses = 'bg-slate-100 text-slate-700 border-slate-200';

              if (isSelected) {
                stateClasses = 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500';
                letterClasses = 'bg-blue-600 text-white border-blue-600';
              }

              if (mode === 'practice' && isRevealed) {
                if (isCorrectOption) {
                  stateClasses = 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500';
                  letterClasses = 'bg-emerald-600 text-white border-emerald-600';
                } else if (isSelected && !isCorrectOption) {
                  stateClasses = 'bg-rose-50 border-rose-500 text-rose-950 ring-1 ring-rose-500';
                  letterClasses = 'bg-rose-600 text-white border-rose-600';
                }
              }

              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => handleToggleMultipleChoice(optIdx)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-150 flex items-start gap-3.5 cursor-pointer ${stateClasses}`}
                >
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400" />
                    )}
                    <span
                      className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center border ${letterClasses}`}
                    >
                      {letter}
                    </span>
                  </div>
                  <div
                    className={`flex-1 leading-relaxed ${
                      fontSize === 'large' ? 'text-base' : 'text-sm'
                    }`}
                  >
                    <RichContentRenderer content={optText} inlineImages={currentQuestion.inlineImages} />
                    {currentQuestion.optionImages?.[optIdx] && (
                      <div className="mt-2.5">
                        <ResilientImage
                          src={currentQuestion.optionImages[optIdx]}
                          alt={`Phương án ${letter}`}
                          fallbackLabel={`Phương án ${letter}`}
                          className="max-h-48 rounded-lg border border-slate-200 object-contain bg-white shadow-2xs"
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* FORMAT 3: True / False */}
        {currentQuestion.type === 'true_false' && (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-semibold">{formatTrueFalseScoringRule(currentQuestion)}</span>
              </div>
              <span className="text-[11px] text-emerald-700 italic">
                * Chọn <strong>ĐÚNG</strong> hoặc <strong>SAI</strong> cho từng ý bên dưới:
              </span>
            </div>
            {(currentQuestion.tfItems || []).map((item, itemIdx) => {
              const letter = String.fromCharCode(97 + itemIdx);
              const ansMap = (answers[currentQuestion.id] as { [id: string]: boolean }) || {};
              const userChoice = ansMap[item.id];
              const defaultItemPoint = (currentQuestion.points || 1.0) / (currentQuestion.tfItems?.length || 1);
              const itemPoints = item.points !== undefined && item.points > 0 ? item.points : defaultItemPoint;

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-slate-200">
                      {letter})
                    </span>
                    <div className="text-sm text-slate-900 leading-relaxed">
                      <RichContentRenderer content={item.statement} inlineImages={currentQuestion.inlineImages} />
                      <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                        ({itemPoints.toFixed(2)} điểm)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleSetTrueFalse(item.id, true)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        userChoice === true
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                    >
                      ĐÚNG
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTrueFalse(item.id, false)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        userChoice === false
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700'
                      }`}
                    >
                      SAI
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FORMAT 4: Text Input */}
        {currentQuestion.type === 'text_input' && (
          <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-700">
                Nhập câu trả lời vào ô (số thập phân viết bằng dấu phẩy &quot;,&quot;, vd: 3,5):
              </label>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] text-slate-400 mr-1 hidden md:inline">Chèn tại vị trí trỏ:</span>
                {[
                  { label: '√x', insert: '√(' },
                  { label: '∛x', insert: '∛(' },
                  { label: 'u⃗', insert: '\\vec{u}' },
                  { label: 'AB→', insert: '\\overrightarrow{AB}' },
                  { label: 'π', insert: 'π' },
                  { label: '²', insert: '²' },
                  { label: ',', insert: ',' },
                  { label: '/', insert: '/' },
                  { label: '±', insert: '±' },
                ].map((m, mIdx) => (
                  <button
                    key={mIdx}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!insertTextAtEditableElement(shortAnswerInputRef.current, m.insert)) {
                        const currentVal = (answers[currentQuestion.id] as string) || '';
                        handleSetTextInput(currentVal + m.insert);
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-colors cursor-pointer ${
                      m.label.includes('√')
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                    title={`Chèn ký hiệu ${m.label} tại vị trí con trỏ`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={shortAnswerInputRef}
                type="text"
                value={(answers[currentQuestion.id] as string) || ''}
                onChange={(e) => handleSetTextInput(e.target.value)}
                onBlur={(e) => {
                  const formatted = formatShortAnswerDecimalComma(e.target.value);
                  if (formatted !== e.target.value) {
                    handleSetTextInput(formatted);
                  }
                }}
                placeholder="Ví dụ: 3,5 hoặc 7/2..."
                className="flex-1 px-4 py-3 text-sm md:text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono shadow-2xs select-text"
              />
              {(answers[currentQuestion.id] as string) && (
                <button
                  type="button"
                  onClick={() => handleSetTextInput('')}
                  className="p-3 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  title="Xóa nội dung"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* FORMAT 4c: Essay / Online Text & Formula Editor */}
        {currentQuestion.type === 'essay' && (
          <div className="p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Soạn thảo bài làm tự luận trực tuyến (đặt con trỏ chuột ở đâu sẽ chèn công thức hoặc ảnh ngay tại đó):
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Hỗ trợ văn bản, tiêu đề, danh sách nhiều cấp, công thức Toán $...$, tải ảnh hoặc Ctrl+V dán ảnh tại vị trí con trỏ.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CopyContentButton
                  compact
                  getText={() => (answers[currentQuestion.id] as string) || ''}
                  title="Sao chép toàn bộ nội dung bài làm tự luận"
                />
                <button
                  type="button"
                  onClick={() => setShowEssayPreview((v) => !v)}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showEssayPreview ? 'Ẩn xem trước' : 'Hiện xem trước'}</span>
                </button>
              </div>
            </div>

            <MathToolbar
              targetRef={essayTextareaRef}
              onInsert={(snippet) => {
                if (!insertTextAtEditableElement(essayTextareaRef.current, snippet)) {
                  const cur = (answers[currentQuestion.id] as string) || '';
                  const isBlock = snippet.trim().startsWith('|') || snippet.includes('\n');
                  handleSetTextInput(cur ? (isBlock ? `${cur}\n${snippet}` : `${cur} ${snippet}`) : snippet);
                }
              }}
              onInsertInlineImage={(imgId, imgSrc, title) => {
                registerImplicitImage(imgSrc, imgId);
                setEssayInlineImages((prev) => ({ ...prev, [imgId]: imgSrc }));
                const token = formatInlineImageToken(imgId, title);
                if (!insertTextAtEditableElement(essayTextareaRef.current, token)) {
                  const cur = (answers[currentQuestion.id] as string) || '';
                  handleSetTextInput(cur ? `${cur}\n${token}` : token);
                }
              }}
            />

            <textarea
              ref={essayTextareaRef}
              rows={8}
              value={(answers[currentQuestion.id] as string) || ''}
              onChange={(e) => handleSetTextInput(e.target.value)}
              onPaste={(e) => {
                const file = extractImageFileFromClipboardEvent(e.nativeEvent);
                if (!file) return;
                e.preventDefault();
                const el = e.currentTarget;
                const range = {
                  start: typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length,
                  end: typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length,
                };
                void processImageFile(file, 1200, 0.85)
                  .then((compressed) => uploadImageOrKeepFallback(compressed, 'exam_essay_image.png'))
                  .then((finalSrc) => {
                    setEssayPasteModal({
                      imageSrc: finalSrc,
                      defaultTitle: 'Hình bài làm',
                      el,
                      range,
                    });
                  })
                  .catch(() => {});
              }}
              placeholder="Nhập nội dung bài làm tự luận của bạn tại đây (có thể bấm nút Chèn ảnh hoặc nhấn Ctrl+V để dán ảnh)..."
              className="w-full p-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono leading-relaxed select-text"
            />

            <InlineImageStrip
              content={(answers[currentQuestion.id] as string) || ''}
              inlineImages={essayInlineImages}
              label="Ảnh đã chèn trong bài tự luận"
              onUpdateContent={(next) => handleSetTextInput(next)}
            />

            {showEssayPreview && typeof answers[currentQuestion.id] === 'string' && (answers[currentQuestion.id] as string).trim() && (
              <div className="p-3.5 bg-white border border-blue-200 rounded-xl space-y-1.5 select-text">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                  Xem trước bài tự luận đã hiển thị công thức &amp; ảnh:
                </div>
                <div className="text-sm text-slate-900 leading-relaxed">
                  <RichContentRenderer
                    content={answers[currentQuestion.id] as string}
                    inlineImages={essayInlineImages}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* FORMAT 4b: Matching (Ghép đôi hai cột) */}
        {currentQuestion.type === 'matching' && (
          <MatchingQuestionView
            question={currentQuestion}
            mode="taking"
            userAnswer={
              (answers[currentQuestion.id] as { [leftId: string]: string }) || {}
            }
            onChange={handleSetMatching}
            fontSize={fontSize}
          />
        )}

        {/* FORMAT 5: Grouped Questions (Câu hỏi chùm: hỗ trợ đơn, nhiều, đúng/sai, trả lời ngắn) */}
        {currentQuestion.type === 'grouped' && (
          <div className="space-y-6 pt-2">
            <div className="text-xs font-bold text-purple-800 uppercase tracking-wide">
              Các câu hỏi con trong chùm:
            </div>

            {(currentQuestion.subQuestions || []).map((subQ, subIdx) => {
              const subAnsMap = (answers[currentQuestion.id] as { [subId: string]: CandidateAnswerValue }) || {};
              const subAns = subAnsMap[subQ.id];

              return (
                <div
                  key={subQ.id}
                  className="p-5 rounded-xl border border-purple-200 bg-purple-50/20 space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-purple-100">
                    <span className="font-bold text-xs sm:text-sm text-purple-950">
                      Câu {currentIndex + 1}.{subIdx + 1}
                    </span>
                    <span className="font-mono text-xs font-semibold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded">
                      {subQ.points || 1.0} điểm
                    </span>
                  </div>

                  <div className="text-sm font-medium text-slate-900 leading-relaxed">
                    <RichContentRenderer
                      content={subQ.question}
                      imageUrl={subQ.imageUrl}
                      imageCaption={subQ.imageCaption}
                      inlineImages={subQ.inlineImages || currentQuestion.inlineImages}
                    />
                  </div>

                  {/* SubQ: Single choice */}
                  {subQ.type === 'single_choice' && (
                    <div className="space-y-2">
                      {(subQ.options || []).map((optText, optIdx) => {
                        const isSelected = subAns === optIdx;
                        const letter = String.fromCharCode(65 + optIdx);
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleSetGroupedSubAnswer(subQ.id, optIdx)}
                            className={`w-full text-left p-3 rounded-lg border text-xs sm:text-sm flex items-start gap-3 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-purple-100/80 border-purple-400 text-purple-950 font-medium ring-1 ring-purple-400'
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded font-bold text-xs flex items-center justify-center shrink-0 border ${
                              isSelected ? 'bg-purple-700 text-white border-purple-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {letter}
                            </span>
                            <div className="flex-1 leading-relaxed">
                              <RichContentRenderer
                                content={optText}
                                inlineImages={subQ.inlineImages || currentQuestion.inlineImages}
                              />
                              {subQ.optionImages?.[optIdx] && (
                                <div className="mt-2">
                                  <ResilientImage
                                    src={subQ.optionImages[optIdx]}
                                    alt={`Ý ${letter}`}
                                    fallbackLabel={`Ý ${letter}`}
                                    className="max-h-36 rounded-lg border border-purple-200 object-contain bg-white shadow-2xs"
                                  />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* SubQ: Multiple choice */}
                  {subQ.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-purple-800 font-semibold mb-1">
                        * Chọn một hoặc nhiều phương án:
                      </div>
                      {(subQ.options || []).map((optText, optIdx) => {
                        const subArr = Array.isArray(subAns) ? (subAns as number[]) : [];
                        const isSelected = subArr.includes(optIdx);
                        const letter = String.fromCharCode(65 + optIdx);
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleToggleGroupedSubMultipleChoice(subQ.id, optIdx)}
                            className={`w-full text-left p-3 rounded-lg border text-xs sm:text-sm flex items-start gap-3 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-purple-100/80 border-purple-400 text-purple-950 font-medium ring-1 ring-purple-400'
                                : 'bg-white border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-purple-700" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                              <span className={`w-6 h-6 rounded font-bold text-xs flex items-center justify-center border ${
                                isSelected ? 'bg-purple-700 text-white border-purple-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {letter}
                              </span>
                            </div>
                            <div className="flex-1 leading-relaxed">
                              <RichContentRenderer
                                content={optText}
                                inlineImages={subQ.inlineImages || currentQuestion.inlineImages}
                              />
                              {subQ.optionImages?.[optIdx] && (
                                <div className="mt-2">
                                  <ResilientImage
                                    src={subQ.optionImages[optIdx]}
                                    alt={`Ý ${letter}`}
                                    fallbackLabel={`Ý ${letter}`}
                                    className="max-h-36 rounded-lg border border-purple-200 object-contain bg-white shadow-2xs"
                                  />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* SubQ: True / False */}
                  {subQ.type === 'true_false' && (
                    <div className="space-y-3">
                      {subQ.tfItems && subQ.tfItems.length > 0 ? (
                        <div className="space-y-2">
                          {subQ.tfItems.map((item, tfIdx) => {
                            const tfMap = (subAns as { [id: string]: boolean }) || {};
                            const userChoice = tfMap[item.id];
                            return (
                              <div
                                key={item.id}
                                className="p-3 bg-white rounded-lg border border-purple-100 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="text-slate-800 flex-1">
                                  {String.fromCharCode(97 + tfIdx)}) <RichContentRenderer content={item.statement} inlineImages={subQ.inlineImages || currentQuestion.inlineImages} />
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleSetGroupedSubTrueFalse(subQ.id, item.id, true)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded ${
                                      userChoice === true
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                                    }`}
                                  >
                                    Đúng
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetGroupedSubTrueFalse(subQ.id, item.id, false)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded ${
                                      userChoice === false
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                                    }`}
                                  >
                                    Sai
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleSetGroupedSubAnswer(subQ.id, true)}
                            className={`px-4 py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                              subAns === true
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                            }`}
                          >
                            ĐÚNG
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetGroupedSubAnswer(subQ.id, false)}
                            className={`px-4 py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                              subAns === false
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                            }`}
                          >
                            SAI
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SubQ: Text input (Trả lời ngắn) */}
                  {subQ.type === 'text_input' && (
                    <input
                      type="text"
                      value={(subAns as string) || ''}
                      onChange={(e) => handleSetGroupedSubAnswer(subQ.id, e.target.value)}
                      onBlur={(e) => {
                        const formatted = formatShortAnswerDecimalComma(e.target.value);
                        if (formatted !== e.target.value) {
                          handleSetGroupedSubAnswer(subQ.id, formatted);
                        }
                      }}
                      placeholder="Nhập câu trả lời ngắn (số thập phân dùng dấu phẩy, vd: 3,5)..."
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 font-mono"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };


  return (
    <div className={`min-h-screen bg-slate-100 flex flex-col font-sans pb-20 lg:pb-0 ${isAntiCopyEnabled ? 'select-none' : 'select-text'}`}>
      {/* Top Test-Taking Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 shadow-xs">
        {/* Left: Exam title & mode */}
        <div className="flex items-center gap-3 min-w-0">
          {!(isOfficialLocked && userRole === 'student') ? (
            <button
              onClick={() => {
                if (exam.lockExitUntilTimeout && mode === 'exam' && userRole === 'student' && remainingSeconds > 0) {
                  setIsLockdownNoticeOpen(true);
                } else {
                  setIsExitConfirmOpen(true);
                }
              }}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Thoát phòng thi"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div
              className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold flex items-center gap-1 shrink-0"
              title="Chế độ khóa điều hướng kỳ thi chính thức đang bật"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thi chính thức</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-slate-900 truncate">
              {exam.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
              {candidateName && (
                <span className="font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Thí sinh: {candidateName} {studentCode && `(${studentCode})`}
                </span>
              )}
              {exam.examCode && (
                <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Mã đề: {exam.examCode}
                </span>
              )}
              <span>{exam.grade}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-medium ${mode === 'exam' ? 'text-blue-700' : 'text-amber-700'}`}>
                {mode === 'exam' ? 'Thi Thật (Chuẩn Giờ)' : 'Luyện Tập Tự Do'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700 font-semibold">
                Tổng điểm: {exam.totalPoints || 10}đ
              </span>
            </div>
          </div>
        </div>

        {/* Center: Countdown Timer (exam) or Count-up Timer (practice) & Live Score */}
        <div className="flex items-center gap-2">
          {mode === 'exam' ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
              <Clock className={`w-4 h-4 ${remainingSeconds <= 300 ? 'text-rose-600 animate-pulse' : 'text-blue-600'}`} />
              <span
                className={`font-mono text-base font-bold tabular-nums ${
                  remainingSeconds <= 300 ? 'text-rose-600' : 'text-slate-800'
                }`}
              >
                {formatTime(remainingSeconds)}
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg"
              title="Thời gian luyện tập (đếm xuôi từ 00:00)"
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="font-mono text-base font-bold tabular-nums text-slate-800">
                {formatTime(practiceElapsedSeconds)}
              </span>
            </div>
          )}

          {/* Live Score if enabled */}
          {(isLiveScoreVisible || mode === 'practice') && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs font-mono font-bold text-amber-900 shadow-2xs"
              title="Điểm số tạm tính tích lũy được trong bài làm"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Điểm: {currentLiveEarnedPoints.toFixed(2)}/{exam.totalPoints || 10}đ</span>
            </div>
          )}
        </div>

        {/* Right Tools & Submit Action */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Instructions Button */}
          {exam.instructions && (
            <button
              onClick={() => setShowInstructionsModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
              title="Xem hướng dẫn làm bài thi"
            >
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hướng dẫn</span>
            </button>
          )}

          {/* Preview Exam Paper Button */}
          <button
            onClick={() => setShowPreviewModal(true)}
            className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Xem thử toàn bộ đề thi (Full test sheet)"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Xem thử đề</span>
          </button>

          {/* Mini Calculator Toggle */}
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className={`p-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              showCalculator
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Mở máy tính cầm tay"
          >
            <CalcIcon className="w-4 h-4" />
            <span className="hidden lg:inline">Máy tính</span>
          </button>

          {/* Scratchpad Toggle */}
          <button
            onClick={() => setShowScratchpad(!showScratchpad)}
            className={`p-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              showScratchpad
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Mở bảng nháp"
          >
            <Edit3 className="w-4 h-4" />
            <span className="hidden lg:inline">Bảng nháp</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className={`hidden md:flex p-2 rounded-lg border transition-colors cursor-pointer ${
              isRoomLockActive
                ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                : 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200'
            }`}
            title={
              isRoomLockActive
                ? 'Phòng thi đang khóa toàn màn hình'
                : isFullscreen
                ? 'Thu nhỏ'
                : 'Toàn màn hình'
            }
          >
            {isRoomLockActive ? (
              <Lock className="w-4 h-4" />
            ) : isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          {/* Split Screen Toggle Button */}
          <button
            onClick={() => setIsSplitView(!isSplitView)}
            className={`hidden md:flex p-2 rounded-lg border text-xs font-semibold transition-colors items-center gap-1.5 cursor-pointer shadow-2xs ${
              isSplitView
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title={isSplitView ? 'Đang bật chia đôi màn hình: Nhấp để chuyển về chế độ 1 cột' : 'Bật chế độ chia đôi màn hình: Đọc đề bên trái & Làm bài bên phải'}
          >
            <Columns2 className="w-4 h-4" />
            <span className="hidden xl:inline">{isSplitView ? 'Chia đôi màn hình: Bật' : 'Chia đôi màn hình'}</span>
          </button>

          {/* Submit Button */}
          <button
            onClick={() => {
              if (isEarlySubmitBlocked) {
                setIsEarlySubmitNoticeOpen(true);
              } else {
                setIsSubmitModalOpen(true);
              }
            }}
            className={`py-1.5 px-4 text-xs md:text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer ${
              isEarlySubmitBlocked
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
            }`}
            title={isEarlySubmitBlocked ? `Chưa đến giờ nộp bài: Còn ${formatTime(remainingEarlySeconds)} nữa mới được nộp!` : 'Nộp bài thi'}
          >
            {isEarlySubmitBlocked ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            <span>{isEarlySubmitBlocked ? `Đúng giờ mới nộp (${formatTime(remainingEarlySeconds)})` : 'Nộp bài'}</span>
          </button>
        </div>
      </header>

      {/* Exam Instructions Banner (if provided and not dismissed) */}
      {exam.instructions && (
        <div className="bg-blue-50/90 border-b border-blue-200 px-4 md:px-6 py-2.5 text-xs text-blue-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="font-semibold shrink-0">Hướng dẫn làm bài:</span>
            <span className="truncate text-blue-900">{exam.instructions}</span>
          </div>
          <button
            onClick={() => setShowInstructionsModal(true)}
            className="text-xs font-bold text-blue-700 hover:underline shrink-0 cursor-pointer"
          >
            Xem đầy đủ
          </button>
        </div>
      )}

      {/* Main Container: Full Width in Practice Mode (No Question Grid), 2-Column in Exam Mode */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Question Box (12 cols in practice mode, 8 cols in exam mode) */}
        <main
          ref={questionContainerRef}
          className={`${mode === 'practice' ? 'lg:col-span-12' : 'lg:col-span-8'} bg-white rounded-xl border border-slate-200 p-4 sm:p-6 md:p-8 shadow-xs flex flex-col justify-between min-h-[480px] sm:min-h-[580px]`}
        >
          <div key={`${currentQuestion.id}_${practiceCursor}`}>
            {mode === 'practice' && activePracticeItem?.isRetry && (
              <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Câu ôn lại ở cuối bài: Lượt trước câu này chưa chính xác. Hãy kiểm tra và chọn lại đáp án đúng!
                  </span>
                </div>
              </div>
            )}

            {/* Question Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-3 flex-wrap">
                {(() => {
                  const activeCluster = isGroupedByType
                    ? questionClusters.find((c) => c.items.some((item) => item.flatIndex === effectiveQuestionIndex))
                    : undefined;
                  if (!activeCluster) return null;
                  const idxInCluster = activeCluster.items.findIndex((item) => item.flatIndex === effectiveQuestionIndex);
                  return (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
                      Phần {activeCluster.roman} · {activeCluster.shortLabel} ({idxInCluster + 1}/{activeCluster.items.length})
                    </span>
                  );
                })()}

                <span className="text-base font-bold text-slate-900">
                  {mode === 'practice'
                    ? `Câu ${effectiveQuestionIndex + 1}`
                    : `Câu ${effectiveQuestionIndex + 1} / ${exam.questions.length}`}
                </span>

                {mode === 'practice' && activePracticeItem?.isRetry && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                    Ôn lại câu sai
                  </span>
                )}

                {/* Question Type Badge */}
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  {currentQuestion.type === 'single_choice' && 'Trắc nghiệm đơn'}
                  {currentQuestion.type === 'multiple_choice' && 'Chọn nhiều đáp án'}
                  {currentQuestion.type === 'true_false' && 'Trắc nghiệm Đúng / Sai'}
                  {currentQuestion.type === 'text_input' && 'Trả lời ngắn'}
                  {currentQuestion.type === 'matching' && 'Ghép đôi hai cột'}
                  {currentQuestion.type === 'grouped' && 'Câu hỏi chùm'}
                  {currentQuestion.type === 'essay' && 'Tự luận / Soạn thảo'}
                </span>

                {/* Question Points Badge */}
                <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {currentQuestion.points || 1.0} điểm
                </span>

                {currentQuestion.topic && (
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    · {currentQuestion.topic}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Flag button */}
                <button
                  onClick={() =>
                    setFlagged((prev) => ({
                      ...prev,
                      [currentQuestion.id]: !prev[currentQuestion.id],
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    flagged[currentQuestion.id]
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Đánh dấu câu hỏi để kiểm tra lại trước khi nộp bài"
                >
                  <Flag
                    className={`w-3.5 h-3.5 ${
                      flagged[currentQuestion.id] ? 'fill-amber-500 text-amber-600' : ''
                    }`}
                  />
                  <span>{flagged[currentQuestion.id] ? 'Đã đánh dấu' : 'Đánh dấu'}</span>
                </button>

                {/* Quick Edit Question button - Only for teachers */}
                {userRole === 'teacher' && (
                  <button
                    onClick={() => setEditingQuestion(currentQuestion)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    title="Quyền giáo viên: Nhấp để viết lại câu hỏi, đổi công thức, sửa đáp án hoặc xóa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Sửa câu này</span>
                  </button>
                )}
              </div>
            </div>

            {/* Split Screen vs Single Column Question & Answer Flow */}
            {currentQuestion.type === 'matching' ? (
              renderAnswerForm()
            ) : isSplitView ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Problem Statement & Passage */}
                <div className="lg:col-span-6 bg-slate-50/70 p-5 rounded-2xl border border-slate-200 lg:max-h-[68vh] lg:overflow-y-auto space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      Đọc đề bài & Ngữ liệu
                    </span>
                    <span className="text-[11px] text-slate-400">Cuộn xem độc lập</span>
                  </div>
                  <div
                    className={`font-medium text-slate-900 leading-relaxed ${
                      fontSize === 'large' ? 'text-lg md:text-xl' : 'text-base md:text-lg'
                    }`}
                  >
                    <RichContentRenderer
                      content={currentQuestion.question}
                      imageUrl={currentQuestion.imageUrl}
                      imageCaption={currentQuestion.imageCaption}
                      inlineImages={currentQuestion.inlineImages}
                    />
                  </div>
                </div>

                {/* Right Column: Answers & Inputs */}
                <div className="lg:col-span-6 lg:max-h-[68vh] lg:overflow-y-auto space-y-4 pr-1">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      Phiếu chọn phương án
                    </span>
                    <span className="text-[11px] text-blue-600 font-medium">Cuộn chọn đáp án</span>
                  </div>
                  {renderAnswerForm()}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <div
                    className={`font-medium text-slate-900 leading-relaxed ${
                      fontSize === 'large' ? 'text-lg md:text-xl' : 'text-base md:text-lg'
                    }`}
                  >
                    <RichContentRenderer
                      content={currentQuestion.question}
                      imageUrl={currentQuestion.imageUrl}
                      imageCaption={currentQuestion.imageCaption}
                      inlineImages={currentQuestion.inlineImages}
                    />
                  </div>
                </div>
                {renderAnswerForm()}
              </div>
            )}


            {/* In Practice Mode: Explanation Reveal */}
            {mode === 'practice' && (
              <div className="mt-8 pt-4 border-t border-slate-100">
                {!revealedExplanations[currentQuestion.id] ? (
                  <button
                    onClick={() =>
                      setRevealedExplanations((prev) => ({
                        ...prev,
                        [currentQuestion.id]: true,
                      }))
                    }
                    className="py-2 px-3 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <span>Xem đáp án & giải thích chi tiết</span>
                  </button>
                ) : (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs md:text-sm text-emerald-950 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Hướng dẫn giải chi tiết:</span>
                    </div>
                    {(currentQuestion.explanation || currentQuestion.explanationImageUrl) && (
                      <div className="text-slate-800 leading-relaxed pl-6 border-l-2 border-emerald-400">
                        <RichContentRenderer
                          content={currentQuestion.explanation || ''}
                          imageUrl={currentQuestion.explanationImageUrl}
                          imageCaption={currentQuestion.explanationImageCaption}
                          inlineImages={currentQuestion.inlineImages}
                        />
                      </div>
                    )}
                    {currentQuestion.type === 'grouped' &&
                      (currentQuestion.subQuestions || []).some(
                        (s) => s.explanation || s.explanationImageUrl
                      ) && (
                        <div className="space-y-2 pl-6 border-l-2 border-purple-300">
                          {(currentQuestion.subQuestions || []).map((subQ, sIdx) =>
                            subQ.explanation || subQ.explanationImageUrl ? (
                              <div key={subQ.id} className="text-xs text-slate-800 space-y-1">
                                <div className="font-bold text-purple-900">
                                  Câu {currentIndex + 1}.{sIdx + 1}:
                                </div>
                                <RichContentRenderer
                                  content={subQ.explanation || ''}
                                  imageUrl={subQ.explanationImageUrl}
                                  imageCaption={subQ.explanationImageCaption}
                                  inlineImages={subQ.inlineImages || currentQuestion.inlineImages}
                                />
                              </div>
                            ) : null
                          )}
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Question Navigation Controls */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePracticePrev}
                disabled={mode === 'practice' ? practiceCursor === 0 : currentIndex === 0}
                className="py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Câu trước</span>
              </button>

              {answers[currentQuestion.id] !== undefined && (
                <button
                  onClick={handleClearCurrentAnswer}
                  className="py-2 px-2.5 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="Xóa câu trả lời đã làm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bỏ chọn</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {practiceRetryToast && (
                <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                  {practiceRetryToast}
                </span>
              )}

              {(mode === 'practice'
                ? practiceCursor < practiceQueue.length - 1
                : currentIndex < exam.questions.length - 1) ? (
                <button
                  onClick={handlePracticeNextOrFinish}
                  className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <span>Câu tiếp</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handlePracticeNextOrFinish}
                  className={`py-2 px-4 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer ${
                    isEarlySubmitBlocked
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'text-white bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isEarlySubmitBlocked ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                  <span>
                    {isEarlySubmitBlocked
                      ? `Đúng giờ mới nộp (${formatTime(remainingEarlySeconds)})`
                      : mode === 'practice'
                      ? 'Kiểm tra & Hoàn thành'
                      : 'Hoàn thành & Nộp bài'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Bottom Action Bar: Lưu bài thi & Nộp bài */}
          <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraftExam}
                className="py-2 px-3.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded-lg transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Lưu tạm thời câu trả lời và thời gian vào hệ thống"
              >
                <Save className="w-3.5 h-3.5 text-blue-600" />
                <span>Lưu bài làm tạm thời</span>
              </button>

              {saveDraftToast && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in duration-150">
                  {saveDraftToast}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isEarlySubmitBlocked) {
                    setIsEarlySubmitNoticeOpen(true);
                  } else {
                    setIsSubmitModalOpen(true);
                  }
                }}
                className={`py-2 px-4 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ${
                  isEarlySubmitBlocked
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                }`}
              >
                {isEarlySubmitBlocked ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isEarlySubmitBlocked ? `Đúng giờ mới nộp (còn ${formatTime(remainingEarlySeconds)})` : 'Nộp bài thi'}</span>
              </button>
            </div>
          </div>
        </main>

        {/* Right Sidebar: Question Matrix Palette (Desktop sidebar in exam mode) */}
        {mode !== 'practice' && (
        <aside className="hidden lg:flex lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex-col justify-between">
          <div>
            {/* Header stats */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Bảng câu hỏi ({answeredCount}/{exam.questions.length})
              </h2>
              <span className="text-xs font-mono font-medium text-slate-600">
                {Math.round((answeredCount / exam.questions.length) * 100)}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${(answeredCount / exam.questions.length) * 100}%` }}
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-4 text-xs">
              <button
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-1 px-2 font-medium rounded-md transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({exam.questions.length})
              </button>
              <button
                onClick={() => setFilterMode('unanswered')}
                className={`flex-1 py-1 px-2 font-medium rounded-md transition-colors cursor-pointer ${
                  filterMode === 'unanswered'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chưa làm ({unansweredCount})
              </button>
              <button
                onClick={() => setFilterMode('flagged')}
                className={`flex-1 py-1 px-2 font-medium rounded-md transition-colors cursor-pointer ${
                  filterMode === 'flagged'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cắm cờ ({flaggedCount})
              </button>
            </div>

            {/* Question matrix buttons (Grouped by Question-Type Cluster when enabled) */}
            {isGroupedByType && questionClusters.length > 0 ? (
              <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                {questionClusters.map((cluster) => {
                  const visibleItems = cluster.items.filter(({ question }) => {
                    const isSelected = isQuestionAnswered(question);
                    const isFlaggedItem = Boolean(flagged[question.id]);
                    if (filterMode === 'unanswered') return !isSelected;
                    if (filterMode === 'flagged') return isFlaggedItem;
                    return true;
                  });
                  if (visibleItems.length === 0) return null;
                  return (
                    <div key={`${cluster.type}_${cluster.partIndex}`} className="space-y-2">
                      <div className="flex items-center justify-between px-2 py-1 rounded-md bg-indigo-50/90 border border-indigo-200/80 text-[11px] font-bold text-indigo-950">
                        <span>
                          Phần {cluster.roman}: {cluster.shortLabel}
                        </span>
                        <span className="font-mono text-indigo-700">
                          {cluster.items.length} câu
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {visibleItems.map(({ question: q, flatIndex: idx }) => {
                          const isSelected = isQuestionAnswered(q);
                          const isFlaggedItem = flagged[q.id];
                          const isCurrent = currentIndex === idx;

                          let btnClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';
                          if (isSelected) {
                            btnClass = 'bg-blue-600 text-white font-bold border-blue-600';
                          }
                          if (isFlaggedItem) {
                            btnClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                            if (isSelected) {
                              btnClass = 'bg-blue-600 text-white border-amber-400 ring-2 ring-amber-400';
                            }
                          }
                          if (isCurrent) {
                            btnClass += ' ring-2 ring-slate-900 ring-offset-1';
                          }

                          return (
                            <button
                              key={q.id}
                              onClick={() => setCurrentIndex(idx)}
                              className={`relative h-10 rounded-lg text-xs font-semibold border flex items-center justify-center transition-all cursor-pointer ${btnClass}`}
                            >
                              <span>{idx + 1}</span>
                              {isFlaggedItem && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2 max-h-[360px] overflow-y-auto pr-1">
                {exam.questions.map((q, idx) => {
                  const isSelected = isQuestionAnswered(q);
                  const isFlaggedItem = flagged[q.id];
                  if (filterMode === 'unanswered' && isSelected) return null;
                  if (filterMode === 'flagged' && !isFlaggedItem) return null;
                  const isCurrent = currentIndex === idx;

                  let btnClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';
                  if (isSelected) {
                    btnClass = 'bg-blue-600 text-white font-bold border-blue-600';
                  }
                  if (isFlaggedItem) {
                    btnClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                    if (isSelected) {
                      btnClass = 'bg-blue-600 text-white border-amber-400 ring-2 ring-amber-400';
                    }
                  }
                  if (isCurrent) {
                    btnClass += ' ring-2 ring-slate-900 ring-offset-1';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative h-10 rounded-lg text-xs font-semibold border flex items-center justify-center transition-all cursor-pointer ${btnClass}`}
                    >
                      <span>{idx + 1}</span>
                      {isFlaggedItem && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick tips & submit button */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (isEarlySubmitBlocked) {
                  setIsEarlySubmitNoticeOpen(true);
                } else {
                  setIsSubmitModalOpen(true);
                }
              }}
              className={`w-full py-2.5 px-4 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
                isEarlySubmitBlocked
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {isEarlySubmitBlocked ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              <span>
                {isEarlySubmitBlocked
                  ? `Đúng giờ mới nộp (${formatTime(remainingEarlySeconds)})`
                  : 'Nộp bài thi'}
              </span>
            </button>
          </div>
        </aside>
        )}
      </div>

      {/* Instructions Modal */}
      {showInstructionsModal && exam.instructions && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] overflow-y-auto scroll-lane p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm md:text-base">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span>Hướng dẫn làm bài thi</span>
              </div>
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line max-h-96 overflow-y-auto">
              {exam.instructions}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Đã hiểu, tiếp tục làm bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] overflow-y-auto scroll-lane p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Xác nhận nộp bài thi</span>
              </div>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-sm text-slate-700 leading-relaxed">
                Bạn có chắc chắn muốn nộp bài thi{' '}
                <strong className="text-slate-900">{exam.title}</strong>?
              </p>

              {/* Status summary */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between text-slate-700">
                  <span>Số câu đã hoàn thành:</span>
                  <strong className="text-blue-700 font-mono text-sm">{answeredCount} / {exam.questions.length}</strong>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Số câu chưa hoàn thành:</span>
                  <strong className={`font-mono text-sm ${unansweredCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {unansweredCount} câu
                  </strong>
                </div>
                {flaggedCount > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>Số câu đang cắm cờ:</span>
                    <strong className="font-mono text-sm">{flaggedCount} câu</strong>
                  </div>
                )}
              </div>

              {unansweredCount > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>
                    Lưu ý: Bạn còn <strong>{unansweredCount}</strong> câu chưa hoàn thành. Các câu chưa làm sẽ nhận 0 điểm!
                  </span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Tiếp tục làm bài
              </button>
              <button
                onClick={() => {
                  setIsSubmitModalOpen(false);
                  handleSubmitExam();
                }}
                className="py-2 px-5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                Đồng ý nộp bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Helpers */}
      <MiniCalculator
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
      />
      <ScratchpadModal
        isOpen={showScratchpad}
        onClose={() => setShowScratchpad(false)}
      />

      {/* Exam Preview Modal */}
      <ExamPreviewModal
        isOpen={showPreviewModal}
        exam={exam}
        userRole={userRole}
        isTaking={true}
        onJumpToQuestion={handleJumpToQuestion}
        onClose={() => setShowPreviewModal(false)}
      />

      {/* Quick Edit Question Modal */}
      <QuickQuestionEditorModal
        isOpen={Boolean(editingQuestion)}
        question={editingQuestion}
        onSave={handleSaveQuestion}
        onDelete={handleDeleteQuestion}
        onClose={() => setEditingQuestion(null)}
      />

      {/* Mobile Sticky Bottom Exam Bar (One-handed thumb navigation on phones) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2 pb-safe flex items-center justify-between gap-2 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
        <button
          type="button"
          onClick={handlePracticePrev}
          disabled={mode === 'practice' ? practiceCursor === 0 : currentIndex === 0}
          className="min-h-[44px] px-3 text-xs font-semibold text-slate-700 bg-slate-100 active:bg-slate-200 disabled:opacity-40 rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Trước</span>
        </button>

        {mode !== 'practice' ? (
          <button
            type="button"
            onClick={() => setIsMobileMatrixOpen(true)}
            className="min-h-[44px] flex-1 px-3 text-xs font-bold text-blue-800 bg-blue-50 active:bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>
              Câu {effectiveQuestionIndex + 1}/{exam.questions.length} ({answeredCount} đã làm)
            </span>
          </button>
        ) : (
          <div className="min-h-[44px] flex-1 px-3 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
            Câu {effectiveQuestionIndex + 1} · {formatTime(practiceElapsedSeconds)}
          </div>
        )}

        {(mode === 'practice'
          ? practiceCursor < practiceQueue.length - 1
          : currentIndex < exam.questions.length - 1) ? (
          <button
            type="button"
            onClick={handlePracticeNextOrFinish}
            className="min-h-[44px] px-3.5 text-xs font-semibold text-white bg-slate-900 active:bg-slate-800 rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Tiếp</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePracticeNextOrFinish}
            className={`min-h-[44px] px-3.5 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer shrink-0 ${
              isEarlySubmitBlocked
                ? 'bg-amber-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isEarlySubmitBlocked ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            <span>Nộp</span>
          </button>
        )}
      </div>

      {/* Mobile Question Matrix Bottom-Sheet Drawer */}
      {isMobileMatrixOpen && mode !== 'practice' && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-end"
          onClick={() => setIsMobileMatrixOpen(false)}
        >
          <div
            className="w-full max-h-[82vh] bg-white rounded-t-2xl p-4 pb-safe shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bảng câu hỏi ({answeredCount}/{exam.questions.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Chạm số câu để chuyển nhanh · Cắm cờ: {flaggedCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMatrixOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
                aria-label="Đóng bảng câu hỏi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-3 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-2 px-2 font-medium rounded-md cursor-pointer ${
                  filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Tất cả ({exam.questions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unanswered')}
                className={`flex-1 py-2 px-2 font-medium rounded-md cursor-pointer ${
                  filterMode === 'unanswered' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Chưa làm ({unansweredCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('flagged')}
                className={`flex-1 py-2 px-2 font-medium rounded-md cursor-pointer ${
                  filterMode === 'flagged' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Cắm cờ ({flaggedCount})
              </button>
            </div>

            <div className="overflow-y-auto grid grid-cols-5 gap-2 py-1">
              {exam.questions.map((q, idx) => {
                const isSelected = isQuestionAnswered(q);
                const isFlaggedItem = flagged[q.id];
                if (filterMode === 'unanswered' && isSelected) return null;
                if (filterMode === 'flagged' && !isFlaggedItem) return null;
                const isCurrent = currentIndex === idx;

                let btnClass = 'bg-slate-100 text-slate-700 border-slate-200';
                if (isSelected) btnClass = 'bg-blue-600 text-white font-bold border-blue-600';
                if (isFlaggedItem) {
                  btnClass = isSelected
                    ? 'bg-blue-600 text-white border-amber-400 ring-2 ring-amber-400'
                    : 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                }
                if (isCurrent) btnClass += ' ring-2 ring-slate-900 ring-offset-1';

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsMobileMatrixOpen(false);
                    }}
                    className={`relative h-11 rounded-xl text-xs font-semibold border flex items-center justify-center cursor-pointer ${btnClass}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlaggedItem && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleSaveDraftExam();
                  setIsMobileMatrixOpen(false);
                }}
                className="min-h-[44px] px-3.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4 text-blue-600" />
                <span>Lưu tạm</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMatrixOpen(false);
                  if (isEarlySubmitBlocked) {
                    setIsEarlySubmitNoticeOpen(true);
                  } else {
                    setIsSubmitModalOpen(true);
                  }
                }}
                className={`min-h-[44px] flex-1 px-4 text-xs font-bold text-white rounded-xl flex items-center justify-center gap-1.5 cursor-pointer ${
                  isEarlySubmitBlocked ? 'bg-amber-600' : 'bg-emerald-600'
                }`}
              >
                {isEarlySubmitBlocked ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                <span>{isEarlySubmitBlocked ? `Còn ${formatTime(remainingEarlySeconds)}` : 'Nộp bài thi'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Prevention Toast */}
      {copyToastNotice && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-5 py-3 rounded-xl shadow-2xl border border-rose-500/40 text-xs sm:text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{copyToastNotice}</span>
        </div>
      )}

      {/* Tab Switch Warning Modal */}
      {showTabSwitchWarning && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-rose-600" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-rose-600 tracking-wider">
                Cảnh báo Quy chế Phòng thi
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-1">
                Ghi nhận rời màn hình thi (Lần {tabSwitchCount}/{exam.maxTabSwitches})
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Hệ thống phát hiện bạn vừa chuyển tab hoặc rời khỏi cửa sổ làm bài. Theo quy chế phòng thi: Nếu bạn rời màn hình thi quá <strong>{exam.maxTabSwitches} lần</strong>, hệ thống sẽ <strong>tự động thu và nộp bài thi ngay lập tức</strong>!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTabSwitchWarning(false)}
              className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Tôi đã hiểu & Quay lại làm bài
            </button>
          </div>
        </div>
      )}

      {/* Lockdown Notice Modal - Strict Stay Until Timeout */}
      {isLockdownNoticeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-purple-500 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-purple-700" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider">
                Chế độ Phòng thi Khóa Nghiêm ngặt
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-1">
                Không được phép thoát giao diện thi!
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Đề thi này được cài đặt quy chế <strong>Khóa thoát phòng thi cho đến khi kết thúc thời gian làm bài</strong> ({formatTime(remainingSeconds)} còn lại). Bạn không thể rời khỏi màn hình thi sớm.
              </p>
              <p className="text-xs text-purple-900 font-semibold bg-purple-50 p-2.5 rounded-lg border border-purple-200 mt-3">
                Vui lòng tiếp tục làm bài hoặc rà soát các câu trả lời. Hệ thống sẽ mở hoặc tự động nộp bài khi hết giờ!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsLockdownNoticeOpen(false)}
              className="w-full py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Tiếp tục làm bài
            </button>
          </div>
        </div>
      )}

      {/* Early Submit Blocked Modal */}
      {isEarlySubmitNoticeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-500 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">
                Giới hạn thời gian nộp bài
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-1">
                Chưa đến giờ được phép nộp bài!
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {minSubmitMinutes > 0 ? (
                  <>Quy định đề thi yêu cầu thí sinh phải làm bài tối thiểu <strong>{minSubmitMinutes} phút</strong> trước khi được phép nộp bài.</>
                ) : (
                  <>Chế độ nộp bài ngay đã được tắt. Thí sinh phải làm bài đúng hết <strong>{exam.durationMinutes} phút</strong> quy định (khi hết giờ hệ thống sẽ tự động thu bài).</>
                )}
              </p>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mt-3">
                <span className="text-xs text-amber-900 block font-medium">Thời gian còn lại trước khi được nộp bài:</span>
                <span className="text-2xl font-mono font-extrabold text-amber-950 tracking-wider">
                  {formatTime(remainingEarlySeconds)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEarlySubmitNoticeOpen(false)}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Quay lại rà soát bài làm
            </button>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      <ConfirmModal
        isOpen={isExitConfirmOpen}
        title="Xác nhận thoát bài thi"
        message="Bạn có chắc muốn thoát phòng thi? Tiến trình bài làm hiện tại chưa nộp sẽ không được lưu vào bảng kết quả."
        confirmText="Rời phòng thi"
        cancelText="Tiếp tục làm bài"
        onConfirm={onExit}
        onClose={() => setIsExitConfirmOpen(false)}
      />

      {/* Fullscreen Kiosk Room Lock Enforcement */}
      <RoomLockGuard
        active={isRoomLockActive}
        title={exam.title}
        subtitle={
          candidateName
            ? `Thí sinh: ${candidateName}${studentCode ? ` (${studentCode})` : ''}`
            : undefined
        }
        remainingLabel={formatTime(remainingSeconds)}
      />

      {/* Clipboard Image Paste Title Modal for Essay */}
      <InlineImageTitleModal
        isOpen={Boolean(essayPasteModal)}
        initialImageSrc={essayPasteModal?.imageSrc || ''}
        initialTitle={essayPasteModal?.defaultTitle || ''}
        targetLabel="Bài làm tự luận trực tuyến"
        onClose={() => setEssayPasteModal(null)}
        onConfirm={(imgSrc, title) => {
          const modal = essayPasteModal;
          setEssayPasteModal(null);
          if (!modal) return;
          const imgId = registerImplicitImage(imgSrc);
          setEssayInlineImages((prev) => ({ ...prev, [imgId]: imgSrc }));
          const token = formatInlineImageToken(imgId, title);
          if (!modal.el || !insertTextAtEditableElement(modal.el, token, modal.range)) {
            if (modal.targetSubQuestionId) {
              const currentSubMap =
                (answers[currentQuestion.id] as { [id: string]: CandidateAnswerValue }) || {};
              const cur = (currentSubMap[modal.targetSubQuestionId] as string) || '';
              handleSetGroupedSubAnswer(modal.targetSubQuestionId, cur ? `${cur}\n${token}` : token);
            } else {
              const cur = (answers[currentQuestion.id] as string) || '';
              handleSetTextInput(cur ? `${cur}\n${token}` : token);
            }
          }
        }}
      />
    </div>
  );
};
