# Tasks: Exercise Picker Settings Icon

## Open Questions

- **§9.5 — PRD A reconciliation (flagged, not blocking).** PRD A
  (`sheet-header-footer-foundation`, `docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/`)
  does not exist on disk yet — confirmed by directory listing at task-generation
  time. This PRD's §4.2 header edit is written against `ExercisePickerSheet.tsx`'s
  *current* hand-rolled header (`<View style={{ flexDirection: 'row', ... }}>` +
  `justifyContent: 'space-between'`), not against any shared header primitive,
  because no such primitive exists yet to build against.
  - **Assumption made to proceed**: implement the header change below directly
    against the current hand-rolled `View` markup now. If/when PRD A lands a
    shared primitive (e.g. `<SheetHeader title=... right={...} />`) that other
    sheets are expected to migrate to, a follow-up task/PR should migrate this
    header edit onto that primitive — the *visual outcome* (title left, gear
    icon + Cancel grouped on the right, in that order) must carry over
    unchanged; only the markup implementing it would change.
  - **Why**: PRD A doesn't exist yet, so there is nothing concrete to build
    against today, and this PRD's own text is explicit that it is "not blocked
    on A landing first" (§9.5, PRD A reconciliation) — the risk is documented,
    not resolved, and that's an intentional, author-sanctioned tradeoff, not an
    oversight to fix during task generation.
