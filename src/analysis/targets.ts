/**
 * Loudness delivery targets (integrated LUFS + true-peak ceiling) for the
 * compliance readout. Values per EBU R128, ATSC A/85, and the major streaming
 * platforms' published normalization targets.
 */

export interface LoudnessTarget {
  id: string;
  label: string;
  /** Integrated loudness target, LUFS. */
  lufs: number;
  /** True-peak ceiling, dBTP. */
  truePeakDb: number;
  /** Allowed deviation from `lufs` to count as "in range", LU. */
  toleranceLu: number;
}

export const LOUDNESS_TARGETS: readonly LoudnessTarget[] = [
  { id: "ebu", label: "EBU R128", lufs: -23, truePeakDb: -1, toleranceLu: 1 },
  { id: "stream14", label: "Streaming −14", lufs: -14, truePeakDb: -1, toleranceLu: 1 },
  { id: "apple16", label: "Apple/Podcast −16", lufs: -16, truePeakDb: -1, toleranceLu: 1 },
  { id: "atsc", label: "ATSC A/85 −24", lufs: -24, truePeakDb: -2, toleranceLu: 2 },
];

export const DEFAULT_TARGET: LoudnessTarget = LOUDNESS_TARGETS[1]; // streaming −14

export type Compliance = "na" | "under" | "in" | "over";

/** Compare an integrated-LUFS reading to a target. "na" until measurable. */
export function loudnessCompliance(
  integratedLufs: number,
  target: LoudnessTarget,
): Compliance {
  if (!Number.isFinite(integratedLufs) || integratedLufs <= -70) return "na";
  const delta = integratedLufs - target.lufs;
  if (Math.abs(delta) <= target.toleranceLu) return "in";
  return delta > 0 ? "over" : "under";
}

/** True-peak ceiling check: true once any reading exceeds the target's dBTP. */
export function truePeakOver(maxTruePeakDb: number, target: LoudnessTarget): boolean {
  return Number.isFinite(maxTruePeakDb) && maxTruePeakDb > target.truePeakDb;
}
