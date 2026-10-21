# VitaSync — Project Plan

Status: **Approved for Phase 0–1** (2026-10-21). Feature implementation beyond scaffolding starts only after Phase 0 results are reviewed.

Phase 0 is **in progress**. Results so far are in [FEASIBILITY.md](FEASIBILITY.md), and the draft voice phrase set is in [PHRASE_SET.md](PHRASE_SET.md).

Each decision referenced as `D#` is recorded in [DECISIONS.md](DECISIONS.md).

Labels used throughout:

- **Confirmed** — settled by the team or verified from a primary source.
- **Proposed** — our best default, not yet validated with nurses or on devices.
- **Pending interview data** — waits on the interview materials in `docs/research/` (D12, D27).
- **Out of scope** — explicitly excluded from the MVP.

---

## 1. Goals and constraints

VitaSync is an experimental, offline-first, voice-assisted PWA for recording vital signs. It is built by two CS students for nursing collaborators in the Philippines. It may later be offered to other nurses or clinics (D1).

**Goal:** help nurses and nursing students capture, verify and organise five vital signs through three interchangeable input methods: optimised manual entry, push-to-talk voice and optional camera OCR. Every method feeds one shared validation and confirmation pipeline. A human explicitly confirms every record.

**Constraints**

- Supplements clinical work. No diagnosis, alerts, orders or medication features.
- Synthetic data only. The UI shows a permanent research-prototype banner (D9).
- Fully local processing. No audio, images or records leave the device.
- Free or near-free to run. No backend in the MVP (D17).
- Laptop first: Chrome or Edge on Windows. Android phones come in a later phase (D3).
- Manual entry must always work, even with no microphone, no camera and no speech model.
- No deadline. Quality and evaluability matter more than speed.

**Success principle:** VitaSync succeeds only if recording vitals becomes more reliable and efficient without disrupting how nurses already work.

---

## 2. Evaluation of the proposed architecture

The candidate stack in the master prompt holds up, with three adjustments:

| Area | Prompt proposal | Assessment |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind, shadcn/ui | **Keep.** Scaffolded with Vite 8, React 19, TS 6, Tailwind v4 and shadcn (Base UI, Nova preset). Geist is bundled locally, so it works offline. |
| PWA and storage | Vite PWA, Service Worker, IndexedDB, Dexie | **Keep.** vite-plugin-pwa (Workbox) for the app shell. Dexie 4 on IndexedDB. The voice model is cached separately with a versioned Cache Storage entry (D23). |
| Voice | Vosk + Vosk-Browser | **Adjust.** The original `vosk-browser` is abandoned. Use the maintained Lichess fork, compared against sherpa-onnx in the spike (D21). |
| Voice (alternative) | PaddleSpeech | **Drop.** It has no browser or offline-web path. |
| OCR | Tesseract.js | **Keep, with 7-segment trained data** (`ssd_int`). Stock English data reads LCD digits poorly (D24). |
| Validation | Zod | **Keep.** Used at the storage and import boundaries. Domain rules are plain TypeScript functions. |
| Testing | Vitest, RTL, Playwright | **Keep.** Playwright covers the offline and PWA paths. |
| Lint | — | Template's **oxlint** instead of ESLint, plus Prettier. |
| Backend | FastAPI/Node + PostgreSQL | **Not in the MVP.** The data model is sync-ready instead (D17). |
| Hosting | — | **Cloudflare Pages** (D25). |

---

## 3. Assessment of Vosk, PaddleSpeech and Vosk-Browser

Checked against primary sources on 2026-10-21.

### Vosk (alphacep/vosk-api)
- Actively developed. The last tagged release is v0.3.50 (2024-04). Apache-2.0.
- **No official browser/WASM build.** The `webjs/` folder is a stub.
- Its strength for us is **grammar-restricted recognition**: the recogniser can be limited to a closed word list. That fits our fixed phrase set (D4) exactly.
- Model: `vosk-model-small-en-us-0.15` is 40 MB, with 9.85% WER on LibriSpeech test-clean. There is no Filipino-English model. `small-en-in-0.4` (Indian English, 36 MB) is worth testing for accented speech, but its fit is unverified.

