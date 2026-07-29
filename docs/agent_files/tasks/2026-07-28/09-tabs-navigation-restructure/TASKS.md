# Tasks: Tabs Navigation Restructure (PRD I)

## Open Questions

New ambiguities discovered while grounding tasks in the actual call-site code (not covered
by any of PRD §9's 14 already-RESOLVED items). Each lists the assumption made to keep
moving and why. None of these block execution.

1. **`StatisticsScreen.test.tsx` has no `jest.mock('expo-router', ...)` block at all today**
   (confirmed by inspection — the screen itself doesn't import `router` before this PRD).
   Task 9 adds the import and the back button; the test task must add a brand-new
   `jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { back:
   jest.fn() } }))` block rather than extending an existing one. Reasonable because it
   mirrors the exact shape every sibling screen test (`CalendarScreen.test.tsx`,
   `HistoryDetailScreen.test.tsx`) already uses.
2. **`MeasuresHomeScreen.test.tsx`, `ExerciseBrowseScreen.test.tsx`, and
   `app/(tabs)/profile/settings/__tests__/index.test.tsx` each already mock `expo-router`
   but only stub `router.push`, not `router.back`.** Assumption: each of these mocks gets
   `back: jest.fn()` added alongside the existing `push: jest.fn()` (and, for Settings,
   alongside its already-untouched other calls) — the minimal edit that lets a new
   "back button calls `router.back()`" test assertion resolve, matching the shape
   `CalendarScreen.test.tsx`/`HistoryDetailScreen.test.tsx` already use for both.
3. **No `testID`/`accessibilityLabel` convention is spelled out verbatim in the PRD for the
   6 new back buttons beyond "matching `ArchivedExercisesScreen.tsx`'s own already-shipped
   pattern."** That file uses `testID={`${testID}-back`}` and
   `accessibilityLabel="Back"`. Every task below reuses exactly that convention
   (`${testID}-back`, label `"Back"`) for its own screen's `testID` prop/default, since it's
   the one concrete precedent PRD §4.5 names by name and this codebase has no second
   convention to reconcile it against.
4. **PRD §6 row 13 doesn't spell out exactly how Settings' new header row's "Settings" title
   should be styled.** Every other back-button screen in this PRD reuses its *existing*
   title `Text` (already styled) and only adds the back control beside it. Settings has no
   existing title `Text` at all (§4.5's own note: "a title-less `ScrollView`"). Task 12
   assumes the new title uses `typography.headline` (matching `ArchivedExercisesScreen.tsx`'s
   own back-row title style exactly, the same precedent Open Question #3 already leans on)
   rather than inventing a different weight — reasonable since this is the one other
   screen in the codebase that pairs a `ChevronLeft` back button with an inline title in
   the same row shape this task is adding.
5. **Task ordering for the `/history/*` → `/home/*` route-string updates (§6 rows 9, 14, 16,
   17, 18, 19, 20) is sequenced after Task 2 (the directory rename) in this list**, since a
   `router.push('/home/...')` call would 404 against a route tree that hasn't been renamed
   yet. This is an execution-order choice for this document, not a PRD decision — the PRD
   itself doesn't mandate an order, only that all of §6's rows land.

## Task 1 — `app/(tabs)/_layout.tsx`: 3-tab structure

- Files: `/root/projects/kyro/app/(tabs)/_layout.tsx`
- Changes (§4.1, §6 row 1):
  - Replace the `BookOpen, Dumbbell, History, User` import from `lucide-react-native` with
    `Dumbbell, Home, User` (drop `BookOpen`/`History`, add `Home`).
  - Replace the 4 `<Tabs.Screen>` entries with exactly 3, in this order: `home`, `workout`,
    `profile`:
    ```tsx
    <Tabs.Screen
      name="home"
      options={{
        title: 'Home',
        tabBarIcon: ({ color }) => (
          <Home size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="workout"
      options={{
        title: 'Workout',
        tabBarIcon: ({ color }) => (
          <Dumbbell size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
        ),
      }}
    />
    <Tabs.Screen
      name="profile"
      options={{
        title: 'Profile',
        tabBarIcon: ({ color }) => (
          <User size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
        ),
      }}
    />
    ```
    (`workout`'s and `profile`'s `options` are otherwise byte-identical to today — only
    reordered and `exercises` deleted.)
  - Update the file-header doc comment's tab list/icon list (currently "workout | history |
    exercises | profile" / "Workout `dumbbell`, History `history`, Exercises `book-open`,
    Profile `user`") to "home | workout | profile" / "Home `home`, Workout `dumbbell`,
    Profile `user`".
  - `TAB_ICON_SIZE`/`TAB_ICON_STROKE_WIDTH` constants, `screenOptions`, and
    `GlobalWorkoutBar` are unchanged.
- Acceptance criteria: the tab bar renders exactly 3 tabs in the order Home, Workout,
  Profile; Home uses the `Home` icon; no `exercises` tab remains. `app/(tabs)/_layout.tsx`
  no longer imports `BookOpen`/`History` from `lucide-react-native`.

## Task 2 — `app/(tabs)/history/` → `app/(tabs)/home/` directory rename + Slot→Stack

- Files:
  - `/root/projects/kyro/app/(tabs)/history/_layout.tsx` → `/root/projects/kyro/app/(tabs)/home/_layout.tsx`
  - `/root/projects/kyro/app/(tabs)/history/index.tsx` → `/root/projects/kyro/app/(tabs)/home/index.tsx`
  - `/root/projects/kyro/app/(tabs)/history/calendar.tsx` → `/root/projects/kyro/app/(tabs)/home/calendar.tsx`
  - `/root/projects/kyro/app/(tabs)/history/[id].tsx` → `/root/projects/kyro/app/(tabs)/home/[id].tsx`
  - `/root/projects/kyro/app/(tabs)/history/__tests__/history.test.tsx` → `/root/projects/kyro/app/(tabs)/home/__tests__/home.test.tsx`
- Changes (§4.1, §4.4, §6 row 2, §7):
  1. Physically move all 4 files (+ the test file) from `app/(tabs)/history/` to
     `app/(tabs)/home/`, preserving each file's internal wiring/imports exactly (they
     construct real repositories and pass them to `HistoryListScreen`/`CalendarScreen`/
     `HistoryDetailScreen` — none of that construction code changes in this task).
  2. In the moved `_layout.tsx`: convert `Slot` → `Stack` (§4.4's conversion, applies to
     every remaining tab segment):
     ```tsx
     // Before
     import { Slot } from 'expo-router';
     export default function HistoryTabLayout(): React.JSX.Element {
       return (
         <ErrorBoundary boundaryName="tab:history" onError={reportBoundaryError}>
           <Slot />
         </ErrorBoundary>
       );
     }

     // After
     import { Stack } from 'expo-router';
     export default function HomeTabLayout(): React.JSX.Element {
       return (
         <ErrorBoundary boundaryName="tab:home" onError={reportBoundaryError}>
           <Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />
         </ErrorBoundary>
       );
     }
     ```
     Rename the function itself (`HistoryTabLayout` → `HomeTabLayout`) and the
     `boundaryName` string (`'tab:history'` → `'tab:home'`). Update the file's doc comment
     header from "History tab segment layout" to "Home tab segment layout" (keep the rest of
     the ErrorBoundary/06 §9 explanation, it still applies).
  3. In each of `index.tsx`, `calendar.tsx`, `[id].tsx`: update only the header doc comment's
     prose references to "History tab"/"`(tabs)/history/`" to say "Home tab"/"`(tabs)/home/`"
     where they describe *this* route's own location (e.g. `index.tsx`'s "History tab
     (M2-14)" → "Home tab"; `calendar.tsx`'s "History → Calendar route" → "Home → Calendar
     route"; `[id].tsx`'s "History workout detail route" → "Home workout detail route", and
     its "avoiding a second, colliding 'history' route root" reasoning → "avoiding a second,
     colliding 'home' route root"). Do **not** change any of the three files' actual
     component code — they wire `HistoryListScreen`/`CalendarScreen`/`HistoryDetailScreen`
     exactly as before (those feature components keep their existing names/directory per
     §4.1's resolved decision — this task never touches `src/features/history/*` beyond the
     one edit Task 8 makes to `HistoryListScreen.tsx` itself).
  4. In the moved test file (renamed `home.test.tsx`): update its own header comment
     ("`(tabs)/history` route smoke tests" → "`(tabs)/home` route smoke tests") and both
     `renderRouter('app', { initialUrl: ... })` calls: `'/history'` → `'/home'`,
     `` `/history/${mockFixtureWorkout.id}` `` → `` `/home/${mockFixtureWorkout.id}` ``,
     `'/history/does-not-exist'` → `'/home/does-not-exist'`. Text assertions
     (`'Morning Workout'`, `/480 kg/`, `'Bench Press'`, `'Workout not found'`) are unchanged
     — they test the same underlying screens per §7.
- Acceptance criteria: `app/(tabs)/history/` no longer exists anywhere in the repo;
  `app/(tabs)/home/` contains `_layout.tsx` (now a `<Stack>`), `index.tsx`, `calendar.tsx`,
  `[id].tsx`, and `__tests__/home.test.tsx`. `renderRouter('app', { initialUrl: '/home' })`
  renders the real `HistoryListScreen` (still showing "Morning Workout" et al. against the
  test's existing mocks); `/home/${id}` renders `HistoryDetailScreen`; `/home/does-not-exist`
  shows "Workout not found". All 3 tests in the renamed `home.test.tsx` pass.

## Task 3 — `app/(tabs)/workout/_layout.tsx`: Slot→Stack conversion

- Files: `/root/projects/kyro/app/(tabs)/workout/_layout.tsx`
- Changes (§4.4, §9 decision 12, §6 row 3):
  - Convert `Slot` → `Stack`, identical shape to Task 2's `_layout.tsx` conversion:
    ```tsx
    import { Stack } from 'expo-router';
    export default function WorkoutTabLayout(): React.JSX.Element {
      return (
        <ErrorBoundary boundaryName="tab:workout" onError={reportBoundaryError}>
          <Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />
        </ErrorBoundary>
      );
    }
    ```
    (`boundaryName` stays `'tab:workout'` — no rename needed, only `history`→`home` was
    renamed.) No other route content under `workout/` changes.
- Acceptance criteria: `app/(tabs)/workout/_layout.tsx` renders a `<Stack>`, not a `<Slot>`.
  Re-run `app/(tabs)/workout/__tests__/index.test.tsx` (existing file, no edits expected —
  §7's own regression-check note) and confirm it still passes unmodified: an empty `<Stack>`
  with one root screen behaves identically to the `<Slot>` it replaces.

## Task 4 — `app/(tabs)/profile/_layout.tsx`: Slot→Stack conversion

- Files: `/root/projects/kyro/app/(tabs)/profile/_layout.tsx`
- Changes (§4.4, §6 row 4): identical conversion to Task 3, applied to the Profile segment:
  ```tsx
  import { Stack } from 'expo-router';
  export default function ProfileTabLayout(): React.JSX.Element {
    return (
      <ErrorBoundary boundaryName="tab:profile" onError={reportBoundaryError}>
        <Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />
      </ErrorBoundary>
    );
  }
  ```
  (`boundaryName` stays `'tab:profile'`.) This is what makes the back buttons added in
  Tasks 9–12 (Statistics, Measures, Settings, plus Task 5's Exercise browse relocation, all
  nested under `profile/`) actually have a native stack + swipe-back gesture to attach to —
  land this task before or alongside Tasks 5/9–12, not after.
- Acceptance criteria: `app/(tabs)/profile/_layout.tsx` renders a `<Stack>`, not a `<Slot>`.
  Any existing profile-segment route tests (e.g. via `renderRouter`) still resolve routes
  correctly.

## Task 5 — Exercises tab removal: relocate to `profile/exercises.tsx` + back button

- Files:
  - Delete: `/root/projects/kyro/app/(tabs)/exercises/_layout.tsx`,
    `/root/projects/kyro/app/(tabs)/exercises/index.tsx`
  - New: `/root/projects/kyro/app/(tabs)/profile/exercises.tsx`
  - `/root/projects/kyro/src/features/exercises/ExerciseBrowseScreen.tsx`
  - `/root/projects/kyro/src/features/exercises/__tests__/ExerciseBrowseScreen.test.tsx`
- Changes (§4.2, §4.5, §6 rows 5/6/10, §7 — depends on Task 4 for its Stack container):
  1. Delete `app/(tabs)/exercises/_layout.tsx` and `app/(tabs)/exercises/index.tsx` entirely
     (not hidden — per §4.2's rejected-alternatives reasoning, a hidden tab has no push/pop
     semantics to attach a back button to).
  2. Create `app/(tabs)/profile/exercises.tsx`, wiring the same real
     `ExerciseRepositoryImpl`/`getAppDriver()` construction the deleted `exercises/index.tsx`
     used, unchanged in shape:
     ```tsx
     import React, { useMemo } from 'react';

     import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
     import { getAppDriver } from '@/data/sqlite/boot';
     import { ExerciseBrowseScreen } from '@/features/exercises/ExerciseBrowseScreen';

     export default function ProfileExercisesRoute(): React.JSX.Element {
       const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

       return <ExerciseBrowseScreen repository={repository} />;
     }
     ```
     Give it a doc comment explaining it's the M-whatever-this-PRD-is relocation of the old
     Exercises tab route, nested under Profile now that Exercises is no longer its own tab
     (mirror the tone of `profile/statistics.tsx`'s own header).
  3. In `ExerciseBrowseScreen.tsx`: add a back button to the existing header row (§4.5's
     convention — `ChevronLeft` + `Pressable` + `router.back()`, matching
     `ArchivedExercisesScreen.tsx`'s pattern, Open Questions #3). Import `ChevronLeft` from
     `lucide-react-native` and `router` from `expo-router` (the latter is already imported).
     Current header row (lines ~178–203):
     ```tsx
     <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ... }}>
       <Text style={[typography.title1, { color: colors.text.primary }]}>Exercises</Text>
       <Pressable testID={`${testID}-create-button`} ...>
         <Plus .../>
       </Pressable>
     </View>
     ```
     New shape — add the back button as a sibling before the title, and wrap the title in a
     `flexDirection: 'row', alignItems: 'center'` group so back-chevron + title sit together
     on the left while the create button stays right-aligned via the row's own
     `justifyContent: 'space-between'`:
     ```tsx
     <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ... }}>
       <View style={{ flexDirection: 'row', alignItems: 'center' }}>
         <Pressable
           testID={`${testID}-back`}
           accessibilityRole="button"
           accessibilityLabel="Back"
           hitSlop={8}
           onPress={() => router.back()}
           style={{ marginRight: spacing['3'] }}
         >
           <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
         </Pressable>
         <Text style={[typography.title1, { color: colors.text.primary }]}>Exercises</Text>
       </View>
       <Pressable testID={`${testID}-create-button`} ...>
         <Plus .../>
       </Pressable>
     </View>
     ```
     Update the file's own doc comment to note the back button was added because this
     screen is no longer a tab root (relocated under `profile/`, §4.2) — a mechanical,
     narrow carve-out from this screen's "internal content untouched" non-goal (§3/§9
     decision 6), not a content/logic change.
  4. In `ExerciseBrowseScreen.test.tsx`: extend the `jest.mock('expo-router', ...)` block to
     add `back: jest.fn()` alongside the existing `push: jest.fn()` (Open Questions #2). Add
     one new test: press `getByTestId('exercise-browse-screen-back')` (or whatever `testID`
     prop the test's render call uses + `-back`) and assert `router.back` was called once.
- Acceptance criteria: no `app/(tabs)/exercises/` directory remains. `/profile/exercises`
  renders the real `ExerciseBrowseScreen` with a working `Plus`/create button and a new
  back-chevron that calls `router.back()`. All existing `ExerciseBrowseScreen.test.tsx` and
  `ExerciseBrowseScreen.full-dataset.test.tsx` tests pass unmodified except the one new test
  added above (none of them query the header row's structure in a way the back button's
  addition would break — verify by re-reading before closing this task).

## Task 6 — `app/index.tsx`: landing redirect

- Files: `/root/projects/kyro/app/index.tsx`
- Changes (§4.1, §9 decision 1, §6 row 7):
  - `<Redirect href="/workout" />` → `<Redirect href="/home" />`.
  - Update the file's doc comment: "Lands on the Workout tab (06 §3: 'routines hub' ...)" →
    something like "Lands on the Home tab — first tab in JSX order is also the default
    landing screen, §4.1 of the tabs-navigation-restructure PRD."
- Acceptance criteria: navigating to `/` redirects to `/home`, not `/workout`.

## Task 7 — `app/_layout.tsx`: `swipeDirection: 'vertical'` on the 6 `fullScreenModal` routes

- Files: `/root/projects/kyro/app/_layout.tsx`
- Changes (§4.4, §9 decisions 9/10, §6 row 8): add `swipeDirection: 'vertical'` to each of
  the 6 `<Stack.Screen>` entries' `options` (all already have
  `presentation: 'fullScreenModal', animation: 'slide_from_bottom'`):
  `workout/active`, `routine/new`, `routine/[id]/edit`, `workout/[id]/edit`, `import/hevy`,
  `backup/restore`. Example for one:
  ```tsx
  <Stack.Screen
    name="workout/active"
    options={{
      presentation: 'fullScreenModal',
      animation: 'slide_from_bottom',
      swipeDirection: 'vertical',
    }}
  />
  ```
  Apply identically to all 6. Add a short comment near the first of the 6 (or a single
  comment above the group) citing §4.4: `swipeDirection: 'vertical'` bundles
  `fullScreenSwipeEnabled: true` + `customAnimationOnSwipe: true` +
  `stackAnimation: 'slide_from_bottom'` per `react-native-screens`' own documented default,
  matching these routes' existing `slide_from_bottom` entrance — swipe down to dismiss.
- Acceptance criteria: all 6 `<Stack.Screen>` entries in `app/_layout.tsx` have
  `swipeDirection: 'vertical'` in their `options`. No test coverage is expected or required
  for this change (§7: gesture behavior isn't unit-testable under Jest/RNTL — this is a
  manual/on-device verification item, §8 item 1, not gated on a dev agent).

## Task 8 — `HistoryListScreen.tsx`: "Home" copy + route updates

- Files: `/root/projects/kyro/src/features/history/HistoryListScreen.tsx`
- Changes (§4.1, §6 row 9 — depends on Task 2):
  - Line 225: `<Text style={[typography.title1, { color: colors.text.primary }]}>History</Text>`
    → same style, text `Home`.
  - Line 185 (inside `handleRowPress`): `router.push(\`/history/${workoutId}\` as never)` →
    `router.push(\`/home/${workoutId}\` as never)`.
  - Line 193 (inside `handleCalendarPress`): `router.push('/history/calendar' as never)` →
    `router.push('/home/calendar' as never)`. Update that handler's own comment (currently
    references "06 §3's own navigation map ... 'history/calendar.tsx'") to say
    `home/calendar.tsx`.
  - No other line in this file changes — this screen's own internal `testID` defaults
    (`'history-list'` etc.) are untouched; §6 row 9 does not ask for a `testID` rename, and
    nothing downstream depends on it changing.
- Acceptance criteria: the tab's header shows "Home", not "History"; tapping a workout row
  navigates to `/home/${workoutId}`; tapping the Calendar icon navigates to `/home/calendar`.

## Task 9 — `StatisticsScreen.tsx`: back button

- Files:
  - `/root/projects/kyro/src/features/stats/StatisticsScreen.tsx`
  - `/root/projects/kyro/src/features/stats/__tests__/StatisticsScreen.test.tsx`
- Changes (§4.5, §6 row 11 — depends on Task 4 for its Stack container):
  - Import `router` from `expo-router` and `ChevronLeft` from `lucide-react-native`
    (neither currently imported in this file).
  - Current title block (line ~323–325):
    ```tsx
    <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
      Statistics
    </Text>
    ```
  - New shape — wrap in a row with the back button before it:
    ```tsx
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['4'] }}>
      <Pressable
        testID={`${testID}-back`}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => router.back()}
        style={{ marginRight: spacing['3'] }}
      >
        <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
      </Pressable>
      <Text style={[typography.title2, { color: colors.text.primary }]}>Statistics</Text>
    </View>
    ```
    (`Pressable` is already imported from `react-native` in this file — verify and add to
    the existing `react-native` import list if not.)
- Acceptance criteria: Statistics screen shows a back-chevron to the left of the "Statistics"
  title that calls `router.back()`. In `StatisticsScreen.test.tsx` (Open Questions #1): add a
  new `jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: {
  back: jest.fn() } }))` block (none exists today), import `router` from `expo-router` in the
  test, and add one test pressing `getByTestId('statistics-screen-back')` (or the test's own
  `testID` + `-back`) asserting `router.back` was called once. All pre-existing tests in both
  `StatisticsScreen.test.tsx` and `StatisticsScreen.interactions.test.tsx` continue to pass —
  neither queries the title `Text`'s structural position, only its text content and the chart
  testIDs, both unchanged.

## Task 10 — `MeasuresHomeScreen.tsx`: back button

- Files:
  - `/root/projects/kyro/src/features/measurements/MeasuresHomeScreen.tsx`
  - `/root/projects/kyro/src/features/measurements/__tests__/MeasuresHomeScreen.test.tsx`
- Changes (§4.5, §6 row 12 — depends on Task 4):
  - Import `ChevronLeft` from `lucide-react-native` (`router` is already imported).
  - Current header block (lines ~105–115):
    ```tsx
    <View style={{ paddingHorizontal: spacing['4'], paddingTop: insets.top + spacing['4'], paddingBottom: spacing['2'] }}>
      <Text style={[typography.title1, { color: colors.text.primary }]}>Measures</Text>
    </View>
    ```
  - New shape:
    ```tsx
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing['4'],
        paddingTop: insets.top + spacing['4'],
        paddingBottom: spacing['2'],
      }}
    >
      <Pressable
        testID={`${testID}-back`}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => router.back()}
        style={{ marginRight: spacing['3'] }}
      >
        <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
      </Pressable>
      <Text style={[typography.title1, { color: colors.text.primary }]}>Measures</Text>
    </View>
    ```
- Acceptance criteria: Measures screen shows a back-chevron before "Measures" that calls
  `router.back()`. In `MeasuresHomeScreen.test.tsx` (Open Questions #2): add `back:
  jest.fn()` to the existing `jest.mock('expo-router', ...)`'s `router` object (alongside
  `push`). Add one test pressing `getByTestId('measures-home-screen-back')` asserting
  `router.back` was called once. All existing tests (row taps, FAB, `LogEntrySheet` wiring)
  pass unmodified.

## Task 11 — Settings screen: header row + back button + "Archived Exercises" row

- Files:
  - `/root/projects/kyro/app/(tabs)/profile/settings/index.tsx`
  - `/root/projects/kyro/app/(tabs)/profile/settings/__tests__/index.test.tsx`
- Changes (§4.5, §4.2, §6 row 13 — depends on Task 4; independent of Task 5):
  1. Import `router` (already imported), `ChevronLeft` from `lucide-react-native`.
  2. Add a new header `View` as the first child *before* the existing `ScrollView`
     (currently the `ScrollView` is the screen's only top-level element) — same
     `flexDirection:'row', alignItems:'center', paddingTop: insets.top + spacing['4']` shape
     every other screen in this PRD uses (Open Questions #4: title styled
     `typography.headline`, matching `ArchivedExercisesScreen.tsx`'s own back-row title):
     ```tsx
     return (
       <>
         <View
           style={{
             flexDirection: 'row',
             alignItems: 'center',
             paddingHorizontal: spacing['4'],
             paddingTop: insets.top + spacing['4'],
             paddingBottom: spacing['2'],
             backgroundColor: colors.bg.base,
           }}
         >
           <Pressable
             testID="settings-back"
             accessibilityRole="button"
             accessibilityLabel="Back"
             hitSlop={8}
             onPress={() => router.back()}
             style={{ marginRight: spacing['3'] }}
           >
             <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
           </Pressable>
           <Text style={[typography.headline, { color: colors.text.primary }]}>Settings</Text>
         </View>
         <ScrollView
           testID="settings-screen"
           style={[styles.container, { backgroundColor: colors.bg.base }]}
           contentContainerStyle={{ padding: spacing['4'] }}
         >
           {/* existing content, minus its own paddingTop: insets.top + spacing['4'] —
               that clearance now lives on the new header View above instead */}
           ...
         </ScrollView>
       </>
     );
     ```
     Remove `paddingTop: insets.top + spacing['4']` from the `ScrollView`'s own
     `contentContainerStyle` (it moves to the new header `View`, avoiding double top
     clearance) — keep `padding: spacing['4']` on the `ScrollView`'s `contentContainerStyle`.
     Import `Pressable` and `ChevronLeft`; `View`/`Text` are already imported from
     `react-native`.
  3. Add a new `ListRow` in the WORKOUTS section, placed immediately after the existing
     "Warm-up Calculator" row (`settings-warmup-calc-link`) and before the
     `settings-live-pr-banner` toggle:
     ```tsx
     <ListRow
       testID="settings-archived-exercises-link"
       title="Archived Exercises"
       chevron
       onPress={() => router.push('/profile/exercises-archived')}
     />
     ```
- Acceptance criteria: Settings shows a back-chevron + "Settings" title header above the
  scrollable content; the WORKOUTS section now has an "Archived Exercises" row between
  "Warm-up Calculator" and "Live PR Notification" that navigates to
  `/profile/exercises-archived`. In `index.test.tsx` (Open Questions #2): add `back:
  jest.fn()` to the existing `jest.mock('expo-router', ...)`'s `router` object. Add two new
  tests: (a) pressing `getByTestId('settings-back')` calls `router.back()`; (b) pressing
  `getByTestId('settings-archived-exercises-link')` calls `router.push` with
  `'/profile/exercises-archived'`. All ~30 existing tests in this file continue to pass
  (none query the screen's top-level structure by position, only by `testID`/text).

## Task 12 — `CalendarScreen.tsx`: back button + route rename

- Files:
  - `/root/projects/kyro/src/features/calendar/CalendarScreen.tsx`
  - `/root/projects/kyro/src/features/calendar/__tests__/CalendarScreen.test.tsx` (if it
    asserts on `/history/${workoutId}` push targets — check before editing)
- Changes (§4.5, §6 row 14 — depends on Task 2 for the route rename, Task 4 for the Stack
  container):
  1. Import `ChevronLeft` from `lucide-react-native` (`router` already imported).
  2. Current header block (lines ~177–192):
     ```tsx
     <View style={{ paddingHorizontal: spacing['4'], paddingTop: insets.top + spacing['4'] }}>
       <Text style={[typography.title2, { color: colors.text.primary }]}>Calendar</Text>
       <Text testID={`${testID}-streak`} ...>{...}</Text>
     </View>
     ```
  3. New shape — back button + title share a row, streak subtitle stays below, unindented:
     ```tsx
     <View style={{ paddingHorizontal: spacing['4'], paddingTop: insets.top + spacing['4'] }}>
       <View style={{ flexDirection: 'row', alignItems: 'center' }}>
         <Pressable
           testID={`${testID}-back`}
           accessibilityRole="button"
           accessibilityLabel="Back"
           hitSlop={8}
           onPress={() => router.back()}
           style={{ marginRight: spacing['3'] }}
         >
           <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
         </Pressable>
         <Text style={[typography.title2, { color: colors.text.primary }]}>Calendar</Text>
       </View>
       <Text
         testID={`${testID}-streak`}
         style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}
       >
         {streakQuery.isError ? '—' : formatStreakLabel(streakWeeks)}
       </Text>
     </View>
     ```
     (`Pressable` is already imported from `react-native` in this file.) Update the file's
     own doc comment — it currently says "No back button in the header — same 'rely on the
     native swipe-back gesture' convention `HistoryDetailScreen.tsx` already established" —
     that sentence is now false; replace it with a short note that this PRD adds an explicit
     back button per §4.5, matching Statistics/Measures/Settings.
  4. Line 160 (inside `handleWorkoutPress`): `router.push(\`/history/${workoutId}\` as
     never)` → `router.push(\`/home/${workoutId}\` as never)`.
- Acceptance criteria: Calendar screen shows a back-chevron before "Calendar" that calls
  `router.back()`; the streak subtitle is unchanged below it. Tapping a day-sheet workout row
  navigates to `/home/${workoutId}`. If `CalendarScreen.test.tsx` asserts
  `router.push` with a `/history/...` string, update it to `/home/...`; the file already
  mocks `router.back` (Open Questions #2 doesn't apply here) — add one new test pressing
  `getByTestId('calendar-screen-back')` asserting `router.back` was called once.

## Task 13 — `HistoryDetailScreen.tsx`: back button

- Files:
  - `/root/projects/kyro/src/features/history/HistoryDetailScreen.tsx`
  - `/root/projects/kyro/src/features/history/__tests__/HistoryDetailScreen.test.tsx`
- Changes (§4.5, §6 row 15 — depends on Task 4's Profile Stack conversion only insofar as
  this screen is reached through the `home/` segment's own Stack, Task 2; no direct file
  dependency otherwise):
  - Import `ChevronLeft` from `lucide-react-native` (`router` already imported).
  - Current top block (lines ~450–479) has the title/date/routine-subtitle/description on
    the left and the `⋯` menu `Pressable` on the right, inside a
    `flexDirection:'row', justifyContent:'space-between'` row. Add the back button as a new
    first child *before* that row, in its own small row:
    ```tsx
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}>
      <Pressable
        testID={`${testID}-back`}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => router.back()}
      >
        <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
      </Pressable>
    </View>
    ```
    placed as the new first child inside the `ScrollView`'s `contentContainerStyle` content,
    directly above the existing `<View style={{ flexDirection: 'row', justifyContent:
    'space-between', ... }}>` title/menu row (do not merge the back button into that same
    row — the title block already uses `justifyContent: 'space-between'` for
    title-vs-menu-button and adding a third element would break that layout; a small
    standalone row above it is simpler and matches this screen's already-tall header).
- Acceptance criteria: Workout detail screen shows a back-chevron above the workout title
  that calls `router.back()`. `HistoryDetailScreen.test.tsx` already mocks
  `router.back`/`router.push` (Open Questions #2 doesn't apply) — add one new test pressing
  `getByTestId('history-detail-back')` (or the test's own `testID` + `-back`) asserting
  `router.back` was called once. All existing tests (⋯ menu, delete, repeat, export, etc.)
  pass unmodified.

## Task 14 — `ProfileScreen.tsx`: "Exercises" shortcut repurpose + route renames

- Files:
  - `/root/projects/kyro/src/features/profile/ProfileScreen.tsx`
  - `/root/projects/kyro/src/features/profile/__tests__/ProfileScreen.interactions.test.tsx`
- Changes (§4.2, §4.1, §6 row 16 — depends on Task 2 for the `/history`→`/home` renames and
  Task 5 for the `/profile/exercises` target existing):
  1. Replace the `ArchiveRestore` import from `lucide-react-native` with `BookOpen` (drop
     `ArchiveRestore` if nothing else in the file uses it — verify via grep before removing).
  2. Lines ~289–294, the "Exercises" `ShortcutCard`:
     ```tsx
     <ShortcutCard
       testID={`${testID}-archived-exercises-shortcut`}
       icon={<ArchiveRestore size={22} strokeWidth={1.75} color={colors.accent.text} />}
       label="Exercises"
       onPress={() => router.push('/profile/exercises-archived')}
     />
     ```
     → (icon swap, target swap, keep the label "Exercises" and the `testID` unchanged per
     §4.2 — repurposing, not adding a second shortcut, so nothing about the card's identity
     needs a new `testID`):
     ```tsx
     <ShortcutCard
       testID={`${testID}-archived-exercises-shortcut`}
       icon={<BookOpen size={22} strokeWidth={1.75} color={colors.accent.text} />}
       label="Exercises"
       onPress={() => router.push('/profile/exercises')}
     />
     ```
  3. Line ~305 (Calendar shortcut): `router.push('/history/calendar')` →
     `router.push('/home/calendar')`.
  4. Line ~315 ("See All"): `router.push('/history')` → `router.push('/home')`.
  5. Line ~335 (recent-card press): `router.push(\`/history/${workoutId}\` as never)` →
     `router.push(\`/home/${workoutId}\` as never)`.
  6. Update the file's header doc comment §3 bullet ("'Exercises' here specifically means
     the *archived-exercise management* shortcut ... routes to `/profile/exercises-archived`
     ... general exercise browsing already has its own tab") to reflect the new reality:
     "Exercises" now opens general exercise browsing (`/profile/exercises`, relocated from
     the removed Exercises tab, PRD I §4.2); archived-exercise management moved to Settings.
     Also update the "Calendar" routes to `/history/calendar` doc-comment line to
     `/home/calendar`.
- Acceptance criteria: the Profile "Exercises" shortcut shows a `BookOpen` icon and
  navigates to `/profile/exercises`; the Calendar shortcut navigates to `/home/calendar`;
  "See All" navigates to `/home`; tapping a recent-workout card navigates to
  `/home/${workoutId}`. In `ProfileScreen.interactions.test.tsx`: update the parametrized
  case `['profile-archived-exercises-shortcut', '/profile/exercises-archived']` to
  `['profile-archived-exercises-shortcut', '/profile/exercises']`; update
  `['profile-calendar-shortcut', '/history/calendar']` to
  `['profile-calendar-shortcut', '/home/calendar']`; update
  `expect(router.push).toHaveBeenCalledWith('/history/w-1')` to `'/home/w-1'`; update
  `expect(router.push).toHaveBeenCalledWith('/history')` to `'/home'`.

## Task 15 — `EditWorkoutScreen.tsx`: route rename

- Files: `/root/projects/kyro/src/features/workout/EditWorkoutScreen.tsx`
- Changes (§6 row 17 — depends on Task 2):
  - Line 409: `router.replace(\`/history/${workoutId}\` as never);` →
    `router.replace(\`/home/${workoutId}\` as never);`.
- Acceptance criteria: after saving an edited workout, the app navigates to
  `/home/${workoutId}` instead of `/history/${workoutId}`. If any existing test in this
  file's own `__tests__` asserts on the old `/history/...` string, update it to `/home/...`
  (grep for `history/` in that test file before closing this task).

## Task 16 — `ActiveWorkoutScreen.tsx`: route rename

- Files: `/root/projects/kyro/src/features/workout/ActiveWorkoutScreen.tsx`
- Changes (§6 row 18 — depends on Task 2):
  - Line 704: `router.replace(\`/history/${finished.id}\` as never);` →
    `router.replace(\`/home/${finished.id}\` as never);`.
- Acceptance criteria: after finishing a workout, the app navigates to
  `/home/${finished.id}` instead of `/history/${finished.id}`. If any existing test in this
  file's own `__tests__` asserts on the old `/history/...` string, update it to `/home/...`
  (grep for `history/` in that test file before closing this task).

## Task 17 — `ExerciseHistoryTab.tsx`: route rename

- Files: `/root/projects/kyro/src/features/exercises/ExerciseHistoryTab.tsx`
- Changes (§6 row 19 — depends on Task 2):
  - Line 163 (inside `handlePress`): `router.push(\`/history/${workoutId}\` as never);` →
    `router.push(\`/home/${workoutId}\` as never);`.
- Acceptance criteria: tapping a performance card in an exercise's History tab navigates to
  `/home/${workoutId}`. If any existing test asserts on the old `/history/...` string,
  update it (grep for `history/` in any `ExerciseHistoryTab.test.tsx` before closing).

## Task 18 — `ExerciseRecordsTab.tsx`: route rename (2 call sites)

- Files: `/root/projects/kyro/src/features/exercises/ExerciseRecordsTab.tsx`
- Changes (§6 row 20 — depends on Task 2):
  - Line 94 (`PrCard`'s `onPress`): `router.push(\`/history/${holder.workoutId}\` as
    never)` → `router.push(\`/home/${holder.workoutId}\` as never)`.
  - Line 175 (`SetRecordRow`'s `onPress`): same rename.
- Acceptance criteria: tapping a PR card or a populated Set Record row navigates to
  `/home/${workoutId}`. If any existing test asserts on the old `/history/...` string,
  update it (grep for `history/` in any `ExerciseRecordsTab.test.tsx` before closing).

## Task 19 — `app/__tests__/tabs-layout.test.tsx`: rewrite for 3 tabs

- Files: `/root/projects/kyro/app/__tests__/tabs-layout.test.tsx`
- Changes (§6 row 21, §7 — depends on every prior task, land this last):
  1. Update the file's own header doc comment: "all 4 tabs navigable" → "all 3 tabs
     navigable"; the `describe` block title "tab shell — boots to tabs, all 4 tabs
     navigable" → "... all 3 tabs navigable".
  2. `'redirects "/" to the Home tab'` (renamed from "... to the Workout tab"): assert
     `initialUrl: '/'` renders Home's empty/seed state. Per Task 2, `HistoryListScreen`'s
     empty state (unchanged text) is `"No workouts logged yet"` — replace the current
     `expect(await screen.findByText('No routines yet')).toBeTruthy();` assertion with
     `expect(await screen.findByText('No workouts logged yet')).toBeTruthy();`.
  3. Replace the 4 "navigates to the X tab" tests with exactly 3:
     - `'navigates to the Home tab'`: `initialUrl: '/home'`, assert
       `screen.findByText('No workouts logged yet')`.
     - `'navigates to the Workout tab'`: `initialUrl: '/workout'`, assert
       `screen.findByText('No routines yet')` (unchanged from today's Workout-tab test).
     - `'navigates to the Profile tab'`: `initialUrl: '/profile'`, assert
       `screen.findByText('Add your name')` (unchanged from today's Profile-tab test).
     Delete the "navigates to the Exercises tab" test entirely (no longer a tab) along with
     its now-unused `jest.mock('@/lib/files')` block *only if* nothing else in this file
     still needs it — check first (the Exercises-tab test was the only consumer of that
     mock per the file's own comment; if `/profile/exercises` rendering is added to this
     same file instead of a separate one, per the bullet below, that mock is still needed
     and must stay).
  4. Add one new case proving `/profile/exercises` renders the real `ExerciseBrowseScreen`
     post-relocation (§7's requirement — either inline in this file or in a new
     `app/(tabs)/profile/__tests__/exercises.test.tsx`; inline here is simpler since this
     file already has the full mock scaffolding (`@/data/sqlite/boot`, `@/lib/files`) this
     assertion needs):
     ```tsx
     it(
       'navigates to /profile/exercises and renders the real ExerciseBrowseScreen',
       async () => {
         await renderRouter('app', { initialUrl: '/profile/exercises' });
         expect(await screen.findByText('No exercises found')).toBeTruthy();
       },
       15000,
     );
     ```
     (Keep the `@/lib/files` mock — this new case is exactly why it's still needed, per
     bullet 3's own note.)
  5. Every retained `it(...)` keeps its 15000 ms timeout override per the file's own
     M0-12 note.
- Acceptance criteria: this file has exactly 5 tests: the `/` redirect (now landing on
  Home's empty state), Home/Workout/Profile tab navigation (3 tests), and the new
  `/profile/exercises` case. No "Exercises tab" test remains. All 5 pass against the
  post-restructure route tree.

## Summary of what requires you (not a dev agent)

- **On-device swipe verification for the 6 `fullScreenModal` routes** (PRD §8 item 1, Task
  7's own scope): check both an iOS ≥26 device/simulator and a pre-26 one, confirming the
  vertical swipe-down dismiss feels right against each route's `slide_from_bottom` entrance
  — especially `workout/active` (an in-progress workout) and the two multi-step flows
  (`import/hevy`, `backup/restore`). Not verifiable via Jest/RNTL.
- **Quick eyeball of new/changed user-facing copy and icons** once implemented (PRD §8 item
  2): the "Home" tab label + `Home` icon (Task 1), the repurposed "Exercises" shortcut's new
  destination + `BookOpen` icon (Task 14), and the new "Archived Exercises" Settings row's
  label/placement (Task 11).
- **Nothing else requires you.** This is a design-only-derived, purely mechanical
  implementation PRD — no external services, secrets, accounts, or manual infra approvals
  are needed for any of the 19 tasks above. No `[OPEN]` items were found in PRD §9 — all 14
  decisions are `[RESOLVED]`.
