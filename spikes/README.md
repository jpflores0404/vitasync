# Phase 0 spikes

Throwaway code for measuring feasibility. Nothing in `src/` imports from here. Results go in [docs/FEASIBILITY.md](../docs/FEASIBILITY.md).

## Setup

```sh
pnpm install
pnpm spike:assets     # downloads Vosk models (~76 MB) and Tesseract data into spikes/public/ (gitignored)
```

- `pnpm spike:dev` serves the spike pages at http://localhost:5173 for live microphone and camera testing. The service worker is off in dev mode.
- `pnpm spike:build && pnpm spike:preview` serves the installable PWA at http://localhost:4173. Use this for offline tests.

`localhost` counts as a secure context, so the microphone, camera and PWA install all work without HTTPS on the test laptop itself.

## Spike 1: Speech (`/asr/`)

- **Live test:** load a model, then hold the button or Space to talk. Esc cancels. The page shows the transcript, parsed fields, release-to-result latency, and whether the browser released the microphone.
- **Record corpus:** prompts each of the 17 phrases (`asr/phrases.ts`) and downloads one WAV per take, named `P1_headset_quiet_p06_1.wav`.
- **Batch scoring:** pick clips and run. The page scores field extraction per clip and summarises by mic, noise and speaker. Download JSON or CSV.
- **Headless batch:** `node spikes/scripts/asr-batch.mjs <clips-dir> [out-dir]` runs every model × grammar × lead-in combination, plus one run offline. Requires `pnpm spike:build` and Google Chrome installed.

### Recording rules (D33, D34)
- Get signed consent before recording anyone.
- Use synthetic values only: speakers read the prompts and say nothing else.
- Keep clips **out of git**. `*.wav` is ignored. Store them in the private shared folder and delete them after the engine decision unless consent covers longer use.
- Only scores and transcripts go in `spikes/asr/results/`.

## Spike 2: Display OCR (`/ocr/`)

- Load photos (or capture from a webcam), drag to crop to the display, pick settings, then click Run OCR.
- Name files `thermo_36.7_01.jpg` or `oxi_98-76_01.jpg` (SpO₂-pulse) to get automatic scoring. The summary uses the latest attempt per image.
- Images are processed in memory and never saved.

## Spike 3: Offline PWA and storage (`/pwa/`)

Use the production build. The page shows:

- whether the service worker controls the page
- whether the app is installed
- `persist()` status and storage quota
- IndexedDB databases, including the Vosk model cache
- Cache Storage contents

Write synthetic rows, go offline (DevTools → Network → Offline), reload, and check the count. Download the report for FEASIBILITY.md.

## Automated smoke checks

`node spikes/scripts/smoke.mjs [out-dir]` renders synthetic 7-segment displays, runs OCR on them, and runs the offline storage and OCR checks in headless Chrome. It proves the pipelines run. It is not evidence about real device photos.
