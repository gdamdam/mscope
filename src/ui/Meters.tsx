import { useEffect, useRef, useState } from "react";
import type { ChannelLevels } from "../audio/analysis/metrics";
import type { LoudnessSnapshot } from "../dsp/loudness";
import { fmtDb, fmtLufs } from "./format";

interface MetersProps {
  channels: ChannelLevels[];
  loudness: LoudnessSnapshot | null;
}

/**
 * Per-channel level meters with peak-hold clip indication, plus the LUFS trio.
 *
 * clipCount on each ChannelLevels is CUMULATIVE (worklet running total). For the
 * per-channel "clip" badge we care about whether clipping is happening *now*
 * (clippedNow) and whether it has *ever* happened (peak-hold), not about summing
 * counts — so we hold a sticky "has clipped" flag derived from clippedNow.
 */
export function Meters({ channels, loudness }: MetersProps): JSX.Element {
  // Peak-hold: sticky "clipped at some point" per channel, reset when channels
  // identity is cleared (e.g. session reset surfaces empty channels first).
  const [held, setHeld] = useState<boolean[]>([]);
  const prevLenRef = useRef(0);

  useEffect(() => {
    setHeld((prev) => {
      const next = channels.map(
        (c, i) => Boolean(prev[i]) || c.clippedNow || c.clipCount > 0,
      );
      return next;
    });
    prevLenRef.current = channels.length;
  }, [channels]);

  return (
    <div className="panel" aria-label="Meters">
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

      <div className="lufs" aria-label="Loudness LUFS">
        <Stat
          k="LUFS-M"
          v={loudness ? fmtLufs(loudness.momentaryLufs) : "—"}
          unit="momentary"
        />
        <Stat
          k="LUFS-S"
          v={loudness ? fmtLufs(loudness.shortTermLufs) : "—"}
          unit="short"
        />
        <Stat
          k="LUFS-I"
          v={loudness ? fmtLufs(loudness.integratedLufs) : "—"}
          unit="integrated"
        />
      </div>
      <p className="panel__note">
        ITU-R BS.1770 K-weighted · measured at capture
      </p>
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
