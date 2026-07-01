import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render, flush } from "./testRender";
import { backingStorePx, useDevicePixelRatio } from "./useCanvasDpr";

/** Stub matchMedia recording queries + change listeners; returns a fire fn. */
function stubMatchMedia(): {
  queries: string[];
  fire(): void;
  restore(): void;
} {
  const original = window.matchMedia;
  const queries: string[] = [];
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => {
    queries.push(query);
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
      addListener: (cb: () => void) => listeners.add(cb),
      removeListener: (cb: () => void) => listeners.delete(cb),
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
  return {
    queries,
    fire() {
      for (const cb of [...listeners]) cb();
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

function DprProbe(): JSX.Element {
  return createElement("span", null, String(useDevicePixelRatio()));
}

describe("backingStorePx", () => {
  it("scales logical dimensions by the device pixel ratio", () => {
    expect(backingStorePx(600, 1)).toBe(600);
    expect(backingStorePx(600, 2)).toBe(1200);
    expect(backingStorePx(600, 1.5)).toBe(900);
    expect(backingStorePx(176, 2)).toBe(352);
  });

  it("rounds to whole device pixels and never returns 0", () => {
    expect(backingStorePx(601, 1.5)).toBe(902); // 901.5 → 902
    expect(backingStorePx(0.4, 1)).toBe(1);
  });
});

describe("useDevicePixelRatio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the current devicePixelRatio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const mm = stubMatchMedia();
    const view = render(createElement(DprProbe));
    expect(view.container.textContent).toBe("2");
    view.unmount();
    mm.restore();
  });

  it("re-renders and re-arms the media query when the ratio changes", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const mm = stubMatchMedia();
    const view = render(createElement(DprProbe));
    expect(view.container.textContent).toBe("1");
    expect(mm.queries).toContain("(resolution: 1dppx)");

    vi.stubGlobal("devicePixelRatio", 2);
    await flush(() => mm.fire());
    expect(view.container.textContent).toBe("2");
    // The listener must be re-armed at the new ratio, since a resolution query
    // only fires when crossing the value it was created with.
    expect(mm.queries).toContain("(resolution: 2dppx)");
    view.unmount();
    mm.restore();
  });
});
