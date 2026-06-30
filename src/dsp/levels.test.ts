import { describe, it, expect } from "vitest";
import {
  blockPeak,
  blockRms,
  blockDc,
  countClipped,
  classifySignal,
  LevelAnalyzer,
} from "./levels";
import { DB_FLOOR } from "./util";
import { DEFAULT_ANALYSIS_CONFIG, type AnalysisConfig } from "./types";

/** Deterministic fixtures. */
function constBlock(value: number, length: number): Float32Array {
  const x = new Float32Array(length);
  x.fill(value);
  return x;
}
/** Full-cycle sine, peak `amp`; integer cycles so RMS == amp/sqrt(2) exactly to fp. */
function sineBlock(amp: number, length: number, cycles: number): Float32Array {
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    x[i] = amp * Math.sin((2 * Math.PI * cycles * i) / length);
  }
  return x;
}

describe("blockPeak", () => {
  it("returns max absolute sample", () => {
    expect(blockPeak(new Float32Array([0.2, -0.9, 0.5]))).toBeCloseTo(0.9, 6);
  });
  it("is 0 for silence", () => {
    expect(blockPeak(constBlock(0, 16))).toBe(0);
  });
  it("is 0 for empty block", () => {
    expect(blockPeak(new Float32Array(0))).toBe(0);
  });
});

describe("blockRms", () => {
  it("equals magnitude for a DC/constant block", () => {
    expect(blockRms(constBlock(0.5, 32))).toBeCloseTo(0.5, 6);
  });
  it("equals amp/sqrt(2) for a sine", () => {
    expect(blockRms(sineBlock(0.5, 1024, 4))).toBeCloseTo(0.5 / Math.SQRT2, 4);
  });
  it("is 0 for empty block", () => {
    expect(blockRms(new Float32Array(0))).toBe(0);
  });
});

describe("blockDc", () => {
  it("returns the mean", () => {
    expect(blockDc(constBlock(0.5, 8))).toBeCloseTo(0.5, 6);
  });
  it("is ~0 for a balanced sine", () => {
    expect(blockDc(sineBlock(1, 1024, 4))).toBeCloseTo(0, 5);
  });
  it("is 0 for empty block", () => {
    expect(blockDc(new Float32Array(0))).toBe(0);
  });
});

describe("countClipped", () => {
  it("counts samples with |x| >= threshold", () => {
    const x = new Float32Array([0.5, -1, 1, 0.9989, -0.9991]);
    expect(countClipped(x, 0.999)).toBe(3); // -1, 1, -0.9991
  });
  it("is 0 when below threshold", () => {
    expect(countClipped(constBlock(0.5, 10), 0.999)).toBe(0);
  });
});

describe("classifySignal", () => {
  const cfg = DEFAULT_ANALYSIS_CONFIG; // silenceDb -60, lowSignalDb -40
  it("flags silent at/below silenceDb (and not lowSignal)", () => {
    const s = classifySignal(-60, cfg);
    expect(s.silent).toBe(true);
    expect(s.lowSignal).toBe(false);
    const s2 = classifySignal(-80, cfg);
    expect(s2.silent).toBe(true);
    expect(s2.lowSignal).toBe(false);
  });
  it("flags lowSignal in (silenceDb, lowSignalDb]", () => {
    const s = classifySignal(-50, cfg);
    expect(s.silent).toBe(false);
    expect(s.lowSignal).toBe(true);
    const edge = classifySignal(-40, cfg);
    expect(edge.lowSignal).toBe(true);
    expect(edge.silent).toBe(false);
  });
  it("flags neither above lowSignalDb", () => {
    const s = classifySignal(-10, cfg);
    expect(s.silent).toBe(false);
    expect(s.lowSignal).toBe(false);
  });
});

describe("LevelAnalyzer", () => {
  const cfg: AnalysisConfig = { ...DEFAULT_ANALYSIS_CONFIG };

  it("silence -> floors, no clip, silent", () => {
    const a = new LevelAnalyzer(cfg);
    const r = a.process(constBlock(0, 512));
    expect(r.peakDb).toBe(DB_FLOOR);
    expect(r.rmsDb).toBe(DB_FLOOR);
    expect(r.dcOffset).toBeCloseTo(0, 6);
    expect(r.clipCount).toBe(0);
    expect(r.clippedNow).toBe(false);
    expect(Number.isNaN(r.truePeakDb)).toBe(true);
  });

  it("full-scale square -> ~0 dB peak & rms, all samples clipped", () => {
    const a = new LevelAnalyzer(cfg);
    const block = constBlock(1, 256);
    const r = a.process(block);
    expect(r.peakDb).toBeCloseTo(0, 6);
    expect(r.rmsDb).toBeCloseTo(0, 6);
    expect(r.clippedNow).toBe(true);
    expect(r.clipCount).toBe(256);
  });

  it("DC fixture -> dcOffset ~0.5", () => {
    const a = new LevelAnalyzer(cfg);
    const r = a.process(constBlock(0.5, 128));
    expect(r.dcOffset).toBeCloseTo(0.5, 6);
  });

  it("0.5-amplitude sine -> peakDb ~-6.02, rmsDb ~-9.03", () => {
    const a = new LevelAnalyzer(cfg);
    const r = a.process(sineBlock(0.5, 2048, 8));
    expect(r.peakDb).toBeCloseTo(-6.02, 1);
    expect(r.rmsDb).toBeCloseTo(-9.03, 1);
  });

  it("low-signal level falls in lowSignal band", () => {
    const a = new LevelAnalyzer(cfg);
    // constant 0.005 -> ~-46 dB RMS, within (-60, -40]
    const r = a.process(constBlock(0.005, 256));
    const state = classifySignal(r.rmsDb, cfg);
    expect(state.silent).toBe(false);
    expect(state.lowSignal).toBe(true);
  });

  it("accumulates clipCount across process() calls", () => {
    const a = new LevelAnalyzer(cfg);
    a.process(constBlock(1, 100));
    const r = a.process(constBlock(1, 50));
    expect(r.clipCount).toBe(150);
    expect(r.clippedNow).toBe(true);
  });

  it("reset() zeroes clipCount and clears RMS window", () => {
    const a = new LevelAnalyzer(cfg);
    a.process(constBlock(1, 100));
    a.reset();
    const r = a.process(constBlock(0, 64));
    expect(r.clipCount).toBe(0);
    expect(r.rmsDb).toBe(DB_FLOOR);
  });

  it("RMS window integrates across blocks (trailing window)", () => {
    // window 300ms @ 48k = 14400 samples. Feed a loud block then a long
    // silent run longer than the window -> RMS should decay toward floor.
    const a = new LevelAnalyzer(cfg);
    a.process(constBlock(1, 1024));
    let last = 0;
    // 20000 silent samples > 14400 window -> window fully flushed
    for (let i = 0; i < 20; i++) last = a.process(constBlock(0, 1024)).rmsDb;
    expect(last).toBe(DB_FLOOR);
  });
});
