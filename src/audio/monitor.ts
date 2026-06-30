/**
 * Audible monitor: a thin wrapper over a single GainNode.
 *
 * Defaults to gain 0 (MUTED) so attaching a source never doubles the audio the
 * user is already hearing (e.g. tab capture) or creates a feedback loop with a
 * microphone. The UI raises the gain explicitly when the user opts in.
 */
import { clamp } from "../dsp/util";

export class Monitor {
  private readonly gainNode: GainNode;

  constructor(ctx: AudioContext) {
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0; // muted by default
  }

  /** The GainNode to wire into the graph (source -> gain -> destination). */
  get node(): GainNode {
    return this.gainNode;
  }

  /** Set monitor gain, clamped to [0, 1]. */
  setGain(gain: number): void {
    this.gainNode.gain.value = clamp(gain, 0, 1);
  }

  getGain(): number {
    return this.gainNode.gain.value;
  }
}
