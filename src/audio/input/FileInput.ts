import { BaseInput } from "./BaseInput";
import type { AudioInputKind } from "./AudioInputSource";

/**
 * An imported audio file used as an input source. Unlike stream-backed inputs
 * there is no MediaStream and no track 'ended' to watch: bytes are read once in
 * start(), then connect() must decodeAudioData (async — hence the Promise-returning
 * connect the interface allows) before it can build a looping AudioBufferSourceNode.
 *
 * We keep the raw bytes (not a decoded buffer) until connect() because decoding
 * needs an AudioContext, which only arrives at connect() time.
 */
export class FileInput extends BaseInput {
  readonly kind: AudioInputKind = "audio-file";

  private readonly file: Blob | ArrayBuffer;
  private bytes: ArrayBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;

  constructor(file: Blob | ArrayBuffer) {
    super();
    this.file = file;
  }

  /**
   * Read the file into an ArrayBuffer and go live. There is no external device to
   * acquire, so "live" here means "bytes are in hand, ready to decode on connect".
   * A read failure (e.g. Blob.arrayBuffer() rejecting) lands us in "error".
   */
  async start(): Promise<void> {
    const gen = this.beginRequest();
    try {
      const bytes =
        this.file instanceof ArrayBuffer
          ? this.file
          : await this.file.arrayBuffer();
      // A teardown/stop during the read bumps generation; discard the stale result.
      if (gen !== this.generation) return;
      this.bytes = bytes;
      this.setState("live");
    } catch (err) {
      if (gen !== this.generation) return;
      this.setState("error", this.toError(err));
    }
  }

  /**
   * Decode the bytes and build a looping buffer source. We hand decodeAudioData a
   * slice() copy because real implementations detach (neuter) the passed buffer,
   * which would corrupt a later reconnect. A decode failure is thrown so the
   * engine/hook can surface it — we do not swallow it into "error" state here.
   */
  async connect(ctx: AudioContext): Promise<AudioNode> {
    if (!this.bytes) {
      throw new Error("connect() requires bytes — call start() first.");
    }
    const buffer = await ctx.decodeAudioData(this.bytes.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();
    this.bufferSource = source;
    return source;
  }

  /**
   * Stop and disconnect the buffer source on top of the base teardown. Idempotent:
   * the null check guards repeated dispose()/stop() calls (BaseInput.stop already
   * no-ops once "ended", but dispose() can run teardown again).
   */
  protected teardown(): void {
    if (this.bufferSource) {
      this.bufferSource.stop();
      this.bufferSource.disconnect();
      this.bufferSource = null;
    }
    super.teardown();
  }
}
