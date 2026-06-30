interface MonitorControlProps {
  /** Current monitor gain in [0,1]; 0 == muted. */
  gain: number;
  onChange(gain: number): void;
}

/**
 * Audible-monitor control. MUTED by default (gain 0) to avoid feedback/doubling.
 * The toggle flips between muted and the last non-zero gain (or a safe default).
 * Monitoring is purely audible — it never touches the analysis branch.
 */
export function MonitorControl({ gain, onChange }: MonitorControlProps): JSX.Element {
  const enabled = gain > 0;

  const toggle = (): void => {
    // Toggle on to a conservative 0.5; toggle off to muted.
    onChange(enabled ? 0 : 0.5);
  };

  return (
    <div className="panel" aria-label="Monitor">
      <p className="panel__title">Monitor</p>
      <div className="slider">
        <button
          type="button"
          className="btn"
          onClick={toggle}
          aria-pressed={enabled}
          aria-label={enabled ? "Mute monitor" : "Unmute monitor"}
        >
          {enabled ? "On" : "Muted"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={gain}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Monitor gain"
          aria-valuetext={`${Math.round(gain * 100)} percent`}
        />
        <span className="stat__v stat__v--num" aria-hidden="true">
          {Math.round(gain * 100)}%
        </span>
      </div>
      <p className="panel__note">monitor only — does not affect analysis</p>
    </div>
  );
}
