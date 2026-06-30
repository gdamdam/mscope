import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Spectrogram } from "./Spectrogram";
import { stubCanvas } from "./testFakes";

describe("Spectrogram", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
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
});
