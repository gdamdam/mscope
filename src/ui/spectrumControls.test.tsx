import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { act } from "react";
import { SpectrumControls } from "./SpectrumControls";

describe("SpectrumControls", () => {
  it("fires onTilt with the chosen slope", () => {
    const onTilt = vi.fn();
    const view = render(
      createElement(SpectrumControls, {
        tilt: 0,
        onTilt,
        peakHold: false,
        onPeakHold: () => {},
      }),
    );
    const combo = view.container.querySelector(
      '[role="combobox"][aria-label="Spectrum tilt"]',
    ) as HTMLElement;
    act(() => combo.click());
    const pink = Array.from(
      view.container.querySelectorAll('[role="option"]'),
    ).find((o) => o.textContent?.includes("+4.5")) as HTMLElement;
    act(() => pink.click());
    expect(onTilt).toHaveBeenCalledWith(4.5);
    view.unmount();
  });

  it("fires onPeakHold with the toggled value", () => {
    const onPeakHold = vi.fn();
    const view = render(
      createElement(SpectrumControls, {
        tilt: 0,
        onTilt: () => {},
        peakHold: false,
        onPeakHold,
      }),
    );
    const btn = view.container.querySelector(
      'button[aria-label="Toggle peak hold"]',
    ) as HTMLButtonElement;
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    btn.click();
    expect(onPeakHold).toHaveBeenCalledWith(true);
    view.unmount();
  });

  it("marks peak-hold pressed when enabled", () => {
    const view = render(
      createElement(SpectrumControls, {
        tilt: 0,
        onTilt: () => {},
        peakHold: true,
        onPeakHold: () => {},
      }),
    );
    const btn = view.container.querySelector(
      'button[aria-label="Toggle peak hold"]',
    ) as HTMLButtonElement;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });
});
