## Open Questions

None — all PRD §9 items are already RESOLVED or DEFERRED.

(Verification note: all 5 §9 entries were re-scanned. Four are `[RESOLVED: ...]`, one is
`[DEFERRED: ...]`. No `[OPEN]` items exist. Every before-snippet in PRD §4.1–§4.5 was also
diffed against the current `ReorderExercisesSheet.tsx` on disk and matches verbatim — no
line-number drift. The PRD's claim that all 3 call sites need zero code changes was
independently re-verified by reading each call site: `ActiveWorkoutScreen.tsx:1224-1233`,
`EditWorkoutScreen.tsx:601-610`, `RoutineEditorScreen.tsx:434-442` each pass exactly
`testID`, `visible`, `onDismiss`, `exercises`, `onSave` — the full and only
`ReorderExercisesSheetProps` shape, unchanged. This claim holds.)

## Parallelization

All 5 tasks touch the same single file, `ReorderExercisesSheet.tsx` (plus, optionally,
test files for Task 4/5), so independence here means "edits land in disjoint, non-overlapping
regions of that file with no read/write dependency between them" rather than "different files
entirely." Verified against the file on disk: the import block sits at lines ~24-29, the
`useTheme()` destructure at line 59, the title `Text` at lines ~90-92, and the `Button` at
lines ~138-144 — matching the before-snippets in Tasks 1-3 exactly, confirming the claimed
edit locations are accurate and non-overlapping. Capped at 2 concurrent tasks per wave.

1. **Wave 1 — Task 1 + Task 2 (parallel)**
   Both edit `ReorderExercisesSheet.tsx`, but in disjoint regions: Task 1 touches the import
   block (~L24-29) and inserts one new line immediately after the `useTheme()` destructure
   (~L59); Task 2 replaces only the title `<Text>` block (~L90-92), ~30 lines away. Neither
   task reads, references, or depends on the other's output (Task 2's title change doesn't use
   `insets`, and Task 1's `insets` declaration isn't consumed until Task 3). This is a trivially
   non-overlapping same-file edit — safe to work concurrently and merge.

