import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Lock, Maximize2, ShieldAlert, AlertTriangle } from 'lucide-react';

interface RoomLockGuardProps {
  active: boolean;
  title?: string;
  subtitle?: string;
  remainingLabel?: string;
  onExitAttempt?: (attemptCount: number) => void;
}

// Track mounted active lock instances so transitioning between locked phases
// (e.g., waiting room -> exam -> post-submit lock, or bundle exam -> break -> cluster)
// keeps Fullscreen + Keyboard Lock uninterrupted without dropping out in between.
let activeRoomLockInstances = 0;
let pendingReleaseTimer: ReturnType<typeof setTimeout> | null = null;

function isFullscreenSupportedInBrowser(): boolean {
  if (typeof document === 'undefined') return false;
  const docAny = document as any;
  const elAny = document.documentElement as any;
  return Boolean(
    document.fullscreenEnabled ||
      docAny.webkitFullscreenEnabled ||
      docAny.mozFullScreenEnabled ||
      docAny.msFullscreenEnabled ||
      elAny?.requestFullscreen ||
      elAny?.webkitRequestFullscreen
  );
}

function getCurrentFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const docAny = document as any;
  return (
    document.fullscreenElement ||
    docAny.webkitFullscreenElement ||
    docAny.mozFullScreenElement ||
    docAny.msFullscreenElement ||
    null
  );
}

async function applyKioskKeyboardLock(): Promise<void> {
  try {
    const navAny = navigator as any;
    if (navAny?.keyboard && typeof navAny.keyboard.lock === 'function') {
      await navAny.keyboard.lock([
        'Escape',
        'F11',
        'F5',
        'F12',
        'Tab',
        'AltLeft',
        'AltRight',
        'MetaLeft',
        'MetaRight',
      ]);
    }
  } catch {
    // Keyboard Lock API is Chromium-specific (Chrome, Cốc Cốc, Edge); ignore on unsupported browsers
  }
}

function releaseKioskKeyboardLock(): void {
  try {
    const navAny = navigator as any;
    if (navAny?.keyboard && typeof navAny.keyboard.unlock === 'function') {
      navAny.keyboard.unlock();
    }
  } catch {}
}

export async function tryEnterKioskFullscreen(): Promise<{
  ok: boolean;
  unsupported?: boolean;
}> {
  if (typeof document === 'undefined') return { ok: false, unsupported: true };
  if (!isFullscreenSupportedInBrowser()) {
    return { ok: false, unsupported: true };
  }

  if (getCurrentFullscreenElement()) {
    void applyKioskKeyboardLock();
    return { ok: true };
  }

  const el = document.documentElement as any;
  try {
    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        await el.requestFullscreen();
      }
    } else if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen();
    } else if (typeof el.mozRequestFullScreen === 'function') {
      await el.mozRequestFullScreen();
    } else if (typeof el.msRequestFullscreen === 'function') {
      await el.msRequestFullscreen();
    } else {
      return { ok: false, unsupported: true };
    }

    await applyKioskKeyboardLock();
    return { ok: true };
  } catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    const isGestureErr =
      msg.includes('gesture') ||
      msg.includes('user activation') ||
      msg.includes('not active');
    const isUnsupportedErr =
      !isGestureErr &&
      (msg.includes('not supported') ||
        msg.includes('disallowed') ||
        msg.includes('permissions policy'));
    return { ok: false, unsupported: isUnsupportedErr };
  }
}

