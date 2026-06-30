import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { LoudnessHistory } from "./LoudnessHistory";
import { stubCanvas } from "./testFakes";
import type { ScopeHistory } from "../analysis/derived";

/** A few frames of plausible loudness/level history, newest last. */
function sampleHistory(): ScopeHistory {
  return {
    momentaryLufs: [-23, -22, -20, -18, -16],
    shortTermLufs: [-24, -23, -22, -21, -20],
    peakDb: [-6, -5, -4, -3, -2],
    rmsDb: [-20, -19, -18, -17, -16],
  };
}

/** Empty history: all series have no samples yet. */
function emptyHistory(): ScopeHistory {
  return { momentaryLufs: [], shortTermLufs: [], peakDb: [], rmsDb: [] };
}

describe("LoudnessHistory", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("renders without throwing for a small sample history", () => {
    restore = stubCanvas();
    const view = render(
      createElement(LoudnessHistory, {
        history: sampleHistory(),
        active: false,
      }),
    );
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.getAttribute("aria-label")).toMatch(/loudness history/i);
    view.unmount();
  });

  it("renders with empty history (grid only) without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(LoudnessHistory, {
        history: emptyHistory(),
        active: false,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });

  it("renders the frozen state without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(LoudnessHistory, {
        history: sampleHistory(),
        active: false,
        frozen: true,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });

  it("renders a single-sample history without throwing", () => {
    restore = stubCanvas();
    const view = render(
      createElement(LoudnessHistory, {
        history: {
          momentaryLufs: [-23],
          shortTermLufs: [-24],
          peakDb: [-6],
          rmsDb: [-20],
        },
        active: true,
      }),
    );
    expect(view.container.querySelector("canvas")).not.toBeNull();
    view.unmount();
  });
});
