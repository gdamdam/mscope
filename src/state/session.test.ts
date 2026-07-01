import { describe, it, expect } from 'vitest';
import { MeasurementSession, DB_FLOOR, type SessionSummary } from './session';
import type { MetricsSnapshot, ChannelLevels, StereoMetrics } from '../audio/analysis/metrics';

function ch(p: Partial<ChannelLevels>): ChannelLevels {
  return {
    peakDb: -10,
    rmsDb: -20,
    truePeakDb: -9,
    dcOffset: 0,
    clipCount: 0,
    clippedNow: false,
    ...p,
  };
}

function snap(p: Partial<MetricsSnapshot> & { channels: ChannelLevels[] }): MetricsSnapshot {
  return {
    timeMs: 0,
    sampleRate: 48000,
    channelCount: p.channels.length,
    stereo: null,
    signal: { silent: false, lowSignal: false },
    ...p,
  };
}

const STEREO: StereoMetrics = { correlation: 0.5, balance: 0 };

describe('MeasurementSession aggregation', () => {
  it('aggregates max peak / true peak / dc / clip (cumulative) / rms / correlation / duration / lufs', () => {
    const s = new MeasurementSession();
    s.ingest(
      snap({
        channels: [ch({ peakDb: -12, truePeakDb: -11, dcOffset: 0.01, clipCount: 2, rmsDb: -20 })],
        stereo: { correlation: 0.8, balance: 0 },
      }),
      100,
      { momentaryLufs: -23, shortTermLufs: -22, integratedLufs: -24 },
    );
    s.ingest(
      snap({
        channels: [ch({ peakDb: -6, truePeakDb: -5, dcOffset: -0.03, clipCount: 3, rmsDb: -14 })],
        stereo: { correlation: -0.2, balance: 0 },
      }),
      200,
      { momentaryLufs: -18, shortTermLufs: -16, integratedLufs: -19 },
    );

    const sum = s.summary();
    expect(sum.durationMs).toBe(300);
    expect(sum.channelCount).toBe(1);
    expect(sum.sampleRate).toBe(48000);
    expect(sum.channels[0].maxPeakDb).toBe(-6);
    expect(sum.channels[0].maxTruePeakDb).toBe(-5);
    expect(sum.channels[0].maxAbsDcOffset).toBeCloseTo(0.03, 10);
    // clipCount is cumulative-per-frame, so the total is the latest (3), not 2+3.
    expect(sum.totalClipCount).toBe(3);
    expect(sum.peakRmsDb).toBe(-14);
    expect(sum.correlationMin).toBe(-0.2);
    expect(sum.correlationMax).toBe(0.8);
    expect(sum.integratedLufs).toBe(-19);
    expect(sum.maxMomentaryLufs).toBe(-18);
    expect(sum.maxShortTermLufs).toBe(-16);
    expect(typeof sum.startedAtMs).toBe('number');
  });

  it('accumulates silent and lowSignal time', () => {
    const s = new MeasurementSession();
    s.ingest(snap({ channels: [ch({})], signal: { silent: true, lowSignal: false } }), 50);
    s.ingest(snap({ channels: [ch({})], signal: { silent: false, lowSignal: true } }), 70);
    s.ingest(snap({ channels: [ch({})], signal: { silent: false, lowSignal: false } }), 30);
    const sum = s.summary();
    expect(sum.silentMs).toBe(50);
    expect(sum.lowSignalMs).toBe(70);
    expect(sum.durationMs).toBe(150);
  });

  it('treats NaN truePeak as not-measured (does not poison max)', () => {
    const s = new MeasurementSession();
    s.ingest(snap({ channels: [ch({ peakDb: -10, truePeakDb: NaN })] }), 10);
    s.ingest(snap({ channels: [ch({ peakDb: -8, truePeakDb: -7 })] }), 10);
    s.ingest(snap({ channels: [ch({ peakDb: -9, truePeakDb: NaN })] }), 10);
    const sum = s.summary();
    expect(sum.channels[0].maxPeakDb).toBe(-8);
    expect(sum.channels[0].maxTruePeakDb).toBe(-7);
    expect(Number.isFinite(sum.channels[0].maxTruePeakDb)).toBe(true);
  });

  it('keeps maxTruePeakDb at DB_FLOOR when never measured', () => {
    const s = new MeasurementSession();
    s.ingest(snap({ channels: [ch({ peakDb: -10, truePeakDb: NaN })] }), 10);
    const sum = s.summary();
    expect(sum.channels[0].maxTruePeakDb).toBe(DB_FLOOR);
    expect(Number.isFinite(sum.channels[0].maxTruePeakDb)).toBe(true);
  });

  it('mono path leaves correlation fields null', () => {
    const s = new MeasurementSession();
    s.ingest(snap({ channels: [ch({})], stereo: null }), 100);
    const sum = s.summary();
    expect(sum.correlationMin).toBeNull();
    expect(sum.correlationMax).toBeNull();
  });

  it('handles per-channel maxes independently for stereo', () => {
    const s = new MeasurementSession();
    s.ingest(
      snap({
        channels: [ch({ peakDb: -3, clipCount: 1 }), ch({ peakDb: -20, clipCount: 4 })],
        stereo: STEREO,
      }),
      100,
    );
    const sum = s.summary();
    expect(sum.channelCount).toBe(2);
    expect(sum.channels[0].maxPeakDb).toBe(-3);
    expect(sum.channels[1].maxPeakDb).toBe(-20);
    expect(sum.totalClipCount).toBe(5);
    expect(sum.correlationMin).toBe(0.5);
    expect(sum.correlationMax).toBe(0.5);
  });

  it('treats per-snapshot clipCount as cumulative (latest), not summed across frames', () => {
    const s = new MeasurementSession();
    // The worklet reports a CUMULATIVE clip count every frame, so the session
    // must take the latest value, not add each frame's running total.
    s.ingest(snap({ channels: [ch({ clipCount: 2 })] }), 100);
    s.ingest(snap({ channels: [ch({ clipCount: 2 })] }), 100);
    s.ingest(snap({ channels: [ch({ clipCount: 5 })] }), 100);
    expect(s.summary().totalClipCount).toBe(5);
  });

  it('retains per-channel maxima when channel count decreases (stereo → mono)', () => {
    const s = new MeasurementSession();
    s.ingest(
      snap({
        channels: [
          ch({ peakDb: -6, truePeakDb: -5, dcOffset: 0.01 }),
          ch({ peakDb: -3, truePeakDb: -2, dcOffset: 0.02 }),
        ],
        stereo: STEREO,
      }),
      100,
    );
    // Source switches to mono without a reset; channel 1 aggregates must survive.
    s.ingest(snap({ channels: [ch({ peakDb: -12, truePeakDb: -11 })] }), 100);
    const sum = s.summary();
    expect(sum.channelCount).toBe(2);
    expect(sum.channels).toHaveLength(2);
    expect(sum.channels[1].maxPeakDb).toBe(-3);
    expect(sum.channels[1].maxTruePeakDb).toBe(-2);
    expect(sum.channels[1].maxAbsDcOffset).toBeCloseTo(0.02, 10);
    // Channel 0 keeps accumulating across the switch.
    expect(sum.channels[0].maxPeakDb).toBe(-6);
  });

  it('reset returns a fresh zeroed summary', () => {
    const s = new MeasurementSession();
    s.ingest(
      snap({ channels: [ch({ peakDb: -1, clipCount: 9 })], stereo: STEREO }),
      500,
      { momentaryLufs: -10, shortTermLufs: -9, integratedLufs: -11 },
    );
    s.reset();
    const sum = s.summary();
    expect(sum.durationMs).toBe(0);
    expect(sum.totalClipCount).toBe(0);
    expect(sum.channels).toEqual([]);
    expect(sum.silentMs).toBe(0);
    expect(sum.lowSignalMs).toBe(0);
    expect(sum.correlationMin).toBeNull();
    expect(sum.correlationMax).toBeNull();
    expect(sum.peakRmsDb).toBe(DB_FLOOR);
    expect(sum.integratedLufs).toBe(DB_FLOOR);
    expect(sum.maxMomentaryLufs).toBe(DB_FLOOR);
    expect(sum.maxShortTermLufs).toBe(DB_FLOOR);
  });

  it('produces an all-finite serializable summary', () => {
    const s = new MeasurementSession();
    s.ingest(snap({ channels: [ch({ truePeakDb: NaN })] }), 10);
    const sum: SessionSummary = s.summary();
    const flat = JSON.stringify(sum);
    expect(flat.includes('null') || true).toBe(true);
    // every numeric leaf finite
    const check = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      else if (Array.isArray(v)) v.forEach(check);
      else if (v && typeof v === 'object') Object.values(v).forEach(check);
    };
    check(sum);
  });
});
