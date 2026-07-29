# PRD — Exercise Detail: Full-Screen Conversion + Summary Tab Merge

Sub-project **E** of the Hevy-style UI/UX overhaul (8-PRD decomposition). Depends on **A**
(`sheet-header-footer-foundation`). Consumed by nothing downstream — this is a leaf.

**Status of dependency A at authoring time:** `docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/PRD.md`
does not exist yet (checked; directory `2026-07-28/` contained no sibling folders at authoring
time). This PRD proceeds against the *description* of PRD A given in its own task brief (a shared
`SheetHeader`/footer/"full-screen-conversion-policy" API for sheets across the app) and does not
end up needing any part of that API — see Architecture Decision 1 for why, and Open Question 1
for the explicit reconciliation note.

---

## 1. Problem

`ExerciseDetailScreen.tsx` (the real exercise-detail UI: media, name, tabbed content) is already
built to work both as a pushed full-screen route (`app/exercise/[id].tsx`) and as sheet-embedded
content (`showBackButton={false}`). Two mid-workout call sites use the sheet-embedded form via a
thin wrapper, `ExerciseDetailSheet.tsx`:

- `ExerciseCard.tsx` — tapping an exercise's name (accent text) opens it in a `Sheet`
  (`detent="full"`, 90% height, slide-up-from-bottom, grabber, rounded top corners).
- `ExercisePickerSheet.tsx` — tapping the ⓘ info icon on a row opens the *same* sheet, nested
  **inside** the picker's own `Sheet` (`detent="full"`). This is a sheet stacked on top of a
  sheet: two grabbers, two rounded-corner frames, two slide-up animations, one on top of the
  other.

The user's ask is explicit: this should not be a slide-up sheet at all — it should be a genuine
full-screen page with a top-left back button (the exact chrome `ExerciseDetailScreen.tsx`
already has behind `showBackButton={true}`, unused today by either sheet call site). The user
also wants the tab row moved to the top of the screen, and the tab set collapsed from the current
four (About / History / Charts / Records) to the three they actually described: **Summary** (a
timeseries chart with a metric switcher — Heaviest Weight, Best 1RM, Best Set Volume, Best Session
Volume — plus the PR/records data that today lives in a separate Records tab), **History**
(unchanged), **How to** (today's About tab, renamed).

This PRD owns the harder half of that conversion: the exercise picker → exercise detail chain,
which is a *sheet nested inside a sheet*, not a sheet on top of a plain screen. PRD A explicitly
defers this specific conversion here.

## 2. Goals

1. Both `ExerciseCard`'s name-tap and `ExercisePickerSheet`'s ⓘ-button open the real, full-screen
   `/exercise/[id]` route (or a chrome-identical equivalent — see Architecture Decision 4 for why
   the picker case needs a slightly different transport mechanism) instead of a `Sheet`.
2. `ExerciseDetailScreen.tsx`'s tab row moves to sit directly under the header (back/edit/menu)
   row, above the media — "at the top" per the user's literal wording, and matching the Hevy
   reference screenshot's layout.
3. Tabs become exactly **Summary / History / How to** (3, not 4) — Charts and Records merge into
   one Summary tab; About is renamed How to with no content change.
4. Summary shows the existing chart (metric-chip selector + `LineChart`, all four requested
   metrics already present) plus the existing Records content (PR cards, Set Records table,
   least-assistance line) as one scrollable section, not two.
5. `ExerciseDetailSheet.tsx` is deleted; no dead sheet-wrapper code remains.
6. All three entry points to this screen (mid-workout name-tap, exercise-picker ⓘ, standalone
   Browse-tab push) end up rendering the *same* component in the *same* full-screen chrome.

## 3. Non-Goals

- No change to `AboutTab`'s (renamed `HowToTab`) or `ExerciseHistoryTab`'s content or logic beyond
  the rename and (for `HowToTab`) a file-location change.
- No new chart types, no charting-library change — `victory-native` / `src/ui/charts/*` stay
  exactly as they are; this PRD only re-arranges existing `ExerciseChartsTab`/`ExerciseRecordsTab`
  output inside a new composing component.
- No sharing/social UI — the Hevy screenshots' share-sheet and "Nice work!" finish-summary screen
  are explicitly out of scope; those screenshots were referenced for spacing/layout parity on the
  detail screen only.
- No new `RecordsSnapshot` field (`bestSessionVolumeKg`) — see Architecture Decision 6.
- No change to `domain/exercise-charts.ts` or `domain/records.ts` computation logic — both are
  reused as-is.
- No change to `Sheet.tsx` itself (grabber/detent/animation mechanics) — that component's chrome
  is PRD A's territory; this PRD works within its current API.
- Does not touch `RoutineExerciseCard.tsx` / `RoutineEditorScreen.tsx`'s own exercise-editing UI
  beyond what's mechanically required by `ExercisePickerSheet`'s prop-surface changes (confirmed:
  none required — see Architecture Decision 8).

## 4. Architecture Decisions

### AD-1 — No dependency on PRD A's SheetHeader/footer API

PRD A's brief (per this task's own background) is a shared `SheetHeader`/footer/full-screen-
conversion-policy API for sheets that get promoted to full screens. This PRD's two converted call
sites end up needing none of it:

