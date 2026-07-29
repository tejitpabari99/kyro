# PRD D — Exercise Picker Settings Icon

Sub-project **D** of the Hevy-style UI/UX overhaul (8-PRD decomposition). Loosely
depends on **A** (`sheet-header-footer-foundation`) for header-row conventions.

**Dependency status at time of writing:** `docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/PRD.md`
does not exist yet (checked directly — the directory itself isn't present under
`docs/agent_files/tasks/2026-07-28/`). This PRD proceeds independently, using the
header convention `ExercisePickerSheet.tsx` *already* implements today (title
left-aligned, primary action right-aligned via `justifyContent: 'space-between'`)
as its own ground truth, and documents the reconciliation risk explicitly in
Open Questions §9.1.

---

## 1. Problem

The user asked: **"Why is settings not implemented on the add exercise
option?"**

This is a question, not a spec, and no user is available right now to
clarify what "settings" should mean in this context. Direct inspection of
the codebase resolves the factual half of the question:

- `src/features/workout/ExercisePickerSheet.tsx` (the sheet opened by
  `ActiveWorkoutScreen`'s `+ Add Exercise` footer button, `mode="add"`, and
  by `ExerciseCard`'s "Replace Exercise" menu item, `mode="replace"`) has
  **no settings/gear icon or settings-navigation affordance anywhere** —
  confirmed by grepping the file for `Settings`, `gear`, `Cog`, and by
  reading the full header-row JSX (lines 221–243).
- `src/features/exercises/ExerciseBrowseScreen.tsx` (the standalone
  `Exercises` tab) likewise has no settings affordance — its header only has
  a title and a `Plus` (create-exercise) icon.
- The only "settings" references in either file are `useSettingsStore`
  *reads* (e.g. `weight_unit` for display formatting elsewhere in the
  broader feature) — never a Settings icon or nav call.

So nothing is "unimplemented" in the sense of a broken stub (contrast with
`ActiveWorkoutScreen`'s own Settings footer button, owned by PRD B, which
*does* exist today but is wired to `Alert.alert('Workout Settings',
'Workout settings arrive in M2-17.')` — a real stub). Here, the affordance
was simply never built. The product question underneath — "should there be
one, and what should it do?" — is what this PRD resolves.

---

## 2. Goals

1. Decide, with documented reasoning, what "Settings" should mean on the
   exercise picker (§9.1).
2. Add a small, reversible gear-icon affordance to `ExercisePickerSheet`'s
   header that opens a lightweight options sheet.
3. Back every option in that sheet with state or a screen that **already
   exists** — no new global settings keys, no new settings-schema fields.
4. Respect PRD A's header-row convention as best understood today (title
   stays left-aligned; new right-side icon groups with the existing Cancel
   button rather than competing with it for the same position).

## 3. Non-Goals

- Do **not** rebuild or duplicate the app-wide settings screen
  (`app/(tabs)/profile/settings/index.tsx`) — it already has 20+ rows across
  THEME / WEIGHT UNIT / GENERAL / WORKOUTS / NOTIFICATIONS / DATA / ABOUT.
  Nothing here re-implements any of it; the new sheet only *links out* to it.
- Do **not** add any new `SettingsKey` to `src/data/settings/settings-schema.ts`.
  Every candidate "exercise-picker preference" this PRD considered (default
  equipment/muscle filter, default sort, etc.) is either already covered
  elsewhere or not worth a persisted global setting — see §9.2.
- Do **not** touch `ExerciseBrowseScreen.tsx` (the standalone Exercises tab).
  The user's literal question was about "the add exercise option" — see §9.3
  for why the standalone browse screen is explicitly out of scope here.
- Do **not** touch `ActiveWorkoutScreen`'s own stubbed Settings footer
  button — that is PRD B's (`active-workout-footer-buttons`) surface, not
  this component's.

---

## 4. Architecture Decisions

### 4.1 New component: `src/features/workout/ExercisePickerOptionsSheet.tsx`

