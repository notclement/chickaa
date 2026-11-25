import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service-worker registration + update detection (ARCHITECTURE.md §3.4).
 * Checks for a new deploy on start, whenever the app returns to the foreground,
 * and hourly while it stays open.
 */
export function useAppUpdate() {
  const regRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      regRef.current = registration;
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error);
    },
  });

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void regRef.current?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    const hourly = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.clearInterval(hourly);
    };
  }, []);

  return {
    needRefresh,
    offlineReady,
    /** Activates the waiting service worker and reloads the page. */
    applyUpdate: () => updateServiceWorker(true),
    dismissUpdate: () => setNeedRefresh(false),
    dismissOfflineReady: () => setOfflineReady(false),
  };
}
