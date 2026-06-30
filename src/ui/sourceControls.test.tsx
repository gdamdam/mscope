import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render, flush } from "./testRender";
import { ToneControls } from "./ToneControls";
import { FilePicker } from "./FilePicker";
import type { GeneratorOptions } from "../audio/input";

/**
 * Set a controlled input/select value the way React expects, then fire a native
 * change event. Writing `el.value` directly leaves React's internal value
 * tracker in sync, so React treats the subsequent event as a no-op and state
 * never updates. Going through the prototype setter desyncs the tracker, which
 * is exactly what a real user keystroke does, so onChange fires.
 */
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ToneControls", () => {
  it("Generate calls onStart with the selected type and frequency", async () => {
    const onStart = vi.fn<(opts: GeneratorOptions) => void>();
    const view = render(createElement(ToneControls, { onStart }));

    const type = view.container.querySelector("select") as HTMLSelectElement;
    await flush(() => setValue(type, "pink"));

    const generate = view.container.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    generate.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onStart).toHaveBeenCalledTimes(1);
    // Frequency is sine-only, so a noise type omits it.
    expect(onStart.mock.calls[0]?.[0]).toEqual({ type: "pink" });
    view.unmount();
  });

  it("passes the chosen sine frequency through", async () => {
    const onStart = vi.fn<(opts: GeneratorOptions) => void>();
    const view = render(createElement(ToneControls, { onStart }));

    const freq = view.container.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    await flush(() => setValue(freq, "440"));

    const generate = view.container.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    generate.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onStart).toHaveBeenCalledWith({ type: "sine", frequency: 440 });
    view.unmount();
  });

  it("disables its controls while busy", () => {
    const view = render(
      createElement(ToneControls, { onStart: () => {}, busy: true }),
    );
    const generate = view.container.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    const type = view.container.querySelector("select") as HTMLSelectElement;
    expect(generate.disabled).toBe(true);
    expect(type.disabled).toBe(true);
    view.unmount();
  });
});

describe("FilePicker", () => {
  it("calls onFile with the chosen file on input change", async () => {
    const onFile = vi.fn<(file: File) => void>();
    const view = render(createElement(FilePicker, { onFile }));

    const input = view.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["abc"], "tone.wav", { type: "audio/wav" });
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    await flush(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0]?.[0]).toBe(file);
    view.unmount();
  });

  it("calls onFile with the first dropped file", async () => {
    const onFile = vi.fn<(file: File) => void>();
    const view = render(createElement(FilePicker, { onFile }));

    const zone = view.container.querySelector(
      '[data-dropzone="true"]',
    ) as HTMLElement;
    const file = new File(["xyz"], "drop.mp3", { type: "audio/mpeg" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file] },
      configurable: true,
    });
    await flush(() => {
      zone.dispatchEvent(drop);
    });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0]?.[0]).toBe(file);
    view.unmount();
  });

  it("disables the file input while busy", () => {
    const view = render(
      createElement(FilePicker, { onFile: () => {}, busy: true }),
    );
    const input = view.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    view.unmount();
  });
});
