/**
 * Shared DSP scalar helpers. Kept tiny and dependency-free so every dsp/* module
 * converts levels identically (avoids each module rolling its own dB math).
 */

/** Floor for dB conversions: magnitudes at/below this report DB_FLOOR rather than -Infinity,
 *  so meters and JSON export stay finite/serializable. */
export const DB_FLOOR = -200;

/** Linear amplitude (magnitude) -> dBFS. Returns DB_FLOOR for zero/sub-floor input. */
export function linToDb(magnitude: number): number {
  const m = Math.abs(magnitude);
  if (!(m > 0)) return DB_FLOOR;
  const db = 20 * Math.log10(m);
  return db < DB_FLOOR ? DB_FLOOR : db;
}

/** dBFS -> linear amplitude. */
export function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

/** Clamp x into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
