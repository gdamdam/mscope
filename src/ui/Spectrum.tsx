import { useEffect, useRef } from "react";
import { binToFrequency, frequencyToBin } from "../audio/analysis/analyser";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";
import { noteName } from "./notes";

interface SpectrumProps {
  /** Pull the latest dB magnitude spectrum for a channel from the engine. */
  getSpectrum(channel: 0 | 1): Float32Array;
  /** Sample rate (Hz) for axis labelling; 0 until known. */
  sampleRate: number;
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
  /** Channel to display (0 = L/mono, 1 = R). Default 0. */
  channel?: 0 | 1;
  /** Spectral tilt in dB/oct about a 1 kHz pivot; pink noise reads flat at 4.5. */
  tiltDbPerOct?: number;
  /** Draw a faint per-bin running-max overlay above the live trace. */
  peakHold?: boolean;
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
const PEAK = "#3a6a78"; // faint variant of TRACE for the held curve
const CURSOR = "#c8b05f";
const DB_MIN = -100;
const DB_MAX = 0;
const F_MIN = 20;
const TILT_PIVOT = 1000; // 1 kHz
const HZ_TICKS = [100, 1000, 10000];
/** Magnitude spectrum (channel 0) on a log-frequency axis, dBFS vertical. */
export function Spectrum({
  getSpectrum,
  sampleRate,
  active,
  frozen = false,
  channel = 0,
  tiltDbPerOct = 0,
  peakHold = false,
}: SpectrumProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const nyquist = sr / 2;

  // Per-bin running max of the *tilted, displayed* dB. Reset when the curve
  // shape changes (peak-hold turned off, bin count / sampleRate changes).
  const peakRef = useRef<Float32Array | null>(null);
  // Cursor x in canvas pixels, or null when the pointer is off the plot.
  const cursorXRef = useRef<number | null>(null);

  // Reset the held curve when peak-hold is disabled or the spectrum geometry
  // changes; the next draw repopulates it lazily.
  useEffect(() => {
    peakRef.current = null;
  }, [peakHold, sampleRate, channel]);

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

    const spec = getSpectrum(channel);
    if (spec && spec.length > 0) {
      const bins = spec.length;
      const fftSize = bins * 2;

      // Reset the held curve if the bin count changed between frames.
      if (peakHold) {
        if (!peakRef.current || peakRef.current.length !== bins) {
          peakRef.current = new Float32Array(bins).fill(DB_MIN);
        }
      }
      const peak = peakHold ? peakRef.current : null;

      // Live trace (tilt-corrected).
      ctx.globalAlpha = frozen ? 0.5 : 1;
      ctx.strokeStyle = TRACE;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < bins; i++) {
        const f = binToFrequency(i, fftSize, sr);
        if (f < F_MIN) continue;
        const db = tiltedDb(spec[i], f, tiltDbPerOct);
        if (peak) peak[i] = Math.max(peak[i], db);
        const x = freqToX(f, nyquist);
        const y = dbToY(db);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Peak-hold overlay (faint, above the live trace).
      if (peak) {
        ctx.strokeStyle = PEAK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let pStarted = false;
        for (let i = 1; i < bins; i++) {
          const f = binToFrequency(i, fftSize, sr);
          if (f < F_MIN) continue;
          const x = freqToX(f, nyquist);
          const y = dbToY(peak[i]);
          if (!pStarted) {
            ctx.moveTo(x, y);
            pStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Cursor crosshair + readout (frequency / nearest note / dB at bin).
      const cx = cursorXRef.current;
      if (cx !== null && cx >= PAD_L && cx <= WIDTH) {
        const f = xToFreq(cx, nyquist);
        const bin = Math.min(bins - 1, Math.max(1, frequencyToBin(f, fftSize, sr)));
        const db = tiltedDb(spec[bin], binToFrequency(bin, fftSize, sr), tiltDbPerOct);
        drawCursor(ctx, cx, f, db);
      }
    }

    if (frozen) drawFrozenBadge(ctx, PAD_L);
  };

  useScopeDraw(draw, active, [
    sampleRate,
    frozen,
    channel,
    tiltDbPerOct,
    peakHold,
  ]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Map client x into canvas pixel space (canvas may be CSS-scaled).
    const scale = rect.width > 0 ? WIDTH / rect.width : 1;
    cursorXRef.current = (e.clientX - rect.left) * scale;
    // When the rAF loop is idle, redraw immediately so the cursor tracks.
    if (!active) draw();
  };

  const onMouseLeave = (): void => {
    cursorXRef.current = null;
    if (!active) draw();
  };

  const tiltLabel =
    tiltDbPerOct !== 0
      ? `${tiltDbPerOct > 0 ? "+" : ""}${tiltDbPerOct} dB/oct`
      : "dBFS";

  return (
    <div className="panel" aria-label="Spectrum">
      <p className="panel__title">{`Spectrum · 20 Hz–Nyquist · ${tiltLabel}`}</p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label={`Frequency-domain magnitude spectrum, channel ${channel}`}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        />
      </div>
    </div>
  );
}

/** Apply spectral tilt about the 1 kHz pivot, clamped to the dB range. */
function tiltedDb(db: number, f: number, tiltDbPerOct: number): number {
  const adjusted = db + tiltDbPerOct * Math.log2(f / TILT_PIVOT);
  return Math.max(DB_MIN, Math.min(DB_MAX, adjusted));
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

/** Inverse of {@link freqToX}: canvas x (pixels) back to frequency (Hz). */
function xToFreq(x: number, fMax: number): number {
  const t = Math.max(0, Math.min(1, (x - PAD_L) / PLOT_W));
  const logF = Math.log10(F_MIN) + t * (Math.log10(fMax) - Math.log10(F_MIN));
  return 10 ** logF;
}

/** Vertical crosshair plus a small readout box at the cursor. */
function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  freq: number,
  db: number,
): void {
  ctx.save();
  ctx.strokeStyle = CURSOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, PLOT_H);
  ctx.stroke();

  const fLabel =
    freq >= 1000 ? `${(freq / 1000).toFixed(2)}k` : `${Math.round(freq)}`;
  const lines = [`${fLabel} Hz`, noteName(freq), `${db.toFixed(1)} dB`];
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const boxW = 56;
  const boxH = lines.length * 11 + 6;
  // Flip the box to the left edge of the cursor near the right margin.
  const boxX = x + boxW + 4 > WIDTH ? x - boxW - 4 : x + 4;
  const boxY = 4;
  ctx.fillStyle = "rgba(20,24,26,0.85)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = CURSOR;
  lines.forEach((line, i) => {
    ctx.fillText(line, boxX + 4, boxY + 3 + i * 11);
  });
  ctx.restore();
}
