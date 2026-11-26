import { describe, expect, it } from 'vitest';
import { crc16, isValidPayNowPayload, parseEmv, payNowAmount, withPayNowReference } from '../paynow.ts';

// A made-up static PayNow QR (mobile +65 9000 0000, S$5.00, amount editable).
const FAKE = '00020101021126380009SG.PAYNOW010100211+65900000000301152040000530370254045.005802SG5902NA6009SINGAPORE630404BE';

describe('PayNow QR', () => {
  it('CRC-16/CCITT-FALSE matches the standard check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('validates payloads', () => {
    expect(isValidPayNowPayload(FAKE)).toBe(true);
    expect(isValidPayNowPayload(FAKE.slice(0, -4) + '0000')).toBe(false); // bad checksum
    expect(isValidPayNowPayload('hello')).toBe(false);
    expect(isValidPayNowPayload('')).toBe(false);
    const notPayNow = '000201010211520400005303702' + '6304';
    expect(isValidPayNowPayload(notPayNow + crc16(notPayNow))).toBe(false);
    const noCrcTag = '000201';
    expect(isValidPayNowPayload(noCrcTag)).toBe(false);
  });

  it('adds a reference (tag 62.01) with a fresh checksum, replacing an old one', () => {
    const a = withPayNowReference(FAKE, 'NCC-ABCD2345');
    expect(isValidPayNowPayload(a)).toBe(true);
    const f = parseEmv(a);
    expect(f.find((x) => x.tag === '62')?.value).toBe('0112NCC-ABCD2345');
    expect(f.at(-2)?.tag).toBe('62');
    const b = withPayNowReference(a, 'NCC-ZZZZ9999');
    expect(parseEmv(b).filter((x) => x.tag === '62')).toHaveLength(1);
    expect(isValidPayNowPayload(b)).toBe(true);
    expect(() => withPayNowReference(FAKE, 'has space')).toThrow();
    expect(() => withPayNowReference(FAKE, 'x'.repeat(26))).toThrow();
  });

  it('reads the amount', () => {
    expect(payNowAmount(FAKE)).toBe('5.00');
    expect(payNowAmount('000201')).toBeNull();
    expect(payNowAmount('zz')).toBeNull();
  });

  it('rejects truncated fields', () => {
    expect(() => parseEmv('0005ab')).toThrow();
  });
});
