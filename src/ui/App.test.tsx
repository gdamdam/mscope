import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { stubCanvas } from "./testFakes";

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
        getWaveform: () => new Float32Array(2048),
        getSpectrum: () => new Float32Array(1024).fill(-120),
        onFrame: () => () => {},
        resume: vi.fn(async () => {}),
        suspend: vi.fn(async () => {}),
        reset: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
});

// Import App AFTER the mock is registered.
import App from "../App";

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
