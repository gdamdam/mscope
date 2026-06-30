export type AudioInputKind = "tab-capture" | "microphone" | "media-stream" | "audio-file";
export type AudioInputState = "idle" | "requesting" | "live" | "muted" | "ended" | "error";
export interface AudioInputSource {
  readonly kind: AudioInputKind;
  readonly state: AudioInputState;
  readonly stream: MediaStream | null;
  readonly error: Error | null;
  connect(ctx: AudioContext): AudioNode;   // returns the source node feeding the graph
  stop(): void;                            // stop tracks; object remains, state -> "ended"
  dispose(): void;                         // full teardown; detach listeners
  subscribe(listener: (s: AudioInputSource) => void): () => void; // returns unsubscribe
}