- `ExerciseCard`'s name-tap becomes a plain `router.push` to the already-full-screen
  `/exercise/[id].tsx` route, whose header (back chevron / Edit / ⋯ menu) is
  `ExerciseDetailScreen.tsx`'s own pre-existing chrome — not a sheet header at all once converted.
- `ExercisePickerSheet`'s ⓘ button (see AD-4) stays inside `ExercisePickerSheet`'s *own*,
  unchanged `Sheet` — that sheet's own header (title / Cancel button) is untouched, and the
  nested `ExerciseDetailScreen` swap-in reuses that same pre-existing back-chevron chrome too.

**[RESOLVED]** No reconciliation needed against PRD A's shared header component today. If PRD A
later introduces a `SheetHeader` component that other sheets (including `ExercisePickerSheet`'s
title/Cancel row) migrate to, that migration can happen independently of this PRD — nothing here
is coupled to `ExercisePickerSheet`'s current hand-rolled title row.

### AD-2 — Tab restructure: `ExerciseDetailScreen.tsx`

`DETAIL_TABS` goes from 4 entries to 3, values renamed, default tab changes to the new first tab:

```tsx
// BEFORE
const DETAIL_TABS = [
  { value: 'about', label: 'About' },
  { value: 'history', label: 'History' },
  { value: 'charts', label: 'Charts' },
  { value: 'records', label: 'Records' },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['value'];
// ...
const [tab, setTab] = useState<DetailTab>('about');

// AFTER
const DETAIL_TABS = [
  { value: 'summary', label: 'Summary' },
  { value: 'history', label: 'History' },
  { value: 'howto', label: 'How to' },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['value'];
// ...
const [tab, setTab] = useState<DetailTab>('summary');
```

Order and default match both the user's literal list ("Summary, History, How to") and the Hevy
reference screenshot (`Img-4775-4776-4777`), which shows the identical three-tab set, in the same
order, with Summary active by default.

The tab-content ternary collapses from 4 branches (about/history/charts/records) to 3
(summary/history/howto). The `summary` branch replaces the separate `charts`/`records` branches
with one `ExerciseSummaryTab` (AD-5), gated on the *same* `historyQuery.isLoading` /
`historicalSets.length === 0` check both former branches already used independently (records are
derived from the same set data, so "no historical sets" correctly implies "no records" too — no
new gating condition needed):

```tsx
// AFTER (summary branch)
) : tab === 'summary' ? (
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
) : tab === 'howto' ? (
  <HowToTab exercise={exercise} testID={`${testID}-howto`} />
) : (
  ...
```

`DetailEmptyTab`'s `tab` union narrows from `'history' | 'charts' | 'records'` to
`'history' | 'summary'`, with the two removed cases' copy merged into one: title "No data yet",
caption "Charts and records appear once you've logged a few sessions." (same "no doc-specified
copy, wrote reasonable placeholder text" precedent the file's own header already established for
History/Charts).

**Tab-row position** moves from *after* the media/name block to *before* it — directly under the
header row (back/Edit/⋯), matching the user's explicit "those should be at the top as well" and
the Hevy screenshot's layout (tabs sit right under the nav bar, above the exercise illustration):

```tsx
// BEFORE (render order inside the success branch)
<ExerciseMedia ... />
<Text ...>{exercise.name}</Text>
<SegmentedControl testID={`${testID}-tabs`} options={DETAIL_TABS} value={tab} onChange={setTab} ... />
<View style={{ flex: 1, marginTop: spacing['2'] }}>{/* tab content */}</View>

// AFTER
<SegmentedControl testID={`${testID}-tabs`} options={DETAIL_TABS} value={tab} onChange={setTab}
  style={{ marginHorizontal: spacing['4'], marginTop: spacing['1'] }} />
<ExerciseMedia ... />
<Text ...>{exercise.name}</Text>
<View style={{ flex: 1, marginTop: spacing['2'] }}>{/* tab content */}</View>
```

The header row's own conditional gating (`showBackButton || exercise`) and the loading/not-found
branches above it are unchanged — tabs still only render once `exercise` has resolved, same as
today.

**[RESOLVED]** Not duplicating the exercise name into the header row itself, even though Hevy's
screenshot shows the name twice (once small/centered in the nav bar, once large under the media).
Adding a header-bar title is exactly the kind of shared-chrome concern PRD A's `SheetHeader`
work is meant to standardize; doing it here piecemeal would risk conflicting with that PRD's own
title-slot design. Single (large, under-media) name display stays as today.

### AD-3 — `AboutTab` extraction → `HowToTab.tsx`

`AboutTab` is currently defined inline inside `ExerciseDetailScreen.tsx` (lines 115–196). Every
other tab (`ExerciseHistoryTab`, `ExerciseChartsTab`, `ExerciseRecordsTab`) already lives in its
own file. Extracted verbatim (content/logic byte-identical — only the component name and file
location change, satisfying the "no change beyond the rename" non-goal) to
`src/features/exercises/HowToTab.tsx`:

