import type { AnalyserConfig } from "../audio/engineTypes";
import { Select } from "./Select";

interface AnalyserControlsProps {
  config: AnalyserConfig;
  onChange(cfg: Partial<AnalyserConfig>): void;
}

/** Valid AnalyserNode fftSize values (powers of two, 32–32768 spec range). */
const FFT_SIZES = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768] as const;

/**
 * Runtime controls for the visual AnalyserNode: FFT resolution and smoothing.
 * The window function is fixed to Blackman by the Web Audio AnalyserNode and is
 * not adjustable, so we surface that as a note rather than a control.
 */
export function AnalyserControls({
  config,
  onChange,
}: AnalyserControlsProps): JSX.Element {
  return (
    <div className="panel" role="group" aria-label="Analyser">
      <p className="panel__title">Analyser</p>
      <div className="row">
        <label className="slider">
          <span>FFT size</span>
          <Select
            triggerClassName="btn"
            value={config.fftSize}
            options={FFT_SIZES.map((n) => ({ value: n, label: String(n) }))}
            onChange={(fftSize) => onChange({ fftSize })}
            ariaLabel="FFT size"
          />
        </label>
      </div>
      <div className="slider">
        <label htmlFor="analyser-smoothing">Smoothing</label>
        <input
          id="analyser-smoothing"
          type="range"
          min={0}
          max={0.95}
          step={0.05}
          value={config.smoothing}
          onChange={(e) => onChange({ smoothing: Number(e.target.value) })}
          aria-label="Smoothing"
          aria-valuetext={config.smoothing.toFixed(2)}
        />
        <span className="stat__v stat__v--num" aria-hidden="true">
          {config.smoothing.toFixed(2)}
        </span>
      </div>
      <p className="panel__note">window: Blackman (fixed by AnalyserNode)</p>
    </div>
  );
}
