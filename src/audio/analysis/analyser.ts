/**
 * Visual-scope helpers: pure frequency/waveform math (unit-tested) plus a thin
 * `ScopeAnalyser` wrapper around Web Audio AnalyserNode(s).
 *
 * The pure helpers are the real test surface. The wrapper class touches the Web
 * Audio API, which jsdom does not implement, so it cannot be exercised headless
 * and is verified at integration instead — see the note above ScopeAnalyser.
 */

import { clamp } from "../../dsp/util";

/**
 * Center frequency (Hz) of an FFT bin: `bin * sampleRate / fftSize`.
 *
 * Bin 0 is DC (0 Hz); the Nyquist bin (fftSize/2) maps to sampleRate/2.
 */
export function binToFrequency(bin: number, fftSize: number, sampleRate: number): number {
  return (bin * sampleRate) / fftSize;
}

/**
 * Inverse of {@link binToFrequency}: the bin whose center is nearest `freq`.
 *
 * Rounds to the nearest integer bin (`Math.round`); ties round up. This is the
 * exact inverse for any frequency produced by `binToFrequency` at an integer
 * bin, so the two compose as an identity over integer bins.
 */
export function frequencyToBin(freq: number, fftSize: number, sampleRate: number): number {
  return Math.round((freq * fftSize) / sampleRate);
}

/**
 * Min/max envelope of a time-domain buffer, reduced to `targetWidth` columns
 * for waveform rendering. Each output column holds the min and max of the input
 * samples that fall into it.
 *
 * Edge cases:
 * - `targetWidth <= 0` (or empty input) -> empty arrays.
 * - `targetWidth >= timeData.length` -> one sample per column (min == max);
 *   columns past the input length stay 0 (default Float32Array fill).
 */
export function downsampleWaveform(
  timeData: Float32Array,
  targetWidth: number,
): { min: Float32Array; max: Float32Array } {
  const n = timeData.length;
  if (targetWidth <= 0 || n === 0) {
    return { min: new Float32Array(0), max: new Float32Array(0) };
  }

  const width = Math.floor(targetWidth);
  const min = new Float32Array(width);
  const max = new Float32Array(width);

  for (let col = 0; col < width; col++) {
    // Sample range [start, end) for this column. Using rounded fractional
    // boundaries keeps columns contiguous and evenly distributed even when
    // n is not a multiple of width.
    const start = Math.floor((col * n) / width);
    const end = Math.floor(((col + 1) * n) / width);

    if (start >= n) {
      // More columns than samples: leftover columns have no data (stay 0).
      break;
    }

    // Guarantee at least one sample per occupied column.
    const last = Math.max(end, start + 1);
    let lo = timeData[start];
    let hi = timeData[start];
    for (let i = start + 1; i < last && i < n; i++) {
      const v = timeData[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[col] = lo;
    max[col] = hi;
  }

  return { min, max };
}

/** Options for {@link ScopeAnalyser}. */
export interface ScopeAnalyserOptions {
  /** FFT size (power of two, 32..32768). Defaults to 2048. */
  fftSize?: number;
  /** Time-domain smoothing constant [0,1] for the spectrum. Defaults to 0.8. */
  smoothing?: number;
}

/**
 * Thin wrapper over Web Audio AnalyserNode(s) for oscilloscope/spectrum views.
 *
 * Stereo is handled with a ChannelSplitterNode feeding two analysers (channel 0
 * and 1); pass `channel` to the getters to select one. Mono sources simply
 * leave channel 1 silent.
 *
 * NOT unit-tested: jsdom provides no Web Audio implementation, so AudioContext /
 * AnalyserNode cannot be constructed headless. The class is deliberately a thin,
 * logic-free pass-through to the platform nodes and is verified at integration.
 * All testable math lives in the pure helpers above.
 */
export class ScopeAnalyser {
  private readonly splitter: ChannelSplitterNode;
  private readonly analysers: [AnalyserNode, AnalyserNode];

  constructor(ctx: AudioContext, opts: ScopeAnalyserOptions = {}) {
    const fftSize = opts.fftSize ?? 2048;
    const smoothing = clamp(opts.smoothing ?? 0.8, 0, 1);

    this.splitter = ctx.createChannelSplitter(2);

    const make = (): AnalyserNode => {
      const a = ctx.createAnalyser();
      a.fftSize = fftSize;
      a.smoothingTimeConstant = smoothing;
      return a;
    };
    const left = make();
    const right = make();
    this.splitter.connect(left, 0);
    this.splitter.connect(right, 1);
    this.analysers = [left, right];
  }

  /** Route an upstream node into the analyser's channel splitter. */
  connect(node: AudioNode): void {
    node.connect(this.splitter);
  }

  /**
   * Route both analysers' outputs to a sink (a muted node -> destination). An
   * AnalyserNode whose output is unconnected is never pulled by the render graph,
   * so without this the waveform/spectrum stay empty even with live input.
   * AnalyserNode passes audio through unchanged, so a muted sink keeps it silent.
   */
  sinkTo(node: AudioNode): void {
    this.analysers[0].connect(node);
    this.analysers[1].connect(node);
  }

  /** Float time-domain samples (waveform) for the given channel. */
  getWaveform(channel: 0 | 1 = 0): Float32Array {
    const a = this.analysers[channel];
    const out = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(out);
    return out;
  }

  /** Float magnitude spectrum (dB) for the given channel. */
  getSpectrum(channel: 0 | 1 = 0): Float32Array {
    const a = this.analysers[channel];
    const out = new Float32Array(a.frequencyBinCount);
    a.getFloatFrequencyData(out);
    return out;
  }

  /** Disconnect all owned nodes so the graph can be garbage-collected. */
  dispose(): void {
    this.splitter.disconnect();
    this.analysers[0].disconnect();
    this.analysers[1].disconnect();
  }
}
