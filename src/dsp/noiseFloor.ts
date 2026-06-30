/**
 * Noise-floor estimation from a history of short-term RMS dB measurements.
 */

import { DB_FLOOR } from "./util";

/** Percentile used as the noise-floor estimate (low percentile of RMS history). */
const NOISE_FLOOR_PERCENTILE = 10;

/**
 * Estimate the noise floor as a low percentile (~10th) of the RMS history.
 *
 * Heuristic: in real material the quietest passages cluster near the true noise
 * floor while louder content dominates the upper percentiles. Taking a low
 * percentile (rather than the absolute minimum) rejects transient dropouts/glitches
 * yet still tracks the quiet bed. Non-finite samples and DB_FLOOR sentinels (digital
 * silence) are excluded first so true silence does not drag the estimate to the floor.
 *
 * Percentile uses the nearest-rank method on the ascending-sorted finite samples:
 * rank = ceil(p/100 * n), 1-based. Empty / all-invalid input returns DB_FLOOR.
 */
export function estimateNoiseFloorDb(rmsDbHistory: number[]): number {
  const samples = rmsDbHistory.filter(
    (x) => Number.isFinite(x) && x > DB_FLOOR,
  );
  if (samples.length === 0) return DB_FLOOR;

  samples.sort((a, b) => a - b);
  const rank = Math.ceil((NOISE_FLOOR_PERCENTILE / 100) * samples.length);
  // rank is in [1, n] for a non-empty array; convert to a 0-based index.
  const index = Math.min(samples.length - 1, Math.max(0, rank - 1));
  return samples[index];
}