- **§9.1 — human product sign-off (not blocking, but worth surfacing).** The
  two-row options-sheet scope this PRD builds (Reset Filters + More Settings)
  is marked `[RESOLVED ... pending human product sign-off]` — i.e. resolved
  enough to build, but the PRD's own author recommends a human confirm the
  scope is right once the original asker ("why is settings not implemented on
  the add exercise option?") is available. This is not a blocker for
  generating or executing this task list; it's carried into the Summary
  section below so a human sees it alongside the implementation.
- No other genuinely `[OPEN]` items were found in PRD §9 — 9.2, 9.3, 9.4, and
  9.6 are all `[RESOLVED]` with no pending follow-up.

---

### Task 1 — Create `ExercisePickerOptionsSheet.tsx`

- **Files:**
  - `src/features/workout/ExercisePickerOptionsSheet.tsx` (new file)
- **Changes:** Create a new component following this codebase's existing
  "nested sheet opened from inside `ExercisePickerSheet`" pattern (the same
  shape `FilterOptionSheet` and `ExerciseDetailSheet` already use, both
  rendered at the bottom of `ExercisePickerSheet.tsx`'s JSX). This is a new
  file — not inlined into `ExercisePickerSheet.tsx` — because every other
  nested sheet that component opens already lives in its own file, and that
  file is already ~375 lines; adding a fourth nested sheet inline would make
  it worse. Confirmed against the live `src/ui/Sheet.tsx` (props: `visible`,
  `onDismiss`, `children`, `detent?: 'half' | 'full'`, `style?`, `testID?`)
  and `src/ui/ListRow.tsx` (props: `title`, `subtitle?`, `leading?`,
  `trailing?`, `chevron?`, `hideSeparator?`, `onPress?`, `disabled?`,
  `style?`, `testID?` — `disabled` both dims the row and disables its
  `Pressable`, so a disabled row's `onPress` genuinely never fires).

  Write:

  ```tsx
  /**
   * `ExercisePickerOptionsSheet` — opened from the gear icon in
   * `ExercisePickerSheet`'s header (docs/agent_files/tasks/2026-07-28/
   * 04-exercise-picker-settings-icon/PRD.md). Two rows only: "Reset Filters"
   * (clears this picker's own equipment/muscle `Chip` selections — local
   * component state, not a global setting) and "More Settings" (deep-links to
   * the existing app-wide `/profile/settings` screen for anything that
   * actually affects workout behavior — RPE, rest timer, etc. — rather than
   * duplicating any of that here). See the PRD's §9.1/§9.2 for why the scope
   * stops at these two rows.
   */
  import React from 'react';

  import { ListRow } from '@/ui/ListRow';
  import { Sheet } from '@/ui/Sheet';

  export interface ExercisePickerOptionsSheetProps {
    visible: boolean;
    onDismiss: () => void;
    /** Disables "Reset Filters" when neither chip has a value — nothing to reset. */
    filtersActive: boolean;
    onResetFilters: () => void;
    onOpenAppSettings: () => void;
    testID?: string;
  }

  export function ExercisePickerOptionsSheet({
    visible,
    onDismiss,
    filtersActive,
    onResetFilters,
    onOpenAppSettings,
    testID,
  }: ExercisePickerOptionsSheetProps): React.JSX.Element {
    return (
      <Sheet visible={visible} onDismiss={onDismiss} detent="half" testID={testID}>
        <ListRow
          testID={testID ? `${testID}-reset-filters` : undefined}
          title="Reset Filters"
          subtitle="Clear equipment and muscle filters"
          disabled={!filtersActive}
          onPress={onResetFilters}
        />
        <ListRow
          testID={testID ? `${testID}-app-settings` : undefined}
          title="More Settings"
          subtitle="Rest timer, RPE, and other workout preferences"
          chevron
          hideSeparator
          onPress={onOpenAppSettings}
        />
      </Sheet>
    );
  }
  ```

  No header/title/Close button inside this sheet — same posture
  `FilterOptionSheet` almost has. Two rows is small enough that `Sheet`'s own
  grabber + backdrop-tap + drag-to-dismiss are sufficient "how do I close
  this" affordances; don't add a Close button that isn't in the design.
- **Acceptance criteria:**
  - File exists at `src/features/workout/ExercisePickerOptionsSheet.tsx` and
    exports `ExercisePickerOptionsSheet` and `ExercisePickerOptionsSheetProps`
    exactly as above.
  - Typechecks with no new TypeScript errors (`ListRow`/`Sheet` prop names
    match their real definitions).
  - Rendering with `visible={true}` shows two `ListRow`s: "Reset Filters"
    (subtitle "Clear equipment and muscle filters") and "More Settings"
    (subtitle "Rest timer, RPE, and other workout preferences", with a
    trailing chevron).
  - When `filtersActive={false}`, "Reset Filters" is visually dimmed
    (`disabled` prop true) and pressing it does not call `onResetFilters`.
  - When `filtersActive={true}`, pressing "Reset Filters" calls
    `onResetFilters` exactly once.
  - Pressing "More Settings" calls `onOpenAppSettings` exactly once.

---

### Task 2 — Add new imports to `ExercisePickerSheet.tsx`

- **Files:**
  - `src/features/workout/ExercisePickerSheet.tsx`
- **Changes:** This task only adds imports; later tasks add the code that
  uses them. Four things need adding:
  1. Add `Pressable` to the existing `react-native` import (currently line 22:
     `import { ActivityIndicator, Text, View } from 'react-native';`):
     ```tsx
     import { ActivityIndicator, Pressable, Text, View } from 'react-native';
     ```
  2. Add a new `expo-router` import (not currently present in this file) for
     the "More Settings" navigation:
     ```tsx
     import { router } from 'expo-router';
     ```
  3. Add a new `lucide-react-native` import (not currently present in this
     file) for the gear icon, aliased so it doesn't collide with any local
     `Settings`-named identifier:
     ```tsx
     import { Settings as SettingsIcon } from 'lucide-react-native';
     ```
  4. Add the new local-file import for the component built in Task 1,
     alongside the existing `import { ExerciseDetailSheet } from
     './ExerciseDetailSheet';` (currently line 54):
     ```tsx
     import { ExercisePickerOptionsSheet } from './ExercisePickerOptionsSheet';
     ```
- **Acceptance criteria:**
  - File still typechecks (no unused-import errors — all four new imports are
    consumed once Tasks 3–6 land; if this task is verified in isolation
    before those land, ESLint will flag them as temporarily unused, which is
    expected and resolved by the next tasks).
  - No existing import lines were removed or reordered beyond inserting
    `Pressable` into the existing `react-native` destructure.

---

### Task 3 — Add `optionsSheetVisible` state

- **Files:**
  - `src/features/workout/ExercisePickerSheet.tsx`
- **Changes:** Add one new `useState` alongside the existing picker state
  block (after the existing `const [detailExerciseId, setDetailExerciseId] =
  useState<string | null>(null);` line, before the `wasVisible` block):

  ```tsx
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  ```

  **Do not** add `optionsSheetVisible` to the `wasVisible` reset block (the
  `if (visible !== wasVisible) { ... }` block a few lines below that clears
  `searchInput`/`selectedIds`/etc. every time the picker sheet re-opens).
  Precedent: `equipmentSheetVisible` and `muscleSheetVisible` — the two other
  nested-sheet visibility flags this component already owns — aren't reset
  there either. `ExercisePickerSheet` itself never unmounts (only `Sheet`'s
  internal tree does), which is exactly why the `wasVisible` mechanism exists
  for state that *does* need resetting on reopen; nested-sheet visibility
  flags default to `false` and get explicitly closed by their own
  `onDismiss`, so they've never needed that treatment. Adding
  `optionsSheetVisible` there would be an unnecessary, inconsistent special
  case.
- **Acceptance criteria:**
  - `optionsSheetVisible` defaults to `false` on mount.
  - The `wasVisible`-driven reset block's body is unchanged (no new line
    added inside that `if` block for this state).

---

### Task 4 — Add `handleResetFilters` and `handleOpenAppSettings` handlers

- **Files:**
  - `src/features/workout/ExercisePickerSheet.tsx`
- **Changes:** Add two new handlers alongside the existing `handleConfirmAdd`
  function:

  ```tsx
  const handleResetFilters = useCallback(() => {
    setEquipmentFilter(null);
    setMuscleFilter(null);
    setOptionsSheetVisible(false);
  }, []);

  const handleOpenAppSettings = useCallback(() => {
    setOptionsSheetVisible(false);
    onDismiss();
    router.push('/profile/settings');
  }, [onDismiss]);
  ```

  Two design decisions to preserve exactly, not simplify away:
  - **Reset-filters scope is deliberately narrow**: only `equipmentFilter`
    and `muscleFilter` are cleared — **not** `searchInput`. Clearing an
    in-progress search the user is actively typing would be a bigger,
    more surprising action than "reset filters" implies, and search text
    has no existing active-state visual indicator the way the two filter
    `Chip`s do (`active` prop). Do not add `setSearchInput('')` here even
    though it might seem like a natural "reset everything" impulse.
  - **`handleOpenAppSettings` closes the picker sheet *before* navigating**
    (`onDismiss()` runs before `router.push(...)`), the reverse order of
    `handleConfirmAdd`'s `onAdd?.(...); onDismiss();`. This is intentional:
    `Sheet` is documented as component-level, not a route, and must not be
    left mounted while navigation happens underneath it — pushing a new
    route while the picker's full-detent sheet is still visible would leave
    a stale full-screen sheet on top of `/profile/settings`. Do not reorder
    these two calls.
- **Acceptance criteria:**
  - Calling `handleResetFilters()` with either filter set clears both
    `equipmentFilter` and `muscleFilter` to `null` and sets
    `optionsSheetVisible` to `false`. `searchInput` and `selectedIds` are
    untouched.
  - Calling `handleOpenAppSettings()` calls (in this order) `onDismiss`, then
    `router.push('/profile/settings')`, and also sets `optionsSheetVisible`
    to `false`.

---

### Task 5 — Edit the header row to add the gear icon

- **Files:**
  - `src/features/workout/ExercisePickerSheet.tsx`
- **Changes:** Replace the header `<View>` block (the `flexDirection: 'row'`
  block immediately inside the outer `<Sheet>` / `<View style={{ flex: 1
  }}>`, currently rendering the title `<Text>` and the `Cancel` `<Button>`
  side by side via `justifyContent: 'space-between'`) with a version that
  wraps the gear icon and the Cancel button together in one right-aligned
  group:

  **Before:**
  ```tsx
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing['4'],
            paddingBottom: spacing['2'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>
            {mode === 'replace' ? 'Replace Exercise' : 'Add Exercise'}
          </Text>
          <Button
            testID={`${testID}-cancel`}
            label="Cancel"
            variant="ghost"
            size="sm"
            onPress={onDismiss}
          />
        </View>
  ```

  **After:**
  ```tsx
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing['4'],
            paddingBottom: spacing['2'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>
            {mode === 'replace' ? 'Replace Exercise' : 'Add Exercise'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['3'] }}>
            <Pressable
              testID={`${testID}-options-button`}
              accessibilityRole="button"
              accessibilityLabel="List options"
              hitSlop={8}
              onPress={() => setOptionsSheetVisible(true)}
            >
              <SettingsIcon size={22} strokeWidth={1.75} color={colors.text.secondary} />
            </Pressable>
            <Button
              testID={`${testID}-cancel`}
              label="Cancel"
              variant="ghost"
              size="sm"
              onPress={onDismiss}
            />
          </View>
        </View>
  ```

  Design decisions to preserve — a junior dev should not "clean up" any of
  these:
  - **Gear icon goes to the LEFT of Cancel, both wrapped in one new
    right-side `View`.** The outer row's `justifyContent: 'space-between'`
    must keep seeing exactly two children (title, right-group) — same shape
    as today — not three. Do not put the gear icon as a third direct child
    of the outer row.
  - **Do not swap the order** (Cancel then gear icon). Cancel's tap target —
    the one-thumb, muscle-memory dismiss action every existing picker
    session already uses — must not move position within the row.
  - **`accessibilityLabel="List options"`, not `"Settings"`.** This is
    deliberate, not an oversight: this icon does not open the app Settings
    screen directly, it opens a small local sheet that *also* links to
    Settings. Labeling it "Settings" would over-promise what one tap does.
    (Contrast with `ProfileScreen.tsx`'s own gear button, which *is* labeled
    `"Settings"` because it navigates directly.)
  - **Icon size 22, `strokeWidth={1.75}`, `color={colors.text.secondary}`** —
    matches the styling of `ProfileScreen.tsx`'s existing gear-icon button
    (`src/features/profile/ProfileScreen.tsx`, the `settings-button`
    `Pressable` around line 249–256, which uses `size={24}` — this icon uses
    22, one size down, because here it sits next to a `size="sm"` `Button`
    rather than alone), reusing an established icon-button visual language
    rather than inventing a new one.
  - **No mode-gating.** This gear icon renders identically in both
    `mode="add"` and `mode="replace"` — do not wrap it in a `mode === 'add'`
    (or `'replace'`) conditional. Both the Equipment and Muscle filter chips
    render in both modes today (they sit above the `mode === 'add'`-gated
    Superset/counter block), so "Reset Filters" is meaningful in both; "More
    Settings" carries no mode-specific meaning either way. Gating the icon by
    mode would make the header's shape differ between the two call sites,
    which nothing else in this header (title, Cancel) does today.
- **Acceptance criteria:**
  - In both `mode="add"` and `mode="replace"`, a `Pressable` with `testID`
    `${testID}-options-button` and `accessibilityLabel="List options"`
    renders in the header, positioned between the title and the `Cancel`
    button (i.e., to Cancel's left).
  - Pressing it calls `setOptionsSheetVisible(true)` (verified once Task 6
    wires the sheet's actual render — this task alone just needs the
    `onPress` wired to that setter, which already exists from Task 3).
  - The outer header row still has exactly two direct children (title,
    right-side group `View`); `justifyContent: 'space-between'` behavior is
    visually unchanged from before this edit (title left, everything else
    right).
  - `Cancel`'s own `testID`, label, and `onPress={onDismiss}` are unchanged.

---

### Task 6 — Render `ExercisePickerOptionsSheet` from `ExercisePickerSheet.tsx`

- **Files:**
  - `src/features/workout/ExercisePickerSheet.tsx`
- **Changes:** Render the new sheet alongside the other nested sheets at the
  bottom of the JSX, after the existing `<ExerciseDetailSheet ... />` (the
  last element before the closing `</Sheet>`):

  ```tsx
        <ExercisePickerOptionsSheet
          testID={`${testID}-options-sheet`}
          visible={optionsSheetVisible}
          onDismiss={() => setOptionsSheetVisible(false)}
          filtersActive={equipmentFilter != null || muscleFilter != null}
          onResetFilters={handleResetFilters}
          onOpenAppSettings={handleOpenAppSettings}
        />
      ```

  This depends on Task 1 (the component), Task 2 (its import), Task 3
  (`optionsSheetVisible`), and Task 4 (`handleResetFilters` /
  `handleOpenAppSettings`) all already being in place — do this task last
  among the implementation tasks.
- **Acceptance criteria:**
  - `ExercisePickerOptionsSheet` renders inside `ExercisePickerSheet`'s tree
    (as a sibling of `FilterOptionSheet` × 2 and `ExerciseDetailSheet`, all
    inside the outer `<Sheet>`), with `testID={`${testID}-options-sheet`}`.
  - Tapping the gear icon (`${testID}-options-button`, from Task 5) makes
    `ExercisePickerOptionsSheet` visible (`optionsSheetVisible` true → its
    inner `Sheet` mounts).
  - `filtersActive` is `true` whenever either `equipmentFilter` or
    `muscleFilter` is non-null, `false` when both are `null` — verified via
    "Reset Filters" being enabled/disabled accordingly (Task 1's acceptance
    criteria).
  - Dismissing `ExercisePickerOptionsSheet` (backdrop tap, drag, or its own
    `onDismiss`) sets `optionsSheetVisible` back to `false` without affecting
    `ExercisePickerSheet`'s own `visible` prop or dismissing the picker
    itself.

---

### Task 7 — Add options-sheet test coverage for `mode="add"`

- **Files:**
  - `src/features/workout/__tests__/ExerciseCard.operations.test.tsx`
- **Changes:** This is the real host suite for deep `ExercisePickerSheet`
  interaction coverage today — it renders the actual `ActiveWorkoutScreen`
  (via its own `renderScreen(exerciseRepo)` helper, `testID="screen"`), opens
  the real picker via `screen-add-exercise`, and already exercises
  multi-select/superset flows against the real picker
  (`screen-exercise-picker-confirm`, `screen-exercise-picker-superset-toggle`
  — see the existing `describe('Exercise picker — Superset toggle on
  multi-add (02 §8 stub)', ...)` block for the exact pattern to copy). The
  file already has `jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'), router: { push: jest.fn(), back:
  jest.fn(), replace: jest.fn() } }));` at the top (line ~43–46) and imports
  `router` — reuse that existing mock, do not add a second one.

  With the picker's own `testID` prop wired as `${testID}-exercise-picker`
  from `ActiveWorkoutScreen.tsx` (and `testID="screen"` in this suite), the
  full IDs to use are:
  - Gear icon: `screen-exercise-picker-options-button`
  - Options sheet: `screen-exercise-picker-options-sheet`
  - Reset Filters row: `screen-exercise-picker-options-sheet-reset-filters`
  - More Settings row: `screen-exercise-picker-options-sheet-app-settings`
  - Equipment chip / sheet (to set a filter first): `screen-exercise-picker-equipment-chip`
    / `screen-exercise-picker-equipment-sheet` (option rows are
    `${prefix}-option-${value}`, same pattern `ExerciseBrowseScreen.test.tsx`'s
    own `selectFilterOption` helper already uses for the sibling browse
    screen — copy that helper's shape locally if this file doesn't already
    have one, or add a local equivalent).

  Add a new `describe` block, e.g. `describe('Exercise picker — options sheet
  (04 §4)', () => { ... })`, with cases covering PRD §7's cases 1 (add-mode
  half), 2, 3, 4, and 5:

  1. After opening the picker (`screen-add-exercise` → wait for
     `screen-exercise-picker-confirm` or similar to confirm it's open),
     assert `screen-exercise-picker-options-button` is present, press it, and
     assert `screen-exercise-picker-options-sheet` becomes visible (e.g. via
     `screen-exercise-picker-options-sheet-reset-filters` and
     `-app-settings` both being findable).
  2. With no filter set, assert the reset-filters row is present but pressing
     it does not change `equipmentChipLabel`/`muscleChipLabel` (still "All
     Equipment"/"All Muscles") — i.e. it's a no-op, matching `ListRow`'s
     `disabled` behavior. Then set the equipment filter via the equipment
     chip flow, reopen the options sheet, and confirm the row now visually
     differs (not dimmed) — or, more simply, confirm pressing it now *does*
     take effect (see case 3), which is the more direct/valuable assertion.
  3. With the equipment filter set to some value (e.g. `barbell`) via the
     chip flow, open the options sheet and press
     `screen-exercise-picker-options-sheet-reset-filters`. Assert: the
     equipment chip's label returns to "All Equipment", the options sheet
     closes (`queryByTestId('screen-exercise-picker-options-sheet-content')`
     or similar becomes null — the `Sheet` component only mounts its content
     while `visible`), the picker itself (`screen-exercise-picker-confirm`
     or the search bar) is still present/open, and any `selectedIds` /
     `searchInput` state the test set up beforehand (e.g. select an exercise
     first, then reset filters) is unaffected.
  4. Open the options sheet and press
     `screen-exercise-picker-options-sheet-app-settings`. Assert
     `router.push` was called with `'/profile/settings'`, and that it was
     called strictly after the picker closes — the simplest robust
     assertion is that the picker's own content
     (`screen-exercise-picker-confirm` or `screen-exercise-picker-search`) is
     no longer present (`queryByTestId` → `null`) by the time `router.push`
     is asserted, confirming the "close, then navigate" ordering from Task 4
     rather than just checking both happened in some order.
  5. Regression guard: with the options sheet open, tap its own
     scrim/backdrop (`screen-exercise-picker-options-sheet-scrim`, following
     `Sheet`'s own testID convention of `${testID}-scrim`) or drag-dismiss
     it, and assert the options sheet closes while the picker itself
     (`screen-exercise-picker-search` or `-confirm`) remains open. This is
     existing `Sheet` behavior, not new logic — the point of this case is to
     guard against a future regression, not to test something new.
- **Acceptance criteria:**
  - All five new test cases pass under the project's existing Jest config
    (`npm test` / whatever this repo's test-runner invocation is — same
    invocation the file's other tests already run under).
  - No new `jest.mock('expo-router', ...)` block was added — the existing
    one at the top of the file is reused.
  - Tests use `renderScreen`/`setup`/`rehydrateStores` exactly as the file's
    existing tests do — no new render harness introduced.

---

### Task 8 — Add a `mode="replace"` gear-icon assertion

- **Files:**
  - `src/features/workout/__tests__/ExerciseCard.operations.test.tsx`
- **Changes:** The existing `describe('ExerciseCard — Replace Exercise (02
  §3)', ...)` block already renders the real picker in `mode="replace"` (via
  the exercise-card's `⋯` menu → "Replace Exercise", which opens
  `ExercisePickerSheet` with `mode="replace"` — same `screen-exercise-picker`
  `testID` prefix as the add-mode flow, since both modes are the same
  component instance/testID root). Add one assertion to that existing test
  (`'keeps the row count and clears values, and PREVIOUS reflects the new
  exercise'`), inserted right after the picker opens (after the `waitFor`
  that confirms `exercise-row-${deadlift.id}` rows are present, before
  pressing one to complete the replace) confirming the gear icon is present
  in this mode too:

  ```tsx
  expect(screen.getByTestId('screen-exercise-picker-options-button')).toBeTruthy();
  ```

  This is intentionally a single added assertion inside the existing test
  rather than a whole new test — the PRD's §9.4 resolution is "no mode-gating
  needed," so the cheapest, most direct way to guard that is confirming the
  icon renders in the one existing test that already puts the picker into
  `mode="replace"`, rather than duplicating that entire (fairly heavy) setup
  in a new test just to re-render the same picker mode.
- **Acceptance criteria:**
  - The existing `'keeps the row count and clears values...'` test still
    passes end-to-end (its full replace-flow assertions unchanged).
  - The new assertion confirms `screen-exercise-picker-options-button` is
    present while the picker is open in `mode="replace"`, before the
    replacement exercise is selected.

---

## Summary of what requires you

- **§9.1 scope sign-off (recommended, not required to ship):** this PRD's own
  §8 flags that the two-row options-sheet scope (Reset Filters + More
  Settings) was a best-effort judgment call made without the original asker
  available to confirm intent — no prior Kyro spec section calls for an
  exercise-picker-specific settings surface, and the Hevy screenshots checked
  during PRD authoring didn't actually depict an "Add Exercise" screen to
  compare against. Once the person who originally asked "why is settings not
  implemented on the add exercise option?" is available, worth a quick
  confirm: does "Reset Filters + link to Settings" answer what they meant, or
  was there a more specific feature in mind (e.g. a persisted default filter,
  or a sort-order control)? Nothing blocks on this — the PRD explicitly
  designed this scope to be cheap to revise in either direction (delete one
  file + revert one header edit) if the answer is "no, something else."
- **§9.5 PRD A reconciliation (flagged, not blocking):** this task list
  implements the header change against `ExercisePickerSheet.tsx`'s current
  hand-rolled header markup, because PRD A (`sheet-header-footer-foundation`)
  does not exist on disk yet. If/when PRD A ships a shared header primitive
  other sheets are expected to adopt, someone should schedule a small
  follow-up to migrate this header onto that primitive, preserving the same
  visual outcome (title left, gear icon + Cancel grouped right). No action
  needed from you before this task list can be executed — just a heads-up for
  whoever owns PRD A once it lands.
