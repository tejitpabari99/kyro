# PRD I — Tabs Navigation Restructure

Sub-project **I** of batch 2 (a second, mid-stream batch on top of the 8-PRD **A–H** batch already in `docs/agent_files/tasks/2026-07-28/`). **Foundational** for batch 2 — no other batch-2 sub-project depends on it in the sense of blocking their work, but it is the largest, structurally deepest change in the batch (tab bar, all 4 tab-segment navigators, root modal gestures, 3 route relocations). Sub-project **J** (`active-workout-visual-parity`) does not depend on this PRD. Design only — no code changes were made while authoring this document.

Matches the house format `01-sheet-header-footer-foundation/PRD.md` established in batch 1.

---

## 1. Problem

Three independent, verified gaps, all converging on "the tab/navigation shell doesn't match the product the user actually wants, and can't support back/swipe navigation even where it should":

**1.1 Wrong tab structure.** Today's 4 tabs (`app/(tabs)/_layout.tsx`): Workout, History, Exercises, Profile. The user wants 3: Home, Workout, Profile — with Home showing "all exercises I have done, all my workouts latest first... this is like my feed," explicitly replacing History as a concept ("no need for history since home covers it"), and Exercises removed as a tab entirely, folded into an already-present-but-effectively-broken Profile shortcut. Hevy's own app (7 reference screenshots, `batch2-visual-research.md`) confirms this exact 3-tab shape independently: Home/Workout/Profile, house/dumbbell/person icons.

