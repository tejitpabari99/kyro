# Tasks: Exercise Detail — Full-Screen Conversion + Summary Tab Merge

## Open Questions

These are new ambiguities discovered while grounding tasks in the actual code (not covered by
any of PRD §9's 14 already-RESOLVED items). Each lists the assumption made to keep moving and
why. None of these block execution.

1. **PRD §7 names exactly 6 test files needing the `useFocusEffect` mock override
   (`ActiveWorkoutScreen.test.tsx`, `ActiveWorkoutScreen.minimize.test.tsx`,
   `ActiveWorkoutScreen.smart-scroll.test.tsx`, `EditWorkoutScreen.test.tsx`,
   `RoutineEditorScreen.test.tsx`, `keyboard-flow.test.tsx`) — but a repo-wide check for every
   test file that renders `<ActiveWorkoutScreen>`, `<EditWorkoutScreen>`, or
   `<RoutineEditorScreen>` (the three screens that always mount `<ExercisePickerSheet>`, gated
   only on `Sheet`'s own `visible` prop, not on whether `<ExercisePickerSheet>` itself is
   rendered) turned up two more: `src/features/workout/__tests__/ActiveWorkoutScreen.pr-banner.test.tsx`
   (renders `<ActiveWorkoutScreen>` directly, same `jest.mock('expo-router', () => ({
   ...jest.requireActual('expo-router'), router: {...} }))` pattern) and
   `src/features/workout/__tests__/ExerciseCard.operations.test.tsx` (renders `<ActiveWorkoutScreen>`
   directly, identical pattern). AD-4's `useFocusEffect` call inside `ExercisePickerSheet` is
   unconditional (runs on every mount of the component, regardless of the `visible` prop), so
   **any** test that mounts one of these three screens at all — not only tests that actually open
   the picker — will crash once AD-4 lands, unless its `expo-router` mock gets the same
   `useFocusEffect` override.
   Assumption: treat both extra files identically to the PRD-named 6 — same one-line mock
   addition, same reasoning. See Task 18, which now names all 8 files explicitly.

2. **`ExerciseCard.test.tsx` has no `jest.mock('expo-router', ...)` at all today** (confirmed by
   reading the file) — the current name-tap behavior (`setDetailVisible(true)`) never calls
   `router.push`, so nothing forced this file to mock the module. After AD-7, the name-tap does
   call `router.push`, and asserting on it needs a `jest.fn()` spy.
   Assumption: add the same `jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'),
   router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }))` block every sibling test
   file in this codebase already uses for this exact purpose (e.g.
   `ExerciseDetailScreen.actions.test.tsx`, `ExerciseCard.operations.test.tsx`) — see Task 15.

3. **`ExerciseDetailScreen.test.tsx` uses `screen.getByTestId('detail-about')` (soon
   `detail-howto`/`detail-summary`) as a generic "the screen finished loading" gate in roughly a
   dozen places across this file** — not just in the one "tabs switch correctly" test PRD §7
   calls out. Because the default tab is changing from `'about'` (always rendered once `exercise`
   resolves) to `'summary'` (whose content depends on `historyQuery`/`historicalSets`, and for
   most of this file's fixtures — which don't pass `workoutRepository` at all — resolves to the
   `DetailEmptyTab tab="summary"` empty state, not `HowToTab`), every one of those waits breaks,
   not only the tab-switch test itself. PRD §7's own description ("update: default-tab assertion,
   tab-press testIDs, content testIDs") reads as a smaller, localized change than what the actual
   file requires.
   Assumption: switch every generic "has it loaded yet" wait in this file to gate on
   `` `${testID}-name` `` (renders unconditionally once `exercise` resolves, independent of which
   tab or tab-loading-state is active) instead of `` `${testID}-about` ``/`` `${testID}-howto` ``,
   and have the "About tab matches real exercise data" describe block explicitly press
   `` `${testID}-tabs-howto` `` before asserting on How-to-specific content (since How to is no
   longer the default tab). See Task 13 for the full file-wide treatment.

4. **`DetailEmptyTab`'s merged `'summary'` empty-state icon** — AD-2's own code sample shows the
   merged copy (title/caption) verbatim but doesn't specify which of the two old icons
   (`LineChart` for the old `'charts'` key, `Trophy` for the old `'records'` key) the merged key
   should keep.
   Assumption: keep `LineChart` (the Summary tab leads with the chart, and `Trophy`'s only other
   use in this file disappears with the `'records'` key) and drop the now-unused `Trophy` import.
   Purely cosmetic, zero behavioral stakes. See Task 5.

## Parallelization

Derived from each task's stated `Depends on:` line plus the actual files each task touches (read
in full above — not guessed). Hard cap: **2 tasks per wave**, since only 2 people/agents ever run
concurrently on this project. Waves are listed in execution order; within a wave, both tasks may
start as soon as the previous wave's tasks have landed.

1. **Wave 1 — Task 2, Task 3.** No dependencies for either. `ExerciseChartsTab.tsx` (Task 2) and
   `ExerciseRecordsTab.tsx` (Task 3) are disjoint files with no shared consumer edited by either
   task. Both are prerequisites for Task 4.
2. **Wave 2 — Task 1, Task 7.** Neither depends on anything landed so far, and neither depends on
   the other. Task 1 touches `HowToTab.tsx` (new) and removes the inline `AboutTab` block from
   `ExerciseDetailScreen.tsx`; Task 7 touches only `ExercisePickerSheet.tsx`. Disjoint files.
3. **Wave 3 — Task 4, Task 6.** Task 4 depends on Task 2 + Task 3 (both landed in Wave 1) and
   creates `ExerciseSummaryTab.tsx` (new). Task 6 has no dependencies and touches only
   `ExerciseCard.tsx`. Disjoint files, safe to run alongside Task 4.
4. **Wave 4 — Task 5, Task 11.** Task 5 depends on Task 1 (Wave 2) and Task 4 (Wave 3), both now
   landed; it makes the full tab-restructure edit to `ExerciseDetailScreen.tsx` (the same file
   Task 1 touched in Wave 2 — safe here because Task 1 already landed before this wave starts, so
   this is sequential-on-file, not concurrent). Task 11 is verify-only (confirms
   `RoutineEditorScreen.tsx` needs zero changes) — it makes no edits at all, so it has no file
   conflict with anything and is paired here purely to keep this wave full; it could equally run
   in any other wave.
5. **Wave 5 — Task 8, Task 10.** Both depend on Task 6 + Task 7 (Waves 3 and 2, both landed). Task
   8 touches only `ActiveWorkoutScreen.tsx`; Task 10 touches only `EditWorkoutScreen.tsx`.
   Disjoint files, no dependency between the two tasks themselves.
6. **Wave 6 — Task 12, Task 15.** Both depend only on Task 6 + Task 7 (already landed). Task 12
   deletes `ExerciseDetailSheet.tsx`; Task 15 edits `ExerciseCard.test.tsx`. Disjoint files.
7. **Wave 7 — Task 9, Task 17.** Task 9 depends on Task 8 (Wave 5, landed); it touches only
   `app/workout/active.tsx`. Task 17 depends on Task 7 (Wave 2, landed) and creates a new file,
   `ExercisePickerSheet.test.tsx`. Disjoint files, no dependency between the two.
