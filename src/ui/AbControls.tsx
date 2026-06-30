interface AbControlsProps {
  /** Whether an "A" snapshot is currently held for comparison. */
  hasSnapshot: boolean;
  onSnapshot(): void;
  onClear(): void;
}

/**
 * A/B comparison controls: hold the current measurement as "A", then clear it.
 * Clear is disabled until something is held.
 */
export function AbControls({
  hasSnapshot,
  onSnapshot,
  onClear,
}: AbControlsProps): JSX.Element {
  return (
    <div className="panel" role="group" aria-label="A/B compare">
      <p className="panel__title">A/B</p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={onSnapshot}
          aria-label="Hold A"
        >
          Hold A
        </button>
        <button
          type="button"
          className="btn"
          onClick={onClear}
          disabled={!hasSnapshot}
          aria-label="Clear A"
        >
          Clear A
        </button>
      </div>
      <p className="panel__note">{hasSnapshot ? "A held" : "no A held"}</p>
    </div>
  );
}
