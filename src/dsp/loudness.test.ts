import { describe, it, expect } from "vitest";
import {
  LoudnessMeter,
  kWeightGainDb,
  kWeightCoefficients,
  type LoudnessSnapshot,
} from "./loudness";

/**
 * Deterministic test signals. We synthesize K-weighting compliance tones
 * in-test (no file downloads) per the ITU-R BS.1770-4 / EBU R128 spec.
 *
 * IMPORTANT: expectations below are HARD-CODED from the BS.1770-4 spec tables
 * and from analytically derived values — never from the implementation under
 * test (a previous version of this file derived expectations from
 * `kWeightGainDb` itself, which let wrong filter coefficients pass).
 */

/**
 * Feed `seconds` of a steady sine to a meter in `blk`-sample blocks.
 * `mode` "dual" puts the identical tone in L and R; "left-only" puts the
 * tone in L and silence in R.
 */
function feedSine(
  meter: LoudnessMeter,
  amp: number,
  freq: number,
  sampleRate: number,
  seconds: number,
  mode: "dual" | "left-only" = "dual",
  blk = 4800,
): void {
  const total = Math.round(seconds * sampleRate);
  let done = 0;
  const w = (2 * Math.PI * freq) / sampleRate;
  while (done < total) {
    const n = Math.min(blk, total - done);
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = amp * Math.sin(w * (done + i));
      left[i] = v;
      if (mode === "dual") right[i] = v;
    }
    meter.process({ left, right });
    done += n;
  }
}

describe("K-weighting biquad coefficients vs BS.1770-4 spec table (fs = 48 kHz)", () => {
  // Reference coefficients straight from ITU-R BS.1770-4 Annex 1, Tables 1 & 2.
  it("stage 1 (high shelf) matches the spec table to 1e-9", () => {
    const [s1] = kWeightCoefficients(48000);
    expect(Math.abs(s1.b0 - 1.53512485958697)).toBeLessThan(1e-9);
    expect(Math.abs(s1.b1 - -2.69169618940638)).toBeLessThan(1e-9);
    expect(Math.abs(s1.b2 - 1.19839281085285)).toBeLessThan(1e-9);
    expect(Math.abs(s1.a1 - -1.69065929318241)).toBeLessThan(1e-9);
    expect(Math.abs(s1.a2 - 0.73248077421585)).toBeLessThan(1e-9);
  });

  it("stage 2 (RLB high-pass) matches the spec table to 1e-9", () => {
    const [, s2] = kWeightCoefficients(48000);
    // The spec numerator is the UNNORMALIZED [1, -2, 1].
    expect(Math.abs(s2.b0 - 1)).toBeLessThan(1e-12);
    expect(Math.abs(s2.b1 - -2)).toBeLessThan(1e-12);
    expect(Math.abs(s2.b2 - 1)).toBeLessThan(1e-12);
    expect(Math.abs(s2.a1 - -1.99004745483398)).toBeLessThan(1e-9);
    expect(Math.abs(s2.a2 - 0.99007225036621)).toBeLessThan(1e-9);
  });
});

describe("kWeightGainDb", () => {
  it("cascade gain at 997 Hz (48k) is +0.691 dB (±0.001) — the BS.1770 offset", () => {
    // This is where the spec's -0.691 loudness constant comes from.
    expect(Math.abs(kWeightGainDb(997, 48000) - 0.691)).toBeLessThan(0.001);
  });
  it("matches the BS.1770 high-shelf: ~+4 dB asymptote at high freq (48k)", () => {
    // RLB high-pass ~unity well above its corner; the high-shelf adds ~+4 dB.
    expect(kWeightGainDb(10000, 48000)).toBeGreaterThan(3);
    expect(kWeightGainDb(10000, 48000)).toBeLessThan(5);
  });
  it("strongly attenuates very low frequencies (RLB high-pass)", () => {
    expect(kWeightGainDb(20, 48000)).toBeLessThan(-10);
  });
  it("is computed for arbitrary fs (44.1k 997 Hz gain ~matches 48k, ±0.05 dB)", () => {
    // Re-derived per-fs via bilinear transform — near-identical at audio rates.
    expect(kWeightGainDb(997, 44100)).toBeCloseTo(kWeightGainDb(997, 48000), 1);
  });
});

describe("LoudnessMeter calibration (BS.1770-4 / EBU Tech 3341)", () => {
  // BS.1770-4: "If a 0 dB FS, 997 Hz sine wave is applied to the left, centre,
  // or right channel input, the indicated loudness will equal −3.01 LKFS."
  it("0 dBFS 997 Hz sine in the LEFT channel only reads -3.01 LUFS (±0.01, 48k)", () => {
    const m = new LoudnessMeter(48000);
    feedSine(m, 1.0, 997, 48000, 5, "left-only");
    expect(Math.abs(m.snapshot().integratedLufs - -3.0103)).toBeLessThan(0.01);
  });

  // Dual-mono sums two identical channels with G = 1 each: +3.01 dB above the
  // single-channel case, i.e. 0.00 LUFS. This matches EBU Tech 3341 case 1
  // scaling (in-phase stereo sine at X dBFS reads X LUFS at ~1 kHz).
  it("0 dBFS 997 Hz sine identical in L and R reads 0.00 LUFS (±0.01, 48k)", () => {
    const m = new LoudnessMeter(48000);
    feedSine(m, 1.0, 997, 48000, 5, "dual");
    expect(Math.abs(m.snapshot().integratedLufs - 0.0)).toBeLessThan(0.01);
  });

  it("same dual-mono 0 dBFS 997 Hz calibration at 44.1 kHz (±0.05)", () => {
    const m = new LoudnessMeter(44100);
    feedSine(m, 1.0, 997, 44100, 5, "dual");
    expect(Math.abs(m.snapshot().integratedLufs - 0.0)).toBeLessThan(0.05);
  });

  it("-6.02 dBFS (amp 0.5) dual-mono 997 Hz reads -6.02 LUFS (±0.01, 48k)", () => {
    const m = new LoudnessMeter(48000);
    feedSine(m, 0.5, 997, 48000, 5, "dual");
    expect(Math.abs(m.snapshot().integratedLufs - -6.0206)).toBeLessThan(0.01);
  });
});

