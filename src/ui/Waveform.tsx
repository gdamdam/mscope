import { useEffect, useRef } from "react";
import { downsampleWaveform } from "../audio/analysis/analyser";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";

interface WaveformProps {
  /** Pull the latest time-domain samples for a channel from the engine. */
  getWaveform(channel: 0 | 1): Float32Array;
  /** Number of channels currently captured (1 = mono, 2 = stereo). */
  channelCount: number;
  /** Whether a live signal is flowing (drives the rAF loop). */
  active: boolean;
  /** Sample rate (Hz) for the time-window label; 0 if unknown. */
  sampleRate?: number;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
}

const WIDTH = 600;
const ROW_H = 120;
const PAD_L = 32; // left gutter for the dBFS scale + channel label
const TRACE = ["#5fb0c8", "#c8975f"]; // ch0 cyan-teal, ch1 amber
const GRID = "#232a2e";
const GRID2 = "#2a3338"; // -6 dBFS guide lines
const LABEL = "#6b757c";
const BG = "#1c2023";
const HALF = 0.5; // amplitude 0.5 ≈ -6 dBFS

/** Stereo oscilloscope: one min/max envelope row per channel, dBFS-scaled. */
export function Waveform({
  getWaveform,
  channelCount,
  active,
  sampleRate = 0,
  frozen = false,
}: WaveformProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channels = Math.max(1, Math.min(2, channelCount || 1));
  const height = ROW_H * channels;
  const plotW = WIDTH - PAD_L;

  const draw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.font = "9px ui-monospace, monospace";

    for (let ch = 0; ch < channels; ch++) {
      const top = ch * ROW_H;
      const mid = top + ROW_H / 2;
      const amp = ROW_H / 2 - 2;

      // -6 dBFS guide lines (±0.5) then the bolder zero line.
      ctx.lineWidth = 1;
      ctx.strokeStyle = GRID2;
      for (const s of [-HALF, HALF]) {
        const y = mid - s * amp;
        ctx.beginPath();
        ctx.moveTo(PAD_L, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(PAD_L, mid);
      ctx.lineTo(WIDTH, mid);
      ctx.stroke();

      // Left-gutter dBFS labels (0 at full scale, -6 at half) + channel letter.
      ctx.fillStyle = LABEL;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("0", PAD_L - 4, top + 1);
      ctx.textBaseline = "middle";
      ctx.fillText("-6", PAD_L - 4, mid - HALF * amp);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = TRACE[ch] ?? TRACE[0];
      ctx.fillText(channels === 2 ? (ch === 0 ? "L" : "R") : "M", PAD_L + 2, top + 2);

      const data = getWaveform(ch as 0 | 1);
      if (!data || data.length === 0) continue;
      const { min, max } = downsampleWaveform(data, plotW);

      ctx.globalAlpha = frozen ? 0.5 : 1;
      ctx.strokeStyle = TRACE[ch] ?? TRACE[0];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < min.length; x++) {
        const yMax = mid - Math.max(-1, Math.min(1, max[x])) * amp;
        const yMin = mid - Math.max(-1, Math.min(1, min[x])) * amp;
        ctx.moveTo(PAD_L + x + 0.5, yMin);
        ctx.lineTo(PAD_L + x + 0.5, yMax);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Analysis-window duration (bottom-right), derived from the AnalyserNode size.
    const probe = getWaveform(0);
    if (sampleRate > 0 && probe && probe.length > 0) {
      const ms = (probe.length / sampleRate) * 1000;
      ctx.fillStyle = LABEL;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`~${ms.toFixed(0)} ms window`, WIDTH - 4, height - 2);
    }

    if (frozen) drawFrozenBadge(ctx, PAD_L);
  };

  // Redraw on the rAF loop while active; static single draw under reduced motion.
  useScopeDraw(draw, active, [channels, height, sampleRate, frozen]);

  // Also draw once on mount / when size changes so the cleared view is correct.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, height]);

  return (
    <div className="panel scope__wide" aria-label="Waveform">
      <p className="panel__title">
        Waveform · {channels === 2 ? "stereo" : "mono"} · dBFS
      </p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={height}
          role="img"
          aria-label={`Time-domain waveform, ${channels} channel${
            channels === 2 ? "s" : ""
          }`}
        />
      </div>
    </div>
  );
}
