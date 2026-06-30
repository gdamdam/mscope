# mscope

**A local-first, in-browser audio scope & diagnostic instrument.** Point it at a live source and read your signal — waveform, spectrum, loudness, stereo field, and signal-health diagnostics — entirely in the browser. An *observational meter*, not a processor, recorder, or DAW.

[![live](https://img.shields.io/badge/live-mscope.mpump.live-5fb0c8)](https://mscope.mpump.live)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-18-149eca.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vite.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org)
[![tests](https://img.shields.io/badge/tests-292%20passing-6fae74.svg)](#testing)
[![local-first](https://img.shields.io/badge/local--first-no%20telemetry-6fae74.svg)](#privacy--honest-measurement)

---

## Sources

Capture any of these — no account, no upload, nothing leaves the page:

- **Browser tab audio** — `getDisplayMedia()`; analyze another tab (e.g. a web instrument) live, with zero changes to the source app.
- **Microphone / line in** — `getUserMedia()`.
- **Audio file** — drop in a file to analyze it.
- **Test-tone generator** — sine / white / pink, for calibrating or testing a chain.

## What it shows

- **Oscilloscope** — stereo waveform, dBFS-scaled, with **brightness** and **time-zoom** controls and per-channel **solo**.
- **Spectrum + Spectrogram** — log-frequency magnitude spectrum and a scrolling waterfall.
- **RTA** — ⅓-octave band meters.
- **Goniometer** — stereo vectorscope (mid/side), alongside correlation & balance.
- **Levels** — per-channel peak, RMS, and **true-peak (dBTP)** with clip detection + peak-hold.
- **Loudness** — **LUFS** momentary / short-term / integrated (in-house ITU-R BS.1770 K-weighting + gating), plus **LRA** and a loudness/level **history** graph.
- **Dynamics** — crest factor, PLR (peak-to-loudness), noise-floor estimate.
- **Spectral** — centroid (brightness), flatness (tonal↔noise), dominant frequency.
- **Diagnostics** — DC offset, silence / low-signal, sample rate & channel count, cumulative **clip** and **glitch/dropout** counts.
- **Histogram** — amplitude distribution (spots clipping pile-ups, DC bias, quantization).
- **Session** — resettable measurement session, **A/B snapshot** compare, and **JSON / Markdown** report export.

Analysis is **observational** — it never colors the signal. Monitoring is a separate path, **muted by default** (so capturing a tab doesn't double the audio). FFT size / smoothing are adjustable; reduced-motion and keyboard/AT accessibility are first-class.

## How it works

```
source → AnalyserNode      → waveform / spectrum / spectrogram / goniometer (visuals)
       → meters AudioWorklet → peak / RMS / true-peak / LUFS / DC / clip / glitch (sample-accurate)
       → monitor gain        → speakers (muted by default)
```

Sample-accurate metrics run in an **AudioWorklet** (gapless, BS.1770-grade); visuals read an **AnalyserNode** on the main thread. The DSP is dependency-free and unit-tested.

## Quick start

```sh
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm test           # vitest run
npm run lint       # eslint
npm run typecheck  # tsc -b --pretty false
```

## Browser support

| Source | Support |
| --- | --- |
| Tab audio (`getDisplayMedia`) | **Chromium desktop only** (Chrome/Edge). Firefox ignores display audio; Safari/mobile unsupported. |
| Microphone | All modern browsers. |
| Audio file / test tone | All modern browsers. |

mscope detects capabilities and degrades honestly — the tab-capture button is disabled (with a note) where it can't work. A secure context (HTTPS or `localhost`) is required for capture.

## Privacy & honest measurement

- **Local-only.** No account, no telemetry, no upload, no server-side audio. Report export is a file *you* download.
- **Not lab-grade.** Captured browser audio may be **resampled** and is not guaranteed bit-identical to the source; values are "measured at capture." Loudness/true-peak follow ITU-R BS.1770 but device/calibration paths are unknown.

## Testing

Pure DSP (levels, true-peak, LUFS, LRA, spectral, dynamics, histogram, glitch) is unit-tested deterministically; LUFS is validated against ITU-R BS.1770 / EBU Tech 3341 synthetic vectors. Web-Audio graph behavior can't run headless — it's covered by manual browser QA. Run `npm test`.

## Deploy

CI (`.github/workflows/ci.yml`) type-checks, lints, tests, and builds on every push/PR. `deploy.yml` publishes `dist/` to GitHub Pages on `main` (custom domain `mscope.mpump.live` via `public/CNAME`). One-time: repo **Settings → Pages → Source: GitHub Actions**, and a DNS `CNAME` for `mscope`.

## License

[AGPL-3.0-only](./LICENSE). Part of the *mpump* family of local-first browser instruments; audio-engine lineage shared with [mpump](https://mpump.live).
