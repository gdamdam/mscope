import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { SpectralPanel } from "./SpectralPanel";
import type { SpectralMetrics } from "../analysis/derived";

const sample: SpectralMetrics = {
  centroidHz: 2500,
  flatness: 0.42,
  dominantHz: 440,
  bandsDb: [],
};

describe("SpectralPanel", () => {
  it("renders the spectral descriptors from a sample", () => {
    const view = render(createElement(SpectralPanel, { spectral: sample }));
    const text = view.container.textContent ?? "";
    expect(text).toContain("Spectral");
    // Centroid ≥ 1000 → compact "k" form.
    expect(text).toContain("2.5k");
    // Flatness to 2 decimals.
    expect(text).toContain("0.42");
    // Dominant < 1000 → plain Hz.
    expect(text).toContain("440");
    view.unmount();
  });

  it("shows a dash for each stat when spectral is null", () => {
    const view = render(createElement(SpectralPanel, { spectral: null }));
    const dashes = view.container.querySelectorAll(".stat__v");
    expect(dashes.length).toBe(3);
    dashes.forEach((d) => expect(d.textContent).toBe("—"));
    view.unmount();
  });
});
