export type AudioInputKind =
  | "tab-capture"
  | "microphone"
  | "media-stream"
  | "audio-file"
  | "generator";
export type AudioInputState = "idle" | "requesting" | "live" | "muted" | "ended" | "error";
export interface AudioInputSource {
  readonly kind: AudioInputKind;
  readonly state: AudioInputState;
  readonly stream: MediaStream | null;
  readonly error: Error | null;
  // Returns the source node feeding the graph. May be async (e.g. an audio file
  // that must decodeAudioData before it can build a buffer source).
  connect(ctx: AudioContext): AudioNode | Promise<AudioNode>;
  stop(): void;                            // stop tracks; object remains, state -> "ended"
  dispose(): void;                         // full teardown; detach listeners
  subscribe(listener: (s: AudioInputSource) => void): () => void; // returns unsubscribe
}
