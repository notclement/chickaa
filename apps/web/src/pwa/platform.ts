/** Platform detection used by install + offline UX. Pure functions so they're unit-testable. */

export interface PlatformInfo {
  userAgent: string;
  maxTouchPoints: number;
  standaloneMedia: boolean; // matchMedia('(display-mode: standalone)').matches
  navigatorStandalone: boolean | undefined; // iOS-only navigator.standalone
}

export function isIOS(p: Pick<PlatformInfo, 'userAgent' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/i.test(p.userAgent)) return true;
  // iPadOS 13+ pretends to be a Mac; real Macs have no touch points.
  return /Macintosh/i.test(p.userAgent) && p.maxTouchPoints > 1;
}

/** Safari proper (not Chrome/Firefox/Edge on iOS, which can still add to home screen via Share on iOS 16.4+). */
export function isIOSSafari(p: Pick<PlatformInfo, 'userAgent' | 'maxTouchPoints'>): boolean {
  return isIOS(p) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(p.userAgent);
}

export function isStandalone(p: Pick<PlatformInfo, 'standaloneMedia' | 'navigatorStandalone'>): boolean {
  return p.standaloneMedia || p.navigatorStandalone === true;
}

export function readPlatform(): PlatformInfo {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standaloneMedia: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  };
}
