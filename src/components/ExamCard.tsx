import React, { useState } from 'react';
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
  AlertTriangle,
  Users,
  CopySlash,
  KeyRound,
  Shuffle,
  Check,
  FileDown,
  FileSpreadsheet,
  MonitorPlay
} from 'lucide-react';

interface ExamCardProps {
  exam: Exam;
  userRole?: UserRole;
  attemptCount?: number;
  resultCount?: number;
  activeClassId?: string;
  isEnrolledInClass?: boolean;
  onStartExam: (exam: Exam, mode: 'exam' | 'practice') => void;
  onPreviewExam?: (exam: Exam) => void;
  onEditExam?: (exam: Exam) => void;
  onDuplicateExam?: (exam: Exam) => void;
  onDeleteCustom?: (examId: string) => void;
  onExportWord?: (exam: Exam) => void;
  onExportResultsExcel?: (exam: Exam) => void;
  onPresentExam?: (exam: Exam) => void;
}

const subjectIcons: Record<string, React.ElementType> = {
  math: Calculator,
  english: Languages,
  physics: Atom,
  chemistry: FlaskConical,
  history: Landmark,
  it: Terminal,
  biology: Dna,
  general: BookOpen,
};

const subjectLabels: Record<string, string> = {
  math: 'Toán học',
  english: 'Tiếng Anh',
  physics: 'Vật lý',
  chemistry: 'Hóa học',
  history: 'Lịch sử',
  it: 'Tin học & CNTT',
  biology: 'Sinh học',
  general: 'Tổng hợp',
};

