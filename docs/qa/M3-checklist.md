# M3 Exit Checklist — Routines & Folders

Milestone-close verification for M3, per `docs/plan/tasks/M3-tasks.md` (M3-08) and the M3
exit criteria in `docs/plan/09-milestones-and-delivery.md`. This is the "milestone exit =
tag `v0.<M>.0` + checklist file committed under `docs/qa/`" artifact, same convention
`docs/qa/M0-checklist.md`/`docs/qa/M1-checklist.md`/`docs/qa/M2-checklist.md` established.

**Scope of this pass:** the M3-08 exit gate itself — author Maestro flow 2 (08 §6 item 2),
run the full CI gate, re-confirm the M3-06 routine-diff fixture suite, sweep every acceptance
box in `docs/plan/04-feature-spec-routines-history-stats.md` §1–2 against real test coverage
(both themes where the criteria call for it), fix any P0/P1 found (with regression tests),
and tag the milestone. This is **not** a from-scratch independent re-review of all 8 M3
tasks' source against their own acceptance gates — that class of pass is what M2's own
`docs/qa/M2-checklist.md` §8 did as a distinct, later, separate pass ("M2 independent
milestone-wide review") after its own §1–7 exit gate closed; M3-08's task brief asks for the
exit-gate shape (§1–7 of that precedent), not §8's follow-up shape, and no such follow-up task
exists on `M3-tasks.md`'s 8-task list. If one is wanted later, it is legitimate, separate scope,
same as M2's.

Verified at commit `36a5818` (tip of `users/tejitpabari/init` at the start of this task, after
M3-01..M3-07 and their review-fix passes). Fixes/additions landed during this pass: the new
Maestro flow file itself, two RNTL regression tests (folder rename, rest-timer picker wiring —
see §3 below), and this checklist.

---

## 1. Environment posture (unchanged from every prior milestone)

Headless Linux sandbox: no macOS/Xcode/iOS Simulator/Maestro binary
(`docs/plan/BLOCKERS.md`). Maestro flows can be **authored and testID-verified against real
source**, never **executed**, exactly the posture M2-18 established for flows 01/03/07 and
M2's own exit checklist (§5.1) re-confirmed. Nothing about this pass changes that constraint;
every claim below is scoped honestly to what is actually verifiable here.

## 2. Maestro flow 2 (08 §6 item 2) — authored, testID-verified, not executed

New file: `e2e/flows/02-create-routine-and-start.yaml`. Covers 08 §6 item 2 verbatim: new
routine → 2 exercises (Barbell Bench Press - Medium Grip, Barbell Squat), rep range 6-8 +
90 s rest timer on each → save → start → placeholders show targets (`"6-8"` in the PREVIOUS
column, per `domain/previous-values.ts`'s deliberate "a rep-range target never autofills a
concrete REPS number" rule) → log Bench at 65 kg × 7 (a material weight-target change, 7 still
inside the 6-8 range) and Squat at 80 kg × 7 (matches its own target, still in-range) → finish
→ "Update routine?" prompt (exact title/message/button text read verbatim from
`ActiveWorkoutScreen.tsx:609-627`) → accept → reopen the routine editor → Bench's weight target
now reads 65 (was 60), both exercises' 6-8 range preserved verbatim (7 was in-range, so per 04
§2.4 only the weight target rewrites) — the concrete, assertable form of "routine shows new
targets," not just "something changed."

