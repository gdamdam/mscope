import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "./testRender";
import { InputStatus } from "./InputStatus";
import type { AudioInputState } from "../audio/input/AudioInputSource";

const STATES: AudioInputState[] = [
  "idle",
  "requesting",
  "live",
  "muted",
  "ended",
  "error",
];

describe("InputStatus", () => {
  it("renders for every AudioInputState without throwing", () => {
    for (const state of STATES) {
      const error = state === "error" ? new Error("boom") : null;
      const view = render(
        createElement(InputStatus, {
          kind: "microphone",
          state,
          error,
          canStop: state === "live",
          onStop: () => {},
        }),
      );
      // A status pill is always present.
      const pill = view.container.querySelector(".status");
      expect(pill).not.toBeNull();
      expect(pill?.className).toContain(`status--${state}`);
      view.unmount();
    }
  });

  it("surfaces the tab no-audio-track re-share hint via the source error", () => {
    const view = render(
      createElement(InputStatus, {
        kind: "tab-capture",
        state: "error" as AudioInputState,
        error: new Error("No audio track — re-share and enable 'Share tab audio'."),
        canStop: false,
        onStop: () => {},
      }),
    );
    expect(view.container.textContent).toContain("Share tab audio");
    // Error hint is announced as an alert.
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
    view.unmount();
  });

  it("keeps Stop enabled while a live capture is muted", () => {
    // A muted mic/tab capture still holds tracks; the user must be able to stop.
    const view = render(
      createElement(InputStatus, {
        kind: "microphone",
        state: "muted" as AudioInputState,
        error: null,
        canStop: true,
        onStop: () => {},
      }),
    );
    const stop = view.container.querySelector(
      'button[aria-label="Stop capture"]',
    ) as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    view.unmount();
  });

  it("disables Stop when there is nothing to stop", () => {
    const view = render(
      createElement(InputStatus, {
        kind: null,
        state: "idle" as AudioInputState,
        error: null,
        canStop: false,
        onStop: () => {},
      }),
    );
    const stop = view.container.querySelector(
      'button[aria-label="Stop capture"]',
    ) as HTMLButtonElement;
    expect(stop.disabled).toBe(true);
    view.unmount();
  });
});