describe("EBU Tech 3341 relative behavior", () => {
  it("a 10 LU quieter tone reads ~10 LU lower (±0.1)", () => {
    const sr = 48000;
    const loudAmp = 0.5;
    const quietAmp = loudAmp * Math.pow(10, -10 / 20); // -10 dB amplitude => -10 LU
    const a = new LoudnessMeter(sr);
    const b = new LoudnessMeter(sr);
    feedSine(a, loudAmp, 997, sr, 5);
    feedSine(b, quietAmp, 997, sr, 5);
    const la = a.snapshot().integratedLufs;
    const lb = b.snapshot().integratedLufs;
    expect(la - lb).toBeCloseTo(10, 1);
  });
});

describe("steady-state equality", () => {
  it("momentary ≈ shortTerm ≈ integrated for a long steady tone (±0.1)", () => {
    const sr = 48000;
    const m = new LoudnessMeter(sr);
    feedSine(m, 0.5, 997, sr, 6);
    const s = m.snapshot();
    expect(s.momentaryLufs).toBeCloseTo(s.integratedLufs, 1);
    expect(s.shortTermLufs).toBeCloseTo(s.integratedLufs, 1);
    expect(s.momentaryLufs).toBeCloseTo(s.shortTermLufs, 1);
  });
});

describe("gating blocks: 400 ms with 75% overlap (100 ms hop)", () => {
  it("loud material confined to the final 300 ms affects integrated loudness", () => {
    // 2.0 s of quiet tone is an exact multiple of 400 ms, so with
    // NON-overlapping blocks the trailing 300 ms loud burst would fall
    // entirely into a discarded partial block and integrated loudness would
    // ignore it. With the spec's 100 ms hop, blocks starting at 1.7/1.8/1.9 s
    // capture the burst.
    const sr = 48000;
    const quietOnly = new LoudnessMeter(sr);
    feedSine(quietOnly, 0.1, 997, sr, 2.0);
    const quietInteg = quietOnly.snapshot().integratedLufs;

    const m = new LoudnessMeter(sr);
    feedSine(m, 0.1, 997, sr, 2.0);
    feedSine(m, 0.5, 997, sr, 0.3);
    const integ = m.snapshot().integratedLufs;

    expect(integ).toBeGreaterThan(quietInteg + 1);
  });

  it("overlap does not change the result for a steady tone (still -6.02 LUFS)", () => {
    const m = new LoudnessMeter(48000);
    feedSine(m, 0.5, 997, 48000, 5);
    expect(Math.abs(m.snapshot().integratedLufs - -6.0206)).toBeLessThan(0.02);
  });

  it("incremental feeding in odd-sized chunks matches one-shot feeding exactly", () => {
    const sr = 48000;
    const oneShot = new LoudnessMeter(sr);
    feedSine(oneShot, 0.5, 997, sr, 2.5, "dual", Math.round(2.5 * sr));
    const chunked = new LoudnessMeter(sr);
    feedSine(chunked, 0.5, 997, sr, 2.5, "dual", 1234);
    const a = oneShot.snapshot();
    const b = chunked.snapshot();
    expect(Math.abs(a.integratedLufs - b.integratedLufs)).toBeLessThan(1e-9);
    expect(Math.abs(a.momentaryLufs - b.momentaryLufs)).toBeLessThan(1e-9);
    expect(Math.abs(a.shortTermLufs - b.shortTermLufs)).toBeLessThan(1e-9);
  });
});

describe("absolute gating (-70 LUFS)", () => {
  it("near-silence after a loud tone is excluded from integrated (±0.2)", () => {
    const sr = 48000;
    const amp = 0.5;
    const loudOnly = new LoudnessMeter(sr);
    feedSine(loudOnly, amp, 997, sr, 5);
    const loudInteg = loudOnly.snapshot().integratedLufs;

    const m = new LoudnessMeter(sr);
    feedSine(m, amp, 997, sr, 5);
    // 5 s of -80 dBFS near-silence: well under the -70 LUFS absolute gate.
    feedSine(m, Math.pow(10, -80 / 20), 997, sr, 5);
    const integ = m.snapshot().integratedLufs;

    // Silence (-80 dBFS K-weighted ≈ -80 LUFS) is below the -70 LUFS absolute
    // gate, so it is excluded. Small residual comes from blocks straddling
    // the tone/silence boundary; spec tolerance ±0.2.
    expect(Math.abs(integ - loudInteg)).toBeLessThan(0.2);
  });
});

describe("silence / reset", () => {
  it("returns -Infinity for a fresh (empty) meter", () => {
    const m = new LoudnessMeter(48000);
    const s: LoudnessSnapshot = m.snapshot();
    expect(s.integratedLufs).toBe(-Infinity);
    expect(s.momentaryLufs).toBe(-Infinity);
    expect(s.shortTermLufs).toBe(-Infinity);
  });

  it("reset() clears all accumulated state", () => {
    const m = new LoudnessMeter(48000);
    feedSine(m, 0.5, 997, 48000, 4);
    m.reset();
    const s = m.snapshot();
    expect(s.integratedLufs).toBe(-Infinity);
    expect(s.momentaryLufs).toBe(-Infinity);
    expect(s.shortTermLufs).toBe(-Infinity);
  });
});
