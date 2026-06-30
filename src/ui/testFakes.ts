import { vi } from "vitest";
import type {
  AnalysisFrame,
  CreateScopeEngine,
  EngineState,
  ScopeEngine,
} from "../audio/engineTypes";
import type {
  ChannelLevels,
  MetricsSnapshot,
  StereoMetrics,
} from "../audio/analysis/metrics";
import type { LoudnessSnapshot } from "../dsp/loudness";

/**
 * In-memory ScopeEngine for jsdom tests. No Web Audio: frames are pushed
 * manually via `emit()`, monitor gain is just a number, and waveform/spectrum
 * return fixed buffers. Mirrors the engineTypes facade exactly.
 */
export class FakeScopeEngine implements ScopeEngine {
  state: EngineState = "idle";
  private listeners = new Set<(f: AnalysisFrame) => void>();
  private gain = 0;
  resetCalls = 0;
  disposeCalls = 0;
  setSourceCalls = 0;

  setSource = vi.fn(async (): Promise<void> => {
    this.setSourceCalls++;
    this.state = "suspended";
  });

  setMonitorGain(gain: number): void {
    this.gain = gain;
  }
  getMonitorGain(): number {
    return this.gain;
  }

  getWaveform(): Float32Array {
    return new Float32Array(2048);
  }
  getSpectrum(): Float32Array {
    return new Float32Array(1024).fill(-120);
  }

  onFrame(listener: (f: AnalysisFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Test helper: push a frame to all subscribers. */
  emit(frame: AnalysisFrame): void {
    for (const l of this.listeners) l(frame);
  }

  async resume(): Promise<void> {
    this.state = "running";
  }
  async suspend(): Promise<void> {
    this.state = "suspended";
  }
  detachCalls = 0;
  detach(): void {
    this.detachCalls++;
    this.state = "idle";
  }
  reset(): void {
    this.resetCalls++;
  }
  dispose(): void {
    this.disposeCalls++;
    this.state = "closed";
  }
}

/** Build a fake factory plus a handle to the single engine it creates. */
export function makeFakeEngineFactory(): {
  create: CreateScopeEngine;
  engine: FakeScopeEngine;
} {
  const engine = new FakeScopeEngine();
  const create: CreateScopeEngine = () => engine;
  return { create, engine };
}

/** Build a ChannelLevels with sensible defaults. */
export function ch(p: Partial<ChannelLevels> = {}): ChannelLevels {
  return {
    peakDb: -10,
    rmsDb: -20,
    truePeakDb: -9,
    dcOffset: 0,
    clipCount: 0,
    clippedNow: false,
    ...p,
  };
}

/** Build a MetricsSnapshot from channels + overrides. */
export function snap(
  p: Partial<MetricsSnapshot> & { channels: ChannelLevels[] },
): MetricsSnapshot {
  return {
    timeMs: 0,
    sampleRate: 48000,
    channelCount: p.channels.length,
    stereo: null,
    signal: { silent: false, lowSignal: false },
    ...p,
  };
}

export function loud(p: Partial<LoudnessSnapshot> = {}): LoudnessSnapshot {
  return {
    momentaryLufs: -23,
    shortTermLufs: -22,
    integratedLufs: -24,
    ...p,
  };
}

export function frame(
  channels: ChannelLevels[],
  stereo: StereoMetrics | null = null,
  loudness: Partial<LoudnessSnapshot> = {},
): AnalysisFrame {
  return {
    metrics: snap({ channels, stereo }),
    loudness: loud(loudness),
  };
}

/**
 * Install a minimal canvas getContext stub so components that draw don't throw
 * in jsdom (which returns null for getContext by default). Returns a restore fn.
 */
export function stubCanvas(): () => void {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: unknown;
  };
  const original = proto.getContext;
  const ctx2d = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  };
  proto.getContext = vi.fn(() => ctx2d);
  return () => {
    proto.getContext = original;
  };
}
