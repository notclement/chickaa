/**
 * Turns any photo into a tiny square avatar before upload: centre-cropped, 128×128 px,
 * WebP (or JPEG where the browser can't encode WebP, e.g. some iOS versions), stepping the
 * quality down until it's under the target size. A typical result is 3–8 KB.
 */
export const AVATAR_PX = 128;
const TARGET_BYTES = 10 * 1024;
const HARD_LIMIT = 24 * 1024;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressAvatar(file: Blob): Promise<Blob> {
  const img = await decode(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!w || !h) throw new Error('Couldn’t read that image');
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Couldn’t process that image');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  if ('close' in img) img.close();

  let best: Blob | null = null;
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
      const blob = await toBlob(canvas, type, q);
      if (!blob || blob.type !== type) break; // this browser can't encode this type
      best = blob;
      if (blob.size <= TARGET_BYTES) return blob;
    }
    if (best) break;
  }
  if (!best || best.size > HARD_LIMIT) throw new Error('Couldn’t make that photo small enough. Try another one.');
  return best;
}
