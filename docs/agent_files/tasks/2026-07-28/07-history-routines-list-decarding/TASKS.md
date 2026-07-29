# Tasks: History / Routines List De-carding

## Open Questions

- **PRD §7's "existing tests pass unmodified" claim is not quite true for
  `HistoryListScreen.test.tsx`.** Grepping the file's `getByText`/`queryByText`
  calls turned up one assertion PRD §7 didn't account for:
  `src/features/history/__tests__/HistoryListScreen.test.tsx:203`
  (`expect(screen.getByText('1 × Bench Press (Barbell) — best 60kg × 8')).toBeTruthy();`,
  inside the `'renders a card with title, volume, and PR count from
  RecordsService'` test) directly asserts that a per-exercise summary line
  **is** rendered in the list. Once `HistoryWorkoutCard` stops rendering
  `item.exerciseLines` (PRD §4.2/§9.2 — the whole point of this restyle for
  that surface), this exact assertion throws (`getByText` fails to find the
  string) and the test fails. Every other assertion PRD §7 named (`title2`
  scale in `RoutinesHubScreen.test.tsx`, `history-card-w-1`/pagination/
  press-through in `HistoryListScreen.test.tsx`) was independently confirmed
  accurate and unaffected by this restyle.
  - **Assumption made to proceed**: this is treated as a required correctness
    fix, not one of PRD §7's optional/additive new test cases — Task 3 below
    removes the now-false assertion as part of landing Task 2's component
    change, so the existing suite keeps passing (matching the *spirit* of
    PRD §7's "these existing tests should pass unmodified," which holds for
    every assertion except this one specific line).
  - **Why this is the right read**: PRD §3's own non-goals are explicit that
    `history-list-model.ts` (and its own `buildHistoryCard` unit tests) stay
    unmodified — `exerciseLines` is still *computed*, just no longer
    *rendered* by the list row. The one assertion this affects lives in the
    screen-level test, not the model-level test, and is testing rendered
    output of a component this PRD explicitly changes.
- No other discrepancies found — PRD §4's code excerpts (`RoutineCard.tsx`,
  `HistoryWorkoutCard.tsx` before/after), the token names it cites
  (`typography.headline`/`footnote`/`subhead`/`title2`/`body`,
  `spacing['1'|'2'|'3'|'4']`, `colors.border.hairline`), `Button`'s
  `SIZE_HEIGHT` table (`lg: 50`, `md: 40`) and `md`'s default
  `alignSelf: 'flex-start'`, and every `testID` PRD §7 names in
  `RoutinesHubScreen.test.tsx`/`HistoryListScreen.test.tsx` were all
  confirmed byte-accurate against the current source at task-generation time.

---

## Parallelization

Files touched, one line each: Task 1 → `RoutineCard.tsx`; Task 2 →
`HistoryWorkoutCard.tsx`; Task 3 → `HistoryListScreen.test.tsx`; Task 4 →
`RoutinesHubScreen.test.tsx`; Task 5 → `HistoryListScreen.test.tsx` (same
file as Task 3). Every other file pair is disjoint. Capped at 2 concurrent
tasks/agents per the hard constraint below.

- **Wave 1 — Tasks 1, 2** (concurrent). Neither has a stated `Depends on`.
  Task 1 edits only `src/features/routines/RoutineCard.tsx`; Task 2 edits
  only `src/features/history/HistoryWorkoutCard.tsx` — disjoint files in
  disjoint feature folders (routines vs. history), no shared imports or
  types between the two components, so they're safe to run at the same
  time.
- **Wave 2 — Tasks 3, 4** (concurrent). Task 3 depends on Task 2 (only
  makes sense once `HistoryWorkoutCard` stops rendering `exerciseLines`);
  Task 4 depends on Task 1 (asserts the new `footnote` type scale Task 1
  introduces) — both prerequisites landed in Wave 1, so both are now
  unblocked. Task 3 edits `src/features/history/__tests__/
  HistoryListScreen.test.tsx`; Task 4 edits `src/features/routines/
  __tests__/RoutinesHubScreen.test.tsx` — disjoint files (history tests vs.
  routines tests), and neither task's `Depends on` names the other, so
  they're safe to run at the same time.
