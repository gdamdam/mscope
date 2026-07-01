import { describe, expect, it } from "vitest";
import { truePeakDb, upsample, getPolyphase, TruePeakMeter } from "./truePeak";
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

describe("polyphase coefficient cache", () => {
  it("reuses one coefficient set per factor instead of rebuilding each call", () => {
    // truePeakDb runs on the realtime audio thread; the FIR coefficients must be
    // built once and memoized, not reallocated on every call.
    const a = getPolyphase(4);
    const b = getPolyphase(4);
    expect(b).toBe(a); // same cached object — no per-call rebuild/allocation
  });

  it("caches independently per factor", () => {
    expect(getPolyphase(2)).not.toBe(getPolyphase(4));
    expect(getPolyphase(2)).toBe(getPolyphase(2));
  });

  it("cached coefficients are a normalized sub-filter bank (unity DC gain per phase)", () => {
    const { taps, coeffs } = getPolyphase(4);
    expect(coeffs.length).toBe(4 * taps);
    for (let p = 0; p < 4; p++) {
      let sum = 0;
      for (let t = 0; t < taps; t++) sum += coeffs[p * taps + t];
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

/**
 * A Hann-windowed fs/4 burst whose single true crest sits exactly half a sample
 * off the grid, at t = boundary - 0.5 (i.e. between samples boundary-1 and
 * boundary). s(t) = amp * cos(pi/2 * (t - c)) * hann(t - c), c = boundary - 0.5.
 * Both factors are <= 1 with equality only at t = c, so the analytic continuous
 * peak is exactly `amp` — and it falls between two stored samples (each only
 * ~0.70*amp). Neighboring carrier crests (4 samples away) are attenuated by the
 * envelope, so a meter that can't see across the boundary under-reads.
 */
function boundaryBurst(
  total: number,
  boundary: number,
  amp: number,
  winLen: number,
): Float32Array {
  const s = new Float32Array(total);
  const c = boundary - 0.5;
  for (let i = 0; i < total; i++) {
    const d = i - c;
    if (Math.abs(d) <= winLen / 2) {
      const env = 0.5 * (1 + Math.cos((2 * Math.PI * d) / winLen));
      s[i] = amp * Math.cos((Math.PI / 2) * d) * env;
    }
  }
  return s;
}

describe("TruePeakMeter (stateful, frame-boundary aware)", () => {
  it("catches an inter-sample peak straddling a frame boundary", () => {
    const amp = 0.9;
    const boundary = 128;
    // winLen 16: narrow enough that the in-frame carrier crests are strongly
    // envelope-attenuated (with wider windows the replicate-edge ringing of the
    // stateless path over-reads instead — also wrong, but not an under-read).
    const s = boundaryBurst(256, boundary, amp, 16);
    const f1 = s.subarray(0, boundary);
    const f2 = s.subarray(boundary);
    const analytic = linToDb(amp); // ~ -0.915 dBTP

    // The old stateless per-frame path never sees the crest: neither frame
    // contains it, and the nearest in-frame carrier crest is envelope-attenuated.
    const stateless = Math.max(truePeakDb(f1), truePeakDb(f2));
    expect(stateless).toBeLessThan(analytic - 0.5);

    // The stateful meter carries the FIR history across the boundary and
    // recovers the true excursion.
    const meter = new TruePeakMeter(4);
    const measured = Math.max(meter.process(f1), meter.process(f2));
    expect(Math.abs(measured - analytic)).toBeLessThan(0.1);
  });

  it("is framing-invariant: one long buffer == arbitrary frame splits", () => {
    const rng = mulberry32(4242);
    const n = 1000;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = rng() * 2 - 1;

    const whole = new TruePeakMeter(4);
    const wholeMax = whole.process(s);

    const chunked = new TruePeakMeter(4);
    const sizes = [7, 128, 1, 300, 64, 3, 497]; // sums to 1000
    let off = 0;
    let chunkedMax = DB_FLOOR;
    for (const size of sizes) {
      chunkedMax = Math.max(chunkedMax, chunked.process(s.subarray(off, off + size)));
      off += size;
    }
    expect(off).toBe(n);
    expect(Math.abs(chunkedMax - wholeMax)).toBeLessThan(1e-6);
  });

  it("reset() drops the carried tail", () => {
    const hot = sine(256, 0.25, 1.0, Math.PI / 4); // ~0 dBTP tone
    const quiet = new Float32Array(256).fill(0.05); // -26.02 dBFS constant

    // Without reset, the deferred boundary region of the hot tone is (correctly)
    // reported in the next frame:
    const carried = new TruePeakMeter(4);
    carried.process(hot);
    expect(carried.process(quiet)).toBeGreaterThan(-6);

    // With reset, the history is gone and the quiet frame reads its own level.
    const meter = new TruePeakMeter(4);
    meter.process(hot);
    meter.reset();
    expect(meter.process(quiet)).toBeCloseTo(linToDb(0.05), 1);
  });

  it("returns DB_FLOOR for an empty frame without disturbing state", () => {
    const meter = new TruePeakMeter(4);
    expect(meter.process(new Float32Array(0))).toBe(DB_FLOOR);
    // A hot tone straddled around an empty push still reads correctly.
    const s = boundaryBurst(256, 128, 0.9, 32);
    const a = meter.process(s.subarray(0, 128));
    expect(meter.process(new Float32Array(0))).toBe(DB_FLOOR);
    const b = meter.process(s.subarray(128));
    expect(Math.max(a, b)).toBeGreaterThan(linToDb(0.9) - 0.1);
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
