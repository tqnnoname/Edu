import React from 'react';
import { Exam, ExamBundle, UserRole } from '../types/exam';
import { Layers, Clock, Coffee, Play, Trash2, Edit3, CheckCircle2, ListFilter, Timer, Shuffle } from 'lucide-react';

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
  const isTeacher = userRole === 'teacher';
  const isElectiveMode = bundle.selectionMode === 'has_electives';

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
    if (isElectiveMode && onSelectElectives && electiveGroups.length > 0) {
      onSelectElectives(bundle);
    } else {
      onStartBundle(bundle);
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

            {electiveGroups.map((grp, gIdx) => (
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
          className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 active:bg-purple-900 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
        >
          {isElectiveMode ? (
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
