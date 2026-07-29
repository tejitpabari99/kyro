# Tasks: Warm-Up Set Menu Cleanup

## Open Questions

None outstanding — all open questions were resolved directly in PRD §9 (see
PRD for reasoning); no additional assumptions were needed to write these
tasks. Every file/line reference in PRD §4.1/§4.3 was re-confirmed directly
against the current source during task authoring and matches exactly (no
line-number drift found in `ExerciseCardMenuSheet.tsx`,
`AddWarmUpSetsSheet.tsx`, `ExerciseCard.tsx`, `ExerciseCardMenuSheet.test.tsx`,
`ExerciseCard.test.tsx`, `domain/warmup-calc.ts`, `ConnectedSetRow.tsx`,
`workoutStoreContext.ts`, `EditWorkoutScreen.tsx`, `PlateCalculatorSheet.tsx`,
`measurement-units.ts`, and `LogEntrySheet.test.tsx`).

---

### Task 1 — Delete `AddWarmUpSetsSheet.tsx` and its test

- **Files:**
  - `src/features/workout/AddWarmUpSetsSheet.tsx` (delete)
  - `src/features/workout/__tests__/AddWarmUpSetsSheet.test.tsx` (delete)
- **Changes:** Delete both files outright. This is the sheet PRD §1/§4.1
  describes (working-weight input + `Generate` button, calls
  `domain/warmup-calc.ts`'s `warmupSets`/`resolveWarmupRounding` and inserts
  rows via `useStore.getState().addWarmUpSets(...)`) and its 325-line test
  file. Do this first — every other task in this list either removes a
  reference to this file or depends on it already being gone so the
  TypeScript build actually catches any missed reference.
  - Do NOT touch `activeWorkoutStore.addWarmUpSets` or
    `WorkoutRepository.insertWarmupSets` — kept unchanged per PRD §4.4/§9.
    Do not go looking for "orphaned" code in `activeWorkoutStore.ts`,
    `workout-repository.ts`, `data/workouts/types.ts`, or
    `data/sqlite/schema.ts` — explicitly out of scope.
- **Acceptance criteria:**
  - Neither file exists on disk.
  - `git status` (or equivalent) shows both as deletions, nothing else
    touched by this task.

---

### Task 2 — Delete `domain/warmup-calc.ts` and its test

- **Files:**
  - `src/domain/warmup-calc.ts` (delete)
  - `src/domain/__tests__/warmup-calc.test.ts` (delete)
