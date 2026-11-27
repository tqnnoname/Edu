import React, { useEffect, useMemo, useState } from 'react';
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
  Trash2,
  ShieldCheck,
  Layers,
  GraduationCap,
  Users,
  Award,
  ClipboardList,
  FileCheck2,
  Tag,
  Unlock,
} from 'lucide-react';
import {
  scanAllRecoverableData,
  restoreAllRecoverableData,
  permanentlyDeleteFromTrashBin,
  type FullDataRecoveryReport,
  type RecoverableDataCategory,
  type RecoverableDataEntry,
  type RecoverableDataSource,
} from '../utils/storage';

interface FullDataRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: (restoredCount: number) => void;
}

type FilterTabId = 'all' | RecoverableDataCategory | 'trash_only';

const CATEGORY_TABS: { id: FilterTabId; label: string; Icon: React.ElementType }[] = [
  { id: 'all', label: 'Tất cả', Icon: ShieldCheck },
  { id: 'exam', label: 'Đề thi', Icon: BookOpen },
  { id: 'course', label: 'Khóa học', Icon: GraduationCap },
  { id: 'classroom', label: 'Lớp học', Icon: Users },
  { id: 'bundle', label: 'Tổ hợp môn', Icon: Layers },
  { id: 'result', label: 'Kết quả thi', Icon: Award },
  { id: 'classroomHomework', label: 'Bài tập VN', Icon: ClipboardList },
  { id: 'homeworkSubmission', label: 'Bài nộp HS', Icon: FileCheck2 },
  { id: 'scoreboard', label: 'Bảng điểm', Icon: Award },
  { id: 'subject', label: 'Môn học', Icon: Tag },
  { id: 'trash_only', label: 'Thùng rác', Icon: Trash2 },
];

const CATEGORY_LABELS: Record<RecoverableDataCategory, string> = {
  exam: 'Đề thi',
  bundle: 'Tổ hợp môn',
  course: 'Khóa học',
  classroom: 'Lớp học',
  result: 'Kết quả thi',
  classroomHomework: 'Bài tập về nhà',
  homeworkSubmission: 'Bài nộp BTVN',
  scoreboard: 'Bảng điểm',
  subject: 'Môn học',
};

const SOURCE_META: Record<
  RecoverableDataSource,
  { label: string; badgeClass: string; Icon: React.ElementType }
> = {
  cloud: {
    label: 'Cloud Firestore',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    Icon: Cloud,
  },
  trash: {
    label: 'Thùng rác',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    Icon: Trash2,
  },
  indexeddb: {
    label: 'IndexedDB trên máy',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: HardDrive,
  },
  server_backup: {
    label: 'Sao lưu Server',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    Icon: Server,
  },
  local_hidden: {
    label: 'Đang bị ẩn cục bộ',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: EyeOff,
  },
  preset: {
    label: 'Mặc định hệ thống',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: BookOpen,
  },
};

