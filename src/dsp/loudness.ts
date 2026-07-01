/**
 * ITU-R BS.1770-4 / EBU R128 loudness (LUFS), built from scratch.
 *
 * Pipeline per channel:
 *   1. K-weighting = two cascaded biquads:
 *        Stage 1 — high-shelf "pre-filter" (head/torso acoustic shelf, ~+4 dB).
 *        Stage 2 — RLB high-pass ("revised low-frequency B" curve).
 *   2. Mean-square of K-weighted samples, summed across channels with
 *      channel weights G_L = G_R = 1.0 (stereo).
 *   3. Loudness:  L = -0.691 + 10*log10( Σ_ch G_ch * meanSquare_ch ).
 *
 * COEFFICIENT SOURCE -----------------------------------------------------------
 * BS.1770-4 specifies the two biquads by reference coefficients at fs = 48 kHz
 * (Annex 1, Tables 1 & 2). To support an ARBITRARY sample rate we DON'T hardcode
 * those numbers; instead we reconstruct the underlying analog prototypes and
 * re-discretise them with the bilinear transform for the target fs. This is the
 * documented derivation used by pyloudnorm / loudness.py and by Mansbridge,
 * Finn & Reiss, "Implementation and Evaluation of Autonomous Multi-track Fader
 * Control" (AES 132, 2012), whose analog parameters reproduce the BS.1770-4
 * 48 kHz coefficients to full precision:
 *
 *   Stage 1 (high-shelf):  f0 = 1681.974450955533 Hz, Q = 0.7071752369554196,
 *                          gain G = 3.999843853973347 dB.
 *   Stage 2 (RLB HPF):     f0 = 38.13547087602444 Hz, Q = 0.5003270373238773
 *                          (high-pass, 0 dB gain).
 *
 * Discretised at 48 kHz these yield exactly the BS.1770-4 reference values:
 *   Stage1: b = [1.53512485958697, -2.69169618940638, 1.19839281085285],
 *           a = [1, -1.69065929318241, 0.73248077421585]
 *   Stage2: b = [1, -2, 1], a = [1, -1.99004745483398, 0.99007225036621]
 * (verified by the calibration test at both 48 kHz and 44.1 kHz).
 *
 * Below-measurable / silence is reported as -Infinity (per spec gating; also
 * matches "below absolute gate" → no measurable loudness). This module uses
 * -Infinity rather than the project's finite DB_FLOOR because LUFS gating is
 * defined in terms of an unbounded log scale.
 */

import type { StereoBlock } from "./types";

/** Result of a meter query. -Infinity means below-measurable / silent. */
export interface LoudnessSnapshot {
  /** Loudness over the trailing 400 ms (ungated). */
  momentaryLufs: number;
  /** Loudness over the trailing 3 s (ungated). */
  shortTermLufs: number;
  /** Gated loudness over all processed audio (absolute + relative gate). */
  integratedLufs: number;
}

/** Direct-form-I biquad coefficients, a0 normalised to 1. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * High-shelf biquad for BS.1770 Stage 1, using the De Man / pyloudnorm
 * bilinear-transform derivation. NOTE: this is NOT the RBJ cookbook shelf —
 * the RBJ sqrt(A)-slope form does NOT reproduce the BS.1770-4 spec-table
 * coefficients (it is ~0.26 dB off at 1 kHz). The Vb exponent 0.499666774155
 * is the published De Man constant that matches the spec table to ~1e-12.
 */
function highShelf(f0: number, q: number, gainDb: number, fs: number): Biquad {
  const k = Math.tan((Math.PI * f0) / fs);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.499666774155);
  const a0 = 1 + k / q + k * k;

  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

/**
 * High-pass biquad for BS.1770 Stage 2 (RLB HPF), bilinear derivation.
 * The numerator is the UNNORMALIZED [1, -2, 1] — exactly what the BS.1770-4
 * spec table uses. (Normalizing b by a0, as RBJ does, introduces a constant
 * ≈ -0.043 dB passband offset relative to the spec.)
 */
