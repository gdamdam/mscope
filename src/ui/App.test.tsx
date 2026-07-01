import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render, flush } from "./testRender";
import { stubCanvas, ch, frame } from "./testFakes";
import type { AnalysisFrame } from "../audio/engineTypes";

// Frame listeners registered with the mocked engine, so tests can push frames.
// vi.hoisted because the vi.mock factory below is hoisted above imports.
const hoisted = vi.hoisted(() => ({
  listeners: new Set<(f: unknown) => void>(),
}));

// Mock the engine module so App's static import resolves in jsdom without Web
// Audio. App injects this factory into useScope.
vi.mock("../audio/engine", () => {
  return {
    createScopeEngine: () => {
      let gain = 0;
      return {
        state: "idle",
        setSource: vi.fn(async () => {}),
        setMonitorGain: (g: number) => {
          gain = g;
        },
        getMonitorGain: () => gain,
        setAnalyserConfig: vi.fn(),
        getWaveform: () => new Float32Array(2048),
        getSpectrum: () => new Float32Array(1024).fill(-120),
        onFrame: (l: (f: unknown) => void) => {
          hoisted.listeners.add(l);
          return () => hoisted.listeners.delete(l);
        },
        resume: vi.fn(async () => {}),
        suspend: vi.fn(async () => {}),
        detach: vi.fn(),
        reset: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
});

// Import App AFTER the mock is registered.
import App, { canStopCapture, effectiveChannel } from "../App";

/** Push a frame through the mocked engine to every useScope subscriber. */
function emitFrame(f: AnalysisFrame): void {
  for (const l of hoisted.listeners) l(f);
}

describe("App capability detection", () => {
  let restoreCanvas: () => void;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    restoreCanvas = stubCanvas();
    // matchMedia is absent in jsdom; provide a no-match stub.
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }) as unknown as typeof window.matchMedia;
    }
  });

  afterEach(() => {
    restoreCanvas();
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  function setMediaDevices(value: unknown) {
    Object.defineProperty(navigator, "mediaDevices", {
      value,
      configurable: true,
    });
  }

  it("disables tab capture and shows a note when getDisplayMedia is absent", () => {
    // Mic exists, tab capture does not.
    setMediaDevices({ getUserMedia: vi.fn() });
    const view = render(createElement(App));

    const tabBtn = view.container.querySelector(
      'button[aria-label="Capture tab audio"]',
    ) as HTMLButtonElement;
    const micBtn = view.container.querySelector(
      'button[aria-label="Capture microphone"]',
    ) as HTMLButtonElement;

    expect(tabBtn.disabled).toBe(true);
    expect(micBtn.disabled).toBe(false);
    expect(view.container.textContent).toContain(
      "Chromium-based desktop browser",
    );
    view.unmount();
  });

  it("enables tab capture when getDisplayMedia is present", () => {
    setMediaDevices({ getUserMedia: vi.fn(), getDisplayMedia: vi.fn() });
    const view = render(createElement(App));
    const tabBtn = view.container.querySelector(
      'button[aria-label="Capture tab audio"]',
    ) as HTMLButtonElement;
    expect(tabBtn.disabled).toBe(false);
    expect(view.container.textContent).not.toContain(
      "Chromium-based desktop browser",
    );
    view.unmount();
  });

  it("renders the persistent local-only privacy line", () => {
    setMediaDevices({ getUserMedia: vi.fn(), getDisplayMedia: vi.fn() });
    const view = render(createElement(App));
    expect(view.container.textContent).toContain("Local-only — no upload");
    expect(view.container.textContent).toContain("not lab-grade");
    view.unmount();
  });
});

describe("App stop control", () => {
  it("allows stopping a capture that went muted (tracks are still held)", () => {
    expect(canStopCapture("muted")).toBe(true);
    expect(canStopCapture("live")).toBe(true);
    expect(canStopCapture("requesting")).toBe(true);
    expect(canStopCapture("idle")).toBe(false);
    expect(canStopCapture("ended")).toBe(false);
    expect(canStopCapture("error")).toBe(false);
  });
});

describe("App solo and reset behavior", () => {
  let restoreCanvas: () => void;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    hoisted.listeners.clear();
    restoreCanvas = stubCanvas();
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }) as unknown as typeof window.matchMedia;
    }
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn(), getDisplayMedia: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => {
    restoreCanvas();
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it("reads channel 0 when the soloed channel does not exist", () => {
    expect(effectiveChannel(1, 2)).toBe(1);
    expect(effectiveChannel(1, 1)).toBe(0); // Solo-R sticking on a mono source
    expect(effectiveChannel(0, 1)).toBe(0);
    expect(effectiveChannel("both", 2)).toBe(0);
  });

  it("resets solo to Both when the source becomes mono", async () => {
    const view = render(createElement(App));

    // Stereo frames enable L/R solo.
    await flush(() => emitFrame(frame([ch(), ch()])));
    const rBtn = view.container.querySelector(
      'button[aria-label="Solo right channel"]',
    ) as HTMLButtonElement;
    expect(rBtn.disabled).toBe(false);
    await flush(() => rBtn.click());
    expect(rBtn.getAttribute("aria-pressed")).toBe("true");

    // Switch to a mono source: solo must fall back to Both.
    await flush(() => emitFrame(frame([ch()])));
    expect(
      view.container
        .querySelector('button[aria-label="Solo right channel"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      view.container
        .querySelector('button[aria-label="Both channels"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    view.unmount();
  });

  it("clears the held CLIP badge on Reset session, even with no new frames", async () => {
    const view = render(createElement(App));

    // A clipped frame latches the badge; a clean one keeps it held.
    await flush(() => emitFrame(frame([ch({ clipCount: 5 })])));
    await flush(() => emitFrame(frame([ch({ clipCount: 0 })])));
    expect(
      view.container.querySelector(".clip")?.className,
    ).toContain("clip--held");

    const reset = view.container.querySelector(
      'button[aria-label="Reset session"]',
    ) as HTMLButtonElement;
    await flush(() => reset.click());
    expect(
      view.container.querySelector(".clip")?.className,
    ).not.toContain("clip--held");
    view.unmount();
  });
});