- **Wave 3 — Task 5** (alone). Task 5 depends on both Task 2 *and* Task 3.
  It can't be paired with anything at this point: every other task (1–4)
  has already landed by the start of this wave, so there's nothing left to
  run it alongside. It also can't be pulled earlier into Wave 2 alongside
  Task 3 — it edits the exact same file Task 3 edits
  (`HistoryListScreen.test.tsx`), and it explicitly depends on Task 3's
  edit landing first (removing the now-false assertion) so the file's
  existing suite is green before Task 5 appends more tests to it;
  editing the same file concurrently in two different, dependent states is
  not safe, unlike Wave 1/2's genuinely disjoint-file pairs.

---

### Task 1 — Restyle `RoutineCard.tsx`: drop `Card`, plain `View` + hairline divider

- **Files:**
  - `src/features/routines/RoutineCard.tsx`
- **Changes:** Implements PRD §4.1 exactly. Three parts:

  1. **Imports** — remove the `Card` import, add `StyleSheet` to the existing
     `react-native` import:

     **Before:**
     ```tsx
     import { Pressable, Text, View } from 'react-native';

     import type { RoutineSummary } from '@/data/routines/types';
     import { Button } from '@/ui/Button';
     import { Card } from '@/ui/Card';
     import { useTheme } from '@/ui/theme-provider';
     ```

     **After:**
     ```tsx
     import { Pressable, StyleSheet, Text, View } from 'react-native';

     import type { RoutineSummary } from '@/data/routines/types';
     import { Button } from '@/ui/Button';
     import { useTheme } from '@/ui/theme-provider';
     ```

  2. **Return statement** — replace the `<Card>` wrapper with a plain `<View>`
     carrying top/bottom padding + a bottom hairline, drop the type scale one
     step (`title2`→`headline` for the title, `subhead`→`footnote` for the
     preview), and shrink/restyle the Start button:

     **Before** (current lines 53–96):
     ```tsx
     return (
       <Card testID={testID} style={{ marginBottom: spacing['3'] }}>
         <View style={{ flexDirection: 'row', alignItems: 'center' }}>
           <Text
             style={[typography.title2, { color: colors.text.primary, flex: 1 }]}
             numberOfLines={1}
           >
             {routine.title}
           </Text>
           {reorderMode ? (
             dragHandle
           ) : (
             <Pressable
               testID={`${testID}-menu`}
               accessibilityRole="button"
               accessibilityLabel={`More actions for ${routine.title}`}
               hitSlop={8}
               onPress={onMenuPress}
             >
               <Ellipsis size={22} strokeWidth={1.75} color={colors.text.primary} />
             </Pressable>
           )}
         </View>
         {!reorderMode && preview.length > 0 ? (
           <Text
             testID={`${testID}-preview`}
             style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}
             numberOfLines={2}
           >
             {preview}
           </Text>
         ) : null}
         {reorderMode ? null : (
           <Button
             testID={`${testID}-start`}
             label="Start Routine"
             variant="tonal"
             size="lg"
             onPress={onStart}
             style={{ marginTop: spacing['4'] }}
           />
         )}
       </Card>
     );
     ```

     **After:**
     ```tsx
     return (
       <View
         testID={testID}
         style={{
           paddingVertical: spacing['3'],
           borderBottomWidth: StyleSheet.hairlineWidth,
           borderBottomColor: colors.border.hairline,
         }}
       >
         <View style={{ flexDirection: 'row', alignItems: 'center' }}>
           <Text
             style={[typography.headline, { color: colors.text.primary, flex: 1 }]}
             numberOfLines={1}
           >
             {routine.title}
           </Text>
           {reorderMode ? (
             dragHandle
           ) : (
             <Pressable
               testID={`${testID}-menu`}
               accessibilityRole="button"
               accessibilityLabel={`More actions for ${routine.title}`}
               hitSlop={8}
               onPress={onMenuPress}
             >
               <Ellipsis size={22} strokeWidth={1.75} color={colors.text.primary} />
             </Pressable>
           )}
         </View>
         {!reorderMode && preview.length > 0 ? (
           <Text
             testID={`${testID}-preview`}
             style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['1'] }]}
             numberOfLines={2}
           >
             {preview}
           </Text>
         ) : null}
         {reorderMode ? null : (
           <Button
             testID={`${testID}-start`}
             label="Start Routine"
             variant="tonal"
             size="md"
             onPress={onStart}
             style={{ marginTop: spacing['2'], alignSelf: 'stretch' }}
           />
         )}
       </View>
     );
     ```

     Note the outer `View` has **no horizontal padding** — the parent
     (`RoutinesHubScreen.tsx`'s `paddingHorizontal: spacing['4']` wrapper,
     already one level up, unchanged by this PRD) already supplies the 16 pt
     screen gutter. Adding horizontal padding here would recreate the
     double-inset bug PRD §2 goal #4 exists to fix.

  3. **File header comment** — the doc comment's sentence "Built on `Card`
     (`src/ui/Card.tsx`) — no one-off surface styling (07 §5's 'no
     feature-local one-off buttons/cards' rule)." is now false. Replace it
     with something like: "Built as a plain `View` + bottom hairline divider
     (07-history-routines-list-decarding PRD §4.1) — no `Card` surface,
     matching `ListRow`'s hairline-divider idiom used elsewhere in this
     codebase." Exact wording is flexible; the point is not leaving a stale
     "built on Card" claim in the file that no longer imports `Card`.

  Everything else in the file — the `RoutineCardProps` interface, all
  `testID`/`${testID}-start`/`${testID}-menu`/`${testID}-preview`/
  `dragHandle` behavior, `onStart`/`onMenuPress` callbacks, reorder-mode
  branching — is untouched.

- **Acceptance criteria:**
  - `src/features/routines/RoutineCard.tsx` no longer imports `Card` from
    `@/ui/Card`.
  - The outer element rendered is a `View` with `testID={testID}`,
    `borderBottomWidth: StyleSheet.hairlineWidth`, and
    `borderBottomColor` equal to `colors.border.hairline` — not a `Card`.
  - The title `Text` uses `typography.headline`; the preview `Text` (when
    `preview.length > 0`) uses `typography.footnote`.
  - The Start button has `size="md"` and its `style` prop includes
    `alignSelf: 'stretch'` (so it stays full-width despite `md`'s default
    `alignSelf: 'flex-start'`).
  - `RoutineCardProps`'s shape is unchanged; `FolderSection.tsx` requires no
    edits and still compiles/renders correctly against this component.
  - `src/features/routines/__tests__/RoutinesHubScreen.test.tsx` passes
    unmodified (it only asserts `testID`s, not styles — see Open Questions).
  - `npx tsc --noEmit` reports no new errors in this file.

---

### Task 2 — Restyle `HistoryWorkoutCard.tsx`: drop `Card`, compose `ListRow` directly

- **Files:**
  - `src/features/history/HistoryWorkoutCard.tsx`
- **Changes:** Implements PRD §4.2 exactly. Three parts:

  1. **Imports** — drop the manual-layout imports (`Pressable`, `View`,
     `Card`), add `ListRow`:

     **Before:**
     ```tsx
     import React from 'react';
     import { Pressable, Text, View } from 'react-native';

     import { Card } from '@/ui/Card';
     import { useTheme } from '@/ui/theme-provider';
     ```

     **After:**
     ```tsx
     import React from 'react';
     import { Text } from 'react-native';

     import { ListRow } from '@/ui/ListRow';
     import { useTheme } from '@/ui/theme-provider';
     ```

  2. **Component body** — replace the manual `Pressable`-wrapping-`Card`
     layout (title / date / stats-strip / per-exercise-lines, four separate
     stacked elements) with a single `ListRow` call. `spacing` is no longer
     needed from `useTheme()` (nothing in the new body uses it — `ListRow`
     supplies its own internal padding/margins), so drop it from the
     destructure too:

     **Before** (current lines 53–103):
     ```tsx
     function HistoryWorkoutCardComponent({
       item,
       onPress,
       testID = `history-card-${item.workoutId}`,
     }: HistoryWorkoutCardProps): React.JSX.Element {
       const { colors, typography, spacing } = useTheme();

       const statsStrip =
         item.prCount > 0
           ? `${item.durationLabel} · ${item.volumeLabel} · 🏆 ${item.prCount} PR${item.prCount === 1 ? '' : 's'}`
           : `${item.durationLabel} · ${item.volumeLabel}`;

       return (
         <Pressable
           testID={testID}
           accessibilityRole="button"
           accessibilityLabel={item.title}
           onPress={() => onPress(item.workoutId)}
           style={{ marginHorizontal: spacing['4'], marginBottom: spacing['3'] }}
         >
           <Card>
             <Text style={[typography.title2, { color: colors.text.primary }]} numberOfLines={1}>
               {item.title}
             </Text>
             <Text
               style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}
             >
               {item.relativeDate}
             </Text>
             <Text
               style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['2'] }]}
             >
               {statsStrip}
             </Text>
             {item.exerciseLines.length > 0 ? (
               <View style={{ marginTop: spacing['2'], gap: spacing['0.5'] }}>
                 {item.exerciseLines.map((line, index) => (
                   <Text
                     key={index}
                     style={[typography.footnote, { color: colors.text.secondary }]}
                     numberOfLines={1}
                   >
                     {line}
                   </Text>
                 ))}
               </View>
             ) : null}
           </Card>
         </Pressable>
       );
     }
     ```

     **After:**
     ```tsx
     function HistoryWorkoutCardComponent({
       item,
       onPress,
       testID = `history-card-${item.workoutId}`,
     }: HistoryWorkoutCardProps): React.JSX.Element {
       const { colors, typography } = useTheme();

       const statsStrip =
         item.prCount > 0
           ? `${item.durationLabel} · ${item.volumeLabel} · 🏆 ${item.prCount} PR${item.prCount === 1 ? '' : 's'}`
           : `${item.durationLabel} · ${item.volumeLabel}`;

       return (
         <ListRow
           testID={testID}
           title={item.title}
           subtitle={statsStrip}
           trailing={
             <Text style={[typography.footnote, { color: colors.text.tertiary }]} numberOfLines={1}>
               {item.relativeDate}
             </Text>
           }
           chevron
           onPress={() => onPress(item.workoutId)}
         />
       );
     }
     ```

     Notes:
     - `item.exerciseLines` is now genuinely unused by this component — that
       is intentional (PRD §4.2/§9.2), not a bug to "fix" by wiring it back
       in.
     - No explicit `accessibilityLabel` is passed to `ListRow` (it doesn't
       accept one) — `ListRow`'s internal `Pressable` already sets
       `accessibilityRole="button"`, and the visible `title` text satisfies
       the accessible-name requirement, matching how every other `ListRow`
       caller in this codebase (e.g. `ExerciseRow.tsx`) already works.
     - `React.memo` wrapper (the last line of the file,
       `export const HistoryWorkoutCard = React.memo(HistoryWorkoutCardComponent);`)
       is **unchanged** — do not remove it.

  3. **File header comment** — the doc comment's second paragraph
     ("Built from `Card` ... rather than `ListRow` (that primitive's
     title/subtitle shape is a fixed two lines; this card is a variable
     number of lines depending on how many exercises the workout has) —
     `HistoryListScreen.tsx`'s own header explains the same choice.") is now
     false — the component composes `ListRow` directly and no longer varies
     its line count. Replace it with a short note pointing at PRD §4.2/§9.2:
     something like "Composes `ListRow` directly (07-history-routines-list-
     decarding PRD §4.2) — the old variable-line-count reasoning for
     avoiding `ListRow` no longer applies once per-exercise lines stop being
     rendered (§9.2)." Leave the 🏆-emoji paragraph and the M4-11
     `React.memo` paragraph as-is — both are still accurate.

  `HistoryListScreen.tsx` needs **zero changes** (PRD §4.2, confirmed by
  reading it: it renders `<HistoryWorkoutCard testID={...} item={item}
  onPress={handleRowPress} />` and nothing else touches this component's
  props).

