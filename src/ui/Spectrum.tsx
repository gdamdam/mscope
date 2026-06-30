import { useEffect, useRef } from "react";
import { binToFrequency } from "../audio/analysis/analyser";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";

interface SpectrumProps {
  /** Pull the latest dB magnitude spectrum for a channel from the engine. */
  getSpectrum(channel: 0 | 1): Float32Array;
  /** Sample rate (Hz) for axis labelling; 0 until known. */
  sampleRate: number;
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
}

const WIDTH = 600;
const HEIGHT = 176;
const PAD_L = 30; // left gutter for dB labels
const PAD_B = 16; // bottom gutter for Hz labels
const PLOT_W = WIDTH - PAD_L;
const PLOT_H = HEIGHT - PAD_B;
const BG = "#1c2023";
const GRID = "#232a2e";
const LABEL = "#6b757c";
const TRACE = "#5fb0c8";
const DB_MIN = -100;
const DB_MAX = 0;
const F_MIN = 20;
const HZ_TICKS = [100, 1000, 10000];

/** Magnitude spectrum (channel 0) on a log-frequency axis, dBFS vertical. */
export function Spectrum({
  getSpectrum,
  sampleRate,
  active,
  frozen = false,
}: SpectrumProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const nyquist = sr / 2;

  const draw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = "9px ui-monospace, monospace";

    // dB gridlines + left labels every 20 dB.
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let db = DB_MIN; db <= DB_MAX; db += 20) {
      const y = dbToY(db);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
      ctx.fillStyle = LABEL;
      ctx.fillText(String(db), PAD_L - 4, y);
    }

    // Frequency gridlines + bottom labels (100 Hz, 1k, 10k).
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const f of HZ_TICKS) {
      if (f >= nyquist) continue;
      const x = freqToX(f, nyquist);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, PLOT_H);
      ctx.stroke();
      ctx.fillStyle = LABEL;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x, PLOT_H + 3);
    }

    const spec = getSpectrum(0);
    if (spec && spec.length > 0) {
      const bins = spec.length;
      const fftSize = bins * 2;
      ctx.globalAlpha = frozen ? 0.5 : 1;
      ctx.strokeStyle = TRACE;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < bins; i++) {
        const f = binToFrequency(i, fftSize, sr);
        if (f < F_MIN) continue;
        const x = freqToX(f, nyquist);
        const y = dbToY(spec[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (frozen) drawFrozenBadge(ctx, PAD_L);
  };

  useScopeDraw(draw, active, [sampleRate, frozen]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel" aria-label="Spectrum">
      <p className="panel__title">Spectrum · 20 Hz–Nyquist · dBFS</p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Frequency-domain magnitude spectrum, channel 0"
        />
      </div>
    </div>
  );
}

function dbToY(db: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  const t = (clamped - DB_MIN) / (DB_MAX - DB_MIN); // 0 at floor, 1 at top
  return PLOT_H - t * PLOT_H;
}

function freqToX(f: number, fMax: number): number {
  const t =
    (Math.log10(f) - Math.log10(F_MIN)) /
    (Math.log10(fMax) - Math.log10(F_MIN));
  return PAD_L + Math.max(0, Math.min(1, t)) * PLOT_W;
}
