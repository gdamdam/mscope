import { DB_FLOOR } from "../state/session";

/** Format a dB/dBFS/dBTP value; renders non-finite and floor values as a dash. */
export function fmtDb(v: number, digits = 1): string {
  if (!Number.isFinite(v) || v <= DB_FLOOR) return "−∞";
  return v.toFixed(digits);
}

/** Format a LUFS value; "−∞" for below-measurable / unmeasured. */
export function fmtLufs(v: number, digits = 1): string {
  if (!Number.isFinite(v) || v <= DB_FLOOR) return "−∞";
  return v.toFixed(digits);
}

/** Format a signed unit-interval metric (correlation/balance) to fixed digits. */
export function fmtSigned(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

/** Milliseconds → compact "Mm SS.s s" / "S.s s" for readouts. */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0.0 s";
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)} s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return `${m}m ${s.toFixed(0).padStart(2, "0")}s`;
}
