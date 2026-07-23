# 09 — Milestones & Delivery Plan

Phased plan sequenced for a solo developer + AI coding agents: vertical slices, each milestone ends with a working app, a test gate (`08`), and a tagged build. Estimates are calendar-loose (personal project); order and gates are the contract, not dates.

Dependency spine: **M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7**. M3 and M4 can partially overlap; nothing else should.

---

## M0 — Scaffold & design system

**Scope**
- Repo init: Expo SDK 56 TS template, expo-router, ESLint/Prettier/strict tsc, import-boundary rules, pnpm, folder structure per `06` §2.
- CI PR workflow live from day one (`08` §9).
- Design system: `tokens.ts` (full `07` §2–4), theme provider (system/light/dark), core primitives: Button, Card, ListRow, Sheet, SegmentedControl, Chip, SearchBar, StatColumn, NumericInput, EmptyState, Snackbar.
- Tab shell with 4 placeholder screens; Storybook-style dev gallery screen for primitives (dev-only route).
- SQLite + Drizzle wired: migrations runner, `app_meta`, `settings` table + SettingsRepository + settingsStore; theme + units settings functional end-to-end.
- Sentry integrated (dev DSN), error boundaries, `lib/logger.ts`.

**Exit criteria / test gate**
- App boots to tabs < 1.5 s; theme switching works app-wide.
- Token contrast test green (`08` §4.8); primitives have RNTL smoke tests in both themes.
- Migration runner integration-tested (empty → v1 schema); CI green with coverage plumbing (thresholds active, trivially met).

## M1 — Exercise library & data layer core

**Scope**
- Full schema migration v1 (`05` §3 complete DDL — all tables land now, even if UI comes later).
- Dataset pipeline: vendor free-exercise-db, `build-exercise-db.ts`, curation overrides, seed migration (`03` §6.4); **curation pass** over `curation-report.md` + 20-lift spot-check.
- ExerciseRepository complete + integration suite.
- Exercises tab: browse, search, filters, A–Z index, recents (stub until M2 data), detail page (About tab; History/Charts/Records tabs as empty states), media slot with crossfade + placeholder tiers.
- Custom exercise CRUD incl. image pick/store, archive/restore, duplicate-as-custom.
- Bundle-size decision point: if assets > 50 MB → thumbnail-only fallback plan (`03` §6.5).

**Exit criteria / test gate**
- 870 exercises browsable at 60 fps; dataset build deterministic + fully mapped (tests `08` §4.7).
- Custom exercise acceptance criteria (`03` §5) pass manual QA.
- `src/data` coverage ≥ 90% for implemented repos.

## M2 — Core logging (the make-or-break milestone)

**Scope**
- WorkoutRepository + activeWorkoutStore + crash-safety suite (`08` §4.9).
- Active workout screen complete (`02` §§1–10, 13-partial): all 8 exercise-type row layouts, set types, check flow (P6), previous values (both modes), keyboard accessory + Next flow, rest timers + notifications + pill + full-screen sheet, supersets + smart scrolling, notes, minimize/GlobalWorkoutBar, finish flow (without update-routine prompt — M3), discard, duration edit/pause, keep-awake, sounds/haptics.
- Workout settings implemented: Default Rest Timer, Previous Values, RPE, Smart Superset Scrolling, Inline Timer, Keep Awake, Sounds, Units (already), Warm-Up-in-stats (storage only).
- Plate calculator + warm-up calculator (`02` §§11–12) with settings config UIs.
- Minimal history: plain saved-workout list + read-only detail (enough to verify saves; real History tab is M4).

**Exit criteria / test gate**
- Maestro flows 1 and 3 green (`08` §6); kill-resume 10/10 manual; notification drill on physical device.
- Domain suites green: volume, calculators, units, previous-values, timers (`08` §4.2–4.5, 4.10).
- Keypress-to-paint < 50 ms measured; the 20-minute logging drill (`08` §7) passes.
- **Owner starts dogfooding real workouts from here.**

## M3 — Routines & folders

