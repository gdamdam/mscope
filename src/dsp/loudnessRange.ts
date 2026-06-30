/**
 * EBU R128 / EBU Tech 3342 Loudness Range (LRA), in LU.
 *
 * LRA quantifies the variation of loudness over a programme. It is computed
 * from a sequence of SHORT-TERM (3 s) loudness measurements (LUFS), per
 * Tech 3342:
 *
 *   1. Drop non-measurable values (non-finite / -Infinity, e.g. silence).
 *   2. ABSOLUTE GATE: keep values >= -70 LUFS.
 *   3. RELATIVE THRESHOLD = (mean loudness of the absolute-gated set) - 20 LU.
 *      Note the threshold is -20 LU here, vs -10 LU for INTEGRATED loudness.
 *   4. RELATIVE GATE: keep values >= the relative threshold.
 *   5. LRA = P95 - P10 of the relatively-gated set, with linear interpolation
 *      between order statistics.
 *
 * MEAN DOMAIN ----------------------------------------------------------------
 * The spec defines the relative threshold from the MEAN ENERGY (power) of the
 * gated blocks, i.e. average in the linear energy domain and convert back to
 * LUFS, NOT a plain arithmetic mean of the LUFS dB values. Because the input
 * here is already in LUFS, we map each value v -> 10^(v/10) (energy), average,
 * and map back with 10*log10(mean). This matches LoudnessMeter's power-domain
 * gating. (A plain LUFS mean differs only slightly for typical material; the
 * energy-domain mean is used so this stays spec-faithful.)
 *
 * Fewer than 2 usable values at any stage -> 0 (LRA undefined for a single
 * point). The result is clamped to >= 0.
 */

/** Absolute gate threshold (LUFS), EBU R128. */
const ABSOLUTE_GATE_LUFS = -70;
/** Relative gate offset for LRA (LU below the gated mean), EBU Tech 3342. */
const LRA_RELATIVE_GATE_LU = -20;
/** Lower percentile of the LRA window. */
const LRA_LOW_PERCENTILE = 0.1;
/** Upper percentile of the LRA window. */
const LRA_HIGH_PERCENTILE = 0.95;

/**
 * Percentile of a SORTED ascending array using linear interpolation between
 * the two nearest order statistics (the "index = (n-1)*p" convention, matching
 * the EBU 3342 reference and NumPy's default `linear` method).
 */
function percentileSorted(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

/**
 * Compute EBU R128 / Tech 3342 Loudness Range (LU) from a sequence of
 * short-term (3 s) loudness values in LUFS. Returns 0 when there are fewer than
 * two usable values. Never returns a negative value.
 */
export function loudnessRange(shortTermLufs: number[]): number {
  // 1. Drop non-measurable values (NaN, ±Infinity).
  const finite = shortTermLufs.filter((v) => Number.isFinite(v));

  // 2. Absolute gate at -70 LUFS.
  const absGated = finite.filter((v) => v >= ABSOLUTE_GATE_LUFS);
  if (absGated.length < 2) return 0;

  // 3. Relative threshold = energy-domain mean loudness - 20 LU.
  let energySum = 0;
  for (const v of absGated) energySum += Math.pow(10, v / 10);
  const meanLufs = 10 * Math.log10(energySum / absGated.length);
  const relThreshold = meanLufs + LRA_RELATIVE_GATE_LU;

  // 4. Relative gate.
  const relGated = absGated
    .filter((v) => v >= relThreshold)
    .sort((a, b) => a - b);
  if (relGated.length < 2) return 0;

  // 5. LRA = P95 - P10 (linear interpolation), clamped to >= 0.
  const lra =
    percentileSorted(relGated, LRA_HIGH_PERCENTILE) -
    percentileSorted(relGated, LRA_LOW_PERCENTILE);
  return Math.max(0, lra);
}