function highPass(f0: number, q: number, fs: number): Biquad {
  const k = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + k / q + k * k;

  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

/** Analog-prototype parameters reproducing the BS.1770-4 48 kHz coefficients. */
const SHELF_F0 = 1681.974450955533;
const SHELF_Q = 0.7071752369554196;
const SHELF_GAIN_DB = 3.999843853973347;
const HPF_F0 = 38.13547087602444;
const HPF_Q = 0.5003270373238773;

/**
 * Build the two K-weighting biquads for a given sample rate.
 * Exported so tests can compare against the BS.1770-4 spec tables directly.
 */
export function kWeightCoefficients(fs: number): [Biquad, Biquad] {
  return [
    highShelf(SHELF_F0, SHELF_Q, SHELF_GAIN_DB, fs),
    highPass(HPF_F0, HPF_Q, fs),
  ];
}

/** Magnitude response (in dB) of one biquad at frequency `f` for sample rate `fs`. */
function biquadMagDb(bq: Biquad, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const cosw = Math.cos(w);
  const cos2w = Math.cos(2 * w);
  const sinw = Math.sin(w);
  const sin2w = Math.sin(2 * w);
  // H(e^jw) = (b0 + b1 e^-jw + b2 e^-2jw) / (1 + a1 e^-jw + a2 e^-2jw)
  const numRe = bq.b0 + bq.b1 * cosw + bq.b2 * cos2w;
  const numIm = -(bq.b1 * sinw + bq.b2 * sin2w);
  const denRe = 1 + bq.a1 * cosw + bq.a2 * cos2w;
  const denIm = -(bq.a1 * sinw + bq.a2 * sin2w);
  const numMag2 = numRe * numRe + numIm * numIm;
  const denMag2 = denRe * denRe + denIm * denIm;
  return 10 * Math.log10(numMag2 / denMag2);
}

/**
 * Combined K-weighting magnitude gain (dB) at frequency `f` for sample rate
 * `fs`. The cascade gain at 997 Hz is +0.691 dB — the origin of the spec's
 * -0.691 loudness offset. Tests check this against hard-coded spec values.
 */
export function kWeightGainDb(f: number, fs: number): number {
  const [s1, s2] = kWeightCoefficients(fs);
  return biquadMagDb(s1, f, fs) + biquadMagDb(s2, f, fs);
}

/** Stateful Direct-Form-I biquad. */
class BiquadState {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private readonly c: Biquad) {}

  step(x: number): number {
    const c = this.c;
    const y =
      c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

/** A channel's cascaded K-weighting filter (shelf -> HPF). */
class KWeightFilter {
  private readonly s1: BiquadState;
  private readonly s2: BiquadState;
  constructor(fs: number) {
    const [c1, c2] = kWeightCoefficients(fs);
    this.s1 = new BiquadState(c1);
    this.s2 = new BiquadState(c2);
  }
  step(x: number): number {
    return this.s2.step(this.s1.step(x));
  }
  reset(): void {
    this.s1.reset();
    this.s2.reset();
  }
}

/** Loudness offset constant from BS.1770-4. */
const LUFS_OFFSET = -0.691;
/** Absolute gate threshold (BS.1770-4 / EBU R128). */
const ABSOLUTE_GATE_LUFS = -70;
/** Relative gate is this many LU below the (ungated) mean loudness. */
const RELATIVE_GATE_LU = -10;

/**
 * Convert a summed-weighted mean-square power into LUFS.
 * Returns -Infinity for non-positive power (silence / below-measurable).
 */
function powerToLufs(weightedPower: number): number {
  if (!(weightedPower > 0)) return -Infinity;
  return LUFS_OFFSET + 10 * Math.log10(weightedPower);
}

/**
 * Streaming BS.1770-4 / EBU R128 loudness meter (stereo or mono).
 *
 * GATING -----------------------------------------------------------------------
 * Integrated loudness uses 400 ms gating blocks with 75% overlap (a new block
 * every 100 ms hop), per BS.1770-4. This is implemented O(n) by accumulating
 * 100 ms hop sums and keeping a running sum of the last four hops; a gating
 * block completes at every hop boundary once four hops have been seen. A final
 * incomplete block is discarded (spec behavior), so at most <100 ms of tail is
 * ignored. Momentary (400 ms) and short-term (3 s) are exact trailing windows.
 */
export class LoudnessMeter {
  private readonly left: KWeightFilter;
  private readonly right: KWeightFilter;

  /** Trailing ring of per-sample summed weighted square (over channels). */
  private readonly ring: Float64Array;
  private ringFill = 0; // valid samples written (capped at ring length)
  private ringHead = 0; // next write index
  private runningSum = 0; // sum of the most-recent `momentaryLen` entries
  private readonly momentaryLen: number; // 400 ms in samples
  private readonly shortTermLen: number; // 3 s in samples
  /** Prefix-sum-free short-term sum maintained over the full ring. */
  private shortTermSum = 0;

  /** 400 ms gating blocks with 75% overlap: 100 ms hop accumulator. */
  private gateHopSum = 0; // sum of p over the current (partial) 100 ms hop
  private gateHopCount = 0; // samples accumulated into the current hop
  private readonly gateHopLen: number; // 100 ms in samples
  private readonly gateBlockLen: number; // 400 ms in samples (= 4 hops)
  /** Last 4 completed hop sums (ring); their total is `gateWindowSum`. */
  private readonly gateHopRing = new Float64Array(4);
  private gateHopHead = 0; // next write index into gateHopRing
  private gateHopsSeen = 0; // completed hops, capped at 4
  private gateWindowSum = 0; // running sum of the last 4 hop sums
  /** Per-block weighted mean-square power of completed gating blocks. */
  private readonly gateBlockPowers: number[] = [];

  constructor(sampleRate: number) {
    if (!(sampleRate > 0)) throw new Error("sampleRate must be > 0");
    this.left = new KWeightFilter(sampleRate);
    this.right = new KWeightFilter(sampleRate);
    this.momentaryLen = Math.max(1, Math.round(0.4 * sampleRate));
    this.shortTermLen = Math.max(1, Math.round(3.0 * sampleRate));
    this.gateHopLen = Math.max(1, Math.round(0.1 * sampleRate)); // 100 ms hop
    this.gateBlockLen = 4 * this.gateHopLen; // 400 ms gating block
    this.ring = new Float64Array(this.shortTermLen);
  }

  /** K-weight each channel, accumulate per-sample summed weighted power. */
  process(block: StereoBlock): void {
    const { left, right } = block;
    const n = left.length;
    for (let i = 0; i < n; i++) {
      const l = this.left.step(left[i]);
      // Mono: duplicate the left channel's contribution so G_L=G_R=1 stereo
      // and a centered mono signal land on the same loudness scale.
      const r = right ? this.right.step(right[i]) : l;
      // Summed weighted square across channels (G_L = G_R = 1.0).
      const p = l * l + r * r;
      this.pushSample(p);
    }
  }

  /** Insert one per-sample power into the trailing ring + gating accumulator. */
  private pushSample(p: number): void {
    // Trailing-window bookkeeping over a ring sized to the 3 s short-term window.
    const ring = this.ring;
    const cap = ring.length;

    // Short-term sum: subtract the value being overwritten, add the new one.
    if (this.ringFill === cap) {
      this.shortTermSum -= ring[this.ringHead];
    } else {
      this.ringFill++;
    }
    ring[this.ringHead] = p;
    this.shortTermSum += p;
    this.ringHead = (this.ringHead + 1) % cap;

    // Momentary running sum: trailing `momentaryLen` samples.
    this.runningSum += p;
    if (this.ringFill > this.momentaryLen || this.ringFill === cap) {
      // Subtract the entry that fell out of the 400 ms tail.
      const outIdx =
        (this.ringHead - 1 - this.momentaryLen + cap * 2) % cap;
      this.runningSum -= ring[outIdx];
    }

    // Gating: 400 ms blocks, 100 ms hop (75% overlap per BS.1770-4).
    this.gateHopSum += p;
    this.gateHopCount++;
    if (this.gateHopCount === this.gateHopLen) {
      // Slide the 4-hop window: drop the oldest hop sum, add the new one.
      this.gateWindowSum += this.gateHopSum - this.gateHopRing[this.gateHopHead];
      this.gateHopRing[this.gateHopHead] = this.gateHopSum;
      this.gateHopHead = (this.gateHopHead + 1) % 4;
      this.gateHopSum = 0;
      this.gateHopCount = 0;
      if (this.gateHopsSeen < 4) this.gateHopsSeen++;
      if (this.gateHopsSeen === 4) {
        this.gateBlockPowers.push(this.gateWindowSum / this.gateBlockLen);
      }
    }
  }

  snapshot(): LoudnessSnapshot {
    return {
      momentaryLufs: this.momentary(),
      shortTermLufs: this.shortTerm(),
      integratedLufs: this.integrated(),
    };
  }

  private momentary(): number {
    const n = Math.min(this.ringFill, this.momentaryLen);
    if (n === 0) return -Infinity;
    return powerToLufs(this.runningSum / n);
  }

  private shortTerm(): number {
    const n = this.ringFill;
    if (n === 0) return -Infinity;
    return powerToLufs(this.shortTermSum / n);
  }

  private integrated(): number {
    const powers = this.gateBlockPowers;
    if (powers.length === 0) return -Infinity;

    // Stage 1 — absolute gate at -70 LUFS: keep blocks above it.
    const absKept: number[] = [];
    let absSum = 0;
    for (const power of powers) {
      if (powerToLufs(power) > ABSOLUTE_GATE_LUFS) {
        absKept.push(power);
        absSum += power;
      }
    }
    if (absKept.length === 0) return -Infinity;

    // Relative gate threshold: -10 LU below the mean loudness of abs-gated blocks.
    const meanLufs = powerToLufs(absSum / absKept.length);
    if (meanLufs === -Infinity) return -Infinity;
    const relThreshLufs = meanLufs + RELATIVE_GATE_LU;

    // Stage 2 — relative gate.
    let relSum = 0;
    let relCount = 0;
    for (const power of absKept) {
      if (powerToLufs(power) > relThreshLufs) {
        relSum += power;
        relCount++;
      }
    }
    if (relCount === 0) return -Infinity;
    return powerToLufs(relSum / relCount);
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
    this.ring.fill(0);
    this.ringFill = 0;
    this.ringHead = 0;
    this.runningSum = 0;
    this.shortTermSum = 0;
    this.gateHopSum = 0;
    this.gateHopCount = 0;
    this.gateHopRing.fill(0);
    this.gateHopHead = 0;
    this.gateHopsSeen = 0;
    this.gateWindowSum = 0;
    this.gateBlockPowers.length = 0;
  }
}
