import React, { useState } from 'react';
import { ExamBundle, ExamResult } from '../types/exam';
import { 
  Trophy, 
  Clock, 
  CheckCircle2, 
  RotateCcw, 
  Home, 
  Printer, 
  ChevronRight, 
  Sparkles,
  Layers
} from 'lucide-react';
import { ExamResultView } from './ExamResultView';

interface BundleResultSummaryProps {
  bundle: ExamBundle;
  results: ExamResult[];
  onRetakeBundle: () => void;
  onGoHome: () => void;
}

export const BundleResultSummary: React.FC<BundleResultSummaryProps> = ({
  bundle,
  results,
  onRetakeBundle,
  onGoHome,
}) => {
  const [inspectingResultIndex, setInspectingResultIndex] = useState<number | null>(null);

  // Calculate aggregates
  const totalScore = Number(results.reduce((acc, r) => acc + (r.scoreOnTenScale ?? r.score ?? 0), 0).toFixed(2));
  const maxPossibleScore = results.length * 10;
  const avgScore = Number((totalScore / (results.length || 1)).toFixed(2));
  const totalCorrect = results.reduce((acc, r) => acc + r.correctCount, 0);
  const totalQuestions = results.reduce((acc, r) => acc + r.totalQuestions, 0);
  const totalTimeSeconds = results.reduce((acc, r) => acc + r.timeSpentSeconds, 0);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} phút ${s > 0 ? `${s} giây` : ''}`;
  };

  if (inspectingResultIndex !== null && results[inspectingResultIndex]) {
    return (
      <div className="py-6">
        <div className="max-w-5xl mx-auto px-4 mb-4">
          <button
            onClick={() => setInspectingResultIndex(null)}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs flex items-center gap-1.5"
          >
            ← Quay lại Bảng tổng kết tổ hợp ({bundle.title})
          </button>
        </div>
        <ExamResultView
          result={results[inspectingResultIndex]}
          onRetake={() => setInspectingResultIndex(null)}
          onRetakeMistakes={() => setInspectingResultIndex(null)}
          onGoHome={() => setInspectingResultIndex(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Hoàn thành tổ hợp thi
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {results.length} môn thi liên tiếp
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
              {bundle.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Tổng thời gian hoàn thành: {formatSeconds(totalTimeSeconds)} (không tính thời gian giải lao)
            </p>
          </div>

          {/* Big Score Box */}
          <div className="flex items-center gap-4 bg-purple-50/60 p-4 rounded-xl border border-purple-200 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-xs">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                Tổng điểm tổ hợp
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold font-mono text-purple-950 tabular-nums">
                  {totalScore.toFixed(1)}
                </span>
                <span className="text-sm font-bold text-purple-500 font-mono">
                  / {maxPossibleScore}
                </span>
              </div>
              <div className="text-[11px] font-mono text-purple-700">
                (Điểm TB: {avgScore.toFixed(2)} / 10)
              </div>
            </div>
          </div>
        </div>

        {/* 3 Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Số môn thi</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {results.length} môn
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Tổng câu trả lời đúng</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-950 tabular-nums">
              {totalCorrect} / {totalQuestions}
              <span className="text-xs text-emerald-700 font-normal ml-1">
                ({Math.round((totalCorrect / totalQuestions) * 100)}%)
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 mb-1">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Tốc độ trung bình</span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-950 tabular-nums">
              {Math.round(totalTimeSeconds / totalQuestions)}s
              <span className="text-xs text-blue-700 font-normal ml-1">/ câu</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              onClick={onGoHome}
              className="py-2 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Về trang chủ</span>
            </button>
            <button
              onClick={() => window.print()}
              className="py-2 px-3.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In kết quả tổ hợp</span>
            </button>
          </div>

          <button
            onClick={onRetakeBundle}
            className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thi lại toàn bộ tổ hợp này</span>
          </button>
        </div>
      </div>

      {/* Individual Subject Scores */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <h2 className="text-base font-bold text-slate-900 mb-1">
          Bảng điểm chi tiết từng môn trong tổ hợp
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Nhấp vào từng môn để xem lại chi tiết bài làm, đáp án và lời giải từng câu
        </p>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {results.map((res, idx) => (
            <div
              key={res.id}
              onClick={() => setInspectingResultIndex(idx)}
              className="p-4 sm:p-5 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-xs flex items-center justify-center text-slate-700 shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {res.examTitle}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span>Đúng: {res.correctCount}/{res.totalQuestions} câu</span>
                    <span>·</span>
                    <span>{formatSeconds(res.timeSpentSeconds)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 tabular-nums">
                    {(res.scoreOnTenScale ?? res.score ?? 0).toFixed(1)}
                    <span className="text-xs text-slate-400 font-normal">/10</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
