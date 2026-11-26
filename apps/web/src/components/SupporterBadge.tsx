import type { User } from '@chickaa/contracts';

/** "💛 Supporter" chip, shown only while someone is a supporter. */
export function SupporterBadge({ supporter, className = '' }: { supporter: User['supporter'] | undefined; className?: string }) {
  if (!supporter?.active) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun-300/60 px-2 py-0.5 text-xs font-bold text-[#7A4A00] ${className}`}
      data-testid="supporter-badge"
    >
      💛 Supporter{supporter.lifetime ? ' · lifetime' : ''}
    </span>
  );
}

/** "until 26 Dec 2026" / "for life" / "" */
export function supporterUntilText(s: User['supporter'] | undefined): string {
  if (!s?.active) return '';
  if (s.lifetime) return 'for life';
  return s.until ? `until ${new Date(s.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
}
