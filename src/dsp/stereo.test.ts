import { describe, it, expect } from "vitest";
import { correlation, balance, stereoMetrics } from "./stereo";
import type { StereoBlock } from "./types";

/** Build a sine of `cycles` full periods across `n` samples, scaled by `amp`. */
function sine(n: number, cycles: number, amp = 1, phase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * cycles * i) / n + phase);
  }
  return out;
}

function negate(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = -x[i];
  return out;
}

describe("correlation", () => {
  it("returns ~1 for identical channels (L === R)", () => {
    const s = sine(2048, 5);
    expect(correlation(s, s)).toBeCloseTo(1, 5);
  });

  it("returns ~-1 for anti-phase channels (L === -R)", () => {
    const l = sine(2048, 5);
    const r = negate(l);
    expect(correlation(l, r)).toBeCloseTo(-1, 5);
  });

  it("returns ~0 for decorrelated channels (sine vs cosine, integer periods)", () => {
    const n = 4096;
    const l = sine(n, 8); // sin
    const r = sine(n, 8, 1, Math.PI / 2); // cos = sin shifted +90deg
    expect(correlation(l, r)).toBeCloseTo(0, 4);
  });

  it("returns 0 when both channels are silent (zero energy)", () => {
    const z = new Float32Array(512);
    expect(correlation(z, z)).toBe(0);
  });

  it("returns 0 when one channel is silent (denominator ~0)", () => {
    const l = sine(1024, 3);
    const z = new Float32Array(1024);
    expect(correlation(l, z)).toBe(0);
  });

  it("stays within [-1, 1]", () => {
    const l = sine(1024, 4, 3); // large amplitude
    const r = sine(1024, 4, 2);
    const c = correlation(l, r);
    expect(c).toBeGreaterThanOrEqual(-1);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("is invariant to a positive gain on a channel (scale-free)", () => {
    const l = sine(1024, 6);
    const r = sine(1024, 6, 0.25);
    expect(correlation(l, r)).toBeCloseTo(1, 5);
  });
});

describe("balance", () => {
  it("returns ~-1 when signal is only in L", () => {
    const l = sine(1024, 4);
    const r = new Float32Array(1024);
    expect(balance(l, r)).toBeCloseTo(-1, 6);
  });

  it("returns ~+1 when signal is only in R", () => {
    const l = new Float32Array(1024);
    const r = sine(1024, 4);
    expect(balance(l, r)).toBeCloseTo(1, 6);
  });

  it("returns ~0 for equal energy in both channels", () => {
    const l = sine(1024, 4);
    const r = sine(1024, 4); // same RMS
    expect(balance(l, r)).toBeCloseTo(0, 6);
  });

  it("returns 0 when both channels are silent", () => {
    const z = new Float32Array(256);
    expect(balance(z, z)).toBe(0);
  });

  it("stays within [-1, 1]", () => {
    const l = sine(512, 3, 5);
    const r = sine(512, 3, 0.001);
    const b = balance(l, r);
    expect(b).toBeGreaterThanOrEqual(-1);
    expect(b).toBeLessThanOrEqual(1);
  });
});

describe("stereoMetrics", () => {
  it("mono block (right === null) -> { correlation: 1, balance: 0 }", () => {
    const block: StereoBlock = { left: sine(1024, 4), right: null };
    expect(stereoMetrics(block)).toEqual({ correlation: 1, balance: 0 });
  });

  it("computes from L/R for stereo block", () => {
    const l = sine(2048, 5);
    const block: StereoBlock = { left: l, right: l };
    const m = stereoMetrics(block);
    expect(m.correlation).toBeCloseTo(1, 5);
    expect(m.balance).toBeCloseTo(0, 6);
  });

  it("reflects anti-phase + balance for distinct channels", () => {
    const l = sine(2048, 5);
    const r = negate(l);
    const m = stereoMetrics({ left: l, right: r });
    expect(m.correlation).toBeCloseTo(-1, 5);
    expect(m.balance).toBeCloseTo(0, 6); // equal energy
  });
});
