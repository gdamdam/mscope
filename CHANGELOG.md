# Changelog

All notable changes to mscope are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver.

## [0.2.0] — 2026-06-30

Big analysis + visualization expansion.

### Added
- **Sources**: audio-file input (drag-drop / picker) and a **test-tone generator**
  (sine / white / pink).
- **Visualizations**: **spectrogram** (waterfall), **goniometer** (stereo
  vectorscope), **RTA** (⅓-octave bars), **amplitude histogram**, and a
  **loudness/level history** graph.
- **Metrics**: **true-peak (dBTP)** in the meters, **LRA** (loudness range),
  crest factor, **PLR** (peak-to-loudness), noise-floor estimate, spectral
  **centroid / flatness / dominant frequency**, and **glitch/dropout** detection.
- **Oscilloscope controls**: trace **brightness**, horizontal **time-zoom**, and
  per-channel **solo**.
- **Tools**: adjustable **FFT size / smoothing**, **A/B snapshot** compare, and a
  channel selector for the single-channel views.
- README refreshed with badges; bumped to 0.2.0.

### Notes
- Fixed a dev-only React StrictMode bug that disposed the audio engine and left
  capture rendering nothing.
- New sample-accurate metrics run in the meters AudioWorklet; spectral/dynamics
  derive on the main thread. All DSP is dependency-free and unit-tested
  (292 tests).

## [0.1.0] — 2026-06-30

Initial release — a local-first, in-browser audio scope & diagnostic instrument.

### Added
- Live input via browser **tab-audio capture** (`getDisplayMedia`) and
  **microphone** (`getUserMedia`), behind a reusable `AudioInputSource`
  abstraction (idle/requesting/live/muted/ended/error state machine, no-audio-track
  detection, video-track teardown, cancel/ended handling, stale-request guard).
- **Sample-accurate metering** in an AudioWorklet: peak, RMS, true-peak (dBTP,
  oversampled), DC offset, clip count + peak-hold, silence/low-signal detection,
  stereo correlation & balance, and **LUFS** (momentary/short-term/integrated) —
  in-house K-weighting + gating verified against ITU-R BS.1770 / EBU Tech 3341.
- **Visual scope**: stereo waveform and spectrum (AnalyserNode), reduced-motion aware.
- Resettable **measurement session** with JSON + Markdown diagnostic export.
- Observational by design: analysis never colors the signal; monitor muted by
  default; honest disclaimers about capture resampling and measurement limits.
- Accessibility, capability detection (Chromium-first for tab audio; microphone
  cross-browser), and secure-context handling.
- CI + GitHub Pages deploy workflows; custom domain `mscope.mpump.live`.
