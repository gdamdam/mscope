import type { SourceInfo } from "../transport/mbus";

interface MbusPickerProps {
  /** Advertised bridge sources, or null while the client hasn't been opened. */
  sources: SourceInfo[] | null;
  /** sourceId of the active mbus input, or null when another input is live. */
  activeSourceId: string | null;
  /** True while an acquisition is in flight (disables the buttons). */
  busy: boolean;
  /** First interaction: lazily create + connect the mbus client. */
  onOpen(): void;
  /** Subscribe to a source and make it the scope's input. */
  onPick(sourceId: string): void;
}

/**
 * mbus input picker: listen to another instrument tab's live output over the
 * local mpump link-bridge. Nothing (no client, no socket) exists until the
 * user clicks "Find sources"; with no bridge running the list simply stays
 * empty, with a hint.
 */
export function MbusPicker({
  sources,
  activeSourceId,
  busy,
  onOpen,
  onPick,
}: MbusPickerProps): JSX.Element {
  return (
    <div className="panel" role="group" aria-label="mbus sources">
      <p className="panel__title">mbus</p>
      {sources === null ? (
        <button
          type="button"
          className="btn"
          onClick={onOpen}
          disabled={busy}
          aria-label="Find mbus sources"
        >
          Find sources
        </button>
      ) : sources.length === 0 ? (
        <p className="panel__note" role="note">
          No sources — is the mpump link-bridge running?
        </p>
      ) : (
        <div className="row">
          {sources.map((s) => (
            <button
              key={s.sourceId}
              type="button"
              className="btn"
              onClick={() => onPick(s.sourceId)}
              disabled={busy}
              aria-pressed={s.sourceId === activeSourceId}
              aria-label={`Listen to ${s.name}`}
            >
              {s.name} · {s.sourceId}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
