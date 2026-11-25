/**
 * Split an integer total into integer parts proportional to integer weights, so that the parts
 * add up to the total EXACTLY (largest-remainder method).
 *
 * Each part starts at floor(total × w / W). The few units left over go to the parts with the
 * largest fractional remainders; ties go to the earlier position. That makes the result
 * deterministic: the same input always gives the same cents to the same people.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (total < 0n) throw new RangeError('allocate: total must be ≥ 0');
  if (weights.length === 0) throw new RangeError('allocate: no weights');
  let W = 0n;
  for (const w of weights) {
    if (w < 0n) throw new RangeError('allocate: weights must be ≥ 0');
    W += w;
  }
  if (W === 0n) throw new RangeError('allocate: weights sum to zero');

  const parts = weights.map((w) => (total * w) / W);
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % W }));
  let left = total - parts.reduce((a, b) => a + b, 0n);

  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (let k = 0; left > 0n; k++, left--) parts[remainders[k]!.i]! += 1n;
  return parts;
}
