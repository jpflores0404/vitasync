# AGENTS.md

Conventions for anyone (human or coding agent) working in this repo. Read [docs/PLAN.md](docs/PLAN.md) and [docs/DECISIONS.md](docs/DECISIONS.md) before making architectural changes.

## Commands

```sh
pnpm install
pnpm dev
pnpm build      # tsc -b && vite build — must pass before a PR
pnpm lint       # oxlint
```

Test commands (Vitest, Playwright) are added in Phase 3.

## Hard rules

- **Synthetic data only.** Never add real patient data, names from interviews, or private chart images to the repo. Spike audio never goes in git.
- **Never silently replace a value.** Every change to a measurement keeps its provenance: method, original candidate, parsed value, final value.
- **Confirmed records are immutable.** Changes go through amendments with a reason and an AuditEvent.
- **No clinical logic.** No diagnoses, recommendations or alert wording. Range flags say "verify", never "abnormal" or "critical".
- **No network calls with record data.** Only app assets and model files are fetched, from our own origin.
- **No generative models fill in values.** Parsing is deterministic.
- **Manual entry must always work** without a microphone, camera or downloaded model.

## Architecture boundaries

- `src/domain/` and `src/parsing/` are pure TypeScript: no React, no IndexedDB, no browser APIs. They hold most of the unit tests.
- Speech and OCR libraries are imported only in `src/adapters/`, behind the `SpeechEngine` and `OcrEngine` interfaces.
- Every input method produces `MeasurementCandidate`s and goes through the same draft, validation and confirmation pipeline.
- `spikes/` is throwaway code. Nothing in `src/` imports from it.
- Storage access goes through `src/storage/` repositories. Schema changes need a Dexie version bump and a migration.
- IDs are UUIDv7. Every persisted row has `createdAt`, `updatedAt` and the actor.

## Code style

- Strict TypeScript. Avoid `any`, and validate external data (imports, backups) with Zod.
- Measurements are `number | null`. Never use 0 or `''` to mean "not measured".
- Units are fixed per field: °C, mmHg, /min, %. Don't add unit conversion without a decision entry.
- Comments explain non-obvious reasons, not what the code does.
- Use shadcn components from `src/components/ui/`. Add new ones with `pnpm dlx shadcn@latest add <name>`.

## UI conventions

Follow the emil-design-engineering principles:

- `tabular-nums` for vital-sign values, and no layout shift as values change.
- Inputs 16 px or larger, tap targets at least 44 px, visible focus states.
- Full keyboard flow: Tab and Enter advance through fields; forms submit with Enter.
- Minimal animation. Never `transition: all`. Respect `prefers-reduced-motion`.
- Icon-only buttons need `aria-label`. Error text sits next to its field.
- Aim for WCAG 2.2 AA.

## Docs

- Record new architectural decisions in `docs/DECISIONS.md` (append; supersede rather than edit).
- Label requirements as **Confirmed**, **Proposed**, **Pending interview data**, or **Out of scope**.
- The compatibility matrix and feasibility results record only what was actually observed.
