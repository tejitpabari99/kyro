# Kyro — Task System Index

Executable task breakdown of the PRD (`docs/plan/00–12`). One file per milestone (per `09-milestones-and-delivery.md`), plus this index and the owner task list. A competent dev or coding agent should be able to pick up any task and execute it from the task text + the referenced PRD sections alone.

## How the system works

- **Source of truth stays the PRD.** Tasks tell you *what to build, in what order, with what tests*; the referenced spec sections define exact behavior. On any conflict: `05` (data) and `07` (design) win, then the feature specs, then the task text (fix the task file when you notice).
- **Execution order:** within a milestone, tasks are listed in dependency order — doing them top-to-bottom is always valid. Explicit `Dependencies` allow limited parallelism.
- **Every task carries its test gate.** The named test cases from `08` §4 and the Maestro flows from `08` §6 are each assigned to exactly one owning task (coverage map below). A task is not done until its gate is green (definition of done: `08` §8).
- **Milestone exit:** last task in each file is the QA/bug-iteration gate — checklist committed under `docs/qa/`, zero P0/P1, CI green, tag pushed (`09` working agreements).
- **Sizing:** tasks target 0.5–2 focused days each.

## Task ID scheme

- `M<milestone>-<nn>` — dev tasks, e.g. `M2-04`. Numbering is stable; insert follow-ups as `M2-04b` rather than renumbering.
- `O-<nn>` — owner (non-dev) tasks, in `OWNER-TASKS.md`.
- `MC-<nn>` — cloud-sync milestone tasks, in `M-CLOUD-tasks.md` (milestone MC per `09`; spec `12`).

## Status legend

Mark status inline next to a task title when work starts, e.g. `### M2-04 — … [in-progress]`.

| Status | Meaning |
|---|---|
| *(none)* / `[todo]` | Not started |
| `[in-progress]` | Being worked |
| `[blocked]` | Waiting on another dev task (say which) |
| `[blocked-by-owner: O-xx]` | Waiting on an owner task — **only** allowed on the tasks pre-marked as such (M5-11, MC-14, M6-09, M7-04…06) |
| `[done]` | Test gate green, merged |
| `[dropped]` | Descoped with a note + PRD cross-check |

## Task files

| File | Milestone | Tasks | Owner-gated tasks |
|---|---|---|---|
| [M0-tasks.md](M0-tasks.md) | Scaffold & design system | 12 | none |
| [M1-tasks.md](M1-tasks.md) | Exercise library & data layer core | 12 | none |
| [M2-tasks.md](M2-tasks.md) | Core logging | 19 | none (physical-device drill = owner verification, non-blocking) |
| [M3-tasks.md](M3-tasks.md) | Routines & folders | 8 | none |
| [M4-tasks.md](M4-tasks.md) | History, calendar, statistics, PRs | 12 | none |
| [M5-tasks.md](M5-tasks.md) | Measurements, settings, import/export | 11 | M5-11 (owner Hevy export — audit only, blocks nothing downstream) |
| [M-CLOUD-tasks.md](M-CLOUD-tasks.md) | MC — Cloud sync (Supabase, `12`) | 14 | MC-14 (production credentials O-13 — all sync dev/tests run on the local `supabase start` stack) |
| [M6-tasks.md](M6-tasks.md) | Polish, hardening, beta | 9 | M6-09 (TestFlight beta) |
| [M7-tasks.md](M7-tasks.md) | App Store launch | 6 | M7-04, M7-05, M7-06 |
| [OWNER-TASKS.md](OWNER-TASKS.md) | Owner actions & decisions | 14 (O-01…O-14) | — |

**Total dev tasks: 103.** Of these, only **6** are owner-gated (M5-11, MC-14, M6-09, M7-04/05/06) — and all sit at the distribution/production tail. Everything else is executable immediately in sequence; the complete app **including cloud sync** is buildable and owner-testable on iOS Simulator / local dev build (+ local Supabase Docker stack) with zero owner tasks done.

## Dependency overview

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5 ──► MC ──► M6 ──► M7
                      └────overlap────┘    ▲
              MC-01…04, MC-06 may start ───┘ (overlap M4/M5)
