import { useEffect, useRef } from "react";
import type { ScopeHistory } from "../analysis/derived";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";

interface LoudnessHistoryProps {
  /** Rolling loudness/level time-series, newest last. */
  history: ScopeHistory;
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
}

const WIDTH = 600;
const HEIGHT = 176;
const PAD_L = 30; // left gutter for LUFS labels
const PAD_B = 16; // bottom gutter for legend
const PLOT_W = WIDTH - PAD_L;
const PLOT_H = HEIGHT - PAD_B;
const BG = "#1c2023";
const GRID = "#232a2e";
const LABEL = "#6b757c";
const MOMENTARY = "#5fb0c8"; // M — same family as Spectrum trace
const SHORT_TERM = "#c89a5f"; // S — warm contrast
const PEAK = "#3a4248"; // faint dBFS context
const RMS = "#2f3a40";
const TARGET = "#4a5560"; // reference loudness target line
/** LUFS axis range; gridlines every 10 LU. */
const LUFS_MIN = -40;
const LUFS_MAX = 0;
const LUFS_STEP = 10;
/** Streaming reference target (e.g. -14 LUFS). */
const TARGET_LUFS = -14;

/**
 * Scrolling loudness/level history: momentary + short-term LUFS lines on a LUFS
 * scale, with faint peak/RMS (dBFS) context and a reference target line.
 * Oldest sample at the left edge, newest at the right.
 */
export function LoudnessHistory({
  history,
  active,
  frozen = false,
}: LoudnessHistoryProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = "9px ui-monospace, monospace";

    // LUFS gridlines + left labels every 10 LU.
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let lufs = LUFS_MIN; lufs <= LUFS_MAX; lufs += LUFS_STEP) {
      const y = lufsToY(lufs);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
      ctx.fillStyle = LABEL;
      ctx.fillText(String(lufs), PAD_L - 4, y);
    }

    // Reference target line (dashed) so users can sight against -14 LUFS etc.
    const targetY = lufsToY(TARGET_LUFS);
    ctx.strokeStyle = TARGET;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_L, targetY);
    ctx.lineTo(WIDTH, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = LABEL;
    ctx.textAlign = "left";
    ctx.fillText(`${TARGET_LUFS}`, PAD_L + 3, targetY - 6);

    ctx.globalAlpha = frozen ? 0.5 : 1;

    // Faint dBFS context first, so LUFS lines read on top.
    drawSeries(ctx, history.peakDb, PEAK, 1);
    drawSeries(ctx, history.rmsDb, RMS, 1);
    // Primary LUFS series.
    drawSeries(ctx, history.shortTermLufs, SHORT_TERM, 1.25);
    drawSeries(ctx, history.momentaryLufs, MOMENTARY, 1.25);

    ctx.globalAlpha = 1;

    // Legend (M / S) in the bottom gutter.
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = MOMENTARY;
    ctx.fillText("M", PAD_L + 4, PLOT_H + 3);
    ctx.fillStyle = SHORT_TERM;
    ctx.fillText("S", PAD_L + 22, PLOT_H + 3);

    if (frozen) drawFrozenBadge(ctx, PAD_L);
  };

  useScopeDraw(draw, active, [frozen, history]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel" aria-label="Loudness history">
      <p className="panel__title">Loudness history · LUFS · M / S</p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Loudness history: momentary and short-term LUFS over time"
        />
      </div>
    </div>
  );
}

/** Plot one LUFS/dBFS series across the plot width; oldest left, newest right. */
function drawSeries(
  ctx: CanvasRenderingContext2D,
  series: readonly number[],
  color: string,
  lineWidth: number,
): void {
  const n = series.length;
  if (n === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  // With a single sample, span avoids a divide-by-zero and draws a flat tick.
  const span = n > 1 ? n - 1 : 1;
  for (let i = 0; i < n; i++) {
    const x = PAD_L + (i / span) * PLOT_W;
    const y = lufsToY(series[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function lufsToY(lufs: number): number {
  const clamped = Math.max(LUFS_MIN, Math.min(LUFS_MAX, lufs));
  const t = (clamped - LUFS_MIN) / (LUFS_MAX - LUFS_MIN); // 0 at floor, 1 at top
  return PLOT_H - t * PLOT_H;
}