```tsx
// NEW FILE: src/features/exercises/HowToTab.tsx
export interface HowToTabProps {
  exercise: Exercise;
  testID: string;
}
export function HowToTab({ exercise, testID }: HowToTabProps): React.JSX.Element {
  // identical body to today's inline `AboutTab` — type/equipment/muscle chips/instructions list
}
```

`ExerciseDetailScreen.tsx` drops the inline definition and imports `HowToTab` alongside its other
tab imports.

### AD-4 — Nested-in-a-sheet conversion: `ExercisePickerSheet.tsx`'s ⓘ button

This is the conversion PRD A explicitly deferred here, and the one genuinely hard part of this
PRD. The constraint that makes it hard: `Sheet.tsx` presents via React Native's `<Modal>`, which
always renders in its own top-level native layer, **above** the JS-side navigation stack —
`router.push`-ing a new route while a `Modal` is open does not visually show the new screen; the
still-open `Modal` stays on top, obscuring it. So the naive "swap `setDetailExerciseId(...)` for
`router.push(...)`" does not work while `ExercisePickerSheet`'s own `Sheet` stays mounted.

Two options were weighed:

- **(a) Dismiss-then-push.** Call the picker's own `onDismiss()` before `router.push`. Simple,
  zero new mechanism, but destroys `ExercisePickerSheet`'s local state (`selectedIds`, `superset`,
  `searchInput`, `muscleFilter`, `equipmentFilter`) on unmount (`Sheet`'s own header: "the whole
  tree ... only mounts while visible is true"). For `mode="add"`, a user who already checked
  several exercises and then taps ⓘ on one more to peek at it would lose every prior selection —
  a real, user-visible regression against today's behavior (today, dismissing the nested detail
  sheet returns to the still-open picker with its selection intact).
- **(b) Suspend, don't unmount.** Keep `ExercisePickerSheet`'s own component instance mounted
  throughout; only its *rendered* `Sheet` (the `Modal` layer) is temporarily hidden while the
  pushed detail route is on screen, and restored via `useFocusEffect` when the underlying screen
  (whichever of `ActiveWorkoutScreen` / `EditWorkoutScreen` / `RoutineEditorScreen` opened the
  picker) regains focus. Since `selectedIds` etc. live in `ExercisePickerSheet`'s own `useState`,
  above the `<Sheet>` it renders, hiding only the `<Sheet>` (not unmounting the component that
  owns that state) preserves everything with zero extra taps required to resume.

**[RESOLVED: option (b).]** The state-loss in (a) is a real regression of an existing, named
feature ("info button opens detail without selecting" — `ExercisePickerSheet.tsx`'s own file
header), and this codebase's evident bar for not silently regressing existing behavior (see
`docs/plan/EXECUTION-LOG.md`'s M5 milestone-review fixes) argues against accepting it just to
avoid one new hook. (b) still uses genuine `router.push('/exercise/${id}')` to the real
`/exercise/[id]` route — satisfying "converging on the same full-screen route behavior" exactly
like `ExerciseCard`'s call site — it just also arranges for the picker's own sheet to reappear,
state intact, when the user comes back.

```tsx
// ExercisePickerSheet.tsx — BEFORE
const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
// ...
const handleInfoPress = useCallback((exercise: Exercise) => {
  setDetailExerciseId(exercise.id);
}, []);
// ...
return (
  <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
    {/* ...picker content... */}
    <ExerciseDetailSheet
      testID={`${testID}-detail-sheet`}
      visible={detailExerciseId != null}
      onDismiss={() => setDetailExerciseId(null)}
      repository={repository}
      workoutRepository={workoutRepository}
      exerciseId={detailExerciseId}
    />
  </Sheet>
);

// ExercisePickerSheet.tsx — AFTER
import { router, useFocusEffect } from 'expo-router';
// ...
const [isNavigatingToDetail, setIsNavigatingToDetail] = useState(false);

// Restores the picker's own Sheet (and, by never having unmounted this
// component, its search/filter/selection state) whenever the screen that
// opened this picker regains focus — including the return trip from the
// `/exercise/[id]` push `handleInfoPress` below triggers. Runs on every
// focus (including the picker's own first mount), which is a harmless
// no-op `setState(false)` on any focus unrelated to this flow.
useFocusEffect(
  useCallback(() => {
    setIsNavigatingToDetail(false);
  }, []),
);

const handleInfoPress = useCallback((exercise: Exercise) => {
  setIsNavigatingToDetail(true);
  router.push(`/exercise/${exercise.id}` as never);
}, []);
// ...
return (
  <Sheet
    visible={visible && !isNavigatingToDetail}
    onDismiss={onDismiss}
    detent="full"
    testID={testID}
  >
    {/* ...picker content, unchanged... */}
  </Sheet>
);
```

The `<ExerciseDetailSheet>` render and its import are removed entirely from this file.

