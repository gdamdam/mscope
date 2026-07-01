import { describe, it, expect, afterEach, type Mock } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Goniometer } from "./Goniometer";
import { stubCanvas } from "./testFakes";

// Logical geometry mirrored from Goniometer.tsx: SIZE 260, PAD 18.
const CX = 130;
const CY = 130;
const RADIUS = 112;
/** Dual-mono convention: sample s plots at y = cy − s·√2·radius. */
const K = Math.SQRT2 * RADIUS;

function getCtx(container: HTMLElement): { moveTo: Mock; lineTo: Mock } {
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  return canvas.getContext("2d") as unknown as { moveTo: Mock; lineTo: Mock };
}

/** Whether `fn` was called with (x, ~y) within a small tolerance. */
function calledWithApprox(fn: Mock, x: number, y: number): boolean {
  return fn.mock.calls.some(
    (c) => c[0] === x && Math.abs((c[1] as number) - y) < 1e-6,
  );
}

/** A simple stereo source: distinct L/R so the rotation has something to plot. */
function stereoWaveform(channel: 0 | 1): Float32Array {
  const n = 256;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    buf[i] = channel === 0 ? Math.sin(t) : Math.sin(t * 1.5);
  }
  return buf;
}

/** Mono source: channel 0 has data, channel 1 is empty. */
function monoWaveform(channel: 0 | 1): Float32Array {
  if (channel === 1) return new Float32Array(0);
  const n = 256;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.sin((i / n) * Math.PI * 2);
  return buf;
}

describe("Goniometer", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("renders for stereo (channelCount 2) without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Goniometer, {
        getWaveform: stereoWaveform,
        channelCount: 2,
        active: false,
      }),
    );
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("aria-label")).toMatch(/goniometer/i);
    view.unmount();
  });

  it("renders for mono (channelCount 1) without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Goniometer, {
        getWaveform: monoWaveform,
        channelCount: 1,
        active: false,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });

  it("scales the mono trace to the signal's amplitude (dual-mono convention)", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Goniometer, {
        getWaveform: monoWaveform, // full-scale sine: peaks at exactly ±1
        channelCount: 1,
        active: false,
      }),
    );
    const ctx = getCtx(view.container);
    expect(calledWithApprox(ctx.moveTo, CX, CY - K)).toBe(true);
    expect(calledWithApprox(ctx.lineTo, CX, CY + K)).toBe(true);
    view.unmount();
  });

  it("draws a shorter mono trace for a quieter signal", () => {
    restore = stubCanvas();
    const quiet = (channel: 0 | 1): Float32Array => {
      const buf = monoWaveform(channel);
      for (let i = 0; i < buf.length; i++) buf[i] *= 0.25;
      return buf;
    };
    const view = render(
      createElement(Goniometer, {
        getWaveform: quiet,
        channelCount: 1,
        active: false,
      }),
    );
    const ctx = getCtx(view.container);
    expect(calledWithApprox(ctx.moveTo, CX, CY - 0.25 * K)).toBe(true);
    // No full-scale trace for a -12 dB signal.
    expect(calledWithApprox(ctx.moveTo, CX, CY - K)).toBe(false);
    view.unmount();
  });

  it("draws no mono trace for silence", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Goniometer, {
        getWaveform: () => new Float32Array(256),
        channelCount: 1,
        active: false,
      }),
    );
    const ctx = getCtx(view.container);
    // The only vertical strokes on the M axis are the axis guides (cy ± radius).
    const axisMoves = ctx.moveTo.mock.calls.filter((c) => c[0] === CX);
    expect(axisMoves.length).toBeGreaterThan(0);
    expect(axisMoves.every((c) => c[1] === CY - RADIUS)).toBe(true);
    const axisLines = ctx.lineTo.mock.calls.filter((c) => c[0] === CX);
    expect(axisLines.every((c) => c[1] === CY + RADIUS)).toBe(true);
    view.unmount();
  });

  it("renders the frozen state without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Goniometer, {
        getWaveform: stereoWaveform,
        channelCount: 2,
        active: false,
        frozen: true,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });
});
