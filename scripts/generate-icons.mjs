// Generates every PWA icon + iOS launch screen from scripts/brand.mjs.
// Run: pnpm icons   (outputs are committed, so this only runs when the brand changes)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { iconSvg, splashSvg } from './brand.mjs';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const pub = `${web}public/`;
await mkdir(`${pub}icons`, { recursive: true });
await mkdir(`${pub}splash`, { recursive: true });

const png = (svg, size, out) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out);

await writeFile(`${pub}favicon.svg`, iconSvg({ rounded: true }));
await png(iconSvg(), 192, `${pub}icons/icon-192.png`);
await png(iconSvg(), 512, `${pub}icons/icon-512.png`);
await png(iconSvg({ maskable: true }), 512, `${pub}icons/maskable-512.png`);
// iOS applies its own rounded mask and ignores transparency → full-bleed square.
await png(iconSvg(), 180, `${pub}icons/apple-touch-icon.png`);

// [css width, css height, pixel ratio] — portrait launch screens for current iPhones + iPads.
const DEVICES = [
  [440, 956, 3], // 16/17 Pro Max
  [430, 932, 3], // 14/15 Pro Max, 15/16 Plus
  [420, 912, 3], // iPhone Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 16e
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [375, 667, 2], // SE 2/3, 8
  [1024, 1366, 2], // iPad Pro 12.9/13
  [834, 1194, 2], // iPad Pro 11
  [820, 1180, 2], // iPad Air
  [768, 1024, 2], // iPad / mini (older)
  [744, 1133, 2], // iPad mini 6+
];

const links = [];
for (const [w, h, r] of DEVICES) {
  const pw = w * r;
  const ph = h * r;
  const name = `splash/launch-${pw}x${ph}.png`;
  await sharp(Buffer.from(splashSvg(pw, ph))).png({ compressionLevel: 9, palette: true }).toFile(pub + name);
  links.push(
    `<link rel="apple-touch-startup-image" href="/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" />`,
  );
}

const indexPath = `${web}index.html`;
const html = await readFile(indexPath, 'utf8');
const block = `<!--SPLASH-LINKS-->\n    ${links.join('\n    ')}\n    <!--/SPLASH-LINKS-->`;
const next = html.includes('<!--/SPLASH-LINKS-->')
  ? html.replace(/<!--SPLASH-LINKS-->[\s\S]*<!--\/SPLASH-LINKS-->/, block)
  : html.replace('<!--SPLASH-LINKS-->', block);
await writeFile(indexPath, next);
console.log(`icons + ${DEVICES.length} splash screens written`);
