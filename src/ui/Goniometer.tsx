import { useEffect, useRef } from "react";
import { useScopeDraw } from "./useAnimationFrame";
import { drawFrozenBadge } from "./canvasOverlay";

interface GoniometerProps {
  /** Pull the latest time-domain samples for a channel from the engine. */
  getWaveform(channel: 0 | 1): Float32Array;
  /** Number of channels currently captured (1 = mono, 2 = stereo). */
  channelCount: number;
  /** Whether a live signal is flowing (drives the rAF loop). */
  active: boolean;
  /** Hold + flag the last frame when the source has ended. */
  frozen?: boolean;
}

const SIZE = 260; // square canvas edge
const PAD = 18; // inner gutter so axis labels clear the plot edge
const TRACE = "#5fb0c8"; // teal points (matches the ch0 trace family)
const GRID = "#232a2e"; // ±45° diagonal references
const AXIS = "#2a3338"; // M (vertical) / S (horizontal) guides
const LABEL = "#6b757c";
const BG = "#1c2023";

/**
 * Stereo vectorscope (goniometer). Each (L, R) sample pair is rotated 45° into
 * mid/side space and plotted as a faint point, so a mono signal collapses onto
 * the vertical (in-phase) axis and out-of-phase energy spreads horizontally.
 */
export function Goniometer({
  getWaveform,
  channelCount,
  active,
  frozen = false,
}: GoniometerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isStereo = channelCount >= 2;

  const draw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const radius = SIZE / 2 - PAD; // full-scale (±1) extent after rotation

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.font = "9px ui-monospace, monospace";

    // ±45° diagonal references: with mid/side rotation, hard-left and hard-right
    // pans land on these, so they bracket the legal stereo image.
    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID;
    const d = radius * Math.SQRT1_2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx - d * sx, cy - d);
      ctx.lineTo(cx + d * sx, cy + d);
      ctx.stroke();
    }

    // M (vertical = mono / in-phase) and S (horizontal = side) axis guides.
    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();

    // Axis letters: M at top (in-phase), S at right (side / width).
    ctx.fillStyle = LABEL;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("M", cx, 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("S", SIZE - 2, cy);

    const left = getWaveform(0);
    const right = isStereo ? getWaveform(1) : new Float32Array(0);

    if (!isStereo || !right || right.length === 0) {
      // Mono: signal is purely in-phase, so it collapses onto the vertical axis.
      ctx.strokeStyle = TRACE;
      ctx.globalAlpha = frozen ? 0.5 : 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = LABEL;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("mono", cx, SIZE - 2);
      if (frozen) drawFrozenBadge(ctx, PAD);
      return;
    }

    // Plot each (L, R) pair as a faint point in mid/side space.
    const n = Math.min(left.length, right.length);
    if (n > 0) {
      ctx.globalAlpha = frozen ? 0.3 : 0.55;
      ctx.fillStyle = TRACE;
      const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
      for (let i = 0; i < n; i++) {
        const l = clamp(left[i]);
        const r = clamp(right[i]);
        // Rotate to mid/side: x = side, y = mid (inverted for screen coords).
        const x = ((l - r) * Math.SQRT1_2) * radius;
        const y = ((l + r) * Math.SQRT1_2) * radius;
        ctx.fillRect(cx + x, cy - y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    if (frozen) drawFrozenBadge(ctx, PAD);
  };

  // Redraw on the rAF loop while active; static single draw under reduced motion.
  useScopeDraw(draw, active, [isStereo, frozen]);

  // Also draw once on mount / when the channel mode changes.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStereo]);

  return (
    <div className="panel" aria-label="Goniometer">
      <p className="panel__title">
        Goniometer · {isStereo ? "stereo" : "mono"}
      </p>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`Goniometer vectorscope, ${
            isStereo ? "stereo" : "mono"
          } stereo field`}
        />
      </div>
    </div>
  );
}
