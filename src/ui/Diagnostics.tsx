import type { MetricsSnapshot } from "../audio/analysis/metrics";

interface DiagnosticsProps {
  /** Latest metrics frame, or null before any signal. */
  metrics: MetricsSnapshot | null;
}

/** DC offset above this absolute level is worth flagging. */
const DC_WARN = 0.01;

/**
 * Signal-health diagnostics: DC offset, silence/low-signal, format, and the
 * CUMULATIVE clip count taken straight from the latest frame (the worklet's
 * running total — we never sum it ourselves).
 */
export function Diagnostics({ metrics }: DiagnosticsProps): JSX.Element {
  const dcMax = metrics
    ? Math.max(...metrics.channels.map((c) => Math.abs(c.dcOffset)), 0)
    : 0;
  const clipTotal = metrics
    ? metrics.channels.reduce((m, c) => Math.max(m, c.clipCount), 0)
    : 0;
  const silent = metrics?.signal.silent ?? false;
  const lowSignal = metrics?.signal.lowSignal ?? false;

  return (
    <div className="panel" aria-label="Diagnostics">
      <p className="panel__title">Diagnostics</p>
      <ul className="diag-list">
        <li>
          <span className="k">Sample rate</span>
          <span className="v">{metrics ? `${metrics.sampleRate} Hz` : "—"}</span>
        </li>
        <li>
          <span className="k">Channels</span>
          <span className="v">{metrics ? metrics.channelCount : "—"}</span>
        </li>
        <li>
          <span className="k">Max |DC offset|</span>
          <span className="v">{metrics ? dcMax.toFixed(4) : "—"}</span>
        </li>
        <li>
          <span className="k">Clipped samples (cumulative)</span>
          <span className="v">{metrics ? clipTotal : "—"}</span>
        </li>
      </ul>

      {dcMax > DC_WARN && (
        <p className="flag flag--warn" role="alert">
          DC offset detected ({dcMax.toFixed(4)}) — possible bias / coupling issue.
        </p>
      )}
      {silent && (
        <p className="flag flag--warn" role="status">
          Silence — no measurable signal.
        </p>
      )}
      {!silent && lowSignal && (
        <p className="flag flag--warn" role="status">
          Low signal — levels near the noise floor.
        </p>
      )}
    </div>
  );
}
