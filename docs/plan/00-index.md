# Kyro — Planning Documentation Index

**Kyro** is a personal, single-user workout tracker for iPhone — a feature-complete clone of Hevy's tracking core (no social, no integrations, no paywall) built with React Native + Expo (TypeScript), local-first data with cloud persistence of saved data to an owner-controlled Supabase project (D9, doc 12), and a green/teal design language. This folder is the complete product requirements documentation (PRD), split into focused documents.

Status: **Planning complete — ready for M0 implementation.** No app code exists yet.

---

## How to read this PRD

- **Implementing a feature?** Read the relevant feature spec (02–04) plus `05` (data model) and `07` (design system). Every spec is written to be implementable without access to Hevy. Cloud sync: `12` plus the marked additions in `05`.
- **Setting up the project?** Read `06` (architecture) and `09` (milestones) first.
- **Sources of truth:** `05-data-model-and-storage.md` is authoritative for entity names, enums, units, and schemas. `07-design-system.md` is authoritative for color tokens, typography, and spacing. Other docs reference these; if a conflict is found, 05/07 win and the other doc has a bug.
- **Why decisions were made:** the research appendix (`research/hevy-deep-dive.md`) is the ground-truth analysis of Hevy that this PRD derives from. Confidence-flagged items there were resolved into explicit decisions here (see the decisions log below).

## Documents

| Doc | Contents |
|---|---|
| [00-index.md](00-index.md) | This file — index, reading guide, binding decisions log. |
| [01-vision-and-scope.md](01-vision-and-scope.md) | Product vision, target user, goals, explicit non-goals, success criteria. |
| [02-feature-spec-workout-logging.md](02-feature-spec-workout-logging.md) | The core loop: active workout screen, set rows per exercise type, set types, RPE, previous-value autofill, rest timers + notifications, supersets, notes, minimize/resume + crash persistence, finish flow, editing past workouts, plate & warm-up calculators. |
| [03-feature-spec-exercise-library.md](03-feature-spec-exercise-library.md) | Exercise library: browse/search/filter, exercise detail page, custom exercise CRUD, bundled free-exercise-db dataset (license, field mapping, import pipeline), GIF roadmap. |
| [04-feature-spec-routines-history-stats.md](04-feature-spec-routines-history-stats.md) | Routines + folders, start-workout + update-routine flows, history list + calendar, statistics dashboard, per-exercise charts, PR system, body measurements + progress photos. |
| [05-data-model-and-storage.md](05-data-model-and-storage.md) | **Source of truth for data.** SQLite DDL, enums, indexes, canonical units + conversion, repository interfaces, migrations, CSV export/import spec (Hevy-compatible), photo storage, backup. |
| [06-architecture.md](06-architecture.md) | Expo SDK 56, project structure, expo-router navigation map, Zustand + TanStack Query state, timers/notifications/keep-awake, Victory Native charts, performance, error handling. |
| [07-design-system.md](07-design-system.md) | **Source of truth for design.** Green/teal token palette (dark + light hex), typography, spacing, iconography, component inventory, chart styling, motion/haptics, accessibility. |
| [08-testing-and-quality.md](08-testing-and-quality.md) | Test pyramid, tooling (Jest + RNTL, SQLite integration tests, Maestro E2E), concrete test cases for risky logic, coverage targets, CI, manual QA checklists, definition of done. |
| [09-milestones-and-delivery.md](09-milestones-and-delivery.md) | Phased build plan M0–M5, MC (cloud sync), M6–M7 with scope, exit criteria, and test gates. |
| [10-app-store-launch.md](10-app-store-launch.md) | Apple Developer setup, EAS Build/Submit, TestFlight, App Store review notes, privacy nutrition label, assets, versioning, Sentry, EAS Update. |
| [11-future-roadmap.md](11-future-roadmap.md) | Deferred work: GIF sourcing, sync extensions (photo backup, second device), Apple Health, Apple Watch, Android, widgets/Live Activities. |
| [12-cloud-sync.md](12-cloud-sync.md) | Cloud sync (Supabase): outbox push of saved data, watermark pull/restore, tombstones, auth, offline semantics, env/stub strategy, sync testing. |
| [research/hevy-deep-dive.md](research/hevy-deep-dive.md) | **Appendix.** Ground-truth research on Hevy (features, API data model, CSV schema, UX details). Do not edit; historical input. |
| [research/cloud-provider-research.md](research/cloud-provider-research.md) | **Appendix.** Cloud-backend provider comparison and Supabase sync architecture rationale behind D9 / doc 12. Do not edit; historical input. |

---

## Tasks

The executable task breakdown lives in [tasks/](tasks/):

- [tasks/TASKS-INDEX.md](tasks/TASKS-INDEX.md) — task system, ID scheme, status legend, dependency overview, 08-test-case coverage map, and PRD gaps found during decomposition.
- `tasks/M0-tasks.md` … `tasks/M7-tasks.md` — one file per milestone, matching `09-milestones-and-delivery.md`.
- [tasks/M-CLOUD-tasks.md](tasks/M-CLOUD-tasks.md) — cloud-sync milestone MC (doc 12), `MC-` ID space; 103 dev tasks total across all files.
- [tasks/OWNER-TASKS.md](tasks/OWNER-TASKS.md) — everything the owner must personally do (accounts, decisions, device testing). Owner tasks gate only distribution (TestFlight/App Store) and production-credential wiring (Supabase, O-13/O-14); all development and simulator/local-build testing proceeds without them.

