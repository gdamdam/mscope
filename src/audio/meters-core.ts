/**
 * Pure, headless-testable integration core for the meters worklet.
 *
 * This is where ALL the metric-assembly logic lives so it can be unit-tested
 * without a real AudioWorklet (jsdom has no Web Audio). The worklet shell
 * (`meters.worklet.ts`) is a thin adapter that owns a `MetersCore`, feeds it
 * raw quanta, and posts the assembled frames.
 *
 * Cadence split:
 * - `pushQuantum` runs on every 128-sample render quantum: it advances the
 *   stateful per-channel `LevelAnalyzer`s (trailing RMS, cumulative clip count)
 *   and the streaming `LoudnessMeter`, and appends the quantum into a per-frame
 *   working buffer.
 * - `buildFrame` runs on the slower frame cadence (~64 ms in the worklet): it
 *   computes the expensive true-peak (oversampled FIR) and stereo correlation
 *   over the accumulated frame window, assembles a `MetricsSnapshot` +
 *   `LoudnessSnapshot`, and clears the per-frame working buffer.
 *
 * The cumulative accumulators (clip count, integrated LUFS) intentionally
 * survive `buildFrame` and are only cleared by `reset`.
 */

import {
  LevelAnalyzer,
  classifySignal,
  blockPeak,
  blockDc,
  countClipped,
} from "../dsp/levels";
import { linToDb } from "../dsp/util";
import { stereoMetrics } from "../dsp/stereo";
import { truePeakDb, TruePeakMeter } from "../dsp/truePeak";
import { GlitchDetector } from "../dsp/glitch";
import { LoudnessMeter, type LoudnessSnapshot } from "../dsp/loudness";
import {
  type AnalysisConfig,
  DEFAULT_ANALYSIS_CONFIG,
  type StereoBlock,
} from "../dsp/types";
import type {
  ChannelLevels,
  MetricsSnapshot,
  StereoMetrics,
} from "./analysis/metrics";
import type { AnalysisFrame } from "./engineTypes";

/** Max channels we meter (mono or stereo). Extra inputs are ignored. */
const MAX_CHANNELS = 2;

/**
 * Shared zero-length probe block. `buildFrame` runs on the render thread at the
 * frame cadence and must not allocate; feeding this shared empty array to
 * `LevelAnalyzer.process` reads the analyzer's running state without minting a
 * throwaway `Float32Array` each frame. Callees only read it, never mutate.
 */
const EMPTY_BLOCK = new Float32Array(0);

/**
 * Growable mono sample accumulator for one channel over a frame window. Grows
 * geometrically and is logically cleared (length reset to 0, capacity kept) by
 * `clear`, so steady-state framing allocates no new buffers.
 */
class FrameBuffer {
  private buf: Float32Array;
  private len = 0;

  constructor(initialCapacity: number) {
    this.buf = new Float32Array(Math.max(1, initialCapacity));
  }

  append(block: Float32Array): void {
    const need = this.len + block.length;
    if (need > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < need) cap *= 2;
      const next = new Float32Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    this.buf.set(block, this.len);
    this.len += block.length;
  }

  /** A view of exactly the samples appended since the last clear. */
  view(): Float32Array {
    return this.buf.subarray(0, this.len);
  }

  clear(): void {
    this.len = 0;
  }
}

export class MetersCore {
  private readonly cfg: AnalysisConfig;
  private readonly sampleRate: number;
  private readonly loudness: LoudnessMeter;

  /** Per-channel level analyzers, allocated lazily once channel count is known. */
  private analyzers: LevelAnalyzer[] = [];
  /** Per-channel frame-window sample accumulators, parallel to `analyzers`. */
  private frameBuffers: FrameBuffer[] = [];
  /** Per-channel gapless discontinuity (click/dropout) detectors. */
  private glitchDetectors: GlitchDetector[] = [];
  /** Per-channel stateful true-peak meters (carry FIR history across frames). */
  private truePeakMeters: TruePeakMeter[] = [];
  private channelCount = 0;

  /** Total samples (per channel) processed since construction/reset. */
  private totalSamples = 0;

  constructor(sampleRate: number, config: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) {
    this.sampleRate = sampleRate;
    // The worklet's true sample rate wins over the config default so RMS
    // windowing and timeMs are correct for the actual audio context.
    this.cfg = { ...config, sampleRate };
    this.loudness = new LoudnessMeter(sampleRate);
  }

  /** (Re)allocate per-channel state when the channel count first appears or changes. */
  private ensureChannels(count: number): void {
    const n = Math.min(MAX_CHANNELS, Math.max(1, count));
    if (n === this.channelCount) return;
    // ~128 ms initial capacity; covers the ~64 ms frame window with headroom.
    const initialCap = Math.max(128, Math.round(this.sampleRate * 0.128));
    // Only add/remove the delta: channels that persist keep their analyzers
    // and detectors, so cumulative counters (clip/glitch) that are documented
    // to survive until reset() stay monotonic across a channel-count change.
    for (let c = this.channelCount; c < n; c++) {
      this.analyzers[c] = new LevelAnalyzer(this.cfg);
      this.frameBuffers[c] = new FrameBuffer(initialCap);
      this.glitchDetectors[c] = new GlitchDetector();
      this.truePeakMeters[c] = new TruePeakMeter(this.cfg.truePeakOversample);
    }
    this.analyzers.length = n;
    this.frameBuffers.length = n;
    this.glitchDetectors.length = n;
    this.truePeakMeters.length = n;
    this.channelCount = n;
  }

