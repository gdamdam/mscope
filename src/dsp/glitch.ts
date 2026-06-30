/**
 * Click / dropout (discontinuity) detection. A "glitch" is a single-sample step
 * whose magnitude exceeds a threshold: |x[n] - x[n-1]| > threshold. Useful for
 * spotting clicks, dropouts, and edit splices in a stream of audio blocks.
 */

/**
 * Count discontinuities in one block. Pure helper.
 *
 * @param block     samples to scan.
 * @param threshold a step strictly greater than this counts as a glitch.
 * @param prev      the sample immediately preceding block[0], or null when there
 *                  is no predecessor (start of stream / first block). When prev
 *                  is given, a jump across the boundary into block[0] is counted.
 * @returns count of glitches found, and `last` = the carry sample for the next
 *          call (final sample of the block, or `prev ?? 0` for an empty block).
 */
export function countDiscontinuities(
  block: Float32Array,
  threshold: number,
  prev: number | null,
): { count: number; last: number } {
  const n = block.length;
  if (n === 0) return { count: 0, last: prev ?? 0 };

  let count = 0;
  let p = prev;
  for (let i = 0; i < n; i++) {
    const x = block[i];
    // Skip the very first sample only when there is no predecessor to compare
    // against; otherwise compare against the carried-in `prev` (gapless).
    if (p !== null && Math.abs(x - p) > threshold) count++;
    p = x;
  }
  return { count, last: block[n - 1] };
}

/**
 * Stateful detector that remembers the last sample across `process()` calls so a
 * discontinuity straddling a block boundary is detected exactly once (gapless).
 */
export class GlitchDetector {
  private readonly threshold: number;
  private prev: number | null = null;
  private total = 0;

  constructor(threshold = 0.5) {
    this.threshold = threshold;
  }

  /** Scan a block; returns the number of NEW glitches found in it. */
  process(block: Float32Array): number {
    const { count, last } = countDiscontinuities(
      block,
      this.threshold,
      this.prev,
    );
    // An empty block leaves `prev` untouched (last === prev ?? 0); only advance
    // the carry when the block actually contained samples.
    if (block.length > 0) this.prev = last;
    this.total += count;
    return count;
  }

  /** Cumulative glitch count since construction or the last reset(). */
  get count(): number {
    return this.total;
  }

  /** Zero the count and forget the boundary (last-sample) state. */
  reset(): void {
    this.prev = null;
    this.total = 0;
  }
}
