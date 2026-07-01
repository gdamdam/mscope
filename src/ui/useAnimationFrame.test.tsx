import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render, flush } from "./testRender";
import { usePrefersReducedMotion, useScopeDraw } from "./useAnimationFrame";

/** Stub matchMedia with a mutable reduced-motion flag; returns a fire fn. */
function stubMatchMedia(state: { reduce: boolean }): {
  fire(): void;
  restore(): void;
} {
  const original = window.matchMedia;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? state.reduce : false,
    media: query,
    onchange: null,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    fire() {
      for (const cb of [...listeners]) cb();
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

/** Controllable requestAnimationFrame queue. */
function stubRaf(): { pending(): number; tick(): void; restore(): void } {
  const cbs = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cbs.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    cbs.delete(id);
  });
  return {
    pending: () => cbs.size,
    tick() {
      const pendingCbs = [...cbs.values()];
      cbs.clear();
      for (const cb of pendingCbs) cb(0);
    },
    restore: () => vi.unstubAllGlobals(),
  };
}

function RmProbe(): JSX.Element {
  return createElement("span", null, usePrefersReducedMotion() ? "reduced" : "full");
}

describe("usePrefersReducedMotion", () => {
  it("re-renders consumers when the OS setting toggles mid-session", async () => {
    const state = { reduce: false };
    const mm = stubMatchMedia(state);
    const view = render(createElement(RmProbe));
    expect(view.container.textContent).toBe("full");

    state.reduce = true;
    await flush(() => mm.fire());
    expect(view.container.textContent).toBe("reduced");

    state.reduce = false;
    await flush(() => mm.fire());
    expect(view.container.textContent).toBe("full");
    view.unmount();
    mm.restore();
  });
});

describe("useScopeDraw", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes animating:false on one-shot draws and true on rAF ticks", async () => {
    const raf = stubRaf();
    const calls: boolean[] = [];
    function Probe({ active }: { active: boolean }): null {
      useScopeDraw((animating) => calls.push(animating === true), active);
      return null;
    }
    const view = render(createElement(Probe, { active: false }));
    expect(calls).toEqual([false]); // inactive one-shot

    view.rerender(createElement(Probe, { active: true }));
    await flush(() => raf.tick());
    expect(calls).toEqual([false, true]); // loop tick
    view.unmount();
  });

  it("stops the loop immediately when reduced motion turns on mid-session", async () => {
    const state = { reduce: false };
    const mm = stubMatchMedia(state);
    const raf = stubRaf();
    const calls: boolean[] = [];
    function Probe(): null {
      useScopeDraw((animating) => calls.push(animating === true), true);
      return null;
    }
    const view = render(createElement(Probe));
    expect(raf.pending()).toBe(1); // loop armed

    state.reduce = true;
    await flush(() => mm.fire());
    // The effect re-ran: loop cancelled, one static frame drawn instead.
    expect(raf.pending()).toBe(0);
    expect(calls).toEqual([false]);

    state.reduce = false;
    await flush(() => mm.fire());
    expect(raf.pending()).toBe(1); // loop restarts
    view.unmount();
    mm.restore();
  });
});
