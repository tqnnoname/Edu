import React, { useState } from 'react';
import { AlertTriangle, Save, LogOut, X } from 'lucide-react';

export interface UnsavedNavigationGuard {
  isDirty: () => boolean;
  saveAndExit: () => Promise<boolean> | boolean;
  discardChanges?: () => void;
  variant?: 'default' | 'confirm-discard';
  title?: string;
  message?: string;
  stayLabel?: string;
  discardLabel?: string;
}

interface UnsavedChangesModalProps {
  isOpen: boolean;
  variant?: 'default' | 'confirm-discard';
  title?: string;
  message?: string;
  stayLabel?: string;
  discardLabel?: string;
  onSaveAndExit: () => Promise<boolean> | boolean;
  onDiscardAndExit: () => void;
  onCancel: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  variant = 'default',
  title = 'Dữ liệu đang soạn chưa được lưu',
  message = 'Bạn đang tạo mới hoặc chỉnh sửa nội dung. Bạn có muốn lưu lại dữ liệu trước khi chuyển sang mục khác không?',
  stayLabel = 'Tiếp tục ở lại',
  discardLabel = 'Thoát & Hủy thay đổi',
  onSaveAndExit,
  onDiscardAndExit,
  onCancel,
}) => {
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveAndExit();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
            title="Hủy thao tác thoát"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {variant === 'confirm-discard' ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                {stayLabel}
              </button>
              <button
                type="button"
                onClick={onDiscardAndExit}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{discardLabel}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer order-3 sm:order-1"
              >
                Hủy thao tác
              </button>
              <button
                type="button"
                onClick={onDiscardAndExit}
                disabled={isSaving}
                className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer order-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Thoát không lưu</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer order-1 sm:order-3"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu lại rồi thoát'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

