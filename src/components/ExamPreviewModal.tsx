import React, { useState } from 'react';
import { Exam, Question, UserRole } from '../types/exam';
import { X, Eye, EyeOff, Printer, Clock, BookOpen, CheckCircle, ArrowRight, FileText } from 'lucide-react';
import { RichContentRenderer } from './RichContentRenderer';

interface ExamPreviewModalProps {
  isOpen: boolean;
  exam: Exam | null;
  userRole?: UserRole;
  isTaking?: boolean; // Whether currently in an active exam session
  onJumpToQuestion?: (questionIndex: number) => void;
  onClose: () => void;
}

export const ExamPreviewModal: React.FC<ExamPreviewModalProps> = ({
  isOpen,
  exam,
  userRole = 'teacher',
  isTaking = false,
  onJumpToQuestion,
  onClose,
}) => {
  // Teachers can toggle solutions; students during an exam cannot see answers
  const [showSolutions, setShowSolutions] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  if (!isOpen || !exam) return null;

  const canViewSolutions = userRole === 'teacher';

  const filteredQuestions = exam.questions.filter((q) => {
    if (filterType === 'all') return true;
    return q.type === filterType;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white uppercase tracking-wider">
                {isTaking ? 'Xem thử trong phòng thi' : 'Xem thử toàn bộ đề thi'}
              </span>
              <span className="text-xs text-slate-300">
                {exam.grade}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              {exam.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer border border-slate-700"
              title="In đề thi ra giấy"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In đề</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Đóng xem trước"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-slate-600 flex-wrap">
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {exam.durationMinutes} phút
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="flex items-center gap-1 font-mono">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              {exam.questions.length} câu hỏi
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono font-bold text-blue-700">
              Tổng {exam.totalPoints || 10} điểm
            </span>
          </div>

          {/* Right toggles */}
          <div className="flex items-center gap-2">
            {canViewSolutions ? (
              <button
                onClick={() => setShowSolutions(!showSolutions)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  showSolutions
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                }`}
              >
                {showSolutions ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showSolutions ? 'Ẩn đáp án & lời giải' : 'Hiện đáp án & lời giải (GV)'}</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
                Chế độ học sinh: Đang ẩn đáp án
              </span>
            )}
          </div>
        </div>

        {/* Instructions banner */}
        {exam.instructions && (
          <div className="px-4 sm:px-6 py-2 bg-blue-50/70 border-b border-blue-100 text-xs text-blue-900 flex items-start gap-2">
            <BookOpen className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-semibold mr-1">Hướng dẫn làm bài:</strong>
              {exam.instructions}
            </div>
          </div>
        )}

        {/* Questions Sheet */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {filteredQuestions.map((q, index) => {
            const originalIndex = exam.questions.findIndex((orig) => orig.id === q.id);
            return (
              <div
                key={q.id}
                className="p-5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/30 transition-colors space-y-3.5"
              >
                {/* Question title header */}
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">
                      Câu {originalIndex + 1}:
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {q.type === 'single_choice' && 'Trắc nghiệm đơn'}
                      {q.type === 'true_false' && 'Đúng / Sai'}
                      {q.type === 'text_input' && 'Trả lời ngắn'}
                      {q.type === 'grouped' && 'Câu hỏi chùm'}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {q.points || 1.0} điểm
                    </span>
                    {q.topic && (
                      <span className="text-xs text-slate-400 hidden sm:inline">
                        · {q.topic}
                      </span>
                    )}
                  </div>

                  {isTaking && onJumpToQuestion && (
                    <button
                      onClick={() => {
                        onJumpToQuestion(originalIndex);
                        onClose();
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Làm câu này</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Question Statement with KaTeX & Roots */}
                <div className="text-slate-900 leading-relaxed font-medium">
                  <RichContentRenderer content={q.question} imageUrl={q.imageUrl} />
                </div>

                {/* Format 1: Single choice */}
                {q.type === 'single_choice' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {q.options.map((opt, optIdx) => {
                      const letter = String.fromCharCode(65 + optIdx);
                      const isCorrect = q.correctAnswer === optIdx;
                      return (
                        <div
                          key={optIdx}
                          className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                            showSolutions && isCorrect
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded font-bold text-xs flex items-center justify-center shrink-0 border ${
                              showSolutions && isCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {letter}
                          </span>
                          <div className="flex-1">
                            <RichContentRenderer content={opt} />
                          </div>
                          {showSolutions && isCorrect && (
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Format 2: True/False */}
                {q.type === 'true_false' && q.tfItems && (
                  <div className="space-y-1.5 pt-1">
                    {q.tfItems.map((item, itemIdx) => {
                      const letter = String.fromCharCode(97 + itemIdx);
                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-2 flex-1">
                            <span className="font-bold text-slate-700 shrink-0">{letter})</span>
                            <div className="leading-relaxed">
                              <RichContentRenderer content={item.statement} />
                            </div>
                          </div>
                          {showSolutions && (
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[11px] shrink-0 ${
                                item.isCorrect
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {item.isCorrect ? 'ĐÚNG' : 'SAI'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Format 3: Text input */}
                {q.type === 'text_input' && (
                  <div className="p-3 bg-white border border-dashed border-slate-300 rounded-lg text-xs space-y-1">
                    <div className="text-slate-500 italic">
                      [Thí sinh điền câu trả lời số hoặc biểu thức vào ô trống]
                    </div>
                    {showSolutions && q.acceptedAnswers && (
                      <div className="text-emerald-800 font-medium pt-1">
                        Đáp án được chấp nhận:{' '}
                        <span className="font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {q.acceptedAnswers.join(' / ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Format 4: Grouped */}
                {q.type === 'grouped' && q.subQuestions && (
                  <div className="pl-3 border-l-2 border-purple-200 space-y-3 pt-1">
                    {q.subQuestions.map((sub, sIdx) => (
                      <div key={sub.id} className="text-xs space-y-1">
                        <div className="font-bold text-purple-900">
                          {index + 1}.{sIdx + 1}) {sub.question}
                        </div>
                        {sub.options && (
                          <div className="grid grid-cols-2 gap-1.5 pl-3">
                            {sub.options.map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className={`p-1.5 rounded border text-[11px] ${
                                  showSolutions && sub.correctAnswer === oIdx
                                    ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                {String.fromCharCode(65 + oIdx)}. {opt}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Explanation (when solutions visible) */}
                {showSolutions && q.explanation && (
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-950 mt-2 space-y-1">
                    <div className="font-bold text-blue-900 uppercase text-[10px] tracking-wider">
                      Lời giải chi tiết:
                    </div>
                    <div className="leading-relaxed">
                      <RichContentRenderer content={q.explanation} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Hiển thị {filteredQuestions.length} / {exam.questions.length} câu
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-semibold cursor-pointer"
          >
            Đóng xem trước
          </button>
        </div>
      </div>
    </div>
  );
};
