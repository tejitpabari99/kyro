# 08 — Testing & Quality

Quality is a hard requirement (D8): the plan is to iterate until bug-free, gated per milestone (`09`). This doc defines the pyramid, tooling, concrete test cases for the risky logic, coverage targets, CI, manual QA, and the bug bar.

## 1. Test pyramid & tooling

| Layer | Scope | Tooling | Runs |
|---|---|---|---|
| **Unit (domain)** | Pure logic in `src/domain/` — PRs, 1RM, volume, calculators, streaks, buckets, previous-values, CSV codec, units | Jest (node env, no RN preset needed) | every commit, < 10 s |
| **Unit (UI)** | Components/hooks in `src/ui/` + feature components — rendering, interaction, store wiring | Jest + `jest-expo` + React Native Testing Library (RNTL) | every commit |
| **Integration (data / "BE")** | Drizzle repositories against **real SQLite** (`better-sqlite3` in Node — same schema/migrations as device, `05` P1 rationale) | Jest, per-test fresh in-memory DB | every commit, < 60 s |
| **Integration (store↔repo)** | `activeWorkoutStore` actions driving real repositories; crash/rehydrate simulations | Jest | every commit |
| **E2E** | Critical user flows on the built app | **Maestro** on iOS simulator | nightly + pre-release; smoke subset on PR (optional) |
| **Static** | tsc `--strict`, ESLint (incl. import-boundary rules `06` §2), Prettier | every commit |

Test placement: colocated `*.test.ts(x)`; fixtures in `src/test/fixtures/` (builder helpers: `aWorkout().with(exercise('bench').sets('80x8', 'W:40x10'))…`); repo integration suites in `src/data/sqlite/__tests__/`.

## 2. What must be tested where (policy)

- Every `src/domain/` function: unit tests written **with** the implementation, covering the enumerated cases below before the feature that uses it merges.
- Every repository method: at least one integration test (happy path + key constraint/edge).
- Every migration: fixture-upgrade test (`05` §10).
- Every screen: at least an RNTL smoke render in both themes; interactive components (SetRow, TimerPill, pickers) get behavioral tests.
- Every bug fixed after M2: regression test in the same PR — no exceptions.

## 3. Coverage targets (enforced in CI via jest `coverageThreshold`)

| Area | Lines/branches |
|---|---|
| `src/domain/**` | **95% / 90%** |
| `src/data/**` (repositories, CSV, backup) | **90% / 85%** |
| `src/features/workout/**` (store, logger logic) | 85% / 80% |
| Overall project | 75% / 70% |

Coverage is a floor, not the goal — the named cases in §4 are the real contract.

## 4. Named test cases for the risky logic

### 4.1 PR computation (`domain/records.ts`) — the highest-risk area
1. Single history: 100×5 → Heaviest 100, 1RM 116.67 (Epley), Best Set Volume 500, Most Reps 5, set-record[5]=100.
2. Warm-up 110×3 never beats working 100×5 for any record type.
3. Failure and dropset sets ARE eligible.
4. Strict-greater: second 100 kg set (later date) does not re-award Heaviest.
5. Epley bounds: reps=1 → 1RM = weight; reps=10 → w×1.333…; reps=11 → excluded from 1RM (but counts for volume/reps records).
6. Set records: 100×5 then 90×5 → record[5]=100; 100×8 sets record[8]=100 AND does not alter record[5]; reps 12 → bucket "10+".
7. kg tolerance: 45 lb→kg→compare equal within 0.001 (no false PR from float drift).
8. Trophy attribution (`04` §5.2): historical sequence W1(100), W2(105), W3(103) → trophies: W1 heaviest-at-time, W2 heaviest; W3 none. Edit W1 to 110 → only W1 holds Heaviest trophy.
9. Delete PR workout → next-best becomes record everywhere (records tab, set records).
10. Live check baseline includes current session's earlier checked sets: 100 then 102.5 in-session → banner only on first if history best was 99, and again at 102.5 (each strictly beats running best); duplicate 102.5 → no banner.
11. Bodyweight: +10×8 → Heaviest(added)=10; assisted sets excluded from Heaviest/volume records; reps-only → Most Reps only.
12. `duration` type: Longest Duration only; 0-duration excluded.
13. Uncheck removes contribution: check 105 (banner), uncheck, re-check → banner again; finish with it unchecked → no record persisted.

