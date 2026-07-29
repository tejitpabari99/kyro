# 06 — Notes: Always-Visible Inline Field + Keyboard Dismiss

Sub-project **F** of the 8-PRD Hevy-style UI/UX overhaul decomposition.
Loosely depends on **A** (`sheet-header-footer-foundation`) for header/menu-item conventions.

**Dependency check:** `docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/PRD.md`
does not exist yet at the time of writing (only `03-reorder-exercises-sheet-fixes/` exists as an
empty directory alongside this one — no other PRD.md is present anywhere under
`docs/agent_files/tasks/`). This PRD therefore does not reconcile against A's conventions; it
follows the codebase's own existing `Sheet`/`ListRow`/`Card` primitives as observed directly in
`src/ui/`. See §9 for the resolved reconciliation stance.

---

## 1. Problem

The per-exercise note today is a second-class citizen of the ⋯ menu:

- `ExerciseCard.tsx` only renders a note row when `notes != null && notes.length > 0` — a
  never-yet-noted exercise shows **nothing**; there is no visible affordance that notes exist as a
  feature at all unless the user already knows to open the ⋯ menu.
- Adding the first note requires `⋯ → Add a Note` → a half-height `Sheet` (`NoteEditSheet.tsx`)
  with its own `TextInput` and `Save` button — three taps and a full modal transition to write
  "warm up longer" under an exercise.
- Once a note exists, editing it is a two-step tap (row → sheet) instead of typing directly.
- `NoteEditSheet.tsx`'s `TextInput` has **no keyboard-dismiss affordance** at all — no Done button,
  no accessory bar wiring (`inputAccessoryViewID` is never set). The only shared keyboard toolbar
  in the app, `KeyboardAccessoryBar.tsx`, is wired exclusively to the numeric set-table's
  Next-traversal engine (`keyboardFocusStore.ts`) and was never extended to this `TextInput`.
- Hevy's own logging screen (reference screenshot, right phone of
  `Img-5173-5174-1024x683.png`) shows the note as an always-present, borderless "Add notes
  here…" placeholder sitting directly under the exercise name and directly above the rest-timer
  row — no menu, no sheet, no separate entry point.

