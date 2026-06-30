import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneratorInput } from "./GeneratorInput";

// jsdom has no Web Audio. We fabricate an AudioContext whose factory methods
// return fakes that record connect()/start()/stop() and the params we care about.

function makeOscillator() {
  return {
    type: "sine" as OscillatorType,
    frequency: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeGain() {
  return {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeBufferSource() {
  return {
    buffer: null as AudioBuffer | null,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeBuffer(channels: number, length: number, sampleRate: number) {
  const data: Float32Array[] = Array.from(
    { length: channels },
    () => new Float32Array(length),
  );
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    getChannelData: vi.fn((ch: number) => data[ch]),
  };
}

function makeContext() {
  const oscillators: ReturnType<typeof makeOscillator>[] = [];
  const gains: ReturnType<typeof makeGain>[] = [];
  const bufferSources: ReturnType<typeof makeBufferSource>[] = [];
  const buffers: ReturnType<typeof makeBuffer>[] = [];

  const createOscillator = vi.fn(() => {
    const o = makeOscillator();
    oscillators.push(o);
    return o;
  });
  const createGain = vi.fn(() => {
    const g = makeGain();
    gains.push(g);
    return g;
  });
  const createBufferSource = vi.fn(() => {
    const s = makeBufferSource();
    bufferSources.push(s);
    return s;
  });
  const createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => {
    const b = makeBuffer(channels, length, sampleRate);
    buffers.push(b);
    return b;
  });

  const ctx = {
    sampleRate: 48000,
    destination: { connect: vi.fn() },
    createOscillator,
    createGain,
    createBufferSource,
    createBuffer,
  } as unknown as AudioContext;

  return {
    ctx,
    createOscillator,
    createGain,
    createBufferSource,
    createBuffer,
    oscillators,
    gains,
    bufferSources,
    buffers,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GeneratorInput", () => {
  it("has kind generator and starts idle", () => {
    const gen = new GeneratorInput({ type: "sine" });
    expect(gen.kind).toBe("generator");
    expect(gen.state).toBe("idle");
    expect(gen.stream).toBeNull();
    expect(gen.error).toBeNull();
  });

  it("start(): no permission, idle -> live, stream stays null", async () => {
    const gen = new GeneratorInput({ type: "sine" });
    const seen: string[] = [];
    gen.subscribe((s) => seen.push(s.state));
    await gen.start();
    expect(gen.state).toBe("live");
    expect(gen.stream).toBeNull();
    expect(seen).toContain("live");
  });

  it("connect('sine'): builds an oscillator at the requested frequency, started, returns a node", async () => {
    const gen = new GeneratorInput({ type: "sine", frequency: 440 });
    await gen.start();
    const c = makeContext();
    const node = gen.connect(c.ctx);

    expect(c.createOscillator).toHaveBeenCalledTimes(1);
    expect(c.oscillators[0].type).toBe("sine");
    expect(c.oscillators[0].frequency.value).toBe(440);
    expect(c.oscillators[0].start).toHaveBeenCalledTimes(1);
    // routed through a gain to stay below clip; gain node is returned
    expect(c.createGain).toHaveBeenCalledTimes(1);
    expect(c.gains[0].gain.value).toBeGreaterThan(0);
    expect(c.gains[0].gain.value).toBeLessThanOrEqual(0.5);
    expect(c.oscillators[0].connect).toHaveBeenCalledWith(c.gains[0]);
    expect(node).toBe(c.gains[0]);
  });

  it("connect('sine') defaults to 1000 Hz when no frequency given", async () => {
    const gen = new GeneratorInput({ type: "sine" });
    await gen.start();
    const c = makeContext();
    gen.connect(c.ctx);
    expect(c.oscillators[0].frequency.value).toBe(1000);
  });

  it("connect('sine') falls back to the default for a non-finite frequency (never assigns NaN to the AudioParam)", async () => {
    // valueAsNumber on an empty number field is NaN; that must not reach
    // osc.frequency.value, which throws on a non-finite assignment.
    for (const bad of [NaN, Infinity, -Infinity]) {
      const gen = new GeneratorInput({ type: "sine", frequency: bad });
      await gen.start();
      const c = makeContext();
      gen.connect(c.ctx);
      const f = c.oscillators[0].frequency.value;
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBe(1000);
    }
  });

  it("connect('sine') clamps out-of-range frequencies into the audible band", async () => {
    const low = new GeneratorInput({ type: "sine", frequency: 1 });
    await low.start();
    const cl = makeContext();
    low.connect(cl.ctx);
    expect(cl.oscillators[0].frequency.value).toBe(20);

    const high = new GeneratorInput({ type: "sine", frequency: 50000 });
    await high.start();
    const ch = makeContext();
    high.connect(ch.ctx);
    expect(ch.oscillators[0].frequency.value).toBe(20000);
  });

  it("connect('white'): starts a looping buffer source filled with noise", async () => {
    const gen = new GeneratorInput({ type: "white" });
    await gen.start();
    const c = makeContext();
    const node = gen.connect(c.ctx);

    expect(c.createBufferSource).toHaveBeenCalledTimes(1);
    expect(c.createBuffer).toHaveBeenCalledTimes(1);
    expect(c.bufferSources[0].loop).toBe(true);
    expect(c.bufferSources[0].buffer).toBe(c.buffers[0]);
    expect(c.bufferSources[0].start).toHaveBeenCalledTimes(1);
    // buffer was actually filled (non-zero somewhere, within ~0.25 amplitude)
    const data = c.buffers[0].getChannelData(0);
    const max = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(0.25 + 1e-6);
    expect(node).toBe(c.bufferSources[0]);
  });

  it("connect('pink'): starts a looping buffer source filled with noise", async () => {
    const gen = new GeneratorInput({ type: "pink" });
    await gen.start();
    const c = makeContext();
    const node = gen.connect(c.ctx);

    expect(c.createBufferSource).toHaveBeenCalledTimes(1);
    expect(c.bufferSources[0].loop).toBe(true);
    expect(c.bufferSources[0].start).toHaveBeenCalledTimes(1);
    const data = c.buffers[0].getChannelData(0);
    const max = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(max).toBeGreaterThan(0);
    expect(node).toBe(c.bufferSources[0]);
  });

  it("connect() caches the node (second call does not rebuild)", async () => {
    const gen = new GeneratorInput({ type: "sine" });
    await gen.start();
    const c = makeContext();
    const a = gen.connect(c.ctx);
    const b = gen.connect(c.ctx);
    expect(a).toBe(b);
    expect(c.createOscillator).toHaveBeenCalledTimes(1);
  });

  it("stop(): sine source stopped + disconnected, state ended", async () => {
    const gen = new GeneratorInput({ type: "sine" });
    await gen.start();
    const c = makeContext();
    gen.connect(c.ctx);
    gen.stop();
    expect(c.oscillators[0].stop).toHaveBeenCalledTimes(1);
    expect(c.oscillators[0].disconnect).toHaveBeenCalled();
    expect(gen.state).toBe("ended");
  });

  it("stop(): white buffer source stopped + disconnected, state ended", async () => {
    const gen = new GeneratorInput({ type: "white" });
    await gen.start();
    const c = makeContext();
    gen.connect(c.ctx);
    gen.stop();
    expect(c.bufferSources[0].stop).toHaveBeenCalledTimes(1);
    expect(c.bufferSources[0].disconnect).toHaveBeenCalled();
    expect(gen.state).toBe("ended");
  });

  it("stop() is idempotent (no double stop on the source node)", async () => {
    const gen = new GeneratorInput({ type: "sine" });
    await gen.start();
    const c = makeContext();
    gen.connect(c.ctx);
    gen.stop();
    gen.stop();
    expect(c.oscillators[0].stop).toHaveBeenCalledTimes(1);
    expect(gen.state).toBe("ended");
  });

  it("dispose() is idempotent and clears listeners", async () => {
    const gen = new GeneratorInput({ type: "sine" });
    let calls = 0;
    gen.subscribe(() => {
      calls += 1;
    });
    await gen.start();
    const c = makeContext();
    gen.connect(c.ctx);
    const callsAfterConnect = calls;
    gen.dispose();
    gen.dispose();
    expect(c.oscillators[0].stop).toHaveBeenCalledTimes(1);
    // listeners cleared: a later state change does not notify
    expect(calls).toBe(callsAfterConnect);
  });
});
