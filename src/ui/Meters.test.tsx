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

  it("clears the held clip badge when resetToken changes (session reset)", () => {
    const view = render(
      createElement(Meters, {
        channels: [ch({ clipCount: 5 })],
        resetToken: 0,
      }),
    );
    // Clean frame after the clip: badge stays held.
    view.rerender(
      createElement(Meters, {
        channels: [ch({ clippedNow: false, clipCount: 0 })],
        resetToken: 0,
      }),
    );
    expect(view.container.querySelector(".clip")?.className).toContain(
      "clip--held",
    );
    // Session reset (token bump) drops the sticky flag.
    view.rerender(
      createElement(Meters, {
        channels: [ch({ clippedNow: false, clipCount: 0 })],
        resetToken: 1,
      }),
    );
    const clip = view.container.querySelector(".clip");
    expect(clip?.className).not.toContain("clip--held");
    expect(clip?.textContent).toBe("");
    view.unmount();
  });

  it("does not carry a held flag onto a channel that reappears clean", () => {
    // Stereo with a clipped R, shrink to mono, grow back to a clean stereo:
    // the new channel 1 must not inherit the old held flag.
    const view = render(
      createElement(Meters, {
        channels: [ch(), ch({ clippedNow: true })],
      }),
    );
    view.rerender(createElement(Meters, { channels: [ch()] }));
    view.rerender(
      createElement(Meters, {
        channels: [ch(), ch({ clippedNow: false, clipCount: 0 })],
      }),
    );
    const clips = view.container.querySelectorAll(".clip");
    expect(clips.length).toBe(2);
    expect(clips[1].className).not.toContain("clip--held");
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
