import type {
  AudioInputKind,
  AudioInputState,
} from "../audio/input/AudioInputSource";

interface InputStatusProps {
  kind: AudioInputKind | null;
  state: AudioInputState;
  /** Error from the source, if any (state === "error"). */
  error: Error | null;
  /** Disabled when there is no active/live source. */
  canStop: boolean;
  onStop(): void;
}

const KIND_LABEL: Record<AudioInputKind, string> = {
  "tab-capture": "Tab audio",
  microphone: "Microphone",
  "media-stream": "Media stream",
  "audio-file": "Audio file",
  generator: "Test tone",
};

const STATE_LABEL: Record<AudioInputState, string> = {
  idle: "Idle",
  requesting: "Requesting…",
  live: "Live",
  muted: "Muted",
  ended: "Ended",
  error: "Error",
};

/**
 * Human-readable hint per state. The tab-capture no-audio-track case surfaces
 * as an Error whose message already carries the re-share guidance from
 * TabCaptureInput; we additionally show a generic hint here for clarity.
 */
function hintFor(state: AudioInputState, error: Error | null): string | null {
  switch (state) {
    case "requesting":
      return "Waiting for the browser permission / picker…";
    case "ended":
      return "Capture stopped. Choose a source to start again.";
    case "error":
      return (
        error?.message ??
        "Could not start capture. Check permissions and try again."
      );
    default:
      return null;
  }
}

/** Shows the current input kind + lifecycle state, a stop control, and hints. */
export function InputStatus({
  kind,
  state,
  error,
  canStop,
  onStop,
}: InputStatusProps): JSX.Element {
  const kindLabel = kind ? KIND_LABEL[kind] : "—";
  const stateLabel = STATE_LABEL[state];
  const hint = hintFor(state, error);

  return (
    <div className="panel" aria-label="Input status">
      <p className="panel__title">Input</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span
          className={`status status--${state}`}
          role="status"
          aria-live="polite"
          aria-label={`Input ${kindLabel}, ${stateLabel}`}
        >
          <span className="status__dot" aria-hidden="true" />
          {kindLabel} · {stateLabel}
        </span>
        <button
          type="button"
          className="btn btn--stop"
          onClick={onStop}
          disabled={!canStop}
          aria-label="Stop capture"
        >
          Stop
        </button>
      </div>
      {hint && (
        <p
          className={state === "error" ? "status__err" : "panel__note"}
          role={state === "error" ? "alert" : undefined}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
