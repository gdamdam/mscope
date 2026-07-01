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
 * The polyphase coefficients depend only on `factor` and are otherwise constant,
 * but truePeakDb runs on the realtime AudioWorklet thread. Memoize per factor so
 * the sinc/Blackman bank is built once, not reallocated and recomputed on every
 * frame. Exported for tests.
 */
const polyphaseCache = new Map<number, { taps: number; coeffs: Float32Array }>();
export function getPolyphase(factor: number): { taps: number; coeffs: Float32Array } {
  let cached = polyphaseCache.get(factor);
  if (!cached) {
    cached = buildPolyphase(factor);
    polyphaseCache.set(factor, cached);
  }
  return cached;
}

/**
 * Band-limited upsample by an integer `factor` (>=1) via the polyphase
 * windowed-sinc filter. Output length is samples.length * factor; output[i*factor]
 * approximates the original sample i (phase 0). Edges use zero-padding.
 */
export function upsample(samples: Float32Array, factor: number): Float32Array {
  const n = samples.length;
  if (factor <= 1 || n === 0) return Float32Array.from(samples);
  const { taps, coeffs } = getPolyphase(factor);
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

/**
 * Stateful streaming true-peak meter for frame-by-frame metering.
 *
 * The one-shot `truePeakDb` pads each buffer's edges by replication, so an
 * inter-sample excursion straddling two consecutive frames is invisible to it
 * (the interpolator never sees the neighboring frame's samples) and can be
 * under-read by up to ~3 dB. This meter instead carries a short history tail
 * across `process` calls: each frame is interpolated against the real
 * preceding samples, and interpolation points whose right-hand filter support
 * isn't available yet (the last HALF_TAPS positions of the frame) are
 * deferred and evaluated on the next call — so a peak that falls exactly
 * between two frames is reported (in the later frame) at its true value.
 * Feeding one long buffer or the same samples split into arbitrary frames
 * yields the same overall maximum.
 *
 * The very first positions after construction/reset have no real left
 * context; like `upsample`, they clamp to the first sample (replicate-edge)
 * to avoid synthetic-step ringing.
 */
export class TruePeakMeter {
  private readonly factor: number;
  /** Carried samples: left context (up to HALF_TAPS-1) + deferred positions. */
  private tail = new Float32Array(0);
  /** Index within `tail` of the first interpolation position not yet evaluated. */
  private firstPending = 0;

  constructor(oversample = 4) {
    this.factor = Math.max(1, Math.floor(oversample));
  }

  /** Forget all history (call when the stream restarts or channels reset). */
  reset(): void {
    this.tail = new Float32Array(0);
    this.firstPending = 0;
  }

  /**
   * Meter one frame. Returns the peak (dBTP) over this frame's raw samples
   * plus every newly fully-supported interpolated point — including the
   * deferred boundary region between the previous frame and this one.
   * An empty frame returns DB_FLOOR and leaves the history untouched.
   */
  process(frame: Float32Array): number {
    const n = frame.length;
    if (n === 0) return DB_FLOOR;

    // Raw sample magnitudes of THIS frame need no filter support.
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(frame[i]);
      if (a > peak) peak = a;
    }

    if (this.factor > 1) {
      const { taps, coeffs } = getPolyphase(this.factor);
      const H = HALF_TAPS;
      const L = this.tail.length;
      const N = L + n;
      // ext = [carried tail | new frame]
      const ext = new Float32Array(N);
      ext.set(this.tail, 0);
      ext.set(frame, L);

      // Evaluate every interpolation position whose full right-hand support
      // (H samples) is now available, resuming where the last call stopped.
      const endPos = N - 1 - H;
      for (let i = this.firstPending; i <= endPos; i++) {
        const left = i - (H - 1);
        for (let p = 0; p < this.factor; p++) {
          let acc = 0;
          const base = p * taps;
          for (let t = 0; t < taps; t++) {
            // idx >= N cannot happen (i <= N-1-H); idx < 0 only at stream
            // start, where we replicate the first sample (see class doc).
            let idx = left + t;
            if (idx < 0) idx = 0;
            acc += ext[idx] * coeffs[base + t];
          }
          const a = Math.abs(acc);
          if (a > peak) peak = a;
        }
      }

      // Carry the still-pending trailing positions plus their H-1 samples of
      // left context, so the next frame evaluates the boundary region against
      // real preceding samples.
      const nextPending = Math.max(this.firstPending, endPos + 1);
      const keepFrom = Math.max(0, nextPending - (H - 1));
      this.tail = ext.slice(keepFrom);
      this.firstPending = nextPending - keepFrom;
    }

    return linToDb(peak);
  }
}