- **Acceptance criteria:**
  - `src/features/history/HistoryWorkoutCard.tsx` no longer imports `Card`
    from `@/ui/Card`, `Pressable`, or `View` from `react-native`.
  - The component renders a `ListRow` with `title={item.title}`,
    `subtitle={statsStrip}` (same `statsStrip` computation as before,
    byte-identical), a `trailing` node showing `item.relativeDate` in
    `typography.footnote`/`colors.text.tertiary`, `chevron` set, and
    `onPress={() => onPress(item.workoutId)}`.
  - `item.exerciseLines` is not read/rendered anywhere in this file.
  - `HistoryCardData` and `HistoryWorkoutCardProps` interfaces are
    byte-for-byte unchanged.
  - The default export is still `React.memo(HistoryWorkoutCardComponent)`.
  - `HistoryListScreen.tsx` requires no edits and still compiles.
  - `npx tsc --noEmit` reports no new errors in this file.

---

### Task 3 — Fix the one `HistoryListScreen.test.tsx` assertion this restyle breaks

- **Files:**
  - `src/features/history/__tests__/HistoryListScreen.test.tsx`
- **Depends on:** Task 2 (this only makes sense once `HistoryWorkoutCard`
  stops rendering `exerciseLines`).
- **Changes:** See "Open Questions" above for the full discrepancy writeup.
  In the `describe('HistoryListScreen — populated list ...')` block's first
  test (`'renders a card with title, volume, and PR count from
  RecordsService'`, currently around line 163), remove this now-false
  assertion:

  ```tsx
  expect(screen.getByText('1 × Bench Press (Barbell) — best 60kg × 8')).toBeTruthy();
  ```

  It directly asserted a per-exercise summary line renders in the list —
  exactly the content PRD §4.2/§9.2 deliberately stops rendering. No
  replacement assertion is required here (Task 5 adds a proper, dedicated
  regression guard for "exercise lines don't render" against a
  multi-exercise fixture); this task's only job is removing the assertion
  that would otherwise fail and turn the whole suite red after Task 2 lands.
  The rest of that test (title, volume, PR count assertions) is unaffected
  and stays as-is.
