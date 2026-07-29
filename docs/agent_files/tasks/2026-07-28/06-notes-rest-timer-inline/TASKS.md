# Tasks: Notes — Always-Visible Inline Field + Keyboard Dismiss (PRD F)

## Open Questions

1. **Exact insertion anchor for the `KeyboardDoneBar` mount in `ActiveWorkoutScreen.tsx` / `EditWorkoutScreen.tsx`.**
   The PRD (§4.4) says only "alongside — not replacing — the existing `<KeyboardAccessoryBar />`" and cites
   approximate line numbers (~1250 / ~626), which do match the current code. It does not say *before* or
   *after* the existing bar, or before/after the neighboring `<PlateCalculatorSheet />`. Assumption: mount
   `<KeyboardDoneBar />` immediately **after** the existing `<KeyboardAccessoryBar />` block and **before**
   `<PlateCalculatorSheet />` in both files — keeps the two accessory-bar mounts visually grouped together
   in the JSX, matching how the PRD itself always lists them as a pair, and avoids interleaving an unrelated
   sheet between two conceptually-related "keyboard toolbar" mounts.

2. **Exact insertion anchor for the `KeyboardDoneBar` mount in `RoutineEditorScreen.tsx`.**
   The PRD (§4.4/§4.8) only says this screen "mounts no accessory bar today" and gains one — it gives no
   anchor at all since there's no existing accessory-bar mount to sit "alongside." Assumption: mount it as
   the last child inside the screen's outer `<View testID={testID} ...>`, immediately after the existing
   `<AddToSupersetSheet ... />` block (currently the last sibling before the closing `</View>` at the end of
   the component, verified at `src/features/routines/RoutineEditorScreen.tsx` lines ~445-452) — mirrors the
   other two screens' convention of mounting accessory bars/sheets as trailing siblings after the screen's
   main content and sheets.

