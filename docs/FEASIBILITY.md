# Feasibility report — Phase 0

Status: **In progress.** The automated runs below were done on 2026-10-21. The human-dependent runs (real voices, real device photos, Windows laptops) haven't started.

Results are labelled:

- **Demonstrated**: we ran it and observed the result.
- **Partial**: ran under limited conditions that don't yet match the target.
- **Unverified**: not yet run.

Raw outputs: `spikes/asr/results/2026-10-21-tts/`, `spikes/results/2026-10-21-smoke-report.json`.

Test environment for every automated run below: macOS 26.2, Apple M4, Chrome 155 (headless, via Playwright), served from `vite preview` (localhost).

**This is not the target environment.** The target is Chrome and Edge on Windows laptops (D3).

## Summary

| Capability | Status | Evidence |
| --- | --- | --- |
| Vosk WASM (Lichess fork) loads and recognises speech in Chrome | **Demonstrated** | 51 text-to-speech clips × 8 configurations |
| Grammar-restricted recognition improves field accuracy | **Demonstrated** (synthetic voices) | en-us: 96.3% with grammar vs 56.8% without |
| Recognition works with the network disabled after the first model load | **Demonstrated** | Offline run: model loaded from IndexedDB in 321 ms, same 96.3% |
| Speed fast enough for push-to-talk | **Partial** | Real-time factor 0.08–0.10 with grammar on an M4. Windows laptop CPUs unmeasured. |
| Accuracy on Filipino-accented English | **Unverified** | Needs the recorded corpus from P1–P3 |
| Live microphone capture, push-to-talk, mic release | **Unverified** | Built in the spike page; needs a person at a laptop with a mic |
| sherpa-onnx comparison (D21) | **Unverified** | Not started; needs a WASM build |
| Tesseract.js runs offline with self-hosted assets | **Demonstrated** | Same OCR result online and offline after the first use |
| Tesseract reads 7-segment displays well enough | **Early negative signal** | 2/6 exact on clean synthetic renders (best setting). Real photos untested. |
| PWA shell works offline (service worker) | **Demonstrated** | Pages reload offline from the precache |
| IndexedDB (Dexie) writes and reads offline, survives reload | **Demonstrated** | 500 rows written in 48 ms, read in 32 ms. Offline writes persisted. |
| `navigator.storage.persist()` granted | **Unverified** | `false` in headless Chrome, as expected. Needs an installed PWA on Windows. |
| Windows Chrome/Edge, PWA install | **Unverified** | Needs Windows hardware |
| Cloudflare Pages hosting (D25) | **Unverified** | Not deployed; needs a Cloudflare account |

## Spike 1: Speech recognition

### What was run
- **Clips:** 17 scripted phrases (`spikes/asr/phrases.ts`), spoken by three macOS text-to-speech voices: Eddy (en-US), Daniel (en-GB) and Aman (en-IN). 51 clips, 16 kHz mono.
- **Scoring:** the production parser (`src/parsing/voicePhrase.ts`) plus field-level scoring (`spikes/asr/score.ts`). A field counts as correct only if the exact value lands in the right field. For the two "should be flagged" phrases (p16, p17), it counts as correct only if the field is left empty and flagged.
- **Configurations:** model (en-us-0.15 / en-in-0.4) × grammar (full / without single letters / off) × lead-in silence (none / 0.5 s).

**TTS voices are not people.** These numbers show the pipeline works and allow configurations to be compared with each other. They say nothing about real accuracy for Filipino speakers.

### Results (field accuracy · wrong values · missed)

| Model | Grammar | No lead-in | 0.5 s lead-in |
| --- | --- | --- | --- |
| en-us-0.15 | full | 84.0% · 3 · 10 | **96.3% · 1 · 2** |
| en-us-0.15 | no single letters | 84.0% · 3 · 10 | 96.3% · 1 · 2 |
| en-us-0.15 | off | 56.8% · 0 · 35 | 56.8% · 2 · 33 |
| en-in-0.4 | full | 64.2% · 6 · 23 | 69.1% · 7 · 18 |
| en-in-0.4 | no single letters | 61.7% · 2 · 29 | 61.7% · 3 · 28 |
| en-in-0.4 | off | 44.4% · 2 · 43 | 56.8% · 0 · 35 |

- Real-time factor (processing time ÷ audio length): 0.07–0.10 with grammar, 0.22–0.28 without.
- Model load: 0.5–1.5 s once cached. The first load includes the download.

### Findings
1. **Restricting the grammar is the biggest single gain.** It raised en-us from about 57% to 96% and made decoding about 3× faster. This supports D4 (fixed phrase set).
2. **The first short keyword gets clipped when speech starts at the first audio sample.** "Pulse 76" was recognised as "oh seventy six". Adding 0.5 s of leading silence fixes most of these cases. **Implications for Phase 4:**
   - Start capturing audio the moment push-to-talk is pressed.
   - Keep a short pre-roll.
   - Coach users to pause briefly after pressing.
