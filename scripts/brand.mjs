// ChickAA brand: one source of truth for colours + the logo mark.
// The mark is an original illustration: a round, content little chick keeping its beak shut.
// "ChickAA": AA制 is Chinese slang for going dutch; 别鸡较 (bié jī jiào) puns 别计较 "don't squabble over every cent" with 鸡 (chicken).
export const COLORS = {
  tangerine: '#FF7A3D',
  sun: '#FFC93C',
  ink: '#2B2118',
  cream: '#FFF7EC',
  blush: '#FF9C86',
  beak: '#F0622A',
};

/** Chick drawn in a 512×512 box, centred, filling ~`scale` of the box. */
export function chick({ scale = 1 } = {}) {
  const t = (256 * (1 - scale)).toFixed(2);
  return `<g transform="translate(${t} ${t}) scale(${scale})">
    <ellipse cx="216" cy="92" rx="22" ry="38" transform="rotate(-25 216 92)" fill="${COLORS.sun}"/>
    <ellipse cx="256" cy="80" rx="22" ry="44" fill="${COLORS.sun}"/>
    <ellipse cx="296" cy="92" rx="22" ry="38" transform="rotate(25 296 92)" fill="${COLORS.sun}"/>
    <circle cx="256" cy="282" r="176" fill="${COLORS.sun}"/>
    <path d="M96 300 q-34 40 6 78 q30 -22 34 -58z" fill="#F7B52C"/>
    <path d="M416 300 q34 40 -6 78 q-30 -22 -34 -58z" fill="#F7B52C"/>
    <circle cx="190" cy="246" r="20" fill="${COLORS.ink}"/>
    <circle cx="322" cy="246" r="20" fill="${COLORS.ink}"/>
    <circle cx="197" cy="239" r="6" fill="#fff"/>
    <circle cx="329" cy="239" r="6" fill="#fff"/>
    <circle cx="160" cy="306" r="24" fill="${COLORS.blush}" opacity=".75"/>
    <circle cx="352" cy="306" r="24" fill="${COLORS.blush}" opacity=".75"/>
    <path d="M222 290 q34 -26 68 0 q-34 22 -68 0z" fill="${COLORS.beak}"/>
    <path d="M226 291 q30 8 60 0" stroke="#C94A18" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>`;
}

export function iconSvg({ maskable = false, rounded = false } = {}) {
  const bg = rounded
    ? `<rect width="512" height="512" rx="112" fill="${COLORS.tangerine}"/>`
    : `<rect width="512" height="512" fill="${COLORS.tangerine}"/>`;
  // Maskable icons must keep content inside the central 80% safe zone.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}${chick({ scale: maskable ? 0.62 : 0.8 })}</svg>`;
}

export function splashSvg(w, h) {
  const size = Math.round(Math.min(w, h) * 0.32);
  const x = (w - size) / 2;
  const y = (h - size) / 2 - h * 0.04;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.cream}"/>
    <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112" fill="${COLORS.tangerine}"/>${chick({ scale: 0.8 })}
    </svg>
  </svg>`;
}
