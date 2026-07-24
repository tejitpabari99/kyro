# M2 Exit Checklist — Core Logging (the make-or-break milestone)

Milestone-close verification for M2, per `docs/plan/tasks/M2-tasks.md` (M2-19) and the M2
exit criteria in `docs/plan/09-milestones-and-delivery.md`. This is the "milestone exit =
tag `v0.<M>.0` + checklist file committed under `docs/qa/`" artifact, same convention
`docs/qa/M0-checklist.md`/`docs/qa/M1-checklist.md` established.

**Scope of this pass:** the heavyweight M2-19 exit gate — full CI gate, domain-suite
verification against 08 §4's named cases, a targeted P0/P1 sweep on the highest-stakes paths
(finish-flow data integrity, crash-safety coverage completeness, rest-timer notification
cancellation), a re-render discipline pass (06 §8), and the manual-QA-checklist items from
08 §7 mapped to either real evidence or an explicit owner-measurement item. This is **not**
the full milestone-wide independent code review of all 19 M2 tasks — per this task's own
scope boundary, that is a separate follow-up agent's pass (mirroring how M1-checklist's own
§5 was a distinct, later pass). One thing worth flagging for that follow-up pass up front:
`docs/plan/EXECUTION-LOG.md` shows M2-01 through M2-07, M2-14, and M2-17 each only have a
`done` row, no individual `reviewed` row (unlike M2-09/M2-10, M2-08/M2-16, M2-15/M2-12,
M2-13, M2-11, and M2-18, which all got an independent post-landing review). This pass's own
targeted sweep (§3 below) deliberately covers the two highest-risk items among that
unreviewed set — M2-03's crash-safety suite and M2-14's finish flow — but the rest of that
list (M2-01/02/04/05/06/07/17) is real, legitimate scope for the follow-up milestone-wide
review, not something this pass silently absorbed.

Verified at commit `916268d` (tip of `users/tejitpabari/init` at the start of this task).
Fixes landed during this pass: `ad03eb1`, `52f9ec8`, `48da95c`, `bc2dccc` (see §3).

---

## 1. Full CI gate (`pnpm run ci`)

Steps: `tsc --noEmit` → `eslint .` → `pnpm test -- --coverage` → `npx expo-doctor` →
`npx expo export --platform ios`. Exact sequence `.github/workflows/ci.yml` runs.

**Initial run: red.** `npx expo-doctor` failed 20/21 — "Missing peer dependency: expo-asset,
required by expo-audio." M2-11 (`ed5c9c8`) installed `expo-audio` for `lib/sound.ts`'s chime
playback but never installed its required peer dependency. This has been silently red on
every `pnpm run ci` run since M2-11 landed — the exact same class of gap M1's own exit
checklist found (that time it was `expo-doctor`/flash-list drift). Fixed (`ad03eb1`) with
`npx expo install expo-asset` (adds the SDK-56-pinned dependency + its `app.json` config
plugin entry; `package.json`/`pnpm-lock.yaml`/`app.json` diffs are additive only).

**Final run: green, exit 0.**

```
Test Suites: 123 passed, 123 total
Tests:       1407 passed, 1407 total
Snapshots:   0 total
Time:        ~107s
Ran all test suites in 2 projects.

Running 21 checks on your project...
21/21 checks passed. No issues detected!

Exported: dist
```

`dist/` total 46 MB — unchanged from M1's own figure (no new bundled assets this milestone
besides the 4 placeholder chime WAVs, all well under a rounding error at this scale).

Coverage (all four active thresholds from `jest.config.js` met):

| Area | Threshold | Actual |
|---|---|---|
| `src/domain/**` | 95% / 90% | 100% / 98.71% |
| `src/data/**` | 90% / 85% | 99.17–100% lines / 95.03–100% branches per subdir (lowest: `src/data/workouts`, 99.17/95.03) |
| `src/features/workout/**` | 85% / 80% | 97.5% / 89.48% |
| global | 75% / 70% | 97.77% / 90.3% / 92.01% (fn) / 97.87% (line) |