- **Acceptance criteria:**
  - The line above no longer appears in the file.
  - The test `'renders a card with title, volume, and PR count from
    RecordsService'` still asserts `screen.getByText('Morning Workout')`,
    `screen.getByText(/480 kg/)`, and `screen.getByText(/🏆 5 PRs/)`
    (unchanged).
  - `npx jest src/features/history/__tests__/HistoryListScreen.test.tsx`
    passes in full (all existing tests in the file, not just this one).

---

### Task 4 — *(additive, non-blocking)* Add a `RoutinesHubScreen.test.tsx` type-scale guard

> Per PRD §7: "not required to unblock the restyle since no existing
> coverage breaks" for this file. Add when convenient; do not treat as a
> release blocker.

- **Files:**
  - `src/features/routines/__tests__/RoutinesHubScreen.test.tsx`
- **Depends on:** Task 1.
- **Changes:** Add a new test inside the existing
  `describe('RoutinesHubScreen — smoke render (both themes)', ...)` block
  (reusing that block's own `fixtureRepo()`/`BENCH_ID`/`renderHub` helpers,
  already in scope), asserting the routine preview text now renders at
  `footnote` size (13 pt) rather than the old `subhead` size (15 pt) — a
  direct regression guard against a future accidental revert to the
  pre-restyle type scale:

  ```tsx
  it('renders the routine preview at footnote size, not the old subhead size (07-history-routines-list-decarding PRD §4.1)', async () => {
    await renderHub(fixtureRepo());

    await screen.findByTestId('routine-card-r1');
    const preview = await waitFor(() => screen.getByTestId('routine-card-r1-preview'));

    const flattenedStyle = Array.isArray(preview.props.style)
      ? Object.assign({}, ...preview.props.style)
      : preview.props.style;

    // typography.footnote.fontSize === 13 (src/ui/tokens.ts) — the old
    // typography.subhead.fontSize === 15 this guards against reverting to.
    expect(flattenedStyle.fontSize).toBe(13);
  });
  ```

  This deliberately reads the rendered `Text`'s flattened `style` prop
  directly (`preview.props.style`) rather than adding a new matcher
  dependency (`toHaveStyle` needs `@testing-library/jest-native`, not
  currently installed per `package.json`) — a plain prop read is sufficient
  and needs nothing new added to the project.
