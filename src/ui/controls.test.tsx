import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { act } from "react";
import { AnalyserControls } from "./AnalyserControls";
import { SoloControl } from "./SoloControl";
import { AbControls } from "./AbControls";
import type { AnalyserConfig } from "../audio/engineTypes";

/**
 * Set a controlled input/select value the way a real user gesture would, so
 * React's synthetic onChange fires. We must bypass React's value tracker by
 * using the native prototype setter, then dispatch the native event React
 * listens for (`input` for <input>, `change` for <select>).
 */
function setValue(
  el: HTMLInputElement | HTMLSelectElement,
  value: string,
  eventType: "input" | "change",
): void {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  act(() => {
    el.dispatchEvent(new Event(eventType, { bubbles: true }));
  });
}

describe("AnalyserControls", () => {
  const config: AnalyserConfig = { fftSize: 2048, smoothing: 0.8 };

  it("fires onChange with the chosen fftSize", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(AnalyserControls, { config, onChange }),
    );
    const combo = view.container.querySelector(
      '[role="combobox"][aria-label="FFT size"]',
    ) as HTMLElement;
    act(() => combo.click());
    const opt = Array.from(
      view.container.querySelectorAll('[role="option"]'),
    ).find((o) => o.textContent?.trim() === "8192") as HTMLElement;
    act(() => opt.click());
    expect(onChange).toHaveBeenCalledWith({ fftSize: 8192 });
    view.unmount();
  });

  it("fires onChange with the new smoothing value", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(AnalyserControls, { config, onChange }),
    );
    const range = view.container.querySelector(
      'input[aria-label="Smoothing"]',
    ) as HTMLInputElement;
    setValue(range, "0.5", "input");
    expect(onChange).toHaveBeenCalledWith({ smoothing: 0.5 });
    view.unmount();
  });

  it("shows the fixed-window note", () => {
    const view = render(
      createElement(AnalyserControls, { config, onChange: () => {} }),
    );
    expect(view.container.textContent).toContain(
      "window: Blackman (fixed by AnalyserNode)",
    );
    view.unmount();
  });
});

describe("SoloControl", () => {
  it("fires onChange with 0, 1, and 'both' for L / R / Both", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(SoloControl, { value: "both", onChange, channelCount: 2 }),
    );
    const btn = (label: string): HTMLButtonElement =>
      view.container.querySelector(
        `button[aria-label="${label}"]`,
      ) as HTMLButtonElement;
    btn("Solo left channel").click();
    btn("Solo right channel").click();
    btn("Both channels").click();
    expect(onChange).toHaveBeenNthCalledWith(1, 0);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
    expect(onChange).toHaveBeenNthCalledWith(3, "both");
    view.unmount();
  });

  it("marks the active channel with aria-pressed", () => {
    const view = render(
      createElement(SoloControl, { value: 1, onChange: () => {}, channelCount: 2 }),
    );
    const right = view.container.querySelector(
      'button[aria-label="Solo right channel"]',
    ) as HTMLButtonElement;
    expect(right.getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });

  it("disables L/R when the source is mono", () => {
    const view = render(
      createElement(SoloControl, { value: "both", onChange: () => {}, channelCount: 1 }),
    );
    const left = view.container.querySelector(
      'button[aria-label="Solo left channel"]',
    ) as HTMLButtonElement;
    const right = view.container.querySelector(
      'button[aria-label="Solo right channel"]',
    ) as HTMLButtonElement;
    const both = view.container.querySelector(
      'button[aria-label="Both channels"]',
    ) as HTMLButtonElement;
    expect(left.disabled).toBe(true);
    expect(right.disabled).toBe(true);
    expect(both.disabled).toBe(false);
    view.unmount();
  });
});

describe("AbControls", () => {
  it("fires onSnapshot when Hold A is clicked", () => {
    const onSnapshot = vi.fn();
    const view = render(
      createElement(AbControls, {
        hasSnapshot: false,
        onSnapshot,
        onClear: () => {},
      }),
    );
    (
      view.container.querySelector(
        'button[aria-label="Hold A"]',
      ) as HTMLButtonElement
    ).click();
    expect(onSnapshot).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("fires onClear when Clear A is clicked, and is disabled with no snapshot", () => {
    const onClear = vi.fn();
    // Disabled when nothing is held.
    const empty = render(
      createElement(AbControls, {
        hasSnapshot: false,
        onSnapshot: () => {},
        onClear,
      }),
    );
    const clearEmpty = empty.container.querySelector(
      'button[aria-label="Clear A"]',
    ) as HTMLButtonElement;
    expect(clearEmpty.disabled).toBe(true);
    expect(empty.container.textContent).toContain("no A held");
    empty.unmount();

    // Enabled and wired when a snapshot is held.
    const held = render(
      createElement(AbControls, {
        hasSnapshot: true,
        onSnapshot: () => {},
        onClear,
      }),
    );
    const clearHeld = held.container.querySelector(
      'button[aria-label="Clear A"]',
    ) as HTMLButtonElement;
    expect(clearHeld.disabled).toBe(false);
    expect(held.container.textContent).toContain("A held");
    clearHeld.click();
    expect(onClear).toHaveBeenCalledOnce();
    held.unmount();
  });
});
