import "./index.css";
import { useMemo } from "react";
import { createScopeEngine } from "./audio/engine";
import { useScope } from "./ui/useScope";
import { SourceSelector } from "./ui/SourceSelector";
import { InputStatus } from "./ui/InputStatus";
import { MonitorControl } from "./ui/MonitorControl";
import { Waveform } from "./ui/Waveform";
import { Spectrum } from "./ui/Spectrum";
import { Meters } from "./ui/Meters";
import { Correlation } from "./ui/Correlation";
import { Diagnostics } from "./ui/Diagnostics";
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

  const {
    frame,
    source,
    inputState,
    summary,
    monitorGain,
    captureTab,
    captureMic,
    stop,
    setMonitorGain,
    resetSession,
    exportJson,
    exportMarkdown,
  } = scope;

  const metrics = frame?.metrics ?? null;
  const loudness = frame?.loudness ?? null;
  const live = inputState === "live";
  const busy = inputState === "requesting";

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

      <section className="scope__grid" aria-label="Controls">
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
      </section>

      <Waveform
        getWaveform={scope.getWaveform}
        channelCount={metrics?.channelCount ?? 1}
        sampleRate={metrics?.sampleRate ?? 0}
        active={live}
        frozen={inputState === "ended"}
      />

      <section className="scope__grid">
        <Spectrum
          getSpectrum={scope.getSpectrum}
          sampleRate={metrics?.sampleRate ?? 0}
          active={live}
          frozen={inputState === "ended"}
        />
        <Meters channels={metrics?.channels ?? []} loudness={loudness} />
        <Correlation stereo={metrics?.stereo ?? null} />
        <Diagnostics metrics={metrics} />
      </section>

      <section className="scope__grid">
        <MonitorControl gain={monitorGain} onChange={setMonitorGain} />
        <ReportPanel
          summary={summary}
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
