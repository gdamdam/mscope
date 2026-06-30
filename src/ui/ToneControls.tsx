import { useId, useState } from "react";
import type { GeneratorOptions } from "../audio/input";
import type { GeneratorType } from "../audio/input/GeneratorInput";

interface ToneControlsProps {
  /** Start a synthetic reference signal with the chosen options. */
  onStart(opts: GeneratorOptions): void;
  /** True while an acquisition is in flight (disables the controls). */
  busy?: boolean;
}

const DEFAULT_FREQUENCY = 1000;

/**
 * Reference-signal source controls: pick sine/white/pink and (for sine) a
 * frequency, then Generate. Frequency is only meaningful for a sine tone, so we
 * surface it only then to keep the control set legible.
 */
export function ToneControls({ onStart, busy = false }: ToneControlsProps): JSX.Element {
  const [type, setType] = useState<GeneratorType>("sine");
  const [frequency, setFrequency] = useState(DEFAULT_FREQUENCY);
  const typeId = useId();
  const freqId = useId();

  const generate = (): void => {
    onStart(type === "sine" ? { type, frequency } : { type });
  };

  return (
    <div className="panel" role="group" aria-label="Reference signal">
      <p className="panel__title">Reference signal</p>
      <div className="row">
        <label htmlFor={typeId} className="sr-only">
          Signal type
        </label>
        <select
          id={typeId}
          className="btn"
          value={type}
          disabled={busy}
          onChange={(e) => setType(e.target.value as GeneratorType)}
        >
          <option value="sine">Sine</option>
          <option value="white">White noise</option>
          <option value="pink">Pink noise</option>
        </select>
        {type === "sine" && (
          <>
            <label htmlFor={freqId} className="sr-only">
              Frequency (Hz)
            </label>
            <input
              id={freqId}
              type="number"
              className="btn"
              min={20}
              max={20000}
              value={frequency}
              disabled={busy}
              aria-label="Frequency in hertz"
              onChange={(e) => setFrequency(e.target.valueAsNumber)}
            />
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={generate}
          disabled={busy}
          aria-label="Generate reference signal"
        >
          Generate
        </button>
      </div>
    </div>
  );
}
