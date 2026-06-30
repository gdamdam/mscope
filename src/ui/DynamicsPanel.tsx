import type { DynamicsMetrics } from "../analysis/derived";
import { fmtDb } from "./format";

interface DynamicsPanelProps {
  dynamics: DynamicsMetrics | null;
}

/**
 * Dynamics readout: per-channel crest factor plus the loudness-dynamics trio
 * (PLR, LRA, noise floor). Consumes the main-thread-derived DynamicsMetrics
 * type, decoupled from the DSP/hook implementation. Renders "—" when null.
 *
 * Crest channel labels follow Meters: L/R for stereo, M for a single channel.
 */
export function DynamicsPanel({ dynamics }: DynamicsPanelProps): JSX.Element {
  const crest = dynamics?.crestDb ?? [];
  const stereo = crest.length === 2;

  return (
    <div className="panel" aria-label="Dynamics">
      <p className="panel__title">Dynamics</p>
      <div className="dynamics">
        {crest.length === 0 ? (
          <Stat k="crest" v="—" unit="dB" />
        ) : (
          crest.map((c, i) => (
            <Stat
              key={i}
              k={`crest ${stereo ? (i === 0 ? "L" : "R") : "M"}`}
              v={fmtDb(c)}
              unit="dB"
            />
          ))
        )}
        <Stat k="PLR" v={dynamics ? fmtDb(dynamics.plrDb) : "—"} unit="dB" />
        <Stat k="LRA" v={dynamics ? fmtDb(dynamics.lra) : "—"} unit="LU" />
        <Stat
          k="noise floor"
          v={dynamics ? fmtDb(dynamics.noiseFloorDb) : "—"}
          unit="dBFS"
        />
      </div>
      <p className="panel__note">
        crest = peak − RMS · PLR peak-to-loudness · LRA EBU R128
      </p>
    </div>
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
