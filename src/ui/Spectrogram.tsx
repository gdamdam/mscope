import { useEffect, useRef } from "react";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";
import { backingStorePx, useDevicePixelRatio } from "./useCanvasDpr";

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

/** Width of one waterfall column in device pixels (one column = 1 logical px). */
// eslint-disable-next-line react-refresh/only-export-components -- exported for tests
export function columnDevicePx(dpr: number): number {
  return Math.max(1, Math.round(dpr));
}

/**
 * Nearest FFT bin for frequency `f`: bin i is centred at i·nyquist/bins (see
 * binToFrequency), so the inverse is round(f/nyquist·bins). Clamped into
 * [1, bins-1] — bin 0 (DC) is skipped, matching Spectrum's trace.
 */
// eslint-disable-next-line react-refresh/only-export-components -- exported for tests
export function freqToBinIndex(f: number, nyquist: number, bins: number): number {
  const bin = Math.round((f / nyquist) * bins);
  return Math.max(1, Math.min(bins - 1, bin));
}

/** Scrolling spectrogram (waterfall): channel-0 magnitude over time, with a
 *  log-frequency Y axis and a perceptual dB colour ramp. */
export function Spectrogram({
  getSpectrum,
  sampleRate,
  active,
  frozen = false,
}: SpectrogramProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const nyquist = sr / 2;
  const w = backingStorePx(WIDTH, dpr);
  const h = backingStorePx(HEIGHT, dpr);
  // Waterfall history lives in an offscreen canvas (device pixels). Each draw
  // blits it to the visible canvas; only animated frames scroll + append, so
  // one-shot repaints (mount, freeze, dep change) never corrupt the history.
  const offRef = useRef<HTMLCanvasElement | null>(null);

  const getOffscreenCtx = (): CanvasRenderingContext2D | null => {
    let off = offRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offRef.current = off;
    }
    if (off.width !== w || off.height !== h) {
      // Resizing (dpr change) resets the bitmap; restart from background.
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (octx) {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.fillStyle = BG;
        octx.fillRect(0, 0, w, h);
      }
    }
    return off.getContext("2d");
  };

  const draw = (animating = false): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const octx = getOffscreenCtx();
    const off = offRef.current;
    if (!octx || !off) return;

    if (animating && !frozen) {
      const spec = getSpectrum(0);
      if (spec && spec.length > 0) {
        // Advance: scroll history left one column, all in device pixels under
        // an identity transform (drawImage of the dpr-scaled backing store).
        const col = columnDevicePx(dpr);
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.imageSmoothingEnabled = false;
        octx.drawImage(off, -col, 0);
        octx.fillStyle = BG;
        octx.fillRect(w - col, 0, col, h);
        const bins = spec.length;
        // Walk each device row top→bottom, mapping y to a log frequency, then
        // sampling the nearest bin's dB so the column matches Spectrum's axis.
        for (let y = 0; y < h; y++) {
          const f = yToFreq(y, nyquist, h);
          const db = spec[freqToBinIndex(f, nyquist, bins)];
          const t = (clampDb(db) - DB_MIN) / (DB_MAX - DB_MIN);
          octx.fillStyle = rampColor(t, 1);
          octx.fillRect(w - col, y, col, 1);
        }
      }
    }

    // Repaint: blit the history 1:1 in device pixels (dimmed when frozen).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = frozen ? 0.5 : 1;
    ctx.drawImage(off, 0, 0);
    ctx.globalAlpha = 1;

    if (frozen) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // badge is in logical coords
      drawFrozenBadge(ctx);
    }
  };

  useScopeDraw(draw, active, [sampleRate, frozen, dpr]);
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
          width={w}
          height={h}
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
 *  (top), y=height is F_MIN (bottom), spaced logarithmically. */
function yToFreq(y: number, fMax: number, height: number): number {
  const t = 1 - y / height; // 0 at bottom (F_MIN), 1 at top (Nyquist)
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