- **Acceptance criteria:**
  - The new test passes.
  - No new dependency was added to `package.json` to make it pass.
  - All pre-existing tests in the file still pass unmodified.

---

### Task 5 — *(additive, non-blocking)* Add `HistoryListScreen.test.tsx` regression guards for dropped exercise lines and the new trailing-date/chevron layout

> Per PRD §7: both cases are explicitly called out as "small, additive, not
> required to unblock the restyle." Add when convenient; do not treat as a
> release blocker.

- **Files:**
  - `src/features/history/__tests__/HistoryListScreen.test.tsx`
- **Depends on:** Task 2 (component change) and Task 3 (so the file's
  existing suite is green before adding more).
- **Changes:**

  1. Add two new imports at the top of the file (alongside the existing
     `import` block):
     ```tsx
     import { ChevronRight } from 'lucide-react-native';
     // ...
     import { formatRelativeWorkoutDate } from '../date-format';
     ```

  2. In the `describe('HistoryListScreen — populated list ...')` block, add
     a test guarding that per-exercise summary lines are dropped even when a
     workout has several exercises (PRD §7 item 2 — the fixture needs 3+
     distinct exercises so this is a real regression guard, not
     coincidentally-empty `exerciseLines`):

     ```tsx
     it('does not render per-exercise summary lines even for a workout with several exercises (07-history-routines-list-decarding PRD §4.2/§9.2)', async () => {
       const benchPress = makeExercise({ id: 'ex-1', name: 'Bench Press' });
       const squat = makeExercise({ id: 'ex-2', name: 'Squat' });
       const cableRow = makeExercise({ id: 'ex-3', name: 'Cable Row' });

       const workoutExercises = [
         makeWorkoutExercise({ id: 'we-1', exerciseId: 'ex-1' }),
         makeWorkoutExercise({ id: 'we-2', exerciseId: 'ex-2' }),
         makeWorkoutExercise({ id: 'we-3', exerciseId: 'ex-3' }),
       ];

       const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
         listCompleted: async () => [makeSummary()],
         getExercisesForWorkouts: async () => new Map([['w-1', workoutExercises]]),
       };
       const exerciseRepository: Pick<ExerciseRepository, 'list'> = {
         list: async () => [benchPress, squat, cableRow],
       };

       await renderScreen(workoutRepository, exerciseRepository);
       await waitFor(() => expect(screen.getByTestId('history-card-w-1')).toBeTruthy());

       // `buildHistoryCard` still computes 3 `exerciseLines` for this
       // fixture (unchanged, PRD §3 non-goal) — this guards that
       // `HistoryWorkoutCard` genuinely stops *rendering* them.
       expect(screen.queryByText(/Bench Press/)).toBeNull();
       expect(screen.queryByText(/Squat/)).toBeNull();
       expect(screen.queryByText(/Cable Row/)).toBeNull();
     });
     ```

  3. In the same block, add a test guarding the new title/stats/date/chevron
     layout actually mounted (PRD §7 item 3):

     ```tsx
     it('renders the relative date as trailing text next to a chevron, confirming the new layout mounted (07-history-routines-list-decarding PRD §4.2/§7)', async () => {
       const summary = makeSummary();
       const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
         listCompleted: async () => [summary],
         getExercisesForWorkouts: async () => new Map([['w-1', [makeWorkoutExercise()]]]),
       };
       const exerciseRepository: Pick<ExerciseRepository, 'list'> = {
         list: async () => [makeExercise()],
       };

       await renderScreen(workoutRepository, exerciseRepository);
       await waitFor(() => expect(screen.getByTestId('history-card-w-1')).toBeTruthy());

       // Same computation the component performs internally via
       // `buildHistoryCard` (`history-list-model.ts`) — both call
       // `formatRelativeWorkoutDate` with the default `now = new Date()`,
       // so this matches as long as the test doesn't straddle a real-clock
       // day boundary mid-run (same implicit assumption every other test in
       // this file already makes).
       expect(screen.getByText(formatRelativeWorkoutDate(summary.startTime))).toBeTruthy();

       // `ListRow`'s chevron (`lucide-react-native`'s `ChevronRight`) has no
       // testID/accessibilityLabel of its own — `UNSAFE_getByType` is the
       // pragmatic RNTL escape hatch for asserting a specific icon
       // component rendered, used here only because there's no better hook.
       expect(screen.UNSAFE_getByType(ChevronRight)).toBeTruthy();
     });
     ```