`src/features/workout/**`'s threshold (M2-03's own acceptance gate: "uncomment the
commented-out `coverageThreshold` entry") is active and held comfortably above its 85/80
floor — the entry itself is confirmed live in `jest.config.js`, not still commented out.

Full run log for both the initial-red and final-green runs is reproducible via `pnpm run
ci` on this branch; not pasted verbatim in full here for length, only the terminal summary
tables above (same convention M0/M1's checklists used).

## 2. Domain-suite verification (08 §4.2–4.5, 4.8, 4.9, 4.10)

For each, the actual test file was opened and a sample of its named `describe`/`it` blocks
diffed against 08 §4's own case list — not just trusting a suite file with the right name
exists. All green as part of §1's full run.

### 08 §4.2 — Volume (`domain/volume.ts`)

`src/domain/__tests__/volume.test.ts`. Every named case from the spec text is a real,
separately-titled test: `weight_reps 80×8=640`, `bodyweight_reps +10×8=80`,
`bodyweight_assisted_reps 20×12=0`, `reps_only=0`, `duration=0`, `distance_duration=0`,
`weight_duration 20 kg 60 s=20`, `short_distance_weight 60 kg 20 m=60`, warm-up
included/excluded by `warmupInStats`, unchecked rows always 0, `totalVolumeKg` = Σ, and
`formatVolumeDisplay`'s kg→lb conversion (nearest 0.5 lb ≥10 lb, nearest 0.1 lb below).

### 08 §4.3 — Warm-up calculator (`domain/warmup-calc.ts`)

`src/domain/__tests__/warmup-calc.test.ts`. Confirmed: default formula @100 kg → 20×10/
40×8/60×5/80×3; the round-half-up boundary case (`43.75 -> 45`, spec-cited verbatim in the
test title); dumbbell increment path (no bar floor); floor-at-bar-weight; percent-0 = bar;
custom formulas (add/remove/reset, empty formula, single row); lb unit path incl. the
"never internally converts kg<->lb mid-calculation" invariant; `resolveWarmupRounding`'s
equipment branching (barbell/dumbbell/other, both unit systems).

### 08 §4.4 — Plate calculator (`domain/plate-calc.ts`)

`src/domain/__tests__/plate-calc.test.ts`. Confirmed: 102.5 kg on a 20 kg bar → `[25, 15,
1.25]`/side exact; exact-bar-weight → no plates; target < bar → bar-alone upper suggestion
only; limited inventory respects per-plate counts (not infinite); impossible target →
both ≤/≥ suggestions, including the "smallest available overshoot" tie-break case; lb unit
path; EZ bar (7.5 kg) / short bar (10 kg) paths; inventory normalization (duplicate-weight
merge, null-count-makes-unlimited, non-positive weights ignored).

### 08 §4.5 — Units (`domain/units.ts`)

`src/domain/__tests__/units.test.ts`. Confirmed: kg↔lb round-trip stability (100 random
values × 3 round trips, both directions, epsilon-bounded); display rounding rules (0.5 lb
≥10 lb, 0.1 lb below, 2-decimal distance, whole-number feet, 1-decimal inches); miles/km,
cm/in exact-inverse formula checks; duration mm:ss/h:mm:ss formatting; the mm:ss digit-fill
parser incl. the spec's own two named cases verbatim — `"130" -> 90 s` and bare `"90"`
normalizing to the same 90 s — plus single/double/4+-digit fill, non-digit stripping, and
0/empty-string edge cases; null/0 passthrough for every exported function.

### 08 §4.8 — Previous-values (`domain/previous-values.ts`)

`src/domain/__tests__/previous-values.test.ts`. Confirmed: bucket numbering (warm-up/
working independently counted); `any_workout` vs `same_routine` mode-agnostic mapping;
occurrence matching for a duplicated exercise (02 §16.6) — two separate occurrences each
mapping to their own card independently; "fewer-previous-sets → —" incl. the
routine-target-fallback-before-— case; per-type PREVIOUS label formats for all 8 exercise
types (the exact `45kg × 9`/`+10kg × 8`/`−20kg × 12`/etc. strings from 02 §4); autofill
payload incl. the rep-range-target-never-autofills-reps case (04 §2.3); defensive
malformed-data (`null` label, no crash) and exhaustiveness-guard cases.

### 08 §4.9 — Store/repo integration (crash-safety suite)

`src/features/workout/__tests__/activeWorkoutStore.crash-safety.test.ts` — 100 seeded runs,
each performing 10–20 random valid actions against a real `WorkoutRepositoryImpl`/
`better-sqlite3` backend, then "killing" the store (constructing an entirely independent
instance bound to the same repository) and asserting `deep-equal` against the live store's
draft. See §3 below for this pass's own re-trace of this suite's action-set completeness —
found and fixed a real coverage gap (M2-12/M2-16/M2-07 actions were missing), not just
confirmed the suite still passes.

Every mutator also has its own dedicated integration test (`workout-repository.lifecycle
.test.ts`, `workout-repository.mutators.test.ts`, `activeWorkoutStore.test.ts`) — the
kill-simulation suite is the property-style capstone on top of that per-action coverage,
per 08 §4.9's own two-part structure ("every store action → DB state assertion" +
"kill simulation... 100 seeds").