### Vosk-Browser
- **Original `ccoreilly/vosk-browser` is abandoned.** Last release 0.0.8 on 2022-12-25, with open, untriaged bug reports about models not loading.
- **Maintained fork:** `@lichess-org/vosk-browser`, 0.0.3 (2025-06). Lichess runs it in production for voice chess moves with a restricted vocabulary, which is a close analogue to our use.
- Runs single-threaded in a Web Worker. **No SharedArrayBuffer or COOP/COEP needed.** Supports grammar via `KaldiRecognizer(sampleRate, grammar)`.
- Risks: one maintainer organisation with its own priorities, an old audio pipeline (no AudioWorklet), and single-threaded speed on low-end phones. Mitigated by D22: pin the build, keep it behind an adapter, and vendor it once chosen.

### PaddleSpeech
- Python and server-oriented. `demos/speech_web` is a web client that talks to a Python server.
- Recent activity is mostly dependency bumps.
- **Not viable for in-browser offline recognition. Excluded.**

### Alternatives considered
- **sherpa-onnx** (k2-fsa): very active, Apache-2.0. WASM ASR has no pthreads, so no COOP/COEP needed. The English streaming zipformer is about 44 MB in int8. It supports **hotword biasing, not a hard grammar**. There's no prebuilt browser ASR package, so we would build it ourselves. It reserves 512 MB of WASM memory at startup, a possible problem on phones. **The comparison candidate in the spike.**
- **Whisper** (transformers.js / whisper.cpp): slow on CPU. whisper.cpp WASM needs COOP/COEP. Known to hallucinate text on short or silent clips, and has no vocabulary constraint. **Avoid for numeric dictation.**
- **Chrome on-device Web Speech** (`processLocally`, Chrome 139+; phrase biasing in Chrome 142+): offline after a language-pack download. **Not on Chrome Android.** Edge support unverified. A possible optional laptop engine later. Not the primary engine.

**Recommendation:** in Phase 0, compare Vosk (Lichess fork, grammar mode) against sherpa-onnx (hotwords) on the same recorded corpus. Expect to pick Vosk, because a hard grammar suits closed numeric vocabulary (D21).

---

## 4. Compatibility risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Filipino-accented English on a US-English small model | Misrecognised numbers ("fifteen" vs "fifty") | Grammar restriction. Spike corpus from the collaborators. Try the en-in model. Every value is reviewed before confirmation. |
| Built-in laptop mic, noisy rooms | Lower accuracy, inconsistent results | Headset as the controlled condition. Built-in mic tested as a separate condition (D14). |
| Single-threaded WASM ASR | Latency on weak CPUs | Measure release-to-result latency in the spike. Push-to-talk keeps clips short. |
| 40 MB model download | Slow first setup, storage use | Downloaded on demand when voice is enabled, with progress, from our own domain (D23). |
| Browser storage eviction | Lost records | `navigator.storage.persist()` with visible status, backup reminders, JSON backup and restore (D19, D26). |
| Lichess fork maintenance | Breakage on future Chrome versions | Pin the version, keep the adapter boundary, vendor the build (D22). |
| 7-segment OCR accuracy | Wrong or missing readings | `ssd_int` trained data, a digit whitelist, user cropping. Downgrade to "experimental" if accuracy is below the spike threshold (D24). |
| Webcam framing on laptops | Awkward capture | Image upload first, webcam second (D16). |
| Android (later phase) | RAM limits, no on-device Web Speech | Reference-phone testing before any mobile claims. |
| Safari/iOS | Not a target | Documented as untested. Manual entry should still work. |

---

## 5. Final MVP stack

