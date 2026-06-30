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
import { Spectrogram } from "./ui/Spectrogram";
import { Rta } from "./ui/Rta";
import { AnalyserControls } from "./ui/AnalyserControls";
import { Meters } from "./ui/Meters";
import { DynamicsPanel } from "./ui/DynamicsPanel";
import { SpectralPanel } from "./ui/SpectralPanel";
import { LoudnessHistory } from "./ui/LoudnessHistory";
import { Diagnostics } from "./ui/Diagnostics";
import { Histogram } from "./ui/Histogram";
import { AbControls } from "./ui/AbControls";
import { ReportPanel } from "./ui/ReportPanel";
import { Logo } from "./ui/Logo";

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

export default function App(): JSX.Element {
  // Inject the real engine factory; the hook never statically imports engine.ts.
  const scope = useScope(createScopeEngine);

  // Capability flags are stable for the page lifetime.
  const tabOk = useMemo(tabCaptureSupported, []);
  const secureOk = useMemo(isSecureContextOk, []);

  // Local view state for the oscilloscope (not part of the measurement model).
  const [solo, setSolo] = useState<0 | 1 | "both">("both");
  const [brightness, setBrightness] = useState(1);
  const [zoom, setZoom] = useState(1);

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

  return (
    <main className="scope">
      <header className="scope__head">
        <Logo />
        <span className="scope__sub">audio scope · diagnostic instrument</span>
      </header>

      {!secureOk && (
        <p className="disabled-note" role="note">
          Capture needs a secure context (HTTPS or localhost). Some inputs may be
          unavailable here.
        </p>
      )}

      <section className="scope__grid" aria-label="Source">
        <SourceSelector
          activeKind={source?.kind ?? null}
          tabCaptureSupported={tabOk}
          busy={busy}
          onCaptureTab={() => void captureTab()}
          onCaptureMic={() => void captureMic()}
        />
        <InputStatus
          kind={source?.kind ?? null}
          state={inputState}
          error={source?.error ?? null}
          canStop={live || busy}
          onStop={stop}
        />
        <ToneControls onStart={(opts) => void captureTone(opts)} busy={busy} />
        <FilePicker onFile={(file) => void captureFile(file)} busy={busy} />
      </section>

      <section className="scope__grid" aria-label="Oscilloscope">
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
      </section>

      <section className="scope__grid" aria-label="Stereo image">
        <Goniometer
          getWaveform={scope.getWaveform}
          channelCount={channelCount}
          active={live}
          frozen={frozen}
        />
        <Correlation stereo={metrics?.stereo ?? null} />
      </section>

      <section className="scope__grid" aria-label="Frequency">
        <Spectrum
          getSpectrum={scope.getSpectrum}
          sampleRate={sampleRate}
          active={live}
          frozen={frozen}
          channel={channel}
        />
        <Spectrogram
          getSpectrum={scope.getSpectrum}
          sampleRate={sampleRate}
          active={live}
          frozen={frozen}
        />
        <Rta
          getSpectrum={scope.getSpectrum}
          sampleRate={sampleRate}
          active={live}
          frozen={frozen}
          channel={channel}
        />
        <AnalyserControls config={analyserConfig} onChange={setAnalyserConfig} />
      </section>

      <section className="scope__grid" aria-label="Levels and loudness">
        <Meters channels={metrics?.channels ?? []} loudness={loudness} />
        <DynamicsPanel dynamics={dynamics} />
        <SpectralPanel spectral={spectral} />
        <LoudnessHistory history={history} active={live} frozen={frozen} />
      </section>

      <section className="scope__grid" aria-label="Diagnostics">
        <Diagnostics metrics={metrics} />
        <Histogram
          getWaveform={scope.getWaveform}
          channelCount={channelCount}
          active={live}
          frozen={frozen}
          channel={channel}
        />
      </section>

      <section className="scope__grid" aria-label="Session">
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
