import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  X,
  RefreshCw,
  CheckSquare,
  Square,
  Cloud,
  HardDrive,
  Server,
  EyeOff,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import {
  scanAllRecoverableExams,
  restoreRecoveredExams,
  type FullExamRecoveryReport,
  type RecoverableExamEntry,
} from '../utils/storage';

interface ExamRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: (restoredCount: number) => void;
}

const SOURCE_META: Record<
  RecoverableExamEntry['source'],
  { label: string; badgeClass: string; Icon: React.ElementType }
> = {
  cloud: {
    label: 'Cloud Firestore',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    Icon: Cloud,
  },
  indexeddb: {
    label: 'Bộ nhớ trình duyệt (IndexedDB)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: HardDrive,
  },
  server_backup: {
    label: 'Bản sao lưu Server (/api/sync)',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    Icon: Server,
  },
  local_hidden: {
    label: 'Đang bị ẩn cục bộ',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: EyeOff,
  },
  preset: {
    label: 'Đề mẫu hệ thống',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: BookOpen,
  },
};

export const ExamRecoveryModal: React.FC<ExamRecoveryModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  const [report, setReport] = useState<FullExamRecoveryReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const runScan = async () => {
    setIsScanning(true);
    setFeedback(null);
    try {
      const res = await scanAllRecoverableExams();
      setReport(res);
      // Pre-select any tombstoned or server/indexeddb backup entries that are hidden/missing
      const defaultSelected = new Set<string>(
        res.entries
          .filter((e) => e.isTombstoned || e.source === 'server_backup' || e.source === 'indexeddb')
          .map((e) => e.exam.id)
      );
      setSelectedIds(defaultSelected);
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Không thể quét dữ liệu khôi phục.' });
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void runScan();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const entries = report?.entries || [];
  const tombstonedEntries = entries.filter((e) => e.isTombstoned);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRestore = async () => {
    if (!report) return;
    const chosenExams = entries
      .filter((e) => selectedIds.has(e.exam.id))
      .map((e) => e.exam);
    const unblockIds =
      chosenExams.length > 0
        ? Array.from(new Set([...chosenExams.map((e) => e.id), ...report.orphanReferencedExamIds]))
        : report.tombstonedExamIds;

    setIsRestoring(true);
    setFeedback(null);
    try {
      const res = await restoreRecoveredExams(chosenExams, unblockIds);
      if (res.ok) {
        setFeedback({
          ok: true,
          text:
            res.restoredCount > 0
              ? `✓ Đã khôi phục thành công ${res.restoredCount} đề thi và mở khóa đồng bộ Cloud!`
              : '✓ Đã dọn dẹp danh sách chặn (tombstones) trên hệ thống!',
        });
        onRestored(res.restoredCount);
        await runScan();
      } else {
        setFeedback({
          ok: false,
          text: res.error || 'Khôi phục cục bộ thành công nhưng đồng bộ Cloud gặp sự cố.',
        });
        onRestored(res.restoredCount);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                Khôi phục Đề thi đã mất / bị ẩn
              </h2>
              <p className="text-[11px] text-slate-500">
                Quét từ Cloud Firestore, IndexedDB trên máy, bản sao lưu Server &amp; danh sách đã xóa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
            <div>
              Tìm thấy <strong>{entries.length}</strong> đề thi trong bộ nhớ sao lưu ({' '}
              <strong className="text-rose-700">{tombstonedEntries.length}</strong> đề đang bị đánh dấu xóa/ẩn).
            </div>
            <button
              type="button"
              onClick={() => void runScan()}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Đang quét...' : 'Quét lại tất cả nguồn'}</span>
            </button>
          </div>

          {report?.error && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{report.error}</span>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                feedback.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback.text}</span>
            </div>
          )}

          {isScanning && entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-600 mx-auto mb-2" />
              Đang quét toàn bộ Cloud Firestore, IndexedDB &amp; bản sao lưu...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              Không tìm thấy đề thi sao lưu nào.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>Đã chọn {selectedIds.size}/{entries.length} đề thi</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set(entries.map((e) => e.exam.id)))}
                    className="text-blue-700 font-semibold hover:underline cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-600 font-semibold hover:underline cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {entries.map((entry) => {
                const { exam, source, isTombstoned } = entry;
                const checked = selectedIds.has(exam.id);
                const meta = SOURCE_META[source];
                const SrcIcon = meta.Icon;
                const isCreatorMode =
                  exam.visibility === 'private' ||
                  exam.teacherMode === 'creator' ||
                  Boolean(exam.isCreatorOnlyMode);

                return (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => toggleSelect(exam.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      checked
                        ? 'bg-blue-50/70 border-blue-400 ring-1 ring-blue-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="pt-0.5 shrink-0">
                      {checked ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${meta.badgeClass}`}
                        >
                          <SrcIcon className="w-3 h-3" />
                          {meta.label}
                        </span>
                        {isTombstoned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            Đang bị đánh dấu xóa/ẩn
                          </span>
                        )}
                        {isCreatorMode && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Lock className="w-3 h-3" />
                            Chế độ Người ra đề
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 line-clamp-1">
                        {exam.title}
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                        <span>{exam.questions?.length || 0} câu</span>
                        <span>·</span>
                        <span>{exam.durationMinutes} phút</span>
                        {(exam.creatorName || exam.creatorEmail) && (
                          <>
                            <span>·</span>
                            <span>Người tạo: {exam.creatorName || exam.creatorEmail}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={isRestoring || isScanning || (selectedIds.size === 0 && (report?.tombstonedExamIds.length || 0) === 0)}
            onClick={() => void handleRestore()}
            className="min-h-[40px] px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
            <span>
              {isRestoring
                ? 'Đang khôi phục...'
                : selectedIds.size > 0
                ? `Khôi phục ${selectedIds.size} đề thi & Đồng bộ Cloud`
                : 'Mở khóa danh sách đề đã xóa'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