This PRD makes the note an always-visible inline field on the card itself (mirroring Hevy),
removes the now-redundant "Add a Note" menu item, and adds the missing keyboard-dismiss
affordance the user explicitly asked for ("Show a keyboard down option in the keyboard or at the
top of the keyboard like how Hevy shows").

## 2. Goals

1. The note field is **always rendered** on both `ExerciseCard` (active workout) and
   `RoutineExerciseCard` (routine editor) — never gated on `notes != null`.
2. The note field sits **directly below the exercise name/thumb header and above the Rest Timer
   row** (already true positionally in both cards today — the change is visibility, not order).
3. The user can **type directly into the field in place** — no separate sheet, no extra tap to
   "enter edit mode" beyond the one tap that focuses any text field.
4. A **keyboard-dismiss ("Done") affordance** appears above the keyboard while the note field is
   focused, on iOS (matching Hevy's own accessory-bar pattern).
5. The "Add a Note" ⋯ menu item is removed from both `ExerciseCardMenuSheet` and
   `RoutineExerciseMenuSheet` — notes are no longer a menu-gated action.
6. Saved-note behavior is unchanged: free text, multiline, per-workout-exercise (not per-set),
   trimmed-to-`null`-on-empty, URLs still render as tappable links when the note is not being
   edited.

## 3. Non-Goals

- **Rest Timer** itself: its row, `RestTimerSheet`, `restTimerStore`, `TimerPill`,
  `useRestTimerTicker` are untouched. This PRD only confirms the note row's existing position
  relative to it (already correct) — the Rest Timer row's own content/behavior does not change.
- **Per-set notes**: notes remain one-per-workout-exercise. No schema, store, or UI change makes
  notes per-set.
- **Full Android keyboard-accessory parity**: `InputAccessoryView` (and therefore the new Done
  bar) is iOS-only, matching the pre-existing `KeyboardAccessoryBar` gap. See §9 for the resolved
  decision on this.
- **Reworking `KeyboardAccessoryBar`/`keyboardFocusStore`'s Next-traversal engine**: that system's
  contract (ordered numeric fields, "keyboard never dismisses," weight-field Calculator gating) is
  untouched. The note field gets its own, separate, much smaller accessory bar (see §4.3 for why).
- **`HistoryDetailScreen.tsx`'s read-only note display** (past workouts, via `NoteText`): out of
  scope — history is immutable, nothing there is editable today and nothing here changes that.
- **Sub-project A's header/menu conventions**: A does not exist yet (see dependency check above);
  no reconciliation work is performed here beyond flagging it in §9.

## 4. Architecture Decisions

### 4.1 Core design: dual-mode inline field, not an always-live `TextInput`

Two candidate designs were considered for "always visible, editable in place":

**Rejected — always-live `TextInput`.** Render a `TextInput` unconditionally in both display and
edit states. Simplest to build, but it silently drops a real, already-shipped, already-tested
feature: `NoteText.tsx`'s tappable-URL-link rendering (`splitTextWithUrls`, nested pressable
`Text` segments, `NoteText.test.tsx`). A plain RN `TextInput` cannot render per-substring
pressable spans — that capability is `Text`-only. Always showing a raw `TextInput` means a saved
note containing a URL can never be tapped to open it again without first tapping into edit mode
and finding the exact character range, which is strictly worse than today.

**Chosen — dual-mode `InlineNoteField`.** A new component with two render states:

- **Display mode** (default, whenever the field isn't focused): renders the existing `NoteText`
  component (grey italic, tappable links) when a note exists, or a plain placeholder ("Add a note
  for this exercise…", `colors.text.tertiary`, italic) when it doesn't. Wrapped in a `Pressable`
  whose `onPress` switches to edit mode.
- **Edit mode** (after that tap, or immediately if already editing): renders a borderless,
  auto-growing multiline `TextInput`, `autoFocus`, pre-filled with the current note, wired to the
  new Done accessory bar. Blurring (tap-away, or the new Done button, which just calls
  `Keyboard.dismiss()`) commits the trimmed draft and returns to display mode.

This keeps the field genuinely "always there" (Goal 1/3: no menu, no sheet, tap-to-type) while
losing nothing: URL-tap-to-open still works whenever the user isn't actively editing, which is
the overwhelming majority of the time a note is on screen. The row-tap-vs-link-tap conflict is
not new plumbing — RN's touch responder system already resolves it today (the innermost
`Pressable`/`Text.onPress` wins over the outer row's `onPress`), since the *old* code already
wrapped `NoteText` in an outer row `Pressable` that opened the sheet. That resolution carries over
unchanged; nothing new needs to be built or tested for it.

Commit semantics (trim; empty → `null`) are lifted verbatim from `NoteEditSheet.handleSave` —
no behavior change to what gets persisted, only to how/when the commit fires (blur instead of a
"Save" button tap).

### 4.2 `NoteEditSheet.tsx` becomes fully dead code — delete it

The user's "Remove that option" was scoped to the ⋯ menu item, but keeping `NoteEditSheet.tsx`
alive after 4.1 would mean maintaining a second, now-unused note-editing UI (half-detent sheet,
own `TextInput`, own "Save" button) that nothing calls anymore once both its only two call sites
(`ExerciseCard.tsx`, `RoutineExerciseCard.tsx`) switch to `InlineNoteField`. An always-visible
inline field makes a dedicated edit sheet redundant by construction — there is no remaining path
that opens it. **Decision: delete `NoteEditSheet.tsx` and its test file entirely** rather than
leave an orphaned, untested-by-omission component in the tree.

Six files carry doc-comment references to `NoteEditSheet.tsx` as a cited precedent for the
"re-seed draft state on the open transition" pattern (`ExercisePickerSheet.tsx`,
`SaveWorkoutSheet.tsx` ×2, `ReorderExercisesSheet.tsx`, `AddWarmUpSetsSheet.tsx`,
`FolderNameSheet.tsx`). These become dangling references to a deleted file. **Decision:** repoint
each to `DurationEditSheet.tsx` (the other sheet those same comments already cite alongside
`NoteEditSheet.tsx`, and which is unaffected by this PRD) — a one-line find/replace per file, no
semantic change, just keeping the comments truthful.

### 4.3 New Done bar is a small, separate `KeyboardDoneBar`, not an extension of `KeyboardAccessoryBar`

Considered extending the existing `KeyboardAccessoryBar` (add a `showDone`/`onDonePress` prop)
instead of building a second component. Rejected:

- `KeyboardAccessoryBar` and its backing `keyboardFocusStore` are purpose-built around **ordered
  numeric fields**: every registrant supplies a `{exercisePosition, rowIndex, columnIndex}` order
  tuple and an `isWeight` flag (for the Calculator button gate); `focusNext()` walks that registry.
  None of that has any meaning for a single free-text note field — it isn't part of the Next
  traversal chain, isn't a weight field, and doesn't need an order tuple. Bolting a `Done` button
  onto that component would mean either (a) the notes field fakes a registration into a registry
  designed for a completely different traversal semantic it doesn't participate in, or (b) the
  component grows a second, unrelated "not every input on this bar is a numeric field" branch.
  Both bloat a component whose whole existing contract (documented at length in its own file
  header) is "one shared bar for the ordered numeric chain."
- `keyboardFocusStore.ts`'s own doc header calls out **"keyboard-never-dismisses"** as a deliberate
  contract for the numeric Next chain (`focusNext` calls `.focus()` directly, never
  `Keyboard.dismiss()`, so the keyboard stays mounted across the whole set-table). A notes field
  has the opposite natural contract — "I'm done writing this note, dismiss" is exactly what the
  user asked for. Sharing one component across two deliberately opposite dismiss philosophies is
  more confusing than two small, single-purpose components.

**Decision:** a new `src/ui/KeyboardDoneBar.tsx` — same `InputAccessoryView` mounting pattern as
`KeyboardAccessoryBar` (one instance per screen, shared `nativeID`, iOS-only by the same
`InputAccessoryView` native no-op-on-Android behavior), but with a single "Done" button whose
`onPress` is just `Keyboard.dismiss()`. It needs no callback prop at all: dismissing the keyboard
fires the focused `TextInput`'s native `onBlur`, and `InlineNoteField`'s commit already happens in
`onBlur` (§4.1) — the Done bar doesn't need to know anything about notes, drafts, or stores. This
also makes it trivially reusable by any future free-text field the app adds, without threading a
single new prop through it.

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

### 4.4 One shared `nativeID` per screen, mirroring the numeric bar's own mount pattern

`InputAccessoryView` is a native view attached to whichever `TextInput` currently holds focus;
since only one `TextInput` can be focused at a time, one `KeyboardDoneBar` instance per screen
(same `nativeID` referenced by every `InlineNoteField`'s `TextInput` on that screen) is sufficient
— exactly how the existing numeric `KeyboardAccessoryBar` is mounted once per screen and shared by
every `NumericInput` in the set table. No per-card unique ID or dynamic registration is needed.

The constant is colocated with its only consumer rather than added to `keyboardFocusStore.ts`
(which is entirely about the unrelated numeric registry — adding an unrelated ID constant there
would be a misleading precedent):

```tsx
// src/features/workout/InlineNoteField.tsx (new) — exported alongside the component
export const NOTES_KEYBOARD_ACCESSORY_VIEW_ID = 'kyro-notes-accessory';
```

Mount sites (one `<KeyboardDoneBar nativeID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID} />` each,
alongside — not replacing — the existing `<KeyboardAccessoryBar />`):

- `ActiveWorkoutScreen.tsx` (already mounts `KeyboardAccessoryBar` near line 1250)
- `EditWorkoutScreen.tsx` (already mounts `KeyboardAccessoryBar` near line 626)
- `RoutineEditorScreen.tsx` (mounts **no** accessory bar today — `RoutineSetRow`'s numeric inputs
  don't use `KeyboardAccessoryBar` at all, confirmed by grep; this is a net-new mount, isolated to
  this PRD, with no interaction with any existing accessory-bar wiring on that screen)

### 4.5 `InlineNoteField.tsx` — full component

New file, `src/features/workout/InlineNoteField.tsx` (workout-feature-owned, imported by both
`ExerciseCard.tsx` and `RoutineExerciseCard.tsx` — the same cross-feature-reuse precedent
`RoutineExerciseCard.tsx` already sets by importing `NoteText`/`RestTimerSheet`/
`formatRestSeconds` from `../workout/*`).

Deliberately **no fixed `minHeight`** (the old sheet used `minHeight: 120`, appropriate for a
dedicated full-sheet editor; inline on a compact card, a 120pt-tall empty box would be jarring —
the field should read as a single placeholder line when empty and grow with content, matching the
compact single-line look in the Hevy reference screenshot). Deliberately **no background box /
border** in either mode — matches Hevy's borderless look and this codebase's existing
typography-driven (not box-driven) note styling, and avoids a "pop into a box" transition between
display and edit mode.

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

### 4.6 `ExerciseCard.tsx` — remove sheet, mount `InlineNoteField`

**Before** (note row conditionally rendered, `notes != null && notes.length > 0` gate; `⋯ → Add a
Note` opens `NoteEditSheet`):

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

<Pressable testID={`${testID}-rest-timer-row`} /* ... */>
  {/* Rest Timer row */}
</Pressable>
{/* ... */}
<ExerciseCardMenuSheet
  /* ... */
  onAddNote={() => setNoteSheetVisible(true)}
  onRestTimer={() => setRestTimerSheetVisible(true)}
  /* ... */
/>
{/* ... */}
<NoteEditSheet
  testID={`${testID}-note-sheet`}
  visible={noteSheetVisible}
  onDismiss={() => setNoteSheetVisible(false)}
  initialValue={notes ?? ''}
  onSave={handleSaveNote}
/>
```

**After**:

```tsx
<InlineNoteField testID={`${testID}-note`} value={notes} onSave={handleSaveNote} />

<Pressable testID={`${testID}-rest-timer-row`} /* ... unchanged ... */>
  {/* Rest Timer row */}
</Pressable>
{/* ... */}
<ExerciseCardMenuSheet
  /* ... onAddNote prop removed ... */
  onRestTimer={() => setRestTimerSheetVisible(true)}
  /* ... */
/>
{/* NoteEditSheet usage removed entirely */}
```

Also remove: `noteSheetVisible` state, the `NoteEditSheet` import, the `NoteText` import (now only
used inside `InlineNoteField`, not `ExerciseCard` itself). `handleSaveNote` (the
`workoutStore.getState().updateExercise(workoutExerciseId, { notes: nextNote })` call) is
**unchanged** — only its caller changes, from `NoteEditSheet`'s `onSave` to `InlineNoteField`'s
`onSave`. Update the file's own top doc comment (currently lists "note row (URLs tappable) ... and
the ⋯ menu's card-local items (Add a Note, Rest Timer...)") to drop "Add a Note" from that list —
it is no longer a card-local ⋯ item.

### 4.7 `ExerciseCardMenuSheet.tsx` — remove the "Add a Note" item

**Before:**

```tsx
export interface ExerciseCardMenuSheetProps {
  /* ... */
  onAddWarmUpSets: () => void;
  onAddNote: () => void;
  onRestTimer: () => void;
  /* ... */
}
// ...
<ListRow
  testID={`${testID}-warmup-sets`}
  title="Add Warm-Up Sets"
  leading={<Flame ... />}
  onPress={dismissThen(onAddWarmUpSets)}
/>
<ListRow
  testID={`${testID}-add-note`}
  title="Add a Note"
  leading={<StickyNote size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
  onPress={dismissThen(onAddNote)}
/>
<ListRow
  testID={`${testID}-rest-timer`}
  title="Rest Timer"
  leading={<Clock ... />}
  onPress={dismissThen(onRestTimer)}
/>
```

**After:** the `onAddNote` prop, the `StickyNote` import (now unused in this file), and the
`ListRow` block between Add Warm-Up Sets and Rest Timer are all deleted — Rest Timer's `ListRow`
now sits directly after Add Warm-Up Sets. The menu goes from seven items to six: Reorder, Replace,
Add/Remove Superset, Add Warm-Up Sets, Rest Timer, Remove Exercise.

### 4.8 `RoutineExerciseCard.tsx` / `RoutineExerciseMenuSheet.tsx` — mirrored change (scope note)

The literal file list in this task's brief names only `ExerciseCard.tsx` /
`ExerciseCardMenuSheet.tsx` / `NoteEditSheet.tsx` / `KeyboardAccessoryBar.tsx`. Investigation
during this PRD found that `RoutineExerciseCard.tsx` (`src/features/routines/`) is an explicit,
doc-commented structural twin of `ExerciseCard.tsx` ("the routine-editor analogue of
`src/features/workout/ExerciseCard.tsx` — same visual/structural shape") and **imports the same
`NoteEditSheet.tsx`** being deleted in §4.2, with an identical `notes != null` gated row and an
identical "Add a Note" item in its own menu sibling, `RoutineExerciseMenuSheet.tsx`.

Three options were weighed:

1. Delete `NoteEditSheet.tsx` and leave `RoutineExerciseCard.tsx` broken (a compile error )— rejected,
   not viable.
2. Keep `NoteEditSheet.tsx` alive solely for `RoutineExerciseCard.tsx`, leave the routine editor's
   note UX exactly as it was (menu-gated sheet) while only the active-workout card gets the inline
   treatment — rejected: this creates a real, visible UX inconsistency between two cards the
   codebase's own comments describe as intentionally identical in shape, for a change whose whole
   premise is "notes should just always be visible" — leaving one twin behind contradicts that
   premise and would read as a bug, not a scoping choice.
3. **(Chosen)** Apply the identical `InlineNoteField` swap to `RoutineExerciseCard.tsx` /
   `RoutineExerciseMenuSheet.tsx` as well, keeping the two cards' note UX identical the way every
   other piece of their shared chrome (superset indicator, rest-timer row, `+ Add Set`) already is.

This is a deliberate, documented scope expansion beyond the literal file list, made necessary by
the shared `NoteEditSheet.tsx` dependency discovered during investigation — not a scope-creep
judgment call made lightly. See §9 for the formal resolution.

Diff shape is identical to §4.6/§4.7:

- `RoutineExerciseCard.tsx`: remove the `draftExercise.notes != null && ...` gated `Pressable`
  block, replace with `<InlineNoteField testID={`${testID}-note`} value={draftExercise.notes}
  onSave={handleSaveNote} />` positioned identically (before the rest-timer row, which is already
  its position today); remove `noteSheetVisible` state, `NoteEditSheet` import/usage, `onAddNote`
  prop passed to `RoutineExerciseMenuSheet`.
- `RoutineExerciseMenuSheet.tsx`: remove `onAddNote` prop, the "Add a Note" `ListRow`, and the now
  unused `StickyNote` import. Menu goes from six items to five: Reorder, Replace, Add/Remove
  Superset, Rest Timer, Remove Exercise (this menu never had Add Warm-Up Sets, per its own file
  header — "04 §2.1 lists exactly six items, deliberately omitting Add Warm-Up Sets").
- `RoutineEditorScreen.tsx`: gains the new `<KeyboardDoneBar nativeID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID} />`
  mount (§4.4) — the first accessory bar of any kind on this screen.

### 4.9 Files deleted

- `src/features/workout/NoteEditSheet.tsx`
- `src/features/workout/__tests__/NoteEditSheet.test.tsx`

### 4.10 Files with only doc-comment reference updates (no behavior change)

Repoint the "same re-seed-on-open pattern as `NoteEditSheet`" comment to `DurationEditSheet.tsx`
(already cited alongside it in every one of these) in:

- `src/features/workout/ExercisePickerSheet.tsx`
- `src/features/workout/SaveWorkoutSheet.tsx` (two occurrences)
- `src/features/workout/ReorderExercisesSheet.tsx`
- `src/features/workout/AddWarmUpSetsSheet.tsx`
- `src/features/routines/FolderNameSheet.tsx`

## 5. API Change Summary

None. This is a pure UI/interaction-pattern change:

- No SQLite schema/migration change — `workout_exercises.notes` / the draft's `notes` field are
  read/written exactly as before.
- No repository method changes — `WorkoutRepository`/`RoutineRepository` surfaces are untouched.
- `workoutStore.getState().updateExercise(workoutExerciseId, { notes: nextNote })` (active
  workout) and `updateDraftExerciseNotes(draft, draftExercise.id, nextNote)` (routine draft) are
  called with the exact same arguments as before — only the calling component changes (from
  `NoteEditSheet.onSave` to `InlineNoteField.onSave`).

## 6. Frontend Change Summary

| File | Change |
|---|---|
| `src/features/workout/InlineNoteField.tsx` | **New.** Dual-mode always-visible note field (§4.5). Exports `NOTES_KEYBOARD_ACCESSORY_VIEW_ID`. |
| `src/ui/KeyboardDoneBar.tsx` | **New.** Generic iOS `InputAccessoryView` "Done" bar, calls `Keyboard.dismiss()` (§4.3). |
| `src/features/workout/ExerciseCard.tsx` | Remove `notes != null` gated row + `NoteEditSheet` mount + `noteSheetVisible` state + `onAddNote` menu prop; add `InlineNoteField` (§4.6). |
| `src/features/workout/ExerciseCardMenuSheet.tsx` | Remove `onAddNote` prop + "Add a Note" `ListRow` + unused `StickyNote` import (§4.7). |
| `src/features/routines/RoutineExerciseCard.tsx` | Mirrored change to `ExerciseCard.tsx` (§4.8). |
| `src/features/routines/RoutineExerciseMenuSheet.tsx` | Mirrored change to `ExerciseCardMenuSheet.tsx` (§4.8). |
| `src/features/workout/ActiveWorkoutScreen.tsx` | Mount `<KeyboardDoneBar nativeID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID} />` alongside the existing `KeyboardAccessoryBar` mount (§4.4). |
| `src/features/workout/EditWorkoutScreen.tsx` | Same new mount (§4.4). |
| `src/features/routines/RoutineEditorScreen.tsx` | Same new mount — first accessory bar on this screen (§4.4). |
| `src/features/workout/NoteEditSheet.tsx` | **Deleted** (§4.2/§4.9). |
| `src/features/workout/__tests__/NoteEditSheet.test.tsx` | **Deleted** (§4.9). |
| `ExercisePickerSheet.tsx`, `SaveWorkoutSheet.tsx`, `ReorderExercisesSheet.tsx`, `AddWarmUpSetsSheet.tsx`, `FolderNameSheet.tsx` | Doc-comment-only: repoint stale `NoteEditSheet` precedent reference to `DurationEditSheet` (§4.10). |

No new dependencies. No navigation/route changes. No design-token changes (reuses
`typography.subhead`, `colors.text.secondary`/`.tertiary`, existing `spacing` scale).

## 7. Testing

### 7.1 Existing tests requiring updates

- **`src/features/workout/__tests__/ExerciseCard.test.tsx`**
  - `'renders the thumb, name, and rest-timer row (Off by default)'` (line 103): currently asserts
    `queryByTestId('card-note-row')` is `null` when `notes` is `null`. Flips to: the row/placeholder
    is always present — assert `getByTestId('card-note-placeholder')` is truthy instead.
  - `'renders the rest-timer value and a note row when notes are present'` (line 112): update
    testID references from `card-note-row`/implicit `NoteText` rendering to
    `card-note-row`/`card-note-text` per §4.5's scheme (`NoteText` is now nested one level deeper,
    inside `InlineNoteField`'s display branch — its own testID forwarding is unaffected).
  - `describe('ExerciseCard — note row + sheet (02 §9)')` block (lines 220-255): both tests
    (`'tapping the note row opens the note sheet...'`, `'⋯ → Add a Note opens the note sheet...'`)
    are rewritten. The first becomes "tapping the note row enters edit mode; typing and blurring
    persists it" — press `card-note-row`, assert `card-note-input` appears pre-filled, `changeText`,
    fire a `blur` event (RNTL's `fireEvent(input, 'blur')`) instead of pressing a `-save` button,
    assert the DB row's `notes` updated. The second test (`⋯ → Add a Note`) is **deleted outright**
    — that menu item no longer exists.
- **`src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`**: remove `onAddNote` from
  `baseProps`; remove the `menu-add-note` press/assert pair from `'every item dismisses then fires
  its own callback'`; update that test's final `expect(props.onDismiss).toHaveBeenCalledTimes(7)`
  to `6` (one fewer item).
- **`src/features/routines/__tests__/RoutineEditorScreen.test.tsx`**: the
  `'Add a Note opens NoteEditSheet; saving shows the note on the card'` test (line 442) is rewritten
  to the same "press note row → type → blur → assert persisted" shape as above, against
  `${cardTestID}-note-row` / `${cardTestID}-note-input`; no more `-menu-add-note` press.

### 7.2 New test files

- **`src/features/workout/__tests__/InlineNoteField.test.tsx`** (direct-render, mirrors
  `NoteEditSheet.test.tsx`'s coverage shape but for the new dual-mode component): renders
  placeholder when `value` is `null`/empty; renders `NoteText` (and a tappable link) when `value`
  has content; tapping the row enters edit mode with the `TextInput` pre-filled from `value`;
  typing + blur calls `onSave` with the new trimmed text; typing only whitespace + blur calls
  `onSave(null)`; after blur, returns to display mode showing the just-saved text.
- **`src/ui/__tests__/KeyboardDoneBar.test.tsx`**: renders inside an `InputAccessoryView` with the
  given `nativeID`; pressing `-done` calls `Keyboard.dismiss` (spy on `react-native`'s `Keyboard`
  module, same mocking convention already used for other native RN APIs in this test suite).

### 7.3 Manual/acceptance checklist (mirrors `docs/plan/02-feature-spec-workout-logging.md` §3/§9's own checkbox convention for this feature area)

- [ ] Note field is visible on every exercise card immediately, before any note is ever typed
      (placeholder shown, no menu tap required).
- [ ] Note field sits above the Rest Timer row on both the active-workout card and the routine
      editor card.
- [ ] Tapping the note field focuses it immediately and shows the keyboard; no intermediate sheet
      transition.
- [ ] While the note field is focused, a "Done" bar is visible directly above the keyboard (iOS);
      tapping it dismisses the keyboard and commits the note.
- [ ] Tapping away from the note field (e.g., onto the rest-timer row) also commits the note.
- [ ] A note containing a URL, once saved and not being edited, shows the URL as a tappable link
      that opens it (not edit mode).
- [ ] Tapping the row itself (not a link) when it has a saved note enters edit mode with the full
      existing text pre-filled, cursor placed, ready to continue typing.
- [ ] "Add a Note" no longer appears in either exercise card's ⋯ menu (active workout and routine
      editor).
- [ ] Existing notes created before this change still load and display correctly (no data
      migration needed — same `notes` column/field, same trim-to-`null` semantics).
- [ ] Android: note field still works as a normal always-visible `TextInput` (typing, saving); no
      Done bar appears (platform gap, see §9) — OS default (tap-away / back gesture) is the only
      dismiss path, matching the pre-existing numeric-field accessory bar's own Android gap.

## 8. Manual Intervention Required From You

No user is available to answer questions during this planning pass (per house format, all open
questions below are self-resolved), but the following need a human with a device/simulator once
this PRD is implemented — none of them are blockers to writing the PRD, only to shipping it:

1. **Visual QA on a real iOS simulator/device** for the `InlineNoteField` empty/filled/editing
   states and the `KeyboardDoneBar`'s exact vertical position/styling relative to the keyboard —
   Jest/RNTL cannot render a real `InputAccessoryView` pixel-perfect; the component-level tests in
   §7.2 prove wiring and callback correctness, not final visual placement.
2. **Confirm the placeholder copy** ("Add a note for this exercise…", carried over verbatim from
   the old sheet's own placeholder) is still the desired wording — this PRD deliberately did not
   copy Hevy's exact "Add notes here…" microcopy (see §9), but a human product call could override
   that.
3. **Decide, later, whether Android deserves its own dismiss affordance** (e.g. a `returnKeyType`
   + `onSubmitEditing`-based "done" for Android specifically, since `InputAccessoryView` has no
   Android equivalent) — explicitly deferred here, see §9.

## 9. Open Questions & Decisions

- **Does this PRD apply to `RoutineExerciseCard.tsx` / `RoutineExerciseMenuSheet.tsx`, which
  weren't named in the task brief but share `NoteEditSheet.tsx`?**
  [RESOLVED: yes — apply the identical change. Deleting `NoteEditSheet.tsx` (required by "Remove
  that option" reading toward "the whole separate-sheet flow is redundant now," §4.2) makes this
  non-optional — the alternative of keeping the file alive only for the routine editor would
  reintroduce the dead-code problem §4.2 exists to avoid, and leaving the routine editor'
  s note UX menu-gated while the active-workout card's is inline creates a visible, unjustified
  inconsistency between two components the codebase's own comments describe as intentionally
  identical in shape. See §4.8 for full reasoning.]

- **Does `NoteEditSheet.tsx` get deleted, or just the "Add a Note" menu item?**
  [RESOLVED: delete the whole file. An always-visible, tap-to-edit-in-place field (§4.1) leaves no
  remaining caller for a dedicated edit sheet once both of its only two call sites switch over —
  keeping it would be dead code from the moment this PRD ships. See §4.2.]

- **Should the keyboard-dismiss affordance extend `KeyboardAccessoryBar`, or be a new component?**
  [RESOLVED: new component, `KeyboardDoneBar`. `KeyboardAccessoryBar`/`keyboardFocusStore` is
  purpose-built around the numeric Next-traversal registry (order tuples, weight-field gating,
  and a deliberate "keyboard never dismisses" contract) that has no meaning for a single free-text
  field with the opposite natural contract ("I'm done, dismiss"). See §4.3 for the full comparison.]

- **What copy does the placeholder use — Hevy's "Add notes here…" or the app's existing "Add a
  note for this exercise…"?**
  [RESOLVED: keep the app's existing copy (`NoteEditSheet`'s old placeholder, verbatim). The user
  asked to mimic Hevy's *UX pattern* (always-visible, in-place, with a keyboard-dismiss bar), not
  its exact microcopy; the app already has established wording for this exact string and changing
  it isn't part of the stated requirement. A human can override this trivially later (§8.2) since
  it's a one-line string change with no structural implications.]

- **Does the note field need a visible box/border to look "editable," given it now sits directly
  on the card canvas instead of inside an elevated sheet?**
  [RESOLVED: no — borderless in both display and edit mode, matching Hevy's own reference
  screenshot (plain placeholder text, no visible input chrome) and this codebase's existing
  typography-driven note styling (`NoteText`'s grey-italic look was never boxed either). Avoids a
  jarring "pop into a box" transition between the two modes. See §4.5.]

- **What height does the inline `TextInput` use, given the old sheet's `minHeight: 120` was sized
  for a dedicated full-sheet editor?**
  [RESOLVED: no fixed `minHeight` — size naturally to content (single placeholder line when empty,
  grows as the user types), matching the compact per-card chrome every other row on the card
  already uses and the compact look in the Hevy reference screenshot. See §4.5.]

- **Android has no `InputAccessoryView` equivalent — does this PRD scope a parity build?**
  [RESOLVED: no, deferred. This mirrors the exact same gap the existing numeric
  `KeyboardAccessoryBar` already has today (its own file header documents `InputAccessoryView`
  rendering `null` after a `console.warn` on non-iOS, `Platform.OS`-branched inside React Native
  itself, not this codebase's own code). The task brief explicitly says not to scope "a full
  Android parity build unless trivial," and a real Android-specific solution (most likely
  `returnKeyType="done"` + `onSubmitEditing` calling `Keyboard.dismiss()`, since Android's software
  keyboard commonly exposes its own IME "Done"/checkmark action) is a distinct, testable unit of
  work with its own tradeoffs (e.g. `onSubmitEditing` on a `multiline` `TextInput` behaves
  differently across Android keyboard apps) that deserves its own scoped pass rather than being
  folded silently into this PRD. Flagged here rather than silently dropped.]

- **Sub-project A (`sheet-header-footer-foundation`) reconciliation.**
  [RESOLVED: no reconciliation performed — A's `PRD.md` does not exist yet at
  `docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/PRD.md` (confirmed via
  direct filesystem check; only an empty `03-reorder-exercises-sheet-fixes/` directory exists
  alongside this one, no `PRD.md` anywhere under `docs/agent_files/tasks/` at all). This PRD
  deletes a sheet (`NoteEditSheet.tsx`) rather than adding or restyling one, so the header/footer
  conventions A would define have limited surface area here regardless — the one place they'd
  matter is `KeyboardDoneBar`'s visual styling (border/background/button treatment), which this
  PRD deliberately kept minimal and consistent with the existing `KeyboardAccessoryBar` it sits
  alongside (§4.3's code sample) rather than inventing new chrome. If A later defines a stricter
  shared "sheet footer button" primitive, `KeyboardDoneBar`'s single Done button is a small,
  isolated follow-up to reconcile — not a blocker to shipping this PRD.]

- **Does removing the "Add a Note" item change `ExerciseCardMenuSheet`'s / `RoutineExerciseMenuSheet`'s
  visual layout in a way that needs a divider/spacing adjustment?**
  [RESOLVED: no — `ListRow` already renders its own separators per-item (`hideSeparator` only used
  on the last, danger-colored "Remove Exercise" row); removing one `ListRow` from the middle of
  the stack requires no compensating layout change, the remaining rows simply close the gap the
  same way any list re-render would. Confirmed by reading `ExerciseCardMenuSheet.tsx`/
  `RoutineExerciseMenuSheet.tsx` directly — no manual spacing/index math ties rows together.]
