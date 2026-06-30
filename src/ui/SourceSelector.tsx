import type { AudioInputKind } from "../audio/input/AudioInputSource";

interface SourceSelectorProps {
  /** Currently active input kind, or null when idle. */
  activeKind: AudioInputKind | null;
  /** Whether tab capture is supported in this browser (getDisplayMedia present). */
  tabCaptureSupported: boolean;
  /** True while an acquisition is in flight (disables the buttons). */
  busy: boolean;
  onCaptureTab(): void;
  onCaptureMic(): void;
}

/** Choose the audio input: tab audio (Chromium-only) or microphone. */
export function SourceSelector({
  activeKind,
  tabCaptureSupported,
  busy,
  onCaptureTab,
  onCaptureMic,
}: SourceSelectorProps): JSX.Element {
  return (
    <div className="panel" role="group" aria-label="Audio source">
      <p className="panel__title">Source</p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={onCaptureTab}
          disabled={busy || !tabCaptureSupported}
          aria-pressed={activeKind === "tab-capture"}
          aria-label="Capture tab audio"
        >
          Capture tab audio
        </button>
        <button
          type="button"
          className="btn"
          onClick={onCaptureMic}
          disabled={busy}
          aria-pressed={activeKind === "microphone"}
          aria-label="Capture microphone"
        >
          Microphone
        </button>
      </div>
      {!tabCaptureSupported && (
        <p className="disabled-note" role="note">
          Tab-audio capture needs a Chromium-based desktop browser; microphone
          still works.
        </p>
      )}
    </div>
  );
}
