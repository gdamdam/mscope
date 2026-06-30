import type { StereoMetrics } from "../audio/analysis/metrics";
import { fmtSigned } from "./format";

interface CorrelationProps {
  /** Stereo metrics, or null for a mono source. */
  stereo: StereoMetrics | null;
}

/** Stereo correlation (−1..+1) and L/R balance, with a small phase scale. */
export function Correlation({ stereo }: CorrelationProps): JSX.Element {
  return (
    <div className="panel" aria-label="Stereo correlation">
      <p className="panel__title">Correlation</p>
      {stereo === null ? (
        <p className="note">Mono source — no stereo correlation.</p>
      ) : (
        <div className="corr">
          <CorrBar
            label="correlation"
            value={stereo.correlation}
            ariaLabel={`Correlation ${fmtSigned(stereo.correlation)}`}
          />
          <CorrBar
            label="balance"
            value={stereo.balance}
            ariaLabel={`Balance ${fmtSigned(stereo.balance)} (negative left, positive right)`}
          />
          <p className="panel__note">
            +1 mono/in-phase · 0 wide · −1 out-of-phase
          </p>
        </div>
      )}
    </div>
  );
}

function CorrBar({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: number;
  ariaLabel: string;
}): JSX.Element {
  const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  // Map [-1,1] → bar fill anchored at center.
  const halfPct = (Math.abs(v) / 1) * 50;
  const left = v >= 0 ? 50 : 50 - halfPct;
  return (
    <div role="meter" aria-label={ariaLabel} aria-valuemin={-1} aria-valuemax={1} aria-valuenow={v}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="stat__k">{label}</span>
        <span className="stat__v stat__v--num">{fmtSigned(value)}</span>
      </div>
      <div className="corr__bar" aria-hidden="true">
        <div className="corr__mid" />
        <div
          className="corr__fill"
          style={{ left: `${left}%`, width: `${halfPct}%` }}
        />
      </div>
    </div>
  );
}