8. **Wave 8 — Task 13, Task 16.** Task 13 depends on Task 5 (Wave 4, landed) and rewrites
   `ExerciseDetailScreen.test.tsx`. Task 16 depends on Task 6 (Wave 3, landed) and edits a
   file-header comment in `ExerciseCard.operations.test.tsx`. Disjoint files from each other.
   Note: Task 16 and Task 18 (Wave 9) both touch `ExerciseCard.operations.test.tsx` — Task 16
   edits the comment above the `jest.mock('@/lib/files')` block, Task 18 edits the separate
   `jest.mock('expo-router')` block. Although these are different blocks in the file, they are
   **not** scheduled in the same wave: editing the same file concurrently from two agents risks
   line-drift/merge conflicts even when the target regions look disjoint on paper, so Task 16 is
   deliberately placed in an earlier wave than Task 18 rather than paired with it.
9. **Wave 9 — Task 14, Task 18.** Task 14 depends on Task 5 (Wave 4, landed) and is verify-only —
   no edits expected to `ExerciseDetailScreen.actions.test.tsx`. Task 18 depends on Task 7 (Wave
   2, landed) and edits 8 test files (including `ExerciseCard.operations.test.tsx`, already
   touched by Task 16 in Wave 8 — safe here because that edit already landed). None of Task 18's 8
   files overlap with Task 14's single file. Disjoint.
10. **Wave 10 — Task 19 (alone).** Depends on Tasks 1–18 all having landed (its own acceptance
    criteria explicitly says "once Tasks 1–18 have landed"), so it cannot start until every prior
    wave is complete. By the time it can start, no other task remains unstarted to pair it with —
    it is necessarily the sole task in the final wave.

## Task 1 — `HowToTab.tsx` (new file): extract `AboutTab` verbatim

- Files:
  - `/root/projects/kyro/src/features/exercises/HowToTab.tsx` (new)
  - `/root/projects/kyro/src/features/exercises/ExerciseDetailScreen.tsx` (removal only — this
    task removes the inline `AboutTab` function and its now-dead imports; the render call site
    itself is rewritten in Task 5, once `ExerciseSummaryTab` also exists)
