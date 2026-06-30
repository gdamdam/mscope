import type { LoudnessSnapshot } from "../dsp/loudness";
import {
  LOUDNESS_TARGETS,
  loudnessCompliance,
  truePeakOver,
  type Compliance,
  type LoudnessTarget,
} from "../analysis/targets";
import { fmtDb, fmtLufs } from "./format";

interface LoudnessPanelProps {
  /** Current momentary/short-term/integrated reading, or null until measured. */
  loudness: LoudnessSnapshot | null;
  /** Session hold: max momentary LUFS seen. */
  maxMomentaryLufs: number;
  /** Session hold: max short-term LUFS seen. */
  maxShortTermLufs: number;
  /** Loudness range (LU). */
  lra: number;
  /** Session max true-peak (dBTP) across channels. */
  maxTruePeakHoldDb: number;
  target: LoudnessTarget;
  onTargetChange: (id: string) => void;
  onResetHolds: () => void;
}

/** State → CSS modifier suffix for the integrated hero number. */
const STATE_CLASS: Record<Compliance, string> = {
  in: "lufs-big--in",
  over: "lufs-big--over",
  under: "lufs-big--under",
  na: "lufs-big--na",
};

/** Signed integrated delta vs target, e.g. "+1.3 LU vs −14". */
function deltaLabel(integratedLufs: number, target: LoudnessTarget): string {
  const delta = integratedLufs - target.lufs;
  // Use the project's minus glyph (U+2212) for the target to match fmt helpers.
  const tgt = `${target.lufs < 0 ? "−" : ""}${Math.abs(target.lufs)}`;
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toFixed(1)} LU vs ${tgt}`;
}

/**
 * Loudness compliance panel — the numeric hero of the loudness rail. The
 * integrated LUFS reading is the focal value, colour-coded against the selected
 * delivery target; momentary/short-term carry session "max" holds, and the
 * true-peak ceiling latches a "TP OVER" badge once the target dBTP is breached.
 * Renders "—" for every measured value when `loudness` is null.
 */
export function LoudnessPanel({
  loudness,
  maxMomentaryLufs,
  maxShortTermLufs,
  lra,
  maxTruePeakHoldDb,
  target,
  onTargetChange,
  onResetHolds,
}: LoudnessPanelProps): JSX.Element {
  const integrated = loudness?.integratedLufs ?? Number.NaN;
  const state: Compliance = loudness
    ? loudnessCompliance(integrated, target)
    : "na";
  const heroValue = loudness ? fmtLufs(integrated) : "—";
  const heroDelta =
    loudness && state !== "na" ? deltaLabel(integrated, target) : "—";

  const tpOver = truePeakOver(maxTruePeakHoldDb, target);
  const tpText = Number.isNaN(maxTruePeakHoldDb) ? "—" : fmtDb(maxTruePeakHoldDb);

  return (
    <div className="panel" aria-label="Loudness">
      <p className="panel__title">Loudness</p>

      <div className="loudness-hero">
        <span
          className={`lufs-big ${STATE_CLASS[state]}`}
          aria-label={`Integrated ${heroValue} LUFS, ${state} target`}
        >
          <span className="lufs-big__num stat__v--num">{heroValue}</span>
          <span className="lufs-big__unit" aria-hidden="true">
            LUFS integrated
          </span>
          <span className="lufs-big__delta stat__v--num">{heroDelta}</span>
        </span>
      </div>

      <label className="loudness-target">
        <span className="loudness-target__k">target</span>
        <select
          className="loudness-target__select"
          value={target.id}
          onChange={(e) => onTargetChange(e.target.value)}
          aria-label="Loudness target"
        >
          {LOUDNESS_TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({t.lufs} LUFS · {t.truePeakDb} dBTP)
            </option>
          ))}
        </select>
      </label>

      <div className="loudness-grid">
        <HoldStat
          k="M"
          v={loudness ? fmtLufs(loudness.momentaryLufs) : "—"}
          hold={fmtLufs(maxMomentaryLufs)}
          unit="LUFS"
        />
        <HoldStat
          k="S"
          v={loudness ? fmtLufs(loudness.shortTermLufs) : "—"}
          hold={fmtLufs(maxShortTermLufs)}
          unit="LUFS"
        />
        <Stat k="LRA" v={Number.isNaN(lra) ? "—" : fmtDb(lra)} unit="LU" />
        <span className="stat">
          <span className="stat__k">
            true pk <span aria-hidden="true">dBTP</span>
          </span>
          {tpOver ? (
            <span
              className="badge badge--bad"
              aria-label={`True peak over ceiling, ${tpText} dBTP`}
            >
              TP OVER {tpText}
            </span>
          ) : (
            <span
              className="stat__v stat__v--num"
              aria-label={`true pk ${tpText} dBTP`}
            >
              {tpText}
            </span>
          )}
        </span>
      </div>

      <button type="button" className="btn" onClick={onResetHolds}>
        Reset holds
      </button>

      <p className="panel__note">ITU-R BS.1770 · measured at capture</p>
    </div>
  );
}

/** A current value with a small trailing session-max "hold". */
function HoldStat({
  k,
  v,
  hold,
  unit,
}: {
  k: string;
  v: string;
  hold: string;
  unit: string;
}): JSX.Element {
  return (
    <span className="stat">
      <span className="stat__k">
        {k} <span aria-hidden="true">{unit}</span>
      </span>
      <span className="stat__v stat__v--num" aria-label={`${k} ${v} ${unit}`}>
        {v}
        <span className="stat__hold" aria-label={`${k} max ${hold} ${unit}`}>
          max {hold}
        </span>
      </span>
    </span>
  );
}

function Stat({
  k,
  v,
  unit,
}: {
  k: string;
  v: string;
  unit: string;
}): JSX.Element {
  return (
    <span className="stat">
      <span className="stat__k">
        {k} <span aria-hidden="true">{unit}</span>
      </span>
      <span className="stat__v stat__v--num" aria-label={`${k} ${v} ${unit}`}>
        {v}
      </span>
    </span>
  );
}
