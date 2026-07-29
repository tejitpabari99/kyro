# PRD G — History / Routines List De-carding

Sub-project **G** of the Hevy-style UI/UX overhaul (8-PRD decomposition).
**Independent** of the other 7 sub-projects — in particular, no dependency on
**A** (`sheet-header-footer-foundation`): neither surface this PRD touches is
a sheet or a sheet header, so PRD A landing before or after this one changes
nothing here. Can be implemented in any order relative to the rest of the
batch.

---

## 1. Problem

The user's verbatim request:

> "I dont want to see cards in the add workout screen (each workout appears
> as card). No cards, just regular. Also, each workout entry is to big.
> Check Hevy, (https://www.hevyapp.com/wp-content/uploads/Img-5173-5174-1024x683.png)
> you will see how thin they are. Not too much fluff, not too much padding
> etc."

"The add workout screen" is ambiguous between two real, distinct surfaces in
this codebase — both render one "workout" per row as a `Card`-wrapped block,
so both are addressed here rather than guessing which one the user meant:

- **A. Workout tab hub** (routine/template cards) —
  `src/features/routines/RoutinesHubScreen.tsx` (route
  `app/(tabs)/workout/index.tsx`). This is literally what's on-screen in the
  left half of the Hevy screenshot the user linked (see §4.0) — a "Start
  Empty Workout" quick-start button, then a folder-grouped list of routines,
  each rendered by `RoutineCard.tsx`.
- **B. History tab** (past/completed workouts) —
  `src/features/history/HistoryListScreen.tsx` (route
  `app/(tabs)/history/index.tsx`). Each row is `HistoryWorkoutCard.tsx`,
  rendered inside a `FlashList`.

Both are built on the shared `Card` primitive (`src/ui/Card.tsx`: `bg.surface`
fill, `radii.md` (12 pt) corners, 16 pt padding on every side) wrapped in
extra margin for inter-card spacing. Confirmed by direct reading of all six
files named in this task's brief:

| File | Current container | Title style | Body content | Action |
|---|---|---|---|---|
| `RoutineCard.tsx` | `Card` + `marginBottom: spacing['3']` (12) | `title2` (22, semibold) | 2-line `subhead` (15) exercise-name preview | Full-width `Button size="lg"` (50 pt tall) `variant="tonal"` "Start Routine", plus a `⋯` menu trigger next to the title |
| `HistoryWorkoutCard.tsx` | `Pressable` (`marginHorizontal: 16, marginBottom: 12`) wrapping `Card` | `title2` (22, semibold) | relative date (`footnote`, 13) + a Duration·Volume·🏆PRs `subhead` (15) stats strip + **N** variable-count `footnote` (13) per-exercise lines | whole row taps through to `HistoryDetailScreen` |

`HistoryWorkoutCard.tsx`'s own header comment already explains it
deliberately did **not** build on `ListRow` (`src/ui/ListRow.tsx`, this
codebase's existing "plain dense list row" primitive) because a card's line
count varies per workout (0–N exercise summary lines) — `ListRow`'s
title/subtitle shape is fixed at two lines. That reasoning is still correct
for the row **as currently specified** (with per-exercise lines rendered
inline); §4.2/§9.2 below revisit whether those per-exercise lines actually
need to survive into the thin redesign, and conclude they don't — which
reopens `ListRow` as a legitimate, precedent-matched building block.

For contrast/precedent (not in scope, just useful ground truth already
established in this codebase): the exercise **library** list
(`src/features/exercises/ExerciseRow.tsx`, reached from the Exercises tab)
is already dense/non-card — a fixed `EXERCISE_ROW_HEIGHT = 64`, composed
directly from `ListRow` + a `Thumb` leading icon, no `Card` involved
anywhere. This is exactly the "thin, no card" shape the user is asking the
two screens above to match, and this codebase already has one working
example of it wired end-to-end (including in a `FlashList`, same as
History).

---

## 2. Goals

1. Remove the `Card` surface (fill/shadow/corner-radius/16 pt-padding box)
   from **both** `RoutineCard.tsx` and `HistoryWorkoutCard.tsx` — replace
   with a plain, unfilled row separated from its neighbors by a hairline
   divider, matching this codebase's own `ListRow`/`ExerciseRow` idiom.
2. Materially reduce the vertical footprint of both rows (padding + type
   scale + content density), justified concretely against (a) the Hevy
   screenshot's proportions and (b) this codebase's own
   `EXERCISE_ROW_HEIGHT = 64` precedent.
3. Preserve every existing interaction unchanged: `RoutineCard`'s `⋯` menu
   and "Start Routine" action/haptics/navigation, `HistoryWorkoutCard`'s
   tap-whole-row-to-open-detail, `RoutineCard`'s reorder-mode drag-handle
   swap. Only the container/typography/spacing changes — no prop, callback,
   or data-shape changes to either component's public API.
4. Fix, as a direct side effect of removing the double-padded `Card` box, an
   existing minor inconsistency: today's card content is inset **32 pt**
   from the true screen edge (16 pt outer screen gutter + 16 pt `Card`
   internal padding) while the "Routines"/"History" section titles above the
   list sit at just 16 pt — the new rows align flush with those headers.

## 3. Non-Goals

- Do **not** change the shared `Card` primitive (`src/ui/Card.tsx`) itself.
  It has ~10 other call sites (`RoutineExerciseCard`, `ExerciseHistoryTab`,
  `ExerciseRecordsTab`, `StatisticsScreen`, `ProfileScreen`,
  `PhotoCompareScreen`, `HevyImportScreen`, `BackupRestoreScreen`,
  `HistoryDetailScreen`, `ExerciseCard`, plus 2 dev-only screens) that this
  PRD does not touch or re-verify. `RoutineCard.tsx`/`HistoryWorkoutCard.tsx`
  simply stop importing it.
- Do **not** modify the shared `ListRow.tsx` primitive. §4.2 reuses it
  compositionally (exactly the way `ExerciseRow.tsx` already does) but adds
  no new props to it — `ListRow` has other call sites (settings, pickers)
  this PRD does not want to put at risk.
- Do **not** touch the exercise library list (`ExerciseRow.tsx`/
  `ExerciseBrowseScreen.tsx`) — it's already the dense, non-card precedent
  this PRD is matching, not a target for change.
- Do **not** change any repository/query/data-shape code —
  `RoutineRepository`, `WorkoutRepository`, `history-list-model.ts`'s
  `buildHistoryCard`, `routine-hub-model.ts`'s `buildExercisePreview` are all
  unchanged. `history-list-model.ts` still computes `exerciseLines` on every
  `HistoryCardData` (its own existing unit tests keep passing unmodified) —
  the new row component simply stops *rendering* that field. See §9.2 for
  why removing the field itself is deliberately out of scope.
- Do **not** change `FolderSection.tsx` or `RoutinesHubScreen.tsx`'s
  reorder-mode dnd wiring, folder headers, empty states, or
  `HistoryListScreen.tsx`'s header/`FlashList`/pagination/`+`-menu — none of
  that renders through `Card` and none of it needs to change for this PRD.
- Do **not** rename the `RoutineCard`/`HistoryWorkoutCard` component or file
  names, despite them no longer using `Card`. See §9.3.

---

## 4. Architecture Decisions

### 4.0 The Hevy screenshot, precisely

Fetched `https://www.hevyapp.com/wp-content/uploads/Img-5173-5174-1024x683.png`
directly and inspected it at 2x crop zoom. It is a two-phone marketing
composite:

- **Left phone**: the Workout tab home screen — "Quick Start" section with a
  full-width grey "+ Start Empty Workout" pill, a "Routines" section header
  with "New Routine"/"Explore" pills, then "My Routines (3)" with two fully
  visible routine rows ("Chest and triceps", "Back and biceps") and a third
  cut off at the bottom edge.
- **Right phone**: an **active workout logging** screen ("Log Workout" — sets
  table, rest timer, Finish button) — not a list of past workouts.

**Important finding, stated precisely because it changes what "literal
visual target" can mean here**: this screenshot does **not** contain Hevy's
History/past-workouts tab at all. It maps directly onto sub-surface A
(`RoutinesHubScreen`/`RoutineCard`) and, on the right, onto Kyro's
already-separate active-workout logger (not in scope for this PRD). It gives
no direct visual reference for sub-surface B (`HistoryWorkoutCard`); §4.2's
History redesign is derived from first principles (the user's stated goals +
this codebase's own `ListRow`/`ExerciseRow` precedent) rather than from a
literal pixel reference, and that gap is called out explicitly rather than
silently papered over.

What the left-phone routine list actually looks like, precisely:

- **Not a bare, un-decorated list.** Each routine ("Chest and triceps",
  "Back and biceps") sits inside its own rounded-rectangle block with a
  visible thin hairline border — closer to a flat/outlined card than to a
  border-free list row. So the user's literal words ("no cards, just
  regular") and the screenshot's literal content (still boxed, just
  lightly) are in some tension — see §9.1 for how this PRD resolves that.
- **What makes it read as "thin" is not the absence of a container** — it's:
  - No shadow, no filled/tinted background distinct from the page (the box
    is essentially just an outline on the same white the page background
    already is) — reads flatter than Kyro's `bg.surface`-filled `Card`.
  - Tight internal padding — the gap from the box's edge to the title text
    is visibly smaller than Kyro's current 16 pt `Card` padding.
  - The exercise-name preview is a smaller, lighter grey type size than the
    bold title — clearly a full step down in the type scale, not just a
    color change — and is truncated with a trailing "…" rather than
    reserving space to always show two full comma-separated lines.
  - The "Start Routine" button, while still full-width, is visibly shorter
    than Kyro's current 50 pt `size="lg"` button — proportionally closer to
    a ~40 pt control.
  - Vertical rhythm between routine rows is tight — the gap between "Chest
    and triceps"'s button and "Back and biceps"'s title is a thin sliver,
    not a generous card-gap.
  - Per-row info shown, top to bottom: **title** (bold), **⋯** (top-right,
    same position as Kyro's), **exercise-name preview** (2 lines, ellipsis
    tail-truncated), **full-width "Start Routine" button**. This is the same
    four-part content Kyro's `RoutineCard` already shows — the redesign is a
    density/chrome change, not an information change, for this surface.
- Absolute pixel measurement of a marketing screenshot into pt values is not
  reliable here (unknown device model/scale factor behind the composite, and
  the image itself is a downscaled collage, not a raw device screenshot) —
  a rough visual estimate puts each full routine block (title + 2-line
  preview + button) at roughly **130–150 pt** tall. §4.1 derives a concrete
  target independently from this codebase's own spacing/typography tokens
  and cross-checks it against that estimate rather than trusting pixel math
  alone.

### 4.1 `src/features/routines/RoutineCard.tsx`

**Before** (current, `Card`-wrapped):

```tsx
import { Card } from '@/ui/Card';
// ...
return (
  <Card testID={testID} style={{ marginBottom: spacing['3'] }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[typography.title2, { color: colors.text.primary, flex: 1 }]} numberOfLines={1}>
        {routine.title}
      </Text>
      {reorderMode ? dragHandle : (
        <Pressable testID={`${testID}-menu`} /* ⋯ */ onPress={onMenuPress}>
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

**After** (no `Card`, hairline divider, tighter type/spacing, smaller
button):

```tsx
import { StyleSheet } from 'react-native';
// Card import removed entirely.
// ...
return (
  <View
    testID={testID}
    style={{
      paddingVertical: spacing['3'], // 12 — was 16 top+16 bottom via Card
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.hairline,
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[typography.headline, { color: colors.text.primary, flex: 1 }]} numberOfLines={1}>
        {routine.title}
      </Text>
      {reorderMode ? dragHandle : (
        <Pressable testID={`${testID}-menu`} /* ⋯ — unchanged */ onPress={onMenuPress}>
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

Concrete deltas and why:

- **Container**: `Card` (bg.surface fill, 12 pt radius, 16 pt padding on
  all 4 sides, 12 pt `marginBottom` gap to next card) → plain `View` with
  12 pt (`spacing['3']`) top/bottom padding only (no left/right padding —
  the parent `RoutinesHubScreen`'s `<View style={{paddingHorizontal:
  spacing['4']}}>` wrapper, already one level up, supplies the 16 pt screen
  gutter; adding another 16 pt here was the double-indent bug §2 goal #4
  fixes) and a bottom hairline divider (`colors.border.hairline`, same
  token `ListRow` uses) instead of a margin gap.
- **Title**: `title2` (22, semibold) → `headline` (17, semibold). Still
  semibold (routine names are the primary scan target of this list, worth
  keeping some emphasis — unlike History's row, see §9.5), just not
  card-scale oversized. Matches Hevy's visibly-smaller-than-22pt bold title.
- **Preview**: `subhead` (15) → `footnote` (13), still 2-line clamped
  (matches the screenshot's own 2-line ellipsis-truncated preview — not
  reduced to 1 line, since Hevy itself keeps 2). Margin above it
  (`spacing['1']`, 4 pt) unchanged — the real saving is the smaller
  font/line-height, not a margin change here.
- **Button**: `size="lg"` (50 pt tall, `alignSelf: 'stretch'` built into
  that size by `Button.tsx`) → `size="md"` (40 pt tall — `Button.tsx`'s own
  `SIZE_HEIGHT` table). `md` defaults `alignSelf: 'flex-start'`
  (hug-content), so `style={{ alignSelf: 'stretch' }}` is passed explicitly
  to keep the full-width look the screenshot shows — `Button`'s `style` prop
  is spread last in its style array, so this cleanly overrides the base
  default without touching `Button.tsx` itself. `marginTop` above it:
  `spacing['4']` (16) → `spacing['2']` (8).
- **Everything else unchanged**: `⋯` icon/size/position, `dragHandle` swap
  in reorder mode, `onStart`/`onMenuPress` callbacks, all `testID`s and
  their `${testID}-start`/`${testID}-menu`/`${testID}-preview`/
  `${testID}-drag-handle` suffixes (load-bearing — see §7).

**Height, token-derived** (not pixel-measured): 12 (pad-top) + ~21
(`headline` line) + 4 (`spacing['1']` gap) + ~32 (2× `footnote` lines) + 8
(`spacing['2']` gap) + 40 (`md` button) + 12 (pad-bottom) ≈ **129 pt**, vs.
the current card's own token-derived total of ≈176 pt (32 pad + 26 title +
4 gap + 36 two-line preview + 16 gap + 50 button + 12 inter-card margin) —
a **~27% reduction** in per-routine vertical footprint, while landing close
to (in fact slightly under) §4.0's ~130–150 pt visual estimate of Hevy's own
routine block. `RoutineCard` cannot realistically hit this codebase's
64 pt `EXERCISE_ROW_HEIGHT` precedent while still containing a real,
visible, full-width "Start Routine" button plus a `⋯` menu plus a 2-line
preview — that precedent is the right target for §4.2's buttonless History
row instead (see there for why). This is a deliberate, reasoned divergence
from a single uniform height across both components, not an oversight —
recorded in §9.4.

`FolderSection.tsx` and `RoutinesHubScreen.tsx` need **zero changes** —
`RoutineCard`'s props (`routine`, `preview`, `onStart`, `onMenuPress`,
`reorderMode`, `dragHandle`, `testID`) are completely unchanged.

### 4.2 `src/features/history/HistoryWorkoutCard.tsx`

**Before** (current, `Card`-wrapped, variable-length per-exercise lines):

```tsx
import { Card } from '@/ui/Card';
// ...
return (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={item.title}
    onPress={() => onPress(item.workoutId)}
    style={{ marginHorizontal: spacing['4'], marginBottom: spacing['3'] }}
  >
    <Card>
      <Text style={[typography.title2, ...]} numberOfLines={1}>{item.title}</Text>
      <Text style={[typography.footnote, ...]}>{item.relativeDate}</Text>
      <Text style={[typography.subhead, ...]}>{statsStrip}</Text>
      {item.exerciseLines.length > 0 ? (
        <View style={{ marginTop: spacing['2'], gap: spacing['0.5'] }}>
          {item.exerciseLines.map((line, index) => (
            <Text key={index} style={[typography.footnote, ...]} numberOfLines={1}>{line}</Text>
          ))}
        </View>
      ) : null}
    </Card>
  </Pressable>
);
```

**After** (composes the shared `ListRow` directly — same pattern
`ExerciseRow.tsx` already uses, no `Card`, no per-exercise lines rendered):

```tsx
import { ListRow } from '@/ui/ListRow';
// Card and Pressable/View imports for the old manual layout removed.
// ...
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
```

Concrete deltas and why:

- **Container**: `Pressable` (16 pt `marginHorizontal` + 12 pt
  `marginBottom`) wrapping `Card` (16 pt padding all sides) → `ListRow`
  directly. `ListRow` already supplies: 16 pt `paddingHorizontal` (once,
  not doubled — same edge-alignment fix as §4.1), an 8 pt vertical
  `paddingVertical` + 44 pt `minHeight` row, a 44 pt minimum touch target,
  its own `Pressable` with `bg.elevated` press-state feedback, and its own
  bottom hairline divider (`colors.border.hairline`, inset 16 pt from the
  left) — all for free, all already tested (`src/ui/__tests__/
  ListRow.test.tsx`) and already proven in a `FlashList` context
  (`ExerciseRow`/`ExerciseBrowseScreen`).
- **Title**: `title2` (22, semibold) → `ListRow`'s built-in `body` (17,
  regular). A bigger drop than `RoutineCard`'s (which keeps `headline`
  semibold) — deliberate, see §9.5.
- **Date + stats strip**: previously three separate stacked `Text` elements
  (title / date / stats-strip-line, each on its own row with its own
  margin) → collapsed to `ListRow`'s two built-in slots: `subtitle`
  (the existing `statsStrip` string, unchanged computation, rendered at
  `ListRow`'s built-in `subhead` (15) size/`text.secondary` color) and
  `trailing` (the relative date, right-aligned, `footnote`/`text.tertiary`
  — a small custom node since `ListRow`'s `trailing` slot accepts any
  `ReactNode`). Net: date moves from its own line to the same line as the
  title (right-aligned), removing one whole text row.
  `chevron` added — `ListRow`'s existing built-in affordance for
  "this row navigates on tap," which the row now needs since it no longer
  has a raised/filled `Card` surface visually signaling "this is a
  pressable unit" (see §9.6).
- **Per-exercise lines**: **not rendered**. `item.exerciseLines` (still
  computed by `history-list-model.ts`, unchanged) is simply unused by this
  component now. See §9.2 for the full reasoning — short version: this
  task's own brief lists the row's essential info as "title, key stats,
  start/action affordance," which does not include per-exercise detail, and
  `HistoryDetailScreen.tsx` (already built, M2-14) already shows the full
  per-exercise set-by-set breakdown one tap away.
- **`React.memo` wrapper preserved** — still exported as
  `React.memo(HistoryWorkoutCardComponent)`, same M4-11 perf reasoning
  (1000+-row `FlashList` budget) the current file header documents; nothing
  about that reasoning changes here.
- **`accessibilityLabel={item.title}`** carries over unchanged (`ListRow`
  doesn't take an explicit `accessibilityLabel` prop, but its internal
  `Pressable` already sets `accessibilityRole="button"`; the visible title
  text inside satisfies the accessible-name requirement without needing an
  explicit override — confirmed this is exactly how `ExerciseRow`/`ListRow`
  already behave for every other caller).

**Height**: `ListRow`'s own layout (`minHeight: 44` + `paddingVertical: 8`
top/bottom) with one `body` (17) title line + one `subhead` (15) subtitle
line stacked (~21 + 2 + 18 = ~41 pt of text) plus 16 pt of padding ≈ **57 pt**
— inside this task's ~56–72 pt target band and close to this codebase's own
64 pt `EXERCISE_ROW_HEIGHT` precedent (the two dense-list surfaces in this
app — Exercises tab and History tab — now land within a few pt of each
other). Down from the current card's token-derived total of ≈32 (pad) + 26
(title) + 2 + 17 (date) + 8 + 18 (stats) + 8 + (N × ~18, N = exercise count,
commonly 2–5) + 12 (inter-card margin) ≈ **150–230+ pt depending on exercise
count** — i.e. the new row isn't just thinner, it's also **constant-height**
regardless of how many exercises a workout had, which the old variable-line
design never was.

`HistoryListScreen.tsx` needs **zero changes** — `HistoryWorkoutCard`'s
props (`item`, `onPress`, `testID`) are unchanged, and its `FlashList`
already has no `paddingHorizontal` wrapper (`ListRow`'s own internal padding
now supplies the screen-edge inset directly, exactly matching how
`ExerciseBrowseScreen.tsx`'s `FlashList` + `ExerciseRow`/`ListRow` already
work — confirmed by reading that screen's JSX, no `estimatedItemSize` prop
either, so none is added here for consistency).

### 4.3 Files touched — summary

| File | Change |
|---|---|
| `src/features/routines/RoutineCard.tsx` | Drop `Card`; plain `View` + bottom hairline divider; `headline`/`footnote` type scale; `Button size="md"` stretched. No prop/behavior change. |
| `src/features/history/HistoryWorkoutCard.tsx` | Drop `Card` + manual `Pressable`; compose `ListRow` directly (title/subtitle/trailing/chevron); stop rendering `exerciseLines`. No prop/behavior change. `React.memo` wrapper kept. |
| `src/ui/Card.tsx` | **Not touched.** |
| `src/ui/ListRow.tsx` | **Not touched** — reused compositionally only. |
| `src/features/routines/FolderSection.tsx` | **Not touched.** |
| `src/features/routines/RoutinesHubScreen.tsx` | **Not touched.** |
| `src/features/history/HistoryListScreen.tsx` | **Not touched.** |
| `src/features/history/history-list-model.ts` | **Not touched** — still computes `exerciseLines`; only the consuming component stops rendering it. |
| `src/features/exercises/ExerciseRow.tsx` / `ExerciseBrowseScreen.tsx` | **Not touched** — read-only precedent. |

---

## 5. API Change Summary

None. No repository, driver, schema, or query changes. No component prop
signature changes — `RoutineCardProps` and `HistoryWorkoutCardProps`/
`HistoryCardData` are byte-for-byte unchanged; every existing caller
(`FolderSection.tsx`, `HistoryListScreen.tsx`) continues to compile and
behave identically at the call-site level. This is a pure presentation-layer
restyle of two leaf components.

---

## 6. Frontend Change Summary

- **Workout tab / Routines hub**: each routine now renders as a thin,
  divider-separated row (no card fill/shadow/rounded box) — smaller title,
  smaller/tighter 2-line preview, a shorter (40 pt vs. 50 pt) full-width
  "Start Routine" button, `⋯` menu unchanged. Content now aligns flush with
  the "Routines"/"Quick Start" section headers above it (previously inset
  an extra 16 pt).
- **History tab**: each past workout now renders as a single ~57 pt dense
  row (title left / relative date right, one Duration·Volume·🏆PR stats
  line beneath the title, trailing chevron) instead of a variable-height
  card that also listed every exercise inline. Tapping the row still opens
  `HistoryDetailScreen`, which already shows the full per-exercise
  breakdown that's no longer inlined in the list.
- No change to any other screen, any navigation target, any data query, or
  any button/menu behavior on either surface.

---

## 7. Testing

Neither `RoutineCard.tsx` nor `HistoryWorkoutCard.tsx` has its own isolated
test file today — both are exercised indirectly through their host screens'
suites: `src/features/routines/__tests__/RoutinesHubScreen.test.tsx` and
`src/features/history/__tests__/HistoryListScreen.test.tsx`. Both suites
assert against `testID`s this PRD keeps stable (confirmed by grepping both
files):

- `RoutinesHubScreen.test.tsx` uses `routine-card-r1`, `routine-card-r1-start`,
  `routine-card-r1-menu`, `routine-card-r1-drag-handle` (e.g. lines 189,
  328, 336, 435) — all still produced by `RoutineCard.tsx` after this
  change, since `testID`/`${testID}-start`/`${testID}-menu` are unchanged
  strings. **These existing tests should pass unmodified**; run them as the
  regression gate for §4.1, no new test file needed.
- `HistoryListScreen.test.tsx` uses `history-card-w-1` (and
  `history-card-w-page1-0`/`-page2-0` for pagination) directly on the
  pressable row, then `fireEvent.press(screen.getByTestId('history-card-w-1'))`
  (line 271) to assert `onPress` fires. Confirmed this exact
  `getByTestId(...)` → `fireEvent.press(...)` pattern already works
  end-to-end against a `ListRow`-composed row elsewhere in this codebase
  (`ExerciseBrowseScreen.test.tsx` line 253, `getByTestId('exercise-row-...')`
  → `fireEvent.press`), so `ListRow`'s own internal
  `outer View(testID) > Pressable(onPress)` structure is a
  known-safe pattern for RNTL in this repo, not a risk unique to this
  change. **These existing tests should pass unmodified** too.

New cases worth adding (small, additive, not required to unblock the
restyle since no existing coverage breaks):

1. `RoutinesHubScreen.test.tsx`: assert `routine-card-r1` no longer renders
   a `Card`-shaped background — e.g. a snapshot or a style assertion on the
   preview text confirming `footnote`-sized styling, guarding against a
   future accidental revert to the old type scale.
2. `HistoryListScreen.test.tsx`: assert a workout with 3+ `exerciseLines`
   in its fixture data does **not** render any of those per-exercise
   strings in the tree (`queryByText(...)` on one of the fixture's known
   exercise-summary strings should be `null`) — a direct regression guard
   for §4.2/§9.2's "per-exercise lines are intentionally dropped from the
   list" decision, since that's the one place this PRD removes rendered
   information rather than just re-styling it.
3. `HistoryListScreen.test.tsx`: assert the relative date renders as
   `trailing` text and a chevron is present, confirming the new
   title/stats/date/chevron layout actually mounted (not just "still
   clickable").

No test file needs new mocks, no `expo-router` mocking changes, no new
fixtures beyond what `RoutinesHubScreen.test.tsx`/`HistoryListScreen.test.tsx`
already define.

---

## 8. Manual Intervention Required From You

- None required to land this PRD's implementation — every dependency
  (`ListRow`, `Button`'s existing `md` size, `colors.border.hairline`) is
  already built, already themed, and already proven in another surface of
  this app.
- **Recommended, not required**: a quick visual check on-device once
  implemented, specifically comparing `RoutineCard`'s new ~129 pt row
  against the Hevy screenshot's ~130–150 pt estimate and against
  `HistoryWorkoutCard`'s new ~57 pt row against `ExerciseRow`'s 64 pt — both
  height numbers in this PRD are token-math-derived, not pixel-measured
  from a live render, so a real-device glance is the cheap way to confirm
  they read as "thin" the way the user meant, before considering this
  fully closed out.

---

## 9. Open Questions & Decisions

### 9.1 The screenshot still shows a bordered box, but the user's words say "no cards" — which wins?

**[RESOLVED: honor the literal words ("no cards, just regular") over the
screenshot's literal border treatment; use the screenshot only for
proportions/density/content-hierarchy, not for "keep a border around each
row"]**

§4.0 documents the tension directly: Hevy's own routine list still puts each
routine inside a thin-bordered rounded box, which is not literally
"no cards, just regular." The user's text is unambiguous and stated twice
("I dont want to see cards... No cards, just regular") — that's the primary
signal. The screenshot reference immediately follows it as supporting
evidence for *how thin* rows should be ("you will see how thin they are"),
not as a literal spec for "keep the border." Reading the two together: the
user is pointing at Hevy's *density*, not its exact chrome. This PRD follows
the plain-list-row idiom this codebase already has (`ListRow`/hairline
divider, matching `ExerciseRow`'s precedent) rather than replicating Hevy's
border-box treatment. If this reading turns out wrong, it's a small,
contained fix (add a `borderWidth`/`borderColor`/`borderRadius` back to
`RoutineCard`'s outer `View`) — nothing else in this PRD depends on the
no-border choice.

### 9.2 Should the per-exercise summary lines survive in the History row?

**[RESOLVED: no — dropped from the thin row, still one tap away]**

Three independent reasons converge on the same answer:

1. This task's own brief, when describing what to preserve, names "title,
   key stats, start/action affordance" as the row's essential info — it
   does not name per-exercise detail.
2. A row that must accommodate 0–N exercise lines cannot have a fixed,
   predictable height — directly at odds with goal #2 (materially reduce
   and stabilize the row's vertical footprint) and with matching this
   codebase's own fixed-height `EXERCISE_ROW_HEIGHT` precedent.
3. `HistoryDetailScreen.tsx` (already built, M2-14/M3-07) already shows the
   complete per-exercise, per-set breakdown for any workout the user taps
   into — nothing is actually lost, only moved one tap deeper, which is a
   completely standard "list row = summary, detail screen = everything"
   split already used elsewhere in this app (e.g. the exercise library:
   `ExerciseRow` shows name + muscle group only, full detail lives in
   `/exercise/[id]`).

`history-list-model.ts`'s `buildHistoryCard` keeps computing `exerciseLines`
on every `HistoryCardData` unchanged (§3/§4.2) — deliberately not deleting
the field, to keep this PRD's diff purely presentational and to avoid
touching a function with its own passing unit test suite
(`history-list-model.test.ts`) for a UI-only change. If a future PRD wants
the field gone too, that's a trivial, low-risk follow-up once this lands and
is confirmed correct.

### 9.3 Why keep the `RoutineCard`/`HistoryWorkoutCard` component and file names, given neither uses `Card` anymore?

**[RESOLVED: keep both names as-is]**

Renaming either would touch every import site
(`FolderSection.tsx` for `RoutineCard`; `HistoryListScreen.tsx` for
`HistoryWorkoutCard`) purely for cosmetic accuracy, with zero behavioral
benefit, and would make this PRD's diff noisier to review against "restyle
the container, not the behavior" (§2 goal #3). `RoutinesHubScreen.tsx`
already sets the precedent for this exact situation elsewhere in the same
feature area — components keep stable identifiers across restyles in this
codebase (e.g. that screen itself replaced an entire placeholder
implementation in M3-02 without renaming the route file). Both names remain
accurate in the sense that matters (what data/role they render), just no
longer in the literal "-Card" sense.

### 9.4 Should both rows target the same fixed height?

**[RESOLVED: no — ~129 pt for `RoutineCard`, ~57 pt for
`HistoryWorkoutCard`, and that asymmetry is intentional]**

A single shared row height across both surfaces would be the cleanest
outcome on paper, but `RoutineCard` structurally carries content
`HistoryWorkoutCard` does not: a real, visible, full-width "Start Routine"
button (goal #3 requires preserving this exact interaction/affordance, not
replacing it with a bare tap-the-row gesture) plus a `⋯` menu plus a 2-line
preview, on top of the title. Forcing that into a ~64 pt row would mean
either shrinking the button below usable size, dropping it to an inline
icon-only affordance, or cutting the preview — any of which changes
*behavior or information*, not just chrome, contradicting goal #3's "just
restyle the container." `HistoryWorkoutCard`, by contrast, has no inline
button at all (the whole row is the tap target, matching every other
navigational `ListRow` in this app) and, once §9.2 drops the per-exercise
lines, genuinely fits this codebase's existing 64 pt dense-row precedent.
Both rows are still dramatically thinner than their current `Card` forms
(~27% and up to ~75% shorter respectively, per §4.1/§4.2's math) — "thin
like Hevy" is satisfied for both, just not at one identical number, because
the two rows don't carry identical content.

### 9.5 Why `headline` (semibold) for `RoutineCard`'s title but `ListRow`'s plain `body` (regular) for `HistoryWorkoutCard`'s?

**[RESOLVED: intentional, matches each surface's own existing/precedent
hierarchy]**

`RoutineCard`'s title is the single most important piece of information on
a routine-picking screen (users scan routine names to decide what to start)
and the Hevy screenshot's own routine titles are visibly bold — keeping
`headline` (17, semibold, down from `title2`'s 22, semibold) preserves that
emphasis while still shrinking the type scale. `HistoryWorkoutCard`, by
composing `ListRow` directly (§4.2, §9.2's unlock), inherits `ListRow`'s
existing `body` (17, regular) title styling — exactly the same weight
`ExerciseRow` already uses for exercise names in the library list. Giving
History a semibold title would mean either overriding `ListRow`'s fixed
styling (reopening the "don't touch the shared primitive" non-goal) or
hand-rolling a bespoke row instead of reusing `ListRow` (reopening the
component-duplication `ListRow` exists to avoid) — for a difference that
is a smaller product-hierarchy signal for History anyway: users typically
scan History for *when* (the date) and *how it went* (the stats/PRs) more
than to distinguish between many differently-titled cards, unlike
`RoutineCard` where the title *is* the primary decision key. Plain `body`
was judged the better trade-off.

### 9.6 Does removing the `Card` surface remove the "this is tappable" affordance History rows relied on?

**[RESOLVED: yes, partially — mitigated by adding a `chevron`]**

The old `HistoryWorkoutCard` never had an explicit "tap me" visual cue
beyond being wrapped in a raised `Card` box (no chevron, no visible border) —
its affordance was implicit ("boxes are things you tap"). Removing the box
removes that implicit signal. `ListRow`'s `chevron` prop (§4.2) is this
codebase's existing, established idiom for "this row navigates somewhere on
tap" (used across settings/pickers already) — adding it here restores an
explicit affordance rather than leaving the row looking inert. `RoutineCard`
doesn't need the equivalent treatment: it already has its own unambiguous,
still-present "Start Routine" button as the primary affordance, and the `⋯`
menu as the secondary one — neither relies on the removed card box to read
as interactive.
