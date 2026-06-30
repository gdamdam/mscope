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

  it("clears the per-frame window between frames (true-peak not carried over)", () => {
    const core = new MetersCore(SR);
    // Frame 1: loud square -> high true peak.
    pushSignal(core, 1, QUANTUM, (_c, n) => (n % 2 === 0 ? 1 : -1));
    const f1 = core.buildFrame();
    expect(f1.metrics.channels[0].truePeakDb).toBeGreaterThan(-1);

    // Frame 2: silence -> true peak floors (window was cleared).
    pushSignal(core, 1, QUANTUM, () => 0);
    const f2 = core.buildFrame();
    expect(f2.metrics.channels[0].truePeakDb).toBe(DB_FLOOR);
    expect(f2.metrics.channels[0].peakDb).toBe(DB_FLOOR);
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
