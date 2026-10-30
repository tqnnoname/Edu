import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Eye
} from 'lucide-react';
import { MiniCalculator } from './MiniCalculator';
import { ScratchpadModal } from './ScratchpadModal';
import { RichContentRenderer } from './RichContentRenderer';
import { QuickQuestionEditorModal } from './QuickQuestionEditorModal';
import { ConfirmModal } from './ConfirmModal';
import { ExamPreviewModal } from './ExamPreviewModal';
import { gradeEntireExam, shuffleExamQuestionsAndOptions } from '../utils/scoring';
import { saveCustomExam } from '../utils/storage';

interface ExamTakingViewProps {
  exam: Exam;
  mode: 'exam' | 'practice';
  userRole?: UserRole;
  onComplete: (result: ExamResult) => void;
  onExit: () => void;
  onUpdateExam?: (updatedExam: Exam) => void;
}

export const ExamTakingView: React.FC<ExamTakingViewProps> = ({
  exam: initialExam,
  mode,
  userRole = 'student',
  onComplete,
  onExit,
  onUpdateExam,
}) => {
  const [liveExam, setLiveExam] = useState<Exam>(initialExam);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Check if shuffle settings are on, or user can toggle
  const [shuffleQuestions, setShuffleQuestions] = useState(
    Boolean(initialExam.settings?.shuffleQuestions)
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    Boolean(initialExam.settings?.shuffleOptions)
  );

  // The active exam instance (may be shuffled)
  const exam = useMemo(() => {
    return shuffleExamQuestionsAndOptions(liveExam, shuffleQuestions, shuffleOptions);
  }, [liveExam, shuffleQuestions, shuffleOptions]);

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
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [revealedExplanations, setRevealedExplanations] = useState<{ [questionId: string]: boolean }>({});

  const startTime = useMemo(() => Date.now(), []);
  const currentQuestion: Question = exam.questions[currentIndex] || exam.questions[0];

  // Helper to submit exam
  const handleSubmitExam = useCallback(() => {
    const timeSpentSeconds = Math.round((Date.now() - startTime) / 1000);
    const result = gradeEntireExam(exam, answers, timeSpentSeconds);
    onComplete(result);
  }, [exam, answers, startTime, onComplete]);

  // Timer countdown
  useEffect(() => {
    if (mode !== 'exam') return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, handleSubmitExam]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Check if a question is answered
  const isQuestionAnswered = useCallback((q: Question) => {
    const ans = answers[q.id];
    if (ans === undefined || ans === null) return false;

    if (q.type === 'single_choice') {
      return typeof ans === 'number';
    }
    if (q.type === 'true_false') {
      const map = ans as { [itemId: string]: boolean };
      const items = q.tfItems || [];
      return items.length > 0 && items.every((item) => map[item.id] !== undefined);
    }
    if (q.type === 'text_input') {
      return typeof ans === 'string' && ans.trim().length > 0;
    }
    if (q.type === 'grouped') {
      const subMap = ans as { [subId: string]: CandidateAnswerValue };
      const subQs = q.subQuestions || [];
      return subQs.length > 0 && subQs.every((sub) => subMap[sub.id] !== undefined);
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

  const handleClearCurrentAnswer = () => {
    const newAnswers = { ...answers };
    delete newAnswers[currentQuestion.id];
    setAnswers(newAnswers);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none">
      {/* Top Test-Taking Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between gap-4 shadow-xs">
        {/* Left: Exam title & mode */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setIsExitConfirmOpen(true)}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Thoát phòng thi"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-slate-900 truncate">
              {exam.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500">
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

        {/* Center: Countdown Timer */}
        {mode === 'exam' && (
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
        )}

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
            className="hidden md:flex p-2 text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Submit Button */}
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="py-1.5 px-4 text-xs md:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Nộp bài</span>
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

      {/* Main Container: 2-Column Desktop Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Question Box (8 cols) */}
        <main className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-xs flex flex-col justify-between min-h-[580px]">
          <div>
            {/* Question Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-base font-bold text-slate-900">
                  Câu {currentIndex + 1} / {exam.questions.length}
                </span>

                {/* Question Type Badge */}
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  {currentQuestion.type === 'single_choice' && 'Trắc nghiệm đơn'}
                  {currentQuestion.type === 'true_false' && 'Trắc nghiệm Đúng / Sai'}
                  {currentQuestion.type === 'text_input' && 'Trả lời ngắn'}
                  {currentQuestion.type === 'grouped' && 'Câu hỏi chùm'}
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

            {/* Question Statement */}
            <div className="mb-6">
              <div
                className={`font-medium text-slate-900 leading-relaxed ${
                  fontSize === 'large' ? 'text-lg md:text-xl' : 'text-base md:text-lg'
                }`}
              >
                <RichContentRenderer
                  content={currentQuestion.question}
                  imageUrl={currentQuestion.imageUrl}
                />
              </div>
            </div>

            {/* --- RENDER FORMAT 1: Single Choice (Lựa chọn 1 đáp án đúng) --- */}
            {currentQuestion.type === 'single_choice' && (
              <div className="space-y-3">
                {(currentQuestion.options || []).map((optText, optIdx) => {
                  const isSelected = answers[currentQuestion.id] === optIdx;
                  const letter = String.fromCharCode(65 + optIdx); // A, B, C, D, E...
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
                        <RichContentRenderer content={optText} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* --- RENDER FORMAT 2: True / False (Lựa chọn Đúng/Sai từng ý) --- */}
            {currentQuestion.type === 'true_false' && (
              <div className="space-y-4">
                <div className="text-xs text-slate-500 italic">
                  * Chọn <strong>ĐÚNG</strong> hoặc <strong>SAI</strong> cho từng ý bên dưới:
                </div>
                {(currentQuestion.tfItems || []).map((item, itemIdx) => {
                  const letter = String.fromCharCode(97 + itemIdx); // a, b, c, d...
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
                          <RichContentRenderer content={item.statement} />
                          <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                            ({itemPoints.toFixed(2)} điểm)
                          </span>
                        </div>
                      </div>

                      {/* True / False Selector */}
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

            {/* --- RENDER FORMAT 3: Text Input (Trả lời bằng cách nhập văn bản/số) --- */}
            {currentQuestion.type === 'text_input' && (
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nhập câu trả lời vào ô (số, phân số hoặc căn thức):
                  </label>
                  {/* Math quick bar with roots */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] text-slate-400 mr-1 hidden md:inline">Chèn nhanh:</span>
                    {[
                      { label: '√x', insert: '√(' },
                      { label: '∛x', insert: '∛(' },
                      { label: 'u⃗', insert: '\\vec{u}' },
                      { label: 'AB→', insert: '\\overrightarrow{AB}' },
                      { label: 'π', insert: 'π' },
                      { label: '²', insert: '²' },
                      { label: '/', insert: '/' },
                      { label: '±', insert: '±' },
                    ].map((m, mIdx) => (
                      <button
                        key={mIdx}
                        type="button"
                        onClick={() => {
                          const currentVal = (answers[currentQuestion.id] as string) || '';
                          handleSetTextInput(currentVal + m.insert);
                        }}
                        className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-colors cursor-pointer ${
                          m.label.includes('√')
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                        }`}
                        title={`Chèn ký hiệu ${m.label}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={(answers[currentQuestion.id] as string) || ''}
                    onChange={(e) => handleSetTextInput(e.target.value)}
                    placeholder="VD: 3.5 hoặc 7/2 hoặc √(2) hoặc kết quả tính toán..."
                    className="flex-1 px-4 py-3 text-sm md:text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono shadow-2xs"
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
                <div className="text-[11px] text-slate-500">
                  Lưu ý: Bạn có thể dùng nút <strong className="text-emerald-700">√x</strong>, <strong className="text-emerald-700">∛x</strong> để chèn căn thức nhanh chóng.
                </div>
              </div>
            )}

            {/* --- RENDER FORMAT 4: Grouped Questions (Câu hỏi chùm) --- */}
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

                      {/* Sub question statement */}
                      <div className="text-sm font-medium text-slate-900 leading-relaxed">
                        <RichContentRenderer content={subQ.question} imageUrl={subQ.imageUrl} />
                      </div>

                      {/* Sub question: Single choice */}
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
                                  <RichContentRenderer content={optText} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Sub question: Text input */}
                      {subQ.type === 'text_input' && (
                        <input
                          type="text"
                          value={(subAns as string) || ''}
                          onChange={(e) => handleSetGroupedSubAnswer(subQ.id, e.target.value)}
                          placeholder="Nhập câu trả lời..."
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 font-mono"
                        />
                      )}
                    </div>
                  );
                })}
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
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs md:text-sm text-emerald-950">
                    <div className="flex items-center gap-2 font-bold mb-2 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Hướng dẫn giải chi tiết:</span>
                    </div>
                    <div className="text-slate-800 leading-relaxed pl-6 border-l-2 border-emerald-400">
                      <RichContentRenderer content={currentQuestion.explanation} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Question Navigation Controls */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
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
              {currentIndex < exam.questions.length - 1 ? (
                <button
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(exam.questions.length - 1, prev + 1)
                    )
                  }
                  className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <span>Câu tiếp</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setIsSubmitModalOpen(true)}
                  className="py-2 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Hoàn thành & Nộp bài</span>
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar: Question Matrix Palette (4 cols) */}
        <aside className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
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

            {/* Question matrix buttons */}
            <div className="grid grid-cols-5 gap-2 max-h-[360px] overflow-y-auto pr-1">
              {exam.questions.map((q, idx) => {
                const isSelected = isQuestionAnswered(q);
                const isFlagged = flagged[q.id];
                const isCurrent = currentIndex === idx;

                let btnClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';
                if (isSelected) {
                  btnClass = 'bg-blue-600 text-white font-bold border-blue-600';
                }
                if (isFlagged) {
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
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick tips & submit button */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Nộp bài thi ngay
            </button>
          </div>
        </aside>
      </div>

      {/* Instructions Modal */}
      {showInstructionsModal && exam.instructions && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
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
        onJumpToQuestion={(idx) => setCurrentIndex(idx)}
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
    </div>
  );
};