export const FullDataRecoveryModal: React.FC<FullDataRecoveryModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  const [report, setReport] = useState<FullDataRecoveryReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTabId>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmPermanentTrash, setConfirmPermanentTrash] = useState<RecoverableDataEntry | null>(
    null
  );
  const [showOnlyMissingOrBlocked, setShowOnlyMissingOrBlocked] = useState(false);

  const runScan = async () => {
    setIsScanning(true);
    setFeedback(null);
    try {
      const res = await scanAllRecoverableData();
      setReport(res);
      const defaultSelected = new Set<string>(
        res.entries
          .filter(
            (e) =>
              !e.isAlreadyActive ||
              e.isTombstoned ||
              e.source === 'trash' ||
              e.source === 'local_hidden'
          )
          .map((e) => e.uidKey)
      );
      setSelectedKeys(defaultSelected);
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Không thể quét dữ liệu khôi phục.' });
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setConfirmPermanentTrash(null);
      void runScan();
    }
  }, [isOpen]);

  const entries = report?.entries || [];

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (activeTab === 'trash_only') {
        if (entry.source !== 'trash' && !entry.trashId) return false;
      } else if (activeTab !== 'all') {
        if (entry.category !== activeTab) return false;
      }
      if (showOnlyMissingOrBlocked) {
        if (entry.isAlreadyActive && !entry.isTombstoned && entry.source !== 'trash') {
          return false;
        }
      }
      return true;
    });
  }, [entries, activeTab, showOnlyMissingOrBlocked]);

  if (!isOpen) return null;

  const toggleSelect = (uidKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(uidKey)) next.delete(uidKey);
      else next.add(uidKey);
      return next;
    });
  };

  const handleRestoreAllAndUnblock = async () => {
    if (!report) return;
    setIsRestoring(true);
    setFeedback(null);
    try {
      const res = await restoreAllRecoverableData(report.entries, { clearAllTombstones: true });
      if (res.ok) {
        setFeedback({
          ok: true,
          text: `✓ Đã khôi phục toàn bộ ${res.restoredCount} mục dữ liệu và gỡ sạch mọi thẻ chặn xóa (tombstones) trên cả máy và Cloud!`,
        });
        onRestored(res.restoredCount);
        await runScan();
      } else {
        setFeedback({
          ok: false,
          text: res.error || 'Khôi phục cục bộ xong nhưng đồng bộ Cloud gặp lỗi.',
        });
        onRestored(res.restoredCount);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (!report) return;
    const chosen = entries.filter((e) => selectedKeys.has(e.uidKey));
    if (chosen.length === 0) {
      setFeedback({ ok: false, text: 'Vui lòng chọn ít nhất 1 mục để khôi phục.' });
      return;
    }
    setIsRestoring(true);
    setFeedback(null);
    try {
      const res = await restoreAllRecoverableData(chosen, { clearAllTombstones: false });
      if (res.ok) {
        setFeedback({
          ok: true,
          text: `✓ Đã khôi phục ${res.restoredCount} mục đã chọn và đồng bộ lên Cloud!`,
        });
        onRestored(res.restoredCount);
        await runScan();
      } else {
        setFeedback({
          ok: false,
          text: res.error || 'Khôi phục cục bộ xong nhưng đồng bộ Cloud gặp lỗi.',
        });
        onRestored(res.restoredCount);
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!confirmPermanentTrash?.trashId) return;
    permanentlyDeleteFromTrashBin(confirmPermanentTrash.trashId, { confirmedByUser: true });
    const deletedTitle = confirmPermanentTrash.title;
    setConfirmPermanentTrash(null);
    setFeedback({
      ok: true,
      text: `Đã xóa vĩnh viễn "${deletedTitle}" khỏi Thùng rác trên thiết bị này.`,
    });
    await runScan();
  };

  const tabCount = (tabId: FilterTabId): number => {
    if (tabId === 'all') return entries.length;
    if (tabId === 'trash_only') {
      return entries.filter((e) => e.source === 'trash' || Boolean(e.trashId)).length;
    }
    return entries.filter((e) => e.category === tabId).length;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                Trung tâm Khôi phục Toàn bộ Dữ liệu &amp; Thùng rác
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Chống tự động xóa: mọi dữ liệu chỉ được xóa khi có xác nhận trực tiếp từ bạn.
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

        {/* Summary & One-Click Restore Banner */}
        <div className="px-4 sm:px-6 pt-4 space-y-3 shrink-0">
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs text-emerald-950 space-y-1">
              <div className="font-bold flex flex-wrap items-center gap-2">
                <span>
                  Tìm thấy <strong>{entries.length}</strong> bản ghi trên toàn bộ Cloud, IndexedDB, Server Backup &amp; Thùng rác
                </span>
                {(report?.totalTombstonedCount || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-bold">
                    {report?.totalTombstonedCount} ID đang bị chặn xóa (tombstone)
                  </span>
                )}
              </div>
              <div className="text-emerald-800">
                {(report?.missingOrHiddenCount || 0) > 0 ? (
                  <>
                    Phát hiện <strong className="text-rose-700">{report?.missingOrHiddenCount}</strong> mục đang bị ẩn, nằm trong Thùng rác hoặc chưa hiển thị ngoài danh sách.
                  </>
                ) : (
                  <>Tất cả dữ liệu tìm thấy đều đang hiển thị bình thường.</>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void runScan()}
                disabled={isScanning || isRestoring}
                className="px-3 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Đang quét...' : 'Quét lại'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleRestoreAllAndUnblock()}
                disabled={isScanning || isRestoring || entries.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>
                  {isRestoring
                    ? 'Đang khôi phục...'
                    : 'Khôi phục TẤT CẢ & Gỡ chặn đồng bộ'}
                </span>
              </button>
            </div>
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

          {confirmPermanentTrash && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-rose-950">
                <strong>Xác nhận xóa vĩnh viễn khỏi Thùng rác?</strong>
                <div className="text-rose-800 mt-0.5">
                  Mục &quot;{confirmPermanentTrash.title}&quot; sẽ bị xóa khỏi Thùng rác trên trình duyệt này.
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmPermanentTrash(null)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmPermanentDelete()}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
            {CATEGORY_TABS.map((tab) => {
              const count = tabCount(tab.id);
              const TabIcon = tab.Icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List Body */}
        <div className="px-4 sm:px-6 py-3 overflow-y-auto flex-1 space-y-2.5">
          {isScanning && entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
              Đang quét toàn bộ Cloud Firestore, IndexedDB, Server Backup &amp; Thùng rác...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1 pb-1">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={showOnlyMissingOrBlocked}
                    onChange={(e) => setShowOnlyMissingOrBlocked(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Chỉ hiện mục đang bị ẩn / đã xóa / trong Thùng rác</span>
                </label>

                <div className="flex items-center gap-2">
                  <span>
                    Đã chọn <strong>{selectedKeys.size}</strong>/{entries.length}
                  </span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedKeys((prev) => {
                        const next = new Set(prev);
                        filteredEntries.forEach((e) => next.add(e.uidKey));
                        return next;
                      })
                    }
                    className="text-blue-700 font-semibold hover:underline cursor-pointer"
                  >
                    Chọn mục đang xem
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(new Set())}
                    className="text-slate-600 font-semibold hover:underline cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  Không có mục dữ liệu nào khớp bộ lọc hiện tại.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEntries.map((entry) => {
                    const checked = selectedKeys.has(entry.uidKey);
                    const meta = SOURCE_META[entry.source];
                    const SrcIcon = meta.Icon;
                    const needsRestore =
                      !entry.isAlreadyActive || entry.isTombstoned || entry.source === 'trash';

                    return (
                      <div
                        key={entry.uidKey}
                        onClick={() => toggleSelect(entry.uidKey)}
                        className={`p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                          checked
                            ? 'border-emerald-500 bg-emerald-50/40'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="pt-0.5 text-emerald-600 shrink-0">
                          {checked ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {CATEGORY_LABELS[entry.category]}
                            </span>
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate max-w-full">
                              {entry.title}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeClass}`}
                            >
                              <SrcIcon className="w-3 h-3" />
                              {meta.label}
                            </span>
                            {entry.isTombstoned && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                Đang bị đánh dấu xóa
                              </span>
                            )}
                            {!needsRestore ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Đang hoạt động
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                Cần khôi phục
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {entry.subtitle && <span>{entry.subtitle}</span>}
                            <span className="font-mono text-slate-400">ID: {entry.id}</span>
                            {entry.updatedAt && (
                              <span>
                                Cập nhật: {new Date(entry.updatedAt).toLocaleString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>

                        {entry.trashId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmPermanentTrash(entry);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shrink-0 cursor-pointer"
                            title="Xóa vĩnh viễn khỏi Thùng rác (cần xác nhận)"
                          >
                            Xóa vĩnh viễn
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">
            Mục được khôi phục sẽ được gỡ khỏi danh sách chặn xóa và đẩy lên Cloud Firestore.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => void handleRestoreSelected()}
              disabled={isRestoring || isScanning || selectedKeys.size === 0}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {isRestoring
                  ? 'Đang khôi phục...'
                  : `Khôi phục mục đã chọn (${selectedKeys.size})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
