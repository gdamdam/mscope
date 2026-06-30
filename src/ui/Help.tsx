import { useEffect, useRef } from "react";
import "./help.css";

interface HelpProps {
  /** When true, the modal is shown; when false, nothing renders. */
  open: boolean;
  /** Called when the user dismisses the dialog (close button, backdrop, Escape). */
  onClose: () => void;
}

const HEADING_ID = "help-title";

/**
 * Accessible in-app feature guide. A modal dialog explaining every mscope
 * feature in plain language. Observational only — it documents, never measures.
 */
export function Help({ open, onClose }: HelpProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  // Remember who had focus before opening so we can restore it on close.
  const restoreRef = useRef<HTMLElement | null>(null);

  // Escape-to-close + focus trap: listen only while open so we don't leak handlers.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Trap Tab inside the panel so focus can't reach the (obscured) page
      // controls behind the modal — aria-modal="true" promises exactly this.
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        // No focusable controls inside: keep focus on the panel itself.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Move focus into the dialog on open; restore it to the prior element on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="help-backdrop"
      // Clicking the backdrop (but not the panel) closes the dialog.
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={HEADING_ID}
        tabIndex={-1}
        // Stop clicks inside the panel from bubbling to the backdrop handler.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-header">
          <h2 id={HEADING_ID} className="help-title">
            mscope — feature guide
          </h2>
          <button
            type="button"
            className="help-close btn"
            onClick={onClose}
            aria-label="Close help"
          >
            Close ×
          </button>
        </div>

        <div className="help-body">
          <section className="help-section">
            <h3>What mscope is</h3>
            <p>
              A local-first, in-browser audio scope and diagnostic instrument. It
              listens and shows you what is in a signal — it is purely
              observational and never alters, processes, or re-encodes the audio
              you feed it.
            </p>
          </section>

          <section className="help-section">
            <h3>Sources</h3>
            <p>Pick where the audio comes from:</p>
            <ul>
              <li>
                <strong>Capture tab audio</strong> — measure another browser
                tab. Chromium-based desktop browsers only; when the picker
                appears, tick <em>“Share tab audio”</em>.
              </li>
              <li>
                <strong>Microphone</strong> — your live input device.
              </li>
              <li>
                <strong>Audio file</strong> — drop a file onto the window or pick
                one to play through the analysers.
              </li>
              <li>
                <strong>Test tone</strong> — a built-in generator: sine, white
                noise, or pink noise, for checking the meters themselves.
              </li>
            </ul>
            <p>
              The input shows its state: <em>idle</em>, <em>requesting</em>{" "}
              (waiting on permission), <em>live</em>, <em>muted</em>,{" "}
              <em>ended</em> (source stopped), or <em>error</em>.
            </p>
          </section>

          <section className="help-section">
            <h3>Oscilloscope (Waveform)</h3>
            <p>
              Stereo time-domain view — amplitude over a short slice of time, on
              a dBFS scale (0 = full scale; the −6 line marks half-amplitude).
              <strong> Brightness</strong> sets trace intensity,{" "}
              <strong>Zoom</strong> stretches or compresses the horizontal
              time-base, and <strong>Solo</strong> isolates L, R, or shows Both.
              The trace freezes when the source has <em>ended</em>.
            </p>
          </section>

          <section className="help-section">
            <h3>Spectrum</h3>
            <p>
              Magnitude versus log-scaled frequency, in dBFS.{" "}
              <strong>Tilt</strong> applies a per-octave slope (e.g. +4.5 dB/oct
              makes pink noise read flat). <strong>Peak-hold</strong> keeps the
              highest value each band has reached. Hover the cursor to read the
              exact frequency · musical note · dB under the pointer.
            </p>
          </section>

          <section className="help-section">
            <h3>Spectrogram</h3>
            <p>
              A scrolling waterfall: time on the x-axis, frequency on the y-axis,
              and magnitude as colour. Good for spotting how the tonal content
              evolves over time.
            </p>
          </section>

          <section className="help-section">
            <h3>RTA</h3>
            <p>
              Real-time analyser showing ⅓-octave band levels — a quick read of
              overall tonal balance.
            </p>
          </section>

          <section className="help-section">
            <h3>Goniometer</h3>
            <p>
              A stereo vectorscope plotting mid against side. A near-vertical
              line means roughly mono; a wide blob means a wide stereo image; a
              horizontal tilt warns of out-of-phase content.
            </p>
          </section>

          <section className="help-section">
            <h3>Correlation &amp; Balance</h3>
            <p>
              Phase correlation: <strong>+1</strong> is mono / fully in-phase,{" "}
              <strong>0</strong> is wide and uncorrelated, <strong>−1</strong> is
              out-of-phase (a mono-compatibility risk).{" "}
              <strong>Balance</strong> compares left versus right energy.
            </p>
          </section>

          <section className="help-section">
            <h3>Levels</h3>
            <p>
              <strong>Peak</strong> and <strong>RMS</strong> level, plus{" "}
              <strong>True-peak</strong> (dBTP) which estimates inter-sample
              peaks the raw samples miss. The <strong>CLIP</strong> indicator
              latches once any sample hits full scale, so a brief overload stays
              visible.
            </p>
          </section>

          <section className="help-section">
            <h3>Loudness</h3>
            <p>
              LUFS per ITU-R BS.1770: <strong>Momentary</strong> (400 ms window),{" "}
              <strong>Short-term</strong> (3 s), and <strong>Integrated</strong>{" "}
              (gated, over the whole session). Pick a <strong>Target</strong> —
              EBU −23, Streaming −14, Apple −16, or ATSC −24 — to get a
              pass / over / under read. <strong>LRA</strong> is the loudness
              range, and a true-peak ceiling (−1 dBTP) flags overshoots. Max
              values hold until you press <strong>Reset holds</strong>.
            </p>
          </section>

          <section className="help-section">
            <h3>Dynamics</h3>
            <p>
              <strong>Crest factor</strong> (peak minus RMS),{" "}
              <strong>PLR</strong> (peak minus integrated loudness), and the{" "}
              <strong>Noise floor</strong> estimate.
            </p>
          </section>

          <section className="help-section">
            <h3>Spectral</h3>
            <p>
              <strong>Centroid</strong> — the spectral “centre of gravity”, a
              measure of brightness. <strong>Flatness</strong> — 1 is
              noise-like, 0 is tonal. <strong>Dominant frequency</strong> — the
              single strongest component.
            </p>
          </section>

          <section className="help-section">
            <h3>Diagnostics</h3>
            <p>
              Health checks: <strong>DC offset</strong>,{" "}
              <strong>Silence / low-signal</strong> detection,{" "}
              <strong>Sample rate &amp; channels</strong>, a{" "}
              <strong>Clip count</strong>, and a{" "}
              <strong>Glitch / dropout count</strong>.
            </p>
          </section>

          <section className="help-section">
            <h3>Amplitude histogram</h3>
            <p>
              The distribution of sample values. Spikes at the edges mean
              clipping, an off-centre hump means DC bias, and gaps suggest
              quantization.
            </p>
          </section>

          <section className="help-section">
            <h3>Loudness history</h3>
            <p>
              Momentary and short-term LUFS plotted over time against your target
              line, so you can see how loudness drifts across the session.
            </p>
          </section>

          <section className="help-section">
            <h3>Controls &amp; session</h3>
            <ul>
              <li>
                <strong>Monitor</strong> — listen to the signal (muted by
                default). Monitoring is audible only; it does not affect any
                measurement.
              </li>
              <li>
                <strong>FFT size / smoothing</strong> — trade frequency
                resolution against responsiveness for the spectral views.
              </li>
              <li>
                <strong>A/B snapshot</strong> — freeze a reference to compare
                against the live signal.
              </li>
              <li>
                <strong>Reset session</strong> — clear integrated/held values and
                start fresh.
              </li>
              <li>
                <strong>Export JSON / Markdown</strong> — save the current
                measurements as a report.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Privacy &amp; limits</h3>
            <p>
              Everything runs locally in your browser: no upload, no server, no
              telemetry. Because the browser may resample captured audio, treat
              the numbers as “measured at capture” rather than lab-grade. Tab
              audio capture requires a Chromium-based desktop browser.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
