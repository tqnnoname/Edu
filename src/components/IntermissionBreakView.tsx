import React, { useState, useEffect } from 'react';
import { Exam, ExamResult } from '../types/exam';
import { Coffee, ArrowRight, CheckCircle2, Clock, Eye, Sparkles } from 'lucide-react';
import { RoomLockGuard } from './RoomLockGuard';

interface IntermissionBreakViewProps {
  completedExam: Exam;
  completedResult: ExamResult;
  nextExam?: Exam;
  nextClusterExams?: Exam[];
  nextClusterMaxDuration?: number;
  nextIndex: number;
  totalExams: number;
  breakMinutes: number;
  isRoomLocked?: boolean;
  onStartNext: () => void;
}

export const IntermissionBreakView: React.FC<IntermissionBreakViewProps> = ({
  completedExam,
  completedResult: _completedResult,
  nextExam,
  nextClusterExams,
  nextClusterMaxDuration,
  nextIndex,
  totalExams,
  breakMinutes,
  isRoomLocked = false,
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

        {/* Neutral Submission Confirmation (Results announced only after completing the entire bundle) */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-left">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-slate-900">Đã ghi nhận bài làm: {completedExam.title}</div>
              <div className="text-slate-500 mt-0.5">
                Kết quả và điểm số sẽ được công bố sau khi hoàn thành toàn bộ các môn trong tổ hợp.
              </div>
            </div>
          </div>
        </div>

        {/* Next Exam / Cluster Preview */}
        {nextClusterExams && nextClusterExams.length > 0 ? (
          <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl text-left mb-6">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-700 text-white uppercase tracking-wide">
                Cụm môn tự chọn
              </span>
              <span className="text-xs font-bold text-purple-900">
                Gồm {nextClusterExams.length} môn tự chọn
              </span>
            </div>
            <div className="text-sm sm:text-base font-bold text-purple-950 mb-2">
              {nextClusterExams.map((e) => e.title).join(' • ')}
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Quy chế thi cụm:</strong> Thời gian làm cả cụm bằng thời gian lớn nhất của 1 môn (<strong>{nextClusterMaxDuration || 45} phút</strong>). Bạn có thể tự do chuyển đổi giữa các môn trong cụm!
              </div>
            </div>
          </div>
        ) : nextExam ? (
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
        ) : null}

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

      <RoomLockGuard
        active={Boolean(isRoomLocked)}
        title={`Nghỉ chuyển môn · ${completedExam.title}`}
        subtitle="Giữ chế độ khóa toàn màn hình giữa các môn trong tổ hợp"
        remainingLabel={formattedTime}
      />
    </div>
  );
};
