import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisFrame,
  AnalyserConfig,
  CreateScopeEngine,
  EngineState,
  ScopeEngine,
} from "../audio/engineTypes";
import type {
  AudioInputSource,
  AudioInputState,
} from "../audio/input/AudioInputSource";
import {
  FileInput,
  GeneratorInput,
  MbusInput,
  MicrophoneInput,
  TabCaptureInput,
  type GeneratorOptions,
} from "../audio/input";
import {
  createMbusClient,
  type MbusClient,
  type SourceInfo,
} from "../transport/mbus";
import { MeasurementSession, type SessionSummary } from "../state/session";
import { toJson, toMarkdown } from "../state/report";
import {
  HISTORY_CAP,
  type DynamicsMetrics,
  type ScopeHistory,
  type SpectralMetrics,
} from "../analysis/derived";
import { computeSpectral, dbSpectrumToLinear } from "../dsp/spectral";
import { crestFactorDb, plrDb } from "../dsp/dynamics";
import { loudnessRange } from "../dsp/loudnessRange";
import { estimateNoiseFloorDb } from "../dsp/noiseFloor";

/** Analyser defaults — match ScopeEngineOptions (fftSize 2048, smoothing 0.8). */
const DEFAULT_ANALYSER_CONFIG: AnalyserConfig = { fftSize: 2048, smoothing: 0.8 };

/** Push `v` onto a ring, dropping the oldest once it exceeds `cap`. */
function pushCapped(ring: number[], v: number, cap: number): void {
  ring.push(v);
  if (ring.length > cap) ring.shift();
}

/**
 * Public surface of the scope, consumed by the components. Kept deliberately
 * small: a few imperative actions plus the latest reactive readouts.
 */
export interface UseScope {
  /** Latest sample-accurate analysis frame, or null before the first frame. */
  frame: AnalysisFrame | null;
  /** Current input source (mic/tab), or null when idle. */
  source: AudioInputSource | null;
  /** Lifecycle state of the current source. */
  inputState: AudioInputState;
  /** Engine lifecycle state. */
  engineState: EngineState;
  /** Live diagnostic summary of the running measurement session. */
  summary: SessionSummary;
  /** Audible monitor gain in [0,1]; 0 == muted (default). */
  monitorGain: number;

  /** Latest spectral descriptors (channel 0), or null before the first frame. */
  spectral: SpectralMetrics | null;
  /** Latest dynamics descriptors, or null before the first frame. */
  dynamics: DynamicsMetrics | null;
  /** Rolling loudness/level history rings (newest last). */
  history: ScopeHistory;
  /** Current visual AnalyserNode configuration. */
  analyserConfig: AnalyserConfig;
  /** Manually held session snapshot (via snapshot()), or null. */
  snapshotSummary: SessionSummary | null;

  /** Sources advertised on the mbus link-bridge, or null before openMbus(). */
  mbusSources: SourceInfo[] | null;

  captureTab(): Promise<void>;
  captureMic(): Promise<void>;
  captureTone(opts: GeneratorOptions): Promise<void>;
  captureFile(file: File | Blob): Promise<void>;
  /** Lazily create + connect the mbus client (idempotent). Until this is
   *  called, no client or socket exists — the bridge is never touched. */
  openMbus(): void;
  captureMbus(sourceId: string): Promise<void>;
  stop(): void;
  setMonitorGain(g: number): void;
  setAnalyserConfig(cfg: Partial<AnalyserConfig>): void;
  snapshot(): void;
  clearSnapshot(): void;
  resetSession(): void;
  exportJson(): string;
  exportMarkdown(): string;

  /** Latest time-domain waveform for a channel, pulled live from the engine. */
  getWaveform(channel: 0 | 1): Float32Array;
  /** Latest dB magnitude spectrum for a channel, pulled live from the engine. */
  getSpectrum(channel: 0 | 1): Float32Array;
}

