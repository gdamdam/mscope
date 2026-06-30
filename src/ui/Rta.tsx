import { useEffect, useRef } from "react";
import { bandEnergiesDb, dbSpectrumToLinear } from "../dsp/spectral";
import { THIRD_OCTAVE_CENTERS } from "../analysis/derived";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";

interface RtaProps {
  /** Pull the latest dB magnitude spectrum for a channel from the engine. */
  getSpectrum(channel: 0 | 1): Float32Array;
  /** Sample rate (Hz) for band binning; 0 until known. */
  sampleRate: number;
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
  /** Channel to display (0 = L/mono, 1 = R). Default 0. */
  channel?: 0 | 1;
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
const BAR = "#5fb0c8"; // teal, matches Spectrum trace
const DB_MIN = -100;
const DB_MAX = 0;
// Frequency ticks labelled under the bars at their band centre.
const HZ_TICKS = [100, 1000, 10000];

/** Real-time analyzer: 1/3-octave band energies (channel 0) as vertical bars. */
export function Rta({
  getSpectrum,
  sampleRate,
  active,
  frozen = false,
  channel = 0,
}: RtaProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sr = sampleRate > 0 ? sampleRate : 48000;

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

    const n = THIRD_OCTAVE_CENTERS.length;
    // Each band gets an equal-width column; small gap between bars.
    const slot = PLOT_W / n;
    const barW = Math.max(1, slot - 1);

    const dbSpec = getSpectrum(channel);
    if (dbSpec && dbSpec.length > 0) {
      const mag = dbSpectrumToLinear(dbSpec);
      const bands = bandEnergiesDb(
        mag,
        sr,
        dbSpec.length * 2,
        THIRD_OCTAVE_CENTERS,
      );
      ctx.globalAlpha = frozen ? 0.5 : 1;
      ctx.fillStyle = BAR;
      for (let c = 0; c < n; c++) {
        const x = PAD_L + c * slot;
        const yTop = dbToY(bands[c]);
        const h = PLOT_H - yTop;
        if (h > 0) ctx.fillRect(x, yTop, barW, h);
      }
      ctx.globalAlpha = 1;
    }

    // Frequency ticks at the closest band centre (drawn after bars).
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = LABEL;
    for (const f of HZ_TICKS) {
      const c = nearestBandIndex(f);
      if (c < 0) continue;
      const x = PAD_L + c * slot + slot / 2;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x, PLOT_H + 3);
    }

    if (frozen) drawFrozenBadge(ctx, PAD_L);
  };

  useScopeDraw(draw, active, [sampleRate, frozen, channel]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel" aria-label="RTA">
      <p className="panel__title">RTA · ⅓-octave</p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label={`Real-time analyzer, one-third-octave band energies, channel ${channel}`}
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

/** Index of the 1/3-octave centre nearest `f` (log distance), or -1 if none. */
function nearestBandIndex(f: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < THIRD_OCTAVE_CENTERS.length; i++) {
    const d = Math.abs(Math.log10(THIRD_OCTAVE_CENTERS[i]) - Math.log10(f));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
