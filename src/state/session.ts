import type { MetricsSnapshot } from '../audio/analysis/metrics';

/**
 * Export-friendly floor used in place of -Infinity for dB / LUFS maxes that have
 * never been observed. JSON.stringify turns -Infinity into `null`, which breaks
 * round-tripping; a finite floor keeps the summary fully serializable and lets
 * consumers treat "-120 dB" as "effectively silence / not measured".
 */
export const DB_FLOOR = -120;

/** Per-channel aggregates accumulated over the session. */
export interface ChannelSummary {
  /** Highest sample peak observed, dBFS. */
  maxPeakDb: number;
  /** Highest true peak observed, dBTP. DB_FLOOR if never measured (always NaN). */
  maxTruePeakDb: number;
  /** Largest absolute DC offset observed, [0,1]. */
  maxAbsDcOffset: number;
}

/** Serializable diagnostic summary of a measurement session. All numbers finite. */
export interface SessionSummary {
  /** Wall-clock-ish session length: sum of ingested deltaMs. */
  durationMs: number;
  /** Sample rate of the last ingested snapshot (0 if none). */
  sampleRate: number;
  /** Channel count of the last ingested snapshot (0 if none). */
  channelCount: number;
  /** Per-channel level aggregates; length === channelCount (empty if none). */
  channels: ChannelSummary[];
  /** Total clipped samples across all channels over the session. */
  totalClipCount: number;
  /** Highest windowed RMS observed across all channels, dBFS (DB_FLOOR if none). */
  peakRmsDb: number;
  /** Min stereo correlation observed, [-1,1]; null if no stereo snapshot seen. */
  correlationMin: number | null;
  /** Max stereo correlation observed, [-1,1]; null if no stereo snapshot seen. */
  correlationMax: number | null;
  /** Latest integrated LUFS reported (DB_FLOOR if none). */
  integratedLufs: number;
  /** Max momentary LUFS observed (DB_FLOOR if none). */
  maxMomentaryLufs: number;
  /** Max short-term LUFS observed (DB_FLOOR if none). */
  maxShortTermLufs: number;
  /** Total time classified silent, ms. */
  silentMs: number;
  /** Total time classified low-signal, ms. */
  lowSignalMs: number;
  /** Epoch ms when the session started (Date.now at construction/reset). */
  startedAtMs: number;
}

interface ChannelAccum {
  maxPeakDb: number;
  maxTruePeakDb: number;
  maxAbsDcOffset: number;
  clipCount: number;
}

function freshChannel(): ChannelAccum {
  return {
    maxPeakDb: DB_FLOOR,
    maxTruePeakDb: DB_FLOOR,
    maxAbsDcOffset: 0,
    clipCount: 0,
  };
}

/**
 * Accumulates streaming MetricsSnapshots into a resettable diagnostic summary.
 * Decoupled from the loudness module: callers pass plain LUFS numbers, if any.
 */
export class MeasurementSession {
  private durationMs = 0;
  private sampleRate = 0;
  private channelCount = 0;
  private channels: ChannelAccum[] = [];
  private peakRmsDb = DB_FLOOR;
  private correlationMin: number | null = null;
  private correlationMax: number | null = null;
  private integratedLufs = DB_FLOOR;
  private maxMomentaryLufs = DB_FLOOR;
  private maxShortTermLufs = DB_FLOOR;
  private silentMs = 0;
  private lowSignalMs = 0;
  private startedAtMs = Date.now();

  ingest(
    snapshot: MetricsSnapshot,
    deltaMs: number,
    loudness?: { momentaryLufs: number; shortTermLufs: number; integratedLufs: number },
  ): void {
    this.durationMs += deltaMs;
    this.sampleRate = snapshot.sampleRate;
    this.channelCount = snapshot.channelCount;

    // Grow the per-channel accumulator array to fit (channel count is stable
    // in practice, but be robust to it changing across snapshots).
    while (this.channels.length < snapshot.channels.length) {
      this.channels.push(freshChannel());
    }

    for (let i = 0; i < snapshot.channels.length; i++) {
      const src = snapshot.channels[i];
      const acc = this.channels[i];
      if (Number.isFinite(src.peakDb)) acc.maxPeakDb = Math.max(acc.maxPeakDb, src.peakDb);
      // NaN truePeak means "not measured" — never let it poison the max.
      if (Number.isFinite(src.truePeakDb)) {
        acc.maxTruePeakDb = Math.max(acc.maxTruePeakDb, src.truePeakDb);
      }
      const absDc = Math.abs(src.dcOffset);
      if (Number.isFinite(absDc)) acc.maxAbsDcOffset = Math.max(acc.maxAbsDcOffset, absDc);
      // clipCount arrives CUMULATIVE-since-reset from the worklet each frame, so
      // take the latest (max), not the running sum, or it inflates wildly.
      if (Number.isFinite(src.clipCount)) acc.clipCount = Math.max(acc.clipCount, src.clipCount);
      if (Number.isFinite(src.rmsDb)) this.peakRmsDb = Math.max(this.peakRmsDb, src.rmsDb);
    }

    if (snapshot.stereo && Number.isFinite(snapshot.stereo.correlation)) {
      const c = snapshot.stereo.correlation;
      this.correlationMin = this.correlationMin === null ? c : Math.min(this.correlationMin, c);
      this.correlationMax = this.correlationMax === null ? c : Math.max(this.correlationMax, c);
    }

    if (snapshot.signal.silent) this.silentMs += deltaMs;
    if (snapshot.signal.lowSignal) this.lowSignalMs += deltaMs;

    if (loudness) {
      if (Number.isFinite(loudness.integratedLufs)) this.integratedLufs = loudness.integratedLufs;
      if (Number.isFinite(loudness.momentaryLufs)) {
        this.maxMomentaryLufs = Math.max(this.maxMomentaryLufs, loudness.momentaryLufs);
      }
      if (Number.isFinite(loudness.shortTermLufs)) {
        this.maxShortTermLufs = Math.max(this.maxShortTermLufs, loudness.shortTermLufs);
      }
    }
  }

  summary(): SessionSummary {
    const channels: ChannelSummary[] = this.channels
      .slice(0, this.channelCount)
      .map((c) => ({
        maxPeakDb: c.maxPeakDb,
        maxTruePeakDb: c.maxTruePeakDb,
        maxAbsDcOffset: c.maxAbsDcOffset,
      }));
    const totalClipCount = this.channels.reduce((sum, c) => sum + c.clipCount, 0);
    return {
      durationMs: this.durationMs,
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      channels,
      totalClipCount,
      peakRmsDb: this.peakRmsDb,
      correlationMin: this.correlationMin,
      correlationMax: this.correlationMax,
      integratedLufs: this.integratedLufs,
      maxMomentaryLufs: this.maxMomentaryLufs,
      maxShortTermLufs: this.maxShortTermLufs,
      silentMs: this.silentMs,
      lowSignalMs: this.lowSignalMs,
      startedAtMs: this.startedAtMs,
    };
  }

  reset(): void {
    this.durationMs = 0;
    this.sampleRate = 0;
    this.channelCount = 0;
    this.channels = [];
    this.peakRmsDb = DB_FLOOR;
    this.correlationMin = null;
    this.correlationMax = null;
    this.integratedLufs = DB_FLOOR;
    this.maxMomentaryLufs = DB_FLOOR;
    this.maxShortTermLufs = DB_FLOOR;
    this.silentMs = 0;
    this.lowSignalMs = 0;
    this.startedAtMs = Date.now();
  }
}