| Layer | Choice |
| --- | --- |
| Build | Vite 8, TypeScript 6 (strict), pnpm, Node LTS |
| UI | React 19, Tailwind v4, shadcn/ui (Base UI, Nova), Lucide, Geist (bundled) |
| PWA | vite-plugin-pwa (Workbox), precached app shell |
| Storage | Dexie 4 on IndexedDB, with a versioned schema and migrations |
| Validation | Zod at the persistence and import boundaries; pure TS domain rules |
| IDs | UUIDv7, generated on the device |
| Voice | `@lichess-org/vosk-browser` + `vosk-model-small-en-us-0.15` in grammar mode, pending the spike (D21) |
| OCR | Tesseract.js 7 + `ssd_int` trained data, pending the spike (D24) |
| Tests | Vitest, React Testing Library, Playwright |
| Lint and format | oxlint, Prettier |
| CI | GitHub Actions: lint, typecheck, unit tests, Playwright |
| Hosting | Cloudflare Pages, which also serves the speech model (D25) |

Routing library and state approach are decided in Phase 2 once the screen count is known. The default leaning is the fewest dependencies possible.

---

## 6. High-level architecture

```
┌──────────────────────────── UI (React) ────────────────────────────┐
│ Patient search/quick-add · Vitals form · Review & confirm ·         │
│ History & audit · Settings/export · Observer mode (evaluation)      │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │ candidates                     │ commands
┌───────────────▼──────────────┐   ┌─────────────▼──────────────────────┐
│ Input adapters               │   │ Domain (pure TS, no React/IO)      │
│  manual  → candidates        │   │  VitalField, units, LOINC/UCUM     │
│  voice   → SpeechEngine      │──▶│  Draft reducer (apply candidates,  │
│            → phrase parser   │   │   undo, conflicts)                 │
│  camera  → OcrEngine         │   │  Validation (hard bounds, soft     │
│            → display mapper  │   │   ranges)                          │
└──────────────────────────────┘   │  Confirmation & amendment rules    │
                                   └─────────────┬──────────────────────┘
                                                 │
                                   ┌─────────────▼──────────────────────┐
                                   │ Storage (Dexie)                    │
                                   │  patients, encounters, drafts,     │
                                   │  records, provenance, auditEvents, │
                                   │  users, evaluationTrials           │
                                   └────────────────────────────────────┘
```

**Shared pipeline:** Input method → `MeasurementCandidate` → parsing and normalisation → Draft → validation → nurse review → confirmation → locked record (+ AuditEvent).

**Key interfaces** (defined on day one, the seam between Dev A and Dev B, D20):

```ts
type VitalField =
  | 'temperature' | 'systolic' | 'diastolic'
  | 'pulse' | 'respiratoryRate' | 'spo2'

type InputMethod = 'manual' | 'voice' | 'camera'

interface MeasurementCandidate {
  field: VitalField
  value: number | null          // null = heard/seen but unparseable
  method: InputMethod
  original: string              // transcript fragment, OCR text, or typed text
  issues: CandidateIssue[]      // e.g. conflict, incomplete-bp, out-of-bounds
}

interface SpeechEngine {
  load(onProgress: (p: number) => void): Promise<void>
  start(): Promise<void>        // push-to-talk pressed
  stop(): Promise<string>       // released → final transcript
  cancel(): void                // discard, release mic immediately
}

interface OcrEngine {
  recognize(image: ImageBitmap): Promise<OcrResult>
}
```

**Module layout** (proposed):

```
src/
  domain/        vital fields, units, validation, draft reducer — no React, no IO
  parsing/       voice phrase parser, OCR display mapper — pure, deterministic
  adapters/      speech/ (vosk, sherpa), ocr/ (tesseract) — implement the interfaces
  storage/       Dexie schema, migrations, repositories
  audit/         audit event creation and queries
  features/      patients/, charting/, history/, voice/, camera/, settings/, evaluation/
  components/ui/ shadcn components
  lib/           small shared utilities
spikes/          throwaway feasibility code, not imported by src/
```

### Data model summary
Full detail goes in `docs/DATA_MODEL.md` in Phase 1.

