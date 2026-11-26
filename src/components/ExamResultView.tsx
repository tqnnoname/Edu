import React, { useEffect, useRef, useState } from 'react';
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
  Target,
  FileSpreadsheet
} from 'lucide-react';
import { RichContentRenderer } from './RichContentRenderer';
import { MatchingQuestionView } from './MatchingQuestionView';
import {
  formatAcceptedShortAnswersList,
  formatShortAnswerDecimalComma,
  formatTrueFalseScoringRule,
} from '../utils/scoring';
import { renderMath } from '../utils/renderMath';
import { exportResultsToExcel } from '../utils/exportFiles';

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
  const reviewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    renderMath(reviewContainerRef.current);
  }, [result.id, filter]);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s} giây`;
    return `${m} phút ${s > 0 ? `${s} giây` : ''}`;
  };

  const scoreOnTen = result.scoreOnTenScale !== undefined 
    ? result.scoreOnTenScale 
    : ((result.earnedPoints / (result.totalPoints || 10)) * 10);

  const isScoreHidden = result.showScoreAfterExam === false;

  let rankLabel = 'Đã hoàn thành';
  let rankColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (!isScoreHidden) {
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
    } else {
      rankLabel = 'Cần Cố Gắng Thêm';
      rankColor = 'text-amber-600 bg-amber-50 border-amber-200';
    }
  }

  // Get wrong or partially correct question IDs for retake (submitted essays wait for grading)
  const wrongIds = result.questions
    .filter((q) => {
      const detail = result.scoreDetails?.[q.id];
      if (q.type === 'essay' && detail && !detail.isSkipped) return false;
      return detail && !detail.isFullyCorrect;
    })
    .map((q) => q.id);

  // Filter review list
  const filteredQuestions = result.questions.filter((q) => {
    const detail = result.scoreDetails?.[q.id];
    if (!detail) return true;

    if (filter === 'wrong') {
      if (q.type === 'essay' && !detail.isSkipped) return false;
      return !detail.isFullyCorrect && !detail.isSkipped;
    }
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

          {/* Big Score Box with actual points and 10 scale or Hidden notice */}
          {isScoreHidden ? (
            <div className="flex items-center gap-3 bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 text-emerald-950 shrink-0 max-w-sm">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Đã hoàn thành
                </div>
                <div className="text-xs text-emerald-900 mt-0.5 leading-snug">
                  Bài làm của bạn đã được ghi nhận. Điểm số chính thức sẽ được giáo viên công bố sau.
                </div>
              </div>
            </div>
          ) : (
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
          )}
        </div>

        {/* Tab switch / Anti-cheat Submission Reason Banner */}
        {result.submissionReason && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Ghi chú nộp bài:</strong> {result.submissionReason}
              {result.tabSwitchCount ? ` (Đã ghi nhận rời màn hình thi ${result.tabSwitchCount} lần)` : ''}
            </span>
          </div>
        )}

        {/* 4 Stats Cards */}
        {result.showScoreAfterExam !== false && (
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
        )}

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
            {result.showScoreAfterExam !== false && (
              <button
                type="button"
                onClick={() =>
                  exportResultsToExcel([result], {
                    examTitle: result.examTitle,
                  })
                }
                className="py-2 px-3.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Xuất kết quả bài thi ra Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Xuất Excel</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {result.showAnswersAfterExam !== false && wrongIds.length > 0 && (
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
      {result.showAnswersAfterExam === false ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Đáp án chi tiết đang được ẩn theo quy chế phòng thi
          </h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
            Giáo viên ra đề đã cài đặt <strong>ẩn đáp án và lời giải chi tiết</strong> sau khi nộp bài để bảo mật đề thi và phục vụ các ca thi tiếp theo.
          </p>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        {result.showOnlyStudentAnswersAfterExam && (
          <div className="mb-6 p-4 rounded-xl bg-cyan-50/80 border border-cyan-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-cyan-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-cyan-950">
                Chế độ chỉ xem lại bài làm của bạn
              </h3>
              <p className="text-xs text-cyan-900 mt-1 leading-relaxed">
                Theo quy định của đề thi này, bạn chỉ được phép xem lại toàn bộ các câu trả lời bạn đã chọn hoặc đã nhập. Đáp án chuẩn và lời giải chi tiết được giáo viên bảo mật.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {result.showOnlyStudentAnswersAfterExam 
                ? 'Xem lại câu trả lời đã làm của bạn' 
                : 'Xem lại chi tiết đáp án & lời giải'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {result.showOnlyStudentAnswersAfterExam 
                ? 'Kiểm tra lại toàn bộ phương án bạn đã điền trong bài thi' 
                : 'Kiểm tra điểm số từng câu, từng ý và đối chiếu đáp án chính xác'}
            </p>
          </div>

          {/* Filter tabs (Hidden if points/answers are masked) */}
          {!result.showOnlyStudentAnswersAfterExam && result.showScoreAfterExam !== false && (
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
          )}
        </div>

        {/* Questions list */}
        <div ref={reviewContainerRef} className="space-y-6">
          {filteredQuestions.map((q) => {
            const detail = result.scoreDetails?.[q.id];
            const originalIndex = result.questions.findIndex((item) => item.id === q.id);
            const userAns = result.answers[q.id];
            const isScoreHidden = result.showScoreAfterExam === false;
            const isOnlyStudentAnswers = Boolean(result.showOnlyStudentAnswersAfterExam) || isScoreHidden;

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
                    {!isOnlyStudentAnswers && (
                      <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Đạt: {detail?.earnedPoints.toFixed(2)} / {detail?.maxPoints.toFixed(2)} điểm
                      </span>
                    )}
                    {q.topic && (
                      <span className="text-xs text-slate-500">
                        · {q.topic}
                      </span>
                    )}
                  </div>

                  {/* Status label */}
                  {isOnlyStudentAnswers ? (
                    <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      Đã ghi nhận câu trả lời
                    </span>
                  ) : q.type === 'essay' && !detail?.isSkipped ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Đã nộp tự luận (Chờ GV chấm)
                    </span>
                  ) : detail?.isFullyCorrect ? (
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
                  <RichContentRenderer
                    content={q.question}
                    imageUrl={q.imageUrl}
                    imageCaption={q.imageCaption}
                    inlineImages={q.inlineImages}
                  />
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

                      if (isOnlyStudentAnswers) {
                        if (isSelected) {
                          optBg = 'bg-blue-50 border-blue-400 text-blue-950 font-semibold';
                          badge = (
                            <span className="ml-auto text-xs font-semibold text-blue-800 flex items-center gap-1 shrink-0 bg-blue-100/70 px-2 py-0.5 rounded">
                              ✓ Lựa chọn của bạn
                            </span>
                          );
                        }
                      } else {
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
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-lg border text-xs md:text-sm flex items-start gap-3 ${optBg}`}
                        >
                          <span
                            className={`w-6 h-6 rounded font-bold text-xs flex items-center justify-center shrink-0 border ${
                              isOnlyStudentAnswers
                                ? isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                                : isThisCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : isSelected
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {letter}
                          </span>
                          <div className="flex-1 leading-relaxed">
                            <RichContentRenderer content={optText} inlineImages={q.inlineImages} />
                            {q.optionImages?.[optIdx] && (
                              <div className="mt-1.5">
                                <img
                                  src={q.optionImages[optIdx]}
                                  alt={`Phương án ${letter}`}
                                  className="max-h-36 rounded border border-slate-200 object-contain bg-white shadow-2xs"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}
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
                    {!isOnlyStudentAnswers && (() => {
                      const ansMap = (userAns as { [id: string]: boolean }) || {};
                      const correctSubCount = (q.tfItems || []).filter((item) => ansMap[item.id] === item.isCorrect).length;
                      return (
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{formatTrueFalseScoringRule(q)}</span>
                          </div>
                          <span className="font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                            Đúng {correctSubCount}/{(q.tfItems || []).length} ý → Đạt {detail?.earnedPoints ?? 0}đ
                          </span>
                        </div>
                      );
                    })()}
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
                            isOnlyStudentAnswers
                              ? 'bg-slate-50 border-slate-200'
                              : isItemCorrect
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : 'bg-rose-50/50 border-rose-200'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1">
                            <span className="font-bold text-xs text-slate-800 shrink-0 mt-0.5">
                              {letter})
                            </span>
                            <div className="leading-relaxed">
                              <RichContentRenderer content={item.statement} inlineImages={q.inlineImages} />
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            <div className="text-right text-xs">
                              <div>
                                Bạn chọn:{' '}
                                <strong className={candidateChoice !== undefined ? 'text-blue-800 font-bold' : 'text-slate-500'}>
                                  {candidateChoice === undefined ? 'Chưa chọn' : candidateChoice ? 'ĐÚNG' : 'SAI'}
                                </strong>
                              </div>
                              {!isOnlyStudentAnswers && (
                                <div className="text-slate-500">
                                  Đáp án đúng:{' '}
                                  <strong>{item.isCorrect ? 'ĐÚNG' : 'SAI'}</strong>
                                </div>
                              )}
                            </div>

                            {!isOnlyStudentAnswers && (
                              <span className={`font-mono font-bold text-xs px-2 py-1 rounded border ${
                                isItemCorrect ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}>
                                +{itemScore?.earned.toFixed(2) || '0.00'}đ
                              </span>
                            )}
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
                      <strong className={`font-mono text-sm ${isOnlyStudentAnswers ? 'text-blue-900' : detail?.isFullyCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {userAns ? formatShortAnswerDecimalComma(String(userAns)) : '(Để trống)'}
                      </strong>
                    </div>
                    {!isOnlyStudentAnswers && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <span className="text-slate-600">Đáp án được chấp nhận:</span>
                        <strong className="font-mono text-slate-900">
                          {formatAcceptedShortAnswersList(q.acceptedAnswers) || '—'}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Review Format 3b: Matching */}
                {q.type === 'matching' && (
                  <div className="mb-4">
                    <MatchingQuestionView
                      question={q}
                      mode="review"
                      userAnswer={(userAns as { [leftId: string]: string }) || {}}
                      isOnlyStudentAnswers={isOnlyStudentAnswers}
                      hidePrompt={true}
                    />
                  </div>
                )}

                {/* Review Format 3c: Essay */}
                {q.type === 'essay' && (
                  <div className="space-y-3 mb-4 text-xs sm:text-sm">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                      <div className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                        Bài làm tự luận của bạn:
                      </div>
                      {typeof userAns === 'string' && userAns.trim() ? (
                        <div className="text-slate-900 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                          <RichContentRenderer
                            content={userAns}
                            inlineImages={{ ...(q.inlineImages || {}), ...(result.inlineImages || {}) }}
                          />
                        </div>
                      ) : (
                        <div className="text-slate-500 italic">(Chưa nhập bài làm)</div>
                      )}
                    </div>

                    {!isOnlyStudentAnswers && q.sampleAnswer && q.sampleAnswer.trim() && (
                      <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-1.5">
                        <div className="font-bold text-emerald-900 text-xs uppercase tracking-wider">
                          Đáp án tham khảo / Gợi ý chấm điểm:
                        </div>
                        <div className="text-emerald-950 leading-relaxed">
                          <RichContentRenderer content={q.sampleAnswer} inlineImages={q.inlineImages} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Review Format 4: Grouped */}
                {q.type === 'grouped' && (
                  <div className="space-y-4 mb-4">
                    {(q.subQuestions || []).map((subQ, sIdx) => {
                      const subAnsMap = (userAns as { [id: string]: any }) || {};
                      const subAns = subAnsMap[subQ.id];
                      const subDetail = detail?.subQuestionScores?.[subQ.id];
                      return (
                        <div key={subQ.id} className="p-3.5 bg-purple-50/30 rounded-xl border border-purple-200 text-xs sm:text-sm">
                          <div className="flex items-center justify-between font-bold text-purple-900 mb-1">
                            <span>Câu {originalIndex + 1}.{sIdx + 1}</span>
                            {!isOnlyStudentAnswers && subDetail && (
                              <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                                subDetail.isFullyCorrect
                                  ? 'bg-emerald-100 text-emerald-800 font-semibold'
                                  : 'bg-rose-100 text-rose-800 font-semibold'
                              }`}>
                                {subDetail.earnedPoints} / {subDetail.maxPoints} đ
                              </span>
                            )}
                          </div>
                          <RichContentRenderer
                            content={subQ.question}
                            imageUrl={subQ.imageUrl}
                            imageCaption={subQ.imageCaption}
                            inlineImages={subQ.inlineImages || q.inlineImages}
                          />
                          {subQ.type === 'single_choice' && subQ.options && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                              {subQ.options.map((sOpt, sOptIdx) => {
                                const sLetter = String.fromCharCode(65 + sOptIdx);
                                const isSubCorrect = subQ.correctAnswer === sOptIdx;
                                const isUserSelected = subAns === sOptIdx;
                                return (
                                  <div
                                    key={sOptIdx}
                                    className={`p-2 rounded border text-xs ${
                                      !isOnlyStudentAnswers && isSubCorrect
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium'
                                        : isUserSelected && !isSubCorrect
                                        ? 'bg-rose-50 border-rose-300 text-rose-950'
                                        : isUserSelected
                                        ? 'bg-blue-50 border-blue-300 text-blue-950 font-medium'
                                        : 'bg-white border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-start gap-1">
                                      <span className="font-bold shrink-0">{sLetter}.</span>
                                      <div className="flex-1 min-w-0">
                                        <RichContentRenderer
                                          content={sOpt}
                                          inlineImages={subQ.inlineImages || q.inlineImages}
                                        />
                                      </div>
                                      {!isOnlyStudentAnswers && isSubCorrect && <span className="ml-auto text-[10px] text-emerald-700 font-bold shrink-0">✓ Đúng</span>}
                                      {isUserSelected && (!isSubCorrect || isOnlyStudentAnswers) && (
                                        <span className={`ml-auto text-[10px] font-bold shrink-0 ${isOnlyStudentAnswers ? 'text-blue-700' : 'text-rose-700'}`}>
                                          {isOnlyStudentAnswers ? '✓ Bạn chọn' : '✗ Bạn chọn'}
                                        </span>
                                      )}
                                    </div>
                                    {subQ.optionImages?.[sOptIdx] && (
                                      <div className="mt-1">
                                        <img
                                          src={subQ.optionImages[sOptIdx]}
                                          alt={`Ý ${sLetter}`}
                                          className="max-h-24 rounded border border-purple-100 object-contain bg-white shadow-2xs"
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {subQ.type === 'text_input' && (
                            <div className="p-3 rounded-lg border border-purple-200 bg-white mt-2 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600">Câu trả lời bạn đã nhập:</span>
                                <strong className={`font-mono ${
                                  isOnlyStudentAnswers
                                    ? 'text-blue-900'
                                    : subDetail?.isFullyCorrect
                                    ? 'text-emerald-700'
                                    : 'text-rose-700'
                                }`}>
                                  {typeof subAns === 'string' && subAns.trim()
                                    ? formatShortAnswerDecimalComma(subAns)
                                    : '(Để trống)'}
                                </strong>
                              </div>
                              {!isOnlyStudentAnswers && (
                                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                                  <span className="text-slate-600">Đáp án được chấp nhận:</span>
                                  <strong className="font-mono text-purple-900">
                                    {formatAcceptedShortAnswersList(subQ.acceptedAnswers) || '—'}
                                  </strong>
                                </div>
                              )}
                            </div>
                          )}

                          {subQ.type !== 'text_input' && (
                            <div className="mt-2 text-xs text-slate-700 flex flex-wrap items-start gap-1">
                              <span className="shrink-0">Bạn đã trả lời:</span>
                              <strong className="inline-flex items-start gap-1">
                                {subAns !== undefined ? (
                                  subQ.type === 'single_choice' && subQ.options && typeof subAns === 'number' ? (
                                      <>
                                        <span>{String.fromCharCode(65 + subAns)}.</span>
                                        <RichContentRenderer
                                          content={subQ.options[subAns] || ''}
                                          inlineImages={subQ.inlineImages || q.inlineImages}
                                        />
                                      </>
                                    ) : (
                                      <span>{String(subAns)}</span>
                                    )
                                  ) : (
                                    '(Chưa làm)'
                                  )}
                                </strong>
                              </div>
                            )}

                            {!isOnlyStudentAnswers && (subQ.explanation || subQ.explanationImageUrl) && (
                              <div className="mt-2.5 p-2.5 bg-white border border-purple-200 rounded-lg text-xs text-slate-800 space-y-1">
                                <div className="font-bold text-purple-900">
                                  Lời giải chi tiết ({originalIndex + 1}.{sIdx + 1}):
                                </div>
                                <RichContentRenderer
                                  content={subQ.explanation || ''}
                                  imageUrl={subQ.explanationImageUrl}
                                  imageCaption={subQ.explanationImageCaption}
                                  inlineImages={subQ.inlineImages || q.inlineImages}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                {/* Detailed Explanation - Only shown if not restricted */}
                {!isOnlyStudentAnswers && (q.explanation || q.explanationImageUrl) && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-800">
                    <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Lời giải chi tiết:</span>
                    </div>
                    <div className="text-slate-700 leading-relaxed pl-5 border-l-2 border-emerald-500">
                      <RichContentRenderer
                        content={q.explanation || ''}
                        imageUrl={q.explanationImageUrl}
                        imageCaption={q.explanationImageCaption}
                        inlineImages={q.inlineImages}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
};
