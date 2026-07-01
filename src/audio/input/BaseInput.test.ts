import { describe, expect, it, vi } from "vitest";
import { BaseInput } from "./BaseInput";
import type { AudioInputKind } from "./AudioInputSource";

// jsdom has no MediaStream / Web Audio; fabricate the minimum surface
// (mirrors the fakes in MicrophoneInput.test.ts).

interface FakeTrack {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEnded: () => void;
}

function makeTrack(kind: string): FakeTrack {
  const handlers: Record<string, (() => void) | null> = {
    ended: null,
    mute: null,
    unmute: null,
  };
  return {
    kind,
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (type in handlers) handlers[type] = cb;
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      if (type in handlers && handlers[type] === cb) handlers[type] = null;
    }),
    dispatchEnded: () => handlers.ended?.(),
  };
}

function makeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}

function makeContext() {
  const sourceNodes: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] =
    [];
  const createMediaStreamSource = vi.fn(() => {
    const node = { connect: vi.fn(), disconnect: vi.fn() };
    sourceNodes.push(node);
    return node;
  });
  const ctx = { createMediaStreamSource } as unknown as AudioContext;
  return { ctx, createMediaStreamSource, sourceNodes };
}

/** Minimal concrete subclass exposing wireStream for direct testing. */
class TestInput extends BaseInput {
  readonly kind: AudioInputKind = "media-stream";
  async start(): Promise<void> {
    /* not exercised — tests drive wire() directly */
  }
  wire(stream: MediaStream, track: FakeTrack): void {
    this.wireStream(stream, track as unknown as MediaStreamTrack);
    this.setState("live");
  }
}

describe("BaseInput.wireStream rewire", () => {
  it("a second wire stops the old stream's tracks and detaches its listeners", () => {
    const t1 = makeTrack("audio");
    const t2 = makeTrack("audio");
    const input = new TestInput();

    input.wire(makeStream([t1]), t1);
    input.wire(makeStream([t2]), t2);

    // Old stream fully released: tracks stopped, all listeners removed.
    expect(t1.stop).toHaveBeenCalledTimes(1);
    expect(t1.removeEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
    expect(t1.removeEventListener).toHaveBeenCalledWith("mute", expect.any(Function));
    expect(t1.removeEventListener).toHaveBeenCalledWith("unmute", expect.any(Function));
    // A late 'ended' from the replaced track must not tear the input down.
    t1.dispatchEnded();
    expect(input.state).toBe("live");
    // The new track is untouched.
    expect(t2.stop).not.toHaveBeenCalled();
  });

  it("a second wire drops the cached source node so connect() wraps the new stream", () => {
    const t1 = makeTrack("audio");
    const s1 = makeStream([t1]);
    const t2 = makeTrack("audio");
    const s2 = makeStream([t2]);
    const { ctx, createMediaStreamSource, sourceNodes } = makeContext();
    const input = new TestInput();

    input.wire(s1, t1);
    const first = input.connect(ctx); // caches a node wrapping s1
    expect(createMediaStreamSource).toHaveBeenLastCalledWith(s1);

    input.wire(s2, t2);

    // The stale cached node (wrapping the old stream) was disconnected...
    expect(sourceNodes[0].disconnect).toHaveBeenCalled();
    // ...and connect() now builds a fresh node from the NEW stream.
    const second = input.connect(ctx);
    expect(second).not.toBe(first);
    expect(createMediaStreamSource).toHaveBeenLastCalledWith(s2);
    expect(createMediaStreamSource).toHaveBeenCalledTimes(2);
  });
});
