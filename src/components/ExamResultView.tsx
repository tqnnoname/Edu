import React, { useState } from 'react';
import { ExamResult } from '../types/exam';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Trophy, 
  RotateCcw, 
  Home, 
  Printer, 
  BarChart3, 
  Check, 
  X,
  Target
} from 'lucide-react';
import { RichContentRenderer } from './RichContentRenderer';

interface ExamResultViewProps {
  result: ExamResult;
  onRetake: () => void;
  onRetakeMistakes: (wrongQuestionIds: string[]) => void;
  onGoHome: () => void;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  result,
  onRetake,
  onRetakeMistakes,
  onGoHome,
}) => {
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct' | 'skipped'>('all');

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s} giây`;
    return `${m} phút ${s > 0 ? `${s} giây` : ''}`;
  };

  const scoreOnTen = result.scoreOnTenScale !== undefined 
    ? result.scoreOnTenScale 
    : ((result.earnedPoints / (result.totalPoints || 10)) * 10);

  let rankLabel = 'Cần Cố Gắng Thêm';
  let rankColor = 'text-amber-600 bg-amber-50 border-amber-200';
  if (scoreOnTen >= 9.0) {
    rankLabel = 'Xuất Sắc! Điểm Gần Tuyệt Đối';
    rankColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  } else if (scoreOnTen >= 8.0) {
    rankLabel = 'Giỏi · Nắm Chắc Kiến Thức';
    rankColor = 'text-blue-700 bg-blue-50 border-blue-200';
  } else if (scoreOnTen >= 6.5) {
    rankLabel = 'Khá · Đạt Yêu Cầu';
    rankColor = 'text-indigo-700 bg-indigo-50 border-indigo-200';
  } else if (scoreOnTen >= 5.0) {
    rankLabel = 'Trung Bình';
    rankColor = 'text-slate-700 bg-slate-50 border-slate-200';
  }

  // Get wrong or partially correct question IDs for retake
  const wrongIds = result.questions
    .filter((q) => {
      const detail = result.scoreDetails?.[q.id];
      return detail && !detail.isFullyCorrect;
    })
    .map((q) => q.id);

  // Filter review list
  const filteredQuestions = result.questions.filter((q) => {
    const detail = result.scoreDetails?.[q.id];
    if (!detail) return true;

    if (filter === 'wrong') return !detail.isFullyCorrect && !detail.isSkipped;
    if (filter === 'correct') return detail.isFullyCorrect;
    if (filter === 'skipped') return detail.isSkipped;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* Top Banner / Score Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${rankColor}`}>
                {rankLabel}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {new Date(result.completedAt).toLocaleTimeString('vi-VN')} · {new Date(result.completedAt).toLocaleDateString('vi-VN')}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
              {result.examTitle}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {result.grade} · Hoàn thành trong {formatSeconds(result.timeSpentSeconds)} (Giới hạn {formatSeconds(result.totalDurationSeconds)})
            </p>
          </div>

          {/* Big Score Box with actual points and 10 scale */}
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Điểm bài thi
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
                  {result.earnedPoints.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-slate-400 font-mono">
                  / {result.totalPoints.toFixed(1)}đ
                </span>
              </div>
              <div className="text-xs font-mono font-bold text-blue-700">
                (Thang 10: {scoreOnTen.toFixed(2)} / 10)
              </div>
            </div>
          </div>
        </div>

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Đúng hoàn toàn</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-950 tabular-nums">
              {result.correctCount}{' '}
              <span className="text-xs text-emerald-700 font-normal">
                ({Math.round((result.correctCount / result.totalQuestions) * 100)}%)
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 mb-1">
              <Target className="w-4 h-4 text-blue-600" />
              <span>Đúng một phần</span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-950 tabular-nums">
              {result.partialCount || 0} câu
            </div>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 mb-1">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Số câu sai</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-950 tabular-nums">
              {result.wrongCount} câu
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>Tốc độ trung bình</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {Math.round(result.timeSpentSeconds / result.totalQuestions)}s
              <span className="text-xs text-slate-500 font-normal"> / câu</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              onClick={onGoHome}
              className="py-2 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Về danh sách đề</span>
            </button>
            <button
              onClick={() => window.print()}
              className="hidden sm:flex py-2 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors items-center gap-1.5 cursor-pointer"
              title="In phiếu kết quả thi"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In kết quả</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {wrongIds.length > 0 && (
              <button
                onClick={() => onRetakeMistakes(wrongIds)}
                className="py-2 px-3.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Target className="w-3.5 h-3.5 text-amber-700" />
                <span>Luyện lại {wrongIds.length} câu chưa đúng</span>
              </button>
            )}
            <button
              onClick={onRetake}
              className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Làm lại bài thi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Review Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Xem lại chi tiết đáp án & lời giải
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kiểm tra điểm số từng câu, từng ý và đối chiếu đáp án chính xác
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`py-1.5 px-3 font-medium rounded-md transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({result.questions.length})
            </button>
            <button
              onClick={() => setFilter('wrong')}
              className={`py-1.5 px-3 font-medium rounded-md transition-colors cursor-pointer ${
                filter === 'wrong'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chưa đúng ({wrongIds.length})
            </button>
            <button
              onClick={() => setFilter('correct')}
              className={`py-1.5 px-3 font-medium rounded-md transition-colors cursor-pointer ${
                filter === 'correct'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đúng ({result.correctCount})
            </button>
          </div>
        </div>

        {/* Questions list */}
        <div className="space-y-6">
          {filteredQuestions.map((q) => {
            const detail = result.scoreDetails?.[q.id];
            const originalIndex = result.questions.findIndex((item) => item.id === q.id);
            const userAns = result.answers[q.id];

            return (
              <div
                key={q.id}
                className="p-5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      Câu {originalIndex + 1}
                    </span>
                    <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Đạt: {detail?.earnedPoints.toFixed(2)} / {detail?.maxPoints.toFixed(2)} điểm
                    </span>
                    {q.topic && (
                      <span className="text-xs text-slate-500">
                        · {q.topic}
                      </span>
                    )}
                  </div>

                  {/* Status label */}
                  {detail?.isFullyCorrect ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <Check className="w-3.5 h-3.5" />
                      Chính xác tuyệt đối
                    </span>
                  ) : detail?.isPartiallyCorrect ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      <Target className="w-3.5 h-3.5" />
                      Đúng một phần
                    </span>
                  ) : detail?.isSkipped ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Chưa trả lời
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      <X className="w-3.5 h-3.5" />
                      Sai
                    </span>
                  )}
                </div>

                {/* Question Statement */}
                <div className="text-sm md:text-base font-medium text-slate-900 mb-4 leading-relaxed">
                  <RichContentRenderer content={q.question} imageUrl={q.imageUrl} />
                </div>

                {/* Review Format 1: Single Choice */}
                {q.type === 'single_choice' && (
                  <div className="space-y-2 mb-4">
                    {(q.options || []).map((optText, optIdx) => {
                      const isSelected = userAns === optIdx;
                      const isThisCorrect = q.correctAnswer === optIdx;
                      const letter = String.fromCharCode(65 + optIdx);

                      let optBg = 'bg-slate-50/60 border-slate-200 text-slate-700';
                      let badge = null;

                      if (isThisCorrect) {
                        optBg = 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium';
                        badge = (
                          <span className="ml-auto text-xs font-semibold text-emerald-700 flex items-center gap-1 shrink-0">
                            <Check className="w-3.5 h-3.5" /> Đáp án đúng
                          </span>
                        );
                      } else if (isSelected && !isThisCorrect) {
                        optBg = 'bg-rose-50 border-rose-300 text-rose-950 font-medium';
                        badge = (
                          <span className="ml-auto text-xs font-semibold text-rose-700 flex items-center gap-1 shrink-0">
                            <X className="w-3.5 h-3.5" /> Lựa chọn của bạn
                          </span>
                        );
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-lg border text-xs md:text-sm flex items-start gap-3 ${optBg}`}
                        >
                          <span
                            className={`w-6 h-6 rounded font-bold text-xs flex items-center justify-center shrink-0 border ${
                              isThisCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : isSelected
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {letter}
                          </span>
                          <div className="flex-1 leading-relaxed">
                            <RichContentRenderer content={optText} />
                          </div>
                          {badge}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Review Format 2: True / False */}
                {q.type === 'true_false' && (
                  <div className="space-y-3 mb-4">
                    {(q.tfItems || []).map((item, itemIdx) => {
                      const ansMap = (userAns as { [id: string]: boolean }) || {};
                      const candidateChoice = ansMap[item.id];
                      const isItemCorrect = candidateChoice === item.isCorrect;
                      const letter = String.fromCharCode(97 + itemIdx);
                      const itemScore = detail?.itemScores?.[item.id];

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isItemCorrect
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : 'bg-rose-50/50 border-rose-200'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1">
                            <span className="font-bold text-xs text-slate-800 shrink-0 mt-0.5">
                              {letter})
                            </span>
                            <div className="leading-relaxed">
                              <RichContentRenderer content={item.statement} />
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            <div className="text-right text-xs">
                              <div>
                                Bạn chọn:{' '}
                                <strong className={candidateChoice ? 'text-emerald-700' : 'text-rose-700'}>
                                  {candidateChoice === undefined ? 'Chưa chọn' : candidateChoice ? 'ĐÚNG' : 'SAI'}
                                </strong>
                              </div>
                              <div className="text-slate-500">
                                Đáp án đúng:{' '}
                                <strong>{item.isCorrect ? 'ĐÚNG' : 'SAI'}</strong>
                              </div>
                            </div>

                            <span className={`font-mono font-bold text-xs px-2 py-1 rounded border ${
                              isItemCorrect ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              +{itemScore?.earned.toFixed(2) || '0.00'}đ
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Review Format 3: Text Input */}
                {q.type === 'text_input' && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 mb-4 text-xs sm:text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Câu trả lời bạn đã nhập:</span>
                      <strong className={`font-mono text-sm ${detail?.isFullyCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {(userAns as string) || '(Để trống)'}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-600">Đáp án được chấp nhận:</span>
                      <strong className="font-mono text-slate-900">
                        {(q.acceptedAnswers || []).join(' hoặc ')}
                      </strong>
                    </div>
                  </div>
                )}

                {/* Review Format 4: Grouped */}
                {q.type === 'grouped' && (
                  <div className="space-y-4 mb-4">
                    {(q.subQuestions || []).map((subQ, sIdx) => {
                      const subAnsMap = (userAns as { [id: string]: any }) || {};
                      const subAns = subAnsMap[subQ.id];
                      return (
                        <div key={subQ.id} className="p-3.5 bg-purple-50/30 rounded-xl border border-purple-200 text-xs sm:text-sm">
                          <div className="font-bold text-purple-900 mb-1">
                            Câu {originalIndex + 1}.{sIdx + 1}
                          </div>
                          <RichContentRenderer content={subQ.question} />
                          <div className="mt-2 text-xs text-slate-600">
                            Đáp án: {subQ.type === 'single_choice' && subQ.options && subQ.correctAnswer !== undefined ? subQ.options[subQ.correctAnswer] : (subQ.acceptedAnswers || []).join(' / ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Detailed Explanation */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800">
                  <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Lời giải chi tiết:</span>
                  </div>
                  <div className="text-slate-700 leading-relaxed pl-5 border-l-2 border-emerald-500">
                    <RichContentRenderer content={q.explanation} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
