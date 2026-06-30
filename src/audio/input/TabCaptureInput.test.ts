import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabCaptureInput } from "./TabCaptureInput";

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
    getSettings: vi.fn(() => ({})),
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

let getDisplayMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getDisplayMedia = vi.fn();
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TabCaptureInput", () => {
  it("has kind tab-capture and starts idle", () => {
    const tab = new TabCaptureInput();
    expect(tab.kind).toBe("tab-capture");
    expect(tab.state).toBe("idle");
  });

  it("granted with audio: live, video track stopped immediately, audio kept", async () => {
    const audio = makeTrack("audio");
    const video = makeTrack("video");
    const stream = makeStream([audio, video]);
    getDisplayMedia.mockResolvedValue(stream);
    const tab = new TabCaptureInput();
    const seen: string[] = [];
    tab.subscribe((s) => seen.push(s.state));
    await tab.start();
    expect(tab.state).toBe("live");
    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(seen).toContain("requesting");
    expect(seen).toContain("live");
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  });

  it("no audio track: state error with helpful message and stream stopped", async () => {
    const video = makeTrack("video");
    const stream = makeStream([video]);
    getDisplayMedia.mockResolvedValue(stream);
    const tab = new TabCaptureInput();
    await tab.start();
    expect(tab.state).toBe("error");
    expect(tab.error).toBeInstanceOf(Error);
    expect(tab.error?.message).toMatch(/tab audio/i);
    // full stream stopped (no orphan video capture)
    expect(video.stop).toHaveBeenCalledTimes(1);
  });

  it("user cancels picker (AbortError): reverts to idle, not error", async () => {
    getDisplayMedia.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const tab = new TabCaptureInput();
    await tab.start();
    expect(tab.state).toBe("idle");
    expect(tab.error).toBeNull();
  });

  it("user cancels picker (NotAllowedError): reverts to idle, not error", async () => {
    getDisplayMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const tab = new TabCaptureInput();
    await tab.start();
    expect(tab.state).toBe("idle");
    expect(tab.error).toBeNull();
  });

  it("audio track 'ended' (Stop sharing) -> state ended", async () => {
    const audio = makeTrack("audio");
    const video = makeTrack("video");
    getDisplayMedia.mockResolvedValue(makeStream([audio, video]));
    const tab = new TabCaptureInput();
    await tab.start();
    const seen: string[] = [];
    tab.subscribe((s) => seen.push(s.state));
    audio.dispatchEnded();
    expect(tab.state).toBe("ended");
    expect(seen).toContain("ended");
  });

  it("connect() returns the created MediaStreamSource node", async () => {
    const audio = makeTrack("audio");
    getDisplayMedia.mockResolvedValue(makeStream([audio, makeTrack("video")]));
    const tab = new TabCaptureInput();
    await tab.start();
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const createMediaStreamSource = vi.fn(() => sourceNode);
    const ctx = { createMediaStreamSource } as unknown as AudioContext;
    const node = tab.connect(ctx);
    expect(node).toBe(sourceNode);
    expect(createMediaStreamSource).toHaveBeenCalledTimes(1);
  });

  it("stop() stops audio track and sets state ended", async () => {
    const audio = makeTrack("audio");
    getDisplayMedia.mockResolvedValue(makeStream([audio, makeTrack("video")]));
    const tab = new TabCaptureInput();
    await tab.start();
    tab.stop();
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(tab.state).toBe("ended");
  });
});