**Known, accepted cosmetic tradeoff:** `Sheet` replays its 250 ms slide-up entrance animation on
every mount (`Sheet.tsx`'s own header: "this always starts its entrance animation from off-screen
on mount"). Toggling `visible` false→true on return means the picker sheet re-slides-up rather
than instantly reappearing. **[RESOLVED]** Accepted as-is — fixing it would mean adding a
"resume without re-animating" mode to `Sheet.tsx` itself, which is PRD A's component to change,
not this PRD's. The regression this avoids (full state loss) is far more visible than one extra
quick re-slide.

`ExercisePickerSheet.tsx`'s own `workoutRepository` prop **stays** — it's no longer routed to a
child `<ExerciseDetailSheet>`, but it was never used for anything else either; it becomes fully
dead here and should be removed too (see AD-8). Wait — reconciled below: since this design no
longer renders `ExerciseDetailScreen` locally at all (real route handles its own repository
construction), `workoutRepository` is dead exactly like `ExerciseCard`'s copy. See AD-8 for the
full prop-cleanup ledger.

### AD-5 — `ExerciseSummaryTab.tsx` (new): merging Charts + Records

New file, `src/features/exercises/ExerciseSummaryTab.tsx`, composes the existing
`ExerciseChartsTab` output and the existing `ExerciseRecordsTab` output inside **one** scrollable
container (today, `ExerciseChartsTab` self-scrolls in its own `ScrollView` and `ExerciseRecordsTab`
renders a plain, non-scrolling `flex: 1` `View` — stacking both under one parent as-is would
either double-nest `ScrollView`s or silently clip `ExerciseRecordsTab`'s content, since a bare
`flex: 1` child inside a `ScrollView`'s content area is a known RN layout footgun, not a
correctness issue this PRD can leave in place).

```tsx
// NEW FILE: src/features/exercises/ExerciseSummaryTab.tsx
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
  historicalSets, exercise, weightUnit, distanceUnit, warmupInStats, snapshot,
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
      <Text style={[typography.footnote, { color: colors.text.tertiary, marginTop: spacing['5'], marginBottom: spacing['2'] }]}>
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

Two small, mechanical companion changes make the two child components composable this way without
touching their computation logic:

- **`ExerciseChartsTab.tsx`** — root element changes from `<ScrollView testID=... contentContainerStyle={{padding: spacing['4']}}>` to a plain `<View testID={...}>` (no padding — the parent `ScrollView` now owns it). `ExerciseChartsTab` has no other consumer after this change (its only caller was `ExerciseDetailScreen`'s now-removed `charts` branch), so this is an unconditional change, not a new `scrollable` prop — simpler surface, no dead flag to carry.
- **`ExerciseRecordsTab.tsx`** — root `<View testID={testID} style={{ flex: 1, padding: spacing['4'] }}>` drops `flex: 1` (keeps `padding`). It has no other consumer either (same reasoning), so this is also unconditional.

**Visual-parity choice (chip position):** the Hevy reference screenshot (`Img-4775-4776-4777`)
shows the metric chip row **below** the chart, not above it (today's `ExerciseChartsTab` order).
**[RESOLVED]** Reorder chips to render after the `LineChart` inside `ExerciseChartsTab`, matching
the screenshot exactly — a pure JSX reorder, zero logic change.

### AD-6 — Metric selector stays Chips; no `bestSessionVolumeKg` addition

Two decisions the task brief explicitly asked to make with justification:

**Chips vs. a real dropdown.** The user's ask floated "(maybe a dropdown)" tentatively. The Hevy
reference screenshot (`Img-4775-4776-4777`) settles this directly: Hevy's own metric selector is a
horizontally-scrollable pill/chip row (Heaviest Weight / One Rep Max / Best Set Volume / Session
Volume / Total Rep…), not a native picker/dropdown. **[RESOLVED]** Keep `Chip` (unchanged from
today's `ExerciseChartsTab`) — it already matches the product this PRD is asked to match, and
`weight_reps`'s 5-option case (04 §4.3's own table) would not fit a fixed-width
`SegmentedControl` legibly, exactly as `ExerciseChartsTab`'s own file header already reasoned.

**`bestSessionVolumeKg` on `domain/records.ts`.** The user listed "Best Session Volume" as one of
four graph-selectable metrics, not as a fifth PR-card type. `domain/exercise-charts.ts`'s
`session_volume` chart metric already covers this exactly — the merged Summary tab's chart already
lets a user select it and see the trend, satisfying the ask as stated. **[RESOLVED]** No new
`RecordsSnapshot` field. Adding one would mean inventing a "best single session's total volume"
record type nowhere in `04-feature-spec-routines-history-stats.md §5.1`'s table, changing
`applyRecordSet`'s eligibility switch, and adding a new trophy card — real new scope the user's
literal ask (a graph option) doesn't require.

**No "current big value" headline above the chart, despite Hevy showing one** (e.g. "700 kg
Dec 3" above the One-Rep-Max chart). **[RESOLVED, not adding]** Computing a *correct* single
"current" number per metric is not a trivial re-read of existing data: `computeChartSeries`
buckets are per-date bests/sums, not a running cumulative best, so "the latest point" is not the
same number as "the all-time best" for a best-of metric (a user's most recent 1RM can be lower
than an earlier peak). `RecordsSnapshot` *does* track true all-time bests, but only for 5 of the
9 chart metrics, and its `mostReps` field (best single set's rep count) is not the same quantity
as the chart's `total_reps` (a per-date sum) despite the name overlap. Building a correct 9-way
metric→headline-value mapping is new derivation logic this task's non-goals ("do not build new
chart types") argue against inventing casually, and a wrong number here is worse than no number.
The existing `LineChart`'s own `title={CHART_METRIC_LABELS[activeMetric]}` already labels which
metric is active; that stays as the only "what am I looking at" affordance.

**No change to the range control** (`SegmentedControl`, 3M/1Y/All) despite Hevy using a "Year ▾"
dropdown there. **[RESOLVED]** The user's ask was specifically about the *metric* selector, not
the range control; changing the latter is unrequested scope.

### AD-7 — `ExerciseCard.tsx`: name-tap → `router.push`

```tsx
// BEFORE
const [detailVisible, setDetailVisible] = useState(false);
// ...
<Pressable testID={`${testID}-name`} ... onPress={() => setDetailVisible(true)} style={{ flex: 1 }}>
  <Text ...>{exercise.name}</Text>
</Pressable>
// ...
<ExerciseDetailSheet
  testID={`${testID}-detail-sheet`}
  visible={detailVisible}
  onDismiss={() => setDetailVisible(false)}
  repository={exerciseRepository}
  workoutRepository={workoutRepository}
  exerciseId={exercise.id}
/>

// AFTER
import { router } from 'expo-router';
// (no detailVisible state)
<Pressable testID={`${testID}-name`} ... onPress={() => router.push(`/exercise/${exercise.id}` as never)} style={{ flex: 1 }}>
  <Text ...>{exercise.name}</Text>
</Pressable>
// (no ExerciseDetailSheet render)
```

`ExerciseCard` is never rendered inside a `Sheet`'s `Modal` (it lives in `ActiveWorkoutScreen` /
`EditWorkoutScreen`'s plain exercise list, both routes, not sheets) — no nested-Modal conflict
here, so the plain, direct `router.push` from AD-4's option (a) is exactly right for this call
site, with no state to lose (nothing about the active workout is stored inside `ExerciseCard`'s
own component state; the workout itself lives in `activeWorkoutStore`, a Zustand store, which
survives regardless of which screen is focused).

### AD-8 — Dead-prop cleanup (repository threading)

Both `exerciseRepository` and `workoutRepository` on `ExerciseCardProps`, and `workoutRepository`
on `ExercisePickerSheetProps`, existed *solely* to feed the now-deleted `ExerciseDetailSheet`
(confirmed by grep — no other use in either file). Once both call sites route through
`router.push` (which lets `app/exercise/[id].tsx` construct its own `ExerciseRepositoryImpl` /
`WorkoutRepositoryImpl` via `getAppDriver()`, exactly as it already does for the standalone Browse
entry point), these props become fully dead. Per this codebase's stated "prefer deleting dead code"
convention, removed end-to-end:

| File | Change |
|---|---|
| `src/features/workout/ExerciseCard.tsx` | Remove `exerciseRepository`, `workoutRepository` from `ExerciseCardProps` and the destructure. |
| `src/features/workout/ExercisePickerSheet.tsx` | Remove `workoutRepository` from `ExercisePickerSheetProps` and the destructure. `repository` (full `ExerciseRepository`, used by `repository.list()`/`.recentlyUsed()`) stays. |
| `src/features/workout/ActiveWorkoutScreen.tsx` | Drop `exerciseRepository={exerciseRepository}` / `workoutRepository={workoutRepository}` from its `<ExerciseCard>` call (line ~1123–1124); drop `workoutRepository={workoutRepository}` from its `<ExercisePickerSheet>` call (line ~1218). `workoutRepository` was used **nowhere else** in this file (confirmed by grep) — so `ActiveWorkoutScreenProps.workoutRepository` itself becomes fully dead too; remove the prop and its destructure. |
| `app/workout/active.tsx` | `workoutRepository`'s only purpose was feeding `<ActiveWorkoutScreen>` (confirmed by grep — no other use in this route file). Remove the `WorkoutRepositoryImpl` import, the `useMemo` construction, and the prop-pass. |
| `src/features/workout/EditWorkoutScreen.tsx` | Drop `exerciseRepository={exerciseRepository}` / `workoutRepository={workoutRepository}` from its `<ExerciseCard>` call and `workoutRepository={workoutRepository}` from its `<ExercisePickerSheet>` call. `EditWorkoutScreenProps.workoutRepository` **stays** — used elsewhere in this file (`loadForEdit(workoutRepository, workoutId)`, `workoutRepository.update(...)`). |
| `src/features/routines/RoutineEditorScreen.tsx` | No change. It never threaded `workoutRepository` to `ExercisePickerSheet` to begin with (confirmed — its own file header already notes this picker context has no natural `WorkoutRepository` in scope), and it doesn't render `ExerciseCard` at all (uses the separate `RoutineExerciseCard`, unaffected by anything in this PRD). |

### AD-9 — `ExerciseDetailSheet.tsx`: delete

**[RESOLVED: delete, don't keep as a thin wrapper.]** Once both consumers (`ExerciseCard`,
`ExercisePickerSheet`) stop importing it, it has zero remaining call sites. Keeping it "for
backward call-site compatibility" has no actual backward-compatibility benefit here — this PRD
*is* the change to both of its only two call sites, in the same commit; there is no third caller
elsewhere in the codebase to stay compatible with (confirmed by grep: only these two files ever
imported it). Deleting matches the prompt's own stated preference and the codebase's demonstrated
convention of removing dead code rather than leaving unused wrappers around (see, e.g., this PRD's
own AD-8 ledger).

### AD-10 — `showBackButton` prop: keep, now vestigial

After AD-7/AD-4, no call site anywhere in the codebase passes `showBackButton={false}` to
`ExerciseDetailScreen` (that was `ExerciseDetailSheet`'s one use, now deleted). **[RESOLVED: keep
the prop, defaulted `true`, rather than removing it and its header-row conditional.]** It's cheap,
already-written optionality; removing it would touch the header row's `{showBackButton || exercise
? ... : null}` gate for no behavioral gain today, and a future PRD embedding this screen
sheet-style again (unlikely but not this PRD's call to foreclose) would need it back. Flagged in
Open Questions as worth a follow-up cleanup pass once PRD A's full-screen-conversion-policy is
settled app-wide.

## 5. API Change Summary

| Component | Prop change |
|---|---|
| `ExerciseDetailScreen` (`ExerciseDetailScreenProps`) | No prop shape change. `showBackButton` stays optional/defaulted `true`, now with zero live `false` call sites (AD-10). |
| `ExerciseCard` (`ExerciseCardProps`) | **Removed:** `exerciseRepository`, `workoutRepository` (AD-8). |
| `ExercisePickerSheet` (`ExercisePickerSheetProps`) | **Removed:** `workoutRepository` (AD-8). Unchanged: `repository`, `mode`, `onAdd`, `onReplace`, `visible`, `onDismiss`. |
| `ActiveWorkoutScreen` (props) | **Removed:** `workoutRepository` (fully dead after AD-8's downstream removals). |
| `EditWorkoutScreen` (props) | Unchanged — `workoutRepository` stays (used outside this PRD's scope). |
| `ExerciseChartsTab` (`ExerciseChartsTabProps`) | No prop shape change. Root element changes `ScrollView` → `View`; chip row moves below the chart (AD-5). |
| `ExerciseRecordsTab` (`ExerciseRecordsTabProps`) | No prop shape change. Root `View` drops `flex: 1` (AD-5). |
| `HowToTab` (new, `HowToTabProps`) | New file, same shape as today's inline `AboutTab` (`exercise`, `testID`). |
| `ExerciseSummaryTab` (new, `ExerciseSummaryTabProps`) | New file — `historicalSets`, `exercise` (`Pick<Exercise,'exerciseType'>`), `weightUnit`, `distanceUnit`, `warmupInStats`, `snapshot: RecordsSnapshot`, `testID?`. |
| `ExerciseDetailSheet` | **Deleted.** |
| `domain/records.ts`, `domain/exercise-charts.ts` | No changes. |
| `app/exercise/[id].tsx` | No changes — already correctly self-contained. |

## 6. Frontend Change Summary

- Exercise detail is reached the same visible way from all three entry points (mid-workout name
  tap, exercise-picker ⓘ, Browse-tab row tap) and now looks and behaves identically at all three:
  a full-screen page, top-left back chevron, no slide-up sheet chrome anywhere in the chain.
- Tab row (Summary / History / How to) sits directly under the top header row, above the exercise
  media — visible without scrolling, matching the Hevy reference layout and the user's explicit
  "at the top" ask.
- Summary (new, replaces Charts + Records as separate tabs): metric-chip row + `LineChart` (all
  four requested metrics — Heaviest Weight, Estimated 1RM, Best Set Volume, Session Volume — plus
  the type-gated others already supported) with the chip row now below the chart per Hevy parity,
  followed by a "RECORDS" section with the same PR cards / Set Records table / least-assistance
  line the old Records tab showed, all inside one scrollable view.
- History: unchanged.
- How to: unchanged content (type/equipment/muscle chips/instructions), renamed from About.
- Exercise-picker's ⓘ button: same "peek without losing your selection" behavior as today, now via
  a real full-screen push instead of a nested sheet, with one small, accepted cosmetic change (the
  picker sheet re-plays its slide-up entrance when you return, instead of just still being there).
- Mid-workout `ExerciseCard`'s name tap: identical outcome, cleaner transport (`router.push`
  instead of local sheet-visible state).

## 7. Testing

**Files requiring updates:**

- `src/features/exercises/__tests__/ExerciseDetailScreen.test.tsx` — tab-restructure is this
  file's core subject (`'shows the About tab by default, then switches to History/Charts/Records
  on tab press'` and the four `describe` blocks for About/History/Charts/Records content). Update:
  default-tab assertion (`'about'` → `'summary'`), tab-press testIDs (`tabs-charts`/`tabs-records`
  → `tabs-summary`; `tabs-about` → `tabs-howto`), and content testIDs under the merged tab
  (`${testID}-charts-*` / `${testID}-records-*` → `${testID}-summary-chart-*` /
  `${testID}-summary-records-*`, per `ExerciseSummaryTab`'s own `testID` prefixing in AD-5). The
  "Records tab (real content)" and "Charts tab (real content)" `describe` blocks merge into one
  "Summary tab (real content)" block that asserts both chart and records content render together
  under one tab press.
- `src/features/exercises/__tests__/ExerciseDetailScreen.actions.test.tsx` — spot-check only
  (Edit/Delete/Duplicate menu tests don't depend on tab structure), but the header-row-above-media
  reorder (AD-2) means any snapshot-order-sensitive assertions (unlikely — this file asserts by
  `testID`/text, not layout order) should be re-run to confirm.
- `src/features/workout/__tests__/ExerciseCard.test.tsx` — the existing `'card-detail-sheet'` /
  `'card-detail-sheet-content-*'` assertions (name-tap opens the sheet, tab-press inside it,
  content matches) no longer apply — there is no sheet. Replace with: name-tap → assert
  `router.push` called with `` `/exercise/${exerciseId}` ``. This test file's `jest.mock('expo-
  router', ...)` already exports a `router.push` jest.fn() (confirmed) — no new mock surface
  needed here.
- `src/features/workout/__tests__/ExerciseCard.operations.test.tsx` — update/remove the
  rationale comment for `jest.mock('@/lib/files')` (it exists because `ExerciseDetailSheet` →
  `ExerciseDetailScreen` transitively imports `@/lib/files`; once `ExerciseCard` no longer
  imports `ExerciseDetailSheet` at all, that transitive chain is gone from this test's module
  graph — the mock may be safely removable, but leaving it in place is harmless if unverified).
- **New test file** `src/features/workout/__tests__/ExercisePickerSheet.test.tsx` — this component
  has no dedicated test file today (confirmed by search); AD-4's suspend/restore mechanism is new
  and specific enough to this component to deserve direct coverage rather than only indirect
  coverage via the three parent screens: (1) ⓘ press → `router.push` called with
  `` `/exercise/${id}` `` and the picker's own `Sheet` becomes not-visible; (2) invoking the mocked
  `useFocusEffect` callback (simulating return-to-focus) → `Sheet` becomes visible again with
  `selectedIds`/`searchInput`/filters unchanged from before the ⓘ press.
- **`expo-router` mock updates across every test that mounts `ExercisePickerSheet`, directly or
  transitively** — `ActiveWorkoutScreen.test.tsx`, `ActiveWorkoutScreen.minimize.test.tsx`,
  `ActiveWorkoutScreen.smart-scroll.test.tsx`, `EditWorkoutScreen.test.tsx`,
  `RoutineEditorScreen.test.tsx`, `keyboard-flow.test.tsx`. Their current
  `jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: {...} }))`
  pattern spreads in the **real** `useFocusEffect` from `jest.requireActual('expo-router')` —
  that real implementation calls through to `@react-navigation/native`'s `useFocusEffect`, which
  throws without a real `NavigationContainer` ancestor (these tests render screens directly via
  RNTL `render()`, not through a real navigator). Each of these mocks needs an explicit
  `useFocusEffect: (callback: () => void) => callback()` (or a no-op) override alongside the
  existing `router` override, or every test that renders `ExercisePickerSheet` will crash on
  mount once AD-4 lands. This is the single largest, most mechanical piece of test fallout from
  this PRD — flagged here explicitly so it isn't missed during implementation.
- `RoutineEditorScreen.test.tsx` — additionally has a stale comment ("`ExercisePickerSheet` ->
  `ExerciseDetailSheet` -> `ExerciseDetailScreen`", justifying a transitive mock) that should be
  updated to reflect the new, simpler import graph (no more `ExerciseDetailSheet` in the chain).
- `src/data/exercises/__tests__/duplicate-as-custom.test.ts`,
  `src/features/measurements/__tests__/LogEntrySheet.test.tsx`,
  `src/features/routines/__tests__/RoutineEditorScreen.test.tsx`,
  `src/features/exercises/__tests__/ArchivedExercisesScreen.test.tsx`,
  `src/features/exercises/__tests__/ExerciseFormScreen.test.tsx`,
  `src/features/exercises/__tests__/ExerciseBrowseScreen.test.tsx`,
  `src/features/workout/__tests__/AddWarmUpSetsSheet.test.tsx` — these surfaced in a broad grep
  for `ExerciseDetailSheet`/`ExerciseDetailScreen`/`ExercisePickerSheet`/`ExerciseCard`; spot-check
  each for stale rationale comments only (none of them appear to assert on the sheet-vs-full-
  screen behavior itself).

**No new domain/pure-function tests required** — `domain/records.ts` and
`domain/exercise-charts.ts` are untouched (AD-6), and `ExerciseSummaryTab`/`HowToTab` are thin
composition/extraction with no new logic to unit test beyond what `ExerciseDetailScreen.test.tsx`
already exercises through them.

## 8. Manual Intervention Required From You

1. **On-device visual QA against the three Hevy screenshots** once implemented — this PRD
   specifies structural/ordering parity (tab position, chip position, tab set) but doesn't
   prescribe exact spacing/density values beyond "reuse the existing spacing scale consistently";
   a side-by-side look at a real device/simulator is the only way to confirm the result reads as
   "Hevy-adjacent" rather than just "technically matching the bullet points."
2. **`useFocusEffect` is a first-of-its-kind pattern in this codebase** (confirmed zero existing
   uses). AD-4's suspend/restore mechanism is the riskiest new piece of this PRD from a "does it
   actually work on-device" standpoint — worth a deliberate manual pass on both iOS and Android:
   open the exercise picker, select a couple of exercises, tap ⓘ on another row, confirm the
   detail screen opens full-screen with a working back button, tap back, confirm the picker
   reappears with the same selections and search/filter state intact.
3. **Decide, at your convenience, whether the `showBackButton` prop cleanup (AD-10) is worth a
   follow-up pass** once PRD A's full-screen-conversion-policy work is further along — not
   blocking, just flagged so it isn't forgotten.

## 9. Open Questions & Decisions

1. **PRD A not yet authored at the time of this PRD.** [RESOLVED: proceeded against PRD A's
   task-brief description; confirmed (AD-1) that neither converted call site in this PRD actually
   needs anything from PRD A's shared `SheetHeader`/footer API, so there is nothing to reconcile
   once PRD A lands — no coupling introduced in either direction.]
2. **Tab restructure: 4 tabs → 3, Charts+Records merged into Summary.** [RESOLVED: literal
   3-tab structure per the user's own list and the Hevy reference screenshot — see AD-2.]
3. **Metric selector: Chip row vs. a real dropdown.** [RESOLVED: keep Chips — the Hevy screenshot
   itself uses a chip/pill row, not a dropdown, directly settling the user's own tentative "(maybe
   a dropdown)" phrasing — see AD-6.]
4. **Add `bestSessionVolumeKg` to `domain/records.ts`?** [RESOLVED: no — `session_volume` is
   already a full chart-series metric, satisfying "Best Session Volume" as the user described it
   (a graph option), with no PR-card/table representation asked for — see AD-6.]
5. **Nested sheet-in-sheet conversion mechanism for `ExercisePickerSheet`'s ⓘ button.** [RESOLVED:
   suspend-the-picker's-own-Sheet + `useFocusEffect`-triggered restore, not dismiss-and-lose-state
   — see AD-4 for the full reasoning and the accepted re-slide-up cosmetic tradeoff.]
6. **`ExerciseDetailSheet.tsx` fate: delete vs. thin wrapper.** [RESOLVED: delete — zero remaining
   call sites after both conversions land in the same change; no third caller anywhere in the
   codebase to stay compatible with — see AD-9.]
7. **`showBackButton` prop: remove now that it's always `true` in practice, or keep?** [RESOLVED:
   keep, defaulted `true`, flagged as vestigial-but-cheap — see AD-10.]
8. **Extract `AboutTab` to its own file (`HowToTab.tsx`) or leave inline?** [RESOLVED: extract,
   for consistency with every sibling tab component already living in its own file — pure
   extraction, no logic change, permitted under the "no change beyond the rename" non-goal
   because a file-location change isn't a content/logic change — see AD-3.]
9. **Move the tab row above the media/name block?** [RESOLVED: yes — this is what the user's "at
   the top as well" phrasing was asking for, independently confirmed by the Hevy screenshot's own
   layout — see AD-2.]
10. **Duplicate the exercise name into the header row, matching Hevy's dual-name display?**
    [RESOLVED: no — a header-bar title slot is exactly the kind of shared-chrome concern PRD A's
    `SheetHeader` work should standardize; adding one here piecemeal risks conflicting with that
    PRD's own design — see AD-2's closing note.]
11. **Change the range control (`SegmentedControl` 3M/1Y/All) to a dropdown, matching Hevy's
    "Year ▾"?** [RESOLVED: no — the user's ask was specifically about the metric selector, not the
    range control; changing it would be unrequested scope — see AD-6.]
12. **Add a Hevy-style "current big value" headline above the chart?** [RESOLVED: no — no
    existing pure function computes a correct single "current" value for all 9 chart metrics
    (chart-series buckets aren't cumulative bests; `RecordsSnapshot` only covers 5 of 9 metrics
    with partially different semantics), and building that mapping is new derivation logic outside
    this task's scope — a wrong number is worse than none. See AD-6.]
13. **Does the ⓘ-button fix need per-caller changes across `ActiveWorkoutScreen` /
    `EditWorkoutScreen` / `RoutineEditorScreen`?** [RESOLVED: no — the entire suspend/restore
    mechanism lives inside `ExercisePickerSheet.tsx` itself; all three callers are unaffected
    beyond the mechanical `workoutRepository` prop removal already covered in AD-8.]
14. **Scope of dead-prop cleanup (`exerciseRepository`/`workoutRepository` threading).**
    [RESOLVED: remove end-to-end, including `ActiveWorkoutScreenProps.workoutRepository` and
    `app/workout/active.tsx`'s now-dead construction — confirmed by grep that both are otherwise
    fully unused after this PRD's changes — see AD-8's table.]