const subjectColors: Record<string, { text: string; bg: string; border: string }> = {
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
  resultCount = 0,
  activeClassId,
  isEnrolledInClass = false,
  onStartExam,
  onPreviewExam,
  onEditExam,
  onDuplicateExam,
  onDeleteCustom,
  onExportWord,
  onExportResultsExcel,
  onPresentExam,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const Icon = subjectIcons[exam.subject] || BookOpen;
  const color = subjectColors[exam.subject] || subjectColors.general;
  const isTeacher = userRole === 'teacher';

  // 1. Chế độ người ra đề (Draft, Private, or teacherMode === 'creator')
  const isCreatorOnly =
    exam.visibility === 'private' ||
    exam.status === 'draft' ||
    exam.teacherMode === 'creator' ||
    Boolean(exam.isCreatorOnlyMode);

  // 2. Chế độ giới hạn trong lớp
  const isClassRestricted = exam.visibility === 'class';
  const isStudentNotInClass = !isTeacher && isClassRestricted && exam.assignedClassId && !isEnrolledInClass && activeClassId !== exam.assignedClassId;

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

  // Total block state for student
  const isExamBlockedForStudent = !isTeacher && (
    isCreatorOnly ||
    isStudentNotInClass ||
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
    if (v === 'private' || exam.teacherMode === 'creator' || exam.isCreatorOnlyMode) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
          title={
            exam.creatorName || exam.creatorEmail
              ? `Người ra đề: ${exam.creatorName || exam.creatorEmail} · Chỉ người ra đề & Quản trị viên được xem`
              : 'Chỉ người ra đề & Quản trị viên được xem'
          }
        >
          <Lock className="w-3 h-3" />
          Chế độ Người ra đề{exam.creatorName ? ` · ${exam.creatorName}` : ' (GV & QTV)'}
        </span>
      );
    }
    if (v === 'class') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
          <Users className="w-3 h-3 text-blue-600" />
          Giới hạn trong Lớp{exam.assignedClassName ? `: ${exam.assignedClassName}` : ''}
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
          Bản nháp (Chưa mở)
        </span>
      );
    }
    if (exam.status === 'closed' || isAfterClose) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
          Đã đóng đề
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
        Đang mở thi
      </span>
    );
  };

  return (
    <div className={`group bg-white rounded-xl border p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between relative ${
      isExamBlockedForStudent ? 'border-amber-200 bg-slate-50/70' : 'border-slate-200/80 hover:border-slate-300'
    }`}>
      <div>
        {/* Top bar info & Manage Actions */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`p-2 rounded-lg ${color.bg} ${color.text} border ${color.border}`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">
              {subjectLabels[exam.subject] || exam.subject}
            </span>
          </div>

          {/* Manage Actions - Only visible for teacher */}
          {isTeacher && (
            <div className="flex items-center gap-1">
              {onExportWord && (
                <button
                  type="button"
                  onClick={() => onExportWord(exam)}
                  className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                  title="Xuất file Word đề thi (.docx)"
                >
                  <FileDown className="w-3.5 h-3.5" />
                </button>
              )}
              {onPresentExam && (
                <button
                  type="button"
                  onClick={() => onPresentExam(exam)}
                  className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                  title={`Trình chiếu công bố điểm phòng thi (${resultCount} bài nộp)`}
                >
                  <MonitorPlay className="w-3.5 h-3.5" />
                </button>
              )}
              {onExportResultsExcel && resultCount > 0 && (
                <button
                  type="button"
                  onClick={() => onExportResultsExcel(exam)}
                  className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                  title={`Xuất Excel kết quả (${resultCount} bài nộp)`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </button>
              )}
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

          {/* Anti-copy tag */}
          {exam.allowCopy === false && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-300"
              title="Chế độ bảo mật: Đã khóa tính năng sao chép câu hỏi (chống copy)"
            >
              <CopySlash className="w-3 h-3 text-slate-600" />
              Chống copy
            </span>
          )}

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
          {/* Lockdown until timeout tag */}
          {exam.lockExitUntilTimeout && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200"
              title="Quy chế phòng thi nghiêm ngặt: Không được phép thoát ra khỏi giao diện thi cho đến khi hết thời gian làm bài!"
            >
              <Lock className="w-3 h-3 text-rose-600" />
              Khóa thoát phòng đến hết giờ
            </span>
          )}

          {/* Min submit duration tag */}
          {exam.minSubmitMinutes !== undefined && exam.minSubmitMinutes > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200"
              title={`Thời gian làm bài tối thiểu: Chỉ được phép nộp bài sau khi đã làm tối thiểu ${exam.minSubmitMinutes} phút!`}
            >
              <Clock className="w-3 h-3 text-indigo-600" />
              Nộp sau ≥ {exam.minSubmitMinutes}p
            </span>
          )}

          {/* Require candidate access code tag */}
          {exam.requireAccessCode && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-300"
              title="Đề thi bảo mật: Chỉ thí sinh có mã dự thi / mật mã do giáo viên cung cấp mới được phép vào làm bài!"
            >
              <KeyRound className="w-3 h-3 text-amber-700" />
              Cần mã dự thi được cấp
            </span>
          )}

          {/* Review mode tag */}
          {exam.showOnlyStudentAnswersAfterExam && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-800 border border-cyan-200"
              title="Chế độ xem kết quả: Sau khi nộp bài chỉ được xem lại câu trả lời đã làm, không xem đáp án chuẩn & giải thích chi tiết."
            >
              <Eye className="w-3 h-3 text-cyan-600" />
              Chỉ xem bài đã làm
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-2">
          {exam.title}
        </h3>

        {/* Metadata */}
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

        {/* 8-Digit Exam Code pill - CHỈ HIỂN THỊ CHO GIÁO VIÊN (ẩn với học sinh) */}
        {isTeacher && exam.examCode && (
          <div className="flex items-center justify-between bg-blue-50/70 border border-blue-200/80 rounded-lg px-2.5 py-1 mb-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[11px] font-semibold text-blue-900">Mã đề (chỉ GV thấy):</span>
              <span className="font-mono font-bold text-blue-950 tracking-wider bg-white px-1.5 py-0.2 rounded border border-blue-200 shadow-2xs">
                {exam.examCode}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => handleCopyCode(exam.examCode!, e)}
              className="text-[11px] text-blue-700 hover:text-blue-950 font-semibold flex items-center gap-1 cursor-pointer bg-white/80 hover:bg-white px-2 py-0.5 rounded border border-blue-200 transition-colors"
              title="Sao chép mã đề 8 số để cấp cho học sinh"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-blue-600" />}
              <span>{copiedCode ? 'Đã chép' : 'Chép mã'}</span>
            </button>
          </div>
        )}

        {/* Teacher access code display if required */}
        {isTeacher && exam.requireAccessCode && exam.accessSecurityCode && (
          <div className="flex items-center justify-between bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1 mb-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-[11px] font-semibold text-amber-950">Mã dự thi cấp cho HS:</span>
              <span className="font-mono font-bold text-amber-900 bg-white px-1.5 py-0.2 rounded border border-amber-300">
                {exam.accessSecurityCode}
              </span>
            </div>
          </div>
        )}

        {/* Random question indicator */}
        {exam.randomQuestionCount !== undefined && exam.randomQuestionCount > 0 && (
          <div className="text-[11px] text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1 mb-2.5 flex items-center gap-1.5">
            <Shuffle className="w-3 h-3 text-purple-600 shrink-0" />
            <span>Đề bốc ngẫu nhiên <strong>{exam.randomQuestionCount}</strong> / {exam.questions.length} câu</span>
          </div>
        )}

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
        {/* If blocked for students */}
        {isExamBlockedForStudent ? (
          <div className="w-full p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>
                {isCreatorOnly
                  ? 'Chế độ người ra đề (Chưa mở xem thử)'
                  : isStudentNotInClass
                  ? `Giới hạn trong ${exam.assignedClassName || 'Lớp riêng'}`
                  : isAttemptsExceeded
                  ? 'Đã hết lượt thi cho phép'
                  : isBeforeOpen
                  ? `Mở lúc ${formatDateTimeStr(exam.openTime)}`
                  : 'Đã hết hạn làm đề thi'}
              </span>
            </div>
            <p className="text-[11px] text-amber-800 leading-snug">
              {isCreatorOnly
                ? 'Đề thi đang ở chế độ Người ra đề riêng tư. Khi nào người ra đề mở công khai hoặc mở thi mới cho phép học sinh xem trước và làm bài.'
                : isStudentNotInClass
                ? 'Chỉ học sinh trong lớp học này mới được xem và làm bài thi. Vui lòng tham gia lớp để mở khóa.'
                : isAttemptsExceeded
                ? `Bạn đã hoàn thành ${attemptCount}/${exam.maxAttempts} lượt làm bài cho phép. Không thể vào thi hoặc nhập mã dự thi thêm.`
                : 'Đề thi hiện đang bị khóa truy cập theo quy chế.'}
            </p>
            {!isAttemptsExceeded &&
              !isBeforeOpen &&
              !isAfterClose &&
              exam.status !== 'closed' &&
              (isCreatorOnly || isStudentNotInClass || exam.requireAccessCode) && (
                <button
                  type="button"
                  onClick={() => onStartExam(exam, 'exam')}
                  className="mt-1 py-1.5 px-3 text-xs font-semibold text-blue-700 bg-blue-100/90 hover:bg-blue-200 active:bg-blue-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                  <span>Nhập mã số vào thi / Mở khóa</span>
                </button>
              )}
          </div>
        ) : (
          <>
            {/* Start Exam button */}
            {exam.modeType !== 'practice_only' && (
              <button
                onClick={() => onStartExam(exam, 'exam')}
                className="flex-1 min-h-[40px] sm:min-h-0 py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer min-w-[90px]"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Vào thi</span>
              </button>
            )}

            {/* Practice button */}
            {exam.modeType !== 'exam_only' && (
              <button
                onClick={() => onStartExam(exam, 'practice')}
                className="min-h-[40px] sm:min-h-0 py-2 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                title="Chế độ luyện tập có giải thích ngay"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                <span>Luyện tập</span>
              </button>
            )}

            {/* Preview Exam button - ONLY if not blocked! */}
            {onPreviewExam && (
              <button
                onClick={() => onPreviewExam(exam)}
                className="min-h-[40px] sm:min-h-0 py-2 px-2.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer border border-blue-200"
                title="Xem thử đề thi trước khi làm"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>Xem thử</span>
              </button>
            )}

            {/* Teacher Edit button */}
            {isTeacher && onEditExam && (
              <button
                onClick={() => onEditExam(exam)}
                className="min-h-[40px] sm:min-h-0 py-2 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
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
