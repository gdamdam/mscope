import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { Meters } from "./Meters";
import { Diagnostics } from "./Diagnostics";
import { ch, snap } from "./testFakes";

describe("Meters", () => {
  it("renders per-channel levels (peak/RMS/true-peak), no LUFS trio", () => {
    const view = render(
      createElement(Meters, {
        channels: [ch({ peakDb: -6 }), ch({ peakDb: -7 })],
      }),
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("peak");
    expect(text).toContain("true pk");
    // The LUFS trio moved to LoudnessPanel; Meters is pure Levels now.
    expect(text).not.toContain("LUFS-I");
    // Two channel rows present.
    expect(view.container.querySelectorAll(".meter-ch").length).toBe(2);
    view.unmount();
  });

  it("holds the clip indicator once a channel has clipped (peak-hold)", () => {
    const view = render(
      createElement(Meters, {
        channels: [ch({ clippedNow: true })],
      }),
    );
    // After clipping, re-render with no current clip: badge stays held.
    view.rerender(
      createElement(Meters, {
        channels: [ch({ clippedNow: false, clipCount: 0 })],
      }),
    );
    const clip = view.container.querySelector(".clip");
    expect(clip?.className).toContain("clip--held");
    view.unmount();
  });
});

describe("Diagnostics", () => {
  it("flags DC offset and reports cumulative clip count without summing", () => {
    const view = render(
      createElement(Diagnostics, {
        metrics: snap({
          channels: [ch({ dcOffset: 0.05, clipCount: 42 })],
        }),
      }),
    );
    const text = view.container.textContent ?? "";
    expect(text).toContain("DC offset detected");
    // Cumulative clip count is the max (latest running total), not a sum.
    expect(text).toContain("42");
    view.unmount();
  });

  it("flags silence", () => {
    const view = render(
      createElement(Diagnostics, {
        metrics: snap({
          channels: [ch()],
          signal: { silent: true, lowSignal: false },
        }),
      }),
    );
    expect(view.container.textContent).toContain("Silence");
    view.unmount();
  });
});