### 08 §4.10 — Timers (unit + RNTL with fake timers)

`src/features/workout/__tests__/restTimerStore.test.ts`. Every named case from the spec
text is a real, separately-titled test (grouped under matching `describe` blocks):
`endsAt` math across background gaps; ±15 s clamps (unbounded max, floor-at-0 min incl. the
exact-boundary case); `shouldStartRestTimer`'s dropset-suppression start rules; `skip`
cancels + clears (incl. no-op-when-no-timer and no-notification-scheduled paths);
`cancelForSet` cancels only the owning set's timer (uncheck-cancels-only-its-own, 08
§4.10's own named case); only-one-timer-at-a-time replacement; notification scheduling
calls matching `endsAt` after every adjustment (start, repeated `+15s`, sound-preference
survival across adjust/restore); graceful degradation when `scheduleRestNotification`
throws; `complete()`'s foreground-completion hook; and `restore()`'s kill/relaunch
persistence (restores exact remaining time within the window, no duplicate notification;
a relaunch past `endsAt` restores no timer and never re-schedules). `TimerPill.test.tsx`
separately covers the M2-11 acceptance gate (renders countdown from the store, ±15/skip
dispatch, sheet opens from the pill).

## 3. P0/P1 sweep (targeted, per this task's own scope boundary)

Three specific paths named in the M2-19 task text, not a re-review of all 19 M2 tasks.

### 3.1 — Finish flow (M2-14) data-loss/corruption re-trace

Re-read `WorkoutRepositoryImpl.finish()` (`src/data/workouts/workout-repository.ts`) in
full: single `driver.transaction()` wrapping (1) delete every `is_completed=0` set in the
workout, (2) renumber each surviving exercise's set positions contiguously, (3) drop any
exercise left with zero sets, (4) renumber the workout's own exercise positions, (5) apply
meta overrides and flip `state='completed'`. This matches M2-01's own acceptance gate
verbatim and the transaction is genuinely atomic (05 §5.2's "one transaction per user
action" — no partial-apply window). `ActiveWorkoutScreen.handleSaveWorkout` calls this,
then cancels the pending rest-timer notification, then invalidates the history query, then
navigates — in that order, with an early return (leaving the sheet open, no navigation) if
`finish()` itself returns `null` (a rolled-back `DataError`), so a failed finish never loses
the in-progress draft.

Wrote a new scripted "20-minute logging drill" test (`activeWorkoutStore.logging-drill
.test.ts`, `bc2dccc`) specifically to stress this path with realistic data rather than
random actions — see §4 below for what it proves and why. It passed on the first run with
no bug found in `finish()` itself.

**One minor (P2, not fixed — noted for the follow-up review) finding:** if a superset pair
loses one member entirely at `finish()` time (every one of that member's sets was
unchecked, so step 3 above drops the whole exercise), the surviving member keeps its
`supersetId` — there's no "group of 1 auto-dissolves" pass inside `finish()` itself (that
rule only fires today when a user explicitly taps "Remove from Superset" mid-session,
`removeFromSuperset`/`computeDissolution` in `domain/supersets.ts`). Net effect: a saved
history workout could show a single exercise still labeled/colored as a superset with no
partner. This is a cosmetic display artifact, not a wrong number or data loss (08 §8's bug
bar), and it wasn't in this task's explicit re-check list — flagged for the follow-up
milestone-wide review rather than fixed here, to keep this pass's own scope honest.

