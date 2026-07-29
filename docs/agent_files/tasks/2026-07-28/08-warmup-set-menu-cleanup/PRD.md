# PRD H: Warm-Up Set Menu Cleanup

**Sub-project H of 8** (independent — no dependency on A–G). Smallest PRD in the decomposition: a deletion-only removal of one menu item + its dedicated sheet, now that the set-number-tap → slide-up mechanism already covers marking a set as a warm-up.

## 1. Problem

The exercise-card ⋯ menu (`ExerciseCardMenuSheet`) has two ways to touch a set's warm-up status today:

1. **"Add Warm-Up Sets"** (Flame icon) → opens `AddWarmUpSetsSheet`, a dedicated sheet that takes a working weight and *generates N new rows* via `domain/warmup-calc.ts`'s formula engine, inserted above the exercise's existing sets.
2. **Tap the SET-number badge on any existing row** → `ConnectedSetRow` opens a small slide-up sheet (`SET_TYPE_MENU`: Warm Up Set / Normal Set / Failure Set / Drop Set, plus Remove Set) that *retypes an existing set* via `setSetType(setId, type)`.

The user wants (1) removed entirely and (2) kept as-is. Two menu entry points into overlapping territory (one bespoke sheet, one already-generalized per-row menu) is redundant UI surface, and the per-row menu is the mechanism the rest of the app's other set-type toggles (Normal/Failure/Drop) already use — "Add Warm-Up Sets" is the odd one out, a bespoke generator sitting next to a generic type-switcher.

## 2. Goals

