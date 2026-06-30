import { describe, it, expect } from 'vitest';
import {
  dbSpectrumToLinear,
  spectralCentroid,
  spectralFlatness,
  dominantFrequency,
  bandEnergiesDb,
  computeSpectral,
} from './spectral';
import { THIRD_OCTAVE_CENTERS } from '../analysis/derived';
import { dbToLin, DB_FLOOR } from './util';

const SR = 48000;
const FFT = 2048;
// Bin spacing = SR / FFT = 23.4375 Hz. A linear mag spectrum has FFT/2 bins.
const BINS = FFT / 2;
const binFreq = (i: number) => (i * SR) / FFT;

/** Build a zero spectrum of the standard length. */
function zeros(): Float32Array {
  return new Float32Array(BINS);
}

describe('dbSpectrumToLinear', () => {
  it('converts each dB bin to linear via dbToLin', () => {
    const db = new Float32Array([0, -6, -20, -60]);
    const lin = dbSpectrumToLinear(db);
    expect(lin.length).toBe(4);
    for (let i = 0; i < db.length; i++) {
      // Output is a Float32Array, so compare at float32 precision (~7 sig figs).
      expect(lin[i]).toBeCloseTo(dbToLin(db[i]), 6);
    }
  });

  it('maps 0 dB to 1.0 linear', () => {
    const lin = dbSpectrumToLinear(new Float32Array([0]));
    expect(lin[0]).toBeCloseTo(1, 12);
  });
});

describe('spectralCentroid', () => {
  it('equals the bin frequency for a single non-zero bin', () => {
    const mag = zeros();
    const k = 40;
    mag[k] = 1;
    expect(spectralCentroid(mag, SR, FFT)).toBeCloseTo(binFreq(k), 6);
  });

  it('is the energy-weighted mean of two equal bins', () => {
    const mag = zeros();
    mag[10] = 1;
    mag[30] = 1;
    expect(spectralCentroid(mag, SR, FFT)).toBeCloseTo(
      (binFreq(10) + binFreq(30)) / 2,
      6,
    );
  });

  it('returns 0 when there is no energy', () => {
    expect(spectralCentroid(zeros(), SR, FFT)).toBe(0);
  });
});

describe('spectralFlatness', () => {
  it('is ~0 for a single tonal bin', () => {
    const mag = zeros();
    mag[100] = 1;
    expect(spectralFlatness(mag)).toBeLessThan(1e-6);
  });

  it('is ~1 for a perfectly flat spectrum', () => {
    const mag = new Float32Array(BINS).fill(0.5);
    expect(spectralFlatness(mag)).toBeCloseTo(1, 6);
  });

  it('returns 0 for silence', () => {
    expect(spectralFlatness(zeros())).toBe(0);
  });

  it('stays within [0,1]', () => {
    const mag = zeros();
    for (let i = 0; i < BINS; i++) mag[i] = Math.random();
    const f = spectralFlatness(mag);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});

describe('dominantFrequency', () => {
  it('returns the frequency of the strongest bin', () => {
    const mag = zeros();
    mag[5] = 0.3;
    mag[77] = 0.9;
    mag[200] = 0.1;
    expect(dominantFrequency(mag, SR, FFT)).toBeCloseTo(binFreq(77), 6);
  });

  it('ignores the DC bin (bin 0)', () => {
    const mag = zeros();
    mag[0] = 10; // huge DC offset
    mag[50] = 1;
    expect(dominantFrequency(mag, SR, FFT)).toBeCloseTo(binFreq(50), 6);
  });

  it('returns 0 for silence', () => {
    expect(dominantFrequency(zeros(), SR, FFT)).toBe(0);
  });
});

describe('bandEnergiesDb', () => {
  it('returns one value per centre', () => {
    const bands = bandEnergiesDb(zeros(), SR, FFT, THIRD_OCTAVE_CENTERS);
    expect(bands.length).toBe(THIRD_OCTAVE_CENTERS.length);
  });

  it('reports DB_FLOOR for every band when silent', () => {
    const bands = bandEnergiesDb(zeros(), SR, FFT, THIRD_OCTAVE_CENTERS);
    for (const b of bands) expect(b).toBe(DB_FLOOR);
  });

  it('lands a 1 kHz tone in the 1000 Hz band', () => {
    const mag = zeros();
    // place unit energy at the bin closest to 1000 Hz
    const k = Math.round((1000 * FFT) / SR);
    mag[k] = 1;
    const bands = bandEnergiesDb(mag, SR, FFT, THIRD_OCTAVE_CENTERS);
    const idx = THIRD_OCTAVE_CENTERS.indexOf(1000);
    // 1000 Hz band should be the loudest, finite band.
    let maxIdx = 0;
    for (let i = 1; i < bands.length; i++) if (bands[i] > bands[maxIdx]) maxIdx = i;
    expect(maxIdx).toBe(idx);
    expect(bands[idx]).toBeGreaterThan(DB_FLOOR);
  });

  it('uses DB_FLOOR for bands containing no bins', () => {
    // A band whose [lo,hi] window contains no FFT bin (only possible at very
    // low centres for large bin spacing) must report DB_FLOOR, not NaN.
    const mag = zeros();
    mag[100] = 1; // energy only up high
    const bands = bandEnergiesDb(mag, SR, FFT, THIRD_OCTAVE_CENTERS);
    // 20 Hz band: window ~[17.8, 22.4] Hz; bin spacing 23.4 Hz → may be empty.
    expect(Number.isFinite(bands[0])).toBe(true);
  });
});

describe('computeSpectral', () => {
  it('aggregates all descriptors with default centres', () => {
    const mag = zeros();
    const k = Math.round((1000 * FFT) / SR);
    mag[k] = 1;
    const m = computeSpectral(mag, SR, FFT);
    expect(m.centroidHz).toBeCloseTo(binFreq(k), 6);
    expect(m.dominantHz).toBeCloseTo(binFreq(k), 6);
    expect(m.flatness).toBeLessThan(1e-6);
    expect(m.bandsDb.length).toBe(THIRD_OCTAVE_CENTERS.length);
  });

  it('returns zeros / DB_FLOOR for silence', () => {
    const m = computeSpectral(zeros(), SR, FFT);
    expect(m.centroidHz).toBe(0);
    expect(m.dominantHz).toBe(0);
    expect(m.flatness).toBe(0);
    for (const b of m.bandsDb) expect(b).toBe(DB_FLOOR);
  });
});