**1.2 Structural absence of back buttons and swipe-back on every tab sub-route.** All 4 tab segment layouts (`app/(tabs)/profile/_layout.tsx`, `history/_layout.tsx`, `exercises/_layout.tsx`, `workout/_layout.tsx`) are byte-for-byte identical:
```tsx
export default function ProfileTabLayout(): React.JSX.Element {
  return (
    <ErrorBoundary boundaryName="tab:profile" onError={reportBoundaryError}>
      <Slot />
    </ErrorBoundary>
  );
}
```
`<Slot/>` builds route state via `useNavigationBuilder(StackRouter, ...)` (confirmed by reading `node_modules/expo-router/build/views/Navigator.js`'s `SlotNavigator` — so `router.push`/`router.back()` work programmatically) but renders only the current route's descriptor directly. **No `<Stack.Navigator>`/`react-native-screens` native-stack container is ever mounted** — every route nested under every tab is missing a native header, a native back button, and a native swipe-back gesture structurally, not as a per-screen oversight. Confirmed by direct reading, the following screens have **zero back-navigation affordance today**: `StatisticsScreen.tsx`, `MeasuresHomeScreen.tsx`, `app/(tabs)/profile/settings/index.tsx`, `src/features/calendar/CalendarScreen.tsx`, `src/features/history/HistoryDetailScreen.tsx` (the last two not called out in the original discovery pass but found during this PRD's own file-by-file read — same gap, same fix). Exactly one screen has a substitute (`ArchivedExercisesScreen.tsx`, hand-rolled `ChevronLeft` + `Pressable` + `router.back()`).

**1.3 No swipe-back gesture anywhere.** Two independent sub-causes: (a) the Slot gap above means zero native-stack containers exist under any tab, so there's no gesture recognizer to enable in the first place; (b) confirmed by repo-wide grep, zero occurrences of `gestureEnabled`/`fullScreenGestureEnabled`/`gestureDirection` anywhere in `app/`/`src/` — the 6 root-level `fullScreenModal` routes (`app/_layout.tsx`: `workout/active`, `routine/new`, `routine/[id]/edit`, `workout/[id]/edit`, `import/hevy`, `backup/restore`) have no gesture configuration at all, and `UIModalPresentationFullScreen` (what `presentation: 'fullScreenModal'` maps to on iOS — confirmed via `node_modules/react-native-screens/src/types.tsx`) is not natively swipe-dismissible the way a `push` or `pageSheet`/`formSheet` presentation is.

**1.4 Profile's "Exercises" shortcut reads as broken.** `ProfileScreen.tsx` (lines 289–294) already has a `ShortcutCard` labeled "Exercises" → `router.push('/profile/exercises-archived')` → `ArchivedExercisesScreen.tsx`. Per that screen's own header comment this is specifically archived-exercise management — empty for virtually every user by default (nothing gets archived without a deliberate action), which is almost certainly why the user describes it as a button that "doesn't have anything." The user wants general exercise browsing (today's Exercises tab, `ExerciseBrowseScreen.tsx`) reachable from that same card instead.

## 2. Goals

1. Ship the 3-tab structure: **Home / Workout / Profile**, Home first, Home = today's History screen relocated/relabeled, absorbing all of History's current sub-routes.
2. Remove the Exercises tab; repurpose Profile's existing "Exercises" shortcut to open general exercise browsing; relocate archived-exercise management into Settings.
3. Convert all 3 remaining tab segment layouts (`home`, `workout`, `profile`) from `<Slot/>` to `<Stack screenOptions={{headerShown:false}}>`, closing the structural back-button/swipe-back gap at its root.
4. Add an explicit back button to every screen that is missing one and is (or becomes, via this PRD's own relocations) a pushed, non-tab-root route: `StatisticsScreen`, `MeasuresHomeScreen`, Settings, `CalendarScreen`, `HistoryDetailScreen`, `ExerciseBrowseScreen`.
5. Enable swipe-back for every push-style route now living under a real `<Stack>` (tab sub-routes) and swipe-to-dismiss for the 6 root `fullScreenModal` routes, with a researched, versioned answer on exactly which `react-native-screens` props that requires.
6. Zero orphaned routes: every current `history/*`/`exercises/*` sub-route is audited and given an explicit new home.

## 3. Non-Goals

- **`HistoryWorkoutCard`/`RoutineCard` visual de-carding.** Owned by batch-1 PRD G (`07-history-routines-list-decarding/PRD.md`, read in full for this PRD — see §4.1 note). This PRD relocates and relabels the screen that hosts those cards; it does not touch their internal layout/styling.
- **Full floating-circular-button back-button redesign app-wide** (Hevy's exact visual chrome: white circle, drop shadow, floating over content). This PRD adds back buttons in this codebase's **existing** flat-header-row, hand-rolled-`ChevronLeft` convention (`ArchivedExercisesScreen.tsx`'s own pattern) — see §4.5 for the reasoning. The floating-circular redesign is flagged as plausible future work, not bundled here.
- **Floating pill-shaped tab bar visual redesign** (Hevy's inset, rounded-corner, frosted floating bar). Only the tab **structure** (count/order/icons/labels) changes in this PRD; the bar's existing chrome (`bg.surface` fill, edge-to-edge, hairline top border) is untouched. Same reasoning as the back-button non-goal above — flagged as future work.
- **`ExerciseBrowseScreen.tsx`'s internal search/filter/create logic.** Untouched, with one explicit, narrow carve-out: the back button this PRD adds to its existing header row (§4.2) — a mechanical necessity of relocating it out of the tab bar, not a content change.
- **Adopting `SheetHeader`/`ScreenFooter` (PRD A's primitives) for any of the newly-added back buttons.** Confirmed by checking the repo: `src/ui/SheetHeader.tsx` does not exist yet — PRD A is design-only, not yet implemented in code. The 6 new back buttons this PRD adds follow the existing hand-rolled convention instead. Flagged in §9 for whoever lands PRD A afterward.
- **Dynamic, in-progress-state gesture disabling** for `import/hevy`/`backup/restore` (e.g., blocking an accidental swipe-dismiss mid-restore). Flagged as a real, separate follow-up (§9.10) owned by whichever task owns those screens' internal state machines — this PRD only sets static, route-level gesture options in `app/_layout.tsx`.
- **Android-specific gesture UX polish** beyond confirming the mechanism already works there for free (§4.4).

## 4. Architecture Decisions

### 4.1 Tab structure & the Home relocation

**New `app/(tabs)/_layout.tsx` tab order (JSX order = display order = default/landing tab):** `home`, `workout`, `profile`. `exercises`'s `<Tabs.Screen>` is deleted entirely (not hidden — deleted, see §4.2 for why a hidden-tab approach is wrong here).

```tsx
<Tabs screenOptions={{ /* unchanged */ }}>
  <Tabs.Screen
    name="home"
    options={{
      title: 'Home',
      tabBarIcon: ({ color }) => (
        <Home size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
      ),
    }}
  />
  <Tabs.Screen name="workout" options={{ /* unchanged */ }} />
  <Tabs.Screen name="profile" options={{ /* unchanged */ }} />
</Tabs>
```
`Home` (lucide-react-native) replaces `History`; `TAB_ICON_SIZE`/`TAB_ICON_STROKE_WIDTH` constants unchanged (24 / 1.75), matching Hevy's own house/dumbbell/person icon set for exactly these 3 tabs.

**Route rename, resolved: rename the route segment (`history` → `home`), do NOT rename the underlying feature files.** `app/(tabs)/history/` → `app/(tabs)/home/` (physical directory rename: `_layout.tsx`, `index.tsx`, `calendar.tsx`, `[id].tsx`, `__tests__/history.test.tsx` → `__tests__/home.test.tsx`). The feature components those route files wire — `src/features/history/HistoryListScreen.tsx`, `HistoryWorkoutCard.tsx`, `HistoryDetailScreen.tsx`, `history-list-model.ts` — **keep their existing names and directory** (`src/features/history/`). Two reasons: (a) PRD G's entire retrofit table names these exact files by path — renaming them here would silently invalidate that batch-1 PRD's file references and risk two PRDs' dev-tasks conflicting on the same rename; (b) this codebase already treats "route file" and "feature file" as independently named by convention (e.g. `app/(tabs)/workout/index.tsx` wires a component called `RoutinesHubScreen`, not `WorkoutScreen`) — nothing requires them to match. The only user-visible content change in `HistoryListScreen.tsx` itself is its header `<Text>` from `"History"` to `"Home"` (currently line 225) and its internal `router.push('/history/...')` calls updating to `/home/...` (§6).

**Landing tab:** `app/index.tsx`'s `<Redirect href="/workout" />` becomes `<Redirect href="/home" />` — "first tab should be home" is read as "Home is also the app's default landing screen," matching Hevy's own dashboard-first pattern and the natural reading of "first."

**Full `history/*` → new-home audit** (scope item 3, nothing orphaned):

| Old route | New route | Disposition |
|---|---|---|
| `app/(tabs)/history/index.tsx` | `app/(tabs)/home/index.tsx` | Moved. Wires the same `HistoryListScreen`, now the Home tab's root. |
| `app/(tabs)/history/calendar.tsx` | `app/(tabs)/home/calendar.tsx` | Moved. Wires the same `CalendarScreen`. Reached from Home's Calendar icon button and Profile's Calendar shortcut (both updated, §6). |
| `app/(tabs)/history/[id].tsx` | `app/(tabs)/home/[id].tsx` | Moved. Wires the same `HistoryDetailScreen`. Reached from Home row taps, Calendar day taps, Profile's recent-workout taps, `ExerciseHistoryTab`/`ExerciseRecordsTab` taps, and the post-finish/post-edit `router.replace` calls in `ActiveWorkoutScreen.tsx`/`EditWorkoutScreen.tsx` (all updated, §6). |
| `app/(tabs)/history/_layout.tsx` | `app/(tabs)/home/_layout.tsx` | Moved + converted Slot→Stack (§4.4); `boundaryName` string `'tab:history'` → `'tab:home'`. |
| `app/(tabs)/history/__tests__/history.test.tsx` | `app/(tabs)/home/__tests__/home.test.tsx` | Moved; `initialUrl` strings updated (§7). |

No `history/*` sub-route is deleted or left unreachable — all 3 real routes move as a unit, preserving every current entry point.

### 4.2 Exercises tab removal & the Profile shortcut resolution

**Resolved: repurpose the existing "Exercises" `ShortcutCard`, not add a second one.** The user's own words — "put [Exercises] in the profile in the exercises button which already is there but doesn't have anything" — describe the existing card, wanting it fixed/repurposed, not a second card added alongside it. This also directly explains the "doesn't have anything" complaint: the card already works, it just points at a screen (`ArchivedExercisesScreen`) that's empty for virtually every user by default.

**`ExerciseBrowseScreen`'s route relocates to `app/(tabs)/profile/exercises.tsx`** (new file, nested under the Profile segment exactly like `profile/statistics.tsx`/`profile/measures/index.tsx` already are — same thin "route file wires real deps" wrapper as today's `app/(tabs)/exercises/index.tsx`, just relocated). `app/(tabs)/exercises/_layout.tsx` and `app/(tabs)/exercises/index.tsx` are **deleted** (not hidden — see below for why).

Two alternatives considered and rejected:
- **Hide the Exercises tab via `<Tabs.Screen name="exercises" options={{href: null}} />`, keeping the files where they are.** Rejected: `Tabs` is a lateral/parallel navigator (`TabRouter`), not a stack. Reaching a hidden tab via `router.push('/exercises')` switches the active tab with no push/pop semantics and no back-stack entry — there is structurally nothing to attach a working back button or swipe-back gesture to. That's the opposite of this PRD's own goal for this exact screen.
- **A new root-level `app/exercise/browse.tsx`**, matching the existing sibling convention (`app/exercise/[id].tsx`, `app/exercise/new.tsx` already live outside `(tabs)` for exactly the "avoid colliding with the plural `(tabs)/exercises/` segment" reason their own header comments give). Viable, but strictly more work (a new root `<Stack.Screen>` entry, no Slot→Stack conversion to piggyback on) for no behavioral gain — Profile is `ExerciseBrowseScreen`'s only entry point post-relocation, so there's no cross-tab-reachability need root-level would uniquely serve. Nesting under `profile/` is simpler and matches the 3 sibling routes already there, inheriting the Profile segment's own Stack conversion (§4.4) for free.

**`ExerciseBrowseScreen.tsx` needs a back button** — it correctly had none as a tab root; it needs one now that it's a pushed route. This is an explicit, narrow carve-out from the "don't touch its internal content" non-goal (§3): the addition is mechanically identical to the back button added to Statistics/Measures/Settings (§4.5), not a logic/content change.

**Profile `ShortcutCard` changes** (`ProfileScreen.tsx` lines 289–294): icon `ArchiveRestore` → `BookOpen` (carrying over the removed Exercises tab's own icon), `onPress` target `/profile/exercises-archived` → `/profile/exercises`. Label stays "Exercises" (now accurately describing what it opens).

**Archived-exercise management relocates into Settings**, as a new `ListRow` in the existing **WORKOUTS** section (`app/(tabs)/profile/settings/index.tsx`), alongside the Sounds/Plate Calculator/Warm-up Calculator nav rows already there (same `title` + `chevron`, no leading icon, matching those 3 siblings' exact shape):
```tsx
<ListRow
  testID="settings-archived-exercises-link"
  title="Archived Exercises"
  chevron
  onPress={() => router.push('/profile/exercises-archived')}
/>
```
Placed after the "Warm-up Calculator" row. `app/(tabs)/profile/exercises-archived.tsx` and `ArchivedExercisesScreen.tsx` are otherwise **unchanged** — only their entry point moves; the screen's own hand-rolled back button already works and needs no edit.

### 4.3 Why hand-rolled headers stay, not native Stack headers

Converting `<Slot/>` → `<Stack>` unlocks native header chrome, but this codebase's established convention (per PRD A's own `SheetHeader` work, and every screen read for this PRD) is "every screen hand-builds its own header `View`, `headerShown: false` everywhere." **Resolved: keep `headerShown: false` on every converted `<Stack>` too** — `<Stack screenOptions={{ headerShown: false }}>`, identical shape to the root `app/_layout.tsx`'s own `<Stack>`. The Stack conversion is adopted purely for its native-stack container (back button plumbing + gesture recognizer), not for its header row.

### 4.4 Slot → Stack conversion + gesture enablement

**The conversion (applies to `home`, `workout`, `profile` — `exercises` is deleted, §4.2):**
```tsx
// Before
import { Slot } from 'expo-router';
export default function ProfileTabLayout(): React.JSX.Element {
  return (
    <ErrorBoundary boundaryName="tab:profile" onError={reportBoundaryError}>
      <Slot />
    </ErrorBoundary>
  );
}

// After
import { Stack } from 'expo-router';
export default function ProfileTabLayout(): React.JSX.Element {
  return (
    <ErrorBoundary boundaryName="tab:profile" onError={reportBoundaryError}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />
    </ErrorBoundary>
  );
}
```
`workout/_layout.tsx` gets the identical conversion even though `app/(tabs)/workout/` has no nested routes today (only `index.tsx`) — included for architectural consistency (closes the gap uniformly across every tab segment) and because it's zero-risk: an empty Stack with one root screen behaves identically to the `Slot` it replaces until a nested route is ever added under `workout/`.

**Push-style gesture (tab sub-routes) — resolved, and simpler than the original brief assumed.** `gestureEnabled` in the installed `react-native-screens@~4.26.2` (confirmed by reading `node_modules/react-native-screens/src/types.tsx`) **defaults to `true`** ("Whether you can use gestures to dismiss this screen. Defaults to `true`. `@platform ios`"). So swipe-back for `StatisticsScreen`/`MeasuresHomeScreen`/Settings/`CalendarScreen`/`HistoryDetailScreen`/`ExerciseBrowseScreen` is a **free byproduct of the Slot→Stack conversion itself** — no additional prop is strictly required. `gestureEnabled: true` is still written explicitly above, matching this codebase's existing habit of being maximally explicit even about defaults (e.g. `headerShown: false` is set everywhere despite React Navigation defaults never requiring it) — self-documenting, zero functional difference. A tab root (Home/Workout/Profile's own `index.tsx`) has nothing behind it in its own stack, so a swipe there is naturally a no-op — no special-casing needed.

**Android:** `gestureEnabled` (and `fullScreenSwipeEnabled`/`swipeDirection` below) are tagged `@platform ios` in `react-native-screens`' own type declarations. Android's back gesture/hardware back button is wired up automatically by React Navigation once a route is hosted by a real Stack navigator (not `Slot`) — no additional prop needed there; this is a platform-level capability the Slot→Stack conversion alone restores.

**Root-level `fullScreenModal` swipe-to-dismiss (the 6 routes in `app/_layout.tsx`) — resolved with concrete version-specific evidence.** `presentation: 'fullScreenModal'` maps to `UIModalPresentationFullScreen` on iOS (confirmed in `react-native-screens`' own doc comment on `stackPresentation`) — a native modal presentation style with **no built-in interactive swipe-to-dismiss** the way `push` (edge-swipe pop) or `pageSheet`/`formSheet` (native pan-down-to-dismiss) have. `gestureEnabled`'s default-`true` therefore does **not**, by itself, produce a working gesture on these 6 routes — there's no native pop transition to attach it to. `react-native-screens@~4.26.2` instead exposes:
- `fullScreenSwipeEnabled?: boolean` — "Whether the swipe gesture should work on whole screen... defaults to `false` on iOS < 26 and `true` for iOS ≥ 26" (a custom pan-gesture recognizer pre-26; native `interactiveContentPopGestureRecognizer` on 26+).
- `swipeDirection?: 'vertical' | 'horizontal'` — default `horizontal`. Critically: **"When using `vertical` option, options `fullScreenSwipeEnabled: true`, `customAnimationOnSwipe: true` and `stackAnimation: 'slide_from_bottom'` are set by default"** — i.e. `swipeDirection: 'vertical'` is a purpose-built, one-line convenience specifically for "this modal slides up from the bottom, dismiss it by swiping down," which is exactly the shape of all 6 of these routes (`animation: 'slide_from_bottom'` already set on every one).

**Resolved decision — deliberate deviation from a literal "slide left" for this one class of route:** apply `swipeDirection: 'vertical'` (swipe **down** to dismiss) to the 6 `fullScreenModal` routes, not a horizontal/left-edge swipe:
```tsx
<Stack.Screen
  name="workout/active"
  options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', swipeDirection: 'vertical' }}
/>
// ...identically for routine/new, routine/[id]/edit, workout/[id]/edit, import/hevy, backup/restore
```
Reasoning: (1) `react-native-screens` itself pairs vertical swipe with `slide_from_bottom` by default — fighting that pairing (forcing a horizontal swipe-left dismiss on a screen that visually entered by sliding up from the bottom) would be gesture-direction-mismatched and disorienting relative to its own entrance animation; (2) it matches the platform-idiomatic convention for full-screen modal sheets (a slide-up presentation pairs with swipe-down dismissal, mirroring Apple's own sheet-style modal HIG); (3) the user's literal complaint — "there is no back button to navigate to when I click on something... if I slide from left it should go back" — was raised specifically about Profile's own sub-screens (ordinary pushed detail screens), not the 6 full-screen logger/editor modals; a spatially-consistent swipe-down satisfies the underlying intent ("let me dismiss this by swiping, not hunt for a button") exactly as well as a literal left-swipe would, without the mismatch cost. `workout/active` specifically: dismissing it via swipe is a normal, non-destructive "minimize" action — the workout keeps running in `activeWorkoutStore`, and `GlobalWorkoutBar` already exists precisely to let the user reopen it later; a swipe-dismiss is structurally the same action as tapping outside/back today, just gesture-driven.

**No new native dependency or rebuild step required.** `fullScreenSwipeEnabled`/`swipeDirection` are already part of the *installed* `react-native-screens@~4.26.2`'s compiled native surface (their presence in the package's shipped TypeScript declarations proves the native code already supports them) — this is a pure JS-side prop change, picked up on a normal reload like any other `<Stack.Screen options>` edit, not a new pod/gradle link.

**Flagged as a genuine on-device verification item (§8), not asserted confidently:** the type-level documentation confirms the *prop contract* (what `swipeDirection: 'vertical'` sets and its version-dependent defaults) but not the lived feel/hitbox size, nor its interaction with the `GestureHandlerRootView` already wrapping the app (`app/_layout.tsx` lines ~380–381, confirmed already correctly in place). The doc's own pre-/post-iOS-26 mechanism split (custom pan recognizer vs. native `interactiveContentPopGestureRecognizer`) means this should be checked on both an iOS-26+ and a pre-26 device/simulator before considering it shipped.

**`import/hevy` / `backup/restore` follow-up, deliberately deferred (§9.10):** both are multi-step flows (`backup/restore`'s own header comment: "picker → double-confirm → progress → report") where an accidental swipe-dismiss mid-operation is a real UX risk greater than a mis-tap on a Cancel button would be. A proper fix (dynamically setting `gestureEnabled: false` only while a mutating operation is actively in flight, via `navigation.setOptions` from inside the screen) requires screen-level state awareness that a static root `<Stack.Screen options>` object can't express — this PRD ships the uniform `swipeDirection: 'vertical'` on all 6 routes now (matching the user's blanket "all screens" ask) and flags the dynamic in-progress guard as a follow-up owned by whichever task owns those two screens' internal logic, not blocking this PRD.

### 4.5 Back button additions

Six screens, all reached via `router.push` inside a now-real `<Stack>` (tab-nested) or already inside the root `<Stack>` (none needed there — all 6 are tab-nested), get an explicit back button in this codebase's existing convention — `ChevronLeft` (lucide-react-native, `size=24 strokeWidth=1.75`) + `Pressable` (`hitSlop={8}`) + `router.back()`, placed at the start of each screen's existing top header row (all 6 already have a `View` at `paddingTop: insets.top + spacing['4']` with a title `Text` — the button is added as a sibling before that `Text`, exactly matching `ArchivedExercisesScreen.tsx`'s own already-shipped pattern, lines 84–91):

| Screen | File | Current header state |
|---|---|---|
| Statistics | `src/features/stats/StatisticsScreen.tsx` | Title only (`typography.title2`, line 323), no back control |
| Measures | `src/features/measurements/MeasuresHomeScreen.tsx` | Title only (`typography.title1`, line 114), no back control |
| Settings | `app/(tabs)/profile/settings/index.tsx` | Title-less `ScrollView` starting directly with a "THEME" section header (line ~348), no back control |
| Calendar | `src/features/calendar/CalendarScreen.tsx` | Title + streak subtitle (line 185), no back control — found during this PRD's own file read, not flagged in the original discovery pass |
| History detail | `src/features/history/HistoryDetailScreen.tsx` | Title (workout name) + `⋯` menu button, no back control — same finding |
| Exercise browse | `src/features/exercises/ExerciseBrowseScreen.tsx` | Title only (`typography.title1`, line 190), no back control — needed only because of this PRD's own relocation (§4.2), not a pre-existing gap |

Settings needs a small additional structural change since its `ScrollView` currently has no header row at all (just starts at the THEME section) — a new header `View` (same `flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + spacing['4']` shape every other screen already uses) is added above the existing `ScrollView`, containing the back button + a "Settings" title.

## 5. Route Change Summary

| Old route | New route | Status |
|---|---|---|
| `/history` | `/home` | Renamed, moved (§4.1) |
| `/history/calendar` | `/home/calendar` | Renamed, moved |
| `/history/[id]` | `/home/[id]` | Renamed, moved |
| `/exercises` (tab) | `/profile/exercises` | Moved out of the tab bar, nested under Profile (§4.2) |
| `/profile/exercises-archived` | `/profile/exercises-archived` | Unchanged route/component; entry point moves from a Profile `ShortcutCard` to a Settings `ListRow` |
| `/profile/statistics`, `/profile/measures` | unchanged | Back button added (§4.5), no route change |
| `/profile/settings` | unchanged | Back button + header row added, no route change |
| 6 root `fullScreenModal` routes | unchanged paths | `swipeDirection: 'vertical'` added (§4.4) |

No route in this table is deleted without a replacement; every `history/*`/`exercises/*` path from the original 4-tab tree resolves to exactly one row above.

## 6. Frontend Change Summary

| # | File | Change |
|---|---|---|
| 1 | `app/(tabs)/_layout.tsx` | 3 `Tabs.Screen`s (`home`, `workout`, `profile`), `home` first; `exercises` entry deleted; `Home` icon imported from `lucide-react-native` replacing `History`/`BookOpen` |
| 2 | `app/(tabs)/history/` → `app/(tabs)/home/` | Directory rename: `_layout.tsx` (Slot→Stack, `boundaryName` → `'tab:home'`), `index.tsx`, `calendar.tsx`, `[id].tsx` all moved with header-comment updates only (wiring unchanged) |
| 3 | `app/(tabs)/workout/_layout.tsx` | Slot→Stack conversion (§4.4), no route content change |
| 4 | `app/(tabs)/profile/_layout.tsx` | Slot→Stack conversion |
| 5 | `app/(tabs)/exercises/_layout.tsx`, `app/(tabs)/exercises/index.tsx` | Deleted |
| 6 | `app/(tabs)/profile/exercises.tsx` | New file — thin wrapper wiring `ExerciseBrowseScreen` (relocated from #5), identical construction to the deleted `exercises/index.tsx` |
| 7 | `app/index.tsx` | `<Redirect href="/workout" />` → `<Redirect href="/home" />` |
| 8 | `app/_layout.tsx` | 6 `<Stack.Screen>` fullScreenModal entries each gain `swipeDirection: 'vertical'` |
| 9 | `src/features/history/HistoryListScreen.tsx` | Header `<Text>` `"History"` → `"Home"` (line 225); `router.push('/history/${workoutId}')` → `/home/${workoutId}` (line 185); `router.push('/history/calendar')` → `/home/calendar` (line 193) |
| 10 | `src/features/exercises/ExerciseBrowseScreen.tsx` | Back button added to existing header row |
| 11 | `src/features/stats/StatisticsScreen.tsx` | Back button added |
| 12 | `src/features/measurements/MeasuresHomeScreen.tsx` | Back button added |
| 13 | `app/(tabs)/profile/settings/index.tsx` | Header row + back button added; new "Archived Exercises" `ListRow` in the WORKOUTS section |
| 14 | `src/features/calendar/CalendarScreen.tsx` | Back button added; `router.push('/history/${workoutId}')` → `/home/${workoutId}` (line 160) |
| 15 | `src/features/history/HistoryDetailScreen.tsx` | Back button added |
| 16 | `src/features/profile/ProfileScreen.tsx` | "Exercises" `ShortcutCard`: icon `ArchiveRestore`→`BookOpen`, target `/profile/exercises-archived`→`/profile/exercises` (lines 289–294); Calendar shortcut target `/history/calendar`→`/home/calendar` (line 305); "See All" target `/history`→`/home` (line 315); recent-card press target `/history/${workoutId}`→`/home/${workoutId}` (line 335); header doc comment updated to match |
| 17 | `src/features/workout/EditWorkoutScreen.tsx` | `router.replace('/history/${workoutId}')` → `/home/${workoutId}` (line 409) |
| 18 | `src/features/workout/ActiveWorkoutScreen.tsx` | `router.replace('/history/${finished.id}')` → `/home/${finished.id}` (line 704) |
| 19 | `src/features/exercises/ExerciseHistoryTab.tsx` | `router.push('/history/${workoutId}')` → `/home/${workoutId}` (line 163) |
| 20 | `src/features/exercises/ExerciseRecordsTab.tsx` | Same rename, 2 call sites (lines 94, 175) |
| 21 | `app/__tests__/tabs-layout.test.tsx` | Rewritten for 3 tabs (§7) |

## 7. Testing

- **`app/__tests__/tabs-layout.test.tsx`** (existing smoke test, rewritten): redirect assertion (`/` → Home tab's empty/seed state, not Workout's); 3 navigation tests (`/home`, `/workout`, `/profile`) replacing the current 4; the old "navigates to the Exercises tab" case removed (no longer a tab) and replaced by a new case under `app/(tabs)/profile/__tests__/` (or inline here) proving `/profile/exercises` renders the real `ExerciseBrowseScreen`.
- **`app/(tabs)/history/__tests__/history.test.tsx` → `app/(tabs)/home/__tests__/home.test.tsx`**: moved, `initialUrl` strings `/history` → `/home` and `/history/${id}` → `/home/${id}` updated; assertions (`'Morning Workout'`, `'Bench Press'`, `'Workout not found'`) unchanged since they test the same underlying screens.
- **New back-button tests** for the 6 screens in §4.5, following the same assertion shape `ArchivedExercisesScreen.test.tsx` already establishes for its own back button (render → find the back `Pressable` by `testID`/`accessibilityLabel="Back"` → fire press → assert `router.back()` called). `src/features/exercises/__tests__/ArchivedExercisesScreen.test.tsx` is the concrete precedent to copy the pattern from.
- **New test**: `ProfileScreen`'s "Exercises" shortcut navigates to `/profile/exercises` (not `/profile/exercises-archived`); a new/updated test for the Settings screen proves the "Archived Exercises" row navigates to `/profile/exercises-archived`.
- **`app/(tabs)/workout/__tests__/index.test.tsx`**: unaffected by the Slot→Stack conversion (a Stack with a single root screen and no nested children renders identically to the `Slot` it replaces for this route) — confirm it still passes unmodified as a regression check, not a required edit.
- **Gesture behavior is explicitly not unit-testable in this codebase's existing Jest/RNTL setup** — no real native gesture recognizer runs under Jest, so `gestureEnabled`/`swipeDirection` values can at most be asserted as passed-through props (low value, not prescribed here); actual swipe-back/swipe-to-dismiss verification is manual/on-device only (§8).

## 8. Manual Intervention Required From You

1. **On-device swipe verification for the 6 `fullScreenModal` routes** (§4.4) — check both an iOS ≥26 device/simulator (native `interactiveContentPopGestureRecognizer` path) and a pre-26 one (custom pan-recognizer fallback), confirming the vertical swipe-down dismiss feels right against each route's `slide_from_bottom` entrance, especially `workout/active` (an in-progress workout) and the two multi-step flows (`import/hevy`, `backup/restore`) called out as gesture-risk in §4.4/§9.10. Not verifiable via Jest/RNTL — the type-level research in §4.4 confirms the prop contract, not the on-device feel.
2. **Quick eyeball of new/changed user-facing copy and icons** once implemented, same "not a blocking approval gate, but worth a look" posture PRD A used for its own new buttons: the "Home" tab label + `Home` icon, the repurposed "Exercises" shortcut's new destination + `BookOpen` icon, and the new "Archived Exercises" Settings row's label/placement.

No external services, secrets, accounts, or backend changes are involved — everything in this PRD is client-side routing/navigation configuration.

## 9. Open Questions & Decisions

1. **Tab order and landing screen.** [RESOLVED: Home first in JSX order (= display order = default focused tab), `app/index.tsx`'s redirect target changes to `/home` — "first tab" is read as also meaning "default landing screen," matching Hevy's own dashboard-first pattern.]
2. **Route rename scope — rename the route only, or also the underlying feature files/component names?** [RESOLVED: route only (`history` → `home` at the `app/(tabs)/` directory level). Renaming `src/features/history/*` too would invalidate PRD G's file-scoped retrofit table, which names those exact paths; this codebase already treats route-file and feature-file names as independent by convention.]
3. **Native `<Stack>` headers vs. this codebase's hand-rolled-header convention, once Stack unlocks native chrome.** [RESOLVED: keep `headerShown: false` on every converted `<Stack>`, same as the root layout's own `<Stack>` — Stack is adopted only for its native-stack container (back-button plumbing + gesture recognizer), not its header row, preserving the established "every screen hand-builds its own header View" convention.]
4. **Profile "Exercises" shortcut: repurpose the existing card, or add a second one?** [RESOLVED: repurpose. The user's own phrasing ("the exercises button which already is there") describes the existing card; a second card wasn't requested and would leave two exercise-adjacent shortcuts, one of them the same near-always-empty archived list that prompted the complaint.]
5. **Where does `ExerciseBrowseScreen`'s route live once the Exercises tab is gone — hidden tab (`href: null`), root-level `app/exercise/browse.tsx`, or nested under `profile/`?** [RESOLVED: nested under `profile/` (`app/(tabs)/profile/exercises.tsx`). A hidden tab is architecturally wrong (Tabs is a lateral navigator — no push/pop semantics to attach a back button to, per §4.2). Root-level is viable but strictly more work for no behavioral gain since Profile is the screen's only entry point post-relocation; nesting under `profile/` reuses that segment's own Stack conversion for free.]
6. **Does adding a back button to `ExerciseBrowseScreen.tsx` violate the "don't touch its internal content" non-goal?** [RESOLVED: no — explicit, narrow carve-out. The addition is a mechanical necessity of the relocation decision (#5), identical in shape to the back button added to Statistics/Measures/Settings for an unrelated pre-existing reason, not a redesign of the screen's search/filter/create logic.]
7. **Where does archived-exercise management move to?** [RESOLVED: a new `ListRow` in Settings' existing WORKOUTS section, alongside Sounds/Plate Calculator/Warm-up Calculator — thematically it's exercise-library management, matching that section's existing nav-row siblings; the route/component (`/profile/exercises-archived`, `ArchivedExercisesScreen.tsx`) is otherwise untouched.]
8. **Push-style swipe-back on tab sub-routes — does it need an explicit `gestureEnabled` prop?** [RESOLVED: no, `react-native-screens@~4.26.2` defaults `gestureEnabled` to `true` — confirmed by reading its shipped type declarations. Set explicitly anyway for self-documentation, matching this codebase's existing habit (e.g. explicit `headerShown: false` everywhere). This is a materially simpler answer than the original discovery pass assumed.]
9. **`fullScreenModal` swipe-to-dismiss — is `gestureEnabled` alone sufficient, and what direction should the swipe be?** [RESOLVED: `gestureEnabled` alone is *not* sufficient (`UIModalPresentationFullScreen` has no native interactive-pop transition to attach it to); `swipeDirection: 'vertical'` is the correct one-line fix — it bundles `fullScreenSwipeEnabled: true` + `customAnimationOnSwipe: true` + `stackAnimation: 'slide_from_bottom'` automatically per `react-native-screens`' own documented default, which is exactly the shape all 6 of these routes already have. Direction is **vertical (swipe down)**, a deliberate, reasoned deviation from a literal "slide left" reading for this one class of route — see §4.4 for the full reasoning (gesture-animation consistency, platform HIG convention, and that the user's literal complaint was about ordinary pushed screens, not full-screen modals).]
10. **`import/hevy`/`backup/restore` mid-flow accidental-swipe risk.** [RESOLVED: ship the uniform `swipeDirection: 'vertical'` now (matches the user's blanket "all screens" ask and this PRD's own scope, which is navigator-level plumbing only); flag a dynamic in-progress `gestureEnabled: false` guard as a follow-up owned by whichever task owns those two screens' internal step-state machines — not blocking, since it requires screen-level `navigation.setOptions` wiring this PRD doesn't otherwise touch.]
11. **Full floating-circular back-button / floating pill tab-bar visual redesign — bundle now or defer?** [RESOLVED: defer both. Matches the discovery pass's own lean ("the smaller, consistent-with-existing-code option unless it's trivial to do fully") — neither is trivial (the tab bar redesign touches shared chrome every screen sees; the circular-button redesign rivals PRD A's own `SheetHeader` scope) and this PRD is already the largest structural change in the batch. Flagged as plausible future work, not this PRD's scope.]
12. **Convert `workout/_layout.tsx` even though it has no nested routes today?** [RESOLVED: yes — architectural consistency across all 3 remaining tab segments, zero risk (an empty `<Stack>` with one root screen behaves identically to the `Slot` it replaces), and it's the segment least likely to stay nested-route-free forever.]
13. **Android gesture parity.** [RESOLVED: automatic, no extra prop needed — `gestureEnabled`/`fullScreenSwipeEnabled`/`swipeDirection` are all iOS-only per `react-native-screens`' own type tags; Android's OS-level back gesture/hardware back button wires up through React Navigation automatically once a route is hosted by a real Stack (restored by the Slot→Stack conversion itself), independent of these iOS-specific props.]
14. **Should the 6 new back buttons pre-adopt PRD A's `SheetHeader`?** [RESOLVED: no — `src/ui/SheetHeader.tsx` doesn't exist in code yet (PRD A is design-only, unimplemented as of this PRD). The 6 new buttons use this codebase's current hand-rolled convention. Flagged for whoever lands PRD A afterward: `SheetHeader` is explicitly Sheet-agnostic by design (per PRD A §4.2), so retrofitting these 6 screens onto it later should be a small, non-conflicting follow-up, not a rework.]