  /**
   * Accumulate one render quantum. `channels[c]` is the mono Float32Array for
   * channel c. An empty inputs array (no upstream connection) is a no-op.
   */
  pushQuantum(channels: Float32Array[]): void {
    if (channels.length === 0 || channels[0].length === 0) return;
    this.ensureChannels(channels.length);

    const n = this.channelCount;
    const frames = channels[0].length;

    for (let c = 0; c < n; c++) {
      // If the input has fewer channels than allocated, reuse channel 0.
      const block = channels[c] ?? channels[0];
      this.analyzers[c].process(block);
      this.frameBuffers[c].append(block);
      this.glitchDetectors[c].process(block);
    }

    // Loudness is a stereo meter; mono => right === null.
    const left = channels[0];
    const right = n >= 2 ? (channels[1] ?? null) : null;
    this.loudness.process({ left, right });

    this.totalSamples += frames;
  }

  /**
   * Assemble the current frame and clear the per-frame working buffers. Called
   * on the slow frame cadence. Returns a sane "silent mono" frame if no audio
   * has been pushed yet.
   */
  buildFrame(): AnalysisFrame {
    const loudnessSnap: LoudnessSnapshot = this.loudness.snapshot();

    if (this.channelCount === 0) {
      return { metrics: this.emptyMetrics(), loudness: loudnessSnap };
    }

    const channels: ChannelLevels[] = [];
    for (let c = 0; c < this.channelCount; c++) {
      const samples = this.frameBuffers[c].view();
      // rmsDb (trailing window) and the cumulative clipCount come from the
      // analyzer's running state — advanced per-quantum in pushQuantum. We
      // process a zero-length block to read that state without double-counting.
      const lv = this.analyzers[c].process(EMPTY_BLOCK);
      // peak / dcOffset / clippedNow / true-peak are frame-window quantities:
      // recompute them over the samples accumulated for THIS frame so they
      // report the window we display, not the (empty) probe block above.
      lv.peakDb = linToDb(blockPeak(samples));
      lv.dcOffset = blockDc(samples);
      lv.clippedNow = countClipped(samples, this.cfg.clipThreshold) > 0;
      // Stateful true peak: the meter carries the FIR history tail across
      // frame windows, so inter-sample excursions straddling two consecutive
      // frames are measured against real neighboring samples instead of the
      // replicate-padded edge a per-frame truePeakDb() would see.
      lv.truePeakDb = this.truePeakMeters[c].process(samples);
      channels.push(lv);
    }

    // Stereo metrics over the frame window; null when mono.
    let stereo: StereoMetrics | null = null;
    if (this.channelCount >= 2) {
      const block: StereoBlock = {
        left: this.frameBuffers[0].view(),
        right: this.frameBuffers[1].view(),
      };
      stereo = stereoMetrics(block);
    }

    // Signal classification uses channel 0's windowed RMS (the reference channel).
    const signal = classifySignal(channels[0].rmsDb, this.cfg);

    // Build the counts in one pass; the previous slice().map() allocated an
    // intermediate detector array on the render thread every frame.
    const glitchCounts: number[] = [];
    for (let c = 0; c < this.channelCount; c++) {
      glitchCounts.push(this.glitchDetectors[c].count);
    }

    const metrics: MetricsSnapshot = {
      timeMs: (this.totalSamples / this.sampleRate) * 1000,
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      channels,
      stereo,
      signal,
      glitchCounts,
    };

    for (const fb of this.frameBuffers) fb.clear();

    return { metrics, loudness: loudnessSnap };
  }

  /** A neutral "silent mono" snapshot for the no-audio-yet case. */
  private emptyMetrics(): MetricsSnapshot {
    const silentLevels: ChannelLevels = this.analyzersFallback();
    return {
      timeMs: 0,
      sampleRate: this.sampleRate,
      channelCount: 1,
      channels: [silentLevels],
      stereo: null,
      signal: classifySignal(silentLevels.rmsDb, this.cfg),
      glitchCounts: [0],
    };
  }

  /** ChannelLevels for a never-fed channel: a fresh analyzer on empty input. */
  private analyzersFallback(): ChannelLevels {
    const lv = new LevelAnalyzer(this.cfg).process(EMPTY_BLOCK);
    lv.truePeakDb = truePeakDb(EMPTY_BLOCK, this.cfg.truePeakOversample);
    return lv;
  }

  /** Clear all running accumulators (clip count, integrated LUFS, RMS window). */
  reset(): void {
    for (const a of this.analyzers) a.reset();
    for (const fb of this.frameBuffers) fb.clear();
    for (const g of this.glitchDetectors) g.reset();
    for (const t of this.truePeakMeters) t.reset();
    this.loudness.reset();
    this.totalSamples = 0;
  }
}