- **Patient**: id, display name, age or DOB, optional secondary ID. *Fields pending interview data.*
- **Encounter**: id, patientId, context (*pending*), startedAt. Created automatically when charting starts (D13).
- **Draft**: autosaved working copy of one chart row, with per-field current value and provenance (D31).
- **VitalSignsRecord**: one chart row (D5). Fields: `temperature` (Cel), `systolic` and `diastolic` (mm[Hg]), `pulse` (/min), `respiratoryRate` (/min), `spo2` (%), all nullable. Plus measuredAt, enteredAt, confirmedAt, status (`confirmed` | `amended`), and the actor.
- **FieldProvenance**: recordId, field, method, original candidate (transcript or OCR text), parsed value, final value, corrected flag.
- **Amendment / AuditEvent**: append-only. Action, recordId, actor, timestamp, before/after, reason (D6, D18).
- **User**: local tester profile (id, display name, role). No authentication (D8).
- **EvaluationTrial**: anonymous participant ID, condition, scenario set, reference, captured and final values, phase timings (capture, verification, correction, total), correction and error counts, device and mic metadata.

All rows carry UUIDv7 IDs, `createdAt`, `updatedAt` and the actor. The schema is versioned. Fields map to LOINC codes: 8310-5 temperature, 8480-6 systolic, 8462-4 diastolic, 8867-4 heart rate, 9279-1 respiratory rate, 59408-5 SpO₂ by pulse oximetry. This keeps a future FHIR Observation export simple (D17).

---

## 7. MVP feature boundaries and acceptance criteria

### In scope
1. Patient search and quick-add, with automatic encounter creation.
2. Manual vital-signs charting with keyboard-efficient entry.
3. Review and confirmation, records locked after confirmation, amendments with a required reason.
4. Per-record timeline and global audit log.
5. Push-to-talk voice entry with the fixed phrase set.
6. Camera-assisted entry for digital thermometers and pulse oximeters (image upload first). Experimental if the spike threshold isn't met.
7. Offline operation after install and model download.
8. Exports: records CSV, trials CSV, JSON backup and restore.
9. Observer mode and evaluation instrumentation.

### Out of scope
Everything in the master prompt's non-goals: EHR replacement, prescribing, doctors' orders, diagnosis, alerts, continuous monitoring, BP from analog cuffs, cloud processing, multi-site infrastructure, billing, real patient data. Also: authentication, encryption at rest, sync, Tagalog/Taglish recognition, PDF chart printing.

### Acceptance criteria

**Manual charting**
- All five vitals can be entered using only the keyboard, in the field order from the interview data. Tab and Enter move to the next field.
- Every field shows its label and unit. Empty fields stay empty: no zero or placeholder value is stored.
- A value outside the hard bounds blocks confirmation until it is edited or explicitly overridden with a stated reason.
- A value outside the soft range shows a neutral "outside typical range — verify" flag and never blocks.
- Confirmed records cannot be edited in place. An amendment records the before and after values, the reason, the actor and the time.
- Drafts survive a tab close or crash and can be resumed or discarded.

**Voice**
- Real microphone capture and real local recognition. No simulated output is presented as working.
- The microphone is active only while push-to-talk is held or toggled on, and a "mic live" indicator is always visible while it is.
- Esc cancels immediately and releases the microphone.
- Every supported phrase in the phrase-set spec parses correctly (unit tests).
- Re-dictating a field updates it visibly, with "was X (method) · Undo" (D28).
- Conflicting or incomplete phrases fill nothing and are flagged (D29).
- The transcript is shown and stored as provenance. Audio is never stored (D30).
- With the network disabled after the model download, recognition still works.
- Without a microphone or model, the voice UI explains why and manual entry still works.

**Camera**
- Accepts an uploaded image and webcam capture, with a crop step.
- A value is assigned to a field only when it is unambiguous. Otherwise candidates are shown for the nurse to choose.
- Images are not retained after recognition.
- Results are always editable. There is no automatic confirmation.

**Offline and storage**
- After installation and model download, a full cycle works with the network disabled: create patient, record by each method, confirm, view history, export.
- Settings shows offline readiness per feature (app, voice model, OCR data), persistent-storage status and the last backup date.
- A JSON backup restores into an empty profile with identical records and audit history.

