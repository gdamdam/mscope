/**
 * Main-thread-derived analysis types, distinct from the worklet-pushed
 * `MetricsSnapshot`/`LoudnessSnapshot`. These are computed in the UI/hook from
 * the AnalyserNode spectrum/waveform and accumulated history, by the pure
 * modules in `src/dsp/` (spectral, dynamics, histogram, loudnessRange,
 * noiseFloor). UI panels consume these TYPES as props, which decouples them
 * from both the DSP modules and the hook implementation.
 */

/** ISO R40 1/3-octave band centre frequencies (Hz), 20 Hz–20 kHz — RTA bands. */
export const THIRD_OCTAVE_CENTERS: readonly number[] = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
  12500, 16000, 20000,
];

/** Spectral descriptors computed from a magnitude spectrum (channel 0). */
export interface SpectralMetrics {
  /** Spectral centroid (Hz) — "brightness". */
  centroidHz: number;
  /** Spectral flatness in [0,1] — 1 = noise-like, →0 = tonal. */
  flatness: number;
  /** Frequency (Hz) of the strongest bin. */
  dominantHz: number;
  /** Per-band energy (dBFS), one per THIRD_OCTAVE_CENTERS entry — the RTA. */
  bandsDb: number[];
}

/** Dynamics/loudness descriptors derived from the frame + accumulated history. */
export interface DynamicsMetrics {
  /** Crest factor per channel (dB) = peakDb − rmsDb. */
  crestDb: number[];
  /** Peak-to-loudness ratio (dB) = max peakDb − integrated LUFS. */
  plrDb: number;
  /** EBU R128 Loudness Range (LU), from short-term LUFS history. */
  lra: number;
  /** Estimated noise floor (dBFS), from the quietest RMS observed. */
  noiseFloorDb: number;
}

/** Rolling time-series for the loudness/level history graph. Newest last. */
export interface ScopeHistory {
  momentaryLufs: number[];
  shortTermLufs: number[];
  peakDb: number[];
  rmsDb: number[];
}

/** Max samples retained per history series (~40 s at the ~15 Hz frame rate). */
export const HISTORY_CAP = 600;