- **Changes:** Delete both files outright. Per PRD §9's first resolved
  question: this pure formula module (`warmupSets` / `resolveWarmupRounding`)
  had exactly one production importer, `AddWarmUpSetsSheet.tsx`, deleted in
  Task 1 — after that it has zero callers anywhere in `src/`. Its own test
  file (186 lines) only tests itself, so it goes too.
  - Do NOT remove `settings.warmup_calc` from
    `src/data/settings/settings-schema.ts` — that's a stored-data schema
    field, explicitly kept per PRD §9 (out of scope for this PRD).
  - Confirmed by grep before writing this task: `warmup-calc` appears only
    in `AddWarmUpSetsSheet.tsx` (deleted in Task 1), `plate-calc.ts` (a
    comment citation only, not an import — leave as-is, it's not a
    functional reference and PRD §4.3 doesn't list it for touch-up), and
    `warmup-calc.test.ts` itself.
- **Acceptance criteria:**
  - Neither file exists on disk.
  - `grep -rn "warmup-calc" src/` returns only the (harmless, comment-only)
    hit in `plate-calc.ts`, nothing else.

---

### Task 3 — Remove the "Add Warm-Up Sets" item from `ExerciseCardMenuSheet.tsx`

- **Files:**
  - `src/features/workout/ExerciseCardMenuSheet.tsx`
- **Changes:** Depends on Tasks 1–2 being done first (so nothing still
  imports the deleted files once this compiles). Four edits, all confirmed
  against the current file:
  1. Remove `Flame` from the `lucide-react-native` import list (currently
     line 14 of the destructured import spanning lines 11–20):
     ```tsx
     import {
       ArrowUpDown,
       Clock,
       Link2,
       Repeat,
       StickyNote,
       Trash2,
       Unlink,
     } from 'lucide-react-native';
     ```
  2. Remove the `onAddWarmUpSets: () => void;` prop from
     `ExerciseCardMenuSheetProps` (currently line 36).
  3. Remove `onAddWarmUpSets,` from the destructured function parameters
     (currently line 54).
  4. Remove the whole `ListRow` block rendering "Add Warm-Up Sets" (currently
     lines 97–102):
     ```tsx
     <ListRow
       testID={`${testID}-warmup-sets`}
       title="Add Warm-Up Sets"
       leading={<Flame size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
       onPress={dismissThen(onAddWarmUpSets)}
     />
     ```
     Leave the `ListRow` blocks immediately before it (Add/Remove Superset)
     and after it ("Add a Note") untouched and adjacent — the menu should
     read Reorder → Replace → Add/Remove Superset → Add a Note → Rest Timer →
     Remove Exercise, no gap.
  5. Update the file header's item list (currently line 4): `"Reorder
     Exercises ... Replace Exercise ... Add to Superset / Remove from
     Superset ... Add Warm-Up Sets ... Add a Note ... Rest Timer ... Remove
     Exercise..."` → drop `"Add Warm-Up Sets ... "` so it reads `"Reorder
     Exercises ... Replace Exercise ... Add to Superset / Remove from
     Superset ... Add a Note ... Rest Timer ... Remove Exercise..."`.
- **Acceptance criteria:**
  - `Flame` no longer appears anywhere in this file (import or usage).
  - `onAddWarmUpSets` no longer appears anywhere in this file (type, prop
    destructure, or JSX).
  - No `ListRow` with `testID={`${testID}-warmup-sets`}` renders.
  - The remaining six `ListRow`s (Reorder, Replace, Add-to-Superset /
    Remove-from-Superset, Add a Note, Rest Timer, Remove Exercise) are
    unchanged in props/order.
  - File typechecks with no unused-import or missing-prop errors once Task 4
    updates the one caller (`ExerciseCard.tsx`).

---

### Task 4 — Remove `AddWarmUpSetsSheet` wiring from `ExerciseCard.tsx`

- **Files:**
  - `src/features/workout/ExerciseCard.tsx`
- **Changes:** Depends on Task 3 (menu no longer has an `onAddWarmUpSets`
  prop to satisfy). Five edits, all confirmed against the current file:
  1. Remove the import (currently line 50):
     ```tsx
     import { AddWarmUpSetsSheet } from './AddWarmUpSetsSheet';
     ```
  2. Remove the `warmUpSheetVisible` state (currently line 121):
     ```tsx
     const [warmUpSheetVisible, setWarmUpSheetVisible] = useState(false);
     ```
  3. Remove the `handleAddWarmUpSets` handler (currently lines 139–141):
     ```tsx
     const handleAddWarmUpSets = (): void => {
       setWarmUpSheetVisible(true);
     };
     ```
  4. Remove the `onAddWarmUpSets={handleAddWarmUpSets}` prop from the
     `<ExerciseCardMenuSheet ... />` JSX (currently line 244) — the prop no
     longer exists on that component after Task 3.
  5. Remove the entire `<AddWarmUpSetsSheet ... />` JSX block (currently
     lines 275–286):
     ```tsx
     <AddWarmUpSetsSheet
       testID={`${testID}-warmup-sheet`}
       visible={warmUpSheetVisible}
       onDismiss={() => setWarmUpSheetVisible(false)}
       workoutExerciseId={workoutExerciseId}
       exerciseId={exercise.id}
       equipment={exercise.equipment}
       weightUnit={weightUnit}
       previousValuesMode={previousValuesMode}
       routineId={routineId}
       previousSetsExcludeWorkoutId={previousSetsExcludeWorkoutId}
     />
     ```
  6. Rewrite the file header's "Add Warm-Up Sets" paragraph (currently lines
     18–22):
     ```
     Add Warm-Up Sets (M2-16, 02 §12) is the other card-local ⋯ item: it opens
     `AddWarmUpSetsSheet`, which owns its own working-weight pre-fill/
     calculation/insert — this component only wires the sheet's `visible`
     state and hands it this card's own `workoutExerciseId`/`exercise
     .equipment`/unit + previous-values context.
     ```
     Replace with a short note that the item was removed, so a future reader
     of this doc comment isn't left looking for a component that no longer
     exists, e.g.:
     ```
     "Add Warm-Up Sets" (M2-16, 02 §12) was removed from this card's ⋯ menu
     (08 §1/§4: redundant with the set-number-tap → slide-up set-type menu
     in `ConnectedSetRow`, which already covers marking a set as a warm-up).
     ```
