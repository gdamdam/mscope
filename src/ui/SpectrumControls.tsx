import { Select } from "./Select";

interface SpectrumControlsProps {
  /** Spectral tilt in dB/oct (pivot 1 kHz); 0 = flat dBFS. */
  tilt: number;
  onTilt(v: number): void;
  /** Whether the per-bin peak-hold overlay is shown. */
  peakHold: boolean;
  onPeakHold(v: boolean): void;
}

/** Tilt slopes offered in the dropdown. 4.5 dB/oct makes pink noise read flat. */
const TILT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Flat (dBFS)" },
  { value: 3, label: "+3 dB/oct" },
  { value: 4.5, label: "+4.5 dB/oct (pink)" },
];

/**
 * Visual controls for the spectrum: a tilt slope <select> and a peak-hold
 * toggle. Tilt rotates the trace about 1 kHz so broadband content reads flat;
 * peak-hold draws a faint running-max overlay. Display-only — never analysis.
 */
export function SpectrumControls({
  tilt,
  onTilt,
  peakHold,
  onPeakHold,
}: SpectrumControlsProps): JSX.Element {
  return (
    <div className="panel" aria-label="Spectrum controls">
      <p className="panel__title">Spectrum</p>
      <div className="row">
        <label htmlFor="spectrum-tilt">Tilt</label>
        <Select
          id="spectrum-tilt"
          triggerClassName="btn"
          value={tilt}
          options={TILT_OPTIONS}
          onChange={onTilt}
          ariaLabel="Spectrum tilt"
        />
        <button
          type="button"
          className="btn"
          onClick={() => onPeakHold(!peakHold)}
          aria-pressed={peakHold}
          aria-label="Toggle peak hold"
        >
          {peakHold ? "Peak hold: on" : "Peak hold: off"}
        </button>
      </div>
    </div>
  );
}
