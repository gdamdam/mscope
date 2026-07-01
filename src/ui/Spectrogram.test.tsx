import { describe, it, expect, afterEach, vi, type Mock } from "vitest";
import { createElement } from "react";
import { render, flush } from "./testRender";
import { Spectrogram, columnDevicePx, freqToBinIndex } from "./Spectrogram";
import { stubCanvas } from "./testFakes";
import { binToFrequency } from "../audio/analysis/analyser";

/** Controllable requestAnimationFrame queue. */
function stubRaf(): { tick(): void } {
  const cbs = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cbs.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    cbs.delete(id);
  });
  return {
    tick() {
      const pending = [...cbs.values()];
      cbs.clear();
      for (const cb of pending) cb(0);
    },
  };
}

/** drawImage calls that scroll (negative x offset), i.e. waterfall advances. */
function scrollCalls(ctx: { drawImage: Mock }): unknown[][] {
  return ctx.drawImage.mock.calls.filter((c) => (c[1] as number) < 0);
}

function getCtx(container: HTMLElement): { drawImage: Mock } {
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  return canvas.getContext("2d") as unknown as { drawImage: Mock };
}

describe("Spectrogram", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
    vi.unstubAllGlobals();
  });

  it("renders a canvas without throwing for active:false", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Spectrogram, {
        getSpectrum: () => new Float32Array(1024).fill(-120),
        sampleRate: 48000,
        active: false,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });

  it("renders without throwing when frozen", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Spectrogram, {
        getSpectrum: () => new Float32Array(1024).fill(-60),
        sampleRate: 48000,
        active: false,
        frozen: true,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });

  it("maps each bin's frequency back to the same bin (y→bin inverse)", () => {
    const sr = 48000;
    const bins = 1024;
    const fftSize = bins * 2;
    const nyquist = sr / 2;
    for (const k of [1, 2, 100, 512, 1000, 1023]) {
      expect(freqToBinIndex(binToFrequency(k, fftSize, sr), nyquist, bins)).toBe(k);
    }
    // Nyquist itself would be bin `bins`; clamp into the spectrum.
    expect(freqToBinIndex(nyquist, nyquist, bins)).toBe(bins - 1);
    // DC (bin 0) is skipped, matching Spectrum's trace.
    expect(freqToBinIndex(0, nyquist, bins)).toBe(1);
  });

  it("one column advance is a whole number of device pixels", () => {
    expect(columnDevicePx(1)).toBe(1);
    expect(columnDevicePx(2)).toBe(2);
    expect(columnDevicePx(1.5)).toBe(2);
  });

  it("does not scroll on one-shot draws (mount, freeze, dep change)", () => {
    restore = stubCanvas();
    const props = {
      getSpectrum: () => new Float32Array(1024).fill(-60),
      sampleRate: 48000,
      active: true, // rAF is stubbed out below, so only one-shots run
    };
    vi.stubGlobal("requestAnimationFrame", (): number => 0);
    vi.stubGlobal("cancelAnimationFrame", (): void => undefined);
    const view = render(createElement(Spectrogram, props));
    const ctx = getCtx(view.container);
    expect(scrollCalls(ctx).length).toBe(0);

    // Playback ends: the frozen repaint must not shift + append a stale column.
    view.rerender(
      createElement(Spectrogram, { ...props, active: false, frozen: true }),
    );
    expect(scrollCalls(ctx).length).toBe(0);
    view.unmount();
  });

  it("advances exactly one column of device pixels per animation frame at dpr=2", async () => {
    restore = stubCanvas();
    vi.stubGlobal("devicePixelRatio", 2);
    const raf = stubRaf();
    const props = {
      getSpectrum: () => new Float32Array(1024).fill(-60),
      sampleRate: 48000,
      active: true,
    };
    const view = render(createElement(Spectrogram, props));
    const canvas = view.container.querySelector("canvas") as HTMLCanvasElement;
    // Backing store is dpr-scaled: 600×176 logical → 1200×352 device pixels.
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(352);

    const ctx = getCtx(view.container);
    expect(scrollCalls(ctx).length).toBe(0);

    await flush(() => raf.tick());
    // One frame → one scroll of exactly 2 device pixels (1 logical column).
    expect(scrollCalls(ctx).length).toBe(1);
    expect(scrollCalls(ctx)[0][1]).toBe(-2);
    expect(scrollCalls(ctx)[0][2]).toBe(0);

    await flush(() => raf.tick());
    expect(scrollCalls(ctx).length).toBe(2);

    // Freezing repaints without advancing further.
    view.rerender(
      createElement(Spectrogram, { ...props, active: false, frozen: true }),
    );
    expect(scrollCalls(ctx).length).toBe(2);
    view.unmount();
  });
});