### 3.2 — Crash-safety suite (M2-03) action-set completeness re-trace

The task text asks specifically whether the kill-simulation suite "genuinely exercises the
finish/discard/check/uncheck action set added across later M2 tasks (M2-07 through M2-17),
not just the original M2-03-era action set." It did not. Reading `runRandomAction`'s
candidate list before this pass: `updateMeta`, `addExercises`, `addSet`, `updateExercise`
(notes/restSeconds only), `replaceExercise`, `removeExercise`, `reorderExercises`,
`updateSet` (weight/reps only), `setCompleted`, `setSetType`, `removeSet`. Missing
entirely: `updateExercise`'s `supersetId` field (M2-12 "Add to Superset"),
`removeFromSuperset` (M2-12), `addWarmUpSets` (M2-16), and `updateSet`'s `rpe` field
(M2-07) — four real store actions/fields with **zero** crash-safety coverage, all of them
core mid-session logging actions a real user reaches every workout (not settings toggles),
so per this task's own judgment call this was fixed rather than just flagged (`52f9ec8`).
Re-ran at the full 100 seeds after broadening: still green, 619 ms — no bug found in the
store itself, this was a coverage gap, not a correctness bug.

### 3.3 — Rest-timer notification cancellation path (M2-10/M2-14) re-confirm

`cancelForSet` (uncheck cancels only its own timer, `ConnectedSetRow.tsx` line ~492) and
`skip` (finish cancels the pending notification, `ActiveWorkoutScreen.tsx`'s
`handleSaveWorkout`) both re-read clean, matching their prior-wave review and 08 §4.10's own
test coverage. **One real gap found and fixed:** discarding an active workout never
cancelled its running rest timer's notification. Both discard entry points —
`ActiveWorkoutScreen`'s footer "Discard Workout" and the Workout tab's "Discard & Start
New" (starting fresh over an active workout) — called `activeWorkoutStore.discard()` and
navigated on with no `restTimerStore.skip()` call, unlike the finish path's explicit
"cancel pending timer notification" step. A discarded workout with a running rest timer
would leave a stray scheduled local notification that fires later, referencing a
set/exercise from a workout that no longer exists in the DB — reachable through two
ordinary user paths any time a workout with an active rest timer is discarded.

Severity: **P2** per 08 §8's bug bar (no data loss, no wrong number, no core-flow break — a
cosmetically wrong local notification with a trivial dismiss), but fixed anyway (`48da95c`)
since it's a one-line, low-risk change directly on the exact path this task asked to
re-verify, mirroring the existing `finish -> skip()` contract. Regression tests added to
both `ActiveWorkoutScreen.test.tsx` and the Workout tab's `index.test.tsx`, each seeding a
real running timer (real `restTimerStore`, mocked-only-at-the-native-seam
`@/lib/notifications`) and asserting it's cleared post-discard.

**One further minor (P2, not fixed — noted for the follow-up review) observation:**
swipe-deleting a single checked set (`removeSet`, `ConnectedSetRow.tsx`'s `handleDelete`/
`handleRemove`) or removing an entire exercise doesn't call `cancelForSet` either, so the
same stray-notification class of issue exists in miniature if a user deletes the specific
row a rest timer is currently attached to (a narrower window than the whole-workout discard
case just fixed — the set has to have just been checked *and* be deleted before its timer
elapses). Time-boxed out of this pass per the task's own "keep the P0/P1 sweep... scoped"
instruction; flagged for the follow-up review to judge on its own merits.

## 4. Re-render discipline pass (06 §8)

