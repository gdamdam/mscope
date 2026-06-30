import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { DynamicsPanel } from "./DynamicsPanel";
import type { DynamicsMetrics } from "../analysis/derived";

const sample: DynamicsMetrics = {
  crestDb: [12, 11],
  plrDb: 9.5,
  lra: 6.2,
  noiseFloorDb: -78,
};

describe("DynamicsPanel", () => {
  it("renders crest factor, PLR, LRA and noise floor from a DynamicsMetrics", () => {
    const view = render(createElement(DynamicsPanel, { dynamics: sample }));
    const text = view.container.textContent ?? "";
    expect(text).toContain("Dynamics");
    // Per-channel crest (L/R), dB-formatted.
    expect(text).toContain("12.0");
    expect(text).toContain("11.0");
    // PLR, LRA, noise floor.
    expect(text).toContain("9.5");
    expect(text).toContain("6.2");
    expect(text).toContain("-78.0");
    view.unmount();
  });

  it("shows dashes for every readout when dynamics is null", () => {
    const view = render(createElement(DynamicsPanel, { dynamics: null }));
    const text = view.container.textContent ?? "";
    expect(text).toContain("Dynamics");
    expect(text).toContain("—");
    expect(text).not.toContain("12.0");
    view.unmount();
  });
});
