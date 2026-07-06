import type { MbusClient, Subscription } from "../../transport/mbus";
import type {
  AudioInputKind,
  AudioInputSource,
  AudioInputState,
} from "./AudioInputSource";

type Listener = (source: AudioInputSource) => void;

/**
 * mbus input: another instrument tab's live output, received over the local
 * mpump link-bridge (WebRTC, peer-to-peer — see src/transport/mbus). Unlike
 * the capture inputs there is no MediaStream and no permission prompt, so this
 * implements AudioInputSource directly rather than extending BaseInput:
 * connect() returns the subscription's stable GainNode (remote audio is wired
 * into it once the peer connection goes live, silent until then). The shared
 * MbusClient is owned by the caller (useScope) and outlives any one input;
 * this class only opens/closes its own subscription.
 */
export class MbusInput implements AudioInputSource {
  readonly kind: AudioInputKind = "mbus";
  /** No MediaStream is involved; audio arrives as a Web Audio node. */
  readonly stream: MediaStream | null = null;

  private _state: AudioInputState = "idle";
  private _error: Error | null = null;

  private sub: Subscription | null = null;
  private unsubSubState: (() => void) | null = null;
  private unsubSources: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly client: MbusClient,
    readonly sourceId: string,
  ) {}

  get state(): AudioInputState {
    return this._state;
  }

  get error(): Error | null {
    return this._error;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: AudioInputState, error: Error | null = null): void {
    this._state = state;
    this._error = error;
    for (const listener of this.listeners) listener(this);
  }

  /**
   * No acquisition to await (subscribing is synchronous and promptless); async
   * only to satisfy the attach() contract. Goes "live" immediately and starts
   * watching the bridge directory so a vanished source drops to "ended"
   * (silence) instead of holding a dead peer connection.
   */
  async start(): Promise<void> {
    this.unsubSources?.();
    this.unsubSources = this.client.onSources((sources) => {
      if (this._state !== "live") return;
      if (!sources.some((s) => s.sourceId === this.sourceId)) {
        this.teardown();
        this.setState("ended");
      }
    });
    this.setState("live");
  }

  connect(ctx: AudioContext): AudioNode {
    if (!this.sub) {
      const sub = this.client.subscribe(this.sourceId, ctx);
      this.sub = sub;
      // The publisher stopping (or the peer connection failing) surfaces as the
      // subscription's terminal states. Teardown detaches this handler BEFORE
      // closing, so an intentional stop is never mistaken for a disconnect.
      this.unsubSubState = sub.onState((s) => {
        if (s !== "failed" && s !== "closed") return;
        this.teardown();
        this.setState("ended");
      });
    }
    return this.sub.node;
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

  /** Detach watchers first, then close the subscription (its GainNode was our
   *  source node; the engine disconnects that edge). The shared client stays
   *  connected for discovery. */
  private teardown(): void {
    this.unsubSources?.();
    this.unsubSources = null;
    this.unsubSubState?.();
    this.unsubSubState = null;
    this.sub?.close();
    this.sub = null;
  }
}
