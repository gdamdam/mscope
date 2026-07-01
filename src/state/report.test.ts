import { describe, it, expect } from 'vitest';
import { toJson, toMarkdown, DISCLAIMER } from './report';
import { DB_FLOOR, MeasurementSession, type SessionSummary } from './session';
import type { MetricsSnapshot, ChannelLevels } from '../audio/analysis/metrics';

function ch(p: Partial<ChannelLevels>): ChannelLevels {
  return { peakDb: -10, rmsDb: -20, truePeakDb: -9, dcOffset: 0, clipCount: 0, clippedNow: false, ...p };
}
function snap(p: Partial<MetricsSnapshot> & { channels: ChannelLevels[] }): MetricsSnapshot {
  return {
    timeMs: 0,
    sampleRate: 44100,
    channelCount: p.channels.length,
    stereo: null,
    signal: { silent: false, lowSignal: false },
    ...p,
  };
}

function buildSummary(): SessionSummary {
  const s = new MeasurementSession();
  s.ingest(
    snap({
      channels: [ch({ peakDb: -6, truePeakDb: -5, clipCount: 2, rmsDb: -14, dcOffset: 0.02 })],
      stereo: { correlation: 0.3, balance: 0 },
    }),
    1000,
    { momentaryLufs: -18, shortTermLufs: -16, integratedLufs: -19 },
  );
  return s.summary();
}

describe('report toJson', () => {
  it('produces valid pretty JSON that round-trips fields', () => {
    const sum = buildSummary();
    const json = toJson(sum);
    expect(json).toContain('\n'); // pretty-printed
    const parsed = JSON.parse(json) as SessionSummary;
    expect(parsed.durationMs).toBe(sum.durationMs);
    expect(parsed.totalClipCount).toBe(sum.totalClipCount);
    expect(parsed.sampleRate).toBe(sum.sampleRate);
    expect(parsed.channels[0].maxPeakDb).toBe(sum.channels[0].maxPeakDb);
    expect(parsed.integratedLufs).toBe(sum.integratedLufs);
    expect(parsed.correlationMin).toBe(sum.correlationMin);
  });
});

describe('report toMarkdown', () => {
  it('contains the verbatim disclaimer', () => {
    const md = toMarkdown(buildSummary());
    expect(md).toContain(DISCLAIMER);
    expect(DISCLAIMER).toContain('not calibrated/lab-grade');
  });

  it('contains the required sections', () => {
    const md = toMarkdown(buildSummary());
    expect(md).toMatch(/Source/i);
    expect(md).toMatch(/Levels/i);
    expect(md).toMatch(/Loudness/i);
    expect(md).toMatch(/Diagnostics/i);
  });

  it('renders the DB_FLOOR "not measured" sentinel as n/a, not a value', () => {
    // A silent channel never observes a finite peak; both maxes sit at DB_FLOOR.
    const s = new MeasurementSession();
    s.ingest(snap({ channels: [ch({ peakDb: NaN, truePeakDb: NaN })] }), 100);
    const md = toMarkdown(s.summary());
    const row = md.split('\n').find((l) => l.startsWith('| 0 |'));
    expect(row).toBeDefined();
    expect(row).not.toContain(`${DB_FLOOR}`);
    // DC offset legitimately starts (and can stay) at 0 — printed as-is.
    expect(row).toBe('| 0 | n/a | n/a | 0 |');
  });

  it('contains key metric values', () => {
    const sum = buildSummary();
    const md = toMarkdown(sum);
    expect(md).toContain('44100'); // sample rate
    expect(md).toContain('-6'); // peak dB
    expect(md).toContain('-19'); // integrated lufs
    expect(md).toContain('2'); // clip count
  });
});
