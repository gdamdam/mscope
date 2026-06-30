import { describe, it, expect } from "vitest";
import { amplitudeHistogram, normalizeHistogram } from "./histogram";

describe("amplitudeHistogram", () => {
  it("returns [] for bins <= 0", () => {
    expect(amplitudeHistogram(new Float32Array([0, 0.5]), 0)).toEqual([]);
    expect(amplitudeHistogram(new Float32Array([0, 0.5]), -3)).toEqual([]);
  });

  it("result length equals bins", () => {
    const h = amplitudeHistogram(new Float32Array([0]), 7);
    expect(h).toHaveLength(7);
  });

  it("all-zero samples land in the center bucket (odd bins)", () => {
    const bins = 9;
    const h = amplitudeHistogram(new Float32Array(100).fill(0), bins);
    const center = Math.floor(bins / 2);
    expect(h[center]).toBe(100);
    // every other bucket empty
    const others = h.reduce((s, c, i) => (i === center ? s : s + c), 0);
    expect(others).toBe(0);
  });

  it("+1 lands in the last bucket, -1 in the first", () => {
    const bins = 8;
    const hPos = amplitudeHistogram(new Float32Array([1]), bins);
    expect(hPos[bins - 1]).toBe(1);
    const hNeg = amplitudeHistogram(new Float32Array([-1]), bins);
    expect(hNeg[0]).toBe(1);
  });

  it("clamps out-of-range samples into edge buckets", () => {
    const bins = 4;
    const h = amplitudeHistogram(new Float32Array([5, -5, 100, -100]), bins);
    expect(h[bins - 1]).toBe(2); // both > 1
    expect(h[0]).toBe(2); // both < -1
  });

  it("uniform spread distributes ~evenly across buckets", () => {
    const bins = 10;
    const n = 100000;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // uniform in [-1, 1)
      samples[i] = (i / n) * 2 - 1;
    }
    const h = amplitudeHistogram(samples, bins);
    const expected = n / bins;
    for (const c of h) {
      expect(Math.abs(c - expected)).toBeLessThan(expected * 0.05);
    }
    expect(h.reduce((a, b) => a + b, 0)).toBe(n);
  });

  it("respects the requested bin count", () => {
    for (const bins of [1, 2, 3, 16, 64]) {
      expect(amplitudeHistogram(new Float32Array([0.1, -0.2, 0.9]), bins)).toHaveLength(bins);
    }
  });
});

describe("normalizeHistogram", () => {
  it("peaks at 1 and scales the rest", () => {
    const out = normalizeHistogram([1, 2, 4, 8]);
    expect(out).toEqual([0.125, 0.25, 0.5, 1]);
    expect(Math.max(...out)).toBe(1);
  });

  it("all-zero counts -> all zeros", () => {
    expect(normalizeHistogram([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("empty input -> empty output", () => {
    expect(normalizeHistogram([])).toEqual([]);
  });

  it("produces heights within [0, 1]", () => {
    const out = normalizeHistogram([3, 0, 9, 6]);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
