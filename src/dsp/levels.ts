/**
 * Per-channel level metrics for a single mono channel block.
 *
 * Pure helpers operate on one `Float32Array` block at a time and stay
 * dependency-free. `LevelAnalyzer` adds the only stateful behaviour required:
 * a trailing RMS integration window and cumulative clip counting across blocks.
 *
 * dB conversions are delegated to `./util` so every dsp/* module reports levels
 * identically; we never reimplement dB math here.
 */
import { linToDb, DB_FLOOR } from "./util";
import type { AnalysisConfig } from "./types";
import type { ChannelLevels, SignalState } from "../audio/analysis/metrics";

/** Max |sample| (linear). 0 for an empty block. */
export function blockPeak(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const m = Math.abs(x[i]);
    if (m > peak) peak = m;
  }
  return peak;
}

/** sqrt(mean(x^2)) (linear RMS). 0 for an empty block. */
export function blockRms(x: Float32Array): number {
  if (x.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < x.length; i++) sumSq += x[i] * x[i];
  return Math.sqrt(sumSq / x.length);
}

/** Mean sample value (DC offset). 0 for an empty block. */
export function blockDc(x: Float32Array): number {
  if (x.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i];
  return sum / x.length;
}

/** Count of samples with |sample| >= threshold. */
export function countClipped(x: Float32Array, threshold: number): number {
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) >= threshold) n++;
  }
  return n;
}

/**
 * Classify a windowed RMS level into silence / low-signal bands.
 *
 * Rule (silent and lowSignal are mutually exclusive): `silent` wins at the
 * boundary. `silent` iff rmsDb <= silenceDb. `lowSignal` iff not silent and
 * rmsDb <= lowSignalDb (i.e. the half-open band (silenceDb, lowSignalDb]).
 */
export function classifySignal(rmsDb: number, cfg: AnalysisConfig): SignalState {
  const silent = rmsDb <= cfg.silenceDb;
  const lowSignal = !silent && rmsDb <= cfg.lowSignalDb;
  return { silent, lowSignal };
}

/**
 * Stateful per-channel level analyzer.
 *
 * Windowing: RMS is integrated over a trailing window of `cfg.rmsWindowMs`,
 * converted to a sample count from `cfg.sampleRate`. We keep a running
 * sum-of-squares and a circular buffer of the most recent window samples; each
 * incoming sample adds its square and evicts the oldest once the window is
 * full. This is O(1) per sample and exact (no block-boundary aliasing). peakDb
 * and dcOffset are computed from the CURRENT block only; clipCount is
 * cumulative since construction/reset.
 */
export class LevelAnalyzer {
  private readonly cfg: AnalysisConfig;
  private readonly ring: Float32Array;
  private readonly windowLen: number;
  private writeIdx = 0;
  private filled = 0; // number of valid samples currently in the window
  private sumSq = 0;
  private clipCountTotal = 0;

  constructor(cfg: AnalysisConfig) {
    this.cfg = cfg;
    // At least 1 sample so an absurdly small window still behaves.
    this.windowLen = Math.max(1, Math.round((cfg.rmsWindowMs / 1000) * cfg.sampleRate));
    this.ring = new Float32Array(this.windowLen);
  }

  process(block: Float32Array): ChannelLevels {
    const peak = blockPeak(block);
    const dc = blockDc(block);
    const clippedThisBlock = countClipped(block, this.cfg.clipThreshold);
    this.clipCountTotal += clippedThisBlock;

    // Push each sample's square into the trailing window ring.
    for (let i = 0; i < block.length; i++) {
      const s = block[i];
      const sq = s * s;
      if (this.filled === this.windowLen) {
        this.sumSq -= this.ring[this.writeIdx];
      } else {
        this.filled++;
      }
      this.ring[this.writeIdx] = sq;
      this.sumSq += sq;
      this.writeIdx = this.writeIdx + 1 === this.windowLen ? 0 : this.writeIdx + 1;
    }

    // Guard against tiny negative drift from float accumulation.
    const meanSq = this.filled > 0 ? Math.max(0, this.sumSq / this.filled) : 0;
    const rmsLin = Math.sqrt(meanSq);

    return {
      peakDb: linToDb(peak),
      rmsDb: rmsLin > 0 ? linToDb(rmsLin) : DB_FLOOR,
      // true-peak lives in a dedicated oversampling module; intentionally NaN here.
      truePeakDb: NaN,
      dcOffset: dc,
      clipCount: this.clipCountTotal,
      clippedNow: clippedThisBlock > 0,
    };
  }

  reset(): void {
    this.writeIdx = 0;
    this.filled = 0;
    this.sumSq = 0;
    this.clipCountTotal = 0;
    this.ring.fill(0);
  }
}
