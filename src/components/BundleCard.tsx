import React, { useState } from 'react';
import { Exam, ExamBundle, UserRole } from '../types/exam';
import { 
  Layers, 
  Clock, 
  Coffee, 
  Play, 
  Trash2, 
  Edit3, 
  ListFilter, 
  Timer, 
  KeyRound, 
  Copy, 
  Check, 
  Lock, 
  Eye, 
  Calendar,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { isItemScheduleOpen } from '../utils/storage';

interface BundleCardProps {
  bundle: ExamBundle;
  allExams: Exam[];
  userRole?: UserRole;
  onStartBundle: (bundle: ExamBundle, selectedExamsOverride?: Exam[]) => void;
  onSelectElectives?: (bundle: ExamBundle) => void;
  onEditBundle?: (bundle: ExamBundle) => void;
  onDeleteCustom?: (bundleId: string) => void;
}

export const BundleCard: React.FC<BundleCardProps> = ({
  bundle,
  allExams,
  userRole = 'student',
  onStartBundle,
  onSelectElectives,
  onEditBundle,
  onDeleteCustom,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const isTeacher = userRole === 'teacher';
  const isElectiveMode = bundle.selectionMode === 'has_electives';

  const handleCopyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const scheduleCheck = isItemScheduleOpen({
    openTime: bundle.openTime,
    closeTime: bundle.closeTime,
    status: bundle.status,
  });

  const isBlockedBySchedule = !isTeacher && !scheduleCheck.isOpen;

  const memberExams = bundle.examIds
    .map((id) => allExams.find((e) => e.id === id))
    .filter(Boolean) as Exam[];

  const compulsoryExams = (bundle.compulsoryExamIds || [])
    .map((id) => allExams.find((e) => e.id === id))
    .filter(Boolean) as Exam[];

  const electiveGroups = bundle.electiveGroups || [];

  const totalExamMinutes = memberExams.reduce((acc, e) => acc + e.durationMinutes, 0);
  const totalBreakMinutes = Math.max(0, memberExams.length - 1) * bundle.breakMinutes;
  const totalQuestions = memberExams.reduce((acc, e) => acc + e.questions.length, 0);

  const handleStartClick = () => {
    if (isBlockedBySchedule) return;
    if (isElectiveMode && onSelectElectives && electiveGroups.length > 0) {
      onSelectElectives(bundle);
    } else {
      onStartBundle(bundle);
    }
  };

  const formatDateTimeStr = (isoOrLocal?: string) => {
    if (!isoOrLocal) return '';
    try {
      const d = new Date(isoOrLocal);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
    } catch {
      return isoOrLocal;
    }
  };

  return (
    <div className="group bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between hover:border-purple-300">
      <div>
        {/* Top Info */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-100">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-purple-800 tracking-wide uppercase">
              Tổ hợp liên môn
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mode badge */}
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                isElectiveMode
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-blue-50 text-blue-900 border-blue-200'
              }`}
            >
              {isElectiveMode ? 'Có môn tự chọn' : 'Bắt buộc tất cả'}
            </span>

            {isTeacher && (
              <>
                {onEditBundle && (
                  <button
                    onClick={() => onEditBundle(bundle)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors rounded cursor-pointer"
                    title="Sửa tổ hợp này"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDeleteCustom && (
                  <button
                    onClick={() => onDeleteCustom(bundle.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded cursor-pointer"
                    title="Xóa tổ hợp này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-2 leading-snug mb-2">
          {bundle.title}
        </h3>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
          <span className="flex items-center gap-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            ~{totalExamMinutes}p thi
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="flex items-center gap-1 font-mono text-amber-700">
            <Coffee className="w-3.5 h-3.5 text-amber-600" />
            Nghỉ {bundle.breakMinutes}p / lần
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono">{memberExams.length} môn trong nhóm</span>
        </div>

        {/* Security & Schedule Badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          {/* Schedule status */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
            scheduleCheck.isOpen 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            <Calendar className="w-3 h-3" />
            {scheduleCheck.statusLabel}
          </span>

          {isElectiveMode && bundle.timingMode !== 'all_sequential_independent' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-900 border border-purple-200" title="Môn bắt buộc nối tiếp, cụm tự chọn tính bằng thời gian lớn nhất của 1 môn">
              <Sparkles className="w-3 h-3 text-purple-600" />
              Cụm tự chọn: Max 1 môn
            </span>
          )}

          {bundle.lockExitUntilTimeout && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200" title="Khóa thoát giao diện đến hết giờ">
              <Lock className="w-3 h-3 text-rose-600" />
              Khóa thoát phòng
            </span>
          )}

          {bundle.minSubmitMinutes !== undefined && bundle.minSubmitMinutes > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200">
              <Clock className="w-3 h-3 text-indigo-600" />
              Nộp sau ≥ {bundle.minSubmitMinutes}p
            </span>
          )}

          {bundle.requireAccessCode && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-300">
              <KeyRound className="w-3 h-3 text-amber-700" />
              Cần mã thi cấp riêng
            </span>
          )}

          {bundle.showOnlyStudentAnswersAfterExam && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-800 border border-cyan-200">
              <Eye className="w-3 h-3 text-cyan-600" />
              Chỉ xem bài đã làm
            </span>
          )}
        </div>

        {/* 8-Digit Bundle Code pill - CHỈ HIỂN THỊ CHO GIÁO VIÊN */}
        {isTeacher && bundle.bundleCode && (
          <div className="flex items-center justify-between bg-purple-50/80 border border-purple-200 rounded-lg px-2.5 py-1 mb-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[11px] font-semibold text-purple-900">Mã tổ hợp (chỉ GV thấy):</span>
              <span className="font-mono font-bold text-purple-950 tracking-wider bg-white px-1.5 py-0.2 rounded border border-purple-200 shadow-2xs">
                {bundle.bundleCode}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => handleCopyCode(bundle.bundleCode!, e)}
              className="text-[11px] text-purple-700 hover:text-purple-950 font-semibold flex items-center gap-1 cursor-pointer bg-white/80 hover:bg-white px-2 py-0.5 rounded border border-purple-200 transition-colors"
              title="Sao chép mã tổ hợp 8 số để cấp cho học sinh"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-purple-600" />}
              <span>{copiedCode ? 'Đã chép' : 'Chép mã'}</span>
            </button>
          </div>
        )}

        {/* Teacher access security code if required */}
        {isTeacher && bundle.requireAccessCode && bundle.accessSecurityCode && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mb-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-[11px] font-semibold text-amber-950">Mã bảo mật cấp cho HS:</span>
              <span className="font-mono font-bold text-amber-900 bg-white px-1.5 py-0.2 rounded border border-amber-300">
                {bundle.accessSecurityCode}
              </span>
            </div>
          </div>
        )}

        {/* Schedule open/close time details */}
        {(bundle.openTime || bundle.closeTime) && (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-md p-1.5 mb-2.5 border border-slate-200 flex items-center justify-between gap-1 flex-wrap font-mono">
            {bundle.openTime && (
              <span>Mở: <strong className="text-slate-700">{formatDateTimeStr(bundle.openTime)}</strong></span>
            )}
            {bundle.closeTime && (
              <span>Đóng: <strong className="text-slate-700">{formatDateTimeStr(bundle.closeTime)}</strong></span>
            )}
          </div>
        )}

        {/* Schedule Block Warning for Students */}
        {isBlockedBySchedule && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs mb-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[11px]">{scheduleCheck.reason || 'Tổ hợp thi đang bị khóa.'}</p>
              <p className="text-[10px] text-amber-700">Chỉ giáo viên mới có quyền mở xem trước hoặc thi thử.</p>
            </div>
          </div>
        )}

        {/* Structure overview */}
        {isElectiveMode ? (
          <div className="space-y-2.5 mb-4 bg-amber-50/50 p-3 rounded-lg border border-amber-200/80 text-xs">
            {/* Rules overview bar */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-amber-200/60">
              <span className="font-bold text-amber-950 flex items-center gap-1">
                <span>Quy chế chọn:</span>
                <span className="text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded font-mono font-bold">
                  {bundle.minGroupsToSelect ?? 1} - {bundle.maxGroupsToSelect ?? electiveGroups.length} nhóm
                </span>
              </span>
              {(bundle.selectionTimeLimitSeconds ?? 0) > 0 && (
                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                  <Timer className="w-3 h-3 text-rose-600" />
                  <span>{bundle.selectionTimeLimitSeconds}s (Hết giờ tự bốc thăm)</span>
                </span>
              )}
            </div>

            {compulsoryExams.length > 0 && (
              <div>
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>Môn bắt buộc ({compulsoryExams.length} môn):</span>
                </div>
                <div className="text-slate-600 truncate pl-3">
                  {compulsoryExams.map((e) => e.title).join(', ')}
                </div>
              </div>
            )}

            {electiveGroups.map((grp) => (
              <div key={grp.id} className="pt-1.5 border-t border-amber-100 first:border-0 first:pt-0">
                <div className="font-bold text-purple-950 flex items-center justify-between">
                  <span>{grp.name}:</span>
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded">
                    Yêu cầu chọn ≥ {grp.minSelectCount} môn
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] truncate pl-2 mt-0.5">
                  Gồm: {grp.examIds.map((id) => allExams.find((e) => e.id === id)?.title).filter(Boolean).join(', ')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 mb-4 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 text-xs">
            {memberExams.map((e, idx) => (
              <div key={e.id} className="flex items-center justify-between text-slate-700">
                <span className="truncate">
                  <strong className="text-slate-900 mr-1.5">{idx + 1}.</strong>
                  {e.title}
                </span>
                <span className="font-mono text-slate-500 shrink-0 ml-2">
                  {e.durationMinutes}p
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-4">
          {bundle.description}
        </p>
      </div>

      {/* Action */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
        <button
          onClick={handleStartClick}
          disabled={isBlockedBySchedule}
          className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs ${
            isBlockedBySchedule 
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
              : 'text-white bg-purple-700 hover:bg-purple-800 active:bg-purple-900 cursor-pointer'
          }`}
        >
          {isBlockedBySchedule ? (
            <span>Đang đóng (Chưa mở thi)</span>
          ) : isElectiveMode ? (
            <>
              <ListFilter className="w-3.5 h-3.5" />
              <span>Chọn môn & Vào thi</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Bắt đầu thi tổ hợp</span>
            </>
          )}
        </button>
        {isTeacher && onEditBundle && (
          <button
            onClick={() => onEditBundle(bundle)}
            className="py-2.5 px-3 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer border border-purple-200"
            title="Sửa tổ hợp môn"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Sửa</span>
          </button>
        )}
      </div>
    </div>
  );
};
