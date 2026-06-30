import { describe, it, expect } from "vitest";
import { GlitchDetector, countDiscontinuities } from "./glitch";

/** Build a Float32Array from a number generator. */
function gen(n: number, f: (i: number) => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f(i);
  return out;
}

describe("countDiscontinuities", () => {
  it("returns 0 for a smooth ramp (steps below threshold)", () => {
    const block = gen(100, (i) => i * 0.001); // step 0.001 << 0.5
    const { count, last } = countDiscontinuities(block, 0.5, null);
    expect(count).toBe(0);
    expect(last).toBeCloseTo(0.099, 6);
  });

  it("returns 0 for a sine with small per-sample steps", () => {
    const block = gen(512, (i) => Math.sin((2 * Math.PI * i) / 512));
    expect(countDiscontinuities(block, 0.5, null).count).toBe(0);
  });

  it("counts one large jump within a block", () => {
    const block = Float32Array.from([0, 0.1, 0.2, 1.0, 1.0]); // 0.2 -> 1.0 = 0.8
    expect(countDiscontinuities(block, 0.5, null).count).toBe(1);
  });

  it("counts multiple jumps within a block", () => {
    const block = Float32Array.from([0, 1, 0, 1, 0]); // 4 jumps of 1.0
    expect(countDiscontinuities(block, 0.5, null).count).toBe(4);
  });

  it("uses prev to detect a jump at the very first sample", () => {
    const block = Float32Array.from([1.0, 1.0]); // prev 0 -> 1.0 = jump
    expect(countDiscontinuities(block, 0.5, 0).count).toBe(1);
  });

  it("does not count the first sample when prev is null", () => {
    const block = Float32Array.from([1.0, 1.0]);
    expect(countDiscontinuities(block, 0.5, null).count).toBe(0);
  });

  it("treats the boundary as exactly threshold = not a glitch (strict >)", () => {
    const block = Float32Array.from([0, 0.5]); // diff exactly 0.5
    expect(countDiscontinuities(block, 0.5, null).count).toBe(0);
  });

  it("reports last as the final sample (or prev for an empty block)", () => {
    expect(countDiscontinuities(new Float32Array(0), 0.5, 0.7).last).toBe(0.7);
    expect(countDiscontinuities(new Float32Array(0), 0.5, null).last).toBe(0);
    expect(
      countDiscontinuities(Float32Array.from([0.3]), 0.5, null).last,
    ).toBeCloseTo(0.3, 6);
  });
});

describe("GlitchDetector", () => {
  it("counts zero glitches on a smooth ramp across blocks", () => {
    const d = new GlitchDetector(0.5);
    expect(d.process(gen(50, (i) => i * 0.001))).toBe(0);
    expect(d.process(gen(50, (i) => (50 + i) * 0.001))).toBe(0);
    expect(d.count).toBe(0);
  });

  it("returns the number of NEW glitches per block and accumulates count", () => {
    const d = new GlitchDetector(0.5);
    expect(d.process(Float32Array.from([0, 1, 0]))).toBe(2); // two jumps
    expect(d.count).toBe(2);
    expect(d.process(Float32Array.from([0, 0, 0]))).toBe(0); // 0 -> 0 boundary fine
    expect(d.count).toBe(2);
  });

  it("counts a jump across two consecutive process() calls exactly once (gapless)", () => {
    const d = new GlitchDetector(0.5);
    // First block ends at 0.0, second begins at 1.0 => boundary jump.
    expect(d.process(Float32Array.from([0, 0, 0]))).toBe(0);
    expect(d.process(Float32Array.from([1.0, 1.0, 1.0]))).toBe(1);
    expect(d.count).toBe(1);
  });

  it("does not flag the first sample of the first block", () => {
    const d = new GlitchDetector(0.5);
    // Starts high, but there is no previous sample yet => no boundary glitch.
    expect(d.process(Float32Array.from([1.0, 1.0]))).toBe(0);
    expect(d.count).toBe(0);
  });

  it("reset() clears count and forgets the last sample (boundary state)", () => {
    const d = new GlitchDetector(0.5);
    d.process(Float32Array.from([0, 0, 0]));
    expect(d.process(Float32Array.from([1.0]))).toBe(1); // boundary jump
    expect(d.count).toBe(1);

    d.reset();
    expect(d.count).toBe(0);
    // After reset, a fresh high first sample must NOT count (state forgotten).
    expect(d.process(Float32Array.from([1.0, 1.0]))).toBe(0);
    expect(d.count).toBe(0);
  });

  it("handles empty blocks without changing state", () => {
    const d = new GlitchDetector(0.5);
    d.process(Float32Array.from([0, 0]));
    expect(d.process(new Float32Array(0))).toBe(0);
    // Empty block must not erase the remembered last sample (0) -> jump detected.
    expect(d.process(Float32Array.from([1.0]))).toBe(1);
  });

  it("defaults threshold to 0.5", () => {
    const d = new GlitchDetector();
    expect(d.process(Float32Array.from([0, 0.5]))).toBe(0); // exactly 0.5, strict >
    expect(d.process(Float32Array.from([1.2]))).toBe(1); // 0.5 -> 1.2 = 0.7
  });
});
