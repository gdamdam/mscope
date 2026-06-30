import { describe, it, expect } from "vitest";
import { loudnessRange } from "./loudnessRange";

describe("loudnessRange (EBU R128 / Tech 3342 LRA)", () => {
  it("returns 0 for an empty input", () => {
    expect(loudnessRange([])).toBe(0);
  });

  it("returns 0 when fewer than 2 usable values remain", () => {
    expect(loudnessRange([-23])).toBe(0);
    // one usable value (the rest dropped by absolute/non-finite gating)
    expect(loudnessRange([-23, -Infinity, -90])).toBe(0);
  });

  it("returns ~0 for constant loudness", () => {
    const lra = loudnessRange(new Array(100).fill(-23));
    expect(lra).toBeCloseTo(0, 6);
  });

  it("excludes -Infinity, NaN and sub-(-70) LUFS values from the computation", () => {
    // Without the bad values, this is constant -23 LUFS => LRA ~ 0.
    const withBad = [-23, -23, -23, -Infinity, NaN, -90, -23, -23];
    const clean = [-23, -23, -23, -23, -23];
    expect(loudnessRange(withBad)).toBeCloseTo(loudnessRange(clean), 6);
    expect(loudnessRange(withBad)).toBeCloseTo(0, 6);
  });

  it("never returns a negative value", () => {
    expect(loudnessRange([-30, -25, -20, -15, -10])).toBeGreaterThanOrEqual(0);
  });

  it("computes P95 - P10 with linear interpolation on a known evenly-spaced set", () => {
    // 101 values from -50..0 LUFS, step 0.5. Mean (LUFS domain) ~ -25,
    // relative gate = mean - 20 ~ -45, so values >= -45 survive (most of them).
    // We compute the expectation independently below to assert exact interpolation.
    const values: number[] = [];
    for (let i = 0; i <= 100; i++) values.push(-50 + 0.5 * i); // -50 .. 0

    const expected = expectedLra(values);
    expect(loudnessRange(values)).toBeCloseTo(expected, 6);
    expect(loudnessRange(values)).toBeGreaterThan(0);
  });

  it("matches a hand-computed P95-P10 on a small relative-gated set", () => {
    // Tight cluster so nothing is dropped by the -20 LU relative gate.
    const values = [-24, -23, -22, -21, -20];
    // sorted same; P10 and P95 via (n-1)*p index, linear interpolation:
    // n=5 => P10 idx = 4*0.10 = 0.4 -> -24 + 0.4*( -23 - -24) = -23.6
    //        P95 idx = 4*0.95 = 3.8 -> -21 + 0.8*( -20 - -21) = -20.2
    // LRA = -20.2 - (-23.6) = 3.4
    expect(loudnessRange(values)).toBeCloseTo(3.4, 6);
  });
});

/** Independent reference implementation used only to validate the evenly-spaced case. */
function expectedLra(input: number[]): number {
  const finite = input.filter((v) => Number.isFinite(v));
  const absGated = finite.filter((v) => v >= -70);
  if (absGated.length < 2) return 0;
  // mean in energy domain
  const meanEnergy =
    absGated.reduce((s, v) => s + Math.pow(10, v / 10), 0) / absGated.length;
  const meanLufs = 10 * Math.log10(meanEnergy);
  const relThresh = meanLufs - 20;
  const relGated = absGated.filter((v) => v >= relThresh).sort((a, b) => a - b);
  if (relGated.length < 2) return 0;
  const pct = (p: number): number => {
    const idx = (relGated.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return relGated[lo];
    return relGated[lo] + (idx - lo) * (relGated[hi] - relGated[lo]);
  };
  return Math.max(0, pct(0.95) - pct(0.1));
}