**Scope**
- RoutineRepository + folders; Workout tab hub UI (`04` §1); routine editor with rep ranges (`04` §2.1); start-from-routine (targets as placeholders, `02` §1); update-routine prompt + diff logic (`02` §14.4, `04` §2.4); Save as Routine / Repeat Workout from detail; drag reorder (dnd spike per `06` §1 table).

**Exit criteria / test gate**
- Maestro flow 2 green; routine acceptance criteria (`04` §2) pass.
- Diff/update-routine unit tests green (fixture matrix `08` §4.9).

## M4 — History, calendar, statistics, PRs

**Scope**
- History tab: cards, pagination, full workout detail with trophies, edit-past-workout flow (`02` §15), retro-logging entry points.
- Calendar + streaks (`04` §3.2).
- RecordsService + all PR surfaces: records tab, set-records table, live PR banner, finish-screen records, history trophies (`04` §5).
- Statistics dashboard + per-exercise charts (`04` §4); Victory Native wrappers (`07` §7); exercise-detail History/Charts/Records tabs go live.

**Exit criteria / test gate**
- The full PR suite `08` §4.1 (13 named cases) green — hard gate.
- Edit/delete recompute acceptance criteria (`02` §15, `04` §5.6) pass manual QA.
- Stats perf < 300 ms on 5-year synthetic fixture; history scroll 60 fps at 1000 workouts.

## M5 — Measurements, settings completion, import/export

**Scope**
- Measures: 17 fields, upsert-by-date, charts, entries CRUD; progress photos + gallery + compare (`04` §6); body-measurement units.
- Settings surface complete (`04` §7): first day of week (recompute hooks), weekly goal, notifications toggle, About/licenses.
- CSV export (all + single workout), **Hevy CSV import with preview** (`05` §7); backup/restore zip (`05` §9); orphan sweep.
- **Real migration:** import the owner's actual Hevy export; audit per `08` §7 data-integrity drill.

**Exit criteria / test gate**
- CSV suite incl. golden files + both round-trips green (`08` §4.6); Maestro flow 5 green.
- Owner's history imported: 0 dropped rows, PRs sane, spot-check vs Hevy passes (G4).
- Backup → wipe → restore drill passes.

## M6 — Polish, hardening, beta

**Scope**
- Full a11y pass (`07` §9, `08` §7): VoiceOver on core flows, Dynamic Type, Reduce Motion.
- Visual QA sweep both themes on device matrix; motion/haptics tuning; empty states/onboarding-lite (first-run hints).
- Perf audit (cold start, re-render profiling `06` §8); bundle size check.
- Bug-bash weeks: fix everything P0–P2; regression tests per fix.
- App Store prep start: icon, screenshots, copy (`10` §7); TestFlight internal beta via EAS Submit; 2-week dogfood with Sentry watch.

**Exit criteria / test gate**
- Zero P0/P1, zero known P2; crash-free ≥ 99.5% over the beta window (G6/success criteria `01` §6).
- Full Maestro suite + full manual QA checklist green; a11y checklist signed off.

## M7 — App Store launch

**Scope** (details in `10`)
- Production bundle id/profiles, privacy nutrition label, review notes (exercise-image licensing answer), App Store listing assets, versioning set to 1.0.0.
- EAS production build → TestFlight external (optional) → App Store submission; address review feedback.
- Post-launch: Sentry release monitoring, EAS Update channel for JS hotfixes, backup-reminder default on.

**Exit criteria**
- Approved & live; owner running the store build daily; `01` §6 success criteria all true.

---

## Working agreements (solo + agents)

- **One milestone = one epic branch-less flow:** small PRs to `main` behind completeness (no long-lived branches); incomplete features hidden by route absence, not flags where avoidable.
- Feature PRs follow the DoD (`08` §8); agents receive the relevant spec sections as context and must tick acceptance boxes in the PR description.
- Milestone exit = tag `v0.<M>.0` + release-candidate build + checklist file committed under `docs/qa/`.
- Expo SDK/dependency upgrades only between milestones.
- Scope discipline: anything not in docs 02–05 goes to `11-future-roadmap.md`, not into the milestone.
