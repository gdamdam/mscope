import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { LoudnessPanel } from "./LoudnessPanel";
import type { LoudnessSnapshot } from "../dsp/loudness";
import { LOUDNESS_TARGETS } from "../analysis/targets";

const STREAM14 = LOUDNESS_TARGETS.find((t) => t.id === "stream14")!;

const noop = (): void => {};

const sample: LoudnessSnapshot = {
  momentaryLufs: -13.8,
  shortTermLufs: -14.1,
  integratedLufs: -14.2,
};

function baseProps() {
  return {
    loudness: sample,
    maxMomentaryLufs: -11.5,
    maxShortTermLufs: -12.7,
    lra: 6.2,
    maxTruePeakHoldDb: -2.3,
    target: STREAM14,
    onTargetChange: noop,
    onResetHolds: noop,
  };
}

describe("LoudnessPanel", () => {
  it("renders the integrated hero, target label, and the in-range compliance class", () => {
    const view = render(createElement(LoudnessPanel, baseProps()));
    const text = view.container.textContent ?? "";
    expect(text).toContain("Loudness");
    // Integrated hero value (−14.2 LUFS).
    expect(text).toContain("-14.2");
    // Target appears in the select.
    expect(text).toContain(STREAM14.label);
    // −14.2 vs −14 (tolerance 1 LU) → in range.
    const big = view.container.querySelector(".lufs-big");
    expect(big).not.toBeNull();
    expect(big?.className).toContain("lufs-big--in");
    view.unmount();
  });

  it("shows dashes for every readout when loudness is null", () => {
    const view = render(
      createElement(LoudnessPanel, { ...baseProps(), loudness: null }),
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("Loudness");
    expect(text).toContain("—");
    const big = view.container.querySelector(".lufs-big");
    expect(big?.className).toContain("lufs-big--na");
    view.unmount();
  });

  it("flags an over-target integrated reading with the over class", () => {
    const over: LoudnessSnapshot = { ...sample, integratedLufs: -8 };
    const view = render(
      createElement(LoudnessPanel, { ...baseProps(), loudness: over }),
    );
    const big = view.container.querySelector(".lufs-big");
    expect(big?.className).toContain("lufs-big--over");
    view.unmount();
  });
});