### 4.2 Volume (`domain/volume.ts`)
weight_reps 80×8=640 · bodyweight +10×8=80 · assisted 20×12=0 · reps_only=0 · duration=0 · distance_duration=0 · weight_duration 20 kg 60 s=20 (weight×max(reps,1)) · short_distance_weight 60 kg 20 m=60 · warm-up included iff setting on · unchecked rows always 0 · workout volume = Σ; display converts kg→lb correctly.

### 4.3 Warm-up calculator (`domain/warmup-calc.ts`)
Default formula @100 kg barbell/2.5 kg rounding → 20×10, 40×8, 60×5, 80×3 · rounding: 42.5 stays, 43.7→42.5 (nearest 2.5: 43.75 boundary case → banker's? spec: round-half-up to nearest increment → 43.75→45; document + test) · dumbbell increment path · floor at bar weight · percent 0 = bar · custom formulas add/remove/reset · working weight in lb converts before math, output rounds in display unit increments.

### 4.4 Plate calculator (`domain/plate-calc.ts`)
102.5 on 20 bar → [25,15,1.25]/side · exact bar weight → no plates · target < bar → impossible, suggest bar · limited inventory (2×25 only …) greedy respects counts · impossible → nearest ≤ and ≥ suggestions correct · lb inventory/lb target path · EZ/short bar weights.

### 4.5 Units (`domain/units.ts`)
kg↔lb round-trip stability (100 random values, 3 round trips, no drift beyond epsilon) · display rounding rules (`05` §5) · mm:ss parse: "130"→90 s, "90"→90 s? (spec: bare seconds ≥ 60 normalize → 1:30; test) · miles/km, cm/in · 0 and null passthrough.

### 4.6 CSV codec (`domain/csv-codec.ts` + `CsvService` integration)
Export golden-file test: fixture DB → byte-exact expected CSV (kg and lbs variants, headers switch) · quotes/commas/newlines in titles and notes escape per RFC 4180 · Hevy sample import: real anonymized Hevy export fixture (owner's file, trimmed) → workout/set counts, supersets, RPE, set types correct · imperial-header import converts to canonical · unknown exercise → custom created with inferred type (one fixture per inference rule) · duplicate workout skipped · malformed row skipped with line number · **round-trips**: import(export(db)) = 0 new rows; export(import(hevy.csv)) semantically equal (`05` §7.3) · date format parse/format symmetry incl. single-digit days.

### 4.7 Dataset build (`scripts/build-exercise-db.ts`)
Every muscle/equipment mapping entry · each exercise-type heuristic branch via representative slugs (`03` §6.3) · override precedence · enum validation fails build on bad value · deterministic output hash.

### 4.8 Misc domain
Streaks (`domain/streaks.ts`): consecutive weeks, first-day-of-week variants, current-week grace, gap breaks, midnight-crossing workout counts on start date · stats bucketing: week boundaries, All-range monthly switch · previous-values (`domain/previous-values.ts`): any_workout vs same_routine, occurrence matching for duplicated exercise (`02` §16.6), fewer-previous-sets → `—` · token contrast test (`07` §2.6): programmatic WCAG ratio check over the token tables.

### 4.9 Store/repo integration (crash-safety suite)
- Every store action → DB state assertion (check set, add exercise, reorder, superset, note, timer change, pause/resume stopwatch).
- **Kill simulation:** perform N random valid actions (property-style, seeded), drop the store, rehydrate from repo → deep-equal state. Run with 100 seeds.
- One-active invariant: second `startEmpty` throws with an active present; auto-heal path (`06` §9) when index somehow violated.
- Finish: unchecked sets deleted, empty exercises removed, `end_time`/state set, timer kv cleared, routine-diff computed correctly (fixtures: unchanged / value change / structural change).
- Edit past workout: replace-content update + `invalidateAfterWorkoutMutation` fires for the union of old+new exercise ids.
- Import 1000-workout synthetic CSV < 10 s, single transaction batches, UI-thread-free (measured in integration harness).

### 4.10 Timers (unit + RNTL with fake timers)
`endsAt` math across background gaps · ±15 s clamps at 0/24 h? (spec: min 5 s remaining floor 0 → finishes; max unbounded) · skip clears notification id · next-set-dropset suppression · uncheck cancels only its own timer · notification scheduling calls (mock `expo-notifications`) match endsAt after each adjustment.

## 5. Integration environment notes

- Repositories tested via Drizzle on `better-sqlite3` with the **same migration files** the device runs — parity is the point (P1). A tiny driver shim abstracts expo-sqlite/better-sqlite3 differences; the shim itself gets a device smoke test via Maestro flow #1.
- RNTL tests mock only true natives (notifications, haptics, keep-awake, file pickers) via `src/lib/` seams (`06` §10); never mock repositories in integration suites — mock repos only in pure component tests.
- Migration tests: fixture dumps per released schema version under `src/data/migrations/__fixtures__/`.

## 6. E2E (Maestro)

Flows in `e2e/`, run on iOS simulator (nightly + pre-release; tagged smoke set < 5 min):

1. **Log workout end-to-end (smoke):** launch → start empty → add Bench Press → type 60/8 → check (rest pill appears) → add set via previous-tap → check → finish → confirm discard-unchecked dialog handling → workout appears in History with correct volume.
2. **Create routine & start it:** new routine → 2 exercises, rep range 6-8, rest 90 s → save → start → placeholders show targets → complete → update-routine prompt → accept → routine shows new targets.
3. **Resume after kill (critical):** start workout → check 2 sets → `maestro` stop/relaunch app → mini-bar present → expand → sets still checked, duration sane → finish.
4. **Custom exercise lifecycle:** create custom (type bodyweight_reps) → log it → detail shows history/records → archive blocked path (delete → archive) → still renders in history.
5. **Hevy import:** import bundled fixture CSV via mocked picker → preview counts → confirm → history populated, PRs visible.
6. **Settings sweep:** toggle units kg→lb (logger values convert), theme dark→light, RPE on (column appears), first-day-of-week (calendar shifts).
7. **Rest-timer notification (semi-manual):** simulator can't fully verify lock-screen delivery — assert scheduling via debug hook; physical-device manual check in QA checklist.

## 7. Manual QA checklists (per-milestone gates in `09`)

Maintained as `docs/qa/` checklists; the recurring core:

- **Device matrix:** owner's iPhone + smallest supported (iPhone SE-class simulator) + Dynamic Island device; dark + light; Dynamic Type 100%/140%.
- **Logging drill (M2+):** 20-minute real gym session (or simulated) logging 5 exercises incl. superset, drop set, warm-ups, RPE — zero data errors, zero mistaps caused by layout.
- **Backgrounding drill:** timer + lock screen (notification fires, sound correct, ±15 s honored); force-quit resume ×10; airplane mode (post-MC: save succeeds instantly, offline notice shown once, sync state Pending, nothing else changes — `12` §11.1; pre-MC: no behavioral change at all).
- **A11y pass (M6):** VoiceOver through flows 1–3 of §6; Reduce Motion; 200% type on non-table screens.
- **Data integrity audit (M5+):** export CSV → diff against in-app history for 10 random workouts; backup → wipe simulator → restore → spot-check.
- **Perf spot-checks:** cold start < 1.5 s, keypress latency, 1000-workout history scroll (import synthetic fixture).

## 8. Bug bar & definition of done

**Severity:** P0 data loss/corruption/crash-on-core-flow · P1 core flow broken or wrong numbers (PR/volume/stats) · P2 non-core functional bug, visual defect with workaround · P3 polish.

**Bar:** P0/P1 block any milestone exit and any release; P2 blocks App Store submission (M7) but not earlier milestones; P3 triaged to backlog. "Wrong number anywhere" is P1 by definition — this is a data product.

**Definition of done (every feature PR):** typecheck/lint clean · unit+integration tests for new logic incl. §4 named cases in scope · RNTL coverage for new components · both themes screenshot-checked · acceptance criteria in the feature spec ticked · no new console warnings · coverage thresholds hold · regression test if fixing a bug.

## 9. CI (GitHub Actions) & release pipeline

- **PR workflow (`ci.yml`):** install (pnpm cache) → tsc → eslint → jest unit+integration with coverage gate → `expo-doctor` + `npx expo export` sanity (bundle compiles). Target < 8 min.
- **Nightly (`nightly.yml`):** full jest + Maestro flows on macOS runner (simulator) + dataset build determinism check.
- **Release (`release.yml`, tag-triggered):** EAS Build (iOS) → EAS Submit to TestFlight (`10` §4); Maestro smoke against the release build first.
- Sentry release + sourcemap upload step in release workflow (P13).
- Branch protection on `main`: CI green required; milestone exit = tagged release candidate + checklist sign-off (`09`).
