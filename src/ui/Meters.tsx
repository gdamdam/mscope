import { useEffect, useState } from "react";
import type { ChannelLevels } from "../audio/analysis/metrics";
import { fmtDb } from "./format";

interface MetersProps {
  channels: ChannelLevels[];
  /**
   * Session-reset epoch: increment to clear the sticky per-channel clip flags.
   * Needed because `channels` alone can't signal a reset — the latest frame
   * (and its cumulative clipCount) is unchanged at the moment the user resets.
   */
  resetToken?: number;
}

/**
 * Per-channel level meters with peak-hold clip indication.
 *
 * Pure levels (peak / RMS / true-peak) plus a sticky clip badge. The LUFS trio
 * now lives in LoudnessPanel, the loudness rail's numeric hero — Meters is the
 * companion "Levels" readout and owns no loudness state.
 *
 * clipCount on each ChannelLevels is CUMULATIVE (worklet running total). For the
 * per-channel "clip" badge we care about whether clipping is happening *now*
 * (clippedNow) and whether it has *ever* happened (peak-hold), not about summing
 * counts — so we hold a sticky "has clipped" flag derived from clippedNow.
 */
export function Meters({ channels, resetToken = 0 }: MetersProps): JSX.Element {
  // Peak-hold: sticky "clipped at some point" per channel. Cleared only by a
  // resetToken bump (session reset); declared BEFORE the accumulate effect so
  // that on mount the clear (a no-op on the empty initial state) runs first.
  const [held, setHeld] = useState<boolean[]>([]);

  useEffect(() => {
    setHeld((prev) => prev.map(() => false));
  }, [resetToken]);

  useEffect(() => {
    // OR-accumulate per channel; mapping over `channels` also handles count
    // changes (a removed channel's flag is dropped, a new one starts fresh).
    setHeld((prev) =>
      channels.map((c, i) => Boolean(prev[i]) || c.clippedNow || c.clipCount > 0),
    );
  }, [channels]);

  return (
    <div className="panel" aria-label="Levels">
      <p className="panel__title">Levels</p>
      <div className="meters">
        {channels.length === 0 && (
          <p className="note">No signal — choose a source.</p>
        )}
        {channels.map((c, i) => {
          const clipNow = c.clippedNow;
          const clipHeld = held[i] ?? c.clipCount > 0;
          const clipClass = clipNow
            ? "clip clip--now"
            : clipHeld
              ? "clip clip--held"
              : "clip";
          return (
            <div className="meter-ch" key={i}>
              <span className="meter-ch__label">
                {channels.length === 2 ? (i === 0 ? "L" : "R") : "M"}
              </span>
              <Stat k="peak" v={fmtDb(c.peakDb)} unit="dBFS" />
              <Stat k="rms" v={fmtDb(c.rmsDb)} unit="dBFS" />
              <Stat
                k="true pk"
                v={Number.isNaN(c.truePeakDb) ? "—" : fmtDb(c.truePeakDb)}
                unit="dBTP"
              />
              <span
                className={clipClass}
                aria-label={`Channel ${i} clip ${
                  clipNow ? "active" : clipHeld ? "held" : "none"
                }`}
              >
                {clipNow || clipHeld ? "CLIP" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <p className="panel__note">peak / RMS / true-peak · measured at capture</p>
    </div>
  );
}

function Stat({
  k,
  v,
  unit,
}: {
  k: string;
  v: string;
  unit: string;
}): JSX.Element {
  return (
    <span className="stat">
      <span className="stat__k">
        {k} <span aria-hidden="true">{unit}</span>
      </span>
      <span className="stat__v stat__v--num" aria-label={`${k} ${v} ${unit}`}>
        {v}
      </span>
    </span>
  );
}
