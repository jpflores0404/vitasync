# VitaSync

An experimental, offline-first progressive web app for recording vital signs. Nurses can enter vitals by keyboard, by push-to-talk voice, or by photographing a digital instrument's display. Every value is reviewed and explicitly confirmed by a person.

> **Research prototype.** Not a medical device. Not for real patient data or official clinical documentation. Use synthetic data only.

## Status

Phase 0 (feasibility spikes) is in progress. See [docs/FEASIBILITY.md](docs/FEASIBILITY.md). See [docs/PLAN.md](docs/PLAN.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Quick start

Requires Node LTS and pnpm.

```sh
pnpm install
pnpm dev       # start the dev server
pnpm build     # typecheck and production build
pnpm lint      # oxlint
```

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | Goals, architecture, engine assessment, phases, acceptance criteria |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log |
| [docs/FEASIBILITY.md](docs/FEASIBILITY.md) | Phase 0 spike results: demonstrated vs unverified |
| [docs/PHRASE_SET.md](docs/PHRASE_SET.md) | Draft voice phrase set |
| [spikes/README.md](spikes/README.md) | How to run the spikes |
| [AGENTS.md](AGENTS.md) | Repository conventions for contributors and coding agents |

PRD, architecture, workflows, data model, privacy and safety, test plan and feasibility docs are added in Phases 0–1.
