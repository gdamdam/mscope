import { describe, it, expect } from "vitest";
import { MetersCore } from "./meters-core";
import { DEFAULT_ANALYSIS_CONFIG } from "../dsp/types";
import { DB_FLOOR } from "../dsp/util";
import type { AnalysisFrame } from "./engineTypes";

const SR = 48000;
const QUANTUM = 128;

/** Push `count` quanta of a synthesized mono/stereo signal via `fn(channel, sampleIndex)`. */
function pushSignal(
  core: MetersCore,
  channels: number,
  totalSamples: number,
  fn: (channel: number, n: number) => number,
): void {
  let done = 0;
  while (done < totalSamples) {
    const n = Math.min(QUANTUM, totalSamples - done);
    const chans = Array.from({ length: channels }, (_unused, c) => {
      const buf = new Float32Array(n);
      for (let i = 0; i < n; i++) buf[i] = fn(c, done + i);
      return buf;
    });
    core.pushQuantum(chans);
    done += n;
  }
}

describe("MetersCore", () => {
  it("reports silence as silent with floored peak/rms (mono)", () => {
    const core = new MetersCore(SR);
    pushSignal(core, 1, SR / 2, () => 0); // 0.5 s of silence
    const frame = core.buildFrame();

    expect(frame.metrics.channelCount).toBe(1);
    expect(frame.metrics.stereo).toBeNull();
    expect(frame.metrics.signal.silent).toBe(true);
    expect(frame.metrics.channels[0].peakDb).toBe(DB_FLOOR);
    expect(frame.metrics.channels[0].rmsDb).toBe(DB_FLOOR);
    expect(frame.metrics.channels[0].truePeakDb).toBe(DB_FLOOR);
    expect(frame.metrics.channels[0].clippedNow).toBe(false);
    expect(frame.metrics.channels[0].clipCount).toBe(0);
  });

  it("flags a full-scale square as clipping (clippedNow + peak ~0 dBFS)", () => {
    const core = new MetersCore(SR);
    // Alternating +1/-1 full-scale square wave (well above clipThreshold).
    pushSignal(core, 1, SR / 4, (_c, n) => (n % 2 === 0 ? 1 : -1));
    const frame = core.buildFrame();

    const ch = frame.metrics.channels[0];
    expect(ch.clippedNow).toBe(true);
    expect(ch.clipCount).toBeGreaterThan(0);
    expect(ch.peakDb).toBeCloseTo(0, 5);
    // Full-scale square: RMS == peak == 0 dBFS, not silent.
    expect(frame.metrics.signal.silent).toBe(false);
    expect(ch.truePeakDb).toBeGreaterThan(-1);
  });

  it("computes sane levels for a 0.5-amplitude sine (mono, not clipping)", () => {
    const core = new MetersCore(SR);
    const freq = 1000;
    const w = (2 * Math.PI * freq) / SR;
    pushSignal(core, 1, SR, (_c, n) => 0.5 * Math.sin(w * n)); // 1 s sine
    const frame = core.buildFrame();

    const ch = frame.metrics.channels[0];
    expect(ch.clippedNow).toBe(false);
    expect(ch.clipCount).toBe(0);
    // Peak ~ -6 dBFS (20*log10(0.5)).
    expect(ch.peakDb).toBeCloseTo(-6.02, 1);
    // RMS of a sine at amp 0.5 ~ 0.5/sqrt(2) ~ -9 dBFS.
    expect(ch.rmsDb).toBeCloseTo(-9.03, 1);
    expect(frame.metrics.signal.silent).toBe(false);
    expect(frame.metrics.signal.lowSignal).toBe(false);
  });

  it("reports correlation ~1 for identical stereo channels", () => {
    const core = new MetersCore(SR);
    const w = (2 * Math.PI * 1000) / SR;
    pushSignal(core, 2, SR / 2, (_c, n) => 0.5 * Math.sin(w * n));
    const frame = core.buildFrame();

    expect(frame.metrics.channelCount).toBe(2);
    expect(frame.metrics.stereo).not.toBeNull();
    expect(frame.metrics.stereo!.correlation).toBeCloseTo(1, 2);
    expect(frame.metrics.stereo!.balance).toBeCloseTo(0, 2);
  });

  it("reports correlation ~-1 for anti-phase stereo channels", () => {
    const core = new MetersCore(SR);
    const w = (2 * Math.PI * 1000) / SR;
    pushSignal(core, 2, SR / 2, (c, n) => {
      const v = 0.5 * Math.sin(w * n);
      return c === 0 ? v : -v; // right is inverted left
    });
    const frame = core.buildFrame();

    expect(frame.metrics.stereo).not.toBeNull();
    expect(frame.metrics.stereo!.correlation).toBeCloseTo(-1, 2);
  });

  it("produces finite/sane loudness for a steady signal and -Inf for silence", () => {
    const silent = new MetersCore(SR);
    pushSignal(silent, 2, SR, () => 0);
    const silentFrame: AnalysisFrame = silent.buildFrame();
    expect(silentFrame.loudness.integratedLufs).toBe(-Infinity);
    expect(silentFrame.loudness.momentaryLufs).toBe(-Infinity);

    const loud = new MetersCore(SR);
    const w = (2 * Math.PI * 1000) / SR;
    pushSignal(loud, 2, SR, (_c, n) => 0.5 * Math.sin(w * n));
    const loudFrame = loud.buildFrame();
    expect(Number.isFinite(loudFrame.loudness.momentaryLufs)).toBe(true);
    expect(loudFrame.loudness.momentaryLufs).toBeGreaterThan(-40);
    expect(loudFrame.loudness.momentaryLufs).toBeLessThan(0);
  });

  it("accumulates clipCount cumulatively across pushes within a session", () => {
    const core = new MetersCore(SR);
    pushSignal(core, 1, QUANTUM, () => 1); // one quantum, all clipping
    const first = core.buildFrame().metrics.channels[0].clipCount;
    expect(first).toBe(QUANTUM);

    pushSignal(core, 1, QUANTUM, () => 1); // another full-clipping quantum
    const second = core.buildFrame().metrics.channels[0].clipCount;
    expect(second).toBe(2 * QUANTUM);
  });

  it("reset() clears cumulative clip count, loudness and time", () => {
    const core = new MetersCore(SR);
    pushSignal(core, 2, SR, (_c, n) => (n % 2 === 0 ? 1 : -1));
    let frame = core.buildFrame();
    expect(frame.metrics.channels[0].clipCount).toBeGreaterThan(0);
    expect(frame.metrics.timeMs).toBeGreaterThan(0);

    core.reset();
    // Push a short bit of silence so we have a channel to report.
    pushSignal(core, 2, QUANTUM, () => 0);
    frame = core.buildFrame();
    expect(frame.metrics.channels[0].clipCount).toBe(0);
    expect(frame.loudness.integratedLufs).toBe(-Infinity);
    // timeMs reflects only post-reset samples (one quantum).
    expect(frame.metrics.timeMs).toBeCloseTo((QUANTUM / SR) * 1000, 5);
  });

  it("timeMs reflects total samples processed at the context sample rate", () => {
    const core = new MetersCore(SR);
    pushSignal(core, 1, SR, () => 0); // exactly 1 s
    const frame = core.buildFrame();
    expect(frame.metrics.timeMs).toBeCloseTo(1000, 3);
  });

  it("clears the per-frame window between frames (sample peak not carried over)", () => {
    const core = new MetersCore(SR);
    // Frame 1: loud square -> high true peak.
    pushSignal(core, 1, QUANTUM, (_c, n) => (n % 2 === 0 ? 1 : -1));
    const f1 = core.buildFrame();
    expect(f1.metrics.channels[0].truePeakDb).toBeGreaterThan(-1);

    // Frame 2: silence. The frame window itself was cleared (sample peak
    // floors), but the true-peak meter legitimately carries the FIR history
    // tail (~half the kernel) across the boundary, so the inter-sample region
    // between the hot frame 1 and frame 2 is still reported here.
    pushSignal(core, 1, QUANTUM, () => 0);
    const f2 = core.buildFrame();
    expect(f2.metrics.channels[0].peakDb).toBe(DB_FLOOR);

    // Frame 3: silence again -> no history left, true peak floors.
    pushSignal(core, 1, QUANTUM, () => 0);
    const f3 = core.buildFrame();
    expect(f3.metrics.channels[0].truePeakDb).toBe(DB_FLOOR);
    expect(f3.metrics.channels[0].peakDb).toBe(DB_FLOOR);
  });

  it("catches an inter-sample true peak straddling two frame windows", () => {
    // Hann-windowed fs/4 burst whose only true crest (amp 0.9, ~-0.92 dBTP)
    // sits exactly between the last sample of frame 1 and the first sample of
    // frame 2. Both stored neighbors are only ~0.63 => a stateless per-frame
    // true-peak under-reads it.
    const amp = 0.9;
    const winLen = 32;
    const c = QUANTUM - 0.5;
    const burst = (n: number): number => {
      const d = n - c;
      if (Math.abs(d) > winLen / 2) return 0;
      const env = 0.5 * (1 + Math.cos((2 * Math.PI * d) / winLen));
      return amp * Math.cos((Math.PI / 2) * d) * env;
    };
    const analytic = 20 * Math.log10(amp);

    const core = new MetersCore(SR);
    pushSignal(core, 1, QUANTUM, (_ch, n) => burst(n));
    const f1 = core.buildFrame();
    pushSignal(core, 1, QUANTUM, (_ch, n) => burst(QUANTUM + n));
    const f2 = core.buildFrame();

    const measured = Math.max(
      f1.metrics.channels[0].truePeakDb,
      f2.metrics.channels[0].truePeakDb,
    );
    expect(Math.abs(measured - analytic)).toBeLessThan(0.1);
  });

  it("reset() clears the true-peak history tail", () => {
    const core = new MetersCore(SR);
    // Hot fs/4 tone at pi/4 phase: ~0 dBTP, samples only +-0.7071.
    pushSignal(core, 1, QUANTUM, (_ch, n) =>
      Math.sin(2 * Math.PI * 0.25 * n + Math.PI / 4),
    );
    core.buildFrame();

    core.reset();
    // Quiet constant after reset: must read its own level, not the hot tail.
    pushSignal(core, 1, QUANTUM, () => 0.05);
    const frame = core.buildFrame();
    expect(frame.metrics.channels[0].truePeakDb).toBeCloseTo(-26.02, 1);
  });

  it("channel-count changes preserve the surviving channel's cumulative counters", () => {
    const core = new MetersCore(SR);
    // Full-scale square: every sample clips, every transition is a glitch step.
    const sq = (n: number): number => (n % 2 === 0 ? 1 : -1);

    pushSignal(core, 2, QUANTUM, (_ch, n) => sq(n));
    let frame = core.buildFrame();
    expect(frame.metrics.channels[0].clipCount).toBe(QUANTUM);
    // First quantum: no predecessor for sample 0, so QUANTUM - 1 steps.
    expect(frame.metrics.glitchCounts![0]).toBe(QUANTUM - 1);

    // Drop to mono mid-stream, then back to stereo: channel 0 persists
    // throughout, so its cumulative counters must keep accumulating.
    pushSignal(core, 1, QUANTUM, (_ch, n) => sq(n));
    pushSignal(core, 2, QUANTUM, (_ch, n) => sq(n));
    frame = core.buildFrame();
    expect(frame.metrics.channelCount).toBe(2);
    expect(frame.metrics.channels[0].clipCount).toBe(3 * QUANTUM);
    expect(frame.metrics.glitchCounts![0]).toBe(3 * QUANTUM - 1);
  });

  it("respects a custom AnalysisConfig (low-signal classification)", () => {
    const core = new MetersCore(SR, { ...DEFAULT_ANALYSIS_CONFIG });
    // -50 dBFS sine: below lowSignalDb (-40) but above silenceDb (-60).
    const amp = Math.pow(10, -50 / 20);
    const w = (2 * Math.PI * 1000) / SR;
    pushSignal(core, 1, SR, (_c, n) => amp * Math.sin(w * n));
    const frame = core.buildFrame();
    expect(frame.metrics.signal.silent).toBe(false);
    expect(frame.metrics.signal.lowSignal).toBe(true);
  });

  it("an empty quantum array is a no-op", () => {
    const core = new MetersCore(SR);
    expect(() => core.pushQuantum([])).not.toThrow();
    const frame = core.buildFrame();
    // No audio yet => neutral silent-mono frame.
    expect(frame.metrics.channelCount).toBe(1);
    expect(frame.metrics.signal.silent).toBe(true);
    expect(frame.metrics.channels[0].peakDb).toBe(DB_FLOOR);
  });

  it("ignores a leading constant-DC quantum for clipping but reports dcOffset", () => {
    const core = new MetersCore(SR);
    pushSignal(core, 1, QUANTUM, () => 0.3); // constant 0.3 (DC), below clip threshold
    const frame = core.buildFrame();
    const ch = frame.metrics.channels[0];
    expect(ch.clippedNow).toBe(false);
    expect(ch.dcOffset).toBeCloseTo(0.3, 5);
  });
});
