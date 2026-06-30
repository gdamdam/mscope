/** One de-interleaved block. right === null means mono. */
export interface StereoBlock { left: Float32Array; right: Float32Array | null; }
export interface AnalysisConfig {
  sampleRate: number;
  clipThreshold: number;    // sample magnitude counted as clipping, e.g. 0.999
  silenceDb: number;        // below this RMS dBFS => silent, e.g. -60
  lowSignalDb: number;      // below this RMS dBFS => low signal, e.g. -40
  rmsWindowMs: number;      // RMS integration window, e.g. 300
  truePeakOversample: number; // oversample factor for true peak, e.g. 4
}
export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  sampleRate: 48000,
  clipThreshold: 0.999,
  silenceDb: -60,
  lowSignalDb: -40,
  rmsWindowMs: 300,
  truePeakOversample: 4,
};
