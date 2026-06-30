/**
 * Amplitude distribution helpers.
 *
 * `amplitudeHistogram` maps sample values from the canonical audio range
 * [-1, 1] into `bins` equal-width buckets and counts occupancy. Out-of-range
 * samples are clamped into the edge buckets so a runaway/over-driven signal
 * still contributes rather than being silently dropped.
 */

/**
 * Bucket samples from [-1, 1] into `bins` equal-width buckets and count them.
 * Out-of-range values clamp into the first (-1) / last (+1) buckets.
 * Returns [] when `bins <= 0`; otherwise an array of length `bins`.
 */
export function amplitudeHistogram(samples: Float32Array, bins: number): number[] {
  if (bins <= 0) return [];

  const counts = new Array<number>(bins).fill(0);
  const last = bins - 1;

  for (let i = 0; i < samples.length; i++) {
    // Map [-1, 1] -> [0, bins). +1 must land in the last bucket, not bins.
    let idx = Math.floor(((samples[i] + 1) / 2) * bins);
    // Clamp out-of-range samples (and the exact +1 edge) into edge buckets.
    if (idx < 0) idx = 0;
    else if (idx > last) idx = last;
    counts[idx]++;
  }

  return counts;
}

/**
 * Normalize raw counts to heights in [0, 1] by dividing by the max count.
 * An all-zero (or empty) input yields all zeros (no division by zero).
 */
export function normalizeHistogram(counts: number[]): number[] {
  let max = 0;
  for (const c of counts) if (c > max) max = c;
  if (max === 0) return counts.map(() => 0);
  return counts.map((c) => c / max);
}
