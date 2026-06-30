import { describe, expect, it } from "vitest";
import { truePeakDb, upsample } from "./truePeak";
import { DB_FLOOR, linToDb } from "./util";

/** Build `n` samples of a sine: amp*sin(2*pi*freq/fs * i + phase). */
function sine(n: number, freqOverFs: number, amp: number, phase: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin(2 * Math.PI * freqOverFs * i + phase);
  }
  return out;
}

/** Plain sample-peak in dBFS (no interpolation). */
function samplePeakDb(s: Float32Array): number {
  let m = 0;
  for (let i = 0; i < s.length; i++) {
    const a = Math.abs(s[i]);
    if (a > m) m = a;
  }
  return linToDb(m);
}

/** Mulberry32 — tiny deterministic PRNG so the "random" fixtures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("truePeakDb", () => {
  it("returns DB_FLOOR for empty input", () => {
    expect(truePeakDb(new Float32Array(0))).toBe(DB_FLOOR);
  });

  it("recovers inter-sample overshoot (fs/4 sine at pi/4 phase)", () => {
    // amp 1.0 at fs/4 with phase pi/4 -> repeating [+0.7071, +0.7071, -0.7071, -0.7071]
    // sample peak ~ -3.01 dBFS but true continuous peak is 0 dBTP.
    const s = sine(256, 0.25, 1.0, Math.PI / 4);
    // Confirm the fixture's sample peak really is ~0.7071 (the trap we must beat).
    expect(samplePeakDb(s)).toBeLessThan(-2.5);
    expect(samplePeakDb(s)).toBeGreaterThan(-3.5);
    // True peak should recover the overshoot: well above the sample peak, near 0 dBTP.
    expect(truePeakDb(s)).toBeGreaterThanOrEqual(-0.5);
  });

  it("no-overshoot: constant 0.5 -> truePeak ~= samplePeak", () => {
    const s = new Float32Array(128).fill(0.5);
    const tp = truePeakDb(s);
    const sp = samplePeakDb(s); // 20*log10(0.5) ~ -6.02 dB
    expect(tp).toBeCloseTo(sp, 1);
  });

  it("no-overshoot: sine sampled exactly on its peaks -> truePeak ~= samplePeak", () => {
    // freq fs/4, phase pi/2: samples land on [+1, 0, -1, 0, ...] -> peaks captured.
    const s = sine(256, 0.25, 1.0, Math.PI / 2);
    const tp = truePeakDb(s);
    const sp = samplePeakDb(s);
    // Sample peak already 0 dBFS; true peak must not overshoot meaningfully.
    expect(tp).toBeCloseTo(sp, 1);
    expect(tp).toBeLessThan(0.5);
  });

  it("full-scale DC (all 1.0) -> ~0 dBTP", () => {
    const s = new Float32Array(64).fill(1.0);
    expect(truePeakDb(s)).toBeCloseTo(0, 1);
  });

  it("true peak >= sample peak (minus tiny tolerance) for seeded random fixtures", () => {
    const tol = 1e-6;
    for (const seed of [1, 7, 42, 1337, 99991]) {
      const rng = mulberry32(seed);
      const n = 200 + Math.floor(rng() * 200);
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) s[i] = rng() * 2 - 1; // [-1, 1)
      const tp = truePeakDb(s);
      const sp = samplePeakDb(s);
      expect(tp).toBeGreaterThanOrEqual(sp - tol);
    }
  });
});

describe("upsample", () => {
  it("factor 1 returns the same values", () => {
    const s = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    const up = upsample(s, 1);
    expect(up.length).toBe(s.length);
    for (let i = 0; i < s.length; i++) expect(up[i]).toBeCloseTo(s[i], 6);
  });

  it("preserves original samples at the integer grid (factor 4)", () => {
    const s = sine(64, 0.1, 0.8, 0.3);
    const factor = 4;
    const up = upsample(s, factor);
    expect(up.length).toBe(s.length * factor);
    // Original samples reappear (approximately) at multiples of `factor`.
    for (let i = 0; i < s.length; i++) {
      expect(up[i * factor]).toBeCloseTo(s[i], 3);
    }
  });
});
