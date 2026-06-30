import { fmtDuration, fmtSigned } from "./format";
import type { SessionSummary } from "../state/session";

interface ReportPanelProps {
  summary: SessionSummary;
  onReset(): void;
  exportJson(): string;
  exportMarkdown(): string;
  /** Held "A" snapshot for an A-vs-now comparison; null hides the delta line. */
  snapshotSummary?: SessionSummary | null;
}

/** Signed delta of two metric values, or null if either is non-finite (DB_FLOOR). */
function delta(now: number, then: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(then)) return null;
  return now - then;
}

/** Highest sample peak (dBFS) across all channels; DB_FLOOR when no channels. */
function maxPeakDb(s: SessionSummary): number {
  return s.channels.reduce(
    (m, c) => Math.max(m, c.maxPeakDb),
    Number.NEGATIVE_INFINITY,
  );
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
  snapshotSummary = null,
}: ReportPanelProps): JSX.Element {
  // Compact A-vs-now deltas, shown only while an "A" snapshot is held.
  const dLufs = snapshotSummary
    ? delta(summary.integratedLufs, snapshotSummary.integratedLufs)
    : null;
  const dPeak = snapshotSummary
    ? delta(maxPeakDb(summary), maxPeakDb(snapshotSummary))
    : null;

  return (
    <div className="panel" aria-label="Report">
      <p className="panel__title">Session</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="note">
          Duration {fmtDuration(summary.durationMs)}
        </span>
      </div>
      {snapshotSummary && (
        <p className="note" style={{ marginTop: 6 }} aria-label="A versus now">
          A → now ·{" "}
          ΔLUFS-I {dLufs === null ? "—" : `${fmtSigned(dLufs, 1)} LU`} ·{" "}
          Δmax-peak {dPeak === null ? "—" : `${fmtSigned(dPeak, 1)} dB`}
        </p>
      )}
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
