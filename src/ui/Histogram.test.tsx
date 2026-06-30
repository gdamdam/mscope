import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Histogram } from "./Histogram";
import { stubCanvas } from "./testFakes";

/** A source biased toward the edges so the histogram has clipping-like spikes. */
function clippedWaveform(_channel: 0 | 1): Float32Array {
  const n = 256;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = i % 2 === 0 ? -1 : 1;
  return buf;
}

/** Empty source: no samples for either channel. */
function emptyWaveform(_channel: 0 | 1): Float32Array {
  return new Float32Array(0);
}

describe("Histogram", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("renders without throwing for active:false", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Histogram, {
        getWaveform: clippedWaveform,
        channelCount: 1,
        active: false,
      }),
    );
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.getAttribute("aria-label")).toMatch(/amplitude histogram/i);
    view.unmount();
  });

  it("renders with an empty waveform without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Histogram, {
        getWaveform: emptyWaveform,
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
      createElement(Histogram, {
        getWaveform: clippedWaveform,
        channelCount: 1,
        active: false,
        frozen: true,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });
});