06 §8's table: "Set-table typing — no list virtualization inside the logger; each `SetRow`
memoized, subscribes only to its own set slice (Zustand selectors); keyboard stays mounted;
input state local-first, committed on blur/check" (budget: keypress-to-paint < 50 ms, zero
keyboard flicker) and "Check ripple — counters/PR check are derived selectors" (budget:
check-to-feedback < 100 ms). The doc's own last line — "Re-render discipline verified with
React DevTools profiling in M2 exit review" — needs a running app in a profiler, which this
headless environment cannot provide (`docs/plan/BLOCKERS.md`); this pass substitutes a
static code review plus the one existing test that actually proves row isolation at
runtime (not just by inspection).

**Confirmed compliant:**

- **`activeWorkoutStore.ts`'s structural sharing** (`withSet`/`withExercise` helpers):
  every mutation rebuilds only the changed node's spine (`WorkoutFull` →
  `WorkoutExerciseFull` → `WorkoutSet`), reusing every sibling object/array reference
  untouched by that action — confirmed by reading both helpers directly. Combined with
  Zustand's default `Object.is` selector equality, this is what makes
  `selectWorkoutSet(setId)`/`selectWorkoutExercise(id)` genuinely cheap, not just
  documented as such.
- **`ConnectedSetRow.tsx`**: `React.memo`-wrapped (`export const ConnectedSetRow =
  React.memo(ConnectedSetRowImpl)`), subscribes via `useActiveWorkoutStore(selectWorkoutSet(setId))`
  — the exact per-set-slice pattern 06 §8 calls for. Typed-but-uncommitted input values are
  local `useState` inside this component (confirmed at the source — `handleChangeValue`
  writes to a local `values` record, not the store), committed to the store only on
  blur/check — meaning a keystroke never touches `activeWorkoutStore` at all, so it can
  never trigger the coarser screen-level re-render described next.
- **`ui/SetRow.tsx`**: also `React.memo`-wrapped (`export const SetRow =
  React.memo(SetRowImpl)`), the pure-presentational leaf `ConnectedSetRow` renders into.
