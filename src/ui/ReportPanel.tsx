import { fmtDuration } from "./format";
import type { SessionSummary } from "../state/session";

interface ReportPanelProps {
  summary: SessionSummary;
  onReset(): void;
  exportJson(): string;
  exportMarkdown(): string;
}

/**
 * Download `contents` as a file. Uses an object URL + a transient anchor — no
 * server round-trip, consistent with the local-only stance.
 */
function download(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stamp(): string {
  // Filesystem-safe timestamp, e.g. 2026-06-30T12-30-00.
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Reset the session and export the diagnostic summary as JSON / Markdown. */
export function ReportPanel({
  summary,
  onReset,
  exportJson,
  exportMarkdown,
}: ReportPanelProps): JSX.Element {
  return (
    <div className="panel" aria-label="Report">
      <p className="panel__title">Session</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="note">
          Duration {fmtDuration(summary.durationMs)}
        </span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={onReset}
          aria-label="Reset session"
        >
          Reset session
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            download(`mscope-${stamp()}.json`, "application/json", exportJson())
          }
          aria-label="Export JSON"
        >
          Export JSON
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            download(
              `mscope-${stamp()}.md`,
              "text/markdown",
              exportMarkdown(),
            )
          }
          aria-label="Export Markdown"
        >
          Export Markdown
        </button>
      </div>
    </div>
  );
}
