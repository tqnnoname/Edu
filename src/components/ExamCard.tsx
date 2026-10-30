import React from 'react';
import { Exam, SubjectType, UserRole } from '../types/exam';
import { 
  Calculator, 
  Languages, 
  Atom, 
  FlaskConical, 
  Landmark, 
  Terminal, 
  Dna, 
  BookOpen, 
  Clock, 
  HelpCircle,
  Play,
  Lightbulb,
  Trash2,
  Edit3,
  Copy,
  Eye,
  Globe,
  Lock,
  Layers,
  Calendar,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';

interface ExamCardProps {
  exam: Exam;
  userRole?: UserRole;
  attemptCount?: number;
  onStartExam: (exam: Exam, mode: 'exam' | 'practice') => void;
  onPreviewExam?: (exam: Exam) => void;
  onEditExam?: (exam: Exam) => void;
  onDuplicateExam?: (exam: Exam) => void;
  onDeleteCustom?: (examId: string) => void;
}

const subjectIcons: Record<SubjectType, React.ElementType> = {
  math: Calculator,
  english: Languages,
  physics: Atom,
  chemistry: FlaskConical,
  history: Landmark,
  it: Terminal,
  biology: Dna,
  general: BookOpen,
};

const subjectLabels: Record<SubjectType, string> = {
  math: 'Toán học',
  english: 'Tiếng Anh',
  physics: 'Vật lý',
  chemistry: 'Hóa học',
  history: 'Lịch sử',
  it: 'Tin học & CNTT',
  biology: 'Sinh học',
  general: 'Tổng hợp',
};

const subjectColors: Record<SubjectType, { text: string; bg: string; border: string }> = {
  math: { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
  english: { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  physics: { text: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-100' },
  chemistry: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
  history: { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
  it: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  biology: { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-100' },
  general: { text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
};

export const ExamCard: React.FC<ExamCardProps> = ({
  exam,
  userRole = 'student',
  attemptCount = 0,
  onStartExam,
  onPreviewExam,
  onEditExam,
  onDuplicateExam,
  onDeleteCustom,
}) => {
  const Icon = subjectIcons[exam.subject] || BookOpen;
  const color = subjectColors[exam.subject] || subjectColors.general;
  const isTeacher = userRole === 'teacher';

  // Compute status and scheduling state
  const now = new Date().getTime();
  const openTimestamp = exam.openTime ? new Date(exam.openTime).getTime() : null;
  const closeTimestamp = exam.closeTime ? new Date(exam.closeTime).getTime() : null;

  const isBeforeOpen = openTimestamp !== null && now < openTimestamp;
  const isAfterClose = closeTimestamp !== null && now > closeTimestamp;

  const isAttemptsExceeded = 
    !isTeacher && 
    exam.maxAttempts !== undefined && 
    exam.maxAttempts > 0 && 
    attemptCount >= exam.maxAttempts;

  const isExamBlockedForStudent = !isTeacher && (
    exam.status === 'draft' ||
    exam.status === 'closed' ||
    isBeforeOpen ||
    isAfterClose ||
    isAttemptsExceeded
  );

  const formatDateTimeStr = (isoOrLocal?: string) => {
    if (!isoOrLocal) return '';
    try {
      const d = new Date(isoOrLocal);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
    } catch {
      return isoOrLocal;
    }
  };

  const getVisibilityBadge = () => {
    const v = exam.visibility || 'public';
    if (v === 'private') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Lock className="w-3 h-3" />
          Riêng người ra đề
        </span>
      );
    }
    if (v === 'exam_only') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <Layers className="w-3 h-3" />
          Giới hạn trong kỳ thi
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
        <Globe className="w-3 h-3" />
        Công khai web
      </span>
    );
  };

  const getStatusBadge = () => {
    if (exam.status === 'draft') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          Bản nháp
        </span>
      );
    }
    if (exam.status === 'closed' || isAfterClose) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
          Đã đóng
        </span>
      );
    }
    if (exam.status === 'scheduled' || isBeforeOpen) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Calendar className="w-3 h-3" />
          Đã lên lịch
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Đang mở
      </span>
    );
  };

  return (
    <div className="group bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between hover:border-slate-300 relative">
      <div>
        {/* Top bar info & Manage Actions */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`p-2 rounded-lg ${color.bg} ${color.text} border ${color.border}`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">
              {subjectLabels[exam.subject]}
            </span>
          </div>

          {/* Manage Actions - Only visible for teacher */}
          {isTeacher && (
            <div className="flex items-center gap-1">
              {onEditExam && (
                <button
                  onClick={() => onEditExam(exam)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                  title="Sửa đề thi, câu hỏi và đáp án"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {onDuplicateExam && (
                <button
                  onClick={() => onDuplicateExam(exam)}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                  title="Nhân bản đề thi này"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              {onDeleteCustom && (
                <button
                  onClick={() => onDeleteCustom(exam.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                  title="Xóa đề thi này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status & Visibility badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          {getVisibilityBadge()}
          {getStatusBadge()}

          {/* Anti-cheat tab switch limit tag */}
          {exam.maxTabSwitches !== undefined && exam.maxTabSwitches > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
              title={`Quy định chống gian lận: Thoát khỏi màn hình thi ${exam.maxTabSwitches} lần sẽ bị hệ thống tự động nộp bài ngay!`}
            >
              <ShieldAlert className="w-3 h-3 text-amber-600" />
              Rời màn hình {exam.maxTabSwitches} lần = nộp
            </span>
          )}

          {/* Max attempts tag */}
          {exam.maxAttempts !== undefined && exam.maxAttempts > 0 && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                isAttemptsExceeded
                  ? 'bg-rose-50 text-rose-800 border border-rose-200 font-bold'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              Lượt thi: {attemptCount}/{exam.maxAttempts}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-2">
          {exam.title}
        </h3>

        {/* Unboxed Metadata with · separator */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 flex-wrap">
          <span>{exam.grade}</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="flex items-center gap-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {exam.durationMinutes} phút
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="flex items-center gap-1 font-mono">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            {exam.questions.length} câu
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono font-semibold text-blue-700">
            {exam.totalPoints || 10} điểm
          </span>
        </div>

        {/* Timing schedule info if applicable */}
        {(exam.openTime || exam.closeTime) && (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-md p-1.5 mb-2.5 border border-slate-200 flex items-center justify-between gap-1 flex-wrap font-mono">
            {exam.openTime && (
              <span>Mở: <strong className="text-slate-700">{formatDateTimeStr(exam.openTime)}</strong></span>
            )}
            {exam.closeTime && (
              <span>Đóng: <strong className="text-slate-700">{formatDateTimeStr(exam.closeTime)}</strong></span>
            )}
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-4">
          {exam.description}
        </p>
      </div>

      {/* Action buttons */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        {isExamBlockedForStudent ? (
          <div className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 text-slate-600 text-xs">
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              {isAttemptsExceeded
                ? 'Đã hết lượt thi cho phép'
                : isBeforeOpen
                ? `Mở lúc ${formatDateTimeStr(exam.openTime)}`
                : isAfterClose || exam.status === 'closed'
                ? 'Đã hết hạn làm đề thi'
                : 'Đang ở trạng thái Bản nháp'}
            </span>
            {onPreviewExam && (
              <button
                onClick={() => onPreviewExam(exam)}
                className="py-1 px-2 text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 rounded border border-blue-200 transition-colors cursor-pointer shrink-0"
              >
                Xem thử
              </button>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={() => onStartExam(exam, 'exam')}
              className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer min-w-[90px]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Vào thi</span>
            </button>
            <button
              onClick={() => onStartExam(exam, 'practice')}
              className="py-2 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Chế độ luyện tập có giải thích ngay"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
              <span>Luyện tập</span>
            </button>
            {onPreviewExam && (
              <button
                onClick={() => onPreviewExam(exam)}
                className="py-2 px-2.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer border border-blue-200"
                title="Xem thử đề thi trước khi làm"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>Xem thử</span>
              </button>
            )}
            {isTeacher && onEditExam && (
              <button
                onClick={() => onEditExam(exam)}
                className="py-2 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                title="Sửa nội dung văn bản, câu hỏi, điểm số"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sửa</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
