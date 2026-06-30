import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { act } from "react";
import { SpectrumControls } from "./SpectrumControls";

/** Drive a controlled <select> the way a real change gesture would. */
function setSelect(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

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
    const select = view.container.querySelector(
      'select[aria-label="Spectrum tilt"]',
    ) as HTMLSelectElement;
    setSelect(select, "4.5");
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
