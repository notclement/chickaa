/**
 * Split an integer total into integer parts proportional to integer weights, so that the parts
 * add up to the total EXACTLY (largest-remainder method).
 *
 * Each part starts at floor(total × w / W). The few units left over go to the parts with the
 * largest fractional remainders. Ties (e.g. S$10 ÷ 3) go in order starting at position
 * `seed mod n`, so across many expenses the odd cent lands on different people instead of always
 * the first member (test report run 3, F2). The same input and seed always give the same result.
 */
export function allocate(total: bigint, weights: readonly bigint[], seed = 0): bigint[] {
  if (total < 0n) throw new RangeError('allocate: total must be ≥ 0');
  if (weights.length === 0) throw new RangeError('allocate: no weights');
  let W = 0n;
  for (const w of weights) {
    if (w < 0n) throw new RangeError('allocate: weights must be ≥ 0');
    W += w;
  }
  if (W === 0n) throw new RangeError('allocate: weights sum to zero');

  const parts = weights.map((w) => (total * w) / W);
  let left = total;
  for (const p of parts) left -= p;
  if (left === 0n) return parts; // divides exactly: nothing to hand out

  const n = weights.length;
  const start = ((seed % n) + n) % n;
  // Tie order is precomputed once: position i comes (i - start) mod n-th.
  const rem = weights.map((w, i) => ({ i, r: (total * w) % W, o: i >= start ? i - start : i - start + n }));
  rem.sort((a, b) => (a.r === b.r ? a.o - b.o : a.r > b.r ? -1 : 1));
  for (let k = 0; left > 0n; k++, left--) parts[rem[k]!.i]! += 1n;
  return parts;
}

/** Small stable number from a string (FNV-1a, 32-bit): the tie-break seed for an expense, from its clientId. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
