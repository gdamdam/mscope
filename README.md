# mscope

mscope is a local-first, in-browser audio scope and diagnostic instrument — an observational
meter, not a processor, recorder, or DAW. You open it, point it at a live source (a browser tab
playing audio, or a microphone), and immediately see signal and diagnostics: stereo waveform,
spectrum, peak/RMS, clipping and peak-hold, DC offset, stereo correlation/phase, and
sample-rate/channel info. All audio stays in the page — no account, no telemetry, no upload, no
server-side processing — and the UI is explicit about browser permissions and measurement
limitations (captured tab audio is resampled by the browser, so values are "measured at capture,"
not bit-exact).

## Development

```sh
npm install
npm run dev        # start the Vite dev server
npm run build      # tsc -b && vite build
npm test           # vitest run
npm run typecheck  # tsc -b --pretty false
npm run lint       # eslint
```

## License

[AGPL-3.0-only](./LICENSE).