```

- Spine per `09`: strictly sequential except **M3/M4 may partially overlap** — M4-01/02 (records domain/service), M4-06 (streaks/calendar) and M4-07 (chart wrappers) have no M3 dependency and can start once M2 exits; M4-10 (finish-screen records) and M4-04 (detail ⋯ menu) want M3-06/M3-07.
- **MC overlap:** MC-01/02 (local stack, cloud schema), MC-04 (auth) and MC-06 (pure sync logic) depend only on M0/M1-era work and can overlap M4/M5; the enqueue/engine/UI tasks (MC-05, MC-07…09) need the M2/M3/M5 repositories, so MC closes after M5.
- The only cross-milestone hard seams: M2 stubs two hooks filled later — update-routine prompt (→ M3-06) and PR banner/records-earned (→ M4-10). Both are no-op interfaces until then; nothing in M2's gate depends on them. Likewise all of M0–M5 runs green with the CloudSync no-op stub (MC-01) — sync is strictly additive.
- Owner tasks never gate the spine: see the boundary notes at the top of M5/MC/M6/M7 files and `OWNER-TASKS.md` summary timeline. **Hard rule:** no dev task outside the explicitly owner-gated ones (M5-11, MC-14, M6-09, M7-04…06) may depend on an owner task — all cloud-sync development runs on the local `supabase start` stack; only production-credential wiring is owner-gated.

## Named-test-case → task coverage map (08 §4/§6)

| 08 ref | Suite | Owning task |
|---|---|---|
| §4.1 (13 cases) | PR computation | M4-01 (hard gate at M4-12) |
| §4.2 | Volume | M2-04 |
| §4.3 | Warm-up calculator | M2-16 |
| §4.4 | Plate calculator | M2-15 |
| §4.5 | Units | M1-02 |
| §4.6 | CSV codec | M5-05 (export/golden), M5-07 (import), M5-08 (round-trips) |
| §4.7 | Dataset build | M1-04 |
| §4.8 | Streaks | M4-06 · Stats bucketing → M4-08 · Previous-values → M2-04 · Token contrast → M0-05 |
| §4.9 | Store/repo crash-safety | M2-03 (kill sim, per-action) · one-active/auto-heal + finish fixtures → M2-01 · routine-diff fixtures → M3-06 · edit-past invalidation → M4-05 (with M4-02) · import perf → M5-08 |
| §4.10 | Timers | M2-10 |
| §6 flow 1, 3, 7 | Maestro smoke / kill-resume / notification hook | M2-18 |
| §6 flow 2 | Routine loop | M3-08 |
| §6 flow 4 | Custom exercise lifecycle | M4-12 |
| §6 flows 5, 6 | Hevy import / settings sweep | M5-10 |
| §5.3 | Migration fixture tests | M0-09 (runner), M1-01 (v1 schema), MC-03 (sync additions), then every migration task thereafter |
| `12` §15 | Cloud-sync suites (unit / integration / stub regression) | MC-06 (unit), MC-10 (integration + stub), MC-11 (CI job) |

## Cloud sync — milestone MC (provider decided: Supabase)

The provider decision landed (D9, `research/cloud-provider-research.md`): **Supabase**, spec'd in `12-cloud-sync.md` and planned as milestone MC in [M-CLOUD-tasks.md](M-CLOUD-tasks.md) (14 tasks, `MC-` ID space, slotted between M5 and M6 per `09`). The v1 prep that made this a bolt-on (repository seam, `updated_at`/`deleted_at`, UUIDs, canonical units — `05` §6) held: M0–M5 task files needed no changes; the only schema deltas are the `[sync]`-marked additions in `05` (owned by MC-03). All cloud development runs against the local `supabase start` stack; production credentials are the sole owner gate (MC-14 / O-13).

## PRD gaps & ambiguities found while decomposing

Noted here and resolved in the owning task with the stated interpretation; fix the PRD if any resolution is wrong.

1. **M0 "empty → v1 schema" migration gate vs M1 "full schema lands"** (09 M0 vs M1): interpreted as — M0-09 proves the runner on migration 0001 (`app_meta` + `settings` only); the full v1 DDL is migration 0002 in M1-01 with its own fixture test.
2. **Hevy import fixture requires the owner's file** (08 §4.6 "owner's file, trimmed"): dev builds a synthetic Hevy-format fixture first (M5-07, from the research doc's CSV schema) so no test waits on O-07; the owner slice replaces/augments it in M5-11.
3. **Sentry requires an account/DSN** (P13) but M0 integrates it: resolved by no-op-without-DSN init (M0-11); real DSN lands with O-05 at M6-09.
4. **Records-earned list on the finish screen (02 §14) vs RecordsService in M4** (09): M2-14 ships the finish screen with a no-op records provider; M4-10 fills it. Same for the live PR check hook in 02 §4 step 4.
5. **Warm-up rounding boundary** — 08 §4.3 raises 43.75 (banker's vs half-up) and answers itself: **round-half-up** → 45. Implemented as such in M2-16 and documented in code.
6. **mm:ss parse of bare "90"** — 08 §4.5 raises it and resolves: bare seconds ≥ 60 normalize (90 → 1:30). Implemented in M1-02.
7. **09 M2 lists "Units (already)"** among workout settings — confirmed: units setting UI lands M0-10; M2-17 only verifies mid-workout conversion behavior.
8. **Retro-logging spans milestones**: logger's retro mode (paused stopwatch, chosen date) is built in M2-05; the entry points (calendar day, History `+`) arrive in M4-05. 09 lists retro entry points under M4 — consistent, but the split is easy to miss.
9. **Primitives not in the M0 list but in 07 §5 inventory** (WheelPicker, TimerPill, ProgressRing, PRBanner, CalendarMonth, PhotoGrid/CompareView, charts): built in the milestone that first needs them (M2-09/11, M4-06/07/10, M5-03), consistent with 07 §5's "add to `src/ui/` first" rule.
10. **`weight_duration` volume**: 04 §4.2 counts it as `weight × max(reps,1)` while such sets normally have no reps — 08 §4.2's named case (20 kg × 60 s = 20) confirms the max(reps,1)=1 reading. Implemented in M2-04.
11. **CI/nightly need a GitHub remote + macOS runners; release needs secrets**: all workflows are authored on schedule (M0-04, M2-18, M6-08/M7-03) with local-command mirrors (`pnpm ci`, `pnpm e2e`) so nothing blocks if O-06 lags.
12. **App name availability** ("Kyro — Workout Tracker") can only be truly verified when the App Store Connect record is created (O-02/O-03) — a rename before first submission is cheap; after, impossible for the bundle id and disruptive for the name.
13. **Timer state storage**: 05 §3.5 doesn't define an `active_timer` settings key; 06 §4.3 stores it in `expo-sqlite/kv-store`. Followed 06 (kv-store key `active_timer`, M2-10) — it's device-runtime state, not a user setting, so it stays out of the `settings` table.
