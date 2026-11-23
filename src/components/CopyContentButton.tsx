import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';

interface CopyContentButtonProps {
  text?: string;
  getText?: () => string;
  label?: string;
  copiedLabel?: string;
  emptyWarning?: string;
  onCopied?: (copiedText: string) => void;
  onEmpty?: () => void;
  className?: string;
  compact?: boolean;
  title?: string;
  keepFocus?: boolean;
}

export const CopyContentButton: React.FC<CopyContentButtonProps> = ({
  text,
  getText,
  label = 'Sao chép nội dung',
  copiedLabel = 'Đã sao chép',
  onCopied,
  onEmpty,
  className = '',
  compact = false,
  title = 'Sao chép toàn bộ nội dung đang soạn (giữ nguyên xuống dòng và công thức)',
  keepFocus = true,
}) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const contentToCopy = getText ? getText() : text ?? '';
    if (!contentToCopy) {
      onEmpty?.();
      return;
    }
    const ok = await copyTextToClipboard(contentToCopy);
    if (ok) {
      setCopied(true);
      onCopied?.(contentToCopy);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        if (keepFocus) e.preventDefault();
      }}
      onClick={handleCopy}
      title={title}
      className={`inline-flex items-center gap-1 rounded-lg border font-semibold transition-all cursor-pointer shrink-0 ${
        compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        copied
          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
      } ${className}`}
    >
      {copied ? (
        <Check className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      ) : (
        <Copy className={compact ? 'w-3 h-3 text-slate-600' : 'w-3.5 h-3.5 text-slate-600'} />
      )}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
};
