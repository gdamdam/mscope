/**
 * Spectral descriptors over a LINEAR magnitude spectrum (`Float32Array`), where
 * bin `i` corresponds to frequency `i * sampleRate / fftSize`. The browser's
 * AnalyserNode hands back dB values, so `dbSpectrumToLinear` lets callers adapt
 * before feeding these functions. All energy-weighted math runs on power
 * (`mag²`) where a power domain is conventional (flatness), and on magnitude
 * where that is conventional (centroid), matching standard MIR definitions.
 */

import { SpectralMetrics, THIRD_OCTAVE_CENTERS } from '../analysis/derived';
import { linToDb, dbToLin, DB_FLOOR } from './util';

/** Guards the geometric-mean log against log(0) without skewing finite bins. */
const EPS = 1e-20;

/** Convert an AnalyserNode-style dB spectrum to a linear magnitude spectrum. */
export function dbSpectrumToLinear(dbSpec: Float32Array): Float32Array {
  const out = new Float32Array(dbSpec.length);
  for (let i = 0; i < dbSpec.length; i++) out[i] = dbToLin(dbSpec[i]);
  return out;
}

/** Spectral centroid (Hz): Σ(f_i·mag_i)/Σ(mag_i). 0 if the spectrum has no energy. */
export function spectralCentroid(
  mag: Float32Array,
  sampleRate: number,
  fftSize: number,
): number {
  const hzPerBin = sampleRate / fftSize;
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < mag.length; i++) {
    const m = mag[i];
    weighted += i * hzPerBin * m;
    total += m;
  }
  return total > 0 ? weighted / total : 0;
}

/**
 * Spectral flatness in [0,1]: geometricMean/arithmeticMean of bin power (mag²).
 * 1 = white/noise-like, →0 = tonal. 0 if silent.
 *
 * The geomean is exp(mean(log(power))) and is taken over ALL bins so that zero
 * (or near-zero) bins suppress it — that is what makes a single tonal bin read
 * as ~0 rather than 1. Each power gets an epsilon added before log so a true
 * zero can't drive the log to -Infinity; the same epsilon in the arithmetic
 * mean keeps the two domains consistent. A spectrum with no positive bin (or
 * one whose total power is at the epsilon floor) reports 0 as "silent".
 */
export function spectralFlatness(mag: Float32Array): number {
  const n = mag.length;
  if (n === 0) return 0;
  let logSum = 0;
  let arithSum = 0;
  let anyPositive = false;
  for (let i = 0; i < n; i++) {
    const p = mag[i] * mag[i];
    if (p > 0) anyPositive = true;
    logSum += Math.log(p + EPS);
    arithSum += p + EPS;
  }
  if (!anyPositive) return 0;
  const geo = Math.exp(logSum / n);
  const arith = arithSum / n;
  if (arith <= 0) return 0;
  const flat = geo / arith;
  return flat < 0 ? 0 : flat > 1 ? 1 : flat;
}

/** Frequency (Hz) of the strongest bin, ignoring DC (bin 0). 0 if silent. */
export function dominantFrequency(
  mag: Float32Array,
  sampleRate: number,
  fftSize: number,
): number {
  let maxVal = 0;
  let maxIdx = -1;
  for (let i = 1; i < mag.length; i++) {
    if (mag[i] > maxVal) {
      maxVal = mag[i];
      maxIdx = i;
    }
  }
  if (maxIdx < 0 || maxVal <= 0) return 0;
  return (maxIdx * sampleRate) / fftSize;
}

/**
 * Per 1/3-octave centre, the RMS (sqrt of mean power) of bins falling in
 * [center·2^(-1/6), center·2^(1/6)], converted to dBFS. Bands that are empty
 * (no bin in window) or silent report `DB_FLOOR`. Length === centers.length.
 */
export function bandEnergiesDb(
  mag: Float32Array,
  sampleRate: number,
  fftSize: number,
  centers: readonly number[],
): number[] {
  const hzPerBin = sampleRate / fftSize;
  const lowerMul = Math.pow(2, -1 / 6);
  const upperMul = Math.pow(2, 1 / 6);
  const out: number[] = new Array(centers.length);

  for (let c = 0; c < centers.length; c++) {
    const lo = centers[c] * lowerMul;
    const hi = centers[c] * upperMul;
    // Bin index range covering [lo, hi]; clamp to valid bins.
    let iLo = Math.ceil(lo / hzPerBin);
    let iHi = Math.floor(hi / hzPerBin);
    if (iLo < 0) iLo = 0;
    if (iHi > mag.length - 1) iHi = mag.length - 1;

    let powSum = 0;
    let count = 0;
    for (let i = iLo; i <= iHi; i++) {
      powSum += mag[i] * mag[i];
      count++;
    }
    if (count === 0 || powSum <= 0) {
      out[c] = DB_FLOOR;
    } else {
      out[c] = linToDb(Math.sqrt(powSum / count));
    }
  }
  return out;
}

/** Aggregate every spectral descriptor into a `SpectralMetrics`. */
export function computeSpectral(
  mag: Float32Array,
  sampleRate: number,
  fftSize: number,
  centers: readonly number[] = THIRD_OCTAVE_CENTERS,
): SpectralMetrics {
  return {
    centroidHz: spectralCentroid(mag, sampleRate, fftSize),
    flatness: spectralFlatness(mag),
    dominantHz: dominantFrequency(mag, sampleRate, fftSize),
    bandsDb: bandEnergiesDb(mag, sampleRate, fftSize, centers),
  };
}
