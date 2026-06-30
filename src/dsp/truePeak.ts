/**
 * Inter-sample (true) peak detection per ITU-R BS.1770.
 *
 * A digital meter that only inspects stored samples can under-read: the
 * continuous waveform reconstructed from those samples can swing higher
 * *between* sample instants (the classic fs/4-at-pi/4 case peaks at the
 * sample values 0.7071 yet the true signal reaches 1.0). BS.1770 mandates
 * oversampling by >=4x with a band-limited interpolation filter and metering
 * the upsampled signal.
 *
 * Approach: a windowed-sinc (Blackman) polyphase FIR. We build `oversample`
 * sub-filters (one per fractional phase) once, each tapping `2*HALF_TAPS`
 * input samples. Convolving gives band-limited interpolated points; the max
 * |value| over inputs + interpolated points is the true peak, converted to
 * dBTP via linToDb. Sinc interpolation reconstructs band-limited signals
 * essentially exactly, so the fs/4 overshoot is recovered to well within the
 * 0.5 dB tolerance the spec implies for the standard 4x test.
 */

import { DB_FLOOR, linToDb } from "./util";

/** One-sided tap count of the sinc kernel. 16 (=> 32 taps) balances accuracy
 *  vs. cost; ample for the BS.1770 4x overshoot recovery. */
const HALF_TAPS = 16;

/** Blackman window over the full kernel support [0, fullTaps-1]. */
function blackman(i: number, fullTaps: number): number {
  const x = (2 * Math.PI * i) / (fullTaps - 1);
  return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
}

/** Normalized sinc: sinc(0)=1, else sin(pi x)/(pi x). */
function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/**
 * Build `factor` polyphase sub-filters. Sub-filter p reconstructs the value at
 * fractional offset p/factor between input samples. Each has 2*HALF_TAPS taps
 * centered on the interpolation point. Returned as one flat Float32Array of
 * length factor * (2*HALF_TAPS); phase p occupies [p*taps, (p+1)*taps).
 */
function buildPolyphase(factor: number): { taps: number; coeffs: Float32Array } {
  const taps = 2 * HALF_TAPS;
  const coeffs = new Float32Array(factor * taps);
  for (let p = 0; p < factor; p++) {
    const frac = p / factor; // sub-sample offset to the right of the left tap center
    let sum = 0;
    const base = p * taps;
    for (let t = 0; t < taps; t++) {
      // Tap t corresponds to input index (center - HALF_TAPS + 1 + t).
      // Distance from the interpolation point to that tap:
      const dist = t - (HALF_TAPS - 1) - frac;
      const c = sinc(dist) * blackman(t, taps);
      coeffs[base + t] = c;
      sum += c;
    }
    // Normalize each sub-filter to unity DC gain so constant signals are exact.
    if (sum !== 0) {
      const inv = 1 / sum;
      for (let t = 0; t < taps; t++) coeffs[base + t] *= inv;
    }
  }
  return { taps, coeffs };
}

/**
 * Band-limited upsample by an integer `factor` (>=1) via the polyphase
 * windowed-sinc filter. Output length is samples.length * factor; output[i*factor]
 * approximates the original sample i (phase 0). Edges use zero-padding.
 */
export function upsample(samples: Float32Array, factor: number): Float32Array {
  const n = samples.length;
  if (factor <= 1 || n === 0) return Float32Array.from(samples);
  const { taps, coeffs } = buildPolyphase(factor);
  const out = new Float32Array(n * factor);
  for (let i = 0; i < n; i++) {
    const left = i - (HALF_TAPS - 1); // index of the first tap's input sample
    for (let p = 0; p < factor; p++) {
      let acc = 0;
      const base = p * taps;
      for (let t = 0; t < taps; t++) {
        // Replicate-edge (clamp) padding rather than zeros: zero-padding injects
        // a synthetic step at the signal boundary, whose band-limited reconstruction
        // rings (Gibbs) and falsely overshoots — e.g. a constant signal would read
        // >0 dBTP. Clamping keeps constants exactly constant and avoids the fake edge.
        let idx = left + t;
        if (idx < 0) idx = 0;
        else if (idx >= n) idx = n - 1;
        acc += samples[idx] * coeffs[base + t];
      }
      out[i * factor + p] = acc;
    }
  }
  return out;
}

/**
 * Estimate the inter-sample (true) peak in dBTP (BS.1770).
 *
 * @param samples   mono PCM in [-1, 1] (values outside are handled, just metered).
 * @param oversample integer oversampling factor; spec requires >=4. Defaults to 4.
 * @returns peak in dBTP, or DB_FLOOR for empty/silent input.
 */
export function truePeakDb(samples: Float32Array, oversample = 4): number {
  const n = samples.length;
  if (n === 0) return DB_FLOOR;

  const factor = Math.max(1, Math.floor(oversample));

  // Always include the raw sample magnitudes so the result can never read
  // *below* the sample peak (interpolation only adds points between them).
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }

  if (factor > 1) {
    const up = upsample(samples, factor);
    for (let i = 0; i < up.length; i++) {
      const a = Math.abs(up[i]);
      if (a > peak) peak = a;
    }
  }

  return linToDb(peak);
}
