# PRD: Reorder Exercises Sheet — Title, Button, and Bottom-Gap Fixes

**Sub-project:** C (`reorder-exercises-sheet-fixes`) of the 8-PRD Hevy-style UI/UX overhaul decomposition
**Depends on:** A (`sheet-header-footer-foundation`) — see §9 for how this PRD degrades gracefully if A hasn't landed yet
**Status:** Design only. No code changes made while authoring this document.
**Target file (only file touched):** `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`

---

## 1. Problem

User-reported, verbatim:

> "Reorder panel — Save order button is getting cut off at the bottom - add some gap at the bottom after the button. And make that button fill width. And Reorder Exercises looks too small and not centered. Center that. Also the slide up panel doesn't go fully up. There is some gap at the top."

Verified against the current source (`ReorderExercisesSheet.tsx`, read in full while authoring this doc):

1. **Save button gets cut off.** The `<Button label="Save Order" .../>` at the bottom of the sheet has only `style={{ marginTop: spacing['4'] }}` — no bottom padding/margin at all, and no `useSafeAreaInsets()` usage anywhere in the file. On any notched/home-indicator device (iPhone X and later), the button's bottom edge sits flush against — or under — the home-indicator gesture area.
2. **Button is not full-width.** `Button` defaults to `size="md"`, which resolves to `alignSelf: 'flex-start'` in `Button.tsx` (`src/ui/Button.tsx:136`) — the button hugs its label's intrinsic width rather than filling the sheet's width.
3. **Title is small and left-aligned.** The title `<Text>` uses `typography.headline` (17pt semibold, per `src/ui/tokens.ts:317`) with no `textAlign`, so it renders left-aligned at body-adjacent size — small and asymmetric against the sheet's full width, especially once the sheet is a true full-height panel (see #4).
4. **Sheet doesn't reach the top.** This is **not** a bug in this file — it's `src/ui/Sheet.tsx`'s `DETENT_HEIGHT_RATIO.full = 0.9` (`src/ui/Sheet.tsx:60`), i.e. `full` detent is 90% of window height, not 100%, and `Sheet.tsx` never calls `useSafeAreaInsets()`. This is squarely PRD A's (`sheet-header-footer-foundation`) responsibility to fix at the `Sheet` component level. **This PRD does not touch `Sheet.tsx`.** Once A lands, `ReorderExercisesSheet` automatically inherits the fix for free since it already renders inside `<Sheet detent="full">` — no change needed in this file for issue #4.

### Call sites — verified, with one correction to the task brief

The component is shared, so all real render sites must be covered by manual QA (RNTL cannot reliably catch visual/layout regressions in a reused component). I greped every reference to `ReorderExercisesSheet` in `src/` and read each hit. **Only 3 files actually instantiate `<ReorderExercisesSheet>`** — not 5:

| File | Line | Context |
|---|---|---|
| `src/features/workout/ActiveWorkoutScreen.tsx` | 1224 | Active workout, opened via `ExerciseCard`'s ⋯ menu |
| `src/features/workout/EditWorkoutScreen.tsx` | 601 | Past-workout editor |
| `src/features/routines/RoutineEditorScreen.tsx` | 434 | Routine editor |

Two files originally believed to be call sites are **not**:

- `src/features/routines/RoutinesHubScreen.tsx` — only *mentions* `ReorderExercisesSheet.tsx` in a header comment (lines ~121–135) explaining why the M2 sheet was **not** migrated to the newer `react-native-reanimated-dnd` drag library used for folder/routine-card reordering elsewhere on that screen. It never renders the component.
- `src/features/routines/RoutineExerciseCard.tsx` — its header comment says reorder actions "bubble up to `RoutineEditorScreen` via plain callback props — it owns the sheets those need (`ReorderExercisesSheet`, ...)". `RoutineExerciseCard` itself never renders `ReorderExercisesSheet`; `RoutineEditorScreen` (already listed above) does.