**Evaluation**
- Observer mode times paper trials and captures the participant's paper values for scoring.
- In-app trials record capture, verification, correction and total time.
- The trials CSV contains no names, only anonymous participant IDs.

---

## 8. Workflow assumptions requiring nursing interview data

Interviews have been done, but the materials aren't in the repo yet (D27). Until they are added to `docs/research/` and summarised in `docs/WORKFLOWS.md`, these are **pending interview data**:

1. Mandatory patient identity fields and their format (name order, age or DOB, ID numbers).
2. Order of the vitals on the paper chart and the order they're taken in.
3. Whether temperature method (oral/axillary/tympanic) is recorded.
4. Encounter context values (clinic visit, mission, school check, simulation).
5. Time format on charts (12-hour or 24-hour) and whether measurement time is written separately from entry time.
6. Individual vs team documentation, and how charts are handed over.
7. Common recording errors seen in practice.
8. Comfort with dictating aloud near patients, and acceptable phrase wording.
9. Language used on charts (assumed English, D10).
10. How vitals relate to doctors' orders: documented only, never implemented.
11. Plausibility ranges: our drafted defaults need collaborator sign-off (D7).

---

## 9. Phased implementation plan

Each phase ends with a short review before the next one starts.

| Phase | Owner | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| **0 — Feasibility spikes** | B (ASR, OCR), A (PWA) | `spikes/asr`, `spikes/ocr`, `spikes/pwa`, `docs/FEASIBILITY.md` | Engine decision made with data. OCR go/experimental decision. Offline storage proven. |
| **1 — Requirements and docs** | A + B | PRD, personas, WORKFLOWS (from interview data), feature matrix, DATA_MODEL, PRIVACY_AND_SAFETY, TEST_PLAN (incl. consent template), phrase-set spec, plausibility defaults | Collaborators reviewed workflows, phrase set and ranges |
| **2 — UI/UX** | A | App shell, patient search/quick-add, vitals form, review, history layouts. Voice and camera interaction patterns as static states. | Walkthrough with collaborators; keyboard-only pass; contrast and focus check |
| **3 — Core functionality** | A | Domain model, Dexie storage, manual charting, validation, confirmation, amendments, audit, drafts, exports, PWA shell | Acceptance criteria for manual, offline and storage met; unit and E2E tests green |
| **4 — Voice** | B | Phrase parser (test-first), chosen SpeechEngine adapter, push-to-talk, model download and caching, field mapping, undo and conflicts | Voice acceptance criteria met, including offline |
| **5 — Camera** | B | Upload and webcam capture, crop, preprocessing, OcrEngine adapter, display mapper | Camera acceptance criteria met, or documented downgrade to experimental |
| **6 — Evaluation readiness** | A + B | Scenario fixture, observer mode, trial timing, error scoring, trials CSV, facilitator instructions, compatibility matrix | Dry run with one developer acting as participant |
| **7 — Refinement** | A + B | Fixes ranked by accuracy, usability, reliability, accessibility | Results written up honestly, including failures |

The parser (Phase 4) is pure TypeScript and can start alongside Phase 2–3, since it depends only on the phrase-set spec.

---

## 10. First feasibility experiments (Phase 0)

### Spike 1 — Speech recognition (Dev B)
- **Corpus:** each collaborator reads about 15 scripted phrases with synthetic numbers: single vitals, combined dictation, decimals, similar numbers (13/30, 15/50, 16/60), an incomplete BP and a repeated field. Recorded on a USB headset and on a built-in laptop mic, in quiet and with background chatter. Consent first (D33). Audio stays out of git (D34).
- **Engines:** Vosk (Lichess fork) with the grammar, on en-us-0.15 and en-in-0.4; sherpa-onnx with hotwords.
- **Scoring:** a shared prototype parser extracts the fields. Measure **field extraction accuracy** (per vital), word error rate for reference, release-to-result latency, model load time from cache, and memory.
- **Also verify:** real live-mic capture in Chrome and Edge on Windows; recognition with the network disabled after model caching; the microphone is released after stop.
- **Proposed targets** (revisit after the first results): ≥ 90% field accuracy on headset and quiet; ≤ 1.5 s from release to parsed result; works fully offline.