- **Acceptance criteria:**
  - Both new tests pass.
  - No new `jest.mock(...)` blocks were added — both tests use the file's
    existing `renderScreen`/`makeSummary`/`makeExercise`/
    `makeWorkoutExercise` helpers and existing `expo-router` mock.
  - All pre-existing tests in the file (including Task 3's fix) still pass.

---

## Summary of what requires you (not a dev agent)

- **Nothing is required to land this PRD's implementation** (Tasks 1–3) —
  PRD §8 confirms every dependency (`ListRow`, `Button`'s existing `md`
  size, `colors.border.hairline`) is already built, themed, and proven
  elsewhere in the app. Tasks 4–5 are additive test coverage, explicitly
  non-blocking per PRD §7.
- **Recommended, not required — a quick on-device visual check once
  implemented** (PRD §8): compare `RoutineCard`'s new ~129 pt row against
  the Hevy screenshot's ~130–150 pt estimate, and `HistoryWorkoutCard`'s new
  ~57 pt row against `ExerciseRow`'s 64 pt precedent. Both height numbers in
  the PRD are token-math-derived, not pixel-measured from a live render — a
  real-device glance is the cheap way to confirm both surfaces actually read
  as "thin" the way the user meant before considering this fully closed out.
- **The one discrepancy this task list found** (see "Open Questions" at the
  top): PRD §7's claim that `HistoryListScreen.test.tsx`'s existing suite
  "should pass unmodified" doesn't quite hold — one assertion (line 203)
  directly checks a per-exercise line renders, which this restyle
  deliberately removes. Task 3 fixes it as part of the required work, so
  this doesn't block anything, but it's worth knowing the PRD's own testing
  section had one small blind spot here.