Downstream test/QA coverage for this PRD should target the **3 real call sites** above. (See §9 for why the brief's 5-site list is superseded here rather than silently followed.)

---

## 2. Goals

1. Save Order button is never obscured by the home indicator / bottom system chrome on any device, across all 3 call sites.
2. Save Order button fills the sheet's content width (matching the `size="lg"` full-width CTA pattern already used for the equivalent buttons in `SaveWorkoutSheet.tsx` and `ExercisePickerSheet.tsx`).
3. "Reorder Exercises" title reads as an intentional sheet title — centered and appropriately sized — consistent with the codebase's own full-detent-sheet title precedent (`SaveWorkoutSheet.tsx` uses `typography.title2`, not `typography.headline`, for its title).
4. No behavioral change to reorder mechanics, the `onSave`/`onDismiss` contract, row up/down controls, or any consumer's props.
5. Fix lands in exactly one file; all 3 call sites inherit it automatically with zero call-site changes.

## 3. Non-Goals

- **No real drag-and-drop.** `react-native-reanimated-dnd` is now installed and used for routine/folder reordering elsewhere, but this file's own header comment (lines 1–22) explains why up/down buttons were deliberately chosen over a pan gesture (accessibility-parity + RNTL-testability) and that reasoning still holds. The user's complaint is about layout (cut-off button, small/off-center title, incomplete sheet height), not the interaction model. Adding drag-and-drop here is scope creep beyond what was asked. **[DEFERRED]** — flagged as a good future idea in §9, not part of this PRD.
- **No changes to `Sheet.tsx`.** The 90%-height detent and missing safe-area handling at the `Sheet` level is PRD A's scope. This PRD only fixes what's local to `ReorderExercisesSheet.tsx`'s own title/button layout.
- **No changes to reorder data/store logic.** `moveItem`, `handleSave`, the `onSave(orderedIds)` contract, and the draft re-seeding logic (`wasVisible` effect) are untouched.
- **No changes to any of the 3 call sites.** The prop contract (`visible`, `onDismiss`, `exercises`, `onSave`, `testID`) is unchanged, so `ActiveWorkoutScreen.tsx`, `EditWorkoutScreen.tsx`, and `RoutineEditorScreen.tsx` need no code edits — only manual re-verification (§7/§8).
- **No new shared "footer safe-area" primitive.** If PRD A ships one, a follow-up should migrate this file to it (see §9); this PRD implements the fix locally with `useSafeAreaInsets()` directly, per the task brief's explicit fallback instruction.

## 4. Architecture Decisions

Single file, single component. All changes are inside the `return` statement (and its new import) of `ReorderExercisesSheet.tsx`. No new files, no new exports beyond what already exists.

### 4.1 Imports — add `useSafeAreaInsets`

**Before:**
```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';
```

**After:**
```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';
```

`react-native-safe-area-context` is already a direct dependency (`package.json`: `"react-native-safe-area-context": "~5.7.0"`) and is already imported directly by ~19 other `src/features/**` files (e.g. `EditWorkoutScreen.tsx`, `ActiveWorkoutScreen.tsx`, `RoutineEditorScreen.tsx` — all 3 of this component's own call sites already import it), so this is an established, unremarkable import for a feature-layer component.

### 4.2 Hook call — read insets

**Before:**
```tsx
  const { colors, typography, spacing } = useTheme();
```

**After:**
```tsx
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
```

Add this line immediately after the existing `useTheme()` call (currently line 59), before the `draft` state declaration.

### 4.3 Title — centered, bumped to `title2`

**Before:**
```tsx
        <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
          Reorder Exercises
        </Text>
```

**After:**
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

Two changes, both addressing the user's single bundled complaint ("looks too small **and** not centered"):
- `typography.headline` (17pt semibold) → `typography.title2` (22pt semibold, `src/ui/tokens.ts:315`). This isn't an arbitrary size pick — it matches the existing precedent set by `SaveWorkoutSheet.tsx` (also a `detent="full"` sheet with a title + trailing primary button), which already uses `typography.title2` for its title. `ReorderExercisesSheet` was the outlier at `headline`.
- `textAlign: 'center'` added — the only mechanism specified by the task brief's fallback instruction (no `SheetHeader` primitive exists yet to reuse — see §9).
- `marginBottom` bumped from `spacing['3']` (12pt) to `spacing['4']` (16pt) to match `SaveWorkoutSheet.tsx`'s own title-to-content spacing at the same `title2` size (proportionate breathing room for the larger glyph).

### 4.4 Save button — full-width + safe-area-aware bottom gap

**Before:**
```tsx
        <Button
          testID={`${testID}-save`}
          label="Save Order"
          variant="primary"
          onPress={handleSave}
          style={{ marginTop: spacing['4'] }}
        />
```

**After:**
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

- `size="lg"` — this is the *existing*, already-shipped mechanism for a full-width primary CTA in this design system: `Button.tsx:136` sets `alignSelf: size === 'lg' ? 'stretch' : 'flex-start'` and `SIZE_HEIGHT.lg = 50`. No raw `width: '100%'` or `alignSelf` override needed — `size="lg"` is literally documented in `Button.tsx`'s own file header ("Sizes (07 §5): `lg` 50 pt full-width, `md` 40 pt, `sm` 32 pt pill radius") as the full-width size. This is also the exact prop already used for the equivalent "confirm" buttons in `ExercisePickerSheet.tsx:339` and `SaveWorkoutSheet.tsx:331` — using it here makes `ReorderExercisesSheet` consistent with its sibling full-detent sheets rather than introducing a new one-off styling approach.
- `marginBottom: insets.bottom + spacing['4']` — reserves the device's home-indicator/gesture-area height (`insets.bottom`; 0 on non-notched devices) plus one spacing token (16pt) of visual breathing room above it. This mirrors the codebase's existing `insets.bottom`-based pattern for bottom-anchored UI (`GlobalWorkoutBar.tsx` uses `TAB_BAR_CONTENT_HEIGHT + insets.bottom` for the same class of problem — clearing system chrome at the bottom of the screen).
- `marginTop: spacing['4']` is kept unchanged (still the correct gap between the exercise list and the button).

### 4.5 Full after-state of the changed render block (for reference)

```tsx
  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View style={{ paddingHorizontal: spacing['4'], flex: 1 }}>
        <Text
          style={[
            typography.title2,
            { color: colors.text.primary, textAlign: 'center', marginBottom: spacing['4'] },
          ]}
        >
          Reorder Exercises
        </Text>
        <ScrollView style={{ flex: 1 }}>
          {/* rows unchanged — draft.map(...) exactly as today */}
        </ScrollView>
        <Button
          testID={`${testID}-save`}
          label="Save Order"
          variant="primary"
          size="lg"
          onPress={handleSave}
          style={{ marginTop: spacing['4'], marginBottom: insets.bottom + spacing['4'] }}
        />
      </View>
    </Sheet>
  );
```

Nothing inside the `ScrollView`'s row-rendering (`draft.map(...)`, the `GripVertical` icon, `up`/`down` `Pressable`s, their `testID`s) changes at all.

### 4.6 Technical risk considered and resolved: `useSafeAreaInsets()` inside `Sheet`'s `<Modal>`

`Sheet.tsx` renders its children inside React Native's own `<Modal>` (`src/ui/Sheet.tsx:128`, `<Modal visible transparent animationType="none" ...>`). `react-native-safe-area-context` has a documented gotcha where content inside a `Modal` can read stale/incorrect insets, because `Modal` presents into a **separate native view hierarchy** from wherever `SafeAreaProvider` did its native measurement — this matters when the Modal doesn't cover the full screen (e.g. iPad `pageSheet`/`formSheet` presentation) or the app measures insets before rotation.

Resolved as **not a practical risk here**, because:
- `Sheet`'s `<Modal>` uses no `presentationStyle` override, so it defaults to a **full-screen** presentation on iOS, covering the entire physical screen — identical device geometry (notch/home-indicator) to whatever the root `SafeAreaProvider` (mounted once in `app/_layout.tsx:370`) originally measured.
- `useSafeAreaInsets()` reads from **React Context**, not the native tree — `Modal` doesn't break the React component tree, only where content is natively portaled — so the hook still resolves to the same context value provided by the app-root `SafeAreaProvider`, and that value is numerically correct for this specific full-screen-transparent-Modal case.
- This is the first sheet-content component in the codebase to call `useSafeAreaInsets()` directly (verified: no other file under `src/features/workout/*Sheet.tsx` or `src/features/routines/*Sheet.tsx` currently does), so there's no existing regression precedent to worry about breaking, but it also means there's no in-repo proof it renders correctly on a real device — flagged as a manual on-device check in §8, since Jest's safe-area mock (`jest/safe-area-context-mock.tsx`) always returns all-zero insets and cannot catch a real-device layout issue.

## 5. API Change Summary

None. `ReorderExercisesSheetProps` (`visible`, `onDismiss`, `exercises`, `onSave`, `testID`) is unchanged. No new props added, no props removed, no prop types changed. All 3 call sites require zero code changes.

## 6. Frontend Change Summary

| Concern | File | Change |
|---|---|---|
| Bottom cutoff | `ReorderExercisesSheet.tsx` | Add `useSafeAreaInsets()`; Save button gets `marginBottom: insets.bottom + spacing['4']` |
| Full-width button | `ReorderExercisesSheet.tsx` | Save button gets `size="lg"` (existing full-width variant) |
| Small/off-center title | `ReorderExercisesSheet.tsx` | Title `typography.headline` → `typography.title2`, add `textAlign: 'center'` |
| Sheet not reaching top | *(none — `Sheet.tsx`, out of scope, owned by PRD A)* | No change in this PRD; inherited automatically once A ships |

No other UI files change. No routing, no store/query changes, no new dependencies (safe-area-context is already installed and used elsewhere).

## 7. Testing

**Automated (RNTL):**

- Existing coverage already exercises this component indirectly and should be re-run to confirm no regression, since none of the changed lines touch `testID`s or interaction handlers:
  - `src/features/workout/__tests__/EditWorkoutScreen.test.tsx` (asserts `edit-reorder-sheet-row-{id}-up` press + `edit-reorder-sheet-save` press flow) — verified this test only queries by `testID`, never by style/size, so it should pass unchanged.
  - `src/features/routines/__tests__/RoutineEditorScreen.test.tsx` (asserts `${testID}-reorder-sheet` renders) — same, `testID`-based, unaffected.
  - `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx` — mounts `ReorderExercisesSheet` via the active-workout flow; re-run for regressions.
- No dedicated `ReorderExercisesSheet.test.tsx` exists today (verified — no test file references its `testID`s directly, only the 3 screen-level test files exercise it indirectly). This PRD does not mandate creating one (behavior is unchanged, only layout), but if task generation wants direct coverage, cheap additions would be:
  - Assert the save button's rendered `style` includes `size`-driven full-width behavior (e.g. snapshot or explicit style assertion on `getByTestId('...-save')`).
  - Assert the title `Text`'s style includes `textAlign: 'center'`.
  - Both are optional/low-value given Jest's safe-area mock returns all-zero insets (`jest/safe-area-context-mock.tsx`), so the actual bug being fixed (bottom cutoff on a real notched device) is **not** something this repo's automated suite can verify either before or after this change.

**Manual (required — see §8):** visual/layout regressions in a reused component are exactly the kind of bug automated tests in this repo won't catch (confirmed: `testID`-only queries throughout, zero-inset mock). Each of the 3 real call sites must be manually re-checked.

## 8. Manual Intervention Required From You

On a physical device or simulator with a notch/home-indicator (e.g. iPhone 14/15 class), after implementation:

1. Open the reorder sheet from **all 3 real call sites** and confirm in each:
   - `ActiveWorkoutScreen.tsx` — active workout ⋯ menu → Reorder Exercises
   - `EditWorkoutScreen.tsx` — past-workout editor → Reorder Exercises
   - `RoutineEditorScreen.tsx` — routine editor → Reorder Exercises
2. In each, confirm:
   - Save Order button is fully visible, fully clear of the home-indicator gesture bar, with visible gap beneath it.
   - Save Order button spans the full width of the sheet (minus the standard horizontal gutter).
   - "Reorder Exercises" title is centered and reads as a proper title (not undersized).
   - (Once PRD A has also landed) the sheet itself now reaches the very top of the screen with no gap.
3. Confirm on a **non-notched** device/simulator (or by checking `insets.bottom === 0` behavior) that the bottom gap doesn't look *excessive* when there's no home indicator to clear — the button should still have the flat `spacing['4']` (16pt) breathing room, just not the extra inset.
4. Confirm dark and light theme both render the (unchanged) colors correctly — no color values were touched, but worth a glance given the size/layout change.

Nothing else requires your intervention — no data migrations, no environment/config changes, no new dependencies to install.

## 9. Open Questions & Decisions

- **Q: Should this PRD reconcile with PRD A's `SheetHeader`/footer-safe-area primitives?**
  [RESOLVED: PRD A had not landed yet at authoring time — verified `/root/projects/kyro/docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/PRD.md` does not exist. This PRD implements the fallback the task brief explicitly specified: a plain `textAlign: 'center'` title fix and a direct `useSafeAreaInsets()` call for the button's bottom margin, both scoped entirely to `ReorderExercisesSheet.tsx`. When PRD A ships a `SheetHeader` component and/or a footer-safe-area primitive, a fast-follow task should swap this file's local title `<Text>` for `SheetHeader` and the button's manual `insets.bottom + spacing['4']` margin for whatever footer wrapper A introduces, so all sheets in the app converge on one shared visual treatment instead of each sheet hand-rolling it. That reconciliation is out of scope for this PRD and should be picked up at task-generation time for whichever PRD lands second between A and C.]

- **Q: The task brief's fallback only mentioned `textAlign: 'center'` for the title — should the title's font size also change, given the user's complaint was "too small **and** not centered"?**
  [RESOLVED: bumping `typography.headline` → `typography.title2` in addition to centering, because leaving the size at `headline` would only address half of the user's verbatim complaint. This isn't an arbitrary size pick — `title2` matches the existing precedent in `SaveWorkoutSheet.tsx`, the closest sibling (`detent="full"` sheet, title + trailing full-width primary button), which already uses `title2` for its title. `ReorderExercisesSheet` was the inconsistent outlier at `headline`; this fix also makes it consistent with its sibling.]

- **Q: The task brief listed 5 call sites (`ActiveWorkoutScreen`, `EditWorkoutScreen`, `RoutinesHubScreen`, `RoutineEditorScreen`, `RoutineExerciseCard`). Verification found only 3 actually render the component.**
  [RESOLVED: corrected the call-site list to the 3 verified real render sites (`ActiveWorkoutScreen.tsx:1224`, `EditWorkoutScreen.tsx:601`, `RoutineEditorScreen.tsx:434`) in §1 and §8, rather than silently testing against the brief's inaccurate list. `RoutinesHubScreen.tsx` only references the component in an explanatory code comment about *not* migrating it to drag-and-drop; `RoutineExerciseCard.tsx` bubbles reorder actions up to `RoutineEditorScreen`, which owns the actual sheet instance. Flagging the correction explicitly here so downstream QA doesn't waste time hunting for a reorder sheet inside `RoutinesHubScreen` or `RoutineExerciseCard` that doesn't exist.]

- **Q: Is real drag-and-drop reordering (now that `react-native-reanimated-dnd` is installed and used for routine/folder reordering) in scope, since it would also incidentally "feel" more finished alongside this visual cleanup?**
  [DEFERRED: explicitly out of scope per the task brief and this component's own header comment, which already documents a deliberate, still-valid rationale for up/down buttons over a pan gesture (accessibility parity + RNTL-testability, corroborated by `RoutinesHubScreen.tsx`'s own comment calling the migration "optional... marginal payoff"). Worth a dedicated future PRD if there's appetite, but bundling it here would turn a small, low-risk layout fix into a "risky wide-blast-radius migration of working, tested M2 code" — exactly the anti-pattern `RoutinesHubScreen.tsx`'s own comment warns against.]

- **Q: Are `SaveWorkoutSheet.tsx`'s and `ExercisePickerSheet.tsx`'s footer Save/Confirm buttons exposed to the same bottom-cutoff bug (neither currently calls `useSafeAreaInsets()`)?**
  [DEFERRED: confirmed true by inspection — `SaveWorkoutSheet.tsx:331` uses a flat `marginBottom: spacing['6']` with no insets, and `ExercisePickerSheet.tsx`'s confirm-button wrapper (`~line 331`) uses a flat `padding: spacing['4']` with no insets. Both are latent instances of the same class of bug this PRD fixes in `ReorderExercisesSheet.tsx`. Out of scope here (the task explicitly scopes this PRD to `ReorderExercisesSheet.tsx` only), but worth a follow-up cleanup task — ideally driven by whatever shared footer-safe-area primitive PRD A introduces, so it's fixed once centrally rather than as three more one-off `insets.bottom` patches.]

- **Q: Does adding `useSafeAreaInsets()` inside content rendered through `Sheet.tsx`'s RN `<Modal>` risk stale/incorrect insets (a documented `react-native-safe-area-context` gotcha)?**
  [RESOLVED: not a practical risk for this specific case — see §4.6 for full reasoning. `Sheet`'s `<Modal>` has no `presentationStyle` override (defaults to full-screen on iOS), so it covers identical screen geometry to the app-root `SafeAreaProvider`'s own measurement, and `useSafeAreaInsets()` reads via React Context (unaffected by `Modal`'s native-only portaling). Still flagged as a manual on-device check in §8 as cheap insurance, since Jest's safe-area mock returns all-zero insets and can't verify this class of issue either way.]