2. **Wave 2 — Task 3 (alone)**
   Task 3 replaces the `Button` block (~L138-144) with a version that references `insets`,
   which only exists in scope once Task 1 has landed — a hard dependency on Wave 1's Task 1
   output. It cannot be paired with Task 4 (which requires Tasks 1-3 *all* landed before it can
   run) or Task 5 (which requires both Task 2's and Task 3's changes landed, and Task 3 itself
   isn't done yet at this point), so it runs solo.

3. **Wave 3 — Task 4 (alone)**
   Task 4 is the verification gate: typecheck, lint, and the 3 existing spec files, run against
   the full Tasks 1-3 diff. It depends on all of Wave 1 + Wave 2 being complete. It is not
   paired with Task 5 even though Task 5 is technically ready (Task 2 + Task 3 have landed) —
   Task 5's "additions to one of the 3 existing spec files" option would edit the very files
   Task 4 is executing/reading, so running them concurrently risks a flaky or misleading result
   (a new-test failure getting conflated with an actual Tasks 1-3 regression). Task 4 completing
   cleanly first is what makes Task 5's result trustworthy.

4. **Wave 4 — Task 5 (alone, optional)**
   Task 5 adds direct style assertions for the `textAlign` from Task 2 and the `size="lg"` from
   Task 3, and is explicitly optional/nice-to-have per the PRD. It depends on Task 2 and Task 3
   content and is best sequenced after Task 4's clean verification pass (Wave 3) so any breakage
   it introduces isn't mistaken for a Tasks 1-3 regression. No other task remains to pair it
   with, so it runs solo.

# Tasks: Reorder Exercises Sheet — Title, Button, and Bottom-Gap Fixes

### Task 1 — Import `useSafeAreaInsets` and call the hook

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`
- Changes:
  1. Add the import (after the existing `react-native` import, before the blank-line-separated `@/ui` import group), per PRD §4.1:

     ```tsx
     import { useSafeAreaInsets } from 'react-native-safe-area-context';
     ```

     Resulting import block:

     ```tsx
     import React, { useState } from 'react';
     import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react-native';
     import { Pressable, ScrollView, Text, View } from 'react-native';
     import { useSafeAreaInsets } from 'react-native-safe-area-context';

     import { Button } from '@/ui/Button';
     import { Sheet } from '@/ui/Sheet';
     import { useTheme } from '@/ui/theme-provider';
     ```

  2. Immediately after the existing `const { colors, typography, spacing } = useTheme();` line (currently line 59, inside `ReorderExercisesSheet`, before the `draft` state declaration), add per PRD §4.2:

     ```tsx
     const insets = useSafeAreaInsets();
     ```

- Acceptance criteria:
  - `ReorderExercisesSheet.tsx` imports `useSafeAreaInsets` from `react-native-safe-area-context`.
  - `insets` is declared via `useSafeAreaInsets()` as the first line after the `useTheme()` destructure, before `useState<ReorderableExercise[]>(...)`.
  - `insets` is not yet referenced anywhere else in the file after this task (that's Task 3) — the file must still typecheck (an unused-var lint/TS error at this point is expected to be transient and is resolved by Task 3; if this task is landed standalone, confirm `npx tsc --noEmit` and `pnpm lint` are still run after Task 3, not after this task alone).
  - `pnpm tsc --noEmit` (or repo's equivalent typecheck script) passes once Tasks 1–3 are all applied together (see Task 4 for full verification — this task is not independently shippable due to the transient unused-variable state, so implement Tasks 1–3 as one edit pass before running checks).

### Task 2 — Center and resize the "Reorder Exercises" title

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`
- Changes: Replace the title `<Text>` (currently lines 90–92):

  Before:
  ```tsx
  <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
    Reorder Exercises
  </Text>
  ```

  After (PRD §4.3):
  ```tsx
  <Text
    style={[
      typography.title2,
      { color: colors.text.primary, textAlign: 'center', marginBottom: spacing['4'] },
    ]}
  >
    Reorder Exercises
  </Text>
  ```

  Three changes bundled in this one edit: `typography.headline` → `typography.title2`, add `textAlign: 'center'`, bump `marginBottom` from `spacing['3']` to `spacing['4']`.

- Acceptance criteria:
  - The title `Text`'s style array's first element is `typography.title2` (not `typography.headline`).
  - The inline style object includes `textAlign: 'center'`.
  - The inline style object's `marginBottom` is `spacing['4']` (not `spacing['3']`).
  - `color: colors.text.primary` is unchanged.
  - The rendered text content `Reorder Exercises` is unchanged (no wording change).

### Task 3 — Full-width Save button with safe-area-aware bottom margin

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`
- Changes: Replace the `<Button>` at the bottom of the render (currently lines 138–144):

  Before:
  ```tsx
  <Button
    testID={`${testID}-save`}
    label="Save Order"
    variant="primary"
    onPress={handleSave}
    style={{ marginTop: spacing['4'] }}
  />
  ```

  After (PRD §4.4):
  ```tsx
  <Button
    testID={`${testID}-save`}
    label="Save Order"
    variant="primary"
    size="lg"
    onPress={handleSave}
    style={{ marginTop: spacing['4'], marginBottom: insets.bottom + spacing['4'] }}
  />
  ```

  Two changes: add `size="lg"` prop (existing full-width variant, `Button.tsx:136`); change `style` from `{ marginTop: spacing['4'] }` to `{ marginTop: spacing['4'], marginBottom: insets.bottom + spacing['4'] }`. `testID`, `label`, `variant`, `onPress` are unchanged.

- Acceptance criteria:
  - The Save button has `size="lg"` set explicitly.
  - The button's `style` prop includes both `marginTop: spacing['4']` (unchanged) and a new `marginBottom: insets.bottom + spacing['4']`.
  - `testID={`${testID}-save`}`, `label="Save Order"`, `variant="primary"`, `onPress={handleSave}` are all unchanged from before this task.
  - This depends on Task 1 (`insets` must already be in scope) — implement Tasks 1–3 together before typechecking/testing.

### Task 4 — Verify: typecheck, lint, and full existing test suite

- Files (read/run only, no edits): `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx` and the 3 existing spec files listed below.
- Changes: None — this is a verification-only task confirming Tasks 1–3 landed correctly and introduced no regressions.
  1. Run the project's typecheck script (e.g. `pnpm tsc --noEmit` or repo's `pnpm typecheck` — check `package.json` `scripts` for the exact name) and confirm it passes with no new errors in `ReorderExercisesSheet.tsx`.
  2. Run the project's lint script (e.g. `pnpm lint`) and confirm no new lint errors in `ReorderExercisesSheet.tsx`.
  3. Run the 3 existing spec files the PRD (§7) calls out as indirectly covering this component — none of them assert on style/size, only `testID`s, so they should pass unchanged:
     - `/root/projects/kyro/src/features/workout/__tests__/EditWorkoutScreen.test.tsx` — in particular the `'Reorder Exercises (via the ⋯ menu) persists the new order'` test (asserts `edit-reorder-sheet-row-{id}-up` press + `edit-reorder-sheet-save` press flow).
     - `/root/projects/kyro/src/features/routines/__tests__/RoutineEditorScreen.test.tsx` — in particular the `'Reorder (from ⋯) opens the reorder sheet listing every exercise in the draft'` test (asserts `${testID}-reorder-sheet` renders).
     - `/root/projects/kyro/src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx` — full file (mounts the active-workout flow that can open this sheet).
- Acceptance criteria:
  - Typecheck passes with zero errors attributable to `ReorderExercisesSheet.tsx`.
  - Lint passes with zero new warnings/errors attributable to `ReorderExercisesSheet.tsx`.
  - All three spec files above pass in full, with no test modifications required.

### Task 5 (optional / nice-to-have, not required for acceptance) — Direct style assertions for the title and button

PRD §7 explicitly marks these as optional/low-value, since Jest's `react-native-safe-area-context` mock (`jest/safe-area-context-mock.tsx`, confirmed to return `{ top: 0, right: 0, bottom: 0, left: 0 }` unconditionally) means the actual bug this PRD fixes — bottom cutoff on a real notched device — cannot be verified either before or after this change by this repo's automated suite. Do this task only if direct coverage of the two style facts (not the safe-area behavior) is wanted; skip it otherwise without blocking sign-off.

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx` (no change), and either a new file `/root/projects/kyro/src/features/workout/__tests__/ReorderExercisesSheet.test.tsx` (none currently exists) or additions to one of the 3 existing spec files in Task 4.
- Changes (if pursued):
  - Assert the save button's rendered style reflects `size="lg"`'s full-width behavior, e.g. via `getByTestId('...-save')` and checking the flattened style contains `alignSelf: 'stretch'` (per `Button.tsx:136`, `alignSelf: size === 'lg' ? 'stretch' : 'flex-start'`).
  - Assert the title `Text`'s style includes `textAlign: 'center'`, e.g. via a text query and flattened-style check.
- Acceptance criteria (only if this task is done):
  - New/added assertions pass.
  - No existing test's behavior or assertions are altered — this is additive only.
  - Explicitly out of scope: any assertion on `insets.bottom`-driven `marginBottom` value, since the zero-inset Jest mock cannot exercise that logic meaningfully (would only ever assert `marginBottom === 0 + spacing['4']`, which doesn't prove the safe-area-aware behavior works).

## Summary of what requires you (not a dev agent)

The following cannot be verified by an automated agent or this repo's test suite and require a human on a physical device or simulator (per PRD §8):

1. **Notched-device check (e.g. iPhone 14/15 class), across all 3 real call sites** — open the reorder sheet from each of:
   - `ActiveWorkoutScreen.tsx` (active workout ⋯ menu → Reorder Exercises)
   - `EditWorkoutScreen.tsx` (past-workout editor → Reorder Exercises)
   - `RoutineEditorScreen.tsx` (routine editor → Reorder Exercises)

   In each, confirm:
   - Save Order button is fully visible, fully clear of the home-indicator gesture bar, with a visible gap beneath it.
   - Save Order button spans the full width of the sheet (minus the standard horizontal gutter).
   - "Reorder Exercises" title is centered and reads as a proper title (not undersized).
   - (Only once PRD A — `01-sheet-header-footer-foundation` — has also landed) the sheet itself reaches the very top of the screen with no gap. This is out of scope for this PRD's own code but worth confirming once A ships, since this PRD's fix is designed to combine with A's cleanly.

2. **Non-notched device/simulator check** — confirm the bottom gap doesn't look excessive when there's no home indicator to clear (i.e. `insets.bottom === 0`): the button should still show the flat `spacing['4']` (16pt) breathing room, just without the extra inset.

3. **Dark and light theme check** — confirm both themes still render the (unchanged) colors correctly on the resized/recentered title and full-width button. No color values were touched by this PRD, but the layout change is worth a visual glance in both themes.

4. **`useSafeAreaInsets()`-inside-`Modal` real-device sanity check** — this is the first sheet-content component in the codebase to call `useSafeAreaInsets()` directly (PRD §4.6). The PRD's technical-risk analysis concludes this is safe (full-screen `Modal`, React-Context-based hook), but flags it as cheap on-device insurance since Jest's mock can't validate it. Fold this into check #1 above — no separate pass needed, just don't skip #1.

Nothing else requires human intervention — no data migrations, no environment/config changes, no new dependencies to install (per PRD §8, confirmed).