- **Runtime proof, not just static review:** `ExerciseSetTableSection.render-isolation
  .test.tsx` (M2-06's own acceptance gate: "typing in one row doesn't re-render others")
  mounts the real `ExerciseSetTableSection`/`ConnectedSetRow` tree against a real store +
  repository, mocks only the leaf `ui/SetRow` with a render-counting spy, commits an edit
  to one specific row via the real `updateSet` call path, and asserts the spy was called
  **only** for that row's own `testID` — sibling rows' spies are never invoked again. This
  is real, executed evidence (not inference from reading the selector code) that the
  per-set isolation actually holds at runtime.
- **`ActiveWorkoutScreen.tsx`** subscribes via `selectActiveWorkout` — the coarsest-grained
  selector (the whole draft). This is appropriate for the one component that owns the
  exercise list itself (needs to know about add/remove/reorder to re-map its `.map()`), and
  because keystroke-level updates never reach the store (previous bullet), this
  screen-level re-render only fires at commit frequency (check/blur/structural mutations),
  not per-keystroke — the keypress-to-paint budget's actual bottleneck is `ConnectedSetRow`'s
  own local re-render, which the isolation test above directly proves is scoped correctly.
- **Meta-row counters** (`volumeInputs`, the Volume/Sets stat column inputs): wrapped in
  `useMemo`, feeding the already-unit-tested pure `domain/volume.ts` functions (08 §4.2) —
  cheap, derived, not recomputed via any hidden O(n²) work.
- **`TimerPill.tsx`/`GlobalWorkoutBar.tsx`**: each subscribes to `restTimerStore`/
  `activeWorkoutStore` with a narrow field-level selector (`(state) => state.timer`, etc.)
  — appropriate granularity for singleton, always-mounted-once components (no per-row
  fan-out concern applies to them the way it does to `SetRow`).

**One genuine, unfixed discipline gap found (flagged, not fixed — see reasoning below):**
`ExerciseCard.tsx` (the wrapper one level above `ConnectedSetRow`, holding card chrome +
`ExerciseSetTableSection`) is **not** wrapped in `React.memo`. Every time
`ActiveWorkoutScreen` re-renders (at commit frequency, per the bullet above — not per
keystroke), every visible `ExerciseCard`'s render function re-executes, even for exercises
completely unrelated to the triggering mutation, before bailing out at the
`ConnectedSetRow`/`SetRow` memo boundary underneath it. This is bounded (typical workouts
have a handful of exercise cards, and each card's own render body is cheap chrome, not a
set-iteration loop) and is **not** on the hot per-keystroke path, so it does not threaten
the keypress-to-paint budget — but it is a real gap relative to 06 §8's stated goal, and
could matter marginally for the check-to-feedback budget on workouts with many exercise
cards. Notably, even adding `React.memo` today would be a **no-op** as-is: two of
`ExerciseCard`'s callback props (`onReorderPress`, `onSetChecked`) are fresh inline arrow
closures created on every `ActiveWorkoutScreen` render (`onReorderPress={() =>
setReorderVisible(true)}`, `onSetChecked={() => handleSetChecked(workoutExercise.id)}`), so
a shallow-prop-equality memo would still see "changed props" every time and re-render
anyway. Making the memo effective would require converting those (and verifying
`handleReplacePress`/`handleAddToSupersetPress`/`handleRemoveExercise`'s own stability) to
`useCallback`s with correct dependencies — a real but non-trivial change with its own
correctness risk (a stale closure bug here would be worse than the re-render cost it
fixes). Time-boxed out of this pass per its own scope instructions; flagged for the
follow-up review or a future polish pass (this is exactly the kind of item 06 §8's own
"verified... in M2 exit review" line anticipates a profiler catching on a real device —
this static review is the best available substitute here).

## 5. 09 M2 exit criteria — evidence

Mapped bullet-by-bullet against `09-milestones-and-delivery.md`'s M2 section.

### 5.1 — "Maestro flows 1 and 3 green (08 §6)"

**Not executable in this environment** (no iOS Simulator/Maestro binary,
`docs/plan/BLOCKERS.md`, unchanged since M2-08/M2-18's own addenda). M2-18 authored
`e2e/flows/01-log-workout-smoke.yaml` and `e2e/flows/03-resume-after-kill.yaml` — both
files exist, were reviewed for correctness against 08 §6's flow descriptions and grep-
confirmed against real `testID`s in source (logged in M2-18's own `EXECUTION-LOG.md` rows),
and `nightly.yml` wires them into a macOS-runner Maestro job. Re-confirmed both flow files
are still present and structurally intact; did not re-run the testID grep independently
since no source file M2-18 grepped against has changed in the interim (checked via `git log
--stat` — nothing under `app/` touching the flows' referenced screens landed after M2-18
except this pass's own discard/finish-adjacent edits, none of which touch a testID string).
**Owner item:** actually running these on a simulator/device is the concrete next step —
`pnpm e2e` locally with Maestro installed, or watch the `nightly.yml` macOS-runner job once
pushed.

### 5.2 — "kill-resume 10/10 manual"

**Not executable in this environment** (no simulator/device to force-quit). The exact
"×10 manual force-quit loop" has no real app to force-quit against here — per this task's
own framing, the code-level equivalent is `activeWorkoutStore.crash-safety.test.ts`'s
100-seeded kill-simulation suite (§2/§3.2 above), which is strictly *more* rigorous at the
data layer than 10 manual repetitions (100 runs vs. 10, each with 10–20 randomized actions
vs. a fixed manual script, now covering the full M2-07..M2-17 action set after this pass's
fix). What that suite cannot prove is anything about the real OS's process-suspend/backing-
store behavior, cold-launch timing, or UI-thread resume correctness — those need a real
device. **Owner item (O-09):** run the actual 10/10 force-quit drill on a physical device,
plus the device-restart variant this task's "How" section calls out as O-09's own addition
to the standard drill.

### 5.3 — "notification drill on physical device"

**Owner item (O-09), by design** — `M2-tasks.md`'s own header text states this explicitly
("The physical-device notification drill needs a real iPhone... the on-device lock-screen
check is owner verification (O-09) and does not block M3 starting"). What's verifiable
headless: notification *scheduling* — `restTimerStore.test.ts`'s "notification scheduling
calls match endsAt after each adjustment" suite (§2 above) proves the app calls
`scheduleRestNotification`/`cancelNotification` with the right arguments at the right
moments, against a fully mocked `expo-notifications`. What it cannot prove: real lock-screen
delivery, sound playback, or OS-level timing accuracy — those require the physical device
O-09 names.

### 5.4 — "Domain suites green: volume, calculators, units, previous-values, timers (08 §4.2–4.5, 4.10)"

**Met** — see §2 above for the full per-suite breakdown; all green as part of §1's CI run.

### 5.5 — "Keypress-to-paint < 50 ms measured"

**Not measurable in this environment** — this is a real-device/simulator timing
measurement (React DevTools Profiler or a `performance.now()` delta around a rendered
`TextInput`'s commit), and there is no way to produce a number here that means anything
about real native paint timing; a Jest-environment timestamp would not be representative
and this pass deliberately does not fabricate one (the task's own explicit instruction).
What this pass *can* and does provide: the re-render-discipline evidence in §4 above,
including a runtime-executed test proving the per-row isolation the 50 ms budget depends
on architecturally, plus this concrete owner measurement recipe:

1. Build a dev client (`npx expo run:ios` or an EAS dev build) and open the logger with an
   exercise added.
2. Easiest: React DevTools Profiler — attach, start recording, type one digit into a set's
   weight field, stop recording, read the commit duration for `ConnectedSetRow`'s own
   commit (not the whole tree) in the flame graph.
3. Alternative (no DevTools needed): temporarily wrap `ConnectedSetRow.tsx`'s
   `handleChangeValue` with `const t0 = performance.now(); ...; requestAnimationFrame(() =>
   console.log('keypress-to-paint', performance.now() - t0))` — the `requestAnimationFrame`
   callback fires after the next paint, giving a real "keypress to next paint" delta in the
   Metro log. Remove before committing (dev-only instrumentation).
4. Record the number in a follow-up addendum to this checklist or `BLOCKERS.md` once a
   device/simulator is available.

### 5.6 — "the 20-minute logging drill (08 §7) passes"

**Met, at the data-integrity layer this environment can prove.** New test
`activeWorkoutStore.logging-drill.test.ts` (`bc2dccc`, §3.1/§4 context above) scripts
exactly the drill's own ingredient list — 5 exercises, a superset (Bench Press ↔ Cable
Row), a drop set (Squat), warm-up sets (Bench Press), RPE (Bench Press's working sets), and
one intentionally-unchecked set (Bicep Curl) to prove `finish()` drops it cleanly — through
the real store/repo/SQLite stack, and asserts the saved DB state has zero data
errors/mismatches: correct set counts, types, and positions per exercise; superset grouping
preserved on exactly the two intended members; and a volume total that round-trips
byte-for-byte from intended-input through store → repo → SQLite → read-back. This test
passed on its first run with no bug found. **What it cannot prove** (explicitly, per this
task's own framing): "zero mistaps caused by layout" is a claim about a human tapping a
real rendered screen at typing speed — that half of the drill remains an owner item, best
combined with the keypress-to-paint device session above (§5.5) since both need the same
real-device setup.

### 5.7 — "Owner starts dogfooding real workouts from here"

**Ready, pending owner action.** Nothing in this pass's findings (one P2 fixed, two P2s
flagged for the follow-up review, zero P0/P1) blocks dogfooding. Recommendation: proceed
per O-12.

## 6. 08 §7 manual QA checklist — additional mapping

Items from 08 §7 not already covered by §5 above, per this task's explicit instruction to
map each one to real evidence or an honest "not verifiable here" disclosure.

- **Device matrix** (owner's iPhone, SE-class simulator, Dynamic Island device, dark/light,
  Dynamic Type 100%/140%): **owner item**, unchanged from every prior milestone's identical
  disclosure — no simulator/device exists in this environment.
- **Backgrounding drill — timer + lock screen**: lock-screen delivery/sound is the §5.3
  owner item above. The **±15 s honored** math is proven headless by
  `restTimerStore.test.ts`'s clamp suite (§2). **Airplane mode**: pre-MC (this milestone),
  08 §7's own spec says "no behavioral change at all" is the expected/correct result —
  nothing in M2's scope touches network state, so this is a no-op by design, not an
  untested gap; confirmed by inspection that no M2 code path branches on connectivity.
- **A11y pass**: explicitly out of scope for M2 (08 §7 marks this M6).
- **Data integrity audit**: explicitly out of scope for M2 (08 §7 marks this M5+).
- **Perf spot-checks — cold start < 1.5 s**: **owner item**, same posture as M0/M1's own
  checklists (no device to measure wall-clock cold start on). `1000-workout history scroll`
  is explicitly M4 scope (M2's history is the minimal plain-list per `09`'s own M2 scope
  text) — not applicable yet.

## 7. Verdict

**M2 milestone: zero P0/P1 open.** One real P1-adjacent gap was found and fixed within this
pass with a regression test each (rest-timer notification surviving a discarded workout,
`48da95c` — assessed P2 per the bug bar but fixed regardless since it sat directly on this
task's own re-check list) and one real crash-safety coverage gap was found and closed
(`52f9ec8`, not a correctness bug — the store was already right, the *test* wasn't
exercising four real M2-07..M2-17 actions). A silently-red `pnpm run ci` (expo-doctor,
`ad03eb1`) was also found and fixed, the same class of gap M1's own exit checklist caught.
Two further P2 observations (orphaned single-member superset after `finish()`;
delete-a-set-with-a-running-timer not cancelling it) were deliberately left unfixed and
flagged for the follow-up milestone-wide review, consistent with this task's own
scoped/time-boxed sweep instruction and 08 §8's bug bar (P2 does not block a milestone
exit).

- CI green end-to-end: typecheck, lint, 123 suites / 1407 tests with all four active
  coverage thresholds held with real margin, expo-doctor 21/21, expo export bundles
  cleanly (46 MB).
- Every 08 §4.2–4.5, 4.8, 4.9, 4.10 named case spot-checked and confirmed to genuinely
  exist as its own test, not just inferred from a correctly-named suite file.
- Finish-flow (M2-14) data-integrity re-trace: clean, atomic, no data-loss path found.
- Crash-safety suite (M2-03) now genuinely covers the full M2-01..M2-17 store action set,
  re-confirmed green at 100 seeds.
- Rest-timer notification cancellation (M2-10/M2-14): one real gap found and fixed with
  regression tests on both call sites.
- Re-render discipline (06 §8): `SetRow`/`ConnectedSetRow` memoization and per-set selector
  scoping confirmed both statically and by a real executed isolation test; one flagged,
  unfixed gap (`ExerciseCard` non-memoization, itself currently a no-op fix without a
  companion `useCallback` pass) documented for follow-up, not on the hot keypress path.
- 20-minute logging drill: scripted data-integrity equivalent written and passing.
- Every exit criterion from `09`'s M2 section and 08 §7's manual checklist is mapped to
  either real evidence or an explicit, concrete owner-measurement item (§5, §6) — nothing
  silently skipped.

**Not verifiable in this environment** (no simulator/device, per `docs/plan/BLOCKERS.md`,
unchanged posture from every prior milestone): Maestro flows 1/3 execution, the physical
kill-resume ×10 drill (data-layer equivalent done, OS-level behavior is the owner's to
verify), the lock-screen notification drill (O-09), keypress-to-paint/check-to-feedback
timing (concrete measurement recipe provided, §5.5), device-matrix visual QA, and cold-start
timing. These are owner re-measurement/re-verification items once device access exists, the
same posture M0's and M1's own checklists carried forward — not new gaps introduced here.

**M2 exit criteria are met** to the extent verifiable in this headless environment, with
zero P0/P1 open and a clear, itemized handoff list for the owner's device-dependent
verification pass before/during dogfooding (O-12).
