import type {
  AudioInputKind,
  AudioInputSource,
  AudioInputState,
} from "./AudioInputSource";

type Listener = (source: AudioInputSource) => void;

/**
 * Shared machinery for AudioInputSource implementations. Holds state/error/stream,
 * a listener set, a generation counter that guards against stale async acquisitions,
 * and the proven teardown sequence (detach 'ended' BEFORE stopping tracks, disconnect
 * the source node, stop tracks, null refs). Subclasses implement only the async
 * acquisition in start() and feed acquired streams into wireStream().
 */
export abstract class BaseInput implements AudioInputSource {
  abstract readonly kind: AudioInputKind;

  protected _state: AudioInputState = "idle";
  protected _error: Error | null = null;
  protected _stream: MediaStream | null = null;

  private readonly listeners = new Set<Listener>();
  private sourceNode: AudioNode | null = null;

  // The track whose 'ended' we watch (mic: the audio track; tab: the audio track).
  private endedTrack: MediaStreamTrack | null = null;
  private endedHandler: (() => void) | null = null;

  // Bumped on every teardown. A pending acquisition captures the generation up
  // front; if it no longer matches on resolve, the request was superseded.
  protected generation = 0;

  /**
   * Begin a new acquisition: bump the generation so any in-flight start() becomes
   * stale, enter "requesting", and return the generation this call should hold.
   * A later start()/stop() bumps generation again, so the slow resolver sees a
   * mismatch and discards its orphan stream instead of going live.
   */
  protected beginRequest(): number {
    this.generation += 1;
    this.setState("requesting");
    return this.generation;
  }

  /**
   * Normalize a thrown value to an Error, preserving object identity for anything
   * carrying a usable `.name` — notably DOMException, which is an `instanceof
   * Error` in real browsers but NOT in jsdom. We still need its `.name` to branch
   * on (AbortError/NotAllowedError), so we keep the original object and surface it.
   */
  protected toError(err: unknown): Error {
    if (err instanceof Error) return err;
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      "message" in err
    ) {
      return err as Error;
    }
    return new Error(String(err));
  }

  get state(): AudioInputState {
    return this._state;
  }

  get error(): Error | null {
    return this._error;
  }

  get stream(): MediaStream | null {
    return this._stream;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected notify(): void {
    for (const listener of this.listeners) listener(this);
  }

  protected setState(state: AudioInputState, error: Error | null = null): void {
    this._state = state;
    this._error = error;
    this.notify();
  }

  connect(ctx: AudioContext): AudioNode | Promise<AudioNode> {
    if (!this._stream) {
      throw new Error("connect() requires a live stream — call start() first.");
    }
    if (!this.sourceNode) {
      this.sourceNode = ctx.createMediaStreamSource(this._stream);
    }
    return this.sourceNode;
  }

  /**
   * Attach an acquired stream and watch a track's 'ended'. The handler fires only
   * for unexpected disconnects: teardown detaches it before any intentional stop.
   */
  protected wireStream(stream: MediaStream, endedTrack: MediaStreamTrack): void {
    this._stream = stream;
    this.endedTrack = endedTrack;
    const handler = (): void => this.handleTrackEnded();
    this.endedHandler = handler;
    endedTrack.addEventListener("ended", handler);
  }

  private handleTrackEnded(): void {
    // The device/share dropped out unexpectedly. Tear down and report "ended".
    this.teardown();
    this.setState("ended");
  }

  stop(): void {
    if (this._state === "ended") return; // idempotent
    this.teardown();
    this.setState("ended");
  }

  dispose(): void {
    this.teardown();
    this.listeners.clear();
  }

  /**
   * Idempotent teardown mirroring the proven cleanup order: bump generation to
   * invalidate any in-flight acquisition, detach the 'ended' handler BEFORE
   * stopping tracks (so an intentional stop is never mistaken for a disconnect),
   * disconnect the source node, stop every track, then null refs.
   */
  protected teardown(): void {
    this.generation += 1;
    if (this.endedTrack && this.endedHandler) {
      this.endedTrack.removeEventListener("ended", this.endedHandler);
    }
    this.endedTrack = null;
    this.endedHandler = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this._stream?.getTracks().forEach((track) => track.stop());
    this._stream = null;
  }
}