/**
 * Owns one ScopeEngine + one MeasurementSession and bridges them to React.
 *
 * Engine factory is INJECTED (not imported) so this module stays loadable while
 * `src/audio/engine.ts` is written in parallel; App.tsx supplies the real
 * `createScopeEngine`, tests supply a fake.
 *
 * Visual data (waveform/spectrum) is pulled imperatively from the engine inside
 * the components' own rAF loops — the hook does NOT poll it into state (that
 * would thrash React at frame rate). The hook drives a single shared rAF
 * "tick" counter so visual components can re-render in lockstep while honoring
 * prefers-reduced-motion (paused; one static draw on each frame instead).
 */
export function useScope(createEngine: CreateScopeEngine): UseScope {
  // Engine + session live for the lifetime of the hook. Lazy-init so tests and
  // the real app both construct exactly one of each.
  // The engine is created INSIDE the lifecycle effect (not during render) so
  // React StrictMode's dev-only mount→unmount→mount cannot permanently dispose a
  // render-created singleton — which left setSource() bailing on a "closed"
  // engine and nothing ever rendering. The effect makes a fresh engine per mount
  // and disposes it per unmount (correct for StrictMode AND real unmounts).
  const engineRef = useRef<ScopeEngine | null>(null);
  const sessionRef = useRef<MeasurementSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = new MeasurementSession();

  const sourceRef = useRef<AudioInputSource | null>(null);
  const unsubInputRef = useRef<(() => void) | null>(null);
  // Shared mbus client — created lazily by openMbus() (first user interaction
  // with the mbus input), never at mount, so absent gear costs nothing. It
  // outlives individual MbusInput sources (staying connected for discovery)
  // and is torn down with the hook.
  const mbusRef = useRef<MbusClient | null>(null);
  const unsubMbusRef = useRef<(() => void) | null>(null);
  // Wall-clock of the previous frame, to derive deltaMs for session ingest.
  const lastFrameTsRef = useRef<number | null>(null);
  // Rolling history rings, mutated in place per frame; a fresh ScopeHistory
  // object is set into state each frame so React sees a new reference.
  const historyRef = useRef<ScopeHistory>({
    momentaryLufs: [],
    shortTermLufs: [],
    peakDb: [],
    rmsDb: [],
  });

  const [frame, setFrame] = useState<AnalysisFrame | null>(null);
  const [source, setSource] = useState<AudioInputSource | null>(null);
  const [inputState, setInputState] = useState<AudioInputState>("idle");
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [summary, setSummary] = useState<SessionSummary>(() =>
    sessionRef.current!.summary(),
  );
  const [monitorGain, setMonitorGainState] = useState<number>(0);
  const [spectral, setSpectral] = useState<SpectralMetrics | null>(null);
  const [dynamics, setDynamics] = useState<DynamicsMetrics | null>(null);
  const [history, setHistory] = useState<ScopeHistory>(() => ({
    momentaryLufs: [],
    shortTermLufs: [],
    peakDb: [],
    rmsDb: [],
  }));
  const [analyserConfig, setAnalyserConfigState] = useState<AnalyserConfig>(
    () => ({ ...DEFAULT_ANALYSER_CONFIG }),
  );
  const [snapshotSummary, setSnapshotSummary] =
    useState<SessionSummary | null>(null);
  const [mbusSources, setMbusSources] = useState<SourceInfo[] | null>(null);

  // Create + own the engine for each mount, subscribe to frames, and dispose on
  // unmount (see the StrictMode note above). clipCount is cumulative; we ingest
  // each frame exactly once here.
  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    setEngineState(engine.state);
    setMonitorGainState(engine.getMonitorGain());
    // Push the default analyser config so engine + state agree from mount.
    engine.setAnalyserConfig(DEFAULT_ANALYSER_CONFIG);
    setAnalyserConfigState({ ...DEFAULT_ANALYSER_CONFIG });

    const unsubFrame = engine.onFrame((f) => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const last = lastFrameTsRef.current;
      const deltaMs = last === null ? 0 : Math.max(0, now - last);
      lastFrameTsRef.current = now;

      sessionRef.current!.ingest(f.metrics, deltaMs, f.loudness);
      setFrame(f);
      setSummary(sessionRef.current!.summary());

      // --- Append to history rings (cap each, drop oldest), then derive. ---
      const channels = f.metrics.channels;
      const c0 = channels[0];
      const ring = historyRef.current;
      pushCapped(ring.momentaryLufs, f.loudness.momentaryLufs, HISTORY_CAP);
      pushCapped(ring.shortTermLufs, f.loudness.shortTermLufs, HISTORY_CAP);
      if (c0) {
        pushCapped(ring.peakDb, c0.peakDb, HISTORY_CAP);
        pushCapped(ring.rmsDb, c0.rmsDb, HISTORY_CAP);
      }
      // Fresh object reference so React re-renders consumers.
      setHistory({
        momentaryLufs: ring.momentaryLufs.slice(),
        shortTermLufs: ring.shortTermLufs.slice(),
        peakDb: ring.peakDb.slice(),
        rmsDb: ring.rmsDb.slice(),
      });

      // Dynamics: crest per channel, PLR from loudest peak, LRA + noise floor
      // from the accumulated history.
      const maxPeakDb = channels.reduce(
        (m, c) => Math.max(m, c.peakDb),
        Number.NEGATIVE_INFINITY,
      );
      setDynamics({
        crestDb: channels.map((c) => crestFactorDb(c.peakDb, c.rmsDb)),
        plrDb: plrDb(maxPeakDb, f.loudness.integratedLufs),
        lra: loudnessRange(ring.shortTermLufs),
        noiseFloorDb: estimateNoiseFloorDb(ring.rmsDb),
      });

      // Spectral: pull the live dB spectrum (channel 0) and derive descriptors.
      // fftSize is bins*2 (AnalyserNode returns fftSize/2 magnitude bins).
      const dbSpec = engine.getSpectrum(0);
      if (dbSpec.length > 0) {
        setSpectral(
          computeSpectral(
            dbSpectrumToLinear(dbSpec),
            f.metrics.sampleRate,
            dbSpec.length * 2,
          ),
        );
      } else {
        setSpectral(null);
      }

      setEngineState(engine.state);
    });

    return () => {
      unsubFrame();
      unsubInputRef.current?.();
      unsubInputRef.current = null;
      sourceRef.current?.dispose();
      sourceRef.current = null;
      unsubMbusRef.current?.();
      unsubMbusRef.current = null;
      mbusRef.current?.disconnect();
      mbusRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [createEngine]);

  // Wire (or replace) an input source: subscribe to its state, hand it to the
  // engine, and resume the AudioContext (suspended until a user gesture).
  const attach = useCallback(
    async (next: AudioInputSource & { start(): Promise<void> }) => {
      const engine = engineRef.current;
      if (!engine) return;

      // Drop the previous source + its subscription first.
      unsubInputRef.current?.();
      sourceRef.current?.dispose();

      sourceRef.current = next;
      setSource(next);
      setInputState(next.state);
      unsubInputRef.current = next.subscribe((s) => setInputState(s.state));

      try {
        // Acquire the underlying MediaStream (mic permission / tab picker).
        await next.start();
        // stop() or a newer attach may supersede us during any await below;
        // those paths already stop/dispose `next` and detach the engine, so a
        // stale continuation must not resume the graph or set any state.
        if (sourceRef.current !== next) return;

        // Acquisition can fail or be cancelled; only build the graph if live.
        if (next.state === "live") {
          await engine.setSource(next);
          if (sourceRef.current !== next) return;
          await engine.resume();
          if (sourceRef.current !== next) return;
          lastFrameTsRef.current = null; // restart delta accounting
        }
      } catch {
        // Input classes surface their own permission/cancel errors via state;
        // this guards UNEXPECTED engine/worklet failures so captureTab/captureMic
        // never reject into an unhandled promise rejection at the call site.
        // A superseded attach's rejection is stale: it must not clobber the
        // replacement source's displayed state with "error".
        if (sourceRef.current !== next) return;
        setInputState("error");
      }
      setEngineState(engine.state);
    },
    [],
  );

  const captureTab = useCallback(async () => {
    await attach(new TabCaptureInput());
  }, [attach]);

  const captureMic = useCallback(async () => {
    await attach(new MicrophoneInput());
  }, [attach]);

  const captureTone = useCallback(
    async (opts: GeneratorOptions) => {
      await attach(new GeneratorInput(opts));
    },
    [attach],
  );

  const captureFile = useCallback(
    async (file: File | Blob) => {
      await attach(new FileInput(file));
    },
    [attach],
  );

  const openMbus = useCallback(() => {
    if (mbusRef.current) return;
    const client = createMbusClient();
    mbusRef.current = client;
    setMbusSources(client.getSources());
    unsubMbusRef.current = client.onSources(setMbusSources);
    // Absent bridge is fine: the client retries in the background and simply
    // keeps reporting no sources.
    client.connect();
  }, []);

  const captureMbus = useCallback(
    async (sourceId: string) => {
      const client = mbusRef.current;
      if (!client) return;
      await attach(new MbusInput(client, sourceId));
    },
    [attach],
  );

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    unsubInputRef.current?.();
    unsubInputRef.current = null;
    sourceRef.current?.stop();
    sourceRef.current = null;
    // Detach so the engine forgets the (now dead) source and returns to idle —
    // otherwise resume() could falsely report "running" against a dead graph.
    engine.detach();
    setSource(null);
    setInputState("idle");
    setEngineState(engine.state);
  }, []);

  const setMonitorGain = useCallback((g: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const clamped = Math.min(1, Math.max(0, g));
    engine.setMonitorGain(clamped);
    setMonitorGainState(engine.getMonitorGain());
  }, []);

  const setAnalyserConfig = useCallback((cfg: Partial<AnalyserConfig>) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setAnalyserConfig(cfg);
    setAnalyserConfigState((prev) => ({ ...prev, ...cfg }));
  }, []);

  const snapshot = useCallback(() => {
    // summary() returns a fresh, fully-serializable object each call, so we can
    // hold it directly as the snapshot.
    setSnapshotSummary(sessionRef.current!.summary());
  }, []);

  const clearSnapshot = useCallback(() => {
    setSnapshotSummary(null);
  }, []);

  const resetSession = useCallback(() => {
    sessionRef.current!.reset();
    engineRef.current?.reset(); // clear worklet accumulators (cumulative clip count, integrated LUFS)
    lastFrameTsRef.current = null;
    // Clear the history rings and derived readouts. snapshotSummary is a manual
    // hold and is intentionally left untouched.
    historyRef.current = {
      momentaryLufs: [],
      shortTermLufs: [],
      peakDb: [],
      rmsDb: [],
    };
    setHistory({
      momentaryLufs: [],
      shortTermLufs: [],
      peakDb: [],
      rmsDb: [],
    });
    setSpectral(null);
    setDynamics(null);
    setSummary(sessionRef.current!.summary());
  }, []);

  const exportJson = useCallback(
    () => toJson(sessionRef.current!.summary()),
    [],
  );
  const exportMarkdown = useCallback(
    () => toMarkdown(sessionRef.current!.summary()),
    [],
  );

  // Visual data is pulled on demand (inside the components' rAF loops) rather
  // than mirrored into React state — polling Float32Arrays at frame rate would
  // thrash reconciliation. Stable callbacks that read the engine directly.
  const getWaveform = useCallback(
    (channel: 0 | 1) =>
      engineRef.current?.getWaveform(channel) ?? new Float32Array(0),
    [],
  );
  const getSpectrum = useCallback(
    (channel: 0 | 1) =>
      engineRef.current?.getSpectrum(channel) ?? new Float32Array(0),
    [],
  );

  return {
    frame,
    source,
    inputState,
    engineState,
    summary,
    monitorGain,
    spectral,
    dynamics,
    history,
    analyserConfig,
    snapshotSummary,
    mbusSources,
    captureTab,
    captureMic,
    captureTone,
    captureFile,
    openMbus,
    captureMbus,
    stop,
    setMonitorGain,
    setAnalyserConfig,
    snapshot,
    clearSnapshot,
    resetSession,
    exportJson,
    exportMarkdown,
    getWaveform,
    getSpectrum,
  };
}