3. **A lost keyword can hide a conflict.** "Pulse 72, pulse 80" with the first "pulse" lost gave pulse = 80 with no conflict flag. The "72" only appeared under "Unrecognized". **Implications for Phase 4:** the UI must show unlabelled numbers as a visible warning, not a footnote.
4. **en-in-0.4 was much worse for non-Indian voices.** It often swapped number words for the single letters in our grammar: "thirty six point seven" became "c six point seven", read as 6.7. Removing single letters reduced wrong values (7 → 3) but increased misses (18 → 28). Whether letter-spelled synonyms ("b p", "h r", "c r") are worth keeping is a question for the real corpus.
5. **These words aren't in the model vocabulary,** so Vosk ignores them in the grammar: `bp, bpm, o2, oximetry, resp, respirations, sats`. Spelled forms ("b p", "o two") are in the vocabulary.
6. **Parser bug found and fixed:** "ninety" misheard as "nine zero" was read as 900. "Nine zero" without a third digit is now flagged instead (regression test added).

### Still to do (Dev B)
- [ ] Consent forms signed (D33).
- [ ] Record P1–P3 with the spike's recorder: 17 phrases × headset/built-in mic × quiet/chatter, on the Windows evaluation laptop.
- [ ] Batch-score all model and grammar variants with `spikes/scripts/asr-batch.mjs`.
- [ ] Live push-to-talk in Chrome **and** Edge on Windows: release-to-result latency, mic indicator, Esc cancels, the mic released after stop.
- [ ] sherpa-onnx (hotwords) on the same corpus.
- [ ] Engine decision against the targets in PLAN §10: ≥ 90% field accuracy (headset, quiet), ≤ 1.5 s latency, offline.

## Spike 2: Display OCR

### What was run
- Six synthetic seven-segment renders: three LCD-style thermometer readings (36.7, 38.5, 37.0) and three LED-style oximeter readings (98, 76, 100).
- Tesseract.js 7 with `ssd_int` and stock `eng`, digit whitelist, single-line layout, Otsu threshold, automatic inversion, with and without gap closing (dilation).

| Trained data | Gap closing | Exact | Reads |
| --- | --- | --- | --- |
| ssd_int | off | 0/6 | mostly empty |
| ssd_int | on | **2/6** | 36.7→36.1, 38.5 ✓, 37.0→370, 98→39, 76→16, 100 ✓ |
| eng | off | 0/6 | mostly empty |
| eng | on | 0/6 | 36.7→36.1, 38.5→385, 76→16 |

### Findings
1. **OCR runs fully offline** after the first use, with the self-hosted worker, core and trained data (cached at runtime by the service worker).
2. **Accuracy is poor even on clean, perfectly aligned digits.** Two errors repeat: 7 read as 1, and the decimal point dropped. Without gap closing, the gaps between segments make Tesseract return nothing.
3. This is an **early warning for D24**, not a verdict. Real photos may be better or worse. If ~20 real photos also fall below 2/3 exact after cropping, camera input becomes "experimental" as agreed. The cheap alternative to try before giving up is segment sampling: read each digit by checking which of its seven segment positions are lit, as ssocr does. That's written from scratch, not a dependency.

### Still to do (Dev B)
- [ ] About 20 photos of real thermometer and pulse-oximeter screens, named `thermo_36.7_01.jpg` / `oxi_98-76_01.jpg`.
- [ ] Crop and score each in the OCR spike page. Record the best settings.
- [ ] If below threshold: a half-day prototype of segment sampling before the D24 decision.

## Spike 3: Offline PWA and storage

### What was run
- Production build of the spike site (vite-plugin-pwa, Workbox precache with 16 entries).
- Wrote 500 synthetic chart rows with Dexie.
- Went offline, reloaded, read the rows back, wrote 500 more offline.

### Results
- Writing 500 rows took 48 ms; reading them took 32 ms, both online and offline.
- After the offline reload, the service worker controls the page and all 500 rows are present. Offline writes persisted (1000 rows).
- The Vosk model is stored by the library itself in IndexedDB (database `/vosk`), so it is subject to the same eviction rules as records. Keep that in mind for D26.
- `persist()` was `false` in headless Chrome. The real test is an installed PWA on Windows.

### Still to do (Dev A)
- [ ] Deploy the spike build to Cloudflare Pages (or test via `pnpm spike:preview` on the Windows laptop).
- [ ] Install as a PWA in Chrome and Edge on Windows. Record the `persist()` result before and after installing.
- [ ] Cache the 40 MB model, restart the browser, go offline, and confirm recognition still works.