- **Acceptance criteria:**
  - `AddWarmUpSetsSheet` no longer appears anywhere in this file (import,
    state, handler, or JSX).
  - `warmUpSheetVisible` / `setWarmUpSheetVisible` / `handleAddWarmUpSets` no
    longer appear anywhere in this file.
  - `<ExerciseCardMenuSheet ... />` is still passed every other prop it had
    before (`isGrouped`, `onReorder`, `onReplace`, `onAddToSuperset`,
    `onRemoveFromSuperset`, `onAddNote`, `onRestTimer`, `onRemoveExercise`,
    `visible`, `onDismiss`, `testID`), unchanged.
  - File typechecks with no errors.

---

### Task 5 — Update `ExerciseCardMenuSheet.test.tsx`

- **Files:**
  - `src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`
- **Changes:** Depends on Task 3. Three edits, all confirmed against the
  current file:
  1. Remove `onAddWarmUpSets: jest.fn(),` from the `baseProps()` helper
     (currently line 22).
  2. In the `'every item dismisses then fires its own callback'` test,
     remove the warmup-sets press/assert pair (currently lines 69–70):
     ```tsx
     await fireEvent.press(screen.getByTestId('menu-warmup-sets'));
     expect(props.onAddWarmUpSets).toHaveBeenCalledTimes(1);
     ```
  3. In that same test, change the final assertion (currently line 81) from
     `expect(props.onDismiss).toHaveBeenCalledTimes(7);` to
     `expect(props.onDismiss).toHaveBeenCalledTimes(6);` — one fewer item is
     pressed in the sequence now (Reorder, Replace, Remove-from-Superset,
     Add a Note, Rest Timer, Remove Exercise = 6).
- **Acceptance criteria:**
  - `onAddWarmUpSets` and `menu-warmup-sets` no longer appear anywhere in
    this test file.
  - The `'every item dismisses then fires its own callback'` test passes and
    asserts `onDismiss` called exactly 6 times.
  - The other three tests in the file (`'shows "Add to Superset" when
    ungrouped'`, `'shows "Remove from Superset" when grouped'`, `'Add to
    Superset item dismisses then fires its own callback'`, `'uses its
    default testID when none is supplied'`) are unchanged and still pass.

---

### Task 6 — Update `ExerciseCard.test.tsx`

- **Files:**
  - `src/features/workout/__tests__/ExerciseCard.test.tsx`
- **Changes:** Depends on Task 4. Two removals, both confirmed against the
  current file:
  1. Remove the `setupBarbell` helper function (currently lines 369–387,
     including its doc comment on line 369) — confirmed by grep it has no
     other callers in this file (only used by the two tests being removed
     next).
  2. Remove the whole `describe('ExerciseCard — Add Warm-Up Sets (M2-16, 02
     §12)', ...)` block (currently lines 389–444), containing both its `it`
     blocks (`'⋯ → Add Warm-Up Sets opens the sheet pre-filled from the
     first normal set's weight'` and `'Generate inserts the default-formula
     warm-up rows above the existing set, without disturbing working-set
     numbering'`).
  - Leave the shared imports (`openBetterSqlite3Driver`, `migrate`,
    `WorkoutRepositoryImpl`, `ExerciseRepositoryImpl`) alone — they're also
    used by the file's other `setup()` helper and remaining tests.
  - The file header's doc comment (lines 1–11) mentions "the card-local ones
    — Remove from Superset, Add Warm-Up Sets stub — against real store/DB
    state" (line 7) — update this to drop "Add Warm-Up Sets stub" since that
    coverage no longer exists in this file, e.g. "...the card-local one —
    Remove from Superset — against real store/DB state."
