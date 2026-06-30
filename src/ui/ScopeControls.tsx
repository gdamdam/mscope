interface ScopeControlsProps {
  /** Oscilloscope trace brightness in [0,1]. */
  brightness: number;
  /** Horizontal time-base zoom (>=1). */
  zoom: number;
  onBrightness(v: number): void;
  onZoom(v: number): void;
}

/**
 * Visual controls for the oscilloscope: trace brightness and time-base zoom.
 * Sliders only — no audio-reactive behaviour. Labels are tied to their inputs
 * so the controls are operable by keyboard and announced by assistive tech.
 */
export function ScopeControls({
  brightness,
  zoom,
  onBrightness,
  onZoom,
}: ScopeControlsProps): JSX.Element {
  return (
    <div className="panel" aria-label="Oscilloscope controls">
      <p className="panel__title">Scope</p>
      <div className="slider">
        <label htmlFor="scope-brightness">Brightness</label>
        <input
          id="scope-brightness"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={brightness}
          onChange={(e) => onBrightness(Number(e.target.value))}
        />
        <span className="note" aria-hidden="true">
          {Math.round(brightness * 100)}%
        </span>
      </div>
      <div className="slider" style={{ marginTop: 8 }}>
        <label htmlFor="scope-zoom">Zoom</label>
        <input
          id="scope-zoom"
          type="range"
          min={1}
          max={16}
          step={1}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
        />
        <span className="note" aria-hidden="true">
          {zoom}×
        </span>
      </div>
    </div>
  );
}
