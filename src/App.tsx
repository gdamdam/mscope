import "./index.css";
import { useMemo, useState } from "react";
import { createScopeEngine } from "./audio/engine";
import { useScope } from "./ui/useScope";
import { SourceSelector } from "./ui/SourceSelector";
import { InputStatus } from "./ui/InputStatus";
import { ToneControls } from "./ui/ToneControls";
import { FilePicker } from "./ui/FilePicker";
import { MonitorControl } from "./ui/MonitorControl";
import { Waveform } from "./ui/Waveform";
import { ScopeControls } from "./ui/ScopeControls";
import { SoloControl } from "./ui/SoloControl";
import { Goniometer } from "./ui/Goniometer";
import { Correlation } from "./ui/Correlation";
import { Spectrum } from "./ui/Spectrum";
import { SpectrumControls } from "./ui/SpectrumControls";
import { Spectrogram } from "./ui/Spectrogram";
import { Rta } from "./ui/Rta";
import { AnalyserControls } from "./ui/AnalyserControls";
import { Meters } from "./ui/Meters";
import { LoudnessPanel } from "./ui/LoudnessPanel";
import { DynamicsPanel } from "./ui/DynamicsPanel";
import { SpectralPanel } from "./ui/SpectralPanel";
import { LoudnessHistory } from "./ui/LoudnessHistory";
import { Diagnostics } from "./ui/Diagnostics";
import { Histogram } from "./ui/Histogram";
import { AbControls } from "./ui/AbControls";
import { ReportPanel } from "./ui/ReportPanel";
import { Logo } from "./ui/Logo";
import { Help } from "./ui/Help";
import {
  LOUDNESS_TARGETS,
  DEFAULT_TARGET,
  type LoudnessTarget,
} from "./analysis/targets";