- Changes (AD-3):
  1. Create `HowToTab.tsx`. Body is **byte-identical** to today's inline `AboutTab` (lines
     115–196 of `ExerciseDetailScreen.tsx`) — only the function name (`AboutTab` → `HowToTab`)
     and its prop-type name (`HowToTabProps`, exported) change:
     ```tsx
     import React from 'react';
     import { ScrollView, Text, View } from 'react-native';

     import { EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLE_GROUP_LABELS } from '@/domain/enums';
     import type { Exercise } from '@/data/exercises/types';
     import { Chip } from '@/ui/Chip';
     import { useTheme } from '@/ui/theme-provider';

     export interface HowToTabProps {
       exercise: Exercise;
       testID: string;
     }

     export function HowToTab({ exercise, testID }: HowToTabProps): React.JSX.Element {
       // identical body to the removed inline `AboutTab` — TYPE/EQUIPMENT/MUSCLES/
       // INSTRUCTIONS sections, unchanged content and logic.
     }
     ```
  2. In `ExerciseDetailScreen.tsx`: delete the inline `function AboutTab(...) {...}` block (lines
     115–196) entirely. Confirmed by grep: `AboutTab` has exactly one call site in the whole repo
     (`ExerciseDetailScreen.tsx`'s own render, handled in Task 5), so nothing else needs updating
     for this removal.
  3. Do **not** yet add the `HowToTab` import or change the render call site in
     `ExerciseDetailScreen.tsx` — that happens in Task 5 alongside the rest of AD-2's tab
     restructure, so this file isn't left in a broken intermediate state for longer than one task.
- Acceptance criteria:
  - `HowToTab.tsx` exports `HowToTab`/`HowToTabProps` and, given the same `exercise`/`testID`
    props the old `AboutTab` took, renders pixel-identical output (same testIDs:
    `${testID}-type`, `${testID}-equipment`, `${testID}-primary-muscle-chip`,
    `${testID}-secondary-muscle-chip-${muscle}`, `${testID}-no-instructions`,
    `${testID}-instruction-${index}`).
  - `ExerciseDetailScreen.tsx` no longer defines `AboutTab` anywhere (it still *renders* the old
    call site until Task 5 lands — that's expected and fine within this one task).

## Task 2 — `ExerciseChartsTab.tsx`: root-element swap + chip-row reorder + AD-6 verification

- Files:
  - `/root/projects/kyro/src/features/exercises/ExerciseChartsTab.tsx`
- Changes (AD-5, AD-6):
  1. Root element: change the outer `<ScrollView testID={testID} contentContainerStyle={{ padding:
     spacing['4'] }}>` to a plain `<View testID={testID}>` (no padding — the new parent
     `ExerciseSummaryTab`'s own `ScrollView` owns it, Task 4). This file has exactly one consumer
     today (`ExerciseDetailScreen`'s soon-to-be-removed `charts` branch) and will have exactly one
     consumer after this PRD (`ExerciseSummaryTab`), so this is an unconditional change, not a new
     `scrollable` prop.
  2. Chip-row reorder: move the horizontally-scrollable metric-`Chip` `<ScrollView horizontal ...>`
     block to render **after** the `<LineChart .../>` element instead of before it (pure JSX
     reorder — the two elements' own content/props/handlers are untouched). Matches the Hevy
     reference screenshot's chip-below-chart layout.
  3. The inner horizontal `<ScrollView>` (the chip row itself) stays a `ScrollView` — only the
     *outer* root element changes to `View`, per step 1.
  4. No other line in this file changes: `Chip`, `LineChart`, `SegmentedControl`, metric-switching
     state/logic, and the "No sessions in this range." `Text` are all unchanged.
- Verify-only (AD-6, no code change — confirm and move on):
  - Metric selector stays the existing `Chip` row (not a `SegmentedControl`/dropdown) — already
    true; nothing to change.
  - No new `bestSessionVolumeKg` field or PR-card wiring is added anywhere in this file —
    `session_volume` is already a selectable `ChartMetric` via `chartMetricsForExerciseType`;
    confirm this file still exposes it unchanged.
  - No new "current big value" headline `Text` is added above the chart — confirm
    `LineChart`'s own `title={CHART_METRIC_LABELS[activeMetric]}` remains the only "what am I
    looking at" affordance.
  - No change to the 3M/1Y/All `SegmentedControl` range control (`RANGE_OPTIONS`,
    `headerRight={<SegmentedControl .../>}`) — confirm it's untouched.
- Acceptance criteria:
  - `ExerciseChartsTab`'s root is a `View`, not a `ScrollView`; rendering it standalone (as
    existing/updated tests still do, minus the ones that migrate — see Task 4/13) shows the chip
    row visually below the `LineChart`.
  - `${testID}-metric-*`, `${testID}-chart`, `${testID}-range`, `${testID}-no-range-data` testIDs
    are all unchanged.
  - No `bestSessionVolumeKg`, headline-value `Text`, or range-control shape changes exist anywhere
    in this file's diff.

## Task 3 — `ExerciseRecordsTab.tsx`: drop `flex: 1` from the root `View`

- Files:
  - `/root/projects/kyro/src/features/exercises/ExerciseRecordsTab.tsx`
- Changes (AD-5):
  - Change the root `<View testID={testID} style={{ flex: 1, padding: spacing['4'] }}>` to
    `<View testID={testID} style={{ padding: spacing['4'] }}>` — drop `flex: 1` only, keep
    `padding`. This file has exactly one consumer today (`ExerciseDetailScreen`'s soon-to-be-removed
    `records`/final-else branch) and exactly one after this PRD (`ExerciseSummaryTab`), so this is
    unconditional, not a new prop.
  - No other line changes: `PrCard`, `SetRecordRow`, the least-assistance `Card`, and the Set
    Records table are all untouched.
- Acceptance criteria:
  - `ExerciseRecordsTab`'s root `View`'s computed style no longer includes `flex: 1`; `padding`
    is unchanged.
  - `${testID}-pr-*`, `${testID}-least-assistance`, `${testID}-set-records-table`,
    `${testID}-set-record-*` testIDs are all unchanged.

## Task 4 — `ExerciseSummaryTab.tsx` (new file): compose Charts + Records into one scroll

- Files:
  - `/root/projects/kyro/src/features/exercises/ExerciseSummaryTab.tsx` (new)
- Depends on: Task 2, Task 3 (this file renders both of those components in their post-tweak
  shape).
- Changes (AD-5):
  ```tsx
  import React from 'react';
  import { ScrollView, Text } from 'react-native';

  import type { Exercise } from '@/data/exercises/types';
  import type { ExerciseHistorySet } from '@/data/workouts/types';
  import type { DistanceUnit, WeightUnit } from '@/domain/enums';
  import type { RecordsSnapshot } from '@/domain/records';
  import { useTheme } from '@/ui/theme-provider';

  import { ExerciseChartsTab } from './ExerciseChartsTab';
  import { ExerciseRecordsTab } from './ExerciseRecordsTab';

  export interface ExerciseSummaryTabProps {
    historicalSets: readonly ExerciseHistorySet[];
    exercise: Pick<Exercise, 'exerciseType'>;
    weightUnit: WeightUnit;
    distanceUnit: DistanceUnit;
    warmupInStats: boolean;
    snapshot: RecordsSnapshot;
    testID?: string;
  }

  export function ExerciseSummaryTab({
    historicalSets,
    exercise,
    weightUnit,
    distanceUnit,
    warmupInStats,
    snapshot,
    testID = 'exercise-summary-tab',
  }: ExerciseSummaryTabProps): React.JSX.Element {
    const { colors, typography, spacing } = useTheme();
    return (
      <ScrollView testID={testID} contentContainerStyle={{ padding: spacing['4'] }}>
        <ExerciseChartsTab
          testID={`${testID}-chart`}
          historicalSets={historicalSets}
          exercise={exercise}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          warmupInStats={warmupInStats}
        />
        <Text
          style={[
            typography.footnote,
            { color: colors.text.tertiary, marginTop: spacing['5'], marginBottom: spacing['2'] },
          ]}
        >
          RECORDS
        </Text>
        <ExerciseRecordsTab
          testID={`${testID}-records`}
          snapshot={snapshot}
          historicalSets={historicalSets}
          exerciseType={exercise.exerciseType}
          weightUnit={weightUnit}
        />
      </ScrollView>
    );
  }
  ```
- Acceptance criteria:
  - Rendering `ExerciseSummaryTab` with real chart/record data shows the chart (with its
    below-chart chip row, per Task 2), a "RECORDS" section label, then the records content — all
    inside **one** `ScrollView`, no nested/double scroll containers.
  - `${testID}-chart-*` testIDs match `ExerciseChartsTab`'s own prefixing exactly (e.g.
    `exercise-summary-tab-chart-metric-heaviest_weight`); `${testID}-records-*` testIDs match
    `ExerciseRecordsTab`'s own prefixing exactly (e.g. `exercise-summary-tab-records-pr-heaviest_weight`).
  - `exercise` prop only requires `Pick<Exercise, 'exerciseType'>` — verify a caller can pass the
    full `Exercise` object without a type error (structural typing).

## Task 5 — `ExerciseDetailScreen.tsx`: tab restructure + tab-row reposition + AD-10 verification

- Files:
  - `/root/projects/kyro/src/features/exercises/ExerciseDetailScreen.tsx`
- Depends on: Task 1 (`HowToTab`), Task 4 (`ExerciseSummaryTab`).
- Changes (AD-2):
  1. `DETAIL_TABS` (currently 4 entries: `about`/`history`/`charts`/`records`) becomes 3, renamed,
     reordered:
     ```tsx
     const DETAIL_TABS = [
       { value: 'summary', label: 'Summary' },
       { value: 'history', label: 'History' },
       { value: 'howto', label: 'How to' },
     ] as const;
     type DetailTab = (typeof DETAIL_TABS)[number]['value'];
     ```
     and the `useState<DetailTab>('about')` initializer becomes `useState<DetailTab>('summary')`.
  2. `DetailEmptyTab`'s `tab` union narrows from `'history' | 'charts' | 'records'` to
     `'history' | 'summary'`; its `copy` record's `charts`/`records` keys merge into one
     `summary` key: title `"No data yet"`, caption `"Charts and records appear once you've
     logged a few sessions."`, icon `<LineChart size={40} strokeWidth={1.75}
     color={colors.text.tertiary} />` (see Open Questions #4 — the `Trophy` icon import becomes
     unused and should be removed; `HistoryIcon`/`LineChart` stay, both still referenced).
  3. Import block changes:
     - Remove: `import { ExerciseChartsTab } from './ExerciseChartsTab';`, `import {
       ExerciseRecordsTab } from './ExerciseRecordsTab';`, `import { Chip } from '@/ui/Chip';`
       (no longer used in this file after `AboutTab`'s removal in Task 1), `Trophy` from the
       `lucide-react-native` import line, and `EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS,
       MUSCLE_GROUP_LABELS` from the `@/domain/enums` import line (all were `AboutTab`-only,
       already dead after Task 1's function-body removal — this task is where the now-unused
       *imports* finally get cleaned up).
     - Add: `import { ExerciseSummaryTab } from './ExerciseSummaryTab';` and `import { HowToTab }
       from './HowToTab';`.
     - Keep unchanged: `ExerciseHistoryTab`, `ExerciseMedia`, `setExerciseFormPrefill`,
       `useRecordsSnapshot`, everything else.
  4. Render tree — move the `SegmentedControl` tab row from *after* `ExerciseMedia`/the name
     `Text` to *before* them (directly under the header row), and update its inline style's
     `marginTop` from `spacing['3']` to `spacing['1']`:
     ```tsx
     <SegmentedControl
       testID={`${testID}-tabs`}
       options={DETAIL_TABS}
       value={tab}
       onChange={setTab}
       style={{ marginHorizontal: spacing['4'], marginTop: spacing['1'] }}
     />

     <ExerciseMedia testID={`${testID}-media`} exercise={exercise} size={width} />

     <Text testID={`${testID}-name`} style={[...unchanged...]}>
       {exercise.name}
     </Text>
     ```
     (The header row above this whole block — back/Edit/⋯, and its `showBackButton || exercise`
     gate — is untouched; the loading/not-found branches above it are untouched too.)
  5. Tab-content ternary collapses from 4 branches to 3:
     ```tsx
     <View style={{ flex: 1, marginTop: spacing['2'] }}>
       {tab === 'summary' ? (
         historyQuery.isLoading ? (
           <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
             <ActivityIndicator color={colors.accent.primary} />
           </View>
         ) : historicalSets.length === 0 ? (
           <DetailEmptyTab tab="summary" testID={`${testID}-summary`} />
         ) : (
           <ExerciseSummaryTab
             testID={`${testID}-summary`}
             historicalSets={historicalSets}
             exercise={exercise}
             weightUnit={weightUnit}
             distanceUnit={distanceUnit}
             warmupInStats={warmupInStats}
             snapshot={recordsQuery.data?.snapshot ?? EMPTY_RECORDS_SNAPSHOT}
           />
         )
       ) : tab === 'history' ? (
         historyQuery.isLoading ? (
           <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
             <ActivityIndicator color={colors.accent.primary} />
           </View>
         ) : historicalSets.length === 0 ? (
           <DetailEmptyTab tab="history" testID={`${testID}-history`} />
         ) : (
           <ExerciseHistoryTab
             testID={`${testID}-history`}
             historicalSets={historicalSets}
             exercise={exercise}
             weightUnit={weightUnit}
             distanceUnit={distanceUnit}
             rpeEnabled={rpeEnabled}
           />
         )
       ) : (
         <HowToTab exercise={exercise} testID={`${testID}-howto`} />
       )}
     </View>
     ```
     Import `EMPTY_RECORDS_SNAPSHOT` from `@/domain/records` (it's already exported there —
     confirmed). The old direct `recordsQuery.isLoading` / `recordsQuery.data.awards.length ===
     0` gate is gone entirely; Summary now gates only on `historyQuery`/`historicalSets`, per
     AD-2's own stated reasoning (records are derived from the same set data, so "no historical
     sets" already implies "no records").
- Verify-only (AD-10, no code change):
  - `showBackButton` prop, its `= true` default, and the header row's `showBackButton || exercise`
    gate are **untouched** by this task. Confirm the prop and its doc comment still read correctly
    once Tasks 6/7/9 land (no call site anywhere in the codebase will pass `showBackButton={false}`
    after this PRD — that was `ExerciseDetailSheet`'s one use, deleted in Task 12).
- Acceptance criteria:
  - `DETAIL_TABS` has exactly 3 entries in Summary/History/How to order; default `tab` state is
    `'summary'`.
  - Tab row renders as the first child inside the success branch, above `ExerciseMedia`.
  - Pressing `${testID}-tabs-summary`/`${testID}-tabs-history`/`${testID}-tabs-howto` shows the
    correct content per the ternary above; the merged empty state (no history/no chart/no
    records) shows once, under `${testID}-summary`, with the text "No data yet".
  - `showBackButton` behavior (shown by default, hidden when explicitly `false`) is unchanged.
  - File compiles with zero unused imports (`Chip`, `Trophy`, `EQUIPMENT_LABELS`,
    `EXERCISE_TYPE_LABELS`, `MUSCLE_GROUP_LABELS`, `ExerciseChartsTab`, `ExerciseRecordsTab` are
    all gone from this file's import block).

## Task 6 — `ExerciseCard.tsx`: name-tap → `router.push`, dead-prop removal

- Files:
  - `/root/projects/kyro/src/features/workout/ExerciseCard.tsx`
- Changes (AD-7, AD-8 row 1):
  1. Add `import { router } from 'expo-router';` to the import block; remove `import {
     ExerciseDetailSheet } from './ExerciseDetailSheet';`.
  2. `ExerciseCardProps`: remove `exerciseRepository: ExerciseRepository;` and `workoutRepository?:
     Pick<WorkoutRepository, 'exerciseHistory'>;` (and their doc comments). The `ExerciseRepository`
     and `WorkoutRepository` type imports at the top of the file become unused after this — remove
     them too (`import type { Exercise, ExerciseRepository } from '@/data/exercises/types';`
     narrows to `import type { Exercise } from '@/data/exercises/types';`; the whole
     `import type { WorkoutRepository } from '@/data/workouts/types';` line is deleted — confirm no
     other use of `WorkoutRepository` remains in this file first).
  3. Function signature: drop `exerciseRepository` and `workoutRepository` from the destructured
     props.
  4. Drop the `const [detailVisible, setDetailVisible] = useState(false);` line.
  5. Name-tap `Pressable`'s `onPress`: change `onPress={() => setDetailVisible(true)}` to
     `onPress={() => router.push(`/exercise/${exercise.id}` as never)}`.
  6. Remove the `<ExerciseDetailSheet testID={`${testID}-detail-sheet`} visible={detailVisible}
     onDismiss={() => setDetailVisible(false)} repository={exerciseRepository}
     workoutRepository={workoutRepository} exerciseId={exercise.id} />` render block entirely.
- Acceptance criteria:
  - Tapping the card's name-`Pressable` (`${testID}-name`) calls `router.push` with
    `` `/exercise/${exercise.id}` `` and renders no local sheet.
  - `ExerciseCardProps` no longer has `exerciseRepository`/`workoutRepository`; every other prop
    (`workoutExerciseId`, `exercisePosition`, `exercise`, `notes`, `restSeconds`,
    `supersetVisual`, `weightUnit`, `distanceUnit`, `rpeEnabled`, `previousValuesMode`,
    `routineId`, `getRoutineFull`, `previousSetsExcludeWorkoutId`, the `on*` callbacks,
    `onSetChecked`, `testID`) is unchanged.
  - File compiles with zero unused imports/types.

## Task 7 — `ExercisePickerSheet.tsx`: suspend/restore mechanism + dead-prop removal

- Files:
  - `/root/projects/kyro/src/features/workout/ExercisePickerSheet.tsx`
- Changes (AD-4, AD-8 row 2):
  1. Import block: add `import { router, useFocusEffect } from 'expo-router';`; remove `import {
     ExerciseDetailSheet } from './ExerciseDetailSheet';`.
  2. `ExercisePickerSheetProps`: remove `workoutRepository?: Pick<WorkoutRepository,
     'exerciseHistory'>;` and its doc comment. Keep `repository: ExerciseRepository;` (used by
     `repository.list()`/`.recentlyUsed()`) unchanged. The `WorkoutRepository` type import
     becomes unused after this — remove `import type { WorkoutRepository } from
     '@/data/workouts/types';`.
  3. Function signature: drop `workoutRepository` from the destructured props.
  4. Replace `const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);`
     with `const [isNavigatingToDetail, setIsNavigatingToDetail] = useState(false);`.
  5. In the open-transition reset block (the `if (visible !== wasVisible) { ... }` body), replace
     the line `setDetailExerciseId(null);` with `setIsNavigatingToDetail(false);`.
  6. Add, after that reset block:
     ```tsx
     // Restores this sheet (and, by never having unmounted this component,
     // its search/filter/selection state) whenever the screen that opened
     // this picker regains focus — including the return trip from the
     // `/exercise/[id]` push `handleInfoPress` below triggers. Runs on every
     // focus (including this picker's own first mount), which is a
     // harmless no-op `setState(false)` on any focus unrelated to this flow.
     useFocusEffect(
       useCallback(() => {
         setIsNavigatingToDetail(false);
       }, []),
     );
     ```
  7. Replace `handleInfoPress`:
     ```tsx
     const handleInfoPress = useCallback((exercise: Exercise) => {
       setIsNavigatingToDetail(true);
       router.push(`/exercise/${exercise.id}` as never);
     }, []);
     ```
  8. `<Sheet visible={visible} ...>` → `<Sheet visible={visible && !isNavigatingToDetail} ...>`
     (the rest of the `Sheet` props — `onDismiss`, `detent="full"`, `testID` — unchanged).
  9. Remove the trailing `<ExerciseDetailSheet testID={`${testID}-detail-sheet`}
     visible={detailExerciseId != null} onDismiss={() => setDetailExerciseId(null)}
     repository={repository} workoutRepository={workoutRepository}
     exerciseId={detailExerciseId} />` render block entirely (it currently sits after the
     `<FilterOptionSheet testID={`${testID}-muscle-sheet`} .../>` block, just before the closing
     `</Sheet>`).
- Acceptance criteria:
  - Tapping a row's ⓘ button calls `router.push` with `` `/exercise/${exercise.id}` `` and the
    picker's own `Sheet`'s `visible` prop becomes `false` (the underlying component stays
    mounted).
  - Invoking the (mocked, in tests) `useFocusEffect` callback again — simulating the screen
    regaining focus — flips `isNavigatingToDetail` back to `false`, so `Sheet`'s `visible` prop
    reflects the caller's own `visible` prop again, with `selectedIds`/`searchInput`/filters
    unchanged from before the ⓘ press (they live in `useState` above the `<Sheet>`, never reset
    by this flow).
  - `ExercisePickerSheetProps` no longer has `workoutRepository`; `repository`, `mode`, `onAdd`,
    `onReplace`, `visible`, `onDismiss`, `testID` are unchanged.
  - File compiles with zero unused imports/types.

## Task 8 — `ActiveWorkoutScreen.tsx`: dead-prop cleanup

- Files:
  - `/root/projects/kyro/src/features/workout/ActiveWorkoutScreen.tsx`
- Depends on: Task 6, Task 7 (this task removes props that no longer exist on `ExerciseCardProps`/
  `ExercisePickerSheetProps`).
- Changes (AD-8 row 3):
  1. Remove `ActiveWorkoutScreenProps.workoutRepository?: Pick<WorkoutRepository,
     'exerciseHistory'>;` and its whole doc comment. Confirmed by grep: `workoutRepository` is
     used in this file only at the `<ExerciseCard>` call site (`workoutRepository={workoutRepository}`)
     and the `<ExercisePickerSheet>` call site (`workoutRepository={workoutRepository}`) — no
     other reference anywhere else in this file — so it's fully dead once both call sites stop
     passing it.
  2. Drop `workoutRepository` from the destructured props in the `ActiveWorkoutScreen({...})`
     function signature.
  3. At the `<ExerciseCard>` call site: remove the `exerciseRepository={exerciseRepository}` and
     `workoutRepository={workoutRepository}` lines. (`exerciseRepository` itself — the prop on
     `ActiveWorkoutScreenProps`, not the removed line here — stays: it's used elsewhere in this
     file, e.g. `exerciseRepository.get(id)` inside the mount effect.)
  4. At the `<ExercisePickerSheet>` call site: remove the `workoutRepository={workoutRepository}`
     line. `repository={exerciseRepository}` stays unchanged.
  5. If `WorkoutRepository` (the type) becomes unused in this file after these removals, drop its
     import too — check first, since this file threads `WorkoutRepository`-typed things elsewhere
     (e.g. via `getRoutineFull`/other props) and the type import may still be needed.
- Acceptance criteria:
  - `ActiveWorkoutScreenProps` no longer has `workoutRepository`.
  - The `<ExerciseCard>` and `<ExercisePickerSheet>` JSX call sites no longer pass
    `exerciseRepository`/`workoutRepository` (as applicable per the table above) — every other
    prop on both call sites is unchanged.
  - File compiles with zero unused imports/types; `exerciseRepository` (the prop) still works for
    its other use(s) in this file.

## Task 9 — `app/workout/active.tsx`: dead-prop cleanup

- Files:
  - `/root/projects/kyro/app/workout/active.tsx`
- Depends on: Task 8 (this route file's `workoutRepository` construction exists solely to feed
  the prop Task 8 removes).
- Changes (AD-8 row 4):
  1. Remove `import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';`.
  2. Remove `const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()),
     []);` and its preceding doc comment block.
  3. Remove `workoutRepository={workoutRepository}` from the `<ActiveWorkoutScreen>` call site.
  4. Confirmed by grep: `workoutRepository`'s only purpose in this file was feeding
     `<ActiveWorkoutScreen>` — no other use exists (the `routineRepository`/`repository`
     constructions and their own prop-passes are untouched).
- Acceptance criteria:
  - This file no longer imports or constructs a `WorkoutRepositoryImpl`.
  - `<ActiveWorkoutScreen>` is called with `exerciseRepository`, `retro`, `retroStartTime`,
    `routineId`, `repeatWorkoutId`, `getRoutineFull`, `updateRoutineFromWorkout` — unchanged —
    and no `workoutRepository`.
  - File compiles with zero unused imports.

## Task 10 — `EditWorkoutScreen.tsx`: dead-prop cleanup

- Files:
  - `/root/projects/kyro/src/features/workout/EditWorkoutScreen.tsx`
- Depends on: Task 6, Task 7.
- Changes (AD-8 row 5):
  1. At the `<ExerciseCard>` call site: remove the `exerciseRepository={exerciseRepository}` and
     `workoutRepository={workoutRepository}` lines.
  2. At the `<ExercisePickerSheet>` call site: remove the `workoutRepository={workoutRepository}`
     line. `repository={exerciseRepository}` stays unchanged.
  3. **`EditWorkoutScreenProps.workoutRepository` itself stays** — do not remove it from the props
     interface or its destructure. It's used elsewhere in this file: `loadForEdit(workoutRepository,
     workoutId)` and `workoutRepository.update(workoutId, input)`. Only the two now-dead call-site
     passes above are removed.
- Acceptance criteria:
  - `EditWorkoutScreenProps` is unchanged (still has both `workoutRepository` and
    `exerciseRepository`).
  - The `<ExerciseCard>` and `<ExercisePickerSheet>` call sites no longer pass
    `exerciseRepository`/`workoutRepository` (as applicable) — every other prop on both is
    unchanged, and `loadForEdit`/`workoutRepository.update` call sites elsewhere in the file are
    untouched.

## Task 11 — Verify-only: `RoutineEditorScreen.tsx` needs no change

- Files:
  - `/root/projects/kyro/src/features/routines/RoutineEditorScreen.tsx`
- Changes: **none.** Confirmed by reading the file: its `<ExercisePickerSheet>` call site (near
  the end of the render) already passes only `testID`, `visible`, `onDismiss`, `repository={
  exerciseRepository}`, `mode`, `onAdd`, `onReplace` — it never threaded `workoutRepository`
  through to begin with (this screen's picker context has no natural `WorkoutRepository` in
  scope, per this file's own header). It also never renders `ExerciseCard` at all (uses the
  separate, unaffected `RoutineExerciseCard`). Nothing in Tasks 6–10 changes anything this file
  depends on.
- Acceptance criteria: re-read the file's `<ExercisePickerSheet>` call site before closing this
  task — if it has grown a `workoutRepository` pass since this task list was written, flag a new
  Open Question rather than silently adding scope. Otherwise, confirm zero diff to this file for
  AD-8 purposes.

## Task 12 — Delete `ExerciseDetailSheet.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/ExerciseDetailSheet.tsx` (delete)
- Depends on: Task 6, Task 7 (both of this file's only two call sites must have already dropped
  their imports/renders of it).
- Changes (AD-9): delete the file. Confirmed by grep (and by this task list's own Task 6/Task 7
  edits): `ExerciseCard.tsx` and `ExercisePickerSheet.tsx` were the only two importers anywhere in
  the codebase, and both stop importing it in Tasks 6/7.
- Acceptance criteria:
  - `src/features/workout/ExerciseDetailSheet.tsx` no longer exists.
  - Repo-wide search for `ExerciseDetailSheet` (import or JSX usage) returns zero hits outside
    this PRD's own docs/PRD text.
  - `npx tsc --noEmit` (or the project's equivalent typecheck script) has no dangling-import
    errors referencing this file.

## Task 13 — `ExerciseDetailScreen.test.tsx`: full tab-restructure rewrite

- Files:
  - `/root/projects/kyro/src/features/exercises/__tests__/ExerciseDetailScreen.test.tsx`
- Depends on: Task 5 (the component this file tests).
- Changes (§7, and Open Questions #3 above for the file-wide load-gate issue):
  1. **Generic "screen has loaded" gate**: everywhere this file currently does
     `await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy())` purely to
     know the exercise has resolved (not to assert on About/How-to content specifically) — this
     includes the two "smoke render (both themes)" tests, the "History tab (real content)" test,
     the merged Summary-tab test (see point 3 below), and the not-found test's analog — switch the
     gate to `` await waitFor(() => expect(screen.getByTestId('detail-name')).toBeTruthy()) ``
     (renders unconditionally once `exercise` resolves, regardless of which tab is active or
     still loading its own data).
  2. **"About tab matches real exercise data" describe block** (both `it`s): rename to "How to tab
     matches real exercise data". Since `howto` is no longer the default tab, each test must wait
     for `detail-name`, then `fireEvent.press(screen.getByTestId('detail-tabs-howto'))`, *then*
     assert on the renamed testIDs: `detail-howto`, `detail-howto-type`, `detail-howto-equipment`,
     `detail-howto-primary-muscle-chip`, `detail-howto-secondary-muscle-chip-*`,
     `detail-howto-no-instructions`, `detail-howto-instruction-*` (same suffix shapes as today's
     `detail-about-*`, just with the renamed prefix).
  3. **"tabs switch correctly" test** — rewrite per AD-2 directly:
     ```tsx
     it('shows the Summary tab by default, then switches to History/How to on tab press', async () => {
       const repository = new FakeExerciseRepository([REAL_EXERCISE]);
       await renderScreen(repository, REAL_ID);

       await waitFor(() => expect(screen.getByTestId('detail-name')).toBeTruthy());
       // No workoutRepository passed here -> historyQuery is disabled -> historicalSets is
       // empty -> Summary's default render is the merged empty state.
       expect(screen.getByTestId('detail-summary')).toBeTruthy();

       await fireEvent.press(screen.getByTestId('detail-tabs-history'));
       expect(screen.getByText('No history yet')).toBeTruthy();
       expect(screen.queryByTestId('detail-summary')).toBeNull();

       await fireEvent.press(screen.getByTestId('detail-tabs-howto'));
       expect(screen.getByTestId('detail-howto')).toBeTruthy();

       await fireEvent.press(screen.getByTestId('detail-tabs-summary'));
       expect(screen.getByText('No data yet')).toBeTruthy();
     });
     ```
  4. **"Charts tab (real content)" and "Records tab (real content)" describe blocks merge into
     one "Summary tab (real content)" describe block.** Both existing tests already construct a
     `workoutRepository` fixture with real `EXERCISE_HISTORY_FIXTURE` data (so `historyQuery`
     resolves non-empty and Summary renders `ExerciseSummaryTab`, not the empty state) — combine
     them into fewer tests that, after `await waitFor(() => expect(screen.getByTestId('detail-name'))
     .toBeTruthy())`, assert **both** chart and records content render together (no extra tab
     press needed — Summary is now the default tab):
     - Chart assertions: `detail-summary-chart-metric-heaviest_weight` (and the other 4 metrics
       for `weight_reps`), `detail-summary-chart-chart-plot`, metric-press-updates-`accessibilityState
       .selected` behavior — same assertions as today's Charts test, testID prefix changed from
       `detail-charts-*` to `detail-summary-chart-*`.
     - Records assertions: `detail-summary-records-pr-heaviest_weight` (etc.), the Set Records
       table (`detail-summary-records-set-records-table`, `detail-summary-records-set-record-*`)
       — same assertions as today's Records test, testID prefix changed from `detail-records-*` to
       `detail-summary-records-*`. Keep the `configureRecordsService(...)` fixture setup this test
       needs (records data doesn't come from `workoutRepository`).
     - Keep the `reps_only` metric-narrowing test (`detail-summary-chart-metric-total_reps` present,
       `detail-summary-chart-metric-heaviest_weight` absent) and the assisted-exercise
       least-assistance test (`detail-summary-records-least-assistance`,
       `detail-summary-records-pr-heaviest_weight` absent, `detail-summary-records-set-records-table`
       absent) — both still valid, just with the renamed testID prefixes.
  5. **"History tab (real content)" describe block**: keep as its own block (unchanged tab
     value); switch its load-gate to `detail-name` (point 1), then
     `fireEvent.press(screen.getByTestId('detail-tabs-history'))` as today; `detail-history-*`
     testIDs are unchanged (History tab itself didn't move or rename).
  6. **"not-found / loading" describe block**: unaffected — `detail-not-found` doesn't depend on
     tab state.
  7. **"showBackButton" describe block**: unaffected — asserts on `detail-back` synchronously,
     never touches tab state.
- Acceptance criteria:
  - Every test in this file passes without any wait ever targeting a testID that no longer
    exists (`detail-about`, `detail-charts-*`, `detail-records-*` — all renamed/removed per the
    mapping above).
  - The merged Summary-tab test(s) prove chart and records content render together under one tab
    press (or, since Summary is now default, under no press at all), not as two separate tab
    switches.
  - File still imports/uses `rawDataset`, `FakeExerciseRepository`, `configureRecordsService`
    exactly as before — no fixture-construction logic changes, only testID/tab-value/describe-title
    updates.

## Task 14 — `ExerciseDetailScreen.actions.test.tsx`: spot-check (expected: no changes needed)

- Files:
  - `/root/projects/kyro/src/features/exercises/__tests__/ExerciseDetailScreen.actions.test.tsx`
- Changes: **none expected.** Read in full while grounding this task list: every test in this
  file gates on `detail-edit`, `detail-name`, `detail-menu`, `detail-actions-*` — none of them
  wait on `detail-about`/`detail-charts-*`/`detail-records-*`, and none assert on tab order or
  tab-row position. This file's own `renderDetail` helper never passes `workoutRepository`
  either, so it's unaffected by the `historyQuery`/`historicalSets` gating change in Task 5.
- Acceptance criteria: run this file's suite after Task 5 lands and confirm all tests still pass
  with zero edits. If any test unexpectedly fails, it means this file relies on something not
  identified here (e.g. an implicit tab-order assumption) — investigate and fix minimally rather
  than silently expanding this task's scope.

## Task 15 — `ExerciseCard.test.tsx`: name-tap → `router.push` assertion

- Files:
  - `/root/projects/kyro/src/features/workout/__tests__/ExerciseCard.test.tsx`
- Depends on: Task 6.
- Changes (§7, Open Questions #2):
  1. Add, near the top (this file currently has **no** `expo-router` mock at all):
     ```tsx
     import { router } from 'expo-router';

     jest.mock('expo-router', () => ({
       ...jest.requireActual('expo-router'),
       router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
     }));
     ```
     (Same pattern this codebase already uses in `ExerciseDetailScreen.actions.test.tsx` and
     `ExerciseCard.operations.test.tsx`.)
  2. Replace the `'tapping the name opens the read-only exercise detail sheet'` test:
     ```tsx
     it('tapping the name calls router.push to the full-screen exercise detail route', async () => {
       const fixture = await setup();
       await renderCard(fixture);
       await fireEvent.press(screen.getByTestId('card-name'));
       expect(router.push).toHaveBeenCalledWith(`/exercise/${fixture.exercise.id}`);
     });
     ```
  3. **Delete the `'M4-09: opening the detail sheet mid-workout ... never mutates the active
     workout'` test entirely** (currently spans roughly the "chrome" describe block's longest
     test). Its entire premise — driving real History/Charts/Records content through a
     locally-rendered sheet and asserting the active workout is untouched — no longer applies:
     after AD-7, `ExerciseCard`'s name-tap renders nothing locally at all (pure `router.push`), so
     there is no local sheet content left to drive or assert against. This isn't a "modify the
     assertions" case — the whole test's reason to exist is gone. (The underlying "browsing an
     exercise's history/records must never mutate the active workout" property still holds, but
     it's now structurally guaranteed by the fact that `/exercise/[id]` is a different route/screen
     with its own repositories — no `ExerciseCard`-level regression is even possible to construct
     anymore, so no replacement test is needed here.)
  4. After deleting that test, check whether `configureRecordsService` (imported from
     `@/features/stats/records-service`) is still used anywhere else in this file — it was only
     used inside the deleted test. If unused, remove the import.
  5. `renderCard`'s `props` object and its `Partial<ExerciseCardProps>` overrides type no longer
     accept `workoutRepository`/`exerciseRepository` as of Task 6's `ExerciseCardProps` change —
     confirm no other test in this file passes either as an override (the deleted test was the
     only one that did, via `{ workoutRepository: fixture.workoutRepo }`); if any remain, remove
     them.
- Acceptance criteria:
  - `router.push` is asserted with the exact string `` `/exercise/${fixture.exercise.id}` `` (not
    an object literal) — matching `ExerciseCard.tsx`'s own `as never`-cast call.
  - No test in this file references `card-detail-sheet` or `card-detail-sheet-content-*` testIDs
    anywhere (all gone, since the sheet no longer exists).
  - File compiles and the full suite passes; no unused imports remain.

## Task 16 — `ExerciseCard.operations.test.tsx`: stale mock-rationale comment

- Files:
  - `/root/projects/kyro/src/features/workout/__tests__/ExerciseCard.operations.test.tsx`
- Changes (§7): the file-header comment above `jest.mock('@/lib/files');` currently reads:
  > `` `ExerciseCard`'s name-tap opens `ExerciseDetailSheet` -> the real `ExerciseDetailScreen`,
  > which imports `@/lib/files` ... `` ``
  After Task 6, `ExerciseCard`'s name-tap no longer imports `ExerciseDetailSheet` or
  `ExerciseDetailScreen` at all (direct or transitive) — that import chain is gone from this
  file's module graph. Per the PRD's own guidance for this exact seam ("the mock may be safely
  removable, but leaving it in place is harmless if unverified"): either (a) remove the now-stale
  comment and the `jest.mock('@/lib/files')` line together, if a quick check confirms nothing else
  in this file's render path (`ActiveWorkoutScreen` → `ExercisePickerSheet` → ... ) still needs
  it, or (b) at minimum, update the comment so it no longer cites a deleted file/removed import
  chain as the rationale. Prefer (a) if the check is quick; (b) is an acceptable fallback if
  there's any doubt.
- Note: this file also needs the `useFocusEffect` mock addition — that's covered by Task 18
  (folded in there with the other `ActiveWorkoutScreen`/`EditWorkoutScreen`/`RoutineEditorScreen`
  mounters), not repeated here.
- Acceptance criteria: no comment in this file cites `ExerciseDetailSheet` as a rationale for
  anything; the `@/lib/files` mock (if kept) has an accurate or removed rationale comment; the
  full suite still passes.

## Task 17 — New test file: `ExercisePickerSheet.test.tsx`

- Files:
  - `/root/projects/kyro/src/features/workout/__tests__/ExercisePickerSheet.test.tsx` (new —
    confirmed no file currently exists at this path)
- Depends on: Task 7.
- Changes (§7): this component has no dedicated test file today; AD-4's suspend/restore mechanism
  is new and specific enough to deserve direct coverage, not just indirect coverage via
  `ActiveWorkoutScreen`/`EditWorkoutScreen`/`RoutineEditorScreen`'s own suites. Model the file on
  `ExercisePickerSheet.tsx`'s own props/testID shape and this repo's established
  render-with-`QueryClientProvider`-and-`ThemeProvider` convention (see `ExerciseCard.test.tsx`
  for the pattern). At minimum:
  1. `jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push:
     jest.fn(), back: jest.fn(), replace: jest.fn() }, useFocusEffect: (callback: () => void) =>
     callback() }));` — note this file needs the `useFocusEffect` override from day one (it's a
     brand-new file, not a fallout fix), executing the focus callback synchronously so the
     suspend/restore assertions below can drive it directly.
  2. A fake `ExerciseRepository` (`list()`/`recentlyUsed()` returning a couple of fixture
     exercises is enough — reuse or adapt `FakeExerciseRepository` from
     `src/features/exercises/__tests__/exercise-fixtures.ts` if its shape fits, otherwise a
     minimal inline fake).
  3. Test 1 — ⓘ press suspends the sheet and navigates: render with `mode="add"`, `visible={true}`;
     press an exercise row's info button (`` `${testID}-list` ``'s row → `ExerciseRow`'s own info
     affordance, or drive `handleInfoPress` indirectly via whatever testID `ExerciseRow` exposes
     for it — check `ExerciseRow.tsx` for the exact testID before writing this assertion); assert
     `router.push` was called with `` `/exercise/${exerciseId}` `` and that
     `screen.queryByTestId(testID)` (the `Sheet`'s own testID, which only renders while `visible`
     is true) becomes `null` immediately after.
  4. Test 2 — return-to-focus restores the sheet with state intact: from the same render, select
     one or two exercises first (so `selectedIds`/the counter `${testID}-counter` has a non-zero
     value) and type into the search bar (`${testID}-search`), *then* press ⓘ on a different row,
     *then* simulate the screen regaining focus (since `useFocusEffect`'s mock above already runs
     the callback synchronously on every render, re-rendering the component or explicitly invoking
     the effect is enough) — assert the `Sheet` becomes visible again (`screen.getByTestId(testID)`
     truthy) and `` `${testID}-counter` ``/the search bar's value are unchanged from before the ⓘ
     press.
- Acceptance criteria:
  - Both tests above pass against the real `ExercisePickerSheet.tsx` post-Task-7.
  - No test in this new file needs a real `WorkoutRepository` fixture (the prop no longer exists
    on this component after Task 7).

## Task 18 — `useFocusEffect` mock fallout across every test that mounts `ExercisePickerSheet`

- Files (8 total — 6 named in PRD §7, plus 2 more found by grepping every test that renders
  `<ActiveWorkoutScreen>`/`<EditWorkoutScreen>`/`<RoutineEditorScreen>` directly — see Open
  Questions #1):
  - `/root/projects/kyro/src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/ActiveWorkoutScreen.minimize.test.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/ActiveWorkoutScreen.smart-scroll.test.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/ActiveWorkoutScreen.pr-banner.test.tsx`
    (**not** named in PRD §7 — see Open Questions #1)
  - `/root/projects/kyro/src/features/workout/__tests__/EditWorkoutScreen.test.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/keyboard-flow.test.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/ExerciseCard.operations.test.tsx`
    (**not** named in PRD §7 — see Open Questions #1; this is the same file as Task 16, but that
    task only covers its stale comment — this task covers its mock addition)
  - `/root/projects/kyro/src/features/routines/__tests__/RoutineEditorScreen.test.tsx` (also gets
    the stale-comment fix below, folded into this same task since it's the same file edit)
- Depends on: Task 7 (this is fallout from AD-4 landing).
- Changes (§7): all 8 files currently have the identical block:
  ```tsx
  jest.mock('expo-router', () => ({
    ...jest.requireActual('expo-router'),
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  }));
  ```
  This spreads in the **real** `useFocusEffect` from `jest.requireActual('expo-router')`, which
  calls through to `@react-navigation/native`'s `useFocusEffect` — that throws without a real
  `NavigationContainer` ancestor (these tests all render screens directly via RNTL `render()`).
  Since `ExercisePickerSheet`'s new `useFocusEffect` call (Task 7) is unconditional on mount, every
  one of these 8 files will crash as soon as it renders `<ActiveWorkoutScreen>` /
  `<EditWorkoutScreen>` / `<RoutineEditorScreen>` at all — not only in tests that open the picker.
  In **each** of the 8 files, add a `useFocusEffect` override alongside the existing `router`
  override:
  ```tsx
  jest.mock('expo-router', () => ({
    ...jest.requireActual('expo-router'),
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useFocusEffect: (callback: () => void) => callback(),
  }));
  ```
  (A synchronous "just call it" no-op — matches this component's own effect body, which takes no
  cleanup return and has no dependency-driven re-run behavior worth simulating here.)

  Additionally, in `RoutineEditorScreen.test.tsx` only, update the stale comment above
  `jest.mock('@/lib/files')`:
  > `` `ExercisePickerSheet` -> `ExerciseDetailSheet` -> `ExerciseDetailScreen` -> `@/lib/files`
  > (native-only top-level imports, unavailable under Jest, 08 §5) — same convention
  > `ExerciseCard.test.tsx` already uses. ``
  to reflect the new, simpler chain with `ExerciseDetailSheet` removed from it (e.g.: `` `
  ExercisePickerSheet`'s ⓘ-button push targets `/exercise/[id]`, which is a separate route/screen
  outside this test's render tree — this mock is retained defensively / [update per whatever this
  file's actual remaining import chain requires; verify before landing] ``). Verify first whether
  `@/lib/files` is still transitively reachable from anything this file renders (it likely is not,
  post-AD-9) and adjust the comment (or remove the mock, per the same "harmless if unverified"
  latitude as Task 16) accordingly.
- Acceptance criteria:
  - All 8 files' suites pass after Task 7 lands (before this task, every one of them would crash
    on mount inside `ExercisePickerSheet`'s `useFocusEffect` call).
  - `RoutineEditorScreen.test.tsx`'s comment above `jest.mock('@/lib/files')` no longer references
    the deleted `ExerciseDetailSheet.tsx`.
  - No other behavioral change in any of these 8 files — this is a pure test-infrastructure fix.

## Task 19 — Spot-check-only files: verify no stale rationale comments

- Files (verified while grounding this task list — see below):
  - `/root/projects/kyro/src/data/exercises/__tests__/duplicate-as-custom.test.ts`
  - `/root/projects/kyro/src/features/measurements/__tests__/LogEntrySheet.test.tsx`
  - `/root/projects/kyro/src/features/exercises/__tests__/ArchivedExercisesScreen.test.tsx`
  - `/root/projects/kyro/src/features/exercises/__tests__/ExerciseFormScreen.test.tsx`
  - `/root/projects/kyro/src/features/exercises/__tests__/ExerciseBrowseScreen.test.tsx`
  - `/root/projects/kyro/src/features/workout/__tests__/AddWarmUpSetsSheet.test.tsx`
- Changes: **none expected.** Each file was grepped for `ExerciseDetailSheet`/`ExerciseDetailScreen`/
  `ExercisePickerSheet`/`ExerciseCard` while grounding this task list. Every hit found is a
  same-pattern-as comment (e.g. `` "same pattern `ExerciseDetailScreen.test.tsx`'s ... uses" `` or
  `` "not the repository posture `ExerciseDetailScreen.test.tsx` uses" ``) — none of them assert on
  sheet-vs-full-screen behavior, reference the deleted `ExerciseDetailSheet.tsx` by name, or
  depend on anything this PRD changes. No edits are expected in any of these 6 files.
- Acceptance criteria: re-run the same grep (`ExerciseDetailSheet|ExerciseDetailScreen|
  ExercisePickerSheet|ExerciseCard`) against each file once Tasks 1–18 have landed; confirm no new
  stale reference to `ExerciseDetailSheet.tsx` (the deleted file) was introduced, and each file's
  own test suite still passes unmodified.

## Summary of what requires you (not a dev agent)

- **On-device visual QA against the three Hevy reference screenshots** (PRD §8 item 1) — this
  task list nails down structural/ordering parity (tab position, chip position below the chart,
  3-tab set, single-scroll Summary section) but doesn't prescribe exact spacing/density values
  beyond reusing the existing spacing scale. A side-by-side look at a real device/simulator is the
  only way to confirm the result reads as "Hevy-adjacent" rather than just "technically matching
  the bullet points."
- **`useFocusEffect` is a first-of-its-kind pattern in this codebase** (PRD §8 item 2) — AD-4's
  suspend/restore mechanism (Task 7) is the riskiest new piece of this PRD from a
  "does-it-actually-work-on-device" standpoint, and Jest coverage (Tasks 17/18) can only prove the
  mocked callback wiring is correct, not that `@react-navigation/native`'s real focus lifecycle
  fires it at the right moments on iOS/Android. Worth a deliberate manual pass: open the exercise
  picker mid-workout, select a couple of exercises, tap ⓘ on another row, confirm the detail
  screen opens full-screen with a working back button, tap back, confirm the picker reappears with
  the same selections and search/filter state intact (and note the accepted cosmetic re-slide-up
  animation on return — that's expected, not a bug).
- **`showBackButton` prop cleanup (AD-10) is explicitly deferred, not part of this task list** (PRD
  §8 item 3) — decide at your convenience whether it's worth a follow-up pass once PRD A's
  full-screen-conversion-policy work is further along; Task 5 only verifies the prop is
  unaffected today, it does not remove it.
- **Two test files not named in PRD §7's fallout list** (`ActiveWorkoutScreen.pr-banner.test.tsx`,
  `ExerciseCard.operations.test.tsx`) turned out to need the same `useFocusEffect` mock fix as the
  6 PRD names — folded into Task 18 above. Worth a quick acknowledgment that the PRD's own
  enumeration undercounted by 2; no scope or design implication, purely a test-infrastructure
  completeness note.
- **Nothing else requires you.** This is a design-only-derived, purely mechanical/structural
  implementation task list — no external services, secrets, accounts, or manual infra approvals
  are needed for any of the 19 tasks above.
