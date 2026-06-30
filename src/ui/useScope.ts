import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisFrame,
  CreateScopeEngine,
  EngineState,
  ScopeEngine,
} from "../audio/engineTypes";
import type {
  AudioInputSource,
  AudioInputState,
} from "../audio/input/AudioInputSource";
import { MicrophoneInput, TabCaptureInput } from "../audio/input";
import { MeasurementSession, type SessionSummary } from "../state/session";
import { toJson, toMarkdown } from "../state/report";

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

  captureTab(): Promise<void>;
  captureMic(): Promise<void>;
  stop(): void;
  setMonitorGain(g: number): void;
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
  // Wall-clock of the previous frame, to derive deltaMs for session ingest.
  const lastFrameTsRef = useRef<number | null>(null);

  const [frame, setFrame] = useState<AnalysisFrame | null>(null);
  const [source, setSource] = useState<AudioInputSource | null>(null);
  const [inputState, setInputState] = useState<AudioInputState>("idle");
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [summary, setSummary] = useState<SessionSummary>(() =>
    sessionRef.current!.summary(),
  );
  const [monitorGain, setMonitorGainState] = useState<number>(0);

  // Create + own the engine for each mount, subscribe to frames, and dispose on
  // unmount (see the StrictMode note above). clipCount is cumulative; we ingest
  // each frame exactly once here.
  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    setEngineState(engine.state);
    setMonitorGainState(engine.getMonitorGain());

    const unsubFrame = engine.onFrame((f) => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const last = lastFrameTsRef.current;
      const deltaMs = last === null ? 0 : Math.max(0, now - last);
      lastFrameTsRef.current = now;

      sessionRef.current!.ingest(f.metrics, deltaMs, f.loudness);
      setFrame(f);
      setSummary(sessionRef.current!.summary());
      setEngineState(engine.state);
    });

    return () => {
      unsubFrame();
      unsubInputRef.current?.();
      unsubInputRef.current = null;
      sourceRef.current?.dispose();
      sourceRef.current = null;
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

        // Acquisition can fail or be cancelled; only build the graph if live.
        if (next.state === "live") {
          await engine.setSource(next);
          await engine.resume();
          lastFrameTsRef.current = null; // restart delta accounting
        }
      } catch {
        // Input classes surface their own permission/cancel errors via state;
        // this guards UNEXPECTED engine/worklet failures so captureTab/captureMic
        // never reject into an unhandled promise rejection at the call site.
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

  const resetSession = useCallback(() => {
    sessionRef.current!.reset();
    engineRef.current?.reset(); // clear worklet accumulators (cumulative clip count, integrated LUFS)
    lastFrameTsRef.current = null;
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
    captureTab,
    captureMic,
    stop,
    setMonitorGain,
    resetSession,
    exportJson,
    exportMarkdown,
    getWaveform,
    getSpectrum,
  };
}
