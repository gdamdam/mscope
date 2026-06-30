import type { MetricsSnapshot } from "./analysis/metrics";
import type { LoudnessSnapshot } from "../dsp/loudness";
import type { AudioInputSource } from "./input/AudioInputSource";

/**
 * The boundary between the audio spine (worklet + graph, "C1") and the UI ("C2").
 * Both sides build against THIS file so they can be developed in parallel.
 *
 * Visual data (waveform/spectrum) is pulled on demand from an AnalyserNode on the
 * main thread; sample-accurate metrics (levels/stereo/true-peak/LUFS) are pushed
 * from the AudioWorklet as `AnalysisFrame`s at ~15 Hz.
 */

/** One push of sample-accurate analysis from the meters worklet. */
export interface AnalysisFrame {
  metrics: MetricsSnapshot;
  loudness: LoudnessSnapshot;
}

export type EngineState = "idle" | "running" | "suspended" | "closed";

export interface ScopeEngineOptions {
  /** AnalyserNode fftSize for the visual scope/spectrum. Default 2048. */
  fftSize?: number;
  /** AnalyserNode smoothingTimeConstant, [0,1]. Default 0.8. */
  smoothing?: number;
}

/** Runtime-adjustable analyser settings (FFT resolution vs responsiveness). */
export interface AnalyserConfig {
  fftSize: number;
  smoothing: number;
}

export interface ScopeEngine {
  readonly state: EngineState;

  /**
   * Attach (or replace) the input source and (re)build the graph:
   *   source -> [ AnalyserNode (visual) ] + [ meters worklet (metrics) ] + [ monitorGain -> destination ]
   * Analysis branches NEVER alter the signal. Monitor starts MUTED.
   * Safe to call repeatedly; disconnects the prior source first.
   */
  setSource(source: AudioInputSource): Promise<void>;

  /** Audible monitor gain in [0,1]. Default 0 (muted) to avoid doubling/feedback. */
  setMonitorGain(gain: number): void;
  getMonitorGain(): number;

  /** Reconfigure the visual AnalyserNode (FFT size / smoothing) at runtime. */
  setAnalyserConfig(cfg: Partial<AnalyserConfig>): void;

  /** Latest time-domain (waveform) data for a channel, from the AnalyserNode. */
  getWaveform(channel: 0 | 1): Float32Array;
  /** Latest frequency-domain (spectrum, dB) data for a channel, from the AnalyserNode. */
  getSpectrum(channel: 0 | 1): Float32Array;

  /** Subscribe to metric frames pushed from the worklet. Returns an unsubscribe fn. */
  onFrame(listener: (frame: AnalysisFrame) => void): () => void;

  resume(): Promise<void>;
  suspend(): Promise<void>;

  /**
   * Disconnect and forget the current source (e.g. on Stop) and suspend the
   * context, returning to "idle" — WITHOUT closing the context (unlike dispose).
   * Safe to call with no source attached.
   */
  detach(): void;

  /** Reset the worklet's running accumulators (cumulative clip count, integrated LUFS). */
  reset(): void;

  /** Full teardown: stop worklet, disconnect graph, close the AudioContext. */
  dispose(): void;
}

/** Implemented by the audio spine in `src/audio/engine.ts`. */
export type CreateScopeEngine = (opts?: ScopeEngineOptions) => ScopeEngine;
