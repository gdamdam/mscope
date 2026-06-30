import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScopeEngine } from "./engine";
import type { AnalysisFrame } from "./engineTypes";
import type {
  AudioInputSource,
  AudioInputKind,
  AudioInputState,
} from "./input/AudioInputSource";

/*
 * jsdom has no Web Audio. We hand-roll the minimum surface the engine + the
 * (imported) ScopeAnalyser touch, spying on connect/disconnect so we can assert
 * the fan-out graph is wired and torn down correctly.
 */

class FakeAudioParam {
  value = 1;
}

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  frequencyBinCount = 1024;
  getFloatTimeDomainData = vi.fn((arr: Float32Array) => arr.fill(0.25));
  getFloatFrequencyData = vi.fn((arr: Float32Array) => arr.fill(-60));
}

class FakeSplitterNode extends FakeAudioNode {}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakePort {
  onmessage: ((ev: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  /** Simulate the worklet posting a frame back to the main thread. */
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

class FakeAudioWorkletNode extends FakeAudioNode {
  static instances: FakeAudioWorkletNode[] = [];
  port = new FakePort();
  constructor(_ctx: unknown, _name: string) {
    super();
    FakeAudioWorkletNode.instances.push(this);
  }
}

class FakeSourceNode extends FakeAudioNode {}

class FakeAudioWorklet {
  addModule = vi.fn(() => Promise.resolve());
}

class FakeAudioContext {
  destination = new FakeAudioNode();
  audioWorklet = new FakeAudioWorklet();
  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  createChannelSplitter = vi.fn(() => new FakeSplitterNode());
  createAnalyser = vi.fn(() => new FakeAnalyserNode());
  createGain = vi.fn(() => new FakeGainNode());
}

/** A controllable fake AudioInputSource. */
function makeFakeSource(): {
  source: AudioInputSource;
  node: FakeSourceNode;
  connect: ReturnType<typeof vi.fn>;
} {
  const node = new FakeSourceNode();
  const connect = vi.fn(() => node as unknown as AudioNode);
  const source: AudioInputSource = {
    kind: "media-stream" as AudioInputKind,
    state: "live" as AudioInputState,
    stream: null,
    error: null,
    connect,
    stop: vi.fn(),
    dispose: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
  return { source, node, connect };
}

let lastContext: FakeAudioContext;

beforeEach(() => {
  lastContext = new FakeAudioContext();
  FakeAudioWorkletNode.instances = [];
  vi.stubGlobal(
    "AudioContext",
    vi.fn(() => lastContext),
  );
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createScopeEngine", () => {
  it("starts in the idle state with monitor muted", () => {
    const engine = createScopeEngine();
    expect(engine.state).toBe("idle");
    // No source yet: monitor gain reads 0 (muted) before branches exist.
    expect(engine.getMonitorGain()).toBe(0);
  });

  it("setSource fans the source out to analyser, worklet and monitor; monitor stays muted", async () => {
    const engine = createScopeEngine();
    const { source, node, connect } = makeFakeSource();

    await engine.setSource(source);

    expect(engine.state).toBe("running");
    expect(connect).toHaveBeenCalledOnce();
    // The source node connects to three downstreams: analyser splitter,
    // meters worklet node, and the monitor gain node.
    expect(node.connect).toHaveBeenCalledTimes(3);
    // Monitor starts muted.
    expect(engine.getMonitorGain()).toBe(0);
    // Worklet module was registered (idempotent addModule).
    expect(lastContext.audioWorklet.addModule).toHaveBeenCalledOnce();
    // Context resumed.
    expect(lastContext.resume).toHaveBeenCalled();
  });

  it("relays a simulated worklet frame to onFrame subscribers", async () => {
    const engine = createScopeEngine();
    const { source } = makeFakeSource();
    await engine.setSource(source);

    const received: AnalysisFrame[] = [];
    const unsub = engine.onFrame((f) => received.push(f));

    const frame = { metrics: { timeMs: 42 }, loudness: {} } as unknown as AnalysisFrame;
    // Reach into the fake worklet node's port and emit a message.
    const worklet = lastWorkletNode();
    worklet.port.emit(frame);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(frame);

    // Unsubscribe stops further delivery.
    unsub();
    worklet.port.emit(frame);
    expect(received).toHaveLength(1);
  });

  it("reset() posts a reset message to the worklet", async () => {
    const engine = createScopeEngine();
    const { source } = makeFakeSource();
    await engine.setSource(source);

    engine.reset();
    const worklet = lastWorkletNode();
    expect(worklet.port.postMessage).toHaveBeenCalledWith({ type: "reset" });
  });

  it("a second setSource tears down the prior source's branches", async () => {
    const engine = createScopeEngine();
    const first = makeFakeSource();
    await engine.setSource(first.source);

    const second = makeFakeSource();
    await engine.setSource(second.source);

    // Prior source node was disconnected (all outgoing edges removed).
    expect(first.node.disconnect).toHaveBeenCalled();
    // New source fanned out to the three branches.
    expect(second.node.connect).toHaveBeenCalledTimes(3);
    // Branch nodes are reused, so the worklet was created once.
    expect(workletNodeCount()).toBe(1);
  });

  it("setMonitorGain delegates to the monitor (clamped)", async () => {
    const engine = createScopeEngine();
    const { source } = makeFakeSource();
    await engine.setSource(source);

    engine.setMonitorGain(0.5);
    expect(engine.getMonitorGain()).toBe(0.5);
    engine.setMonitorGain(5);
    expect(engine.getMonitorGain()).toBe(1);
  });

  it("getWaveform/getSpectrum delegate to the analyser", async () => {
    const engine = createScopeEngine();
    const { source } = makeFakeSource();
    await engine.setSource(source);

    const wave = engine.getWaveform(0);
    const spec = engine.getSpectrum(1);
    expect(wave.length).toBeGreaterThan(0);
    expect(wave[0]).toBe(0.25);
    expect(spec[0]).toBe(-60);
  });

  it("suspend/resume update state", async () => {
    const engine = createScopeEngine();
    const { source } = makeFakeSource();
    await engine.setSource(source);

    await engine.suspend();
    expect(engine.state).toBe("suspended");
    expect(lastContext.suspend).toHaveBeenCalled();

    await engine.resume();
    expect(engine.state).toBe("running");
  });

  it("dispose closes the context and is idempotent", async () => {
    const engine = createScopeEngine();
    const { source } = makeFakeSource();
    await engine.setSource(source);

    engine.dispose();
    expect(engine.state).toBe("closed");
    expect(lastContext.close).toHaveBeenCalledOnce();

    // Idempotent: second dispose does not throw or re-close.
    engine.dispose();
    expect(lastContext.close).toHaveBeenCalledOnce();
  });
});

/* ---- helpers to reach the constructed fake worklet nodes ---- */

function lastWorkletNode(): FakeAudioWorkletNode {
  const all = FakeAudioWorkletNode.instances;
  return all[all.length - 1];
}

function workletNodeCount(): number {
  return FakeAudioWorkletNode.instances.length;
}
