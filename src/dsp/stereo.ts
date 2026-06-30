/**
 * Stereo correlation / phase metrics. Pure & stateless over equal-length
 * channel buffers. All functions assume left.length === right.length.
 */
import type { StereoBlock } from "./types";
import type { StereoMetrics } from "../audio/analysis/metrics";
import { clamp } from "./util";

/**
 * Energy epsilon below which a channel/denominator is treated as silent.
 * ~ -200 dBFS in power terms; well under any meaningful signal yet far enough
 * above float noise to avoid dividing by a vanishing denominator.
 */
const ENERGY_EPS = 1e-20;

/**
 * Pearson correlation coefficient of two equal-length channels, in [-1, 1].
 * Computed as zero-mean cross-correlation normalized by the product of the
 * (zero-mean) RMS energies. If either channel has ~zero energy (denominator
 * at/below ENERGY_EPS), returns 0 — undefined correlation is reported as
 * "no phase relationship" rather than NaN.
 */
export function correlation(left: Float32Array, right: Float32Array): number {
  const n = left.length;
  if (n === 0) return 0;

  let sumL = 0;
  let sumR = 0;
  for (let i = 0; i < n; i++) {
    sumL += left[i];
    sumR += right[i];
  }
  const meanL = sumL / n;
  const meanR = sumR / n;

  let cross = 0; // sum of (l-meanL)*(r-meanR)
  let varL = 0; // sum of (l-meanL)^2
  let varR = 0; // sum of (r-meanR)^2
  for (let i = 0; i < n; i++) {
    const dl = left[i] - meanL;
    const dr = right[i] - meanR;
    cross += dl * dr;
    varL += dl * dl;
    varR += dr * dr;
  }

  const denom = Math.sqrt(varL * varR);
  if (!(denom > ENERGY_EPS)) return 0;

  return clamp(cross / denom, -1, 1);
}

/**
 * Energy balance in [-1, 1]: (rmsR - rmsL) / (rmsR + rmsL).
 * -1 => all energy in L, +1 => all energy in R, 0 => equal. Both silent => 0.
 */
export function balance(left: Float32Array, right: Float32Array): number {
  const n = left.length;
  if (n === 0) return 0;

  let sqL = 0;
  let sqR = 0;
  for (let i = 0; i < n; i++) {
    sqL += left[i] * left[i];
    sqR += right[i] * right[i];
  }
  const rmsL = Math.sqrt(sqL / n);
  const rmsR = Math.sqrt(sqR / n);

  const sum = rmsR + rmsL;
  if (!(sum > ENERGY_EPS)) return 0;

  return clamp((rmsR - rmsL) / sum, -1, 1);
}

/**
 * Stereo metrics for one block. Mono convention: when block.right === null the
 * single channel is perfectly correlated with itself and centered, so we report
 * { correlation: 1, balance: 0 } without inspecting samples.
 */
export function stereoMetrics(block: StereoBlock): StereoMetrics {
  if (block.right === null) return { correlation: 1, balance: 0 };
  return {
    correlation: correlation(block.left, block.right),
    balance: balance(block.left, block.right),
  };
}