export const RoomLockGuard: React.FC<RoomLockGuardProps> = ({
  active,
  title = 'Phòng thi đang bật chế độ khóa toàn màn hình',
  subtitle,
  remainingLabel,
  onExitAttempt,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(getCurrentFullscreenElement())
  );
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hasFocus() && !document.hidden : true
  );
  const [fullscreenUnsupported, setFullscreenUnsupported] = useState<boolean>(
    () => !isFullscreenSupportedInBrowser()
  );
  const [exitAttempts, setExitAttempts] = useState(0);

  const hasEnteredLockedStateRef = useRef(Boolean(getCurrentFullscreenElement()));
  const lastAttemptAtRef = useRef(0);
  const onExitAttemptRef = useRef(onExitAttempt);
  onExitAttemptRef.current = onExitAttempt;

  const recordExitAttempt = useCallback(() => {
    if (!hasEnteredLockedStateRef.current) return;
    const now = Date.now();
    if (now - lastAttemptAtRef.current < 800) return;
    lastAttemptAtRef.current = now;
    setExitAttempts((prev) => {
      const next = prev + 1;
      onExitAttemptRef.current?.(next);
      return next;
    });
  }, []);

  const handleRequestFullscreenClick = useCallback(async () => {
    const res = await tryEnterKioskFullscreen();
    if (res.ok) {
      hasEnteredLockedStateRef.current = true;
      setIsFullscreen(true);
      setIsWindowFocused(true);
      setFullscreenUnsupported(false);
    } else if (res.unsupported) {
      setFullscreenUnsupported(true);
    }
  }, []);

  // Coordinate ref-counted fullscreen + keyboard lock across active locked views
  useEffect(() => {
    if (!active) return;

    if (pendingReleaseTimer) {
      clearTimeout(pendingReleaseTimer);
      pendingReleaseTimer = null;
    }
    activeRoomLockInstances += 1;

    setIsFullscreen(Boolean(getCurrentFullscreenElement()));
    setIsWindowFocused(document.hasFocus() && !document.hidden);

    if (getCurrentFullscreenElement()) {
      hasEnteredLockedStateRef.current = true;
      void applyKioskKeyboardLock();
    } else if (isFullscreenSupportedInBrowser()) {
      void tryEnterKioskFullscreen().then((res) => {
        if (res.ok) {
          hasEnteredLockedStateRef.current = true;
          setIsFullscreen(true);
          setFullscreenUnsupported(false);
        }
      });
    }

    return () => {
      activeRoomLockInstances = Math.max(0, activeRoomLockInstances - 1);
      if (activeRoomLockInstances === 0) {
        pendingReleaseTimer = setTimeout(() => {
          pendingReleaseTimer = null;
          if (activeRoomLockInstances > 0) return;
          releaseKioskKeyboardLock();
          const fsEl = getCurrentFullscreenElement();
          if (fsEl) {
            const docAny = document as any;
            if (typeof document.exitFullscreen === 'function') {
              void document.exitFullscreen().catch(() => {});
            } else if (typeof docAny.webkitExitFullscreen === 'function') {
              try {
                docAny.webkitExitFullscreen();
              } catch {}
            }
          }
        }, 60);
      }
    };
  }, [active]);

  // Core kiosk enforcement: fullscreen, focus/tab, shortcuts, context menu, history & unload
  useEffect(() => {
    if (!active) return;

    // Push a guard state to trap browser Back button / mouse side navigation
    try {
      window.history.pushState({ edutestRoomLock: true }, '', window.location.href);
    } catch {}

    const handlePopState = () => {
      try {
        window.history.pushState({ edutestRoomLock: true }, '', window.location.href);
      } catch {}
      recordExitAttempt();
    };

    const handleFullscreenChange = () => {
      const fsActive = Boolean(getCurrentFullscreenElement());
      setIsFullscreen(fsActive);
      if (fsActive) {
        hasEnteredLockedStateRef.current = true;
        void applyKioskKeyboardLock();
      } else {
        releaseKioskKeyboardLock();
        recordExitAttempt();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsWindowFocused(false);
        recordExitAttempt();
      } else if (document.hasFocus()) {
        setIsWindowFocused(true);
      }
    };

    let blurCheckTimer: ReturnType<typeof setTimeout> | null = null;
    const handleWindowBlur = () => {
      if (blurCheckTimer) clearTimeout(blurCheckTimer);
      blurCheckTimer = setTimeout(() => {
        if (!document.hasFocus() || document.hidden) {
          setIsWindowFocused(false);
          recordExitAttempt();
        }
      }, 80);
    };

    const handleWindowFocus = () => {
      if (blurCheckTimer) {
        clearTimeout(blurCheckTimer);
        blurCheckTimer = null;
      }
      if (!document.hidden) {
        setIsWindowFocused(true);
      }
      if (getCurrentFullscreenElement()) {
        void applyKioskKeyboardLock();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key || '';
      const lower = key.toLowerCase();
      const hasCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Always block Esc / F11 / F12 / F5 / PrintScreen / ContextMenu in kiosk lock
      if (
        key === 'Escape' ||
        key === 'F11' ||
        key === 'F12' ||
        key === 'F5' ||
        key === 'ContextMenu' ||
        key === 'PrintScreen'
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Block Alt navigation & Alt+Tab / Alt+F4 attempts where browser allows
      if (
        e.altKey &&
        (key === 'Tab' ||
          key === 'F4' ||
          key === 'ArrowLeft' ||
          key === 'ArrowRight' ||
          key === 'Home' ||
          lower === 'd')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Block Meta / Windows shortcuts
      if (
        e.metaKey &&
        ['tab', 'd', 'e', 'l', 'n', 'r', 't', 'w', 'h', 'j', 'u', 'p', 's'].includes(lower)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Block Chrome / Cốc Cốc / Edge tab, window, reload, address bar, devtools shortcuts
      if (hasCtrlOrCmd) {
        const blockedCtrlKeys = [
          't',
          'w',
          'n',
          'r',
          'l',
          'h',
          'j',
          'u',
          's',
          'p',
          'g',
          'f',
          'k',
          'e',
          'o',
          'd',
          'tab',
          'pageup',
          'pagedown',
          '1',
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
          '8',
          '9',
        ];
        const blockedShiftCtrlKeys = ['i', 'j', 'c', 'n', 't', 'k', 'm', 'delete'];

        if (
          blockedCtrlKeys.includes(lower) ||
          (e.shiftKey && blockedShiftCtrlKeys.includes(lower))
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Phòng thi đang bật chế độ khóa toàn màn hình!';
      return 'Phòng thi đang bật chế độ khóa toàn màn hình!';
    };

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('dragstart', handleDragStart, { capture: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (blurCheckTimer) clearTimeout(blurCheckTimer);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      window.removeEventListener('dragstart', handleDragStart, { capture: true });
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [active, recordExitAttempt]);

  if (!active) return null;

  const needsFullscreenGate = !fullscreenUnsupported && !isFullscreen;
  const needsFocusGate = !isWindowFocused;

  if (!needsFullscreenGate && !needsFocusGate) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Màn hình khóa phòng thi toàn màn hình"
      className="fixed inset-0 z-[200] bg-slate-950/98 backdrop-blur-xl text-white flex items-center justify-center p-4 sm:p-6 font-sans select-none"
    >
      <div className="max-w-lg w-full bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex items-center justify-center mx-auto">
          {needsFocusGate ? <ShieldAlert className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-extrabold uppercase tracking-wider text-rose-300">
            Chế độ Khóa Phòng Toàn Màn Hình
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-300 font-medium">{subtitle}</p>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2 text-left">
          {needsFocusGate ? (
            <p>
              Hệ thống phát hiện bạn vừa rời cửa sổ làm bài hoặc chuyển sang tab/ứng dụng khác. Toàn bộ nội dung phòng thi đã được ẩn tạm thời.
            </p>
          ) : (
            <p>
              Phòng thi này bắt buộc chạy ở chế độ <strong>Toàn màn hình (Fullscreen Kiosk)</strong> để ẩn thanh tab trình duyệt (Chrome, Cốc Cốc...) và thanh Taskbar máy tính trong suốt thời gian khóa phòng.
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            Mọi phím tắt chuyển tab, mở cửa sổ mới, chuột phải, quay lại trang trước và thoát toàn màn hình đều bị khóa.
          </p>
        </div>

        {remainingLabel && (
          <div className="py-2.5 px-4 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 font-mono">
            Thời gian còn lại: <strong className="text-amber-300">{remainingLabel}</strong>
          </div>
        )}

        {exitAttempts > 0 && (
          <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs font-bold text-rose-200 flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Đã ghi nhận {exitAttempts} lần thoát toàn màn hình / rời phòng thi!</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (!fullscreenUnsupported && !isFullscreen) {
              void handleRequestFullscreenClick();
            } else {
              window.focus();
              setIsWindowFocused(true);
            }
          }}
          className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
          <span>
            {!fullscreenUnsupported && !isFullscreen
              ? 'Vào Toàn Màn Hình & Tiếp tục'
              : 'Quay lại Phòng Thi Ngay'}
          </span>
        </button>
      </div>
    </div>
  );
};
