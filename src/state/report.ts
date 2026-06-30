import { DB_FLOOR, type SessionSummary, type ChannelSummary } from './session';

/** Honesty disclaimer embedded near the top of every Markdown report. Verbatim. */
export const DISCLAIMER =
  'Measured at capture. Browser audio capture may be resampled and is not ' +
  'guaranteed bit-identical to the source; values are not calibrated/lab-grade.';

/** Pretty-printed, valid JSON of the session summary. */
export function toJson(s: SessionSummary): string {
  return JSON.stringify(s, null, 2);
}

/** Format a dB/LUFS value, rendering the export floor as a clear "n/a". */
function db(v: number): string {
  if (!Number.isFinite(v) || v <= DB_FLOOR) return 'n/a';
  return `${v} dB`;
}

function lufs(v: number): string {
  if (!Number.isFinite(v) || v <= DB_FLOOR) return 'n/a';
  return `${v} LUFS`;
}

function ms(v: number): string {
  return `${v} ms`;
}

function channelRow(c: ChannelSummary, i: number): string {
  const tp = c.maxTruePeakDb <= DB_FLOOR ? 'n/a' : `${c.maxTruePeakDb} dBTP`;
  return (
    `| ${i} | ${c.maxPeakDb} dBFS | ${tp} | ${c.maxAbsDcOffset} |`
  );
}

/** Human-readable diagnostic report in Markdown. */
export function toMarkdown(s: SessionSummary): string {
  const lines: string[] = [];
  lines.push('# mscope Measurement Report');
  lines.push('');
  lines.push(`> ${DISCLAIMER}`);
  lines.push('');

  lines.push('## Source / format');
  lines.push('');
  lines.push(`- Sample rate: ${s.sampleRate} Hz`);
  lines.push(`- Channels: ${s.channelCount}`);
  lines.push(`- Duration: ${ms(s.durationMs)}`);
  lines.push(`- Started at (epoch ms): ${s.startedAtMs}`);
  lines.push('');

  lines.push('## Levels');
  lines.push('');
  lines.push('| Channel | Max peak | Max true peak | Max abs DC offset |');
  lines.push('| --- | --- | --- | --- |');
  if (s.channels.length === 0) {
    lines.push('| (none) | n/a | n/a | n/a |');
  } else {
    s.channels.forEach((c, i) => lines.push(channelRow(c, i)));
  }
  lines.push('');
  lines.push(`- Peak RMS: ${db(s.peakRmsDb)}`);
  if (s.correlationMin === null || s.correlationMax === null) {
    lines.push('- Stereo correlation: n/a (mono)');
  } else {
    lines.push(`- Stereo correlation: min ${s.correlationMin}, max ${s.correlationMax}`);
  }
  lines.push('');

  lines.push('## Loudness');
  lines.push('');
  lines.push(`- Integrated: ${lufs(s.integratedLufs)}`);
  lines.push(`- Max momentary: ${lufs(s.maxMomentaryLufs)}`);
  lines.push(`- Max short-term: ${lufs(s.maxShortTermLufs)}`);
  lines.push('');

  lines.push('## Diagnostics');
  lines.push('');
  lines.push(`- Total clipped samples: ${s.totalClipCount}`);
  lines.push(`- Time silent: ${ms(s.silentMs)}`);
  lines.push(`- Time low-signal: ${ms(s.lowSignalMs)}`);
  lines.push('');

  return lines.join('\n');
}