A small, single-purpose, half-detent `Sheet` — the same "nested sheet opened
from inside `ExercisePickerSheet`" shape already established twice in this
file (`FilterOptionSheet` for the equipment/muscle chips, `ExerciseDetailSheet`
for the ⓘ info button). New file rather than inlining into
`ExercisePickerSheet.tsx` because every other nested sheet this component
already opens is its own file — consistent with this codebase's one-
component-per-file convention, and keeps `ExercisePickerSheet.tsx` (already
~375 lines) from growing further.

Two rows only, both backed by things that already exist:

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

No explicit header/title/Close button inside this sheet — same posture
`FilterOptionSheet` almost has (it has a title + Clear, but no Close/Cancel;
dismissal is drag/backdrop). This sheet is even smaller (two rows, no
per-option selection state to label), so a bare `ListRow` list is enough;
`Sheet`'s own grabber + backdrop-tap + drag-to-dismiss already cover
"how do I close this."

### 4.2 `src/features/workout/ExercisePickerSheet.tsx` — header row

**Before** (lines 221–243, the outer `<Sheet>` opening plus header `<View>`):

```tsx
  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View style={{ flex: 1 }}>
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
  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View style={{ flex: 1 }}>
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

Placement rationale:

- The title stays exactly where it is today (left-aligned, pinned by
  `justifyContent: 'space-between'` against whatever sits on the right) —
  no centering change, so this reads as compatible with PRD A's
  "centered-title-unless-side-buttons" rule under *either* resolution PRD A
  lands on: this header already has a right-side button today (Cancel), so
  it's already in the "has a right button → not centered" bucket before this
  change: adding a second right-side element doesn't newly trigger that
  rule, it just adds to a header that already qualified.
- The gear icon sits **to the left of Cancel**, not to its right or in a
  third position, so Cancel's tap target — the one-thumb, muscle-memory
  dismiss action every existing picker session already uses — doesn't move.
  Both are grouped in one right-aligned `View` so `justifyContent:
  'space-between'` on the parent only ever sees two children (title, right
  group), unchanged from today's two-child layout.
- Icon size 22 (slightly under `ProfileScreen`'s 24, since it now sits next
  to a `size="sm"` `Button` rather than alone) with the same `strokeWidth:
  1.75` / `colors.text.secondary` styling `ProfileScreen`'s own gear-icon
  button already uses (`src/features/profile/ProfileScreen.tsx:256`) — reuses
  an established icon-button visual language rather than inventing a new one.
- `accessibilityLabel="List options"`, not `"Settings"` — deliberately
  distinct from `ProfileScreen`'s `"Settings"` label. This icon does not
  open the app's Settings screen directly; it opens a small local sheet that
  *also* links to Settings. Labeling it "Settings" would over-promise what
  one tap does.

### 4.3 `src/features/workout/ExercisePickerSheet.tsx` — state, handlers, imports

**New imports** (add to existing `react-native` and top-of-file imports):

```tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
// ...
import { router } from 'expo-router';
import { Settings as SettingsIcon } from 'lucide-react-native';
```

**New local state**, alongside the existing picker state block:

```tsx
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
```

Not added to the `wasVisible` reset block (the `if (visible !== wasVisible)`
block that clears `searchInput`/`selectedIds`/etc. on each open). Precedent:
`equipmentSheetVisible`/`muscleSheetVisible` — the two other nested-sheet
visibility flags this component already owns — aren't reset there either.
`ExercisePickerSheet` itself never unmounts (only `Sheet`'s internal tree
does, per that component's own file header), which is exactly why the
`wasVisible` hack exists for the state that *does* need resetting; sub-sheet
open/closed flags default `false` and get explicitly closed by their own
`onDismiss`, so they've never needed the same treatment.

**New handlers**, alongside `handleConfirmAdd`:

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

`handleOpenAppSettings` closes the *picker* sheet (via the caller's own
`onDismiss`) before navigating, rather than pushing a new route while the
picker's full-detent modal is still mounted on top of it. `Sheet`'s own file
header is explicit that sheets are "component-level ... not routes" and must
not disturb navigation state while open; navigating away while still visible
would leave a stale full-screen sheet mounted over whatever `/profile/settings`
renders underneath it, then reappear if the user ever backs out. Dismissing
first, then pushing, is the same "close, then act" ordering
`handleConfirmAdd` already uses for `onAdd?.(...); onDismiss();` (reversed
here because navigation, unlike `onAdd`, needs the sheet gone *first*, not
after).

**Reset-filters scope**: only `equipmentFilter`/`muscleFilter` — deliberately
**not** `searchInput`. The suggested minimal scope in this PRD's brief names
"default equipment/muscle filter reset" specifically; clearing an in-progress
search query the user is actively typing would be a bigger, more surprising
action than "reset filters" implies, and search text isn't rendered as an
active-state `Chip` the way the two filters are — there's no existing visual
"this is currently filtered" signal for search the way `Chip`'s `active`
prop gives the two filter chips.

**Render the new sheet**, alongside the other nested sheets at the bottom of
the JSX (after `ExerciseDetailSheet`):

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

Plus the new import:

```tsx
import { ExercisePickerOptionsSheet } from './ExercisePickerOptionsSheet';
```

### 4.4 Files touched — summary

| File | Change |
|---|---|
| `src/features/workout/ExercisePickerSheet.tsx` | Add gear icon to header (both `mode="add"` and `mode="replace"` — see §9.4 for why not mode-gated), new `optionsSheetVisible` state, two new handlers, render `ExercisePickerOptionsSheet` |
| `src/features/workout/ExercisePickerOptionsSheet.tsx` | **New file** — two-row options sheet |
| `src/features/exercises/ExerciseBrowseScreen.tsx` | **Not touched** — see §9.3 |
| `src/data/settings/settings-schema.ts` | **Not touched** — no new settings keys (§9.2) |
| `app/(tabs)/profile/settings/index.tsx` | **Not touched** — link-out target only |

---

## 5. API Change Summary

None. No repository, driver, schema, or settings-key changes. `router.push('/profile/settings')`
targets a route that already exists and is already reachable from `ProfileScreen`'s
own gear icon — this PRD adds a second entry point to the same existing route, not a new route.

---

## 6. Frontend Change Summary

- `ExercisePickerSheet` header gains a gear ("List options") icon button,
  positioned left of the existing Cancel button, present in both `add` and
  `replace` modes.
- Tapping it opens a new half-detent `ExercisePickerOptionsSheet` with:
  - **Reset Filters** — clears the picker's own Equipment/Muscle chip
    selections (disabled/greyed when neither is active).
  - **More Settings** — closes the picker and navigates to the existing
    `/profile/settings` screen.
- No visual change to `ExerciseBrowseScreen`, no visual change to the rest
  of `ExercisePickerSheet` (search bar, chips, superset toggle, list, confirm
  button all untouched).

---

## 7. Testing

No dedicated `ExercisePickerSheet.test.tsx` exists today — the component is
currently exercised indirectly through its consumers
(`src/features/routines/__tests__/RoutineEditorScreen.test.tsx`, and
`ActiveWorkoutScreen`'s own test suite via the `+ Add Exercise` flow). New
coverage should follow whichever of those two host suites already renders
`ExercisePickerSheet` with `mode="add"` open, plus one `mode="replace"` case
if that path is covered anywhere — grep for `exercise-picker-sheet` in
existing test files to find the right host suite before adding new cases,
rather than standing up a first-ever isolated `ExercisePickerSheet.test.tsx`
as part of this change (keeps this PRD's footprint additive, matching §3's
non-goals).

Cases to add, wherever that ends up:

1. Gear icon (`${testID}-options-button`) renders in both `mode="add"` and
   `mode="replace"`, and opens `ExercisePickerOptionsSheet` on press.
2. `Reset Filters` row is disabled (no-op on press) when no chip is active;
   becomes enabled once either `equipmentFilter` or `muscleFilter` is set
   via its `FilterOptionSheet`.
3. Pressing `Reset Filters` with a filter active clears both chips back to
   "All Equipment"/"All Muscles" and closes the options sheet, without
   closing the picker itself or losing the current `selectedIds`/search text.
4. Pressing `More Settings` calls the picker's `onDismiss`, and calls
   `router.push('/profile/settings')` — mock `expo-router`'s `router.push`
   the same way `ExerciseBrowseScreen.test.tsx` already does
   (`jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: jest.fn() } }))`)
   and assert both calls happen, in order.
5. Drag-to-dismiss / backdrop-tap on `ExercisePickerOptionsSheet` closes only
   that sheet, leaving the picker itself open (existing `Sheet` behavior —
   regression-guard only, not new logic).

---

## 8. Manual Intervention Required From You

- None required to land this PRD's implementation — every dependency
  (`Sheet`, `ListRow`, `router`, `useSettingsStore` indirectly via
  `/profile/settings`) already exists and is already wired.
- **Recommended, not required**: a human product pass on §9.1's scope
  decision before or shortly after this lands — see that section. This is
  the one PRD in the 8-part decomposition built entirely from an
  underspecified question rather than an observed bug or a named spec
  section, so the resolution below is a best-effort judgment call, not a
  transcription of an existing requirement.

---

## 9. Open Questions & Decisions

### 9.1 What should "Settings" mean on the exercise picker? — the central judgment call

**[RESOLVED: two-row options sheet — "Reset Filters" (local) + "More
Settings" link-out (global) — pending human product sign-off]**

This is the single most product-judgment-heavy decision in this 8-PRD batch,
made without a user available to confirm intent. Documenting the full
reasoning so it's auditable and easy to overturn:

- The user's question presupposes settings *should* exist here ("why is
  [it] not implemented") but gives no spec for what it should contain. There
  is no prior Kyro doc section (checked 02/03/04/05/06/07 §s referenced
  throughout this codebase's own comments) that calls for an exercise-picker-
  specific settings surface — 02 §13's Settings → Workouts group (already
  fully built, `M2-17`) is the closest existing concept, and it already
  covers every workout-behavior setting (RPE, rest timer, superset
  scrolling, etc.) that would plausibly matter while picking exercises.
- I fetched the three Hevy screenshots named in this task's brief
  (Img‑5173‑5174, Img‑4775‑4776‑4777, img‑8474‑8475‑8476) to check whether
  Hevy's own "Add Exercise" screen shows a gear/settings affordance. None of
  the three actually depict that screen: Img‑5173‑5174 shows the Workout tab
  home (routine list) and an in-progress active-workout logging screen;
  Img‑4775‑4776‑4777 shows an exercise-detail screen (Summary/History/How‑to
  tabs with a 1RM graph); img‑8474‑8475‑8476 shows the post-workout "Nice
  work!" share card. No "Add Exercise" / exercise-picker screen is present
  in any of the three, so this brief's suggested Hevy comparison is
  inconclusive by construction, not just by my reading of it. What *is*
  visible across all nine screens: no gear/settings icon appears in any
  header shown — headers use back arrows, a tab strip, or a "⋯" overflow
  menu (on the exercise-detail screen only) — consistent with, though not
  strong evidence for, Hevy not putting a settings affordance on exercise-
  related screens generally. Per this task's own instruction not to
  over-invest here, I did not chase down a real add-exercise screenshot and
  instead fell back to the suggested minimal, low-risk, easily-revisable
  scope below.
- Given no spec and inconclusive competitive reference, I resolved this
  toward the smallest thing that is (a) genuinely useful, (b) backed by
  state/screens that already exist (no new settings-schema keys, no new
  screen to design from scratch), and (c) trivially reversible (delete one
  new file + revert one header edit) if a human reviewer decides it's the
  wrong shape:
  - **"Reset Filters"** is the one item that is *actually* picker-local and
    not already served by the app-wide Settings screen — the Equipment/
    Muscle `Chip` filters are `ExercisePickerSheet`'s own `useState`, reset
    only on next sheet open (§ code comment: "Reset every transient picker
    state on each open transition"), so mid-session there was previously no
    quick way to clear both chips without tapping each `FilterOptionSheet`'s
    own `Clear` individually.
  - **"More Settings"** acknowledges that most of what a user might actually
    want from "settings" while picking an exercise (rest timer default, RPE
    tracking, previous-values source) already lives in
    `/profile/settings`'s WORKOUTS group — linking to it, rather than
    re-surfacing a subset inline, avoids two sources of truth for the same
    toggles (the exact trap `Sounds`/`Plate Calculator`/`Warm-up Calculator`
    already avoid in that same screen by being nav rows, not inlined
    toggles).
- **Flagged for human sign-off**: whether this is the *right* two items, or
  whether the real underlying ask was something else entirely (e.g. "I
  expected the gear icon from `ActiveWorkoutScreen`'s footer to reach
  something, and it doesn't" — which is actually PRD B's stub, not this
  screen). Recommend a quick confirm with the user once available: does
  "Reset Filters + link to Settings" satisfy the original question, or was
  there a more specific feature in mind (e.g. a persisted "default filter"
  setting, or sort-order control)? This PRD's scope is intentionally cheap
  to revise either direction.

### 9.2 Should any exercise-picker preference become a persisted global setting?

**[RESOLVED: no — nothing in `SETTINGS_KEY_SCHEMAS` today, and nothing this
PRD adds, needs one]**

Read the full `settings-schema.ts` key list (25 top-level keys). None are
exercise-list/picker-specific beyond generic display units. Candidates
considered and rejected: persisting the last-used equipment/muscle filter
across sessions (rejected — filters resetting per-open is the existing,
apparently intentional behavior, not a bug this PRD was asked to fix, and
changing it is a behavior change beyond "add a settings icon"); a default
sort order (rejected — no sort control exists anywhere in this screen today
to attach a setting to). Keeping this PRD to zero schema changes keeps it
reversible without a migration.

### 9.3 Why not also add this to `ExerciseBrowseScreen.tsx`?

**[RESOLVED: out of scope for this PRD]**

The user's verbatim question named "the add exercise option" specifically.
`ExerciseBrowseScreen` is a different screen (standalone library
management/browsing, reached from the Exercises tab, not from an in-workout
flow) with a different existing right-side icon already (`Plus`, create-
exercise) and a different header layout (`title1`, full-width, safe-area-
aware — not the sheet-header pattern this PRD reasons about in §4.2).
Extending the same options sheet there is plausible future work but would
double this PRD's surface area and blur the "why is settings not
implemented on the **add exercise** option" question into a broader
"exercise browsing settings" feature nobody asked for yet. If a human
reviewer wants parity, it's a small follow-up: `ExercisePickerOptionsSheet`
was written to depend only on `filtersActive`/`onResetFilters`/
`onOpenAppSettings` callbacks, not on anything `ExercisePickerSheet`-
specific, so it would drop into `ExerciseBrowseScreen` without changes to
the sheet component itself — only that screen's own header row.

### 9.4 Should the gear icon be mode-gated (`add` only, not `replace`)?

**[RESOLVED: show in both modes]**

The Equipment/Muscle filter chips render in both `mode="add"` and
`mode="replace"` (they're above the `mode === 'add'`-gated Superset/counter
block in the JSX), so "Reset Filters" is meaningful in both. "More Settings"
carries no mode-specific meaning either way. Gating the icon by mode would
add a conditional for no behavioral reason and make the header's shape
differ between the two call sites, which the rest of the header (title,
Cancel) deliberately does not do today.

### 9.5 PRD A reconciliation

**[OPEN — flagged, not blocking]**

PRD A (`sheet-header-footer-foundation`) does not exist on disk yet.
§4.2 above reasons from `ExercisePickerSheet`'s *current* header
implementation (hand-rolled `View` + `justifyContent: 'space-between'`) as
ground truth. If PRD A introduces a shared header primitive (e.g. a
`<SheetHeader title=... right={...} />` component) that other sheets are
expected to migrate to, this PRD's header edit should be revisited to use
that primitive instead of the raw `View` markup shown here — the *visual
outcome* this PRD specifies (title left, gear icon + Cancel grouped on the
right, in that order) should carry over unchanged regardless of which
primitive renders it, so this PRD is not blocked on A landing first, but its
implementation task should note the migration as follow-up once A ships.

### 9.6 Icon choice: gear (`Settings`) vs. other affordance (e.g. "⋯" overflow menu)

**[RESOLVED: gear icon, matching `ProfileScreen`'s existing settings
affordance]**

Considered a generic `⋯` overflow/kebab menu instead (would also fit two
actions). Rejected in favor of the `Settings` lucide icon specifically
because it's the icon this codebase *already* uses for "opens
settings-shaped things" (`ProfileScreen.tsx`'s own gear button), and the
user's own question used the word "settings" — matching that vocabulary in
the UI keeps the fix legible as a direct answer to what was asked, rather
than introducing a new "options menu" concept the user didn't ask for.
