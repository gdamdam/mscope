import { describe, it, expect } from "vitest";
import { Monitor } from "./monitor";

/** Minimal fake GainNode: only the `gain.value` AudioParam matters here. */
function fakeGainNode(): GainNode {
  return { gain: { value: 1 } } as unknown as GainNode;
}

/** Minimal fake AudioContext exposing just createGain. */
function fakeContext(): AudioContext {
  return {
    createGain: () => fakeGainNode(),
  } as unknown as AudioContext;
}

describe("Monitor", () => {
  it("defaults to muted (gain 0)", () => {
    const monitor = new Monitor(fakeContext());
    expect(monitor.getGain()).toBe(0);
    expect(monitor.node.gain.value).toBe(0);
  });

  it("exposes the underlying GainNode via node", () => {
    const monitor = new Monitor(fakeContext());
    expect(monitor.node).toBeDefined();
    expect(typeof monitor.node.gain.value).toBe("number");
  });

  it("sets gain within [0,1]", () => {
    const monitor = new Monitor(fakeContext());
    monitor.setGain(0.5);
    expect(monitor.getGain()).toBe(0.5);
    monitor.setGain(1);
    expect(monitor.getGain()).toBe(1);
  });

  it("clamps gain below 0 to 0", () => {
    const monitor = new Monitor(fakeContext());
    monitor.setGain(-2);
    expect(monitor.getGain()).toBe(0);
  });

  it("clamps gain above 1 to 1", () => {
    const monitor = new Monitor(fakeContext());
    monitor.setGain(5);
    expect(monitor.getGain()).toBe(1);
  });
});
