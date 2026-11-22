import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'audixify_pwa_dismissed_at';
export const PWA_SNOOZE_MS = 48 * 60 * 60 * 1000; // 48 hours

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return Boolean(mq || iosStandalone);
}

function checkIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || isTouchMac;
}

function readDismissedTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkIsStandalone());
  const [isIOS] = useState<boolean>(() => checkIsIOS());
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => readDismissedTimestamp());
  const [showPrompt, setShowPrompt] = useState(false);

  const isSnoozeExpired = useCallback(
    (ts: number | null) => ts === null || Date.now() - ts >= PWA_SNOOZE_MS,
    [],
  );

  // Listen to beforeinstallprompt, appinstalled, display-mode, and network state
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setShowPrompt(false);
    };

    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        setIsStandalone(true);
        setShowPrompt(false);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    mq?.addEventListener?.('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      mq?.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  // Show popup automatically if NOT installed and 48h snooze has expired (or first visit)
  useEffect(() => {
    if (isStandalone) {
      setShowPrompt(false);
      return;
    }

    if (isSnoozeExpired(dismissedAt)) {
      const timer = window.setTimeout(() => {
        if (!checkIsStandalone() && isSnoozeExpired(readDismissedTimestamp())) {
          setShowPrompt(true);
        }
      }, 2400);
      return () => window.clearTimeout(timer);
    }

    // If snoozed, schedule wake-up right when the 48h window expires
    const remaining = Math.max(1000, PWA_SNOOZE_MS - (Date.now() - (dismissedAt || 0)));
    const safeDelay = Math.min(remaining, 2147483640);
    const wakeTimer = window.setTimeout(() => {
      if (!checkIsStandalone() && isSnoozeExpired(readDismissedTimestamp())) {
        setShowPrompt(true);
      }
    }, safeDelay);

    const onFocus = () => {
      if (!checkIsStandalone() && isSnoozeExpired(readDismissedTimestamp())) {
        setShowPrompt(true);
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearTimeout(wakeTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [isStandalone, dismissedAt, isSnoozeExpired]);

  const dismissFor48Hours = useCallback(() => {
    const now = Date.now();
    setDismissedAt(now);
    setShowPrompt(false);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(now));
    } catch {}
  }, []);

  const openInstallPrompt = useCallback(() => {
    if (!isStandalone) {
      setShowPrompt(true);
    }
  }, [isStandalone]);

  const triggerInstall = useCallback(async (): Promise<'installed' | 'dismissed' | 'manual'> => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setShowPrompt(false);
        setIsStandalone(true);
        return 'installed';
      }
      dismissFor48Hours();
      return 'dismissed';
    }
    return 'manual';
  }, [deferredPrompt, dismissFor48Hours]);

  const snoozeRemainingHours = dismissedAt
    ? Math.max(0, Math.ceil((PWA_SNOOZE_MS - (Date.now() - dismissedAt)) / (60 * 60 * 1000)))
    : 0;

  return {
    isStandalone,
    isIOS,
    isOffline,
    canNativeInstall: Boolean(deferredPrompt),
    showPrompt,
    snoozeRemainingHours,
    triggerInstall,
    dismissFor48Hours,
    openInstallPrompt,
  };
}
