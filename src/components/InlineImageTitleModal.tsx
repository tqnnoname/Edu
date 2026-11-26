import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X, ClipboardPaste, Check, Trash2 } from 'lucide-react';
import { processImageFile } from '../utils/imageUpload';
import { uploadImageOrKeepFallback } from '../utils/courseMedia';
import {
  extractAllInlineImages,
  extractImageFileFromClipboardEvent,
  registerImplicitImagesMap,
  removeInlineImageFromText,
  updateInlineImageTitleInText,
} from '../utils/inlineImages';

interface InlineImageTitleModalProps {
  isOpen: boolean;
  initialImageSrc?: string;
  initialTitle?: string;
  targetLabel?: string;
  onConfirm: (imageSrc: string, title: string) => void;
  onClose: () => void;
}

export const InlineImageTitleModal: React.FC<InlineImageTitleModalProps> = ({
  isOpen,
  initialImageSrc = '',
  initialTitle = '',
  targetLabel,
  onConfirm,
  onClose,
}) => {
  const [imageSrc, setImageSrc] = useState(initialImageSrc);
  const [title, setTitle] = useState(initialTitle);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setImageSrc(initialImageSrc || '');
    setTitle(initialTitle || '');
    setErrorMsg(null);
    setIsProcessing(false);
  }, [isOpen, initialImageSrc, initialTitle]);

  useEffect(() => {
    if (isOpen && imageSrc) {
      const t = window.setTimeout(() => {
        titleInputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(t);
    }
  }, [isOpen, imageSrc]);

  if (!isOpen) return null;

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const compressed = await processImageFile(file, 1200, 0.85);
      const uploadedUrl = await uploadImageOrKeepFallback(compressed, file.name);
      setImageSrc(uploadedUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể đọc tệp ảnh này.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedFile = extractImageFileFromClipboardEvent(e);
    if (pastedFile) {
      e.preventDefault();
      void handleFile(pastedFile);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!imageSrc.trim()) {
      setErrorMsg('Vui lòng chọn hoặc dán một hình ảnh trước.');
      return;
    }
    onConfirm(imageSrc.trim(), title.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onPaste={handlePaste}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4"
      >
        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-purple-600" />
              <span>Chèn ảnh tại vị trí con trỏ</span>
            </h4>
            {targetLabel && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                Đang chèn vào: <strong className="text-purple-700">{targetLabel}</strong>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {errorMsg}
          </div>
        )}

        {!imageSrc ? (
          <div className="p-5 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/40 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-semibold">Chọn ảnh từ máy hoặc nhấn Ctrl+V để dán ảnh</p>
              <p className="text-[11px] text-slate-500">
                Địa chỉ ảnh được lưu ngầm tự động, không làm rối nội dung văn bản.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <label className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Đang xử lý...' : 'Chọn ảnh từ máy'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center gap-2">
              <img
                src={imageSrc}
                alt={title || 'Ảnh xem trước'}
                className="max-h-48 max-w-full rounded-lg object-contain bg-white border border-slate-100 shadow-2xs"
                referrerPolicy="no-referrer"
              />
              <label className="text-[11px] font-semibold text-purple-700 hover:underline cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Chọn ảnh khác (hoặc Ctrl+V để thay)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Tiêu đề ảnh (hiển thị chú thích dưới ảnh, tùy chọn):
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ví dụ: Đồ thị hàm số, Hình vẽ minh họa..."
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!imageSrc || isProcessing}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Chèn tại vị trí con trỏ</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface InlineImageStripProps {
  content: string;
  inlineImages?: Record<string, string>;
  label?: string;
  onUpdateContent: (nextContent: string) => void;
}

/**
 * Displays clean thumbnail cards with editable Title fields for all cursor-inserted images
 * inside a text field, hiding raw URLs/base64 addresses completely.
 */
export const InlineImageStrip: React.FC<InlineImageStripProps> = ({
  content,
  inlineImages,
  label = 'Ảnh đã chèn tại vị trí con trỏ',
  onUpdateContent,
}) => {
  useEffect(() => {
    registerImplicitImagesMap(inlineImages);
  }, [inlineImages]);

  const items = extractAllInlineImages(content, inlineImages);
  if (items.length === 0) return null;

  return (
    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-2">
      <div className="text-[11px] font-bold text-slate-700 flex flex-wrap items-center justify-between gap-1">
        <span>
          {label} ({items.length} ảnh):
        </span>
        <span className="text-[10px] font-normal text-slate-500">
          Có thể sửa tiêu đề ảnh trực tiếp hoặc cắt/dán thẻ [[img:...]] sang vị trí khác
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((im, idx) => (
          <div
            key={`${im.id}_${idx}`}
            className="p-2 bg-white border border-slate-200 rounded-lg flex items-center gap-2.5"
          >
            {im.src ? (
              <img
                src={im.src}
                alt={im.title || `Ảnh #${idx + 1}`}
                className="w-12 h-12 object-contain rounded border border-slate-100 bg-slate-50 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                <ImageIcon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Tiêu đề ảnh #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateContent(removeInlineImageFromText(content, im.fullMatch))}
                  className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Gỡ ảnh</span>
                </button>
              </div>
              <input
                type="text"
                value={im.title}
                onChange={(e) =>
                  onUpdateContent(updateInlineImageTitleInText(content, im, e.target.value))
                }
                placeholder="Nhập tiêu đề ảnh (tùy chọn)..."
                className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface AttachedImageBoxProps {
  imageUrl?: string;
  caption?: string;
  label: string;
  showCaption?: boolean;
  compact?: boolean;
  onChangeImage: (nextUrl: string) => void;
  onChangeCaption?: (nextCaption: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Clean image attachment control that keeps raw image URLs / base64 implicit,
 * letting authors upload, paste (Ctrl+V), preview, and optionally fill Tiêu đề ảnh.
 */
export const AttachedImageBox: React.FC<AttachedImageBoxProps> = ({
  imageUrl,
  caption = '',
  label,
  showCaption = true,
  compact = false,
  onChangeImage,
  onChangeCaption,
  onError,
}) => {
  const [isBusy, setIsBusy] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setIsBusy(true);
    try {
      const compressed = await processImageFile(file, 1200, 0.85);
      const uploadedUrl = await uploadImageOrKeepFallback(compressed, file.name);
      onChangeImage(uploadedUrl);
    } catch (err: any) {
      if (onError) onError(err?.message || 'Không thể tải ảnh lên.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedFile = extractImageFileFromClipboardEvent(e);
    if (pastedFile) {
      e.preventDefault();
      void handleFile(pastedFile);
    }
  };

  return (
    <div
      onPaste={handlePaste}
      tabIndex={0}
      className={`${
        compact ? 'p-2.5 rounded-lg' : 'p-3 rounded-xl'
      } bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-400 space-y-2`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
          <span>{label}</span>
        </span>
        <div className="flex items-center gap-2">
          <label className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors">
            <Upload className="w-3 h-3" />
            <span>{isBusy ? 'Đang tải...' : imageUrl ? 'Đổi ảnh' : 'Chọn ảnh từ máy'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
          </label>
          {imageUrl && (
            <button
              type="button"
              onClick={() => {
                onChangeImage('');
                if (onChangeCaption) onChangeCaption('');
              }}
              className="text-[11px] text-rose-600 hover:underline cursor-pointer flex items-center gap-1 font-medium"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa ảnh</span>
            </button>
          )}
        </div>
      </div>

      {!imageUrl && (
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <ClipboardPaste className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Bấm &quot;Chọn ảnh từ máy&quot; hoặc nhấn vào khung này rồi bấm Ctrl+V để dán ảnh trực tiếp.</span>
        </div>
      )}

      {imageUrl && (
        <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-2">
          <div className="text-center">
            <img
              src={imageUrl}
              alt={caption || label}
              className={`${
                compact ? 'max-h-36' : 'max-h-52'
              } rounded-lg border border-slate-200 inline-block shadow-2xs object-contain bg-white`}
              referrerPolicy="no-referrer"
            />
          </div>
          {showCaption && onChangeCaption && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tiêu đề ảnh (tùy chọn):
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => onChangeCaption(e.target.value)}
                placeholder="Nhập tiêu đề / chú thích hiển thị bên dưới ảnh..."
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