3. **`ExercisePickerSheet.tsx`'s doc-comment (§4.10 repoint) cites `NoteEditSheet` alongside
   `ReorderExercisesSheet`, not alongside `DurationEditSheet`.**
   PRD §4.2 justifies the repoint target as "the other sheet those same comments already cite alongside
   `NoteEditSheet.tsx`" — true for 5 of the 6 files, but `ExercisePickerSheet.tsx`'s own comment (line 99)
   actually reads `(`NoteEditSheet`, `ReorderExercisesSheet`)`, with no existing `DurationEditSheet` mention
   in that specific comment. Assumption: follow the PRD's explicit file list (§4.10 names
   `ExercisePickerSheet.tsx` as one of the six repoint targets) and its explicit instruction ("repoint each
   to `DurationEditSheet.tsx`") literally — do a plain find/replace of `NoteEditSheet` → `DurationEditSheet`
   in that comment too, yielding `(`DurationEditSheet`, `ReorderExercisesSheet`)`, rather than treating the
   PRD's general justification as grounds to leave this one file alone. This is a one-line comment, no
   behavior implication either way.

## Parallelization

No two tasks in this list ever touch the same file, so the only real constraint is dependency ordering
(new component → its consumers → its consumers' consumers → tests). With a hard cap of 2 concurrent
tasks, the 16 tasks split into exactly 8 waves of 2 — the theoretical minimum for 16 tasks at this cap,
achieved because at every wave there were always at least 2 dependency-satisfied tasks available.

1. **Wave 1: Task 1, Task 2** — Both are brand-new, self-contained files
   (`src/ui/KeyboardDoneBar.tsx`, `src/features/workout/InlineNoteField.tsx`) with no dependencies on
   anything else in this list, and no import relationship between them (`InlineNoteField.tsx` defines its
   own `NOTES_KEYBOARD_ACCESSORY_VIEW_ID` constant rather than importing `KeyboardDoneBar`). These gate the
   most downstream work (Tasks 3, 5, 7, 8, 9, 15, 16), so they run first. (Task 11 is also dependency-free
   at this point but was deferred to Wave 6 — pairing it here would waste a slot ahead of the
   higher-leverage foundation tasks.)

2. **Wave 2: Task 3, Task 5** — Both consume `InlineNoteField` from Task 1/2 (satisfied) and edit entirely
   separate files (`ExerciseCard.tsx` vs. `RoutineExerciseCard.tsx`) that are mirror-image changes to
   parallel screens (workout vs. routine editor). Independent of each other.

3. **Wave 3: Task 4, Task 6** — Each removes the `onAddNote` prop *definition* from a menu-sheet component
   whose only caller had its *call site* removed in Wave 2 (Task 4 needs Task 3; Task 6 needs Task 5) —
   doing it in the other order would leave the caller passing a prop the type no longer declares. Different
   files (`ExerciseCardMenuSheet.tsx` vs. `RoutineExerciseMenuSheet.tsx`), independent of each other.

4. **Wave 4: Task 7, Task 8** — Both only need `KeyboardDoneBar` + `NOTES_KEYBOARD_ACCESSORY_VIEW_ID` from
   Wave 1 (not Tasks 3-6 — mounting the bar doesn't require the card components to have adopted
   `InlineNoteField` yet). Different screens (`ActiveWorkoutScreen.tsx` vs. `EditWorkoutScreen.tsx`),
   independent of each other.

5. **Wave 5: Task 9, Task 10** — Task 9 has the same Wave-1-only dependency as Tasks 7/8, just applied to
   `RoutineEditorScreen.tsx` (a different file, and this screen's first accessory-bar mount, so nothing
   else could conflict). Task 10 deletes `NoteEditSheet.tsx` + its test, which is safe only once both of
   its call sites are gone — i.e. once Task 3 *and* Task 5 have landed (both satisfied since Wave 2).
   Disjoint files, independent of each other.

6. **Wave 6: Task 11, Task 13** — Task 11 (doc-comment-only `NoteEditSheet` → `DurationEditSheet`
   repoints in five unrelated sheet files) has no real dependency on anything — it's pure text in
   comments, not a reference the compiler checks — so it could have run anywhere; it lands here to fill an
   otherwise-open slot. Task 13 updates `ExerciseCardMenuSheet.test.tsx` to match Task 4's menu-item
   removal, so it needs Task 4 (satisfied since Wave 3). The two touch six files total, none shared.

7. **Wave 7: Task 12, Task 14** — Task 12 (`ExerciseCard.test.tsx`) needs both Task 3 (new `InlineNoteField`
   testIDs) and Task 4 (removed "Add a Note" menu test), both satisfied by Wave 3. Task 14
   (`RoutineEditorScreen.test.tsx`) needs both Task 5 and Task 6 for the same reasons on the routines side,
   also satisfied by Wave 3. Different test files, independent of each other.

8. **Wave 8: Task 15, Task 16** — Final new, direct-render unit-test files for the two Wave-1 components
   (`InlineNoteField.test.tsx` needs only Task 2; `KeyboardDoneBar.test.tsx` needs only Task 1). Both were
   ready as early as Wave 2 but pushed last since nothing else depends on them — scheduling them earlier
   would have displaced tasks that unblock more downstream work. Disjoint files, independent of each other.

## Task 1 — `src/ui/KeyboardDoneBar.tsx` (new component)

- Files:
  - `/root/projects/kyro/src/ui/KeyboardDoneBar.tsx` (new)
- Changes: create the file with exactly this content (verbatim from PRD §4.3 — a generic, iOS-only
  `InputAccessoryView` "Done" bar that mirrors `src/ui/KeyboardAccessoryBar.tsx`'s own mounting pattern but
  needs no callback prop, since `Keyboard.dismiss()` alone is sufficient — dismissing fires the focused
  `TextInput`'s native `onBlur`):

  ```tsx
  // src/ui/KeyboardDoneBar.tsx (new)
  import React from 'react';
  import { InputAccessoryView, Keyboard, Pressable, Text, View } from 'react-native';
  import { useTheme } from './theme-provider';

  export interface KeyboardDoneBarProps {
    /** Same `nativeID`/`inputAccessoryViewID` pairing convention as `KeyboardAccessoryBar` —
     * every free-text `TextInput` that wants a Done bar passes this same string as its own
     * `inputAccessoryViewID`. */
    nativeID: string;
    testID?: string;
  }

  export function KeyboardDoneBar({
    nativeID,
    testID = 'keyboard-done-bar',
  }: KeyboardDoneBarProps): React.JSX.Element {
    const { colors, typography, spacing } = useTheme();
    return (
      <InputAccessoryView nativeID={nativeID}>
        <View
          testID={testID}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            minHeight: 44,
            paddingHorizontal: spacing['3'],
            backgroundColor: colors.bg.elevated,
            borderTopWidth: 1,
            borderTopColor: colors.border.hairline,
          }}
        >
          <Pressable
            testID={`${testID}-done`}
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
            onPress={() => Keyboard.dismiss()}
            hitSlop={8}
            style={{ paddingVertical: spacing['2'] }}
          >
            <Text style={[typography.headline, { color: colors.accent.text }]}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    );
  }
  ```
- Acceptance criteria:
  - File compiles with no TypeScript errors; exports `KeyboardDoneBar` and `KeyboardDoneBarProps`.
  - Component takes no callback prop besides `nativeID`/`testID` — nothing about notes/drafts/stores is
    referenced in this file (PRD §4.3: it must stay reusable by any future free-text field).
  - Not yet imported/mounted anywhere (that's Tasks 7-9).

## Task 2 — `src/features/workout/InlineNoteField.tsx` (new component)

- Files:
  - `/root/projects/kyro/src/features/workout/InlineNoteField.tsx` (new)
- Changes: create the file with exactly this content (verbatim from PRD §4.5 — the dual-mode
  display/edit note field that replaces the old `notes != null`-gated row + `NoteEditSheet` modal):

  ```tsx
  /**
   * `InlineNoteField` — always-visible, tap-to-edit-in-place per-exercise note
   * (replaces the old `notes != null` gated row + `NoteEditSheet` modal, see
   * this task's PRD §4.1-4.2). Two render states:
   *  - display: `NoteText` (tappable links) when a note exists, a plain
   *    placeholder otherwise; tapping either enters edit mode.
   *  - edit: a borderless multiline `TextInput`, autofocused, wired to the
   *    shared `KeyboardDoneBar` via `inputAccessoryViewID`. Blur (tap-away or
   *    the Done button, which just calls `Keyboard.dismiss()`) commits the
   *    trimmed draft (empty -> `null`, same rule `NoteEditSheet` used) and
   *    returns to display mode.
   */
  import React, { useState } from 'react';
  import { Pressable, Text, TextInput } from 'react-native';

  import { useTheme } from '@/ui/theme-provider';
  import { NoteText } from './NoteText';

  export const NOTES_KEYBOARD_ACCESSORY_VIEW_ID = 'kyro-notes-accessory';

  export interface InlineNoteFieldProps {
    value: string | null;
    onSave: (note: string | null) => void;
    testID?: string;
  }

  export function InlineNoteField({
    value,
    onSave,
    testID = 'inline-note-field',
  }: InlineNoteFieldProps): React.JSX.Element {
    const { colors, typography, spacing } = useTheme();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? '');

    const beginEdit = (): void => {
      setDraft(value ?? '');
      setEditing(true);
    };

    const commit = (): void => {
      const trimmed = draft.trim();
      onSave(trimmed.length > 0 ? draft : null);
      setEditing(false);
    };

    if (editing) {
      return (
        <TextInput
          testID={`${testID}-input`}
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          multiline
          autoFocus
          inputAccessoryViewID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID}
          placeholder="Add a note for this exercise…"
          placeholderTextColor={colors.text.tertiary}
          style={[
            typography.subhead,
            { color: colors.text.secondary, fontStyle: 'italic', padding: 0, marginBottom: spacing['3'] },
          ]}
        />
      );
    }

    return (
      <Pressable
        testID={`${testID}-row`}
        accessibilityRole="button"
        accessibilityLabel="Edit note"
        onPress={beginEdit}
        style={{ marginBottom: spacing['3'] }}
      >
        {value != null && value.length > 0 ? (
          <NoteText testID={`${testID}-text`} text={value} />
        ) : (
          <Text
            testID={`${testID}-placeholder`}
            style={[typography.subhead, { color: colors.text.tertiary, fontStyle: 'italic' }]}
          >
            Add a note for this exercise…
          </Text>
        )}
      </Pressable>
    );
  }
  ```
- Acceptance criteria:
  - File compiles with no TypeScript errors; exports `InlineNoteField`, `InlineNoteFieldProps`, and
    `NOTES_KEYBOARD_ACCESSORY_VIEW_ID` (the constant `'kyro-notes-accessory'`).
  - Given `testID="card-note"` (the convention Tasks 3/5 will use), the rendered testIDs are
    `card-note-row`, `card-note-placeholder`/`card-note-text` (display mode), and `card-note-input` (edit
    mode) — matches the testID scheme the PRD's §7.1 test updates and §7.2 new test reference.
  - Not yet imported/mounted anywhere (that's Tasks 3 and 5).

## Task 3 — `src/features/workout/ExerciseCard.tsx`: swap `NoteEditSheet` for `InlineNoteField`

- Files:
  - `/root/projects/kyro/src/features/workout/ExerciseCard.tsx`
- Changes (traces to PRD §4.6):
  1. Replace the import `import { NoteEditSheet } from './NoteEditSheet';` with
     `import { InlineNoteField } from './InlineNoteField';`. Remove the `import { NoteText } from
     './NoteText';` line — `NoteText` is no longer used directly by this file (it's used inside
     `InlineNoteField` now).
  2. Remove the `noteSheetVisible` state: delete
     `const [noteSheetVisible, setNoteSheetVisible] = useState(false);`.
  3. Replace the conditionally-rendered note block:
     ```tsx
     {notes != null && notes.length > 0 ? (
       <Pressable
         testID={`${testID}-note-row`}
         accessibilityRole="button"
         accessibilityLabel="Edit note"
         onPress={() => setNoteSheetVisible(true)}
         style={{ marginBottom: spacing['3'] }}
       >
         <NoteText testID={`${testID}-note-text`} text={notes} />
       </Pressable>
     ) : null}
     ```
     with:
     ```tsx
     <InlineNoteField testID={`${testID}-note`} value={notes} onSave={handleSaveNote} />
     ```
     positioned in exactly the same place (between the name/thumb header `View` and the rest-timer-row
     `Pressable`) — `handleSaveNote` (the existing
     `workoutStore.getState().updateExercise(workoutExerciseId, { notes: nextNote })` call) is unchanged,
     only its caller changes.
  4. On the `<ExerciseCardMenuSheet ... />` mount, delete the line `onAddNote={() => setNoteSheetVisible(true)}`.
  5. Delete the `<NoteEditSheet ... />` block entirely:
     ```tsx
     <NoteEditSheet
       testID={`${testID}-note-sheet`}
       visible={noteSheetVisible}
       onDismiss={() => setNoteSheetVisible(false)}
       initialValue={notes ?? ''}
       onSave={handleSaveNote}
     />
     ```
  6. Update the file's own top doc comment: it currently lists "note row (URLs tappable) ... and the ⋯
     menu's card-local items (Add a Note, Rest Timer — both fully self-contained here)". Drop "Add a Note"
     from that parenthetical (it becomes "the ⋯ menu's card-local items (Rest Timer — fully self-contained
     here)") — "Add a Note" is no longer a card-local ⋯ item at all, per PRD §4.6.
- Acceptance criteria:
  - `NoteEditSheet` and `NoteText` no longer appear anywhere in this file's imports or JSX.
  - `noteSheetVisible` no longer exists in this file.
  - The note field renders unconditionally (no `notes != null` gate) via `InlineNoteField`, in the same
    position as before (above the rest-timer row).
  - `ExerciseCardMenuSheet` is mounted with no `onAddNote` prop.
  - File still compiles; `handleSaveNote` body is byte-identical to before this task.

## Task 4 — `src/features/workout/ExerciseCardMenuSheet.tsx`: remove "Add a Note"

- Files:
  - `/root/projects/kyro/src/features/workout/ExerciseCardMenuSheet.tsx`
- Changes (traces to PRD §4.7):
  1. Remove `onAddNote: () => void;` from `ExerciseCardMenuSheetProps`.
  2. Remove `onAddNote,` from the destructured props in `ExerciseCardMenuSheet(...)`.
  3. Delete the `ListRow` block:
     ```tsx
     <ListRow
       testID={`${testID}-add-note`}
       title="Add a Note"
       leading={<StickyNote size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
       onPress={dismissThen(onAddNote)}
     />
     ```
     so the `ListRow` for `Rest Timer` (currently right after it) now sits directly after
     `Add Warm-Up Sets`'s `ListRow`.
  4. Remove `StickyNote` from the `lucide-react-native` import (it becomes unused once the block above is
     deleted) — leave `ArrowUpDown`, `Clock`, `Flame`, `Link2`, `Repeat`, `Trash2`, `Unlink` as-is.
  5. Update the file's own top doc comment, which currently quotes the full menu item list including
     "... Add Warm-Up Sets ... Add a Note ... Rest Timer ...": drop "Add a Note ..." from that quoted list.
- Acceptance criteria:
  - The menu renders exactly six items in this order: Reorder Exercises, Replace Exercise, Add to
    Superset/Remove from Superset, Add Warm-Up Sets, Rest Timer, Remove Exercise.
  - No `onAddNote` prop, no `add-note` testID, no `StickyNote` import remain in this file.
  - File still compiles.

## Task 5 — `src/features/routines/RoutineExerciseCard.tsx`: mirror Task 3

- Files:
  - `/root/projects/kyro/src/features/routines/RoutineExerciseCard.tsx`
- Changes (traces to PRD §4.8 — identical shape to Task 3, applied to the routine editor's twin card):
  1. Replace `import { NoteEditSheet } from '../workout/NoteEditSheet';` with
     `import { InlineNoteField } from '../workout/InlineNoteField';`. Remove the
     `import { NoteText } from '../workout/NoteText';` line (no longer used directly by this file).
  2. Remove the `noteSheetVisible` state: delete
     `const [noteSheetVisible, setNoteSheetVisible] = useState(false);`.
  3. Replace the conditionally-rendered note block:
     ```tsx
     {draftExercise.notes != null && draftExercise.notes.length > 0 ? (
       <Pressable
         testID={`${testID}-note-row`}
         accessibilityRole="button"
         accessibilityLabel="Edit note"
         onPress={() => setNoteSheetVisible(true)}
         style={{ marginBottom: spacing['3'] }}
       >
         <NoteText testID={`${testID}-note-text`} text={draftExercise.notes} />
       </Pressable>
     ) : null}
     ```
     with:
     ```tsx
     <InlineNoteField testID={`${testID}-note`} value={draftExercise.notes} onSave={handleSaveNote} />
     ```
     positioned identically (between the name/thumb header and the rest-timer row, which is already its
     position today). `handleSaveNote` (calls `mutate((draft) =>
     updateDraftExerciseNotes(draft, draftExercise.id, nextNote))`) is unchanged, only its caller changes.
  4. On the `<RoutineExerciseMenuSheet ... />` mount, delete the line
     `onAddNote={() => setNoteSheetVisible(true)}`.
  5. Delete the `<NoteEditSheet ... />` block entirely (same shape as Task 3 step 5, with
     `initialValue={draftExercise.notes ?? ''}`).
- Acceptance criteria:
  - `NoteEditSheet` and `NoteText` no longer appear anywhere in this file's imports or JSX.
  - `noteSheetVisible` no longer exists in this file.
  - The note field renders unconditionally via `InlineNoteField`, in the same position as before.
  - `RoutineExerciseMenuSheet` is mounted with no `onAddNote` prop.
  - File still compiles; `handleSaveNote` body is byte-identical to before this task.

## Task 6 — `src/features/routines/RoutineExerciseMenuSheet.tsx`: remove "Add a Note"

- Files:
  - `/root/projects/kyro/src/features/routines/RoutineExerciseMenuSheet.tsx`
- Changes (traces to PRD §4.8 — identical shape to Task 4):
  1. Remove `onAddNote: () => void;` from `RoutineExerciseMenuSheetProps`.
  2. Remove `onAddNote,` from the destructured props.
  3. Delete the `ListRow` block:
     ```tsx
     <ListRow
       testID={`${testID}-add-note`}
       title="Add a Note"
       leading={<StickyNote size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
       onPress={dismissThen(onAddNote)}
     />
     ```
     so `Rest Timer`'s `ListRow` now sits directly after the Add to Superset/Remove from Superset block.
  4. Remove `StickyNote` from the `lucide-react-native` import — leave `ArrowUpDown`, `Clock`, `Link2`,
     `Repeat`, `Trash2`, `Unlink` as-is.
- Acceptance criteria:
  - The menu renders exactly five items in this order: Reorder Exercises, Replace Exercise, Add to
    Superset/Remove from Superset, Rest Timer, Remove Exercise (this menu never had Add Warm-Up Sets — see
    the file's own header comment, unaffected by this task).
  - No `onAddNote` prop, no `add-note` testID, no `StickyNote` import remain in this file.
  - File still compiles.

## Task 7 — Mount `KeyboardDoneBar` in `ActiveWorkoutScreen.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/ActiveWorkoutScreen.tsx`
- Changes (traces to PRD §4.4; resolves Open Question 1 above):
  1. Add the import: `import { KeyboardDoneBar } from '@/ui/KeyboardDoneBar';` and
     `import { NOTES_KEYBOARD_ACCESSORY_VIEW_ID } from './InlineNoteField';` (alongside the existing
     `import { KeyboardAccessoryBar } from '@/ui/KeyboardAccessoryBar';` at line 158).
  2. Immediately after the existing `<KeyboardAccessoryBar ... />` block (currently lines 1250-1256) and
     before the `<PlateCalculatorSheet ... />` that follows it, add:
     ```tsx
     <KeyboardDoneBar testID={`${testID}-notes-keyboard-done-bar`} nativeID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID} />
     ```
- Acceptance criteria:
  - `KeyboardDoneBar` is mounted exactly once, alongside (not replacing) the existing
    `KeyboardAccessoryBar`, using `NOTES_KEYBOARD_ACCESSORY_VIEW_ID` as its `nativeID`.
  - `KeyboardAccessoryBar`'s own props/wiring (`KEYBOARD_ACCESSORY_VIEW_ID`, `showCalculator`,
    `onCalculatorPress`, `onNextPress`) are completely untouched.
  - File still compiles.

## Task 8 — Mount `KeyboardDoneBar` in `EditWorkoutScreen.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/EditWorkoutScreen.tsx`
- Changes (traces to PRD §4.4; resolves Open Question 1 above — identical shape to Task 7):
  1. Add the import: `import { KeyboardDoneBar } from '@/ui/KeyboardDoneBar';` and
     `import { NOTES_KEYBOARD_ACCESSORY_VIEW_ID } from './InlineNoteField';` (alongside the existing
     `import { KeyboardAccessoryBar } from '@/ui/KeyboardAccessoryBar';` at line 93).
  2. Immediately after the existing `<KeyboardAccessoryBar ... />` block (currently lines 626-632) and
     before the `<PlateCalculatorSheet ... />` that follows it, add:
     ```tsx
     <KeyboardDoneBar testID={`${testID}-notes-keyboard-done-bar`} nativeID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID} />
     ```
- Acceptance criteria: same as Task 7, applied to this file.

## Task 9 — Mount `KeyboardDoneBar` in `RoutineEditorScreen.tsx`

- Files:
  - `/root/projects/kyro/src/features/routines/RoutineEditorScreen.tsx`
- Changes (traces to PRD §4.4/§4.8; resolves Open Question 2 above — this screen's *first* accessory bar
  of any kind):
  1. Add the import: `import { KeyboardDoneBar } from '@/ui/KeyboardDoneBar';` and
     `import { NOTES_KEYBOARD_ACCESSORY_VIEW_ID } from '../workout/InlineNoteField';`.
  2. Immediately after the existing `<AddToSupersetSheet ... />` block (currently the last child before
     the component's closing `</View>`, lines ~445-452), add:
     ```tsx
     <KeyboardDoneBar testID={`${testID}-notes-keyboard-done-bar`} nativeID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID} />
     ```
- Acceptance criteria:
  - `KeyboardDoneBar` is mounted exactly once, as a trailing sibling inside the screen's outer `View`,
    using `NOTES_KEYBOARD_ACCESSORY_VIEW_ID` as its `nativeID`.
  - No other accessory-bar-related code exists on this screen before this task (confirmed by grep — this
    task adds the first one).
  - File still compiles.

## Task 10 — Delete `NoteEditSheet.tsx` and its test

- Files:
  - `/root/projects/kyro/src/features/workout/NoteEditSheet.tsx` (delete)
  - `/root/projects/kyro/src/features/workout/__tests__/NoteEditSheet.test.tsx` (delete)
- Changes (traces to PRD §4.2/§4.9): delete both files. By this point in the task sequence (Tasks 3 and 5
  already removed the only two call sites), nothing in the tree imports `NoteEditSheet` anymore.
- Acceptance criteria:
  - Neither file exists on disk.
  - `grep -rn "NoteEditSheet" src/` (excluding this PRD/TASKS.md themselves) returns zero matches in
    `.tsx`/`.ts` source files — full verification happens after Task 11's doc-comment repoints, but no
    *import or JSX usage* of `NoteEditSheet` should remain after this task.
  - The full test suite still discovers and runs without a dangling reference to the deleted test file
    (Jest doesn't need any config change — deleting the file is sufficient, there's no explicit test-file
    allowlist in this repo's Jest config).

## Task 11 — Doc-comment-only repoints: `NoteEditSheet` → `DurationEditSheet`

- Files:
  - `/root/projects/kyro/src/features/workout/ExercisePickerSheet.tsx` (line ~99)
  - `/root/projects/kyro/src/features/workout/SaveWorkoutSheet.tsx` (lines ~14 and ~108, two occurrences)
  - `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx` (line ~62)
  - `/root/projects/kyro/src/features/workout/AddWarmUpSetsSheet.tsx` (line ~130)
  - `/root/projects/kyro/src/features/routines/FolderNameSheet.tsx` (lines ~5 and ~40, two occurrences)
- Changes (traces to PRD §4.10; see Open Question 3 above for `ExercisePickerSheet.tsx`'s specific case).
  Each of these is a comment-only edit — no runtime behavior changes. Do a literal find/replace of the
  substring `NoteEditSheet` → `DurationEditSheet` at each cited line, then read the resulting sentence to
  confirm it still reads grammatically (grammar/dedup fixups noted per-file below where the literal
  replacement would otherwise read oddly):
  1. `ExercisePickerSheet.tsx` line 99: `this feature (`NoteEditSheet`, `ReorderExercisesSheet`)` →
     `this feature (`DurationEditSheet`, `ReorderExercisesSheet`)`.
  2. `SaveWorkoutSheet.tsx` line 14: `(`DurationEditSheet`/`NoteEditSheet`'s own file headers)` — a literal
     replace would double up `DurationEditSheet`; instead simplify to
     `(`DurationEditSheet`'s own file header)` (singular "header," since only one file is cited now).
  3. `SaveWorkoutSheet.tsx` line 108: `this codebase (`DurationEditSheet.tsx`/`NoteEditSheet.tsx`).` —
     same dedup: simplify to `this codebase (`DurationEditSheet.tsx`).`
  4. `ReorderExercisesSheet.tsx` line 62: `same pattern as `NoteEditSheet` /\n  `DurationEditSheet`)` —
     same dedup: simplify to `same pattern as `DurationEditSheet`)`.
  5. `AddWarmUpSetsSheet.tsx` line 130: `mirrors `NoteEditSheet`'s` → `mirrors `DurationEditSheet`'s`.
  6. `FolderNameSheet.tsx` line 4-5: `same call `NoteEditSheet`\n * (`src/features/workout/NoteEditSheet.tsx`, M2-09) makes` →
     `same call `DurationEditSheet`\n * (`src/features/workout/DurationEditSheet.tsx`, M2-05) makes` (note
     the module id also changes from `NoteEditSheet`'s `M2-09` to `DurationEditSheet`'s own `M2-05`, per
     that file's own header — keep the doc-comment factually accurate, not just textually substituted).
  7. `FolderNameSheet.tsx` line 40: `pattern `NoteEditSheet`/`DurationEditSheet`` — dedup: simplify to
     `pattern `DurationEditSheet``.
- Acceptance criteria:
  - `grep -rln "NoteEditSheet" src/` returns zero results anywhere in `src/` after this task (combined
    with Task 10's deletion, this is the point where the substring disappears from the codebase entirely).
  - Every edited comment still reads as a grammatical, accurate English sentence (no doubled file names,
    no leftover dangling punctuation from the removed segment).
  - No non-comment code changes in any of these six files.

## Task 12 — Update `src/features/workout/__tests__/ExerciseCard.test.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/__tests__/ExerciseCard.test.tsx`
- Changes (traces to PRD §7.1):
  1. In `'renders the thumb, name, and rest-timer row (Off by default)'` (currently ~line 103): replace
     `expect(screen.queryByTestId('card-note-row')).toBeNull();` with
     `expect(screen.getByTestId('card-note-placeholder')).toBeTruthy();` — the row is now always present;
     with `notes: null` (the default in `renderCard`'s base props) it's the placeholder that's asserted.
  2. In `'renders the rest-timer value and a note row when notes are present'` (currently ~line 112): no
     testID changes are needed for `card-note-row` itself (still correct — `InlineNoteField`'s own
     `-row` testID), but add an assertion that `card-note-text` (not just the visible text) is present,
     confirming `NoteText` is nested one level inside `InlineNoteField`'s display branch:
     `expect(screen.getByTestId('card-note-text')).toBeTruthy();` alongside the existing
     `expect(screen.getByTestId('card-note-row')).toBeTruthy();` and `expect(screen.getByText('Keep elbows
     tucked')).toBeTruthy();` lines.
  3. Rewrite the `describe('ExerciseCard — note row + sheet (02 §9)')` block (currently lines 220-255) to:
     - Rename the `describe` block to `describe('ExerciseCard — inline note field (06 §4.1)')`.
     - Rewrite `'tapping the note row opens the note sheet pre-filled; saving persists it'` to
       `'tapping the note row enters edit mode pre-filled; typing and blurring persists it'`:
       ```tsx
       it('tapping the note row enters edit mode pre-filled; typing and blurring persists it', async () => {
         const fixture = await setup();
         await renderCard(fixture, { notes: 'Old note' });

         await fireEvent.press(screen.getByTestId('card-note-row'));
         await waitFor(() => expect(screen.getByTestId('card-note-input')).toBeTruthy());
         expect(screen.getByTestId('card-note-input').props.value).toBe('Old note');

         await fireEvent.changeText(screen.getByTestId('card-note-input'), 'New note');
         await fireEvent(screen.getByTestId('card-note-input'), 'blur');

         await waitFor(() => expect(screen.queryByTestId('card-note-input')).toBeNull());
         await waitFor(async () => {
           const persisted = await fixture.workoutRepo.getFull(
             useActiveWorkoutStore.getState().workout!.id,
           );
           expect(persisted!.exercises[0]!.notes).toBe('New note');
         });
       });
       ```
       (`fireEvent` already imported from `@testing-library/react-native` at the top of this file — no new
       import needed.)
     - Delete the second test, `'⋯ → Add a Note opens the note sheet even with no existing note'`, outright
       — that menu item no longer exists.
- Acceptance criteria:
  - `card-note-sheet-input`/`card-note-sheet-save`/`card-menu-add-note` no longer appear anywhere in this
    file.
  - Running this test file green requires Tasks 3 and 4 already applied (this task assumes their
    `InlineNoteField`/testID wiring exists).
  - `npx jest src/features/workout/__tests__/ExerciseCard.test.tsx` passes.

## Task 13 — Update `src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`
- Changes (traces to PRD §7.1):
  1. In `baseProps(...)`, delete the line `onAddNote: jest.fn(),`.
  2. In `'every item dismisses then fires its own callback'`, delete the two lines:
     ```tsx
     await fireEvent.press(screen.getByTestId('menu-add-note'));
     expect(props.onAddNote).toHaveBeenCalledTimes(1);
     ```
     and change the final assertion in that test from
     `expect(props.onDismiss).toHaveBeenCalledTimes(7);` to
     `expect(props.onDismiss).toHaveBeenCalledTimes(6);` (one fewer item: Reorder, Replace,
     Remove-from-Superset, Add Warm-Up Sets, Rest Timer, Remove Exercise).
- Acceptance criteria:
  - `onAddNote`/`menu-add-note` no longer appear anywhere in this file.
  - `npx jest src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx` passes.

## Task 14 — Update `src/features/routines/__tests__/RoutineEditorScreen.test.tsx`

- Files:
  - `/root/projects/kyro/src/features/routines/__tests__/RoutineEditorScreen.test.tsx`
- Changes (traces to PRD §7.1): rewrite the test currently named
  `'Add a Note opens NoteEditSheet; saving shows the note on the card'` (currently ~line 442) to the
  press-note-row → type → blur → assert-persisted shape:
  ```tsx
  it('tapping the note row enters edit mode; typing and blurring shows the note on the card', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${cardTestID}-note-row`));
    const noteInput = await screen.findByTestId(`${cardTestID}-note-input`);
    await fireEvent.changeText(noteInput, 'Keep elbows tucked');
    await fireEvent(noteInput, 'blur');

    expect(screen.getByTestId(`${cardTestID}-note-text`)).toBeTruthy();
  });
  ```
  No more `${cardTestID}-menu-button` / `${cardTestID}-menu-add-note` presses, and no more
  `${cardTestID}-note-sheet-input` / `${cardTestID}-note-sheet-save` references. (`fireEvent` is already
  imported at the top of this file.)
- Acceptance criteria:
  - `note-sheet`/`menu-add-note` no longer appear anywhere in this file.
  - `npx jest src/features/routines/__tests__/RoutineEditorScreen.test.tsx` passes.

## Task 15 — New test file `src/features/workout/__tests__/InlineNoteField.test.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/__tests__/InlineNoteField.test.tsx` (new)
- Changes (traces to PRD §7.2 — direct-render tests mirroring the coverage shape the deleted
  `NoteEditSheet.test.tsx` had, adapted for the new dual-mode component). Cover, at minimum:
  1. `value: null` renders `card-placeholder` (using a `testID="card"` prop, forwarding to
     `card-placeholder`) with the "Add a note for this exercise…" text; `card-text`/`card-input` are
     absent.
  2. `value: 'Check out https://example.com'` renders `card-text` (via `NoteText`) with a tappable link
     segment (`card-text-link-<n>`, mirroring `NoteText.test.tsx`'s own link-testID convention) instead of
     the placeholder.
  3. Pressing `card-row` while `value` is non-null enters edit mode: `card-input` appears, pre-filled with
     the current `value` (`.props.value` assertion).
  4. Typing new text into `card-input` then firing a `'blur'` event calls `onSave` with the new, trimmed
     text, and returns to display mode (`card-input` becomes absent, `card-text`/`card-placeholder`
     re-appears — note the component itself doesn't re-render with the new value unless the parent updates
     `value`, so this can assert against a controlled re-render via `rerender` with the new `value`, similar
     to how `ExerciseCard.test.tsx`/`RoutineEditorScreen.test.tsx` assert against the persisted DB value
     rather than static on-screen text after a direct-prop change).
  5. Typing only whitespace into `card-input` then blurring calls `onSave(null)` (not `onSave('   ')`).
  6. Pressing `card-row` while `value` is `null`/empty also enters edit mode (`card-input` appears,
     pre-filled empty) — the placeholder itself is a tap target, not just non-interactive text.
  7. Default testID (no `testID` prop passed) falls back to `inline-note-field-*` (e.g.
     `inline-note-field-placeholder`).

  Use the same render harness convention as `NoteText.test.tsx`/other direct-render UI tests in this repo:
  wrap in `<ThemeProvider preference="dark">`, no SQLite/store setup needed (this component takes plain
  props, no repository dependency).
- Acceptance criteria:
  - All 7 cases above (or an equivalent covering set) pass.
  - `npx jest src/features/workout/__tests__/InlineNoteField.test.tsx` passes with no `act(...)` warnings.

## Task 16 — New test file `src/ui/__tests__/KeyboardDoneBar.test.tsx`

- Files:
  - `/root/projects/kyro/src/ui/__tests__/KeyboardDoneBar.test.tsx` (new)
- Changes (traces to PRD §7.2). Follow the same `Keyboard` mocking convention this repo already uses
  elsewhere for native RN APIs (check `KeyboardAccessoryBar.test.tsx` if one exists, or any existing test
  that spies on a native `react-native` module, for the exact mock shape used in this codebase). Cover:
  1. Renders with the given `nativeID` passed through to the underlying `InputAccessoryView` (assert via
     the rendered tree's props, or via `getByTestId('keyboard-done-bar')`/custom `testID` being present at
     all — `InputAccessoryView` itself is a no-op wrapper under Jest's RN test renderer the same way it
     already is for `KeyboardAccessoryBar`, so assert what that existing test file asserts for the
     equivalent case).
  2. Pressing `<testID>-done` (default `keyboard-done-bar-done`) calls `Keyboard.dismiss` exactly once
     (`jest.spyOn(Keyboard, 'dismiss')` from `react-native`).
  3. Default `testID` (`keyboard-done-bar`) is used when none is supplied.
- Acceptance criteria:
  - All 3 cases above pass.
  - `npx jest src/ui/__tests__/KeyboardDoneBar.test.tsx` passes.

## Summary of what requires you (not a dev agent)

1. **Visual QA on a real iOS simulator/device** for `InlineNoteField`'s empty/filled/editing states and
   `KeyboardDoneBar`'s exact vertical position/styling relative to the keyboard — Jest/RNTL cannot render a
   real `InputAccessoryView` pixel-perfect; the automated tests above prove wiring and callback
   correctness, not final visual placement (PRD §8.1).
2. **Confirm the placeholder copy** ("Add a note for this exercise…", carried over verbatim from the old
   sheet) is still the desired wording — this PRD deliberately kept the app's existing copy rather than
   Hevy's "Add notes here…" (PRD §8.2, §9).
3. **Decide, later, whether Android deserves its own keyboard-dismiss affordance** (e.g.
   `returnKeyType="done"` + `onSubmitEditing`) — explicitly out of scope for this PRD, deferred as a
   distinct follow-up (PRD §8.3, §9).