**Every testID referenced was grep-confirmed against real source at authoring time** (the same
method M2-18 used for flows 01/03/07, `docs/plan/BLOCKERS.md`'s M2-18 update). File-line audit
(also in the flow file's own header comment):

| testID / selector | Source |
|---|---|
| `new-routine-button` | `RoutinesHubScreen.tsx:507` |
| `routine-editor-screen(-title-input\|-cancel\|-save\|-add-exercise\|-exercise-picker)` | `RoutineEditorScreen.tsx:144,329,334,346,401,410` |
| `routine-editor-screen-card-<exerciseId>` (deterministic — keyed on the *library* exercise id, not a per-run uuid) | `RoutineEditorScreen.tsx:378` |
| `<card>-rest-timer-row`, `<card>-rest-timer-sheet`, `<card>-table`, `<card>-table-row-<n>`, `<card>-add-set` | `RoutineExerciseCard.tsx:243,256,266,285,316` |
| `<card>-table-header-reps-press` (bulk rep-range toggle) | `SetTable.tsx:106-116` |
| `<row>-value-weight`, `<row>-value-reps`, `<row>-value-reps_from`, `<row>-value-reps_to` | `SetRow.tsx:421,436,451` |
| `<rest-timer-sheet>-wheel-option-90`, `-done` | `WheelPicker.tsx:119`, `RestTimerSheet.tsx:76,82` |
| `exercise-row-<id>` (dataset-static id, confirmed via a direct read of `assets/exercise-db.json`: `Barbell_Bench_Press_-_Medium_Grip` and `Barbell_Squat`, both `weight_reps`) | `ExerciseRow.tsx:113` |
| `routine-editor-screen-exercise-picker(-search\|-confirm)` (shared sheet, same component flow 1 already audited) | `ActiveWorkoutScreen.tsx:1078`-equivalent wiring in `RoutineEditorScreen.tsx:410` |
| `routine-card-<id>(-start\|-menu)` | `FolderSection.tsx:187/218`, `RoutineCard.tsx:66,87` |
| `routine-actions-sheet-edit` | `RoutinesHubScreen.tsx:604-609` |
| `active-workout(-finish)`, `active-workout-exercise-<id>-table-row-<n>-*` | `ActiveWorkoutScreen.tsx:214,922,985`, `ExerciseSetTableSection.tsx:267` |
| `active-workout-save-sheet(-save)` | `ActiveWorkoutScreen.tsx:1063-1064`, `SaveWorkoutSheet.tsx:80,317` |
| `history-detail-stat-volume` | already audited by flow 1 (M2-18) |
| "Update routine?" Alert title/message/buttons | `ActiveWorkoutScreen.tsx:609-627`, read verbatim |

Two mechanics worth calling out explicitly (both documented in the flow file's own header):

- The active-workout screen's exercise-card prefix (`active-workout-exercise-<workoutExerciseId>`)
  **is** a fresh per-run uuid (unlike the routine-editor's own deterministic
  `-card-<libraryExerciseId>` prefix) — the flow disambiguates Bench's card from Squat's via
  Maestro's `index` selector field (Bench = routine-exercise 0 = first-rendered card, index 0;
  Squat = index 1), the same regex-selector convention flows 1/3 established, extended with
  `index` since this flow (unlike 1/3) has two exercise cards on screen at once.
- A rep-range target's REPS input itself never shows `"6-8"` — that string only ever renders in
  the read-only PREVIOUS cell (`domain/previous-values.ts`'s `autofillFrom()` deliberately nulls
  `reps` for a range target, confirmed by reading that function directly) — so the "placeholders
  show targets" assertion is `assertVisible: text: ".*6-8.*"` against the PREVIOUS cell's text,
  not the REPS input's own value, matching 04 §2.3's "a rep-range placeholder never
  auto-commits" decision precisely rather than asserting something that can't be true.

**Not executed** — no simulator/Maestro binary in this sandbox, unchanged constraint. This is
the furthest a flow file's content can be validated without a real rendered app.

## 3. Manual/static QA sweep — 04 §1–2 acceptance boxes

Every checkbox from `docs/plan/04-feature-spec-routines-history-stats.md` §1 and §2, mapped to
a real, currently-green test (file + specific `it(...)` title, not just a correctly-named
suite file — same discipline M2-checklist §2 used). Where a box has a physical/visual half
(gesture feel, frame rate, on-device rendering), that half is explicitly named as deferred —
never silently skipped — per the M2-08/M3-03 `BLOCKERS.md` precedent for exactly this split.

### §1 — Workout tab (routines hub)

- **"Create/rename/delete folder; collapse state persists across launches."**
  - Create: `RoutinesHubScreen.test.tsx` — "the folder-plus icon opens the FolderNameSheet and
    creates a folder via createFolder."
  - Rename: **gap found and closed this pass** (see below) — `RoutinesHubScreen.test.tsx` — new
    "⋯ → Rename pre-fills the current title and renames via repository.renameFolder."
  - Delete: `RoutinesHubScreen.test.tsx` — "'Keep Routines' moves the folder's routines to My
    Routines instead of deleting them" / "'Delete N Routines Too' cascades the delete."
  - Collapse persists: `RoutinesHubScreen.test.tsx` — "collapsing a folder hides its routine
    cards and persists via setFolderCollapsed" (UI wiring) + `routine-repository.folders.test.ts`
    — "persists collapsed state" (real `better-sqlite3` write + read-back, the actual
    "across launches" durability proof — a fresh query against the same on-disk state reads the
    persisted value, which is what a real relaunch does too).
  - Both themes: `RoutinesHubScreen.test.tsx` — "renders in dark theme" / "renders in light
    theme."
- **"Drag routine between folders persists; order stable after relaunch."**
  - Persistence: `RoutinesHubScreen.test.tsx` — "dragging a routine onto a different folder's
    header moves it there (moveToFolder) and persists the new order (reorderRoutines) — 04 §1
    acceptance"; pure position math in `routine-reorder.test.ts`; folder-level analogue —
    "dragging a folder before another folder calls reorderFolders with the new order."
  - **Deferred, unchanged from M3-03's own `BLOCKERS.md` entry:** on-device gesture feel,
    `react-native-reanimated-dnd`'s real collision detection, and "no frame drops on a
    30-routine list" all remain manual/physical-only checks with no Jest/RNTL equivalent — this
    pass re-confirms that posture, it does not re-litigate it (M3-03's own entry already gives
    the full reasoning).
- **"Folder delete offers both paths and both work."** — Met, both paths tested (cited above).

### §2 — Routines

- **"Rep-range entry (6–8) in editor displays as `6-8` target placeholder in logger and never
  auto-commits reps."**
  - Editor entry: `RoutineEditorScreen.test.tsx` — "typing into the from/to inputs and blurring
    commits repRangeStart/End with reps cleared" (uses these exact values, 6/8); "tapping the
    REPS header toggles every set in the exercise into range mode (bulk)"; "long-pressing a
    single row toggles just that row back to a single value, clearing the range"; save
    round-trip — "creates a routine with one single-value set and one ranged set on the same
    exercise, and getFull reflects the exact XOR shape."
  - Logger placeholder + never-auto-commits: `domain/previous-values.test.ts` — "a rep-range
    routine target autofills weight but leaves reps null (04 §2.3: never a committable number)";
    `workout-repository.lifecycle.test.ts` — "copies a rep-range set as a bare unchecked
    'normal' row (target itself lives only on routine_sets, never on sets)."
  - Both themes: `RoutineEditorScreen.test.tsx` — "renders in dark theme" / "renders in light
    theme."
- **"Save as Routine from history reproduces structure incl. supersets and rest timers."**
  - `routine-repository.from-workout.test.ts` (M3-01) — the `createFromWorkout` structure-
    fidelity case (supersets/rest timers/notes/achieved-values-as-fixed-targets), re-run green
    this pass; `HistoryDetailScreen.test.tsx` (M3-07) — the "Save as Routine" UI-wiring case
    (success path + error-alert-no-navigate).
- **"Update-routine correctly rewrites targets from actuals; in-range reps preserve the range;
  declining leaves routine untouched."**
  - `src/domain/__tests__/routine-diff.test.ts` — 36 cases (re-run this pass: **36/36 green**,
    see §4), covering every 02 §14.4 material-change shape plus the M3-06 review-fix's own
    skip-a-middle-set correlation bug and its regression cases.
  - `routine-repository.from-workout.test.ts` — `updateFromWorkout`'s own describe block: value
    rewrite + `updated_at` bump, in-range/boundary/out-of-range rep preservation, decline-
    leaves-routine-byte-identical (`getFull` deep-equal).
  - `ActiveWorkoutScreen.test.tsx` — "update-routine prompt" describe block: material diff shows
    the prompt and Keep-original leaves the routine untouched; Update-routine writes back and
    invalidates both query keys; unchanged finish never shows the prompt; deleted source routine
    skips it.
- **"Deleting a routine leaves its historical workouts intact and renderable."**
  - `routine-repository.crud.test.ts` (M3-01) — soft-reference `routine_id` survival at the DB
    layer. `HistoryDetailScreen.test.tsx` (M3-07) — the three routine-subtitle render states
    (none / "From {title}" / "(deleted routine)"), proving the soft reference actually *renders*
    correctly, not just survives at the data layer.

### Two real coverage gaps found and closed this pass (not P0/P1 bugs — see reasoning)

Both are the exact shape M2-19's own exit gate found in the crash-safety action-set sweep:
already-correct, already-wired code with a genuine zero-test gap on an explicitly spec-named
acceptance behavior, closed the same pass they were found rather than deferred, per this
project's established convention (M2-checklist §3.2/§3.3, §8.2 all did the same).

1. **Folder ⋯ → Rename had no RNTL test.** `renameFolder` itself was fully integration-tested
   since M3-01 (`routine-repository.folders.test.ts` — "renames and bumps updatedAt" etc.), and
   `RoutinesHubScreen.tsx`'s own `handleFolderNameSave` "rename" branch + `FolderNameSheet`'s
   `initialValue` prefill both read correct on inspection — but unlike its Create/Delete
   siblings in the exact same test file, no test ever drove ⋯ → Rename → (title pre-filled) →
   Save → `repository.renameFolder` end to end. 04 §1's own acceptance line is literally
   "Create/rename/delete folder." **Fixed by adding the test**, not the code (no bug found):
   `RoutinesHubScreen.test.tsx`, new describe block "RoutinesHubScreen — folder rename (04 §1
   acceptance, M3-08 coverage gap closed)" — opens the sheet, asserts the input is pre-filled
   with the folder's current title, retypes it, saves, asserts `repository.renameFolder` was
   actually called and the folder's id is unchanged (only the title moved).
2. **The routine editor's rest-timer picker (row-tap or ⋯ → "Rest Timer," both open the same
   `RestTimerSheet`) had no RNTL test either.** The pure mutator
   (`updateDraftExerciseRestSeconds`) was already unit-tested (`routine-draft.test.ts` —
   "patches only the matching exercise"), but no test drove the actual sheet interaction (open →
   pick a wheel option → row label updates → value survives Save) the way every other ⋯-menu
   item in the same describe block already did (Reorder/Replace/Superset/Note/Remove all had
   their own case; Rest Timer was named in the block's own header comment but never exercised).
   **Fixed by adding the test**, not the code: `RoutineEditorScreen.test.tsx`, new case "⋯ → Rest
   Timer opens the wheel picker; picking 90 s updates the row label and survives Save" — the
   fixture's own `defaultRestSeconds` is deliberately overridden to `null` (Off) for this one
   test (the file's own default is 90, which would make a real "did the picker actually change
   anything" bug invisible), opens the sheet via the ⋯ menu, taps the `90` wheel option, asserts
   the row label flips from "Rest Timer: Off" to "Rest Timer: 1min 30s" live, then saves and
   confirms `getFull` reads `restSeconds: 90` back.

Neither is a P0/P1 (or any severity) bug per 08 §8's bug bar — both features already worked
correctly, confirmed by reading the implementation directly before writing either test. Both are
now closed, real regression coverage for explicitly spec-named (04 §1/§2.1) interactions that
had none.

## 4. M3-06 routine-diff fixture suite — re-confirmed green

`docs/plan/tasks/M3-tasks.md`'s own M3 exit line names this explicitly ("Diff/update-routine
unit tests green (fixture matrix 08 §4.9)"). Re-run in isolation this pass:

```
PASS node src/domain/__tests__/routine-diff.test.ts
Test Suites: 1 passed, 1 total
Tests:       36 passed, 36 total
```

All 36 cases green, including the M3-06 review-fix's own regression additions (skip-a-middle-set
set correlation, the two-middle-sets-skipped variant, the direct `matchWorkoutSetsToRoutineSets`
unit-test block). Also green as part of the full suite run below.

## 5. Full CI gate (`pnpm run ci`)

Same four-step gate `.github/workflows/ci.yml` runs: `tsc --noEmit` → `eslint .` → `pnpm test
-- --coverage` → `npx expo-doctor` → `npx expo export --platform ios`.

Ran clean on the first attempt this pass (no silently-red gate found, unlike M2-19's
`expo-doctor` peer-dependency find) — re-run a second time after adding this pass's own two new
regression tests (§3), for a final, fully-inclusive number:

```
Test Suites: 132 passed, 132 total
Tests:       1679 passed, 1679 total
Snapshots:   0 total
Time:        ~122s
Ran all test suites in 2 projects.

Running 21 checks on your project...
21/21 checks passed. No issues detected!

Exported: dist
```

Coverage (all active thresholds from `jest.config.js` — `src/domain/**`, `src/data/**`,
`src/features/workout/**`, global — held with real margin; `src/features/routines/**` has no
dedicated threshold entry, consistent with 08 §3's own table, which names only domain/data/
workout/global, not every feature folder):

| Area | Threshold | Actual |
|---|---|---|
| `src/domain/**` | 95% / 90% | 99.84% / 98.06% |
| `src/data/**` | 90% / 85% | 100% lines every subdir except `src/data/workouts` (97.41% lines / 93.08% branches, still comfortably above floor) |
| `src/features/workout/**` | 85% / 80% | 97.56% / 89.97% |
| global | 75% / 70% | 96.91% / 89.33% / 91.17% (fn) / 97.18% (line) |

1679 tests total — 1677 (M3-07's own baseline, confirmed by an initial from-clean `pnpm test
-- --coverage` run before any of this pass's own edits) + 2 new (the rename and rest-timer
regression tests above).

## 6. 09 M3 exit criteria — evidence

Mapped bullet-by-bullet against `09-milestones-and-delivery.md`'s M3 section.

### 6.1 — "Maestro flow 2 green (08 §6)"

**Not executable in this environment** (no iOS Simulator/Maestro binary,
`docs/plan/BLOCKERS.md`, unchanged posture from every prior milestone). `e2e/flows/
02-create-routine-and-start.yaml` is authored, every testID grep-confirmed against real source
(§2 above), matching M2-18's own established method exactly. **Owner item:** running it for
real is the concrete next step — `maestro test e2e/flows/02-create-routine-and-start.yaml`
locally with Maestro installed and a built simulator app, or via `nightly.yml`'s macOS-runner
job once this file is wired into it (that wiring itself is out of this task's own scope —
`nightly.yml` was authored by M2-18 to run `e2e/flows/` broadly, so flow 2 is already reachable
by that existing glob without any workflow-file edit; confirmed by reading `nightly.yml`'s
Maestro step, which globs the whole `e2e/flows/` directory rather than naming files
individually).

### 6.2 — "Routine acceptance criteria (04 §2) pass"

**Met**, to the extent verifiable in this headless environment — every §2 acceptance box (and
every §1 box, since 09's own M3 scope line covers the whole feature, not just §2) mapped to a
real, currently-green test in §3 above, two real coverage gaps found and closed with regression
tests, zero P0/P1 found on the explicit boxes swept.

### 6.3 — "Diff/update-routine unit tests green (fixture matrix 08 §4.9)"

**Met** — §4 above, 36/36 green, re-confirmed in isolation and as part of the full suite.

## 7. Verdict

**M3 milestone: zero P0/P1 open.** Two real test-coverage gaps were found during the acceptance-
box sweep and closed within this same pass (folder rename's UI-wiring test, the routine editor's
rest-timer-picker UI-wiring test) — both are the "already-correct code, missing wiring-level
test" shape 08 §8's bug bar does not classify as any severity of bug, and both were confirmed
correct-by-inspection before a test was written for either, per this task's own "don't invent
problems" instruction. No silently-red CI gate was found this pass (unlike M2-19's `expo-doctor`
peer-dependency find) — `pnpm run ci` was green on first attempt and re-confirmed green after
this pass's own two additions.

- Maestro flow 2 authored and testID-verified (not executed — no simulator here, stated
  plainly, not claimed as run).
- M3-06's routine-diff fixture suite: 36/36 green, re-confirmed in isolation and in the full
  suite.
- Full `pnpm run ci` gate green end to end: typecheck, lint, **132 suites / 1679 tests**, all
  active coverage thresholds held with real margin, `expo-doctor` 21/21, `expo export` bundles
  cleanly.
- Every `04` §1–2 acceptance box mapped to a real, named, currently-green test — both-theme
  smoke coverage confirmed for both `RoutinesHubScreen` and `RoutineEditorScreen`; the one
  physical/gesture-feel half (drag-reorder frame rate/collision feel) remains an explicit,
  previously-documented `BLOCKERS.md` deferral (M3-03's own entry), not silently skipped or
  re-litigated here.
- Zero P0/P1 found or open. Two coverage gaps found and closed with regression tests (§3).

**Not verifiable in this environment** (no simulator/device, per `docs/plan/BLOCKERS.md`,
unchanged posture from every prior milestone): actually running Maestro flow 2, and the
on-device drag-reorder gesture-feel/frame-rate half of M3-03's own acceptance line. Both are
owner/device-dependent re-verification items, the same posture every prior milestone's checklist
carried forward — not new gaps introduced here.

**M3 exit criteria are met** to the extent verifiable in this headless environment, with zero
P0/P1 open. Tagged `v0.3.0-m3` (annotated, not pushed, mirroring M2's own `v0.2.0-m2` — see
`git tag -l` / `git log` around the M2 exit commit for the precedent this follows). Working tree
clean after all commits.
