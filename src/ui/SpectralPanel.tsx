import type { SpectralMetrics } from "../analysis/derived";

interface SpectralPanelProps {
  spectral: SpectralMetrics | null;
}

/** Compact Hz readout: 1.2k for ≥1000, whole Hz below. */
function fmtHz(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toString();
}

/**
 * Spectral descriptors readout (centroid / flatness / dominant). Consumes the
 * main-thread-derived SpectralMetrics type as a prop; renders a dash per stat
 * before metrics are available.
 */
export function SpectralPanel({ spectral }: SpectralPanelProps): JSX.Element {
  return (
    <div className="panel" aria-label="Spectral">
      <p className="panel__title">Spectral</p>
      <div className="spectral">
        <Stat
          k="centroid"
          v={spectral ? fmtHz(spectral.centroidHz) : "—"}
          unit="Hz"
          note="brightness"
        />
        <Stat
          k="flatness"
          v={spectral ? spectral.flatness.toFixed(2) : "—"}
          unit="0–1"
          note="1≈noise · 0≈tonal"
        />
        <Stat
          k="dominant"
          v={spectral ? fmtHz(spectral.dominantHz) : "—"}
          unit="Hz"
          note="strongest bin"
        />
      </div>
    </div>
  );
}

function Stat({
  k,
  v,
  unit,
  note,
}: {
  k: string;
  v: string;
  unit: string;
  note: string;
}): JSX.Element {
  return (
    <span className="stat">
      <span className="stat__k">
        {k} <span aria-hidden="true">{unit}</span>
      </span>
      <span className="stat__v stat__v--num" aria-label={`${k} ${v} ${unit}`}>
        {v}
      </span>
      <span className="stat__note">{note}</span>
    </span>
  );
}
