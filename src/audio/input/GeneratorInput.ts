import type { AudioInputKind } from "./AudioInputSource";
import { BaseInput } from "./BaseInput";

export type GeneratorType = "sine" | "white" | "pink";

export interface GeneratorOptions {
  type: GeneratorType;
  /** Only meaningful for "sine". Defaults to 1000 Hz. */
  frequency?: number;
}

// Output amplitude for every generator: well below clip so the reference signal
// is comfortable to monitor and leaves headroom in the graph.
const AMPLITUDE = 0.25;
// Audible-band bounds for the sine frequency, matching the UI's input min/max.
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const DEFAULT_FREQUENCY = 1000;
// One-second noise loop is long enough that the loop seam is inaudible while
// keeping the generated buffer small.
const NOISE_SECONDS = 1;

/**
 * Synthetic reference-signal source: a sine tone or white/pink noise generated
 * entirely inside the AudioContext. Needs no permission and produces no
 * MediaStream — `stream` stays null and we build/own the source node ourselves
 * (oscillator or looping buffer source) rather than going through
 * BaseInput.connect()'s MediaStreamSource path.
 */
export class GeneratorInput extends BaseInput {
  readonly kind: AudioInputKind = "generator";

  private readonly type: GeneratorType;
  private readonly frequency: number;

  // The node returned to the graph (cached so connect() is idempotent) and the
  // started source node we must stop on teardown. For a sine these differ (the
  // gain is returned, the oscillator is the source); for noise they're the same.
  private outNode: AudioNode | null = null;
  private genSource: OscillatorNode | AudioBufferSourceNode | null = null;
  private sourceStopped = false;

  constructor(opts: GeneratorOptions) {
    super();
    this.type = opts.type;
    // Sanitize before this ever reaches osc.frequency.value: a non-finite value
    // (e.g. an empty number field yields NaN via valueAsNumber) throws when
    // assigned to an AudioParam, and out-of-range values are meaningless for a
    // reference tone. Fall back to the default for non-finite, else clamp.
    const f = opts.frequency;
    this.frequency = Number.isFinite(f)
      ? Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, f as number))
      : DEFAULT_FREQUENCY;
  }

  /** No device/permission to acquire — go straight idle -> live. */
  async start(): Promise<void> {
    this.setState("live");
  }

  /** Build, start, and return the source node. Cached after the first call. */
  connect(ctx: AudioContext): AudioNode {
    if (this.outNode) return this.outNode;

    // Building a fresh source node: clear the stopped flag so the NEXT
    // teardown stops it (the guard is per-node, not per-instance).
    this.sourceStopped = false;
    if (this.type === "sine") {
      this.outNode = this.buildSine(ctx);
    } else {
      this.outNode = this.buildNoise(ctx, this.type);
    }
    return this.outNode;
  }

  private buildSine(ctx: AudioContext): AudioNode {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = this.frequency;
    // Attenuate so the full-scale oscillator sits below clip.
    const gain = ctx.createGain();
    gain.gain.value = AMPLITUDE;
    osc.connect(gain);
    osc.start();
    this.genSource = osc;
    return gain;
  }

  private buildNoise(ctx: AudioContext, type: "white" | "pink"): AudioNode {
    const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (type === "white") {
      fillWhite(data);
    } else {
      fillPink(data);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    this.genSource = src;
    return src;
  }

  /**
   * Stop the generated source before the base class disconnects it. The base
   * teardown nulls a (here unused) MediaStream source node and stops tracks; we
   * additionally stop()+disconnect() our oscillator/buffer source, guarded so
   * stop() is never called twice on a node (it throws if already stopped).
   */
  protected teardown(): void {
    if (this.genSource && !this.sourceStopped) {
      this.sourceStopped = true;
      this.genSource.stop();
      this.genSource.disconnect();
    }
    this.outNode?.disconnect();
    this.outNode = null;
    this.genSource = null;
    super.teardown();
  }
}

/** Uniform white noise scaled to ±AMPLITUDE. */
function fillWhite(data: Float32Array): void {
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * AMPLITUDE;
  }
}

/**
 * Pink noise via a one-pole low-pass "pinking" approximation of white noise.
 * This is the cheap leaky-integrator approximation (not full Voss-McCartney):
 * a single-pole filter `y = a*y + (1-a)*x` rolls off the spectrum toward the
 * low end, which is a coarse stand-in for true -3 dB/octave pink. It is more
 * than adequate as a reference/test signal; swap in Voss-McCartney if a precise
 * pink slope is ever required. Output is renormalized to ±AMPLITUDE.
 */
function fillPink(data: Float32Array): void {
  const a = 0.97; // pole position: closer to 1 = stronger low-frequency tilt.
  let y = 0;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const x = Math.random() * 2 - 1;
    y = a * y + (1 - a) * x;
    data[i] = y;
    const m = Math.abs(y);
    if (m > peak) peak = m;
  }
  // Renormalize the filtered (and thus quieter) signal back to AMPLITUDE.
  const scale = peak > 0 ? AMPLITUDE / peak : 0;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}