/** True when the page can request capture: HTTPS or localhost. */
function isSecureContextOk(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const host = window.location?.hostname ?? "";
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** True when getDisplayMedia (tab-audio capture) exists in this browser. */
function tabCaptureSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/** Small uppercase eyebrow separating functional groups, with a hairline rule. */
function SectionLabel({ children }: { children: string }): JSX.Element {
  return <p className="section-label">{children}</p>;
}

export default function App(): JSX.Element {
  // Inject the real engine factory; the hook never statically imports engine.ts.
  const scope = useScope(createScopeEngine);

  // Capability flags are stable for the page lifetime.
  const tabOk = useMemo(tabCaptureSupported, []);
  const secureOk = useMemo(isSecureContextOk, []);

  // Local view state for the oscilloscope + analyser (not part of the model).
  const [solo, setSolo] = useState<0 | 1 | "both">("both");
  const [brightness, setBrightness] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [target, setTarget] = useState<LoudnessTarget>(DEFAULT_TARGET);
  const [tilt, setTilt] = useState(0);
  const [peakHold, setPeakHold] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const {
    frame,
    source,
    inputState,
    summary,
    snapshotSummary,
    monitorGain,
    spectral,
    dynamics,
    history,
    analyserConfig,
    captureTab,
    captureMic,
    captureTone,
    captureFile,
    stop,
    setMonitorGain,
    setAnalyserConfig,
    snapshot,
    clearSnapshot,
    resetSession,
    exportJson,
    exportMarkdown,
  } = scope;

  const metrics = frame?.metrics ?? null;
  const loudness = frame?.loudness ?? null;
  const live = inputState === "live";
  const busy = inputState === "requesting";
  const frozen = inputState === "ended";
  const channelCount = metrics?.channelCount ?? 1;
  const sampleRate = metrics?.sampleRate ?? 0;
  // Spectrum / RTA / Histogram follow the soloed channel; "both" reads channel 0.
  const channel: 0 | 1 = solo === 1 ? 1 : 0;

  // Session true-peak hold across channels (−Infinity until measured).
  const maxTruePeakHoldDb = Math.max(
    ...summary.channels.map((c) => c.maxTruePeakDb).filter(Number.isFinite),
    -Infinity,
  );

  return (
    <main className="scope">
      <header className="scope__head">
        <div className="scope__brand">
          <Logo />
          <span className="scope__sub">audio scope · diagnostic instrument</span>
        </div>
        <button
          type="button"
          className="btn help-btn"
          onClick={() => setHelpOpen(true)}
          aria-haspopup="dialog"
        >
          <span aria-hidden="true">?</span> Guide
        </button>
      </header>

      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />

      {!secureOk && (
        <p className="disabled-note" role="note">
          Capture needs a secure context (HTTPS or localhost). Some inputs may be
          unavailable here.
        </p>
      )}

      <section className="source-bar" aria-label="Source">
        <SourceSelector
          activeKind={source?.kind ?? null}
          tabCaptureSupported={tabOk}
          busy={busy}
          onCaptureTab={() => void captureTab()}
          onCaptureMic={() => void captureMic()}
        />
        <ToneControls onStart={(opts) => void captureTone(opts)} busy={busy} />
        <FilePicker onFile={(file) => void captureFile(file)} busy={busy} />
        <InputStatus
          kind={source?.kind ?? null}
          state={inputState}
          error={source?.error ?? null}
          canStop={live || busy}
          onStop={stop}
        />
      </section>

      <section className="scope__hero" aria-label="Oscilloscope and loudness">
        <div className="scope__hero-main">
          <Waveform
            getWaveform={scope.getWaveform}
            channelCount={channelCount}
            sampleRate={sampleRate}
            active={live}
            frozen={frozen}
            brightness={brightness}
            zoom={zoom}
            solo={solo}
          />
          <ScopeControls
            brightness={brightness}
            zoom={zoom}
            onBrightness={setBrightness}
            onZoom={setZoom}
          />
          <SoloControl
            value={solo}
            onChange={setSolo}
            channelCount={channelCount}
          />
        </div>
        <div className="scope__rail">
          <LoudnessPanel
            loudness={loudness}
            maxMomentaryLufs={summary.maxMomentaryLufs}
            maxShortTermLufs={summary.maxShortTermLufs}
            lra={dynamics?.lra ?? 0}
            maxTruePeakHoldDb={maxTruePeakHoldDb}
            target={target}
            onTargetChange={(id) =>
              setTarget(
                LOUDNESS_TARGETS.find((t) => t.id === id) ?? DEFAULT_TARGET,
              )
            }
            onResetHolds={resetSession}
          />
          <Meters channels={metrics?.channels ?? []} />
        </div>
      </section>

      <section aria-label="Frequency">
        <SectionLabel>Frequency</SectionLabel>
        <div className="scope__grid">
          <Spectrum
            getSpectrum={scope.getSpectrum}
            sampleRate={sampleRate}
            active={live}
            frozen={frozen}
            channel={channel}
            tiltDbPerOct={tilt}
            peakHold={peakHold}
          />
          <Spectrogram
            getSpectrum={scope.getSpectrum}
            sampleRate={sampleRate}
            active={live}
            frozen={frozen}
          />
          <div className="row scope__wide">
            <SpectrumControls
              tilt={tilt}
              onTilt={setTilt}
              peakHold={peakHold}
              onPeakHold={setPeakHold}
            />
            <AnalyserControls
              config={analyserConfig}
              onChange={setAnalyserConfig}
            />
          </div>
          <div className="scope__wide">
            <Rta
              getSpectrum={scope.getSpectrum}
              sampleRate={sampleRate}
              active={live}
              frozen={frozen}
              channel={channel}
            />
          </div>
        </div>
      </section>

      <section aria-label="Sound field">
        <SectionLabel>Sound field</SectionLabel>
        <div className="scope__grid">
          <Goniometer
            getWaveform={scope.getWaveform}
            channelCount={channelCount}
            active={live}
            frozen={frozen}
          />
          <div className="scope__rail">
            <Correlation stereo={metrics?.stereo ?? null} />
            <SpectralPanel spectral={spectral} />
          </div>
        </div>
      </section>

      <section aria-label="Analysis">
        <SectionLabel>Analysis</SectionLabel>
        <div className="scope__grid">
          <DynamicsPanel dynamics={dynamics} />
          <Histogram
            getWaveform={scope.getWaveform}
            channelCount={channelCount}
            active={live}
            frozen={frozen}
            channel={channel}
          />
        </div>
      </section>

      <section aria-label="Loudness over time">
        <SectionLabel>Loudness over time</SectionLabel>
        <LoudnessHistory history={history} active={live} frozen={frozen} />
      </section>

      <section aria-label="Session and diagnostics">
        <SectionLabel>Session & diagnostics</SectionLabel>
        <div className="scope__grid">
          <Diagnostics metrics={metrics} />
          <MonitorControl gain={monitorGain} onChange={setMonitorGain} />
          <AbControls
            hasSnapshot={!!snapshotSummary}
            onSnapshot={snapshot}
            onClear={clearSnapshot}
          />
          <ReportPanel
            summary={summary}
            snapshotSummary={snapshotSummary}
            onReset={resetSession}
            exportJson={exportJson}
            exportMarkdown={exportMarkdown}
          />
        </div>
      </section>

      <footer>
        <p className="note note--persistent">
          Local-only — no upload, no telemetry. Captured audio may be resampled
          by the browser; measurements are not lab-grade.
        </p>
      </footer>
    </main>
  );
}