- **Acceptance criteria:**
  - `setupBarbell` no longer appears anywhere in this file.
  - No `describe` block referencing "Add Warm-Up Sets" remains.
  - The rest of the file's tests (superset indicator, note row, rest-timer
    row/sheet, `+ Add Set`, name-tap detail sheet, Remove from Superset,
    Remove Exercise, etc.) are unchanged and still pass.
  - File typechecks with no unused-variable errors from the removed helper.

---

### Task 7 — Doc-comment-only touch-ups (six files)

- **Files:**
  - `src/features/workout/ConnectedSetRow.tsx`
  - `src/features/workout/workoutStoreContext.ts`
  - `src/features/workout/EditWorkoutScreen.tsx`
  - `src/features/workout/PlateCalculatorSheet.tsx`
  - `src/features/measurements/measurement-units.ts`
  - `src/features/measurements/__tests__/LogEntrySheet.test.tsx`
- **Changes:** No functional/behavioral change in any of these six files —
  each cites `AddWarmUpSetsSheet(.test).tsx` by filename in a doc/inline
  comment as a precedent or pattern-sibling. Left un-edited they'd be
  dangling references to a file deleted in Task 1. This task can be done any
  time after Task 1 (no compile dependency — comments don't fail a build),
  but do it in the same PR per PRD §4.3/§7 so a post-implementation
  `grep -rn "AddWarmUpSetsSheet" src/` returns nothing.

  1. **`ConnectedSetRow.tsx`** (in the `useStore`-naming-convention comment,
     currently around lines 279–281): it lists `AddWarmUpSetsSheet.tsx` as
     one of "the other three call sites of the same anti-pattern," alongside
     `ExerciseSetTableSection.tsx` and `EditWorkoutScreen.tsx`. Drop
     `AddWarmUpSetsSheet.tsx` from that list and change "three" to "two":
     ```
     // ... See the sibling fix in `ExerciseSetTableSection.tsx` and
     // `EditWorkoutScreen.tsx` (`editStore` -> `useEditStore`) for the other
     // two call sites of the same anti-pattern.
     ```

  2. **`workoutStoreContext.ts`** (file header, currently lines 4 and 61):
     drop `AddWarmUpSetsSheet` from both mentions.
     - Line 4 (part of the opening sentence "the seam that lets
       `ConnectedSetRow`/`ExerciseCard`/`ExerciseSetTableSection`/
       `AddWarmUpSetsSheet` (the shared 'full logger' chrome...)"): remove
       `/`AddWarmUpSetsSheet`` from that list, leaving `ConnectedSetRow`/
       `ExerciseCard`/`ExerciseSetTableSection`.
     - Line 61 (the `useWorkoutStore` function's own doc comment: "
       `ConnectedSetRow`/`ExerciseCard`/`ExerciseSetTableSection`/
       `AddWarmUpSetsSheet` call this instead of importing
       `useActiveWorkoutStore` directly"): same removal, leaving
       `ConnectedSetRow`/`ExerciseCard`/`ExerciseSetTableSection`.

  3. **`EditWorkoutScreen.tsx`** (currently lines 30 and 65): drop
     `AddWarmUpSetsSheet` from both component-list mentions.
     - Line 30 ("...`ConnectedSetRow`, `AddWarmUpSetsSheet`) reads/writes
       *whichever* store..."): remove `, `AddWarmUpSetsSheet``, leaving
       "...`ConnectedSetRow`) reads/writes *whichever* store...".
     - Line 65 ("...`ExerciseCard` (-> `ExerciseSetTableSection`/
       `AddWarmUpSetsSheet`) — see..."): remove `/`AddWarmUpSetsSheet``,
       leaving "...`ExerciseCard` (-> `ExerciseSetTableSection`) — see...".

  4. **`PlateCalculatorSheet.tsx`** (currently lines 100 and 107): these cite
     `AddWarmUpSetsSheet.tsx`'s "derive from a visible transition" pattern
     as prior art. Per PRD §4.3, reword to cite `NoteEditSheet` instead (the
     pattern's original source, per `AddWarmUpSetsSheet.tsx`'s own line-130
     comment before it was deleted) rather than just dropping the filename —
     this keeps the citation useful instead of vague.
     - Line 100 ("...same shape `AddWarmUpSetsSheet.tsx`'s own sheet uses)
       via a lazy initializer..."): reword to "...same shape `NoteEditSheet`'s
       own sheet uses) via a lazy initializer...".
     - Line 107 ("...(mirrors `AddWarmUpSetsSheet.tsx`'s own 'derive from a
       visible transition' pattern)..."): reword to "...(mirrors
       `NoteEditSheet`'s own 'derive from a visible transition' pattern)...".

  5. **`measurement-units.ts`** (currently lines 10 and 16): reword the
     `toDisplay`/`toCanonicalKg` precedent citation to not name a deleted
     file — point at the pattern description only (per PRD §4.3's "or simply
     drop the specific filename and keep the description" option).
     - Line 10 ("...and `AddWarmUpSetsSheet.tsx`'s `toDisplay`/
       `toCanonicalKg` precedent for an *editable* field:"): reword to
       "...and the same `toDisplay`/`toCanonicalKg`-shaped precedent for an
       *editable* field used elsewhere in this codebase:".
     - Line 16 ("...(same rationale `AddWarmUpSetsSheet.tsx`'s `toDisplay`
       doc comment gives)."): reword to "...(same rationale an editable
       field's display-conversion helper should always give)." — or
       similarly drop the filename while keeping the sentence's meaning
       intact. Do not leave `AddWarmUpSetsSheet.tsx` named here.

  6. **`LogEntrySheet.test.tsx`** (currently line 4): reword "same convention
     `AddWarmUpSetsSheet.test.tsx` already establishes for an equivalent
     sheet" to drop the filename, e.g.:
     ```
     * over an in-memory `better-sqlite3` driver (08 §5: never mock repositories),
     * the same convention this codebase's sheet tests already establish
     ```
     (The convention itself — real repository, not a mock — still exists
     elsewhere, e.g. `NoteEditSheet`'s own tests; no need to name a specific
     file here.)
- **Acceptance criteria:**
  - `grep -rn "AddWarmUpSetsSheet" src/` returns zero results across all six
    of these files (and, combined with Tasks 1–6, zero results anywhere in
    `src/`).
  - None of these six files have any other line changed — comment-only,
    single-purpose edits.
  - All six files still typecheck (no syntax errors introduced in comments —
    trivial but worth a compile check since some of these are multi-line
    JSDoc blocks).

---

### Task 8 — Final verification sweep

- **Files:** none edited — verification only, run after Tasks 1–7 are all
  complete.
- **Changes:** Per PRD §7, run the following and confirm clean results:
  1. `grep -rn "AddWarmUpSetsSheet\|warmup-calc" src/` — per PRD §7, this
     should return nothing outside `activeWorkoutStore.ts` /
     `workout-repository.ts` / `data/workouts/types.ts` /
     `data/sqlite/schema.ts` and their own tests (the kept store/repo layer,
     which legitimately still mentions "warmup" in identifiers/comments —
     e.g. `addWarmUpSets`, `insertWarmupSets`, the `warmup` `SetType` enum
     value), plus the one harmless `plate-calc.ts` comment citation noted in
     Task 2. If anything else shows up, go back and fix the specific file —
     do not leave a dangling reference.
  2. TypeScript build: `tsc --noEmit` (or this project's equivalent build
     command) — must complete with no new errors.
  3. Relevant Jest suites — at minimum:
     - `src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`
     - `src/features/workout/__tests__/ExerciseCard.test.tsx`
     - `src/domain/__tests__/` (confirm `warmup-calc.test.ts` is gone, no
       leftover reference breaks another domain test)
     - `src/features/workout/__tests__/activeWorkoutStore.test.ts`
     - `src/features/workout/__tests__/activeWorkoutStore.logging-drill.test.ts`
     - `src/features/workout/__tests__/activeWorkoutStore.crash-safety.test.ts`
     - `src/data/workouts/__tests__/workout-repository.mutators.test.ts`
     - `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
     (the last five are PRD §4.4/§7's explicitly-untouched store/repo-layer
     tests — they should pass unmodified, confirming the kept
     `addWarmUpSets`/`insertWarmupSets` pair is unaffected)
     — or, if faster, run the full suite (`src/features/workout/__tests__/`
     and `src/domain/__tests__/` at minimum, per PRD §7).
  4. Manual sanity check of the ⋯ menu item order: Reorder Exercises →
     Replace Exercise → Add to Superset (or Remove from Superset, if
     grouped) → Add a Note → Rest Timer → Remove Exercise, with no gap where
     "Add Warm-Up Sets" used to sit.
- **Acceptance criteria:**
  - Grep sweep returns only the expected kept-layer/comment hits listed
    above.
  - `tsc --noEmit` (or equivalent) exits clean.
  - All listed Jest suites pass.
  - No other `ExerciseCardMenuSheet` item's behavior changed (Reorder,
    Replace, Add/Remove Superset, Add a Note, Rest Timer, Remove Exercise
    all still work exactly as before).
  - `ConnectedSetRow`'s set-number-tap → slide-up `SET_TYPE_MENU` (Warm Up
    Set / Normal Set / Failure Set / Drop Set, plus Remove Set) is
    unchanged and still functions.

---

## Summary of what requires you

- **Nothing blocks execution** — every decision in PRD §9 is `[RESOLVED]`,
  and re-grounding every cited file/line against current source (done during
  task authoring above) found zero drift. This task list can be executed
  end-to-end without further input.
- **Awareness note — real, intentional capability loss (PRD §4.2/§8):**
  after this ships, users lose (a) the auto-calculated warm-up-weight
  suggestion (bar × 10, 40% × 8, 60% × 5, 80% × 3, barbell-floor-clamped) and
  (b) the batch-insert-N-rows convenience. The only remaining path to a
  warm-up set is: press "+ Add Set" N times, tap each new row's SET badge →
  Warm Up Set, then type each row's weight/reps by hand. This was an
  explicit, endorsed tradeoff (PRD §9, third resolved question — the user's
  own verbatim ask), not an oversight. If this becomes a user complaint, PRD
  §8 notes the fastest reintroduction path is *not* resurrecting
  `AddWarmUpSetsSheet`, but extending `ConnectedSetRow`'s `SET_TYPE_MENU`
  with a "Warm Up Set (auto weight)" variant reusing the still-intact
  `addWarmUpSets`/`insertWarmupSets` store/repo pair (kept, Task 1 does not
  touch them) — the pure math module itself (`domain/warmup-calc.ts`) would
  need to be re-added from git history, since Task 2 deletes it.
- **Awareness note — "smallest of 8 PRDs" framing (PRD §8):** the PRD's own
  author flags that the doc-comment sweep (Task 7) touches six files beyond
  the two functionally-changed ones, so the file count looks bigger than a
  first-glance read of the ask ("remove the menu item and its sheet") would
  suggest — but all six are one-or-two-line comment edits, not logic
  changes, so the actual diff size stays small. No action needed; just don't
  be surprised the task list touches 12 files total (2 deleted pairs, 2
  functional-edit files + their 2 tests, 6 doc-comment files) for what reads
  like a one-line removal.
- **Explicitly out of scope, confirmed not touched by any task above:**
  `ConnectedSetRow.tsx`'s set-type mechanism itself, `settings.warmup_calc`
  in the settings schema, `activeWorkoutStore.addWarmUpSets` /
  `WorkoutRepository.insertWarmupSets` and their five independent test
  files, and the seven historical planning docs listed in PRD §3/§9
  (`docs/plan/02-feature-spec-workout-logging.md`,
  `05-data-model-and-storage.md`, `tasks/M2-tasks.md`, `tasks/M0-tasks.md`,
  `tasks/TASKS-INDEX.md`, `EXECUTION-LOG.md`, `docs/qa/M2-checklist.md`,
  `docs/plan/research/hevy-deep-dive.md`).