### Spike 2 — OCR on digital displays (Dev B)
- About 20 photos of real thermometer and pulse-oximeter screens, under varied lighting, angles and devices.
- Tesseract.js 7 with `ssd_int`, a digit and decimal whitelist, and grayscale, threshold and crop preprocessing.
- Measure correct-value rate after the user crops, and processing time.
- **Threshold:** at least 2 of every 3 displays read correctly, or the camera feature becomes "experimental" (D24).

### Spike 3 — Offline PWA storage (Dev A)
- Install the PWA from Cloudflare Pages in Chrome and Edge. Go offline and reload. Write and read IndexedDB offline. Cache a 40 MB file and confirm it survives a browser restart. Record the `persist()` result before and after install.

Results go in `docs/FEASIBILITY.md`, split into demonstrated, partially demonstrated and unverified.

---

## 11. Privacy, security and testing requirements

**Privacy and safety**
- Synthetic data only. A permanent prototype banner. Real data needs a separate ethics, privacy and supervision protocol.
- Push-to-talk only. No background listening. A visible "mic live" indicator, Esc to cancel, and the microphone released immediately.
- No audio or image retention. Transcripts are stored only as provenance (D30).
- The fixed grammar can't transcribe names or free speech, which limits accidental capture.
- No network calls carrying record data. The only network fetches are app assets and model files from our own domain.
- No diagnoses, recommendations or alert wording. Soft-range flags say "verify", never "abnormal" or "critical".
- Known open risks for any real-data use: no encryption at rest, no authentication on shared devices, browser eviction, device loss, people nearby overhearing dictation. All documented in `PRIVACY_AND_SAFETY.md`.
- Spike recordings: consent, private storage, deletion after the engine decision (D33, D34).

**Testing**
- **Unit (Vitest):** normalisation, validation bounds, draft reducer (apply, undo, conflict), phrase parser (every phrase-set case, decimals, BP forms, incomplete and conflicting input), OCR mapper, amendment rules, CSV and JSON export, backup round-trip.
- **Component (RTL):** form keyboard flow, error text, review and confirm, amendment dialog.
- **E2E (Playwright):** full manual flow, offline reload and record cycle, persistence across reload, export and restore. The voice adapter is replaced with a fake engine in E2E, clearly labelled. Real recognition is verified manually and recorded in the compatibility matrix.
- **Compatibility matrix**, filled with observed results only: mic access, speech recognition, camera, OCR, offline operation, model caching, storage persistence × Chrome/Edge on Windows (and Android Chrome later).
- **Accessibility:** WCAG 2.2 AA where practicable. Keyboard-only pass, visible focus, contrast, 44 px targets, clear error text.

---

## 12. Confirmed capabilities vs assumptions

| Item | Status |
| --- | --- |
| Vite + React + TS + Tailwind v4 + shadcn scaffold builds | **Confirmed** (in repo) |
| Vosk Lichess fork exists, is maintained, supports grammar, needs no COOP/COEP | **Confirmed** from sources; **not yet run by us** |
| Vosk recognises Filipino-accented numeric phrases accurately | **Assumption.** Spike 1. |
| sherpa-onnx WASM works for our use | **Assumption.** Spike 1. |
| 40 MB model caches and works offline in a PWA | **Assumption.** Spikes 1 and 3. |
| Tesseract `ssd_int` reads our devices' displays | **Assumption.** Spike 2. |
| `persist()` granted for an installed PWA | **Assumption.** Spike 3. |
| PaddleSpeech unusable in the browser | **Confirmed** from sources |
| Chrome on-device Web Speech not on Android | **Confirmed** from MDN compatibility data |
| Chart layout, identity fields, field order | **Pending interview data** |
| Plausibility ranges | **Proposed.** Collaborator sign-off needed. |
| Voice or camera faster than manual or paper | **Unknown.** This is what the study measures. |
