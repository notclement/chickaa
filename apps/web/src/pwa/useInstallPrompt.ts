import { useCallback, useEffect, useState } from 'react';
import { isIOS, isIOSSafari, isStandalone, readPlatform } from './platform.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode =
  | 'installed' // running as the home-screen app
  | 'prompt' // Chrome/Edge/Android: we can show the native install dialog
  | 'ios-safari' // iPhone/iPad Safari: show "Share → Add to Home Screen" steps
  | 'ios-other' // Chrome/Firefox on iOS: same Share-menu route on iOS 16.4+
  | 'unavailable'; // browser offers no install path (or it was already used)

// The event can fire before React mounts, so capture it at module load.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
}

function currentMode(installedFlag: boolean): InstallMode {
  const p = readPlatform();
  if (installedFlag || isStandalone(p)) return 'installed';
  if (deferred) return 'prompt';
  if (isIOSSafari(p)) return 'ios-safari';
  if (isIOS(p)) return 'ios-other';
  return 'unavailable';
}

export function useInstallPrompt() {
  const [installed, setInstalled] = useState(false);
  const [mode, setMode] = useState<InstallMode>(() => currentMode(false));

  useEffect(() => {
    const refresh = () => setMode(currentMode(installed));
    listeners.add(refresh);
    const onInstalled = () => {
      deferred = null;
      setInstalled(true);
      setMode('installed');
    };
    window.addEventListener('appinstalled', onInstalled);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', refresh);
    refresh();
    return () => {
      listeners.delete(refresh);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', refresh);
    };
  }, [installed]);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    const evt = deferred;
    deferred = null; // the event can only be used once
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    setMode(currentMode(outcome === 'accepted'));
    return outcome === 'accepted';
  }, []);

  return { mode, promptInstall };
}
