/**
 * PayNow QR (SGQR / EMVCo merchant-presented) helpers: parse, validate, and add a reference.
 * Pure string work; the QR image is drawn by the web app.
 */

/** CRC-16/CCITT-FALSE, as EMVCo requires (poly 0x1021, init 0xFFFF), as 4 upper-case hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface EmvField {
  tag: string;
  value: string;
}

/** Splits "TTLLvalue…" into fields. Throws on a malformed string. */
export function parseEmv(text: string): EmvField[] {
  const out: EmvField[] = [];
  let i = 0;
  while (i < text.length) {
    const tag = text.slice(i, i + 2);
    const len = parseInt(text.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > text.length) throw new Error('Not a valid QR payload');
    out.push({ tag, value: text.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

/** A well-formed PayNow payload with a correct checksum. */
export function isValidPayNowPayload(text: string): boolean {
  try {
    const fields = parseEmv(text);
    const last = fields.at(-1);
    if (fields[0]?.tag !== '00' || last?.tag !== '63' || last.value.length !== 4) return false;
    if (crc16(text.slice(0, -4)) !== last.value.toUpperCase()) return false;
    return fields.some((f) => /^(2[6-9]|[3-4]\d|5[01])$/.test(f.tag) && f.value.includes('SG.PAYNOW'));
  } catch {
    return false;
  }
}

/**
 * Same payload with a bill reference (tag 62, sub-tag 01) that shows up in the payer's and
 * payee's bank records. Replaces any existing tag 62 and recomputes the checksum.
 */
export function withPayNowReference(payload: string, reference: string): string {
  if (!/^[A-Za-z0-9-]{1,25}$/.test(reference)) throw new Error('Reference must be 1–25 letters, digits or -');
  const fields = parseEmv(payload).filter((f) => f.tag !== '62' && f.tag !== '63');
  const body = fields.map((f) => field(f.tag, f.value)).join('') + field('62', field('01', reference)) + '6304';
  return body + crc16(body);
}

/** Amount in the payload (tag 54), if fixed. */
export function payNowAmount(payload: string): string | null {
  try {
    return parseEmv(payload).find((f) => f.tag === '54')?.value ?? null;
  } catch {
    return null;
  }
}
