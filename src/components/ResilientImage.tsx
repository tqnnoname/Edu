import React, { useEffect, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import {
  isFirestoreMediaUri,
  resolveFirestoreMediaUrlAsync,
  resolveMediaSrcSync,
} from '../utils/mediaAssets';

export interface ResilientImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  fallbackLabel?: string;
  hideFallbackOnError?: boolean;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt = 'Hình minh họa',
  className = '',
  fallbackLabel,
  hideFallbackOnError = false,
  onError,
  onLoad,
  referrerPolicy = 'no-referrer',
  loading = 'lazy',
  decoding = 'async',
  ...rest
}) => {
  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const isFsUri = isFirestoreMediaUri(cleanSrc);

  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!cleanSrc) return null;
    if (!isFsUri) return cleanSrc;
    return resolveMediaSrcSync(cleanSrc) || null;
  });
  const [isLoadingFs, setIsLoadingFs] = useState<boolean>(() => {
    return Boolean(cleanSrc && isFsUri && !resolveMediaSrcSync(cleanSrc));
  });
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  useEffect(() => {
    setHasError(false);
    if (!cleanSrc) {
      setResolvedSrc(null);
      setIsLoadingFs(false);
      return;
    }
    if (!isFsUri) {
      setResolvedSrc(cleanSrc);
      setIsLoadingFs(false);
      return;
    }

    const syncHit = resolveMediaSrcSync(cleanSrc);
    if (syncHit) {
      setResolvedSrc(syncHit);
      setIsLoadingFs(false);
      return;
    }

    let cancelled = false;
    setIsLoadingFs(true);
    void resolveFirestoreMediaUrlAsync(cleanSrc).then((url) => {
      if (cancelled) return;
      if (url) {
        setResolvedSrc(url);
        setHasError(false);
      } else {
        setResolvedSrc(null);
        setHasError(true);
      }
      setIsLoadingFs(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cleanSrc, isFsUri, retryNonce]);

  if (!cleanSrc) return null;

  if (isLoadingFs) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 animate-pulse text-[11px] font-medium text-slate-400 px-4 py-6 min-w-[140px] min-h-[84px] ${className}`}
        aria-label={alt}
      >
        Đang tải ảnh...
      </span>
    );
  }

  if (hasError || !resolvedSrc) {
    if (hideFallbackOnError) return null;
    return (
      <span className="inline-flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-xs text-slate-500 max-w-full">
        <ImageOff className="w-5 h-5 text-slate-400" />
        <span className="font-medium text-slate-600 line-clamp-2">
          {fallbackLabel || (alt && alt !== 'Hình minh họa' ? `Không tải được ảnh: ${alt}` : 'Ảnh tạm thời chưa tải được')}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setHasError(false);
            setRetryNonce((n) => n + 1);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs cursor-pointer shadow-2xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Tải lại ảnh</span>
        </button>
      </span>
    );
  }

  const finalImgSrc =
    !isFsUri && retryNonce > 0 && !resolvedSrc.startsWith('data:')
      ? `${resolvedSrc}${resolvedSrc.includes('?') ? '&' : '?'}r=${retryNonce}`
      : resolvedSrc;

  return (
    <img
      {...rest}
      src={finalImgSrc}
      alt={alt}
      className={className}
      referrerPolicy={referrerPolicy}
      loading={loading}
      decoding={decoding}
      onLoad={(e) => {
        setHasError(false);
        onLoad?.(e);
      }}
      onError={(e) => {
        setHasError(true);
        onError?.(e);
      }}
    />
  );
};
