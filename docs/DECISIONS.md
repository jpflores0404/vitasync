# Decisions

Settled during planning on 2026-10-21. Append new decisions at the end. When a decision changes, add a new entry that supersedes the old one instead of editing it.

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | Two CS students build it for nursing collaborators. No deadline. It may be offered to other nurses or clinics later. | Sets scope: quality over speed, and keep future use possible. |
| D2 | Interviews are done. The MVP scope is the master prompt's. | Avoid scope creep before the core works. |
| D3 | Laptop first: Chrome or Edge on Windows. A reference Android phone in a later phase. | The collaborators' first prototype context. Fewer device variables. |
| D4 | Voice uses a fixed phrase set with generous synonyms, not free speech. | Lets the engine use a closed grammar, the biggest accuracy gain for small offline models. |
| D5 | One VitalSignsRecord = one chart row, all five fields optional, per-field provenance. A retake is a new record. | Matches paper charts. Maps cleanly to FHIR Observations later. |
| D6 | Records are locked after confirmation. Corrections are amendments with a required reason, shown in logs. | Traceability. Never silently replace values. |
| D7 | Hard bounds block confirmation until the value is edited or overridden. Soft ranges show a neutral "verify" flag. Defaults are cited and signed off by the collaborators. | Catch typos without acting as clinical alerting. |
| D8 | No real authentication. A local tester profile picker sets the actor. | Synthetic data only, so login protects nothing yet. |
| D9 | No encryption at rest in the MVP. Synthetic data only, with a permanent prototype banner. | Key-loss and recovery complexity doesn't help the study. Required before any real-data use. |
| D10 | English UI, with strings in one module. | Charts in PH clinical settings are typically in English. Translation stays possible. |
| D11 | Observer mode times paper trials and captures paper results for scoring. | All four conditions produce the same trial data. |
| D12 | Interview notes and blank or de-identified charts go in `docs/research/`. | Requirements can be marked as confirmed. |
| D13 | One screen for patient search and quick-add. The encounter is created automatically when charting starts. | Fewer clicks during long queues. |
| D14 | A USB headset is the controlled mic condition. The built-in mic is a separate, labelled condition. | Measure the method, not the microphone. |
| D15 | Push-to-talk by holding a key, plus an on-screen toggle. Esc cancels. A "mic live" indicator. | Works with keyboard and mouse. Clear privacy state. |
| D16 | Camera: image upload first, webcam second. Live phone camera in the mobile phase. | Webcam framing on laptops is awkward. |
| D17 | Sync-ready, no backend: UUIDv7 IDs, timestamps and actor on every row, append-only audit log, versioned schema, LOINC/UCUM-shaped fields. | Each costs about a line of code now, versus data migrations later. |
| D18 | Logs = a per-record timeline plus a global audit log screen, both from one AuditEvent store. | Supports both review and evaluation. |
| D19 | Exports: records CSV, trials CSV, JSON backup and restore. A "last backup" reminder. | Defence against browser storage loss. Analysis-friendly. |
| D20 | Dev A: shell, data, storage, manual, review, history, export. Dev B: spikes, parser, voice and OCR adapters. The shared `MeasurementCandidate → Draft` interface is defined on day one. GitHub with PR reviews and CI. | Parallel work with one clear seam. |
| D21 | Speech: spike Vosk (Lichess fork, grammar) against sherpa-onnx (hotwords), scored on field extraction accuracy. Vosk expected. PaddleSpeech and Whisper excluded. Chrome on-device Web Speech is an optional later laptop engine. | Original vosk-browser is abandoned. A grammar suits closed numeric vocabulary. |
| D22 | Use the npm package during the spike. Vendor the pinned WASM build if adopted. The engine sits behind the `SpeechEngine` interface. | One-organisation fork, so limit the blast radius of changes. |
| D23 | The speech model downloads when voice is first enabled, with progress and status, from our own domain. | Manual entry never waits for 40 MB. No third-party CDN. |
| D24 | OCR: Tesseract.js + `ssd_int`, digit whitelist, preprocessing, user crop. Below about 2/3 correct on ~20 real photos, camera becomes "experimental". Avoid GPL `letsgodigital`. | Stock Tesseract reads 7-segment digits poorly. Don't sink weeks into custom models. |
| D25 | Host on Cloudflare Pages, which also serves the model. | Custom headers if ever needed, preview links per PR, free. |
| D26 | Request `navigator.storage.persist()` after install and show the status in Settings. | Reduce eviction risk and make it visible. |
| D27 | The plan proceeds now. Interview-dependent parts are marked "pending interview data". | Phase 0 and domain work don't depend on them. |
| D28 | Re-dictating a filled field replaces it visibly, with "was X (method) · Undo". Both values go in provenance. | Not silent, one keystroke to reverse, no confirmation dialog. |
| D29 | Conflicting or incomplete values in one utterance fill nothing and are flagged with one-tap choices. Unassignable text is shown as "Unrecognized". | Never guess. |
| D30 | The transcript is shown live and stored as the original candidate in provenance. Raw audio is never stored. | The grammar can't capture names. Separates "heard wrong" from "parsed wrong". |
| D31 | Drafts autosave to IndexedDB with Resume or Discard. They never appear in exports as confirmed data. | Survive crashes and interruptions. |
| D32 | Printed scenario cards. Four matched scenario sets. Latin-square order of conditions and sets. The scenarios ship as a JSON fixture. | Controls for task order and difficulty. Reference values come from one source. |
| D33 | One-page informed consent, plus an adviser check on whether ethics review is needed. Template goes in TEST_PLAN. | Participants are people, and voice is personal data. |
| D34 | Spike recordings stay out of git, in private storage, and are deleted after the engine decision unless consent covers longer use. | Minimise retained personal data. |
| D35 | Private repo now. Apache-2.0 when public. | Matches dependency licences. Keeps interview material private. |
| D36 | Write PLAN, DECISIONS, README and AGENTS now. The remaining docs come in Phase 1. | Docs before feature code. |
| D37 | Scaffold: Vite 8, React 19, TS 6, Tailwind v4, shadcn (Base UI, Nova preset), oxlint from the template. UI work follows the emil-design-engineering principles. | Template defaults over custom setup. Fonts bundled for offline use. |
