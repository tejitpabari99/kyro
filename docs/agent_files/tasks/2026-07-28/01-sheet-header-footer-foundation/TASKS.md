# Tasks: Sheet Header/Footer Foundation (PRD A)

## Open Questions

These are new ambiguities discovered while grounding tasks in the actual call-site
code (not covered by any of PRD §9's 9 already-RESOLVED items). Each lists the
assumption made to keep moving and why. None of these block execution.

1. **§6's "LP" legend literally says `contentContainerStyle.paddingBottom: insets.bottom
   + spacing['2']` — but 6 of the LP/verify-to-LP-tagged call sites (rows 11 `MoveToFolderSheet`,
   12 `RoutineActionsSheet`, 13 `RoutineExerciseMenuSheet`, 14 `RoutineSetRow`'s inline sheet,
   17 `ConnectedSetRow`'s two inline sheets, 21 `ExerciseCardMenuSheet`) render their `ListRow`/
   `Pressable` items directly as children of `Sheet` with no `ScrollView` at all — there is no
   `contentContainerStyle` to add the padding to.**
   Assumption: for these 6 no-`ScrollView` call sites, no code change is made at all — Task 1's
   `Sheet.tsx` baseline `paddingBottom: insets.bottom` (§4.1.3) already covers them, and §4.1.3's
   own text explicitly names `RoutineActionsSheet`/`ExerciseCardMenuSheet` as the exact case that
   baseline exists to cover ("sheets that are pure action-menus with no footer component at all").
   Their tasks (13, 14, 15, 16, 18, 22 below) are verification-only: confirm no title/footer
   button exists, confirm no `ScrollView` exists, and note that Task 1 alone already satisfies
   them. Rows that *do* have a real `ScrollView` today (5 `ExerciseTypeSheet`, 7
   `MultiSelectOptionSheet`) get the literal LP edit as written.

2. **Row 19 `DurationTimerSheet`'s table note says "2 Buttons (Start + Cancel/Reset) side by
   side — clean `ButtonRow` case" — but the actual file only ever renders one button at a time**
   (`Start` while idle, `Stop` while running; never both simultaneously — see
   `src/features/workout/DurationTimerSheet.tsx`'s render, lines ~109-119).
   Assumption: there is nothing to put in a `ButtonRow` here (a row needs ≥2 simultaneous
   children). Task 20 wraps the single conditionally-rendered `Button` in a plain `ScreenFooter`
   (no `ButtonRow`) — this still satisfies the SF column's intent (bottom-safe spacing for the
   sheet's one interactive control) without inventing a second button the PRD didn't otherwise
   ask for and the code doesn't have.

3. **Row 9 `ProfileScreen`'s edit-profile sheet has no Save-type control at all** — the name
   field commits via `TextInput`'s `onBlur`/`onSubmitEditing` (`handleSaveName`), and avatar
   emoji picks commit immediately on press. The PRD's own row note says "verify whether the edit
   sheet has a Save-type control at the bottom; if so wrap in `ScreenFooter`."
   Assumption: verified — there is none. Task 11 adopts `SheetHeader` for the title only; no
   `ScreenFooter` is added (SF is a no-op for this file).

## Parallelization

Dependency shape: Tasks 1–4 are the shared primitives (`Sheet.tsx`, `SheetHeader.tsx`,
`ScreenFooter.tsx`, `ButtonRow.tsx`+`Button.tsx`) that essentially every call-site task (5–28)
imports. All 24 call-site tasks were checked file-by-file (via `git ls-files`) and each touches a
distinct production file (plus its own co-located test file, also unique) — there is zero overlap
between any two call-site tasks, so once the primitives tier is done, tasks 5–28 are all mutually
independent and gate only on tier 0, not on each other. The team runs a hard cap of 2
tasks/agents in parallel at any time, so below is that dependency graph flattened into waves of
at most 2.

- **Wave 1: Tasks 1, 2** — `Sheet.tsx`/`Sheet.test.tsx` (Task 1) and the new
  `SheetHeader.tsx`/`SheetHeader.test.tsx` (Task 2) touch completely disjoint files with no shared
  imports between them; both are foundational primitives with no dependency on each other.
- **Wave 2: Tasks 3, 4** — the new `ScreenFooter.tsx`/`ScreenFooter.test.tsx` (Task 3) and the new
  `ButtonRow.tsx`/`ButtonRow.test.tsx` + `Button.tsx`'s `fullWidth` addition (Task 4) touch
  disjoint files from each other and from Wave 1. Sequenced after Wave 1 only to respect the
  2-per-wave cap, not because of any real dependency — all four primitive tasks (1–4) are
  mutually independent and together form the prerequisite tier that every call-site task (5–28)
  below needs fully landed first (each retrofit imports `SheetHeader`/`ScreenFooter` and often
  relies on Task 1's baseline `Sheet.tsx` inset behavior; Task 26 additionally imports
  `ButtonRow`).
- **Wave 3: Tasks 5, 6** — `app/dev/gallery.tsx` (Task 5) and
  `app/(tabs)/profile/settings/index.tsx` (Task 6) are disjoint files in unrelated route trees,
  no shared imports beyond the now-landed primitives.
- **Wave 4: Tasks 7, 8** — `src/features/calendar/CalendarScreen.tsx` (Task 7) and
  `src/features/exercises/ExerciseTypeSheet.tsx` (Task 8) are disjoint files in unrelated
  features.
- **Wave 5: Tasks 9, 10** — `src/features/exercises/MultiSelectOptionSheet.tsx` (Task 9) and
  `src/features/measurements/LogEntrySheet.tsx` (Task 10) are disjoint files in unrelated
  features.
- **Wave 6: Tasks 11, 12** — `src/features/profile/ProfileScreen.tsx` (Task 11) and
  `src/features/routines/FolderNameSheet.tsx` (Task 12) are disjoint files in unrelated features.
- **Wave 7: Tasks 13, 14** — `src/features/routines/MoveToFolderSheet.tsx` (Task 13,
  verify-only) and `src/features/routines/RoutineActionsSheet.tsx` (Task 14, verify-only) are
  disjoint files; both make zero code changes so there is no edit surface to conflict over
  regardless.
- **Wave 8: Tasks 15, 16** — `src/features/routines/RoutineExerciseMenuSheet.tsx` (Task 15,
  verify-only) and `src/features/routines/RoutineSetRow.tsx` (Task 16, verify-only) are disjoint
  files, both verify-only with no code changes.
- **Wave 9: Tasks 17, 18** — `src/features/workout/AddToSupersetSheet.tsx` (Task 17) and
  `src/features/workout/ConnectedSetRow.tsx` (Task 18, verify-only, covers 2 inline sheets in
  that one file) are disjoint files; Task 18 makes zero code changes.
- **Wave 10: Tasks 19, 20** — `src/features/workout/DurationEditSheet.tsx` (Task 19) and
  `src/features/workout/DurationTimerSheet.tsx` (Task 20) are disjoint files (similarly-named but
  unrelated components), no shared imports beyond the primitives.
- **Wave 11: Tasks 21, 22** — `src/features/workout/EditWorkoutMetaSheet.tsx` (Task 21) and
  `src/features/workout/ExerciseCardMenuSheet.tsx` (Task 22, verify-only) are disjoint files;
  Task 22 makes zero code changes.
- **Wave 12: Tasks 23, 24** — `src/features/workout/NoteEditSheet.tsx` (Task 23) and
  `src/features/workout/PlateCalculatorSheet.tsx` (Task 24) are disjoint files, no shared
  imports beyond the primitives.
- **Wave 13: Tasks 25, 26** — `src/features/workout/RestTimerSheet.tsx` (Task 25) and
  `src/features/workout/SaveWorkoutSheet.tsx` (Task 26, additionally imports `ButtonRow` from
  Wave 2) are disjoint files with no shared imports between them.
- **Wave 14: Tasks 27, 28** — `src/features/workout/TimerPill.tsx` (Task 27) and
  `src/features/workout/ReorderExercisesSheet.tsx` (Task 28) are disjoint files; Task 28's
  deliberate non-addition of a Cancel control (left to an unrelated external PRD, "PRD C") has no
  bearing on Task 27's file. This is the final wave — no tasks remain after it.

## Task 1 — `Sheet.tsx`: true full-height, edge-to-edge `full`, baseline bottom inset

- Files:
  - `/root/projects/kyro/src/ui/Sheet.tsx`
  - `/root/projects/kyro/src/ui/__tests__/Sheet.test.tsx`
- Changes (traces to §4.1, §4.1.1, §4.1.2, §4.1.3, §4.1.4):
  1. Import `useSafeAreaInsets` from `react-native-safe-area-context` (§4.1: precedent already
     set by `react-native-gesture-handler`/`react-native-reanimated` imports in this same file).
  2. Change `DETENT_HEIGHT_RATIO` from `{ half: 0.5, full: 0.9 }` to `{ half: 0.5, full: 1 }`.
     Update the file-header doc comment's "`full` = 90%" note to "100%, edge-to-edge."
  3. Inside `Sheet()`, add `const insets = useSafeAreaInsets();` and
     `const isFull = detent === 'full';`.
  4. On the `Animated.View` (`styles.sheet` + inline object), change:
     - `borderTopLeftRadius`/`borderTopRightRadius`: `isFull ? 0 : radii.lg` (was unconditionally
       `radii.lg`).
     - `paddingTop`: `isFull ? 0 : spacing['2']` (was unconditionally `spacing['2']`) — §4.1.2:
       `full` has no grabber to clear and never applies `insets.top` itself; `SheetHeader`'s own
       `safeTop` prop owns that clearance.
  5. Hide the grabber `View` entirely when `isFull` (wrap the existing grabber `<View accessible={false} style={[styles.grabber, ...]} />` in `{!isFull ? (...) : null}`) — §4.1.1.
  6. On `styles.content`'s consumer (`<View style={styles.content}>{children}</View>`), add a
     baseline bottom inset for **both** detents: change to
     `<View style={[styles.content, { paddingBottom: insets.bottom }]}>{children}</View>` — §4.1.3.
     Leave `styles.content`'s own `{ flex: 1 }` in `StyleSheet.create` untouched.
  7. `SheetProps` is unchanged — no new prop (§4.1.4).
- Acceptance criteria:
  - `detent="full"` renders at `Dimensions.get('window').height` (not `* 0.9`); `detent="half"`
    is unchanged at `* 0.5`.
  - `full` has `borderTopLeftRadius`/`borderTopRightRadius` of `0` and no grabber `View` in the
    tree; `half` still has `radii.lg` corners and a grabber.
  - Both detents' `styles.content` computed style includes `paddingBottom` equal to whatever
    `useSafeAreaInsets()` returns for `bottom` (0 under the default Jest mock, a supplied
    non-zero value when the test wraps the tree in `SafeAreaInsetsContext.Provider`).
  - All 6 existing tests in `Sheet.test.tsx`'s "open/dismiss behavior" describe block still pass
    unmodified (per PRD §7, they don't assert on height/padding/radius).
  - New tests added to `Sheet.test.tsx` (append a new `describe('Sheet — full-detent geometry & insets')` block):
    - `it.each(DETENTS)` height assertion: `full` equals the raw mocked window height (import
      `Dimensions` from `react-native`, compare against `Dimensions.get('window').height`); `half`
      equals half that.
    - Radius assertion: `full`'s flattened `sheet-content` style has `borderTopLeftRadius: 0` /
      `borderTopRightRadius: 0`; `half`'s has `radii.lg` (import `radii` from `../tokens`).
    - Grabber presence: assert a testID-less grabber can be probed via
      `UNSAFE_getAllByType`/style-array length, OR simpler — render with `testID="sheet"` and
      assert `screen.queryByTestId('sheet-content').children.length` differs by exactly one
      element between `half` (grabber + content wrapper = 2 children) and `full` (content
      wrapper only = 1 child). Pick whichever assertion style matches this file's existing
      idioms most closely on inspection; either is acceptable as long as it fails before the
      Task 1 code change and passes after.
    - Inset math: import `SafeAreaInsetsContext` from `react-native-safe-area-context` (resolves
      to `/root/projects/kyro/jest/safe-area-context-mock.tsx` via `jest.config.js`'s
      `moduleNameMapper`), wrap the tree in
      `<SafeAreaInsetsContext.Provider value={{ top: 44, bottom: 34, left: 0, right: 0 }}>`,
      render both detents, and assert the flattened `sheet-content` style's `paddingBottom`
      equals `34` (not `0`, proving the baseline actually reads live insets rather than a
      hardcoded value).

## Task 2 — `SheetHeader.tsx` (new primitive)

- Files:
  - `/root/projects/kyro/src/ui/SheetHeader.tsx` (new)
  - `/root/projects/kyro/src/ui/__tests__/SheetHeader.test.tsx` (new)
- Changes (traces to §4.2, §9 decision 8 for testID convention):
  - Create `SheetHeader.tsx` with this shape:
    ```tsx
    import React from 'react';
    import { Pressable, Text, View } from 'react-native';
    import { ChevronLeft } from 'lucide-react-native';
    import { useSafeAreaInsets } from 'react-native-safe-area-context';

    import { useTheme } from './theme-provider';

    export type SheetHeaderSlot =
      | { kind: 'back'; onPress: () => void; accessibilityLabel?: string; testID?: string }
      | {
          kind: 'label';
          label: string;
          onPress: () => void;
          tone?: 'default' | 'accent' | 'danger'; // default: 'accent'
          disabled?: boolean;
          testID?: string;
        }
      | { kind: 'custom'; content: React.ReactNode };

    export interface SheetHeaderProps {
      title: string;
      left?: SheetHeaderSlot;
      right?: SheetHeaderSlot;
      /** See PRD §4.2 doc comment: true only for a `detent="full"` Sheet or a
       * plain full-screen route with `headerShown:false`. Default false. */
      safeTop?: boolean;
      testID?: string;
    }
    ```
  - Render: `flexDirection:'row'`, `alignItems:'center'`, `minHeight: 44`,
    `paddingHorizontal: spacing['4']`, `paddingBottom: spacing['2']`,
    `paddingTop: safeTop ? insets.top + spacing['3'] : spacing['2']`.
  - Title `Text`: `typography.headline`, `color: colors.text.primary`, `numberOfLines={1}`,
    `flex: 1`, `textAlign: (left == null && right == null) ? 'center' : 'left'`,
    `marginLeft: left != null ? spacing['2'] : 0`, `marginRight: right != null ? spacing['2'] : 0`.
    `testID={testID ? \`${testID}-title\` : undefined}`.
  - `left`/`right` zones only render when the respective prop is given (no reserved minimum
    width). `kind:'back'` → `Pressable` (`hitSlop={8}`, `accessibilityRole="button"`,
    `accessibilityLabel={slot.accessibilityLabel ?? 'Back'}`) containing
    `<ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />`.
    `kind:'label'` → `Pressable` (`hitSlop={8}`, disabled-aware via `slot.disabled`) containing
    `<Text>` at `typography.body` + `fontWeight:'600'`, colored by `tone` (`default`→
    `colors.text.primary`, `accent`→`colors.accent.text`, `danger`→`colors.semantic.danger`;
    default tone is `'accent'` per the type comment). `kind:'custom'` renders `slot.content`
    verbatim, no wrapper.
  - testID convention (§9 decision 8): each slot's own `testID` prop wins if given; otherwise
    fall back to `` `${testID}-left` ``/`` `${testID}-right` `` off the `SheetHeader`'s own
    `testID`.
- Acceptance criteria (fold in the §7-mandated `SheetHeader.test.tsx` cases):
  - No `left`/`right`: title `textAlign: 'center'`.
  - Only `left` given: title `textAlign: 'left'` and `marginLeft` equal to `spacing['2']`.
  - Only `right` given: same for `marginRight`.
  - Both given: `textAlign: 'left'`, both margins set.
  - `kind:'back'` fires its `onPress` on press (`fireEvent.press` on the `-left`/`-right`
    testID).
  - `kind:'label'` renders the given `label` text and the tone-correct color (assert flattened
    `Text` style `color` against `colors.dark.accent.text`/`colors.dark.semantic.danger`/
    `colors.dark.text.primary` per tone, mirroring `Button.test.tsx`'s existing
    flatten-and-assert convention).
  - `safeTop={true}` adds `insets.top` to `paddingTop` (use the same
    `SafeAreaInsetsContext.Provider` override pattern as Task 1's Sheet test); `safeTop={false}`
    (default) does not include it.

## Task 3 — `ScreenFooter.tsx` (new primitive)

- Files:
  - `/root/projects/kyro/src/ui/ScreenFooter.tsx` (new)
  - `/root/projects/kyro/src/ui/__tests__/ScreenFooter.test.tsx` (new)
- Changes (traces to §4.3):
  ```tsx
  import React from 'react';
  import { View, type StyleProp, type ViewStyle } from 'react-native';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';

  import { useTheme } from './theme-provider';

  export interface ScreenFooterProps {
    children: React.ReactNode;
    /** Extra gap beyond the raw safe-area bottom inset. Defaults to spacing['4'] (16pt). */
    gap?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
  }

  export function ScreenFooter({ children, gap, style, testID }: ScreenFooterProps): React.JSX.Element {
    const { layout, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    return (
      <View
        testID={testID}
        style={[
          {
            paddingHorizontal: layout.screenGutter,
            paddingTop: spacing['3'],
            paddingBottom: insets.bottom + (gap ?? spacing['4']),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  ```
  - **Placement contract (§4.3), call out to every future consumer via a file-header doc
    comment**: `ScreenFooter` must be the last child inside the *same* scrollable container as
    the rest of a sheet/screen's content (or the last child of a plain, non-`flex:1` column
    `View` for fixed-height content) — never a sibling positioned after a separate `flex:1`
    `ScrollView`. Document the "sticky-by-accident" failure mode from §4.3 verbatim in the
    comment so retrofit tasks below can cite it.
- Acceptance criteria:
  - Default `paddingBottom` = `insets.bottom + spacing['4']` (assert with a non-zero
    `SafeAreaInsetsContext.Provider` override, e.g. `bottom: 34` → expect `50`).
  - Custom `gap` overrides the default (`gap: 8` + `bottom: 34` → expect `42`).
  - `children` render unchanged (smoke: render a `<Text>` child, assert it's found by text).
  - Computed style never contains `position: 'absolute'` (regression guard for "not sticky").

## Task 4 — `ButtonRow.tsx` (new primitive) + `Button.tsx` `fullWidth`

- Files:
  - `/root/projects/kyro/src/ui/Button.tsx`
  - `/root/projects/kyro/src/ui/ButtonRow.tsx` (new)
  - `/root/projects/kyro/src/ui/__tests__/Button.test.tsx`
  - `/root/projects/kyro/src/ui/__tests__/ButtonRow.test.tsx` (new)
- Changes (traces to §4.4(a) and §4.4(b), §9 decision 9 for arity):
  1. `Button.tsx`: add `fullWidth?: boolean;` to `ButtonProps` (with the doc comment from §4.4(a)
     verbatim: "Forces full-width... Not useful inside `ButtonRow`..."). Destructure it in
     `Button(...)`'s params (default not needed — `undefined` is falsy). Change the one line:
     ```ts
     alignSelf: (size === 'lg' || fullWidth) ? 'stretch' : 'flex-start',
     ```
     replacing the current `alignSelf: size === 'lg' ? 'stretch' : 'flex-start',` — no other line
     in `Button.tsx` changes.
  2. Create `ButtonRow.tsx`:
     ```tsx
     import React from 'react';
     import { View, type StyleProp, type ViewStyle } from 'react-native';

     import { useTheme } from './theme-provider';

     export interface ButtonRowProps {
       /** One or more `<Button>` elements, rendered left-to-right with equal width. */
       children: React.ReactNode;
       /** Gap between buttons. Defaults to spacing['3'] (12pt). */
       gap?: number;
       style?: StyleProp<ViewStyle>;
       testID?: string;
     }

     export function ButtonRow({ children, gap, style, testID }: ButtonRowProps): React.JSX.Element {
       const { spacing } = useTheme();
       return (
         <View testID={testID} style={[{ flexDirection: 'row', gap: gap ?? spacing['3'] }, style]}>
           {React.Children.map(children, (child) =>
             React.isValidElement(child)
               ? React.cloneElement(child as React.ReactElement<{ style?: StyleProp<ViewStyle> }>, {
                   style: [(child.props as { style?: StyleProp<ViewStyle> }).style, { flex: 1 }],
                 })
               : child,
           )}
         </View>
       );
     }
     ```
     (§9 decision 9: arity-agnostic by construction — no special-casing needed for N > 2.)
- Acceptance criteria:
  - `Button.test.tsx`: add a case asserting `fullWidth` on `size="sm"`/`"md"` produces
    `alignSelf: 'stretch'` (flatten style, same convention the file's other style assertions
    already use), and that `fullWidth` is a no-op for `size="lg"` (still `'stretch'`).
  - `ButtonRow.test.tsx` (new): (a) render 2-3 `Button` children, assert each's flattened style
    includes `flex: 1`; (b) custom `gap` prop passes through to the row container's flattened
    style; (c) a non-`Button` child (e.g. a bare `<Text>`) passes through unmodified rather than
    throwing.

## Task 5 — Row 1: `app/dev/gallery.tsx`

- Files: `/root/projects/kyro/app/dev/gallery.tsx`
- Changes (§6 row 1, §4.2/§4.3):
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Inside the `"Sheet"` `Section`'s `<Sheet testID="gallery-sheet" ... detent="half">`, replace
    the manual content with:
    ```tsx
    <SheetHeader testID="gallery-sheet-header" title="Sheet Demo" safeTop={false} />
    <View style={{ padding: spacing['4'] }}>
      <Text style={{ color: colors.text.primary }}>
        Sheet content — drag down or tap the scrim to dismiss.
      </Text>
    </View>
    <ScreenFooter testID="gallery-sheet-footer">
      <Button label="Close" onPress={() => setSheetVisible(false)} />
    </ScreenFooter>
    ```
    (moves the existing "Close" `Button` out of the inline `View` and into `ScreenFooter`, as the
    Sheet's last child — dev-only harness, no `ScrollView` present so no restructure needed).
- Acceptance criteria: gallery screen still renders; opening the demo sheet shows a centered
  "Sheet Demo" title and a bottom-safe "Close" button. No existing test targets this file
  (dev-only, unreachable outside `__DEV__`); no test changes required.

## Task 6 — Row 2: `app/(tabs)/profile/settings/index.tsx` (2 sheets)

- Files: `/root/projects/kyro/app/(tabs)/profile/settings/index.tsx`
- Changes (§6 row 2, §4.2): both sheets are `detent="half"` (default), title inline-left today,
  no header button, no footer button (`WheelPicker` commits via `onChange`) — SH only, no SF.
  - Import `SheetHeader` from `@/ui/SheetHeader`.
  - `settings-default-rest-timer-sheet`: replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'], alignSelf: 'flex-start' }]}>
      Default Rest Timer
    </Text>
    ```
    with `<SheetHeader testID="settings-default-rest-timer-sheet-header" title="Default Rest Timer" safeTop={false} />`, keeping the `WheelPicker` in its own `View` below (drop the `alignItems:'center'` from the outer wrapper's title-only concern if it was only there for the old left-aligned title — the `WheelPicker` itself can stay centered via its own container).
  - `settings-weekly-goal-sheet`: identical swap — `<SheetHeader testID="settings-weekly-goal-sheet-header" title="Weekly Workout Goal" safeTop={false} />`.
- Acceptance criteria: both settings sheets show a **centered** title (previously left-aligned)
  with no header buttons; `WheelPicker`s render unchanged below. No existing automated test
  covers these two sheet bodies directly (verify via `grep` for `settings-default-rest-timer` /
  `settings-weekly-goal` in `__tests__` before/after — if a test does exist and queries the old
  `Text`'s implicit role, update its query to text-based (`getByText('Default Rest Timer')`)
  which still works since `SheetHeader`'s title is still a `Text` node with the same string).

## Task 7 — Row 3: `src/features/calendar/CalendarScreen.tsx`

- Files:
  - `/root/projects/kyro/src/features/calendar/CalendarScreen.tsx`
  - `/root/projects/kyro/src/features/calendar/__tests__/CalendarScreen.test.tsx` (if it exists — check via `ls`/`grep` for a `-day-sheet` or `-log-past-workout` testID reference and update only if it queries the old inline title `Text` by role/structure rather than by text content)
- Changes (§6 row 3, §4.2/§4.3): `detent="half"` day-sheet. Title is the dynamic
  `{selectedDate ?? ''}` — no header button today. The "Log past workout" `Button` only renders
  in the `isDayEmpty` branch; the day-workouts `ListRow` list has no footer button. There is no
  `ScrollView` in this sheet body today (plain `View`), so no §4.3 restructure is needed.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
      {selectedDate ?? ''}
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-day-sheet-header`} title={selectedDate ?? ''} safeTop={false} />`.
  - In the `isDayEmpty` branch only, wrap the existing "Log past workout" `Button` in
    `<ScreenFooter testID={`${testID}-day-sheet-footer`}>...</ScreenFooter>` (replacing its
    manual placement after the "No workouts on this day." `Text`). The non-empty (workout list)
    branch is unchanged — it has no footer button to wrap.
- Acceptance criteria: day-sheet title is centered via `SheetHeader`; "Log past workout" sits
  inside a bottom-safe `ScreenFooter` only on empty days; the workout-list branch is visually
  unchanged. If `CalendarScreen.test.tsx` exists and asserts on `getByText(selectedDate)` or
  `-log-past-workout`, those continue to pass unmodified (text/testID preserved).

## Task 8 — Row 5: `src/features/exercises/ExerciseTypeSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/exercises/ExerciseTypeSheet.tsx`
  - `/root/projects/kyro/src/features/exercises/__tests__/ExerciseTypeSheet.test.tsx`
- Changes (§6 row 5, §4.2, §4.5 corollary — this is one of the 6 named full-detent sites with no
  dismiss control today):
  - Import `SheetHeader` from `@/ui/SheetHeader`; import `useSafeAreaInsets` from
    `react-native-safe-area-context`.
  - Replace
    ```tsx
    <View style={{ paddingHorizontal: spacing['4'], paddingBottom: spacing['2'] }}>
      <Text style={[typography.headline, { color: colors.text.primary }]}>Exercise Type</Text>
    </View>
    ```
    with
    ```tsx
    <SheetHeader
      testID={testID ? `${testID}-header` : undefined}
      title="Exercise Type"
      left={{ kind: 'label', label: 'Cancel', onPress: onDismiss }}
      safeTop
    />
    ```
    (`detent="full"` → `safeTop={true}`; list-picker precedent per §6 row 5's note.)
  - LP: add `insets = useSafeAreaInsets()` and set the `ScrollView`'s
    `contentContainerStyle={{ paddingBottom: insets.bottom + spacing['2'] }}` (this `ScrollView`
    exists today with no bottom padding at all).
- Acceptance criteria: sheet now shows a centered "Exercise Type" title with a "Cancel" control
  top-left that calls `onDismiss`; the option list's scroll tail clears the home indicator.
  `ExerciseTypeSheet.test.tsx`'s 3 existing tests keep passing unmodified — none of them query
  the old inline title `Text`'s structure, only `screen.getByTestId('type-sheet-option-...')`
  and the description text. Optionally add one new test: pressing the new Cancel control
  (`getByTestId('type-sheet-header-left')`) calls `onDismiss`.

## Task 9 — Row 7: `src/features/exercises/MultiSelectOptionSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/exercises/MultiSelectOptionSheet.tsx`
  - `/root/projects/kyro/src/features/exercises/__tests__/MultiSelectOptionSheet.test.tsx`
- Changes (§6 row 7, §4.2): already has a title + "Done" (ghost/sm `Button`) top-right —
  `+Dismiss` is already satisfied, just needs to move onto `SheetHeader`.
  - Import `SheetHeader` from `@/ui/SheetHeader`; import `useSafeAreaInsets`.
  - Replace the manual header row:
    ```tsx
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing['4'], paddingBottom: spacing['2'] }}>
      <Text style={[typography.headline, { color: colors.text.primary }]}>{title}</Text>
      <Button label="Done" variant="ghost" size="sm" testID={testID ? `${testID}-done` : undefined} onPress={commit} />
    </View>
    ```
    with
    ```tsx
    <SheetHeader
      testID={testID ? `${testID}-header` : undefined}
      title={title}
      right={{ kind: 'label', label: 'Done', tone: 'accent', onPress: commit, testID: testID ? `${testID}-done` : undefined }}
      safeTop
    />
    ```
    (pass an explicit `testID` on the slot so the existing `sheet-done` testID used by the test
    suite is preserved exactly, rather than falling back to the `-right` suffix.)
  - LP: add `insets = useSafeAreaInsets()`, set the `ScrollView`'s
    `contentContainerStyle={{ paddingBottom: insets.bottom + spacing['2'] }}`.
  - The now-unused `Button` import can stay if used elsewhere in the file, otherwise remove it.
- Acceptance criteria: title is now centered-with-right-slot (left-aligned per §4.2's rule since
  a `right` slot is present); "Done" still exists at `testID="sheet-done"` and still commits +
  dismisses. All 3 existing tests in `MultiSelectOptionSheet.test.tsx` pass unmodified (they use
  `sheet-done`, `sheet-option-*`, `sheet-content` — all preserved).

## Task 10 — Row 8: `src/features/measurements/LogEntrySheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/measurements/LogEntrySheet.tsx`
  - `/root/projects/kyro/src/features/measurements/__tests__/LogEntrySheet.test.tsx`
- Changes (§6 row 8, §4.2, §4.3, §4.5 corollary): title is `typography.title2` inline in the
  scroll — steps down to `headline` via `SheetHeader`. Form already has its own multi-button
  footer (Retry-on-error near the top, Camera/Library, Save) — per the PRD row note, don't crowd
  the header with a second Cancel-as-label; use `left:{kind:'back'}` instead. The `ScrollView`
  here already uses `contentContainerStyle` (not a `flex:1` sibling pattern) with the `Save`
  `Button` as its true last child — **this already matches §4.3's "Right" pattern**, no
  restructure needed. Note: the "Retry" `Button` inside the load-error banner sits near the
  *top* of the scroll content (inside the `entryQuery.isError` block), not at the bottom — it is
  unrelated to `ScreenFooter` and must not be moved.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
      Log Measurements
    </Text>
    ```
    (this sits *inside* the `ScrollView`, above `contentContainerStyle`'s horizontal padding —
    move it *outside* the `ScrollView`, as a sibling above it, since `SheetHeader` owns its own
    horizontal padding and top safe-area clearance) with, immediately after `<Sheet testID={testID} visible={visible} onDismiss={onDismiss} detent="full">`:
    ```tsx
    <SheetHeader
      testID={`${testID}-header`}
      title="Log Measurements"
      left={{ kind: 'back', onPress: onDismiss }}
      safeTop
    />
    ```
  - Wrap the final `Save` `Button` (the last element inside the `ScrollView`) in
    `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>` (replacing its manual
    positioning (it's already the last child, so this is a pure wrap, no reordering).
- Acceptance criteria: sheet shows a centered "Log Measurements" title (now `headline`-sized) with
  a back-chevron dismiss control top-left; the Save button sits inside a bottom-safe
  `ScreenFooter` still as the scroll's last element. `LogEntrySheet.test.tsx`'s
  `await screen.findByText('Log Measurements')` assertions keep passing (text unchanged, now
  rendered by `SheetHeader` instead of the old inline `Text` — still a `Text` node with that
  exact string). All `sheet-save`/`sheet-field-*`/`sheet-photo-*` testIDs are untouched.

## Task 11 — Row 9: `src/features/profile/ProfileScreen.tsx`

- Files: `/root/projects/kyro/src/features/profile/ProfileScreen.tsx`
- Changes (§6 row 9, §4.2): `detent="half"` (default) edit-profile sheet. **Verified**: no
  Save-type control exists — `handleSaveName` fires on the name `TextInput`'s `onBlur`/
  `onSubmitEditing`, and avatar-emoji picks commit immediately on press (see Open Questions #3
  at the top of this file). SH only, no SF.
  - Import `SheetHeader` from `@/ui/SheetHeader`.
  - Replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
      Edit Profile
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-edit-profile-sheet-header`} title="Edit Profile" safeTop={false} />`.
- Acceptance criteria: edit-profile sheet shows a centered "Edit Profile" title; name field and
  avatar picker behavior are completely unchanged (no footer added). No existing test targets
  this sheet's title structurally (verify via `grep` in `ProfileScreen.test.tsx` if it exists).

## Task 12 — Row 10: `src/features/routines/FolderNameSheet.tsx`

- Files: `/root/projects/kyro/src/features/routines/FolderNameSheet.tsx`
- Changes (§6 row 10, §4.2, §4.3): `detent="half"` (default). Title is the `title` prop
  (inline-left) + a "Save" `Button` already the last child of a plain `flex:1` `View` (no
  `ScrollView` — the Button already sits directly after the `TextInput`, not pinned to the
  bottom by a sibling-after-flex1-scrollview pattern, so **no §4.3 restructure is needed**).
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
      {title}
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-header`} title={title} safeTop={false} />` (placed as
    the first child, before the wrapping `View`'s remaining content — move it outside the
    `paddingHorizontal`-only `View` since `SheetHeader` owns its own horizontal padding).
  - Wrap the existing `Save` `Button` in `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>`, dropping its manual `style={{ marginTop: spacing['4'] }}`.
- Acceptance criteria: sheet shows a centered title (works for both "New Folder" and "Rename
  Folder" callers, since `title` is still just a prop) and a bottom-safe Save button. No existing
  test file was found for this component at time of writing (`grep` for `FolderNameSheet.test`
  before starting — if one exists, ensure `${testID}-save`/`${testID}-input` testIDs, which are
  untouched, keep any existing assertions passing).

## Task 13 — Row 11: `src/features/routines/MoveToFolderSheet.tsx` (verify-only, see Open Questions #1)

- Files: `/root/projects/kyro/src/features/routines/MoveToFolderSheet.tsx`
- Changes: **none.** Verified: no title `Text` anywhere in this file (plain folder-list picker,
  `ListRow`s rendered directly as `Sheet` children) and no `ScrollView` to attach LP padding to.
  Per Open Questions #1, Task 1's `Sheet.tsx` baseline `insets.bottom` padding already gives this
  sheet's last row bottom-safe clearance — no `SheetHeader` (nothing to center) and no explicit
  LP edit is needed.
- Acceptance criteria: confirm (by re-reading the file) that it still has no title `Text` and no
  `ScrollView` before closing this task — if either has changed since this task list was
  written, re-flag via a new Open Question rather than silently adding scope.

## Task 14 — Row 12: `src/features/routines/RoutineActionsSheet.tsx` (verify-only, see Open Questions #1)

- Files: `/root/projects/kyro/src/features/routines/RoutineActionsSheet.tsx`
- Changes: **none.** Plain `Pressable`+`Text` action menu (also reused by
  `HistoryDetailScreen.tsx`'s ⋯ menu, per this file's own header — do not touch that reuse), no
  title, no footer button, no `ScrollView`. Explicitly named in PRD §4.1.3 as a call site the
  `Sheet.tsx` baseline `insets.bottom` fix alone already protects.
- Acceptance criteria: same re-verification note as Task 13.

## Task 15 — Row 13: `src/features/routines/RoutineExerciseMenuSheet.tsx` (verify-only, see Open Questions #1)

- Files: `/root/projects/kyro/src/features/routines/RoutineExerciseMenuSheet.tsx`
- Changes: **none.** Same shape as Task 14 (plain `ListRow` menu, no title/footer/`ScrollView`).
- Acceptance criteria: same re-verification note as Task 13.

## Task 16 — Row 14: `src/features/routines/RoutineSetRow.tsx` (inline set-type sheet, verify-only, see Open Questions #1)

- Files: `/root/projects/kyro/src/features/routines/RoutineSetRow.tsx`
- Changes: **none.** The inline `<Sheet visible={menuVisible} ...>` at the bottom of this file
  (set-type menu + "Remove Set") has no title and no footer button, `ListRow`s rendered directly,
  no `ScrollView`.
- Acceptance criteria: same re-verification note as Task 13.

## Task 17 — Row 15: `src/features/workout/AddToSupersetSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/AddToSupersetSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/AddToSupersetSheet.test.tsx`
- Changes (§6 row 15, §4.2, §4.3): `detent="half"` (default). This is the canonical
  `ScrollView(flex:1) + sibling Button` anti-pattern §4.3 warns about — **restructure required**.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Current body:
    ```tsx
    <View style={{ paddingHorizontal: spacing['4'], flex: 1 }}>
      <Text style={[typography.headline, ...]}>Add to Superset</Text>
      <ScrollView style={{ flex: 1 }}>
        {candidates.length === 0 ? (...) : candidates.map(...)}
      </ScrollView>
      <Button testID={`${testID}-confirm`} label={...} ... style={{ marginTop: spacing['4'] }} />
    </View>
    ```
  - New body:
    ```tsx
    <View style={{ flex: 1 }}>
      <SheetHeader testID={`${testID}-header`} title="Add to Superset" safeTop={false} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing['4'] }}>
        {candidates.length === 0 ? (
          <Text style={[typography.subhead, { color: colors.text.secondary }]}>
            No other exercises in this workout yet.
          </Text>
        ) : (
          candidates.map((candidate, index) => (
            <ListRow key={candidate.id} testID={`${testID}-option-${candidate.id}`} ... />
          ))
        )}
        <ScreenFooter testID={`${testID}-footer`}>
          <Button
            testID={`${testID}-confirm`}
            label={selected.length > 0 ? `Group ${selected.length + 1} Exercises` : 'Group Exercises'}
            variant="primary"
            disabled={selected.length === 0}
            onPress={handleConfirm}
          />
        </ScreenFooter>
      </ScrollView>
    </View>
    ```
    (drop the `flex:1` from the `ScrollView`'s own `style` — it moves to the outer `View` only —
    and keep the existing `hideSeparator={index === candidates.length - 1}` prop on the last
    `ListRow`, unchanged.)
- Acceptance criteria: title is centered via `SheetHeader`; short candidate lists render with the
  Confirm button directly below the last row (not pinned to the physical bottom with a dead
  gap); long lists scroll with the Confirm button appearing after the last item. All 6 existing
  tests in `AddToSupersetSheet.test.tsx` pass unmodified (`sheet-confirm`, `sheet-option-*`,
  `sheet-content` (via `add-to-superset-sheet` default testID) are untouched).

## Task 18 — Row 17: `src/features/workout/ConnectedSetRow.tsx` (2 inline sheets, verify-only, see Open Questions #1)

- Files: `/root/projects/kyro/src/features/workout/ConnectedSetRow.tsx`
- Changes: **none.** Verified both inline sheets independently:
  - The set-type menu `<Sheet visible={menuVisible} ...>` — plain `ListRow` items + a "Remove
    Set" row, no title, no `ScrollView`.
  - The RPE picker `<Sheet visible={rpeSheetVisible} ...>` — plain `ListRow` items (RPE values +
    "Clear"), no title, no `ScrollView`.
  Per Open Questions #1, `Sheet.tsx`'s Task 1 baseline already covers both.
- Acceptance criteria: same re-verification note as Task 13, applied to both sheets in this file.

## Task 19 — Row 18: `src/features/workout/DurationEditSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/DurationEditSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/DurationEditSheet.test.tsx`
- Changes (§6 row 18, §4.2, §4.3): `detent="half"` (default). **Verified title presence**: yes —
  `typography.title2` "Edit Duration" inline, steps down to `headline` via `SheetHeader`. 3
  `Button`s total (`Update Start Time` sm, `Update Duration` sm, and the terminal
  `Pause Workout`/`Resume Workout` toggle). No `ScrollView` in this file (plain `View`) — the
  terminal Pause/Resume button is already the last child directly, **no restructure needed**;
  only the terminal button (not the two inline `sm` "Update" buttons, which are mid-form actions,
  not the sheet's dismiss/confirm control) is wrapped in `ScreenFooter`.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
      Edit Duration
    </Text>
    ```
    (currently the first child inside `<View style={{ paddingHorizontal: spacing['4'] }}>`) with
    `<SheetHeader testID={`${testID}-header`} title="Edit Duration" safeTop={false} />`, moved to
    be a sibling *before* that `View` (drop the title out of the horizontally-padded wrapper,
    same reasoning as Task 10/12).
  - Wrap the terminal `Button` (`testID={`${testID}-pause-resume`}`) in
    `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>`.
- Acceptance criteria: title is centered and `headline`-sized; the Pause/Resume button sits
  inside a bottom-safe `ScreenFooter`. All existing `DurationEditSheet.test.tsx` tests pass
  unmodified — none query the title's structure, and `duration-sheet-pause-resume` /
  `duration-sheet-save-start-time` / `duration-sheet-save-duration` testIDs are untouched.

## Task 20 — Row 19: `src/features/workout/DurationTimerSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/DurationTimerSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/DurationTimerSheet.test.tsx`
- Changes (§6 row 19, §4.2, §4.3 — **see Open Questions #2**: the table's "2 Buttons side by
  side, `ButtonRow`" description doesn't match the actual code, which renders exactly one
  button at a time): `detent="half"` (default). **Verified title presence**: yes — `title2`
  "Inline Timer". No `ScrollView`, plain `View`, single conditionally-rendered `Button` already
  the last child — no restructure needed, no `ButtonRow` (nothing to pair it with).
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
      Inline Timer
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-header`} title="Inline Timer" safeTop={false} />`,
    moved outside the `alignItems:'center'` wrapping `View` (same "title moves out, rest of
    content stays" pattern as Task 19).
  - Wrap the conditional `Start`/`Stop` `Button` in `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>` (both branches of the `startedAt === null ? (...) : (...)` ternary get wrapped — i.e. wrap the ternary itself, not each branch separately).
- Acceptance criteria: title is centered; whichever of Start/Stop is showing sits inside a
  bottom-safe `ScreenFooter`. All existing `DurationTimerSheet.test.tsx` tests pass unmodified
  (`sheet-start`/`sheet-stop`/`sheet-elapsed` testIDs untouched).

## Task 21 — Row 20: `src/features/workout/EditWorkoutMetaSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/EditWorkoutMetaSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/EditWorkoutMetaSheet.test.tsx`
- Changes (§6 row 20, §4.2, §4.3): `detent="half"` (default). **Verified title presence**: yes —
  `title2` "Edit Date & Duration". Single terminal `Button` ("Save"), no `ScrollView`, no
  restructure needed.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
      Edit Date & Duration
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-header`} title="Edit Date & Duration" safeTop={false} />`, moved outside the wrapping `View` (same pattern as Task 19/20).
  - Wrap the `Save` `Button` (`testID={`${testID}-save`}`) in `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>`.
- Acceptance criteria: title centered; Save sits inside a bottom-safe `ScreenFooter`. All existing
  `EditWorkoutMetaSheet.test.tsx` tests pass unmodified (`meta-sheet-save`/`meta-sheet-year`/etc.
  testIDs untouched).

## Task 22 — Row 21: `src/features/workout/ExerciseCardMenuSheet.tsx` (verify-only, see Open Questions #1)

- Files:
  - `/root/projects/kyro/src/features/workout/ExerciseCardMenuSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/ExerciseCardMenuSheet.test.tsx`
- Changes: **none.** Menu-style `ListRow` list, no title, no footer button, no `ScrollView` —
  explicitly named in PRD §4.1.3 alongside `RoutineActionsSheet` as a call site the `Sheet.tsx`
  baseline fix alone already protects.
- Acceptance criteria: re-verify (per Open Questions #1) no title/`ScrollView` was added since
  this task list was written; all 5 existing `ExerciseCardMenuSheet.test.tsx` tests continue to
  pass with zero changes to this file.

## Task 23 — Row 23: `src/features/workout/NoteEditSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/NoteEditSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/NoteEditSheet.test.tsx`
- Changes (§6 row 23, §4.2, §4.3 — **coordinate with PRD F** per the PRD's own row note: this is
  mechanical wiring only, PRD F will further redesign this screen's content later; do not add a
  header dismiss control beyond what's specified below, since `half` retains a functioning
  scrim): `detent="half"` (default). Title inline-left + Save `Button` already the last child of
  a plain `flex:1` `View` (no `ScrollView`) — same shape as Task 12 (`FolderNameSheet`), no
  restructure needed.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
      Note
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-header`} title="Note" safeTop={false} />`, moved
    outside the `flex:1` wrapping `View` (title no longer needs the wrapper's horizontal
    padding).
  - Wrap the `Save` `Button` (`testID={`${testID}-save`}`) in `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>`, dropping its manual `style={{ marginTop: spacing['4'] }}`.
- Acceptance criteria: title centered; Save sits inside a bottom-safe `ScreenFooter`; no new
  dismiss control added to the header (per the PRD's explicit "acceptable" note for this row).
  All 4 existing `NoteEditSheet.test.tsx` tests pass unmodified (`sheet-input`/`sheet-save`
  testIDs untouched).

## Task 24 — Row 24: `src/features/workout/PlateCalculatorSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/PlateCalculatorSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/PlateCalculatorSheet.test.tsx`
- Changes (§6 row 24, §4.2, §4.5 corollary): `detent="full"`. Title already `headline`
  "Plate Calculator" inline (not currently via any shared primitive) — move onto `SheetHeader`
  with a `Done` right slot (stateless calculator, nothing to "cancel"). **Verified terminal
  control**: yes, but it's one of three mutually-exclusive shapes — a single "Use this value"
  `Button` when `result.exact`, or a "Lower"/"Upper" `Button` pair when not — all three already
  render as the final children inside the existing `ScrollView`'s `contentContainerStyle` (no
  `flex:1` sibling pattern here — **no restructure needed**, this file already matches §4.3's
  "Right" shape).
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
      Plate Calculator
    </Text>
    ```
    (inside the `ScrollView`) — move it to be a sibling *before* the `ScrollView`, replaced with:
    ```tsx
    <SheetHeader
      testID={`${testID}-header`}
      title="Plate Calculator"
      right={{ kind: 'label', label: 'Done', tone: 'accent', onPress: onDismiss }}
      safeTop
    />
    ```
  - Wrap the entire terminal ternary block (`{result.exact ? (<Button .../>) : (<>...lower/upper...</>)}`) in `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>`, dropping the
    individual `style={{ marginTop: spacing['4'] }}`/`marginTop: spacing['2']` on the wrapped
    buttons/rows (ScreenFooter's own `paddingTop: spacing['3']` replaces them). Leave the
    `PlateDiagram` and achieved-total `Text` above this block untouched.
- Acceptance criteria: title centered with a "Done" control top-right that dismisses; whichever
  terminal button configuration is showing sits inside a bottom-safe `ScreenFooter`. All 8
  existing `PlateCalculatorSheet.test.tsx` tests pass unmodified (`plate-calculator-sheet-*`
  testIDs — `target-input`, `bar-0`/`bar-1`, `achieved`, `use-value`, `use-lower`, `use-upper`,
  `diagram-plate-a-0` — all untouched).

## Task 25 — Row 25: `src/features/workout/RestTimerSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/RestTimerSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/RestTimerSheet.test.tsx`
- Changes (§6 row 25, §4.2, §4.3 — **coordinate with PRD F**, same reasoning as Task 23):
  `detent="half"` (default). Title exists (`headline` "Rest Timer", currently
  `alignSelf:'flex-start'`). Existing `Button` (`onPress={onDismiss}`, labeled "Done") already
  functions as a dismiss/skip action — wrap it in `ScreenFooter`. No `ScrollView`, no
  restructure needed.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Replace
    ```tsx
    <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'], alignSelf: 'flex-start' }]}>
      Rest Timer
    </Text>
    ```
    with `<SheetHeader testID={`${testID}-header`} title="Rest Timer" safeTop={false} />`, moved
    outside the `alignItems:'center'` wrapping `View`.
  - Wrap the `Done` `Button` (`testID={`${testID}-done`}`) in `<ScreenFooter testID={`${testID}-footer`}>...</ScreenFooter>`, dropping its manual `style={{ marginTop: spacing['4'], alignSelf: 'stretch' }}` (`ScreenFooter`'s children aren't auto-stretched — if a full-width Done button is still wanted, keep `style={{ alignSelf: 'stretch' }}` directly on the `Button`, dropping only the `marginTop`).
- Acceptance criteria: title centered; the WheelPicker is unchanged; Done sits inside a
  bottom-safe `ScreenFooter` and still visually full-width. All 6 existing
  `RestTimerSheet.test.tsx` tests pass unmodified (`sheet-wheel-option-*`/`sheet-done` testIDs
  untouched — note the first test asserts `screen.queryByText('Rest Timer')` is null when
  `visible={false}`, which still holds since `SheetHeader`'s title text is only rendered while
  `Sheet`'s content is mounted).

## Task 26 — Row 26: `src/features/workout/SaveWorkoutSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/SaveWorkoutSheet.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/SaveWorkoutSheet.test.tsx`
- Changes (§6 row 26, §4.2, §4.5 corollary): `detent="full"`. Title `title2` "Save Workout"
  inline → fixed `SheetHeader` (steps to `headline`). Add a Cancel affordance via a bottom
  `ButtonRow` `[Cancel (tonal), Save (primary)]` inside `ScreenFooter` — bottom-preferred over a
  header slot per the PRD's own note. The existing `ScrollView` uses `style={{ paddingHorizontal:
  spacing['4'] }}` (no `flex:1`) with the `Save` `Button` already its true last child — **no
  §4.3 restructure needed**, only the button itself changes shape.
  - Import `SheetHeader`, `ScreenFooter`, `ButtonRow` from `@/ui/SheetHeader` /
    `@/ui/ScreenFooter` / `@/ui/ButtonRow`.
  - Replace
    ```tsx
    <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
      Save Workout
    </Text>
    ```
    (currently the first child inside the `ScrollView`) — move it to be a sibling *before* the
    `ScrollView`, replaced with `<SheetHeader testID={`${testID}-header`} title="Save Workout" safeTop />`.
  - Replace the terminal
    ```tsx
    <Button testID={`${testID}-save`} label="Save Workout" variant="primary" size="lg" onPress={handleSave} style={{ marginBottom: spacing['6'] }} />
    ```
    with
    ```tsx
    <ScreenFooter testID={`${testID}-footer`}>
      <ButtonRow>
        <Button testID={`${testID}-cancel`} label="Cancel" variant="tonal" size="md" onPress={onDismiss} />
        <Button testID={`${testID}-save`} label="Save Workout" variant="primary" size="md" onPress={handleSave} />
      </ButtonRow>
    </ScreenFooter>
    ```
    (keep the `${testID}-save` testID and label text exactly as-is — only its `size` drops from
    `lg` to `md` per the `ButtonRow` usage guideline "give every Button inside one ButtonRow the
    same size," and it's now paired with a new `${testID}-cancel` Button.)
- Acceptance criteria: title centered (now `headline`); a new "Cancel" button (calls `onDismiss`)
  sits to the left of "Save Workout," both equal-width, inside a bottom-safe `ScreenFooter`. All
  9 existing `SaveWorkoutSheet.test.tsx` tests pass unmodified — none assert on `Button` `size`,
  and `save-sheet-save` is pressed by testID (still present) in every Save-path test. **Flag for
  the copy eyeball called out in PRD §8**: this adds new user-facing "Cancel" copy.

## Task 27 — Row 27: `src/features/workout/TimerPill.tsx` (inline full-detent rest-timer sheet)

- Files: `/root/projects/kyro/src/features/workout/TimerPill.tsx`
- Changes (§6 row 27, §4.2, §4.3, §4.5 corollary): `detent="full"`. No title/dismiss today — add
  `SheetHeader` title "Rest Timer" (no slots) + a bottom `ScreenFooter` single "Close" button
  (tonal). The sheet's content (`styles.sheetContent`: `flex:1, alignItems:'center',
  justifyContent:'center'`) is fixed, non-scrolling content (a `ProgressRing` + controls row) —
  per §4.3, fixed content with no `ScrollView` needs no restructure *as long as* `ScreenFooter`
  ends up as a genuine sibling after the centered block, not swallowed inside it.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Change the sheet's render from:
    ```tsx
    <Sheet testID={`${testID}-sheet`} visible={sheetVisible} onDismiss={() => setSheetVisible(false)} detent="full">
      <View style={styles.sheetContent}>
        <ProgressRing .../>
        <View style={{ marginTop: spacing['6'] }}>
          <TimerControlsRow .../>
        </View>
      </View>
    </Sheet>
    ```
    to:
    ```tsx
    <Sheet testID={`${testID}-sheet`} visible={sheetVisible} onDismiss={() => setSheetVisible(false)} detent="full">
      <View style={{ flex: 1 }}>
        <SheetHeader testID={`${testID}-sheet-header`} title="Rest Timer" safeTop />
        <View style={styles.sheetContent}>
          <ProgressRing .../>
          <View style={{ marginTop: spacing['6'] }}>
            <TimerControlsRow .../>
          </View>
        </View>
        <ScreenFooter testID={`${testID}-sheet-footer`}>
          <Button testID={`${testID}-sheet-close`} label="Close" variant="tonal" onPress={() => setSheetVisible(false)} />
        </ScreenFooter>
      </View>
    </Sheet>
    ```
    (`styles.sheetContent`'s own `flex: 1` still lets the ring/controls block absorb the
    remaining space between the header and the footer — the footer renders as a genuine sibling
    below it, not swallowed by the centering.) Import `Button` from `@/ui/Button` (not currently
    imported in this file).
- Acceptance criteria: opening the full-screen rest-timer sheet (tap the pill) now shows a
  centered "Rest Timer" title at the top, the existing ring/controls centered in the remaining
  space, and a "Close" button pinned bottom-safe (not the physical edge). Tapping Close dismisses
  the sheet exactly like the prior scrim-tap did. No existing automated test targets this inline
  sheet's body structurally (verify via `grep` for `-sheet-` testIDs in any `TimerPill.test.tsx`
  before starting).

## Task 28 — Row 28: `src/features/workout/ReorderExercisesSheet.tsx`

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`
- Changes (§6 row 28, §4.2, §4.3 — this file is the PRD's own named example of the
  `ScrollView(flex:1) + sibling Button` anti-pattern, restructure required; §4.5 corollary
  **"flag, don't add"**: PRD C owns adding the missing Cancel/dismiss control to this exact
  file — do not add one here): `detent="full"`.
  - Import `SheetHeader`, `ScreenFooter` from `@/ui/SheetHeader` / `@/ui/ScreenFooter`.
  - Current body:
    ```tsx
    <View style={{ paddingHorizontal: spacing['4'], flex: 1 }}>
      <Text style={[typography.headline, ...]}>Reorder Exercises</Text>
      <ScrollView style={{ flex: 1 }}>
        {draft.map((exercise, index) => (...))}
      </ScrollView>
      <Button testID={`${testID}-save`} label="Save Order" variant="primary" onPress={handleSave} style={{ marginTop: spacing['4'] }} />
    </View>
    ```
  - New body:
    ```tsx
    <View style={{ flex: 1 }}>
      <SheetHeader testID={`${testID}-header`} title="Reorder Exercises" safeTop />
      {/* PRD C (reorder-exercises-sheet-fixes) owns adding a Cancel/dismiss
          control to this header per §4.5's corollary — deliberately not
          added here to avoid two PRDs editing the same header row. */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing['4'] }}>
        {draft.map((exercise, index) => (
          <View key={exercise.id} testID={`${testID}-row-${exercise.id}`} ...>
            {/* unchanged row content */}
          </View>
        ))}
        <ScreenFooter testID={`${testID}-footer`}>
          <Button testID={`${testID}-save`} label="Save Order" variant="primary" onPress={handleSave} />
        </ScreenFooter>
      </ScrollView>
    </View>
    ```
    (drop `flex:1` from the `ScrollView`'s own `style`; the per-row `borderBottomWidth`/
    `borderBottomColor` logic on each row `View` is unchanged.)
- Acceptance criteria: title centered ("Reorder Exercises"); short exercise lists show "Save
  Order" directly below the last row, not pinned to the physical bottom edge with a dead gap;
  long lists scroll with "Save Order" appearing after the last row. Still **no** Cancel/dismiss
  control in the header (left to PRD C). No existing automated test targets this file
  structurally at time of writing (verify via `grep` for `ReorderExercisesSheet.test` — if one
  exists, ensure `${testID}-save`/`${testID}-row-*-up`/`-down` testIDs, untouched, keep it
  passing).

## Summary of what requires you (not a dev agent)

- **New user-facing copy eyeball** (PRD §8): implementing this PRD adds brand-new dismiss/confirm
  copy to sheets that had none before — "Cancel" (Task 8 `ExerciseTypeSheet`, Task 26
  `SaveWorkoutSheet`), "Done" (Task 9 `MultiSelectOptionSheet` — already existed, unchanged copy;
  Task 24 `PlateCalculatorSheet` — new), and "Close" (Task 27 `TimerPill`'s inline sheet — new).
  None of this is gated on your approval to implement, but give the final copy/placement a quick
  look once these land. (PRD §8 also mentions row 28 `ReorderExercisesSheet` in this same
  breath, but per the PRD's own correction, no new copy actually lands there — Task 28
  deliberately does not add a Cancel control, so there is nothing to eyeball for that file.)
- **Nothing else requires you.** This is a design-only-derived, purely mechanical implementation
  PRD — no external services, secrets, accounts, or manual infra approvals are needed for any of
  the 28 tasks above.
