import React, { useState, useEffect } from 'react';
import { Exam, ExamResult } from '../types/exam';
import { Coffee, ArrowRight, CheckCircle2, Clock, Eye, Sparkles } from 'lucide-react';

interface IntermissionBreakViewProps {
  completedExam: Exam;
  completedResult: ExamResult;
  nextExam: Exam;
  nextIndex: number;
  totalExams: number;
  breakMinutes: number;
  onStartNext: () => void;
}

export const IntermissionBreakView: React.FC<IntermissionBreakViewProps> = ({
  completedExam,
  completedResult,
  nextExam,
  nextIndex,
  totalExams,
  breakMinutes,
  onStartNext,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(breakMinutes * 60);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onStartNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onStartNext]);

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const formattedTime = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  const progressPct = ((breakMinutes * 60 - secondsLeft) / (breakMinutes * 60)) * 100;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans select-none">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-8 sm:p-10 text-center relative overflow-hidden">
        {/* Top Progress Track */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-slate-100">
          <div
            className="h-full bg-amber-500 transition-all duration-1000"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Coffee / Break Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto mb-5 shadow-xs">
          <Coffee className="w-8 h-8" />
        </div>

        {/* Title */}
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Thời gian nghỉ giải lao & Chuyển môn thi</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">
          Hết giờ môn: {completedExam.title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
          Bạn đã hoàn thành môn thi thứ {nextIndex} / {totalExams}. Hãy thư giãn đầu óc trước khi bước vào môn kế tiếp.
        </p>

        {/* Big Timer Circle */}
        <div className="inline-flex flex-col items-center justify-center p-6 rounded-2xl bg-amber-50/60 border border-amber-200 mb-6 w-full max-w-xs mx-auto">
          <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
            Thời gian nghỉ còn lại
          </span>
          <span className="text-4xl sm:text-5xl font-mono font-extrabold text-amber-900 tracking-tight tabular-nums">
            {formattedTime}
          </span>
          <span className="text-[11px] text-amber-700 mt-1">
            Tự động chuyển môn khi hết giờ
          </span>
        </div>

        {/* Quick Review of Previous Subject Score */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-left">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <div>
              <div className="font-semibold text-slate-900">{completedExam.title}</div>
              <div className="text-slate-500">Đúng {completedResult.correctCount}/{completedResult.totalQuestions} câu</div>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-base text-slate-900">
              {(completedResult.scoreOnTenScale ?? completedResult.score ?? 0).toFixed(1)}
            </span>
            <span className="text-slate-400">/10</span>
          </div>
        </div>

        {/* Next Exam Preview */}
        <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-left mb-6">
          <div className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">
            Chuẩn bị môn thi tiếp theo ({nextIndex + 1}/{totalExams}):
          </div>
          <div className="text-base font-bold text-blue-950 mb-1">
            {nextExam.title}
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-800">
            <Clock className="w-3.5 h-3.5" />
            <span>Thời gian: {nextExam.durationMinutes} phút</span>
            <span>·</span>
            <span>Số lượng: {nextExam.questions.length} câu hỏi</span>
          </div>
        </div>

        {/* Relaxation Tips */}
        <div className="text-left text-xs text-slate-500 mb-6 space-y-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200/60">
          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-slate-600" />
            <span>Lời khuyên thư giãn:</span>
          </div>
          <p>• Uống một ngụm nước ấm và hít thở sâu 3 nhịp.</p>
          <p>• Thả lỏng mắt nhìn ra xa để giảm bớt mỏi mắt.</p>
          <p>• Chuẩn bị sẵn giấy nháp cho môn tiếp theo.</p>
        </div>

        {/* Skip Break Button */}
        <button
          onClick={onStartNext}
          className="w-full py-3.5 px-6 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <span>Tôi đã sẵn sàng · Bắt đầu môn kế tiếp ngay</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
