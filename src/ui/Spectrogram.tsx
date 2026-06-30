import { useEffect, useRef } from "react";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";

interface SpectrogramProps {
  /** Pull the latest dB magnitude spectrum for a channel from the engine. */
  getSpectrum(channel: 0 | 1): Float32Array;
  /** Sample rate (Hz) for the log-frequency axis; 0 until known. */
  sampleRate: number;
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
}

const WIDTH = 600;
const HEIGHT = 176;
const BG = "#1c2023";
const DB_MIN = -100;
const DB_MAX = 0;
const F_MIN = 20;

// Perceptual ramp: dark → teal → amber → white. Each stop is [t, r, g, b],
// with t the normalised dB magnitude (0 at floor, 1 at full scale).
const RAMP: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 18, 22, 26], // near-background dark
  [0.45, 0x5f, 0xb0, 0xc8], // teal #5fb0c8 (ch0 trace colour)
  [0.78, 0xc8, 0x97, 0x5f], // amber #c8975f
  [1, 255, 255, 255], // white
];

/** Scrolling spectrogram (waterfall): channel-0 magnitude over time, with a
 *  log-frequency Y axis and a perceptual dB colour ramp. */
export function Spectrogram({
  getSpectrum,
  sampleRate,
  active,
  frozen = false,
}: SpectrogramProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const nyquist = sr / 2;
  // Track whether the canvas has any content yet, so the first frame paints the
  // background instead of scrolling garbage in from an empty buffer.
  const paintedRef = useRef(false);

  const draw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!paintedRef.current) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      paintedRef.current = true;
    }

    // Scroll existing content left by 1px; the freed rightmost column is redrawn.
    ctx.drawImage(canvas, -1, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(WIDTH - 1, 0, 1, HEIGHT);

    const spec = getSpectrum(0);
    const x = WIDTH - 1;
    if (spec && spec.length > 0) {
      const bins = spec.length;
      // Walk each output row (pixel) top→bottom, mapping y to a log frequency,
      // then sampling the nearest bin's dB so the column matches Spectrum's axis.
      for (let y = 0; y < HEIGHT; y++) {
        const f = yToFreq(y, nyquist);
        const bin = Math.round((f / nyquist) * (bins - 1));
        const db = spec[Math.max(1, Math.min(bins - 1, bin))];
        const t = (clampDb(db) - DB_MIN) / (DB_MAX - DB_MIN);
        ctx.fillStyle = rampColor(t, frozen ? 0.5 : 1);
        ctx.fillRect(x, y, 1, 1);
      }
    }

    if (frozen) drawFrozenBadge(ctx);
  };

  useScopeDraw(draw, active, [sampleRate, frozen]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel scope__wide" aria-label="Spectrogram">
      <p className="panel__title">Spectrogram · 20 Hz–Nyquist</p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Scrolling spectrogram waterfall, channel 0"
        />
      </div>
    </div>
  );
}

function clampDb(db: number): number {
  return Math.max(DB_MIN, Math.min(DB_MAX, db));
}

/** Inverse of Spectrum's freqToX, applied to the vertical axis: y=0 is Nyquist
 *  (top), y=HEIGHT is F_MIN (bottom), spaced logarithmically. */
function yToFreq(y: number, fMax: number): number {
  const t = 1 - y / HEIGHT; // 0 at bottom (F_MIN), 1 at top (Nyquist)
  const logMin = Math.log10(F_MIN);
  const logMax = Math.log10(fMax);
  return Math.pow(10, logMin + t * (logMax - logMin));
}

/** Sample the perceptual ramp at normalised value t∈[0,1] → "rgba(...)". */
function rampColor(t: number, alpha: number): string {
  const v = Math.max(0, Math.min(1, t));
  let lo = RAMP[0];
  let hi = RAMP[RAMP.length - 1];
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i][0]) {
      lo = RAMP[i - 1];
      hi = RAMP[i];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const k = (v - lo[0]) / span;
  const r = Math.round(lo[1] + k * (hi[1] - lo[1]));
  const g = Math.round(lo[2] + k * (hi[2] - lo[2]));
  const b = Math.round(lo[3] + k * (hi[3] - lo[3]));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
