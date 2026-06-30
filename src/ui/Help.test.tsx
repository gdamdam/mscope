import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render, flush } from "./testRender";
import { Help } from "./Help";

describe("Help", () => {
  it("renders nothing when closed", () => {
    const view = render(
      createElement(Help, { open: false, onClose: () => {} }),
    );
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(view.container.textContent).toBe("");
    view.unmount();
  });

  it("renders a labelled dialog with key terms when open", () => {
    const view = render(
      createElement(Help, { open: true, onClose: () => {} }),
    );
    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    // aria-labelledby must point at a real heading element.
    const labelId = dialog?.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(view.container.querySelector(`#${labelId}`)).not.toBeNull();

    const text = dialog?.textContent ?? "";
    for (const term of ["LUFS", "True-peak", "Goniometer", "Spectrogram"]) {
      expect(text).toContain(term);
    }
    view.unmount();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const view = render(createElement(Help, { open: true, onClose }));
    const close = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close help"]',
    );
    expect(close).not.toBeNull();
    close?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const view = render(createElement(Help, { open: true, onClose }));
    const backdrop =
      view.container.querySelector<HTMLDivElement>(".help-backdrop");
    backdrop?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("does not call onClose when clicking inside the panel", () => {
    const onClose = vi.fn();
    const view = render(createElement(Help, { open: true, onClose }));
    const panel = view.container.querySelector<HTMLElement>(".help-panel");
    panel?.click();
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const view = render(createElement(Help, { open: true, onClose }));
    await flush(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("ignores Escape and removes its listener when closed", async () => {
    const onClose = vi.fn();
    const view = render(createElement(Help, { open: false, onClose }));
    await flush(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
  });

  it("moves focus into the dialog on open", () => {
    const view = render(
      createElement(Help, { open: true, onClose: () => {} }),
    );
    const panel = view.container.querySelector<HTMLElement>(".help-panel");
    expect(document.activeElement).toBe(panel);
    view.unmount();
  });
});
