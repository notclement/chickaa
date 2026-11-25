import { describe, expect, it } from 'vitest';
import { isIOS, isIOSSafari, isStandalone } from './platform.ts';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

describe('platform detection', () => {
  it('detects iPhone Safari', () => {
    expect(isIOS({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 })).toBe(true);
    expect(isIOSSafari({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 })).toBe(true);
  });

  it('treats Chrome on iPhone as iOS but not Safari', () => {
    expect(isIOS({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 })).toBe(true);
    expect(isIOSSafari({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 })).toBe(false);
  });

  it('detects iPadOS pretending to be a Mac, but not a real Mac', () => {
    expect(isIOS({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 })).toBe(false);
  });

  it('does not treat Android as iOS', () => {
    expect(isIOS({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe(false);
  });

  it('detects standalone from either signal', () => {
    expect(isStandalone({ standaloneMedia: true, navigatorStandalone: undefined })).toBe(true);
    expect(isStandalone({ standaloneMedia: false, navigatorStandalone: true })).toBe(true);
    expect(isStandalone({ standaloneMedia: false, navigatorStandalone: false })).toBe(false);
  });
});
