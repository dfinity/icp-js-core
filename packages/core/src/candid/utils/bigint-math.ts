/**
 * Equivalent to `Math.log2(n)` with support for `BigInt` values
 * @param n bigint or integer
 * @returns integer
 */
export function ilog2(n: bigint | number): number {
  const nBig = BigInt(n);
  if (n <= 0) {
    throw new RangeError('Input must be positive');
  }
  return nBig.toString(2).length - 1;
}

/**
 * Equivalent to `2 ** n` with support for `BigInt` values
 * (necessary for browser preprocessors which replace the `**` operator with `Math.pow`)
 * @param n bigint or integer
 * @returns bigint
 */
export function iexp2(n: bigint | number): bigint {
  const nBig = BigInt(n);
  if (n < 0) {
    throw new RangeError('Input must be non-negative');
  }
  return BigInt(1) << nBig;
}
