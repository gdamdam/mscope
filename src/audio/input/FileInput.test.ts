import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileInput } from "./FileInput";
import type { AudioInputState } from "./AudioInputSource";

// --- Fakes ---------------------------------------------------------------

/** A fake Blob exposing only the arrayBuffer() we use. */
function fakeBlob(
  bytes: ArrayBuffer,
  arrayBuffer?: () => Promise<ArrayBuffer>,
): Blob {
  return {
    arrayBuffer: arrayBuffer ?? (() => Promise.resolve(bytes)),
  } as unknown as Blob;
}

interface FakeBufferSource {
  buffer: AudioBuffer | null;
  loop: boolean;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function makeFakeBufferSource(): FakeBufferSource {
  return {
    buffer: null,
    loop: false,
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function fakeContext(opts: {
  decoded?: AudioBuffer;
  decodeRejects?: unknown;
  source?: FakeBufferSource;
  /** Custom decode implementation (e.g. a deferred promise for race tests). */
  decode?: () => Promise<AudioBuffer>;
}): {
  ctx: AudioContext;
  source: FakeBufferSource;
  decodeAudioData: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
} {
  const source = opts.source ?? makeFakeBufferSource();
  const decodeAudioData = vi.fn((_bytes: ArrayBuffer) =>
    opts.decode
      ? opts.decode()
      : opts.decodeRejects !== undefined
        ? Promise.reject(opts.decodeRejects)
        : Promise.resolve(opts.decoded ?? ({} as AudioBuffer)),
  );
  const createBufferSource = vi.fn(() => source);
  const ctx = {
    decodeAudioData,
    createBufferSource,
  } as unknown as AudioContext;
  return { ctx, source, decodeAudioData, createBufferSource };
}

/** A promise with externally-controlled settlement, for deterministic races. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// --- Tests ---------------------------------------------------------------

describe("FileInput", () => {
  let bytes: ArrayBuffer;

  beforeEach(() => {
    bytes = new ArrayBuffer(8);
  });

  it("has kind 'audio-file' and starts idle", () => {
    const input = new FileInput(bytes);
    expect(input.kind).toBe("audio-file");
    expect(input.state).toBe("idle");
    expect(input.error).toBeNull();
  });

  it("start(ArrayBuffer) goes idle -> requesting -> live", async () => {
    const input = new FileInput(bytes);
    const seen: AudioInputState[] = [];
    input.subscribe((s) => seen.push(s.state));

    await input.start();

    expect(input.state).toBe("live");
    expect(seen).toContain("requesting");
    expect(seen[seen.length - 1]).toBe("live");
  });

  it("start(Blob) reads bytes via arrayBuffer() and goes live", async () => {
    const arrayBuffer = vi.fn(() => Promise.resolve(bytes));
    const input = new FileInput(fakeBlob(bytes, arrayBuffer));

    await input.start();

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(input.state).toBe("live");
  });

  it("start() failure sets state 'error' and records the error", async () => {
    const boom = new Error("read failed");
    const input = new FileInput(fakeBlob(bytes, () => Promise.reject(boom)));

    await input.start();

    expect(input.state).toBe("error");
    expect(input.error).toBe(boom);
  });

  it("connect() resolves a started, looping buffer source with the decoded buffer", async () => {
    const decoded = { sampleRate: 44100 } as unknown as AudioBuffer;
    const { ctx, source } = fakeContext({ decoded });
    const input = new FileInput(bytes);
    await input.start();

    const node = await input.connect(ctx);

    expect(node).toBe(source as unknown as AudioNode);
    expect(source.buffer).toBe(decoded);
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it("connect() passes a copy of the bytes to decodeAudioData (slice)", async () => {
    const { ctx, decodeAudioData } = fakeContext({});
    const input = new FileInput(bytes);
    await input.start();

    await input.connect(ctx);

    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    const passed = decodeAudioData.mock.calls[0][0] as ArrayBuffer;
    // A slice yields a distinct ArrayBuffer of the same byteLength.
    expect(passed).not.toBe(bytes);
    expect(passed.byteLength).toBe(bytes.byteLength);
  });

  it("connect() rejects when decodeAudioData rejects", async () => {
    const boom = new Error("bad audio");
    const { ctx } = fakeContext({ decodeRejects: boom });
    const input = new FileInput(bytes);
    await input.start();

    await expect(input.connect(ctx)).rejects.toBe(boom);
  });

  it("stop() stops + disconnects the source and sets state 'ended'", async () => {
    const { ctx, source } = fakeContext({});
    const input = new FileInput(bytes);
    await input.start();
    await input.connect(ctx);

    input.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(input.state).toBe("ended");
  });

  it("dispose() is idempotent and tears down the source", async () => {
    const { ctx, source } = fakeContext({});
    const input = new FileInput(bytes);
    await input.start();
    await input.connect(ctx);

    input.dispose();
    input.dispose();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });

  it("stop() during decode: connect() rejects and never starts a looping source", async () => {
    const d = deferred<AudioBuffer>();
    const { ctx, source, createBufferSource } = fakeContext({
      decode: () => d.promise,
    });
    const input = new FileInput(bytes);
    await input.start();

    const pending = input.connect(ctx);
    input.stop(); // user stops while decodeAudioData is in flight
    d.resolve({} as AudioBuffer);

    await expect(pending).rejects.toThrow();
    // A started looping AudioBufferSourceNode could never be stopped (stop()
    // no-ops once "ended") and is pinned against GC — it must not exist.
    expect(createBufferSource).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
    expect(input.state).toBe("ended");
  });

  it("dispose() during decode: no started looping node survives", async () => {
    const d = deferred<AudioBuffer>();
    const { ctx, source, createBufferSource } = fakeContext({
      decode: () => d.promise,
    });
    const input = new FileInput(bytes);
    await input.start();

    const pending = input.connect(ctx);
    input.dispose();
    d.resolve({} as AudioBuffer);

    await expect(pending).rejects.toThrow();
    expect(createBufferSource).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
  });

  it("a legitimate reconnect after a superseded decode still works", async () => {
    const d = deferred<AudioBuffer>();
    const stale = fakeContext({ decode: () => d.promise });
    const input = new FileInput(bytes);
    await input.start();

    const pending = input.connect(stale.ctx);
    input.stop();
    d.resolve({} as AudioBuffer);
    await expect(pending).rejects.toThrow();

    // Restart + reconnect: decode/build must proceed normally this time.
    await input.start();
    const fresh = fakeContext({});
    const node = await input.connect(fresh.ctx);
    expect(node).toBe(fresh.source as unknown as AudioNode);
    expect(fresh.source.start).toHaveBeenCalledTimes(1);
    expect(input.state).toBe("live");
  });

  it("stop() before connect() is safe and sets state 'ended'", async () => {
    const input = new FileInput(bytes);
    await input.start();

    expect(() => input.stop()).not.toThrow();
    expect(input.state).toBe("ended");
  });
});
