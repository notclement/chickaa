import { SUPPORT_TELEGRAM } from '@chickaa/contracts';

export const DEVELOPER = { name: 'Clement', linkedin: 'https://www.linkedin.com/in/clementsg/', telegram: SUPPORT_TELEGRAM } as const;

/** Small developer credit shown on Account and the login / sign-up screens. */
export function MadeBy({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-ink-500 ${className}`} data-testid="made-by">
      Made by {DEVELOPER.name} ·{' '}
      <a href={DEVELOPER.linkedin} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-700 underline underline-offset-2">
        LinkedIn
      </a>
    </p>
  );
}
