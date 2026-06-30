/**
 * Meters AudioWorkletProcessor — a deliberately thin shell around `MetersCore`.
 *
 * NOT unit-tested headless: `AudioWorkletProcessor` / `registerProcessor` /
 * `AudioWorkletGlobalScope` exist only inside the real audio rendering thread,
 * which jsdom does not provide. ALL integration logic lives in `MetersCore`
 * (`meters-core.ts`), which IS unit-tested; this file only:
 *   - owns a MetersCore at the worklet's native `sampleRate`,
 *   - forwards every render quantum's channels into `pushQuantum`,
 *   - posts an assembled `AnalysisFrame` to the main thread on the frame cadence,
 *   - resets the core on a `{ type: 'reset' }` message.
 *
 * Registered name: 'mscope-meters'.
 */

import { MetersCore } from "./meters-core";

/*
 * Minimal ambient declarations for the AudioWorkletGlobalScope. These symbols
 * (`AudioWorkletProcessor`, `registerProcessor`, the global `sampleRate`) exist
 * only on the audio render thread and are NOT in lib.dom.d.ts; @types/audioworklet
 * is not a project dependency (and we add none). Declaring them here keeps this
 * file self-contained and typechecked without touching tsconfig or package.json.
 * The runtime provides the real implementations inside the worklet.
 */
declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor,
): void;

/** How often (ms) to post a frame to the main thread. ~15 Hz. */
const FRAME_INTERVAL_MS = 64;

/** Message protocol from the main thread to this processor. */
interface ResetMessage {
  type: "reset";
}
type InboundMessage = ResetMessage;

class MetersProcessor extends AudioWorkletProcessor {
  private readonly core: MetersCore;
  /** Samples accumulated since the last frame post (frame cadence counter). */
  private sinceLastFrame = 0;
  private readonly frameIntervalSamples: number;

  constructor() {
    super();
    // `sampleRate` is a global in AudioWorkletGlobalScope.
    this.core = new MetersCore(sampleRate);
    this.frameIntervalSamples = Math.max(
      1,
      Math.round((FRAME_INTERVAL_MS / 1000) * sampleRate),
    );

    this.port.onmessage = (event: MessageEvent<InboundMessage>): void => {
      if (event.data?.type === "reset") {
        this.core.reset();
        this.sinceLastFrame = 0;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      this.core.pushQuantum(input);
      this.sinceLastFrame += input[0].length;
      if (this.sinceLastFrame >= this.frameIntervalSamples) {
        this.port.postMessage(this.core.buildFrame());
        this.sinceLastFrame = 0;
      }
    }
    // Keep the processor alive even with no upstream connection.
    return true;
  }
}

registerProcessor("mscope-meters", MetersProcessor);
