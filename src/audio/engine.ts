/**
 * The audio spine: wires already-built, already-tested pure DSP + analysis
 * modules into a live Web Audio graph behind the `ScopeEngine` facade.
 *
 *   source -> [ ScopeAnalyser (visual waveform/spectrum) ]
 *          -> [ meters AudioWorkletNode (sample-accurate metrics) ]
 *          -> [ monitorGain -> destination (audible, MUTED by default) ]
 *
 * The analysis branches NEVER alter the signal (they are taps). The monitor is
 * a parallel branch that starts muted to avoid doubling/feedback.
 *
 * Branch nodes (analyser, worklet, monitor) are created lazily once, on the
 * first `setSource`, and reused. Re-calling `setSource` only swaps the source:
 * the prior source node is disconnected from all branches before the new one is
 * fanned out.
 */

import { AudioContextManager } from "./AudioContextManager";
import { Monitor } from "./monitor";
import { ScopeAnalyser } from "./analysis/analyser";
import type { AudioInputSource } from "./input/AudioInputSource";
import type {
  AnalyserConfig,
  AnalysisFrame,
  CreateScopeEngine,
  EngineState,
  ScopeEngine,
  ScopeEngineOptions,
} from "./engineTypes";

const METERS_WORKLET_NAME = "mscope-meters";

class ScopeEngineImpl implements ScopeEngine {
  private readonly manager = new AudioContextManager();
  private readonly opts: ScopeEngineOptions;

  // Branch nodes — created lazily on first setSource, then reused.
  private analyser: ScopeAnalyser | null = null;
  private metersNode: AudioWorkletNode | null = null;
  private monitor: Monitor | null = null;
  /** Muted GainNode -> destination. Analysis taps connect here so the render
   *  graph actually pulls them (a dead-end worklet/analyser is never processed). */
  private silentSink: GainNode | null = null;

  /** The currently-attached input source and its live source node. */
  private currentSource: AudioInputSource | null = null;
  private sourceNode: AudioNode | null = null;

  private readonly frameListeners = new Set<(frame: AnalysisFrame) => void>();
  private _state: EngineState = "idle";

  constructor(opts: ScopeEngineOptions = {}) {
    this.opts = opts;
  }

  get state(): EngineState {
    return this._state;
  }

  async setSource(source: AudioInputSource): Promise<void> {
    if (this._state === "closed") return;

    const ctx = this.manager.getContext();
    await this.manager.loadMetersWorklet();

    // Lazily build the branch nodes once; subsequent calls reuse them.
    this.ensureBranches(ctx);

    // Tear down the previous source's branches first (disconnect prior fan-out).
    this.teardownSource();

    // Build the new source node and fan it out to the three branches.
    // connect() may be async (e.g. audio-file decode).
    const node = await source.connect(ctx);
    this.currentSource = source;
    this.sourceNode = node;

    // (a) visual analyser, (b) metrics worklet, (c) audible monitor -> destination.
    this.analyser!.connect(node);
    node.connect(this.metersNode!);
    node.connect(this.monitor!.node);
    this.monitor!.node.connect(ctx.destination);

    await this.manager.resume();
    this._state = "running";
  }

  /** Create the analyser, meters worklet node and monitor exactly once. */
  private ensureBranches(ctx: AudioContext): void {
    if (this.analyser && this.metersNode && this.monitor) return;

    this.analyser = new ScopeAnalyser(ctx, {
      fftSize: this.opts.fftSize,
      smoothing: this.opts.smoothing,
    });
    this.metersNode = new AudioWorkletNode(ctx, METERS_WORKLET_NAME);
    this.metersNode.port.onmessage = (event: MessageEvent<AnalysisFrame>): void => {
      const frame = event.data;
      for (const listener of this.frameListeners) listener(frame);
    };
    this.monitor = new Monitor(ctx);

    // Web Audio only renders nodes that reach the destination via their outputs.
    // The analysis branches (meters worklet + the analyser splitter chain) are
    // taps that would otherwise dead-end and never be processed — so route them
    // through a MUTED sink to the destination. They run; they stay silent. The
    // audible path is `monitor` (also muted by default).
    this.silentSink = ctx.createGain();
    this.silentSink.gain.value = 0;
    this.silentSink.connect(ctx.destination);
    this.metersNode.connect(this.silentSink);
    this.analyser.sinkTo(this.silentSink);
  }

  /** Disconnect the current source node from every branch (graph + monitor). */
  private teardownSource(): void {
    if (this.sourceNode) {
      // Disconnecting the source node removes all of its outgoing edges
      // (to analyser splitter, worklet, and monitor gain).
      this.sourceNode.disconnect();
    }
    this.sourceNode = null;
    this.currentSource = null;
  }

  setMonitorGain(gain: number): void {
    this.monitor?.setGain(gain);
  }

  getMonitorGain(): number {
    return this.monitor?.getGain() ?? 0;
  }

  setAnalyserConfig(cfg: Partial<AnalyserConfig>): void {
    if (cfg.fftSize !== undefined) this.opts.fftSize = cfg.fftSize;
    if (cfg.smoothing !== undefined) this.opts.smoothing = cfg.smoothing;
    // Rebuild the analyser with the new settings and reconnect the live tap
    // (to the source for input, and to the silent sink so it's still pulled).
    if (this.analyser) {
      const ctx = this.manager.getContext();
      this.analyser.dispose();
      this.analyser = new ScopeAnalyser(ctx, {
        fftSize: this.opts.fftSize,
        smoothing: this.opts.smoothing,
      });
      if (this.silentSink) this.analyser.sinkTo(this.silentSink);
      if (this.sourceNode) this.analyser.connect(this.sourceNode);
    }
  }

  getWaveform(channel: 0 | 1): Float32Array {
    if (!this.analyser) return new Float32Array(0);
    return this.analyser.getWaveform(channel);
  }

  getSpectrum(channel: 0 | 1): Float32Array {
    if (!this.analyser) return new Float32Array(0);
    return this.analyser.getSpectrum(channel);
  }

  onFrame(listener: (frame: AnalysisFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  async resume(): Promise<void> {
    if (this._state === "closed") return;
    await this.manager.resume();
    if (this.currentSource) this._state = "running";
  }

  async suspend(): Promise<void> {
    if (this._state === "closed") return;
    await this.manager.suspend();
    this._state = "suspended";
  }

  detach(): void {
    if (this._state === "closed") return;
    // Disconnect the source from every branch and forget it, so a later
    // resume() can't falsely report "running" against a dead graph, and the
    // stopped source node isn't retained.
    this.teardownSource();
    void this.manager.suspend();
    this._state = "idle";
  }

  reset(): void {
    this.metersNode?.port.postMessage({ type: "reset" });
  }

  dispose(): void {
    if (this._state === "closed") return;
    this.teardownSource();
    if (this.metersNode) {
      this.metersNode.port.onmessage = null;
      this.metersNode.disconnect();
      this.metersNode = null;
    }
    this.analyser?.dispose();
    this.analyser = null;
    this.monitor?.node.disconnect();
    this.monitor = null;
    this.silentSink?.disconnect();
    this.silentSink = null;
    this.frameListeners.clear();
    this.manager.dispose();
    this._state = "closed";
  }
}

export const createScopeEngine: CreateScopeEngine = (opts) =>
  new ScopeEngineImpl(opts);
