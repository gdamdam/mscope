interface SoloControlProps {
  /** Soloed channel: 0 (L), 1 (R), or "both". */
  value: 0 | 1 | "both";
  onChange(v: 0 | 1 | "both"): void;
  /** Number of input channels; L/R solo is meaningless when mono (< 2). */
  channelCount: number;
}

/**
 * Channel solo selector (L / R / Both). With a mono source there is no second
 * channel, so the L/R buttons are disabled and "Both" is the only valid choice.
 */
export function SoloControl({
  value,
  onChange,
  channelCount,
}: SoloControlProps): JSX.Element {
  const mono = channelCount < 2;

  return (
    <div className="panel" role="group" aria-label="Solo">
      <p className="panel__title">Solo</p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => onChange(0)}
          disabled={mono}
          aria-pressed={value === 0}
          aria-label="Solo left channel"
        >
          L
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onChange(1)}
          disabled={mono}
          aria-pressed={value === 1}
          aria-label="Solo right channel"
        >
          R
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onChange("both")}
          aria-pressed={value === "both"}
          aria-label="Both channels"
        >
          Both
        </button>
      </div>
    </div>
  );
}
