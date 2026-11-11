import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CandidateAnswerValue, 
  Exam, 
  ExamBundle,
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
  BookOpen,
  Info,
  Eye,
  Lock,
  Layers,
  Sparkles,
  Check,
  AlertCircle
} from 'lucide-react';
import { MiniCalculator } from './MiniCalculator';
import { ScratchpadModal } from './ScratchpadModal';
import { RichContentRenderer } from './RichContentRenderer';
import { ConfirmModal } from './ConfirmModal';
import { gradeEntireExam } from '../utils/scoring';

interface ElectiveClusterTakingViewProps {
  bundle: ExamBundle;
  electiveExams: Exam[];
  userRole?: UserRole;
  candidateName?: string;
  studentCode?: string;
  onComplete: (results: ExamResult[]) => void;
  onExit: () => void;
}

export const ElectiveClusterTakingView: React.FC<ElectiveClusterTakingViewProps> = ({
  bundle,
  electiveExams,
  userRole = 'student',
  candidateName,
  studentCode,
  onComplete,
  onExit,
}) => {
  // Duration for the cluster = Maximum duration of a single elective exam in the cluster!
  const clusterDurationMinutes = useMemo(() => {
    if (!electiveExams || electiveExams.length === 0) return 45;
    return Math.max(...electiveExams.map((e) => e.durationMinutes || 45));
  }, [electiveExams]);

  const [activeSubjectIndex, setActiveSubjectIndex] = useState(0);
  const currentExam: Exam = electiveExams[activeSubjectIndex] || electiveExams[0];

  // Answers & flags per exam: keyed by examId -> questionId -> answer
  const [answersMap, setAnswersMap] = useState<Record<string, Record<string, CandidateAnswerValue>>>({});
  const [flaggedMap, setFlaggedMap] = useState<Record<string, Record<string, boolean>>>({});
  // Question index per exam: keyed by examId
  const [subjectQuestionIndices, setSubjectQuestionIndices] = useState<Record<string, number>>({});

  const currentIndex = subjectQuestionIndices[currentExam?.id] || 0;
  const currentAnswers = answersMap[currentExam?.id] || {};
  const currentFlagged = flaggedMap[currentExam?.id] || {};

  // Timing
  const [remainingSeconds, setRemainingSeconds] = useState(clusterDurationMinutes * 60);
  const startTime = useMemo(() => Date.now(), []);

  // UI state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [isLockdownNoticeOpen, setIsLockdownNoticeOpen] = useState(false);
  const [isEarlySubmitNoticeOpen, setIsEarlySubmitNoticeOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyToastNotice, setCopyToastNotice] = useState<string | null>(null);

  // Tab switch anti-cheat
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);

  const currentQuestion: Question | undefined = currentExam?.questions[currentIndex];

  // Early submit lockout check
  const minSubmitMinutes = bundle.minSubmitMinutes || 0;
  const timeSpentSeconds = clusterDurationMinutes * 60 - remainingSeconds;
  const minRequiredSeconds = minSubmitMinutes * 60;
  const isEarlySubmitBlocked = 
    userRole === 'student' && 
    minSubmitMinutes > 0 && 
    timeSpentSeconds < minRequiredSeconds;
  const remainingEarlySeconds = Math.max(0, minRequiredSeconds - timeSpentSeconds);

  // Stats calculation across the whole cluster
  const clusterStats = useMemo(() => {
    let totalQuestions = 0;
    let totalAnswered = 0;
    const subjectBreakdown = electiveExams.map((exam) => {
      const qCount = exam.questions.length;
      totalQuestions += qCount;
      const examAns = answersMap[exam.id] || {};
      let ansCount = 0;
      exam.questions.forEach((q) => {
        const val = examAns[q.id];
        if (val !== undefined && val !== null && val !== '') {
          if (Array.isArray(val)) {
            if (val.length > 0) ansCount++;
          } else if (typeof val === 'object') {
            if (Object.keys(val).length > 0) ansCount++;
          } else {
            ansCount++;
          }
        }
      });
      totalAnswered += ansCount;
      return {
        exam,
        qCount,
        ansCount,
        isCompleted: ansCount >= qCount && qCount > 0,
      };
    });

    return {
      totalQuestions,
      totalAnswered,
      subjectBreakdown,
      overallProgressPct: totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0,
    };
  }, [electiveExams, answersMap]);

  // Submit all elective exams in the cluster
  const handleSubmitCluster = useCallback((customReason?: string) => {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

    const results: ExamResult[] = electiveExams.map((exam) => {
      const subAnswers = answersMap[exam.id] || {};
      const res = gradeEntireExam(exam, subAnswers, elapsedSeconds);
      res.studentName = candidateName;
      res.studentCode = studentCode;
      res.examCode = exam.examCode || bundle.bundleCode;
      res.tabSwitchCount = tabSwitchCount;
      if (customReason) {
        res.submissionReason = customReason;
      }
      res.showScoreAfterExam = bundle.showAnswersAfterExam ?? true;
      res.showAnswersAfterExam = bundle.showAnswersAfterExam ?? true;
      res.showOnlyStudentAnswersAfterExam = bundle.showOnlyStudentAnswersAfterExam ?? false;
      return res;
    });

    onComplete(results);
  }, [electiveExams, answersMap, startTime, candidateName, studentCode, bundle, tabSwitchCount, onComplete]);

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitCluster('Hết giờ làm bài cụm môn tự chọn');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleSubmitCluster]);

  // Anti-cheat tab switch listener
  useEffect(() => {
    const maxSwitches = bundle.maxTabSwitches ?? 0;
    if (maxSwitches <= 0) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount((prev) => {
          const next = prev + 1;
          if (next >= maxSwitches) {
            handleSubmitCluster(`Tự động thu bài do rời màn hình quá số lần quy định (${next}/${maxSwitches} lần)`);
          } else {
            setShowTabSwitchWarning(true);
          }
          return next;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [bundle.maxTabSwitches, handleSubmitCluster]);

  // Anti-copy handler
  useEffect(() => {
    if (bundle.allowCopy !== false) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      setCopyToastNotice('🚫 Đề thi đã kích hoạt chế độ bảo mật chống sao chép!');
      setTimeout(() => setCopyToastNotice(null), 3000);
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setCopyToastNotice('🚫 Chuột phải đã bị vô hiệu hóa trong phòng thi.');
      setTimeout(() => setCopyToastNotice(null), 3000);
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [bundle.allowCopy]);

  // Helper to update current question's answer
  const handleAnswerChange = (val: CandidateAnswerValue) => {
    if (!currentQuestion) return;
    setAnswersMap((prev) => ({
      ...prev,
      [currentExam.id]: {
        ...(prev[currentExam.id] || {}),
        [currentQuestion.id]: val,
      },
    }));
  };

  const handleToggleFlag = () => {
    if (!currentQuestion) return;
    setFlaggedMap((prev) => {
      const examFlags = prev[currentExam.id] || {};
      return {
        ...prev,
        [currentExam.id]: {
          ...examFlags,
          [currentQuestion.id]: !examFlags[currentQuestion.id],
        },
      };
    });
  };

  const handleSetCurrentIndex = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= currentExam.questions.length) return;
    setSubjectQuestionIndices((prev) => ({
      ...prev,
      [currentExam.id]: newIdx,
    }));
  };

  const handleSwitchSubject = (newSubjectIndex: number) => {
    if (newSubjectIndex < 0 || newSubjectIndex >= electiveExams.length) return;
    setActiveSubjectIndex(newSubjectIndex);
  };

  const handleNextQuestionOrNextSubject = () => {
    if (currentIndex < currentExam.questions.length - 1) {
      handleSetCurrentIndex(currentIndex + 1);
    } else if (activeSubjectIndex < electiveExams.length - 1) {
      // Jump to next subject in cluster!
      handleSwitchSubject(activeSubjectIndex + 1);
    }
  };

  // Timer format
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = hours > 0 
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const isTimerCritical = remainingSeconds <= 300; // <= 5 mins

  // Filtered questions in active subject
  const currentExamQuestions = currentExam?.questions || [];
  const filteredQuestions = useMemo(() => {
    return currentExamQuestions.map((q, idx) => ({ q, idx })).filter(({ q }) => {
      const val = currentAnswers[q.id];
      const hasAns = val !== undefined && val !== null && val !== '' && 
        (!Array.isArray(val) || val.length > 0) &&
        (typeof val !== 'object' || Array.isArray(val) || Object.keys(val).length > 0);
      const isFlag = Boolean(currentFlagged[q.id]);

      if (filterMode === 'unanswered') return !hasAns;
      if (filterMode === 'flagged') return isFlag;
      return true;
    });
  }, [currentExamQuestions, currentAnswers, currentFlagged, filterMode]);

  return (
    <div className={`min-h-screen bg-slate-100 flex flex-col font-sans ${fontSize === 'large' ? 'text-lg' : 'text-sm'}`}>
      
      {/* Top Main Navigation Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          
          {/* Bundle & Cluster Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wider">
                  Cụm Môn Tự Chọn
                </span>
                <span className="text-[11px] text-purple-300 font-mono hidden sm:inline">
                  (Thời gian cả cụm = Max 1 môn: {clusterDurationMinutes}p)
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                {bundle.title}
              </h1>
            </div>
          </div>

          {/* Countdown Timer */}
          <div className="flex items-center gap-3">
            <div 
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono font-bold transition-colors ${
                isTimerCritical
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                  : 'bg-slate-800 text-emerald-400 border-slate-700'
              }`}
              title={`Tổng thời gian làm cụm môn tự chọn là ${clusterDurationMinutes} phút (bằng thời gian lớn nhất của 1 môn)`}
            >
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-lg sm:text-xl tracking-wider tabular-nums">{timeFormatted}</span>
            </div>

            {/* Quick action tools */}
            <div className="hidden md:flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <button
                type="button"
                onClick={() => setShowCalculator(!showCalculator)}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  showCalculator
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Máy tính bỏ túi Mini"
              >
                <CalcIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowScratchpad(!showScratchpad)}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  showScratchpad
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Bảng nháp"
              >
                <Edit3 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 text-xs font-bold cursor-pointer"
                title="Đổi cỡ chữ"
              >
                {fontSize === 'normal' ? 'A+' : 'A-'}
              </button>
            </div>

            {/* Submit Cluster Button */}
            <button
              type="button"
              onClick={() => {
                if (isEarlySubmitBlocked) {
                  setIsEarlySubmitNoticeOpen(true);
                  return;
                }
                setIsSubmitModalOpen(true);
              }}
              className="py-2 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Nộp bài Cụm tự chọn</span>
              <span className="sm:hidden">Nộp bài</span>
            </button>
          </div>
        </div>

        {/* Secondary Bar: Elective Subjects Tabs in Cluster */}
        <div className="bg-slate-950/80 border-t border-slate-800/80 px-3 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
            
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden lg:inline mr-1">
                Các môn trong cụm:
              </span>

              {electiveExams.map((exam, idx) => {
                const isActive = idx === activeSubjectIndex;
                const stat = clusterStats.subjectBreakdown[idx];
                const answered = stat?.ansCount || 0;
                const total = exam.questions.length;
                const isAllDone = answered >= total && total > 0;

                return (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => handleSwitchSubject(idx)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                      isActive
                        ? 'bg-purple-600 text-white border-purple-400 shadow-xs'
                        : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{idx + 1}. {exam.title}</span>
                    <span 
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        isAllDone
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : isActive 
                            ? 'bg-purple-900/60 text-purple-200' 
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {answered}/{total}
                    </span>
                    {isAllDone && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                );
              })}
            </div>

            {/* Overall cluster progress indicator */}
            <div className="hidden sm:flex items-center gap-2.5 shrink-0 text-xs text-slate-300 font-mono">
              <span className="text-slate-400">Tiến độ cả cụm:</span>
              <div className="w-28 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                <div 
                  className="h-full bg-linear-to-r from-purple-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${clusterStats.overallProgressPct}%` }}
                />
              </div>
              <span className="font-bold text-emerald-400">
                {clusterStats.totalAnswered}/{clusterStats.totalQuestions} ({clusterStats.overallProgressPct}%)
              </span>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content Area: Split View */}
      <main className="max-w-7xl w-full mx-auto p-3 sm:p-6 flex-1 flex flex-col lg:flex-row gap-5">
        
        {/* Left Side: Active Question Display */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          
          {/* Question Top Info Bar */}
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-purple-100 text-purple-900 border border-purple-200">
                Môn: {currentExam.title}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-200">
                Câu {currentIndex + 1} / {currentExam.questions.length}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ({currentQuestion?.points ?? 1.0} điểm)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleFlag}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  currentFlagged[currentQuestion?.id || '']
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title="Đánh dấu câu này để xem lại sau"
              >
                <Flag className={`w-3.5 h-3.5 ${currentFlagged[currentQuestion?.id || ''] ? 'fill-amber-600 text-amber-600' : 'text-slate-400'}`} />
                <span>{currentFlagged[currentQuestion?.id || ''] ? 'Đã đánh dấu' : 'Đánh dấu'}</span>
              </button>
            </div>
          </div>

          {/* Question Body */}
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6">
            {currentQuestion ? (
              <div>
                {/* Question Text with Rich LaTeX Math Renderer */}
                <div className="text-slate-900 leading-relaxed font-medium mb-6 text-base sm:text-lg">
                  <RichContentRenderer content={currentQuestion.question} />
                </div>

                {/* Question Image if any */}
                {currentQuestion.imageUrl && (
                  <div className="mb-6 rounded-xl overflow-hidden border border-slate-200 max-w-lg">
                    <img 
                      src={currentQuestion.imageUrl} 
                      alt="Minh họa câu hỏi" 
                      className="w-full object-contain max-h-80 bg-slate-50"
                    />
                  </div>
                )}

                {/* Formats rendering */}
                {/* Type 1: single_choice */}
                {currentQuestion.type === 'single_choice' && currentQuestion.options && (
                  <div className="space-y-3">
                    {currentQuestion.options.map((optText, optIdx) => {
                      const isSelected = currentAnswers[currentQuestion.id] === optIdx;
                      const letter = String.fromCharCode(65 + optIdx);
                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleAnswerChange(optIdx)}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                            isSelected
                              ? 'bg-purple-50/70 border-purple-600 shadow-2xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {letter}
                          </div>
                          <div className="flex-1 text-slate-900 font-normal leading-relaxed pt-0.5">
                            <RichContentRenderer content={optText} />
                            {currentQuestion.optionImages?.[optIdx] && (
                              <div className="mt-2">
                                <img
                                  src={currentQuestion.optionImages[optIdx]}
                                  alt={`Phương án ${letter}`}
                                  className="max-h-40 rounded-lg border border-slate-200 object-contain bg-white shadow-2xs"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Type 2: multiple_choice */}
                {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-purple-700 mb-1">
                      ℹ Câu hỏi chọn nhiều đáp án đúng (Nhấp để chọn / bỏ chọn):
                    </div>
                    {currentQuestion.options.map((optText, optIdx) => {
                      const selectedArray = Array.isArray(currentAnswers[currentQuestion.id]) 
                        ? (currentAnswers[currentQuestion.id] as number[]) 
                        : [];
                      const isSelected = selectedArray.includes(optIdx);
                      const letter = String.fromCharCode(65 + optIdx);

                      const handleToggleMultiple = () => {
                        const updated = isSelected 
                          ? selectedArray.filter((i) => i !== optIdx)
                          : [...selectedArray, optIdx];
                        handleAnswerChange(updated);
                      };

                      return (
                        <div
                          key={optIdx}
                          onClick={handleToggleMultiple}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                            isSelected
                              ? 'bg-purple-50/70 border-purple-600 shadow-2xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {letter}
                          </div>
                          <div className="flex-1 text-slate-900 font-normal leading-relaxed pt-0.5">
                            <RichContentRenderer content={optText} />
                            {currentQuestion.optionImages?.[optIdx] && (
                              <div className="mt-2">
                                <img
                                  src={currentQuestion.optionImages[optIdx]}
                                  alt={`Phương án ${letter}`}
                                  className="max-h-40 rounded-lg border border-slate-200 object-contain bg-white shadow-2xs"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Type 3: true_false */}
                {currentQuestion.type === 'true_false' && currentQuestion.tfItems && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Xét tính Đúng / Sai của từng mệnh đề dưới đây:
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {currentQuestion.tfItems.map((item, itemIdx) => {
                        const tfMap = (typeof currentAnswers[currentQuestion.id] === 'object' && !Array.isArray(currentAnswers[currentQuestion.id]))
                          ? (currentAnswers[currentQuestion.id] as Record<string, boolean>)
                          : {};
                        const chosenVal = tfMap[item.id];
                        const letter = String.fromCharCode(97 + itemIdx); // a, b, c, d

                        const setChoice = (b: boolean) => {
                          handleAnswerChange({
                            ...tfMap,
                            [item.id]: b,
                          });
                        };

                        return (
                          <div key={item.id} className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <span className="font-bold text-sm text-purple-700 font-mono mt-0.5">
                                {letter})
                              </span>
                              <div className="text-slate-800 text-sm leading-relaxed">
                                <RichContentRenderer content={item.statement} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => setChoice(true)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                  chosenVal === true
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                Đúng
                              </button>
                              <button
                                type="button"
                                onClick={() => setChoice(false)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                  chosenVal === false
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                Sai
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Type 4: text_input */}
                {currentQuestion.type === 'text_input' && (
                  <div className="space-y-3 max-w-md">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Nhập đáp án của bạn:
                    </label>
                    <input
                      type="text"
                      value={typeof currentAnswers[currentQuestion.id] === 'string' ? (currentAnswers[currentQuestion.id] as string) : ''}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Ví dụ: 3.5 hoặc -12 hoặc 7/2..."
                      className="w-full px-4 py-3 text-base font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-100"
                    />
                    <p className="text-xs text-slate-400">
                      Điền số hoặc kết quả vào ô trống (dùng dấu chấm "." hoặc phẩy "," cho số thập phân).
                    </p>
                  </div>
                )}

                {/* Type 5: grouped (câu hỏi chùm) */}
                {currentQuestion.type === 'grouped' && currentQuestion.subQuestions && (
                  <div className="space-y-6 pt-2">
                    <div className="text-xs font-bold text-purple-800 uppercase tracking-wide">
                      Các câu hỏi con trong bối cảnh này:
                    </div>
                    {currentQuestion.subQuestions.map((subQ, subIdx) => {
                      const groupAnsMap = (typeof currentAnswers[currentQuestion.id] === 'object' && !Array.isArray(currentAnswers[currentQuestion.id]))
                        ? (currentAnswers[currentQuestion.id] as Record<string, CandidateAnswerValue>)
                        : {};
                      const subAns = groupAnsMap[subQ.id];

                      const handleSubAnsChange = (subVal: CandidateAnswerValue) => {
                        handleAnswerChange({
                          ...groupAnsMap,
                          [subQ.id]: subVal,
                        });
                      };

                      return (
                        <div key={subQ.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                          <div className="font-bold text-sm text-slate-900 flex items-start gap-2">
                            <span className="text-purple-700 font-mono">Câu {currentIndex + 1}.{subIdx + 1}:</span>
                            <div className="flex-1">
                              <RichContentRenderer content={subQ.question} imageUrl={subQ.imageUrl} />
                            </div>
                          </div>

                          {subQ.type === 'single_choice' && subQ.options && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {subQ.options.map((optText, optIdx) => {
                                const isSelected = subAns === optIdx;
                                const letter = String.fromCharCode(65 + optIdx);
                                return (
                                  <div
                                    key={optIdx}
                                    onClick={() => handleSubAnsChange(optIdx)}
                                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center gap-2.5 text-xs ${
                                      isSelected
                                        ? 'bg-purple-100 border-purple-600 font-bold text-purple-950'
                                        : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-800'
                                    }`}
                                  >
                                    <span className="font-mono">{letter}.</span>
                                    <div className="flex-1">
                                      <RichContentRenderer content={optText} />
                                      {subQ.optionImages?.[optIdx] && (
                                        <div className="mt-1.5">
                                          <img
                                            src={subQ.optionImages[optIdx]}
                                            alt={`Ý ${letter}`}
                                            className="max-h-28 rounded border border-purple-200 object-contain bg-white shadow-2xs"
                                            referrerPolicy="no-referrer"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {subQ.type === 'text_input' && (
                            <div className="pt-1">
                              <input
                                type="text"
                                value={typeof subAns === 'string' ? subAns : ''}
                                onChange={(e) => handleSubAnsChange(e.target.value)}
                                placeholder="Nhập đáp án ngắn..."
                                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:border-purple-600 bg-white"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                Không tìm thấy dữ liệu câu hỏi.
              </div>
            )}
          </div>

          {/* Bottom Question Controls Bar */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentIndex === 0 && activeSubjectIndex === 0}
              onClick={() => {
                if (currentIndex > 0) {
                  handleSetCurrentIndex(currentIndex - 1);
                } else if (activeSubjectIndex > 0) {
                  // Jump to previous subject's last question
                  const prevSubjIdx = activeSubjectIndex - 1;
                  const prevExam = electiveExams[prevSubjIdx];
                  setActiveSubjectIndex(prevSubjIdx);
                  setSubjectQuestionIndices((prev) => ({
                    ...prev,
                    [prevExam.id]: Math.max(0, prevExam.questions.length - 1),
                  }));
                }
              }}
              className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Câu trước</span>
            </button>

            {/* Middle Quick Switcher Indicator */}
            <div className="text-xs text-slate-500 font-mono hidden sm:inline">
              Môn {activeSubjectIndex + 1}/{electiveExams.length}: {currentExam.title} (Câu {currentIndex + 1}/{currentExam.questions.length})
            </div>

            {/* Next button: handles both next question & next subject in cluster! */}
            {currentIndex < currentExam.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => handleSetCurrentIndex(currentIndex + 1)}
                className="py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold bg-purple-700 hover:bg-purple-600 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Câu tiếp theo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : activeSubjectIndex < electiveExams.length - 1 ? (
              <button
                type="button"
                onClick={() => handleSwitchSubject(activeSubjectIndex + 1)}
                className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Chuyển sang môn tiếp theo trong cụm tự chọn"
              >
                <span>Chuyển sang môn: {electiveExams[activeSubjectIndex + 1].title}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (isEarlySubmitBlocked) {
                    setIsEarlySubmitNoticeOpen(true);
                    return;
                  }
                  setIsSubmitModalOpen(true);
                }}
                className="py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Nộp bài Cụm tự chọn</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Question Navigation Palette & Cluster Overview */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          
          {/* Active Subject Palette Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Mục lục câu hỏi
                </h3>
                <p className="text-[11px] text-purple-700 font-semibold truncate max-w-[180px]">
                  {currentExam.title}
                </p>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    filterMode === 'all' ? 'bg-purple-100 text-purple-800' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('unanswered')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    filterMode === 'unanswered' ? 'bg-purple-100 text-purple-800' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Chưa làm
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('flagged')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    filterMode === 'flagged' ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Đánh dấu
                </button>
              </div>
            </div>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto p-1">
              {filteredQuestions.map(({ q, idx }) => {
                const val = currentAnswers[q.id];
                const hasAnswer = val !== undefined && val !== null && val !== '' &&
                  (!Array.isArray(val) || val.length > 0) &&
                  (typeof val !== 'object' || Array.isArray(val) || Object.keys(val).length > 0);
                const isFlag = Boolean(currentFlagged[q.id]);
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleSetCurrentIndex(idx)}
                    className={`h-9 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer relative border ${
                      isCurrent
                        ? 'ring-2 ring-purple-600 border-purple-600 bg-purple-50 text-purple-950 font-extrabold'
                        : hasAnswer
                          ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {isFlag && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick legend */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-3 border-t border-slate-100 mt-3 flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-purple-600 inline-block" /> Đã làm
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-white border border-slate-300 inline-block" /> Chưa làm
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Đánh dấu
              </span>
            </div>
          </div>

          {/* Quick Subject Switcher & Completion Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5">
              Tổng quan toàn cụm ({electiveExams.length} môn)
            </h3>

            <div className="space-y-2">
              {electiveExams.map((exam, idx) => {
                const stat = clusterStats.subjectBreakdown[idx];
                const isActive = idx === activeSubjectIndex;
                const isComplete = stat?.isCompleted;

                return (
                  <div
                    key={exam.id}
                    onClick={() => handleSwitchSubject(idx)}
                    className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                      isActive
                        ? 'bg-purple-50/70 border-purple-400 font-bold text-purple-950'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-white border border-slate-200 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate">{exam.title}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`font-mono text-[11px] ${isComplete ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                        {stat?.ansCount || 0}/{exam.questions.length}
                      </span>
                      {isComplete && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  if (isEarlySubmitBlocked) {
                    setIsEarlySubmitNoticeOpen(true);
                    return;
                  }
                  setIsSubmitModalOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nộp bài cụm tự chọn</span>
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Calculator Modal */}
      <MiniCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />

      {/* Scratchpad Modal */}
      <ScratchpadModal isOpen={showScratchpad} onClose={() => setShowScratchpad(false)} />

      {/* Anti-copy toast notice */}
      {copyToastNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl border border-slate-700 animate-in fade-in">
          {copyToastNotice}
        </div>
      )}

      {/* Tab switch warning modal */}
      {showTabSwitchWarning && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-2xl border border-rose-200 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 mb-2">
              Cảnh báo rời phòng thi!
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mb-6">
              Hệ thống phát hiện bạn vừa rời khỏi màn hình làm bài. 
              Bạn đã vi phạm <strong>{tabSwitchCount} / {bundle.maxTabSwitches}</strong> lần cho phép. 
              Nếu vượt quá, bài thi sẽ bị tự động thu ngay lập tức!
            </p>
            <button
              type="button"
              onClick={() => setShowTabSwitchWarning(false)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
            >
              Tôi đã hiểu & Quay lại làm bài
            </button>
          </div>
        </div>
      )}

      {/* Early submit blocked notice modal */}
      {isEarlySubmitNoticeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-2xl border border-indigo-200">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 mb-2">
              Chưa đến thời gian nộp bài quy định!
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Quy chế thi yêu cầu thí sinh làm bài tối thiểu <strong>{minSubmitMinutes} phút</strong>.
              Bạn cần làm thêm ít nhất <strong>{Math.ceil(remainingEarlySeconds / 60)} phút</strong> nữa mới được phép nộp bài.
            </p>
            <button
              type="button"
              onClick={() => setIsEarlySubmitNoticeOpen(false)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              Tiếp tục làm bài
            </button>
          </div>
        </div>
      )}

      {/* Submission Confirmation Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 my-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Xác nhận nộp bài Cụm tự chọn
                </h3>
                <p className="text-xs text-slate-500">
                  Toàn bộ các môn tự chọn trong cụm sẽ được chấm điểm và kết thúc buổi thi
                </p>
              </div>
            </div>

            {/* Breakdown for each subject in cluster */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4 space-y-2.5">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Tình trạng làm bài từng môn trong cụm:
              </div>
              {clusterStats.subjectBreakdown.map((stat, idx) => {
                const missing = stat.qCount - stat.ansCount;
                return (
                  <div key={stat.exam.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-0">
                    <span className="font-semibold text-slate-800">
                      {idx + 1}. {stat.exam.title}
                    </span>
                    <span className={`font-mono font-bold ${missing === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {stat.ansCount}/{stat.qCount} câu {missing > 0 && `(Còn ${missing} câu)`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Warning if unanswered */}
            {clusterStats.totalAnswered < clusterStats.totalQuestions && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 mb-5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Bạn vẫn còn <strong>{clusterStats.totalQuestions - clusterStats.totalAnswered}</strong> câu hỏi chưa trả lời trên toàn cụm. 
                  Bạn có chắc chắn muốn nộp bài ngay lúc này không?
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="py-2.5 px-4 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Kiểm tra lại
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSubmitModalOpen(false);
                  handleSubmitCluster();
                }}
                className="py-2.5 px-5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Nộp bài ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
