export interface ChannelLevels {
  peakDb: number;      // sample peak, dBFS
  rmsDb: number;       // windowed RMS, dBFS
  truePeakDb: number;  // oversampled true peak, dBTP (may be NaN until implemented)
  dcOffset: number;    // mean sample value in [-1,1]
  clipCount: number;   // clipped samples since last reset
  clippedNow: boolean;
}
export interface StereoMetrics {
  correlation: number; // Pearson correlation L vs R, [-1,1]
  balance: number;     // energy balance, -1 (L) .. +1 (R)
}
export interface SignalState { silent: boolean; lowSignal: boolean; }
export interface MetricsSnapshot {
  timeMs: number;
  sampleRate: number;
  channelCount: number;       // 1 or 2
  channels: ChannelLevels[];  // length === channelCount
  stereo: StereoMetrics | null; // null if mono
  signal: SignalState;
  /** Cumulative discontinuity (click/dropout) count per channel since reset.
   *  Optional: present once the worklet's glitch detector is wired in. */
  glitchCounts?: number[];
  // NOTE: LUFS lives in the separate LoudnessSnapshot, not here.
}
