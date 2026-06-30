import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Waveform } from "./Waveform";
import { Spectrum } from "./Spectrum";
import { stubCanvas } from "./testFakes";

describe("canvas views", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("Waveform renders a canvas per the channel count without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Waveform, {
        getWaveform: () => new Float32Array(2048).fill(0.5),
        channelCount: 2,
        active: false,
      }),
    );
    const canvas = view.container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    // 2 channels => double-height canvas.
    expect(canvas.height).toBe(240);
    view.unmount();
  });

  it("Spectrum renders a canvas without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Spectrum, {
        getSpectrum: () => new Float32Array(1024).fill(-60),
        sampleRate: 48000,
        active: false,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });
});
