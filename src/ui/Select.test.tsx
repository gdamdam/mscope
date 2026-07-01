import { describe, it, expect, vi } from "vitest";
import { createElement, act } from "react";
import { render } from "./testRender";
import { Select, type SelectOption } from "./Select";

const OPTIONS: SelectOption<number>[] = [
  { value: 0, label: "Flat" },
  { value: 3, label: "Plus 3" },
  { value: 4.5, label: "Pink" },
];

/** Grab the combobox trigger. */
function combo(view: { container: HTMLElement }): HTMLElement {
  return view.container.querySelector('[role="combobox"]') as HTMLElement;
}

/** All rendered listbox options (empty when the list is closed). */
function opts(view: { container: HTMLElement }): HTMLElement[] {
  return Array.from(
    view.container.querySelectorAll('[role="option"]'),
  ) as HTMLElement[];
}

/** Dispatch a keydown React will pick up (bubbles to the root listener). */
function key(el: Element, k: string): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

describe("Select", () => {
  it("shows the selected option's label and keeps the list closed initially", () => {
    const view = render(
      createElement(Select<number>, {
        value: 3,
        options: OPTIONS,
        onChange: () => {},
        ariaLabel: "Slope",
      }),
    );
    expect(combo(view).textContent).toContain("Plus 3");
    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    view.unmount();
  });

  it("opens on click and choosing an option fires onChange with its value, then closes", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(Select<number>, {
        value: 0,
        options: OPTIONS,
        onChange,
        ariaLabel: "Slope",
      }),
    );
    act(() => combo(view).click());
    expect(view.container.querySelector('[role="listbox"]')).not.toBeNull();

    act(() => opts(view)[2].click());
    expect(onChange).toHaveBeenCalledWith(4.5);
    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    view.unmount();
  });

  it("keyboard: ArrowDown opens on the selection, a second moves down, Enter commits", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(Select<number>, {
        value: 0,
        options: OPTIONS,
        onChange,
        ariaLabel: "Slope",
      }),
    );
    const el = combo(view);
    key(el, "ArrowDown"); // opens, active = selected (index 0)
    key(el, "ArrowDown"); // active = index 1
    key(el, "Enter");
    expect(onChange).toHaveBeenCalledWith(3);
    view.unmount();
  });

  it("Escape closes the list without selecting", () => {
    const onChange = vi.fn();
    const view = render(
      createElement(Select<number>, {
        value: 0,
        options: OPTIONS,
        onChange,
        ariaLabel: "Slope",
      }),
    );
    const el = combo(view);
    act(() => el.click());
    key(el, "Escape");
    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    view.unmount();
  });

  it("does not open when disabled", () => {
    const view = render(
      createElement(Select<number>, {
        value: 0,
        options: OPTIONS,
        onChange: () => {},
        ariaLabel: "Slope",
        disabled: true,
      }),
    );
    act(() => combo(view).click());
    expect(view.container.querySelector('[role="listbox"]')).toBeNull();
    view.unmount();
  });

  it("exposes the accessible name and marks the selected option via ARIA", () => {
    const view = render(
      createElement(Select<number>, {
        value: 3,
        options: OPTIONS,
        onChange: () => {},
        ariaLabel: "Slope",
      }),
    );
    const el = combo(view);
    expect(el.getAttribute("aria-label")).toBe("Slope");
    act(() => el.click());
    const selected = view.container.querySelector(
      '[role="option"][aria-selected="true"]',
    ) as HTMLElement;
    expect(selected.textContent).toContain("Plus 3");
    view.unmount();
  });
});
