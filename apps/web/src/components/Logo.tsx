/** The ChickAA chick mark (same drawing as the app icon, see scripts/brand.mjs). */
export function Logo({ className = 'size-12', title = 'ChickAA' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label={title}>
      <rect width="512" height="512" rx="112" fill="#FF7A3D" />
      <g transform="translate(51.2 51.2) scale(0.8)">
        <ellipse cx="216" cy="92" rx="22" ry="38" transform="rotate(-25 216 92)" fill="#FFC93C" />
        <ellipse cx="256" cy="80" rx="22" ry="44" fill="#FFC93C" />
        <ellipse cx="296" cy="92" rx="22" ry="38" transform="rotate(25 296 92)" fill="#FFC93C" />
        <circle cx="256" cy="282" r="176" fill="#FFC93C" />
        <path d="M96 300 q-34 40 6 78 q30 -22 34 -58z" fill="#F7B52C" />
        <path d="M416 300 q34 40 -6 78 q-30 -22 -34 -58z" fill="#F7B52C" />
        <circle cx="190" cy="246" r="20" fill="#2B2118" />
        <circle cx="322" cy="246" r="20" fill="#2B2118" />
        <circle cx="197" cy="239" r="6" fill="#fff" />
        <circle cx="329" cy="239" r="6" fill="#fff" />
        <circle cx="160" cy="306" r="24" fill="#FF9C86" opacity=".75" />
        <circle cx="352" cy="306" r="24" fill="#FF9C86" opacity=".75" />
        <path d="M222 290 q34 -26 68 0 q-34 22 -68 0z" fill="#F0622A" />
        <path d="M226 291 q30 8 60 0" stroke="#C94A18" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
