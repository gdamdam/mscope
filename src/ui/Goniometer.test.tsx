import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Goniometer } from "./Goniometer";
import { stubCanvas } from "./testFakes";

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
