import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicrophoneInput } from "./MicrophoneInput";

// jsdom provides neither Web Audio nor mediaDevices, so we fabricate both.

interface FakeTrack {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  dispatchEnded: () => void;
}

function makeTrack(kind: string): FakeTrack {
  let endedHandler: (() => void) | null = null;
  return {
    kind,
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, cb: () => void) => {
      if (type === "ended") endedHandler = cb;
    }),
    removeEventListener: vi.fn((type: string, cb: () => void) => {
      if (type === "ended" && endedHandler === cb) endedHandler = null;
    }),
    getSettings: vi.fn(() => ({ channelCount: 2 })),
    dispatchEnded: () => endedHandler?.(),
  };
}

function makeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  } as unknown as MediaStream;
}

function makeContext() {
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const createMediaStreamSource = vi.fn(() => sourceNode);
  const ctx = { createMediaStreamSource } as unknown as AudioContext;
  return { ctx, createMediaStreamSource, sourceNode };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMedia = vi.fn();
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MicrophoneInput", () => {
  it("has kind microphone and starts idle", () => {
    const mic = new MicrophoneInput();
    expect(mic.kind).toBe("microphone");
    expect(mic.state).toBe("idle");
    expect(mic.stream).toBeNull();
    expect(mic.error).toBeNull();
  });

  it("granted: goes idle -> requesting -> live and connect() returns the source node", async () => {
    const track = makeTrack("audio");
    const stream = makeStream([track]);
    let stateDuringRequest: string | null = null;
    getUserMedia.mockImplementation(() => {
      // captured synchronously when start() awaits
      return Promise.resolve(stream);
    });
    const mic = new MicrophoneInput();
    const seen: string[] = [];
    mic.subscribe((s) => seen.push(s.state));
    const p = mic.start();
    stateDuringRequest = mic.state;
    await p;
    expect(stateDuringRequest).toBe("requesting");
    expect(mic.state).toBe("live");
    expect(mic.stream).toBe(stream);
    expect(seen).toContain("requesting");
    expect(seen).toContain("live");
    // getUserMedia called with our exact constraints
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
      },
    });

    const { ctx, createMediaStreamSource, sourceNode } = makeContext();
    const node = mic.connect(ctx);
    expect(createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(node).toBe(sourceNode);
    // cached
    expect(mic.connect(ctx)).toBe(sourceNode);
    expect(createMediaStreamSource).toHaveBeenCalledTimes(1);
  });

  it("denied (NotAllowedError): state error, error set, listeners notified", async () => {
    const err = new DOMException("denied", "NotAllowedError");
    getUserMedia.mockRejectedValue(err);
    const mic = new MicrophoneInput();
    const seen: string[] = [];
    mic.subscribe((s) => seen.push(s.state));
    await mic.start();
    expect(mic.state).toBe("error");
    expect(mic.error).toBe(err);
    expect(seen).toContain("error");
  });

  it("cancel (AbortError): silently reverts to idle, no error", async () => {
    const err = new DOMException("aborted", "AbortError");
    getUserMedia.mockRejectedValue(err);
    const mic = new MicrophoneInput();
    await mic.start();
    expect(mic.state).toBe("idle");
    expect(mic.error).toBeNull();
  });

  it("track 'ended' -> state ended + listeners notified", async () => {
    const track = makeTrack("audio");
    getUserMedia.mockResolvedValue(makeStream([track]));
    const mic = new MicrophoneInput();
    await mic.start();
    const seen: string[] = [];
    mic.subscribe((s) => seen.push(s.state));
    track.dispatchEnded();
    expect(mic.state).toBe("ended");
    expect(seen).toContain("ended");
  });

  it("stop() stops tracks and sets state ended", async () => {
    const track = makeTrack("audio");
    getUserMedia.mockResolvedValue(makeStream([track]));
    const mic = new MicrophoneInput();
    await mic.start();
    mic.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mic.state).toBe("ended");
    // ended handler detached BEFORE stop -> dispatch is a no-op now
    expect(track.removeEventListener).toHaveBeenCalled();
  });

  it("dispose() is idempotent, clears listeners, no double track.stop()", async () => {
    const track = makeTrack("audio");
    getUserMedia.mockResolvedValue(makeStream([track]));
    const mic = new MicrophoneInput();
    let calls = 0;
    mic.subscribe(() => {
      calls += 1;
    });
    await mic.start();
    const callsAfterStart = calls;
    mic.dispose();
    mic.dispose();
    expect(track.stop).toHaveBeenCalledTimes(1);
    // listeners cleared: a state change after dispose does not notify
    expect(calls).toBe(callsAfterStart);
  });

  it("generation guard: a superseded slow start does not go live and its stream is stopped", async () => {
    const slowTrack = makeTrack("audio");
    const slowStream = makeStream([slowTrack]);
    const fastTrack = makeTrack("audio");
    const fastStream = makeStream([fastTrack]);
    const d = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(d.promise).mockResolvedValueOnce(fastStream);

    const mic = new MicrophoneInput();
    const first = mic.start(); // pending
    // supersede with a second start that resolves immediately
    await mic.start();
    expect(mic.state).toBe("live");
    expect(mic.stream).toBe(fastStream);
    // now the first (stale) request resolves
    d.resolve(slowStream);
    await first;
    // stale stream must be stopped, active live stream untouched
    expect(slowTrack.stop).toHaveBeenCalledTimes(1);
    expect(mic.state).toBe("live");
    expect(mic.stream).toBe(fastStream);
  });

  it("subscribe returns a working unsubscribe", async () => {
    const track = makeTrack("audio");
    getUserMedia.mockResolvedValue(makeStream([track]));
    const mic = new MicrophoneInput();
    let calls = 0;
    const unsub: () => void = mic.subscribe(() => {
      calls += 1;
    });
    unsub();
    await mic.start();
    expect(calls).toBe(0);
  });
});
