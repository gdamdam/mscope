/**
 * Dynamics descriptors derived from already-computed level/loudness scalars.
 * Kept input-only (no buffers) so it composes with any meter that emits dB values.
 */

import { DB_FLOOR } from "./util";

/** True if x is a usable dB measurement (finite and above the silence sentinel). */
function isUsableDb(x: number): boolean {
  return Number.isFinite(x) && x > DB_FLOOR;
}

/**
 * Crest factor: peak-to-RMS distance in dB (`peakDb - rmsDb`), floored at 0.
 * Returns 0 when either input is non-finite or at DB_FLOOR (e.g. silence),
 * since the ratio is undefined/meaningless there.
 */
export function crestFactorDb(peakDb: number, rmsDb: number): number {
  if (!isUsableDb(peakDb) || !isUsableDb(rmsDb)) return 0;
  const crest = peakDb - rmsDb;
  return crest > 0 ? crest : 0;
}

/**
 * Peak-to-Loudness Ratio: `peakDb - integratedLufs`. Unlike crest factor this is
 * not floored (peak below integrated loudness is a valid, if unusual, result).
 * Returns 0 if either input is non-finite. integratedLufs at DB_FLOOR is treated
 * as non-usable loudness, so guard it too.
 */
export function plrDb(peakDb: number, integratedLufs: number): number {
  if (!Number.isFinite(peakDb) || !Number.isFinite(integratedLufs)) return 0;
  if (peakDb <= DB_FLOOR || integratedLufs <= DB_FLOOR) return 0;
  return peakDb - integratedLufs;
}