---

## Binding decisions log

Decisions made by the owner (binding, do not relitigate):

| # | Decision |
|---|---|
| D1 | Name: **Kyro**. Personal single-user app, but planned through full App Store launch (TestFlight + submission). |
| D2 | React Native + **Expo SDK 56** (TypeScript), iPhone-first. Android later; keep code portable but plan no Android work. |
| D3 | Local SQLite is the **single read model** — the UI never reads from the network. Data access sits behind a repository interface. *(Original "local-only v1" clause amended by D9: saved data now also pushes to the cloud in v1.)* |
| D4 | **No social features. No third-party integrations** (Strava, Apple Health, AI) in v1. Everything Hevy gates behind Pro is free. |
| D5 | Full workout feature set: all 4 set types, all 8 exercise types + custom_metric, RPE (6–10 in 0.5 steps), supersets, rest timers with notifications, plate calculator, warm-up calculator, routines + folders, history + calendar, statistics + per-exercise charts, PRs with live banner, body measurements + progress photos, all 12 workout settings. |
| D6 | Exercise library is a headline feature: bundle **free-exercise-db** (Unlicense/public domain, 800+ exercises, JPG image pairs). GIF/animation slot designed now with graceful placeholder; animated media sourced in a later milestone. Custom exercises are first-class and UX-indistinguishable from built-ins. |
| D7 | Design: Hevy's layout quality and UX patterns, different look — **emerald/teal accent, dark-first with full light theme**. Single-accent discipline. |
| D8 | Quality bar: unit + integration + E2E testing (Jest + RNTL, SQLite repo integration tests, Maestro), coverage targets per `08`, iterate until bug-free before App Store submission. |
| D9 | Cloud persistence of **saved** user data is in v1 via **Supabase** (rationale: `research/cloud-provider-research.md`; spec: `12`). In-progress workout stays local; on save → push via `sync_outbox` journal (idempotent UUID upserts); watermark pull on cold start for reinstall/second device; last-write-wins + `deleted_at` tombstones; single Auth user, authenticated-only RLS; free tier; all dev/CI against `supabase start` + a no-op stub — owner setup (~10 min: account, project, auth user, URL + anon key into EAS secrets) gates production builds only. Photos: cloud backup optional/later. |

Decisions made during planning (resolving research §5 open items and stack choices):

| # | Decision | Where specified |
|---|---|---|
| P1 | Storage: **expo-sqlite + Drizzle ORM**, bundled Drizzle migrations. | 05, 06 |
| P2 | Navigation: **expo-router** (file-based, typed routes). 4 tabs: Workout, History, Exercises, Profile. | 06 |
| P3 | State: **Zustand** for active workout/timers/settings + **TanStack Query** for repository reads. Active workout persisted to SQLite on every mutation (workouts table with `state='active'`). | 06 |
| P4 | Charts: **Victory Native (XL)** on Skia + Reanimated. | 06, 07 |
| P5 | Estimated 1RM: **Epley** — `1RM = weight × (1 + reps/30)`, only for sets with 1 ≤ reps ≤ 10; reps = 1 uses actual weight. | 04, 05 |
| P6 | Checked set with empty inputs **commits the placeholder (previous/target) values** — fastest logging path. | 02 |
| P7 | Volume math: `weight_reps`/`weight_duration`/`short_distance_weight` count `weight × reps` (duration/distance types count weight-bearing work only where reps exist); `bodyweight_reps` counts **added weight × reps**; `bodyweight_assisted_reps`, `reps_only`, `duration`, `distance_duration` contribute **0** to volume. | 04, 05 |
| P8 | Default warm-up calculator formula: empty bar × 10, 40% × 8, 60% × 5, 80% × 3 (editable; "Reset to Default" restores this). | 02 |
| P9 | Unchecked sets are **discarded on finish** after a confirm dialog (matches Hevy). | 02 |
| P10 | PRs are **derived data** — computed from workout history via queries, never stored as immutable events; editing/deleting history recomputes. Session-level cache only. | 04, 05 |
| P11 | CSV export matches Hevy's 14-column schema exactly (including unit-dependent headers); import accepts Hevy CSV in kg or lbs variants. | 05 |
| P12 | Built-in exercise IDs = free-exercise-db slug IDs (stable strings); custom exercises get UUIDs. | 03, 05 |
| P13 | Crash monitoring: **Sentry** (`@sentry/react-native` via Expo config plugin). OTA updates via **EAS Update**. | 06, 10 |
| P14 | Live Activity / Dynamic Island for rest timer: **stretch goal, not v1** — local notifications + in-app pill are the v1 rest-timer surface. | 02, 11 |

## Open items (tracked, not blockers)

- Apple Developer account enrollment + final bundle identifier (placeholder `com.tejitpabari.kyro`) — needed by M6. See `10`.
- Animated exercise media source (GIF pack) — deferred by design; options evaluated in `03` §7 and `11`.
- Exercise-type classification for ~800 imported exercises uses heuristics + a manual override file; expect a curation pass during M1 (see `03` §6).
