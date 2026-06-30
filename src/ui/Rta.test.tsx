import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Rta } from "./Rta";
import { stubCanvas } from "./testFakes";

describe("Rta", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("renders a canvas without throwing for active:false", () => {
    restore = stubCanvas();
    const view = render(
      createElement(Rta, {
        getSpectrum: () => new Float32Array(1024).fill(-60),
        sampleRate: 48000,
        active: false,
      }),
    );
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    view.unmount();
  });
});