- Remove the "Add Warm-Up Sets" ⋯-menu item and its `AddWarmUpSetsSheet` entirely — no dead imports, no orphaned handler props, no broken store methods with zero callers left dangling in production code.
- Leave the set-number-tap → slide-up set-type menu (`ConnectedSetRow`'s `SET_TYPE_MENU` / `menuVisible` sheet) completely untouched — it already does what the user is asking to keep.
- Leave every other ⋯-menu item (Reorder, Replace, Add/Remove Superset, Add a Note, Rest Timer, Remove Exercise) untouched.
- Resolve, not defer, the fate of `domain/warmup-calc.ts` and `activeWorkoutStore.addWarmUpSets`/`WorkoutRepository.insertWarmupSets` — every downstream call site was enumerated below before deciding.

## 3. Non-Goals

- Do not modify `ConnectedSetRow.tsx`'s set-type slide-up mechanism, its menu contents, or its store call (`setSetType`) in any way.
- Do not touch any other `ExerciseCardMenuSheet` item (Reorder Exercises, Replace Exercise, Add/Remove Superset, Add a Note, Rest Timer, Remove Exercise).
- Do not add any *new* capability (e.g., no "generate warm-up weight suggestion" affordance inside the set-type menu) — this is a pure removal, not a re-implementation.
- Do not touch the historical planning docs (`docs/plan/02-feature-spec-workout-logging.md`, `docs/plan/05-data-model-and-storage.md`, `docs/plan/tasks/M2-tasks.md`, `docs/plan/tasks/M0-tasks.md`, `docs/plan/tasks/TASKS-INDEX.md`, `docs/plan/EXECUTION-LOG.md`, `docs/qa/M2-checklist.md`, `docs/plan/research/hevy-deep-dive.md`) that describe M2-16's original "Add Warm-Up Sets" feature — these are a dated historical record of what shipped in that milestone, not living UI documentation; see §9 for the explicit decision.
- Do not remove `settings.warmup_calc` from the settings schema (`data/settings/settings-schema.ts`) — that is a stored-data/migration concern, out of scope for a UI-menu-cleanup PRD; see §9.

## 4. Architecture Decisions

### 4.1 Confirmed facts (file/line, read directly)

- **`src/features/workout/ExerciseCardMenuSheet.tsx`**: `Flame` icon import (line 14), `onAddWarmUpSets: () => void` prop (line 36), destructured at line 54, and rendered as a `ListRow` at lines 97–102 (`title="Add Warm-Up Sets"`, `testID={${testID}-warmup-sets}`, `onPress={dismissThen(onAddWarmUpSets)}`), positioned between the superset item and "Add a Note".
- **`src/features/workout/AddWarmUpSetsSheet.tsx`** (216 lines, whole file in scope for deletion): a `Sheet` with one `NumericInput` (working weight, pre-filled from the first `normal` set's `weightKg` or, failing that, the PREVIOUS-values query's non-warmup bucket-0 weight) and a `Generate` `Button`. `handleGenerate` (lines 153–177) resolves rounding via `resolveWarmupRounding`, calls `warmupSets(parsedWeight, warmupCalc.sets, rounding)` from `domain/warmup-calc.ts`, and inserts the resulting rows via `useStore.getState().addWarmUpSets(workoutExerciseId, rows)`.
- **`src/features/workout/ExerciseCard.tsx`**: imports `AddWarmUpSetsSheet` (line 50), `warmUpSheetVisible` state (line 121), `handleAddWarmUpSets` handler (lines 139–141, just flips the visibility flag), wired as `onAddWarmUpSets={handleAddWarmUpSets}` into `ExerciseCardMenuSheet` (line 244), and the `<AddWarmUpSetsSheet .../>` JSX block (lines 275–286) passing `workoutExerciseId`, `exerciseId`, `equipment`, `weightUnit`, `previousValuesMode`, `routineId`, `previousSetsExcludeWorkoutId`. The file header's doc comment (lines 18–22) also describes this item and must be rewritten, not just the code.
- **`src/features/workout/ConnectedSetRow.tsx`**: `SetTypeBadge` (via `ui/SetRow.tsx`) is wrapped in a `Pressable` whose `onSetCellPress` (line 732) is `() => setMenuVisible(true)`. `SET_TYPE_MENU` (lines 160–165) lists Warm Up Set / Normal Set / Failure Set / Drop Set; `handleSelectSetType` (lines 676–679) calls `useStore.getState().setSetType(setId, type)`, closing the menu first. This is a **pure type reclassification of an existing row** — it has no notion of generating N new rows, no working-weight input, and no formula/rounding logic. Confirmed **not touched** by this PRD.
- **`src/domain/warmup-calc.ts`** (186 lines): pure, I/O-free formula engine — `warmupSets()` (percent-of-working-weight formula rows with round-half-up increment rounding and a barbell-floor clamp) plus `resolveWarmupRounding()` (the one unit-aware piece, kg→lb conversion of `settings.warmup_calc`'s increments). Its own file header states the feature layer that owns it is `AddWarmUpSetsSheet.tsx` — confirmed by grep: `warmup-calc` appears only in `AddWarmUpSetsSheet.tsx` (import), `plate-calc.ts` (comment citation, not an import), and its own test file. **Zero other production call sites.**

### 4.2 What capability is genuinely lost (verified, not assumed)

Confirmed by reading both components: `AddWarmUpSetsSheet` does two things `ConnectedSetRow`'s set-type menu cannot —

1. **Batch-generate N rows in one action**, instead of the user manually pressing "+ Add Set" N times.
2. **Auto-calculate each row's warm-up weight** from a formula (`settings.warmup_calc.sets`, default: bar × 10 reps, 40% × 8, 60% × 5, 80% × 3) with barbell-floor clamping and increment rounding — instead of the user typing each weight by hand.

After this PRD ships, a user who wants warm-up sets must: press "+ Add Set" N times, tap each new row's SET badge → Warm Up Set, then type each row's weight/reps manually. This is a real, deliberate capability reduction — decided in §9, not silently absorbed.

### 4.3 Removal / edit list

**Delete outright:**
- `src/features/workout/AddWarmUpSetsSheet.tsx`
- `src/features/workout/__tests__/AddWarmUpSetsSheet.test.tsx` (325 lines)
- `src/domain/warmup-calc.ts` — orphaned once `AddWarmUpSetsSheet.tsx` is gone (its only production importer); see §4.4 for why this is treated differently from the store/repo layer below.
- `src/domain/__tests__/warmup-calc.test.ts` (186 lines) — tests only the file being deleted.

**Edit (menu + parent wiring):**
- `src/features/workout/ExerciseCardMenuSheet.tsx`: remove the `Flame` import (line 14, and drop it from the `lucide-react-native` import list), the `onAddWarmUpSets` prop (line 36) and its destructure (line 54), and the `ListRow` block (lines 97–102). Update the file header's item list (line 4) to drop "Add Warm-Up Sets ...".
- `src/features/workout/ExerciseCard.tsx`: remove the `AddWarmUpSetsSheet` import (line 50), `warmUpSheetVisible` state (line 121), `handleAddWarmUpSets` (lines 139–141), the `onAddWarmUpSets={handleAddWarmUpSets}` prop (line 244), and the `<AddWarmUpSetsSheet ... />` JSX block (lines 275–286). Rewrite the file header's "Add Warm-Up Sets (M2-16, 02 §12) is the other card-local ⋯ item..." paragraph (lines 18–22) since that item no longer exists.
- `src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`: remove `onAddWarmUpSets: jest.fn()` from `baseProps` (line 22) and the `menu-warmup-sets` press/assert pair (lines 69–70) from the "every item dismisses then fires its own callback" test; that test's final assertion `expect(props.onDismiss).toHaveBeenCalledTimes(7)` (line 81) must drop to `6` (one fewer item pressed in the sequence).
- `src/features/workout/__tests__/ExerciseCard.test.tsx`: remove the `describe('ExerciseCard — Add Warm-Up Sets (M2-16, 02 §12)', ...)` block (both `it`s, roughly lines 388–444) and the `setupBarbell` helper (lines 369–386) — grepped and confirmed `setupBarbell` has no other callers in this file. The file's shared imports (`openBetterSqlite3Driver`, `migrate`, `WorkoutRepositoryImpl`, `ExerciseRepositoryImpl`) stay: they're also used by the file's other `setup()` helper.

**Doc-comment-only touch-ups** (no functional/behavioral change — these files cite `AddWarmUpSetsSheet.tsx` by name as a precedent/pattern-sibling in their own header comments; left un-updated they'd be dangling references to a file that no longer exists, in a codebase whose commenting convention leans heavily on exact cross-file citations):
- `src/features/workout/ConnectedSetRow.tsx` (lines 279–281): its `useStore` naming-convention comment lists `AddWarmUpSetsSheet.tsx` as one of "the other three call sites of the same anti-pattern" — drop it from that list (two remaining: `ExerciseSetTableSection.tsx`, `EditWorkoutScreen.tsx`).
- `src/features/workout/workoutStoreContext.ts` (lines 4, 61): drop `AddWarmUpSetsSheet` from both mentions (the "shared full logger chrome" list and the "call this instead of importing directly" list).
- `src/features/workout/EditWorkoutScreen.tsx` (lines 30, 65): drop `AddWarmUpSetsSheet` from both component-list mentions.
- `src/features/workout/PlateCalculatorSheet.tsx` (lines 100, 107): these cite `AddWarmUpSetsSheet.tsx`'s "derive from a visible transition" pattern as prior art — reword to cite `NoteEditSheet` instead (the pattern's original source per `AddWarmUpSetsSheet.tsx`'s own line 130 comment), or simply drop the specific filename and keep the description.
- `src/features/measurements/measurement-units.ts` (lines 10, 16): same — reword the `toDisplay`/`toCanonicalKg` precedent citation to not name a deleted file (point at the pattern description only, or at `domain/units.ts` directly).
- `src/features/measurements/__tests__/LogEntrySheet.test.tsx` (line 4): reword "same convention `AddWarmUpSetsSheet.test.tsx` already establishes" to drop the filename (the convention itself — re-seeding a draft on visibility transition — still exists elsewhere, e.g. `NoteEditSheet`'s own tests).

These six are mechanical, low-risk, single-line comment edits — bundle them into the same PR as the functional removal so a future `grep AddWarmUpSetsSheet` returns nothing outside git history.

### 4.4 What stays, and why (the asymmetric call)

`activeWorkoutStore.addWarmUpSets` (interface: `src/features/workout/activeWorkoutStore.ts` lines 264–268; impl: lines 594–618) and `WorkoutRepository.insertWarmupSets` (interface: `src/data/workouts/types.ts` line 470; impl: `src/data/workouts/workout-repository.ts`; schema support: `src/data/sqlite/schema.ts`) are **kept, unchanged**, even though after this PRD ships nothing in the UI calls them. This is treated differently from `domain/warmup-calc.ts` for a concrete reason: grep confirms `addWarmUpSets`/`insertWarmupSets` still have real, independent test call sites that exercise the store/repo layer on its own merits, not through the UI being deleted:

- `src/features/workout/__tests__/activeWorkoutStore.test.ts` (lines 605–650) — the store action's own acceptance test (insert-above-existing-sets + position-shift behavior, and the DB-failure-leaves-state-unchanged error path).
- `src/features/workout/__tests__/activeWorkoutStore.logging-drill.test.ts` (lines 95–99) — part of a realistic multi-exercise logging-session simulation.
- `src/features/workout/__tests__/activeWorkoutStore.crash-safety.test.ts` (lines 24–27, 166–180) — explicitly added to this suite's fuzz-candidate action set because it was previously identified as a "core mid-session logging action... with zero crash-safety coverage." This is regression protection for an unrelated concern (crash safety of the draft-state machine), not for the warm-up feature per se.
- `src/data/workouts/__tests__/workout-repository.mutators.test.ts` — the repo mutator's own unit coverage (position-renumbering, no-op-on-empty-rows behavior).
- `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx` (line 1150) — a stub in a mocked-repository test fixture, not a real behavioral test, but it means the repository interface's shape still matters at that call site too.

Removing this pair would mean also editing `activeWorkoutStore.ts`, `data/workouts/types.ts`, `workout-repository.ts`, `data/sqlite/schema.ts`, and five test files — a blast radius entirely disproportionate to "the smallest of the 8 PRDs," and it would delete real crash-safety/regression coverage for the draft-state machine's position-renumbering logic for no product benefit (nothing calls it, so leaving it costs nothing either). `insertWarmupSets` is also a generically useful repo-layer primitive ("insert N rows at the front, renumber siblings") that isn't intrinsically UI-warmup-specific — unlike `domain/warmup-calc.ts`, which is a pure formula module whose *only* reason to exist was to feed the sheet being deleted, and which had exactly one (now-deleted) caller.

Net effect: the store action and repo mutator become unreachable from the UI but remain fully tested, documented, and available if a future PRD wants to resurrect batch-warm-up-generation through a different affordance (e.g. inside the set-type slide-up itself). No code changes needed to `activeWorkoutStore.ts`/`workout-repository.ts`/`schema.ts`/those five test files as part of this PRD.

## 5. API Change Summary

No API surface changes. `WorkoutRepository.insertWarmupSets` and `ActiveWorkoutState.addWarmUpSets` are unchanged (kept, see §4.4). No new methods added. No data-model/schema migration (the `warmup` `SetType` enum value, `settings.warmup_calc` schema field, and `workout_sets` table shape are all untouched — a `warmup`-typed row can still be created today via the set-type slide-up's "Warm Up Set" option, and `insertWarmupSets` still exists at the repo layer).

## 6. Frontend Change Summary

- `ExerciseCardMenuSheet`'s ⋯ menu drops the "Add Warm-Up Sets" row — one fewer item, between "Add/Remove Superset" and "Add a Note".
- `ExerciseCard` no longer mounts `AddWarmUpSetsSheet` or owns its visibility state.
- No visual/behavioral change to the set-number-tap → slide-up set-type menu (`ConnectedSetRow`), the SET badge, or any other ⋯-menu item.
- Net UI capability change: warm-up sets can now only be created by adding a normal set and retyping it via the per-row menu (manual weight/reps entry, no auto-calculated suggestion) — see §4.2/§9.

## 7. Testing

- Delete `AddWarmUpSetsSheet.test.tsx` and `warmup-calc.test.ts` (testing deleted code).
- Update `ExerciseCardMenuSheet.test.tsx` and `ExerciseCard.test.tsx` per §4.3's edit list — both files continue to exercise every remaining ⋯-menu item exactly as before.
- No changes needed to `activeWorkoutStore.test.ts`, `activeWorkoutStore.logging-drill.test.ts`, `activeWorkoutStore.crash-safety.test.ts`, `workout-repository.mutators.test.ts`, or `ActiveWorkoutScreen.test.tsx` — they test the (kept) store/repo layer, independent of the UI being removed (§4.4).
- No changes needed to `ConnectedSetRow.*.test.tsx` — the set-type slide-up is untouched.
- After the edits, run the full Jest suite (or at minimum `src/features/workout/__tests__/` and `src/domain/__tests__/`) plus a TypeScript build (`tsc --noEmit` or the project's equivalent) to catch any remaining dangling reference the grep sweep in §4.3 might have missed — the doc-comment-only files in particular are easy to under-edit since they don't fail the build even if left stale, so a final `grep -rn "AddWarmUpSetsSheet\|warmup-calc" src/` after implementation should return nothing outside `activeWorkoutStore.ts`/`workout-repository.ts`/`types.ts`/`schema.ts`/their tests (the kept store/repo layer, which legitimately still mentions "warmup" in identifiers/comments).

## 8. Manual Intervention Required From You

None required to unblock implementation — every decision below was resolved rather than left open, per the house format's instruction (no user available right now). Flagging for awareness, not action:

- **The capability loss in §4.2 is real and intentional.** Users lose the auto-calculated warm-up-weight suggestion (bar × 10, 40% × 8, 60% × 5, 80% × 3, barbell-floor-clamped) and the batch-insert-N-rows convenience. If this turns out to be a workflow regression users complain about, the fastest reintroduction path is *not* resurrecting `AddWarmUpSetsSheet` — it's extending the existing set-type slide-up (`ConnectedSetRow`'s `SET_TYPE_MENU`) with a "Warm Up Set (auto weight)" variant that calls the still-intact `domain/warmup-calc.ts`-equivalent math (would need to be re-added, since this PRD deletes the pure module — see below) and `addWarmUpSets`/`insertWarmupSets` (kept, still there). Worth knowing before deciding whether to actually delete `domain/warmup-calc.ts` vs. leave it stubbed — see §9 for why deletion was still chosen.
- Sanity-check that "smallest of 8 PRDs" framing is still accurate given the doc-comment sweep in §4.3 touches 6 files beyond the two functionally-changed ones — all six are one-or-two-line comment edits, not logic changes, so the actual diff size stays small even though the file count is higher than a first glance at the ask ("remove the menu item and its sheet") would suggest.

## 9. Open Questions & Decisions

- **Q: Delete or keep `domain/warmup-calc.ts`?**
  [RESOLVED: Delete, along with its test file.] Reasoning: grep confirms its *only* production importer is `AddWarmUpSetsSheet.tsx`, which this PRD deletes — after that, the module has zero callers anywhere in `src/`. Unlike the store/repo layer (§4.4), it has no independent test coverage reason to exist (its own test file only tests itself) and no other consumer. Keeping a fully orphaned pure-math module around "in case it's reused later" is exactly the kind of dead code this removal should not introduce; if warm-up auto-suggestion is reinstated in a future PRD, the module is trivially recoverable from git history (it's a small, self-contained, pure file with its own doc header explaining the formula from scratch).

- **Q: Delete or keep `activeWorkoutStore.addWarmUpSets` / `WorkoutRepository.insertWarmupSets`?**
  [RESOLVED: Keep, unchanged.] Reasoning: fully spelled out in §4.4 — real, independent test call sites (crash-safety fuzz corpus, logging-drill session simulation, the store action's own acceptance test, the repo mutator's own unit test) exercise this pair on its own merits, unrelated to the UI being deleted. Removing it would require edits across 4 non-UI production files and 5 test files, disproportionate to this PRD's scope, and would delete real crash-safety regression coverage for no product benefit (an unreachable-from-UI method costs nothing to leave in place).

- **Q: Is the capability loss (auto-calculated warm-up weight suggestion, batch-N-row insert) acceptable?**
  [RESOLVED: Yes, per the user's explicit, verbatim ask ("Add warm up set option and slide up can be removed").] The user was shown (in the task framing this PRD was generated from) that the set-type slide-up only reclassifies existing rows and does not generate/auto-calculate — and asked for the removal anyway, endorsing the slide-up as sufficient. Documented in §4.2/§6 as a deliberate, known tradeoff rather than an oversight; §8 notes the fastest reintroduction path if it's ever needed.

- **Q: Should the doc-comment-only cross-references in `ConnectedSetRow.tsx`, `workoutStoreContext.ts`, `EditWorkoutScreen.tsx`, `PlateCalculatorSheet.tsx`, `measurement-units.ts`, and `LogEntrySheet.test.tsx` be swept?**
  [RESOLVED: Yes, bundle into this PR — see §4.3's "Doc-comment-only touch-ups" list.] These are single-line, non-functional edits (rename/drop a citation to a file that no longer exists). Leaving them stale doesn't break the build or tests, but this codebase's own convention (see recent commit history, e.g. "M5 milestone-wide review" entries) treats exact cross-file doc citations as load-bearing enough to keep accurate, so the sweep is cheap insurance against a future reader following a dead reference.

- **Q: Should `settings.warmup_calc` be removed from the settings schema (`data/settings/settings-schema.ts`)?**
  [RESOLVED: No, leave in place.] It's a stored-data schema field (default formula config), not UI code — removing it is a data-model/migration decision with its own blast radius (default-value fallback behavior, any existing persisted settings blobs) that's out of scope for a menu-cleanup PRD. It's now unread by any production code path (only `AddWarmUpSetsSheet.tsx`, deleted, ever read it) but costs nothing to leave as an inert schema field, exactly like `insertWarmupSets`/`addWarmUpSets` above.

- **Q: Should the historical planning docs (`docs/plan/02-feature-spec-workout-logging.md`, `05-data-model-and-storage.md`, `tasks/M2-tasks.md`, `tasks/M0-tasks.md`, `tasks/TASKS-INDEX.md`, `EXECUTION-LOG.md`, `docs/qa/M2-checklist.md`) be updated to remove references to the now-deleted "Add Warm-Up Sets" feature?**
  [RESOLVED: No, leave untouched.] These are dated, milestone-scoped records of what M2-16 shipped at the time (the repo's convention, per `EXECUTION-LOG.md` and the dated `docs/agent_files/tasks/` structure this very PRD lives in, is to treat planning/execution docs as historical record rather than living spec that tracks current state). Rewriting shipped-milestone history to reflect a later removal is out of scope and would itself be a documentation-integrity risk (implies the feature was never built, when it was — and this PRD's own existence is the accurate record of its removal).
