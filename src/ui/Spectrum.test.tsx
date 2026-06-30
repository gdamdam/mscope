import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Spectrum } from "./Spectrum";
import { noteName } from "./notes";
import { stubCanvas } from "./testFakes";

describe("Spectrum", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("renders a canvas without throwing for active:false", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Spectrum, {
        getSpectrum: () => new Float32Array(1024).fill(-60),
        sampleRate: 48000,
        active: false,
      }),
    );
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    view.unmount();
  });

  it("shows the default dBFS title with no tilt", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Spectrum, {
        getSpectrum: () => new Float32Array(1024).fill(-60),
        sampleRate: 48000,
        active: false,
      }),
    );
    const title = view.container.querySelector(".panel__title");
    expect(title?.textContent).toContain("dBFS");
    expect(title?.textContent).not.toContain("dB/oct");
    view.unmount();
  });

  it("reflects a positive tilt in the panel title", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Spectrum, {
        getSpectrum: () => new Float32Array(1024).fill(-60),
        sampleRate: 48000,
        active: false,
        tiltDbPerOct: 4.5,
      }),
    );
    const title = view.container.querySelector(".panel__title");
    expect(title?.textContent).toContain("+4.5 dB/oct");
    view.unmount();
  });
});

describe("noteName", () => {
  it("maps A4 = 440 Hz to 'A4'", () => {
    expect(noteName(440)).toBe("A4");
  });

  it("maps middle C (~261.63 Hz) to 'C4'", () => {
    expect(noteName(261.6256)).toBe("C4");
  });

  it("maps 880 Hz to 'A5' (octave up)", () => {
    expect(noteName(880)).toBe("A5");
  });

  it("returns an empty string for non-positive frequencies", () => {
    expect(noteName(0)).toBe("");
    expect(noteName(-10)).toBe("");
  });
});
