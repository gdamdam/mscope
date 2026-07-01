import { useEffect, useRef } from "react";
import { amplitudeHistogram, normalizeHistogram } from "../dsp/histogram";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";
import { backingStorePx, useDevicePixelRatio } from "./useCanvasDpr";

interface HistogramProps {
  /** Pull the latest time-domain samples for a channel from the engine. */
  getWaveform(channel: 0 | 1): Float32Array;
  /** Number of channels currently captured (1 = mono, 2 = stereo). */
  channelCount: number;
  /** Whether a live signal is flowing (drives the rAF loop). */
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
  /** Channel to display (0 = L/mono, 1 = R). Default 0. */
  channel?: 0 | 1;
}

const WIDTH = 600;
const HEIGHT = 120;
const PAD_L = 32; // left gutter for the count label
const PAD_B = 14; // bottom gutter for axis ticks
const BINS = 64;
const TEAL = "#5fb0c8";
const GRID = "#232a2e";
const LABEL = "#6b757c";
const BG = "#1c2023";

/**
 * Amplitude (sample-value) histogram over [-1, +1]. Diagnostic reads:
 * edge spikes = clipping, an off-center peak = DC bias, gaps = quantization.
 */
export function Histogram({
  getWaveform,
  channelCount: _channelCount,
  active,
  frozen = false,
  channel = 0,
}: HistogramProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();
  const plotW = WIDTH - PAD_L;
  const plotH = HEIGHT - PAD_B;

  const draw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Backing store is dpr-scaled; keep all drawing in logical coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = "9px ui-monospace, monospace";

    // Baseline along the x-axis.
    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(PAD_L, plotH + 0.5);
    ctx.lineTo(WIDTH, plotH + 0.5);
    ctx.stroke();

    // Amplitude axis ticks at -1, 0, +1 spanning the plot width.
    ctx.fillStyle = LABEL;
    ctx.textBaseline = "top";
    const ticks: Array<[number, string]> = [
      [-1, "-1"],
      [0, "0"],
      [1, "+1"],
    ];
    for (const [amp, text] of ticks) {
      const x = PAD_L + ((amp + 1) / 2) * plotW;
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, plotH);
      ctx.lineTo(x + 0.5, plotH + 4);
      ctx.stroke();
      ctx.textAlign = amp < 0 ? "left" : amp > 0 ? "right" : "center";
      ctx.fillText(text, x, plotH + 5);
    }

    const data = getWaveform(channel);
    if (data && data.length > 0) {
      const counts = amplitudeHistogram(data, BINS);
      const heights = normalizeHistogram(counts);
      const barW = plotW / BINS;

      ctx.globalAlpha = frozen ? 0.5 : 1;
      ctx.fillStyle = TEAL;
      for (let i = 0; i < BINS; i++) {
        const h = heights[i] * (plotH - 1);
        if (h <= 0) continue;
        const x = PAD_L + i * barW;
        // Sub-pixel gap keeps adjacent bars visually distinct.
        ctx.fillRect(x + 0.5, plotH - h, Math.max(1, barW - 1), h);
      }
      ctx.globalAlpha = 1;
    }

    if (frozen) drawFrozenBadge(ctx, PAD_L);
  };

  // Redraw on the rAF loop while active; static single draw under reduced motion.
  useScopeDraw(draw, active, [frozen, channel, dpr]);

  // Also draw once on mount so the cleared view is correct.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel" aria-label="Amplitude histogram">
      <p className="panel__title">Amplitude histogram</p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={backingStorePx(WIDTH, dpr)}
          height={backingStorePx(HEIGHT, dpr)}
          role="img"
          aria-label="Amplitude histogram of sample values over [-1, +1]"
        />
      </div>
    </div>
  );
}
