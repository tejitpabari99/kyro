# PRD A — Sheet Header/Footer Foundation

Sub-project **A** of the 8-part Hevy-style UI/UX overhaul (**B–H** all depend on this one). Design only — no code changes were made while authoring this document.

No prior `docs/agent_files/tasks/` folder convention existed in this repo at authoring time (checked, empty), so this PRD uses the default house section set given in the brief.

---

## 1. Problem

Three structural gaps, all rooted in `src/ui/Sheet.tsx` and `src/ui/Button.tsx`, repeat across the ~28 call sites of the app's one shared slide-up-panel primitive (`Sheet`):

1. **Nesting.** Today "nesting" is just two independent `Sheet`/`Modal` instances mounted at once (confirmed: `ExercisePickerSheet` mounts `ExerciseDetailSheet` and two `FilterOptionSheet`s inside itself while it is itself open). Two stacked RN `Modal`s fighting over gesture/keyboard/back-button handling is fragile and reads wrong (a sheet sliding up over another sheet). The user's rule: an outer sheet that can open another sheet must stop being a "sheet inside a sheet" — the *outer* one becomes a full screen; nesting of the slide-up presentation itself is not allowed.
2. **Header inconsistency.** `Sheet.tsx` bakes in no header/title layout — every caller hand-rolls its own row. Result: titles are left-aligned in most callers, some have no dismiss control in the header row at all (`ReorderExercisesSheet`, `NoteEditSheet`, `AddWarmUpSetsSheet`, `RestTimerSheet`), one has title-left/Cancel-right (`ExercisePickerSheet`), and one has back-chevron-left/icons-right with the title rendered as a *separate* element below the row entirely (`ExerciseDetailScreen`).
3. **Unsafe / non-"decent" bottom spacing.** `Sheet.tsx` never calls `useSafeAreaInsets()`. `detent="full"` is only 90% of window height (not true full screen), and `detent="half"` is bottom-anchored flush with the *physical* screen edge (`justifyContent:'flex-end'` in `avoidingContainer`, height = 50% of window) — so a half sheet's bottom edge sits exactly at the home-indicator/gesture-bar zone on notched devices, with zero clearance. Any footer button placed at the end of a sheet's content today (e.g. `ReorderExercisesSheet`'s "Save Order") lands with no inset awareness and no deliberate extra gap, which is exactly the "I have trouble tapping things at the bottom" complaint.

`Button.tsx`'s size table (`lg`→50pt+stretch, `md`→40pt+hug-content, `sm`→32pt+hug-content) is also the root cause of a secondary, closely-related bug: two buttons of size `md`/`sm` placed side by side in a row don't get equal width, because `alignSelf` only governs the *cross* axis — in a `flexDirection:'row'` parent neither size sets anything on the *main* (horizontal) axis, so each button just hugs its own label. There is no existing escape hatch for "make this button fill its row slot."

## 2. Goals

- Fix `Sheet.tsx` so `detent="full"` is a true 100%-height, safe-area-aware presentation, and give `detent="half"` bottom-inset awareness too.
- Ship one shared, centered-by-default header primitive (`SheetHeader`) usable both inside `Sheet` bodies and — since it has no dependency on `Sheet` itself — inside plain full-screen routes, so a Sheet↔route conversion (per the decision matrix below) never requires re-deriving header layout.
- Ship one shared bottom-safe footer primitive (`ScreenFooter`) that gives footer content a "decent" gap beyond the raw safe-area inset, without ever being sticky/pinned.
- Ship the row-of-equal-width-buttons primitive (`ButtonRow`) plus a `fullWidth` escape hatch on `Button`, closing the root cause PRD B needs.
- Write a policy for "Sheet vs. real full-screen route" that C/D/E/F can cite without re-deriving it.
- Produce a call-site-by-call-site retrofit table concrete enough that `dev-tasks` can turn it directly into one task (or small batch) per row.

## 3. Non-Goals

- **`ExercisePickerSheet` / `ExerciseDetailSheet` / `FilterOptionSheet`'s nested-sheet structural conversion** — explicitly deferred to **PRD E** (`exercise-detail-fullscreen-summary`). This PRD only ships the primitives E will convert onto; it does not restructure the nesting itself.
- **`ExerciseDetailScreen.tsx`'s own header** (back-chevron/Edit/⋯ row, title rendered separately below) — also PRD E's file (it *is* "exercise-detail-fullscreen-summary"). Not retrofitted here; E should adopt `SheetHeader`/`ScreenFooter` directly when it rebuilds that screen.
- **`AddWarmUpSetsSheet.tsx`** — excluded from the retrofit table entirely. PRD H deletes this component outright; retrofitting it here would be wasted/conflicting work against H's deletion. See §9 for the sequencing decision.
- **`RoutineCard`/`HistoryWorkoutCard` de-carding** — PRD G's file scope, untouched here.
- **`AddWarmUpSetsSheet` content** — PRD H's scope (moot per the exclusion above, listed for completeness per the brief).
- **Adding brand-new Cancel/dismiss affordances to `NoteEditSheet` / `RestTimerSheet`'s specific content or interaction model** beyond the mechanical header/footer wiring — PRD F (`notes-rest-timer-inline`) owns those screens' actual UX; this PRD only wires them onto the new primitives (see retrofit table row notes).
- **Auditing every non-Sheet screen route in the app** for title-centering. The user's brief says "apply to all screens," but this PRD's literal scope (per the assignment) is the Sheet primitive + its 28 call sites. `SheetHeader`/`ScreenFooter` are deliberately built as Sheet-agnostic primitives specifically so downstream PRDs (and any future full-screen-route work) can adopt them for non-Sheet screens without a second header component ever needing to exist — but doing that adoption for existing routes (`ExerciseDetailScreen`, `ExerciseBrowseScreen`, etc.) is each owning PRD's job, not enumerated here.

## 4. Architecture Decisions

### 4.1 `src/ui/Sheet.tsx`

**Dependency addition:** `Sheet.tsx` will import `useSafeAreaInsets` from `react-native-safe-area-context`. This does not violate the "`src/ui/**` depends only on theme-provider/tokens" boundary rule — that rule is about never reaching into Zustand stores or domain logic; `react-native-safe-area-context` is a neutral RN library, and `Sheet.tsx` already imports two other neutral third-party RN libraries (`react-native-gesture-handler`, `react-native-reanimated`) under the same boundary today. Precedent stands.

**Height/inset table (old → new):**

| | Old | New |
|---|---|---|
| `detent="half"` height | `windowHeight * 0.5` | unchanged — `windowHeight * 0.5` |
| `detent="full"` height | `windowHeight * 0.9` | `windowHeight` (true 100%) |
| top inset | none | not applied inside `Sheet.tsx` itself (see below — `SheetHeader` owns it) |
| bottom inset | none | `paddingBottom: insets.bottom` added to `styles.content` for **both** detents (baseline safety net) |
| `full` corner radius | `radii.lg` both top corners | `0` (edge-to-edge — see 4.1.1) |
| `full` grabber | shown | hidden (see 4.1.1) |
| `half` corner radius / grabber | `radii.lg` / shown | unchanged |

`DETENT_HEIGHT_RATIO` becomes `{ half: 0.5, full: 1 }` (or `full` is special-cased directly to `windowHeight` — either is fine, same value).

**4.1.1 Why `full` goes edge-to-edge (no radius, no grabber), resolved decision:** The user's brief says outer sheets "should be full screens" and "the slide up part is only the animation for that particular instance" — i.e. once at `detent="full"`, a sheet should be visually and structurally indistinguishable from a real full-screen route, differing *only* in that it plays a 250ms slide-up transition instead of the router's native transition. A rounded-top floating card with a visible grabber reads as "still a sheet"; square corners + no grabber reads as "a screen." Both changes are branched on `detent === 'full'` only — `half` keeps its current rounded-card/grabber look unchanged, since half sheets are explicitly allowed to stay sheet-like (see decision matrix, §4.4).

**4.1.2 Why `insets.top` is *not* applied inside `Sheet.tsx` for `full`:** If `Sheet.tsx` padded its content wrapper by `insets.top` AND callers also render a `SheetHeader` (which needs to own top-inset padding anyway so it works identically inside a plain route with no `Sheet` ancestor), the two would double-pad. Resolution: `Sheet.tsx` never applies `insets.top`; `SheetHeader`'s own `safeTop` prop (4.2) is the single owner of top-inset clearance, for both Sheet and non-Sheet contexts. `Sheet.tsx`'s `styles.content` `paddingTop` stays `spacing['2']` for `half` (grabber clearance, unchanged) and becomes `0` for `full` (no grabber to clear; `SheetHeader`'s `safeTop` handles the rest).

**4.1.3 Why `insets.bottom` *is* applied inside `Sheet.tsx`, unconditionally, for both detents (resolved — the brief's own open question):** Confirmed by reading the code: `avoidingContainer` uses `justifyContent:'flex-end'`, so a `half` sheet's bottom edge is flush with the *physical* screen's bottom edge (not just its own 50%-height box) — exactly like `full`. So `half` needs bottom-inset awareness too, not just `full`. `Sheet.tsx` adds a **baseline** `paddingBottom: insets.bottom` on `styles.content` — this alone guarantees every sheet's last row/control at minimum clears the home indicator, including sheets that are pure action-menus with no footer component at all (`RoutineActionsSheet`, `ExerciseCardMenuSheet`, etc. — see retrofit table). `ScreenFooter` (4.3) then adds *its own* `insets.bottom` again on top of this baseline, plus the "decent gap." That is deliberate double-counting, not a bug: worst case it wastes a few extra points of whitespace under a footer button; the alternative (under-padding) is exactly the mis-tap complaint the user filed. `ScreenFooter` used standalone inside a plain route (no `Sheet` ancestor, no baseline to rely on) still needs to own its full `insets.bottom + gap` regardless, so it cannot be simplified to "gap only" without breaking the non-Sheet case.

**4.1.4 `SheetProps` — unchanged.** No new prop is needed on `Sheet` itself for the height/inset/radius/grabber fix — it's all internal, branched on the existing `detent` value, applying automatically to every current and future `detent="full"` caller (per the brief: "don't list full-height as a separate retrofit task, it's automatic").

### 4.2 `src/ui/SheetHeader.tsx` (new file)

```ts
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
  /**
   * Adds `insets.top` clearance above the row. Pass `true` only when this
   * header sits at the very top of an edge-to-edge, full-height
   * presentation (a `Sheet` at `detent="full"`, or a plain full-screen
   * route with `headerShown:false`). Leave `false` (default) for
   * `detent="half"` sheets — they don't start at the physical screen top,
   * `Sheet.tsx`'s own `spacing['2']` grabber clearance is enough.
   */
  safeTop?: boolean;
  testID?: string;
}
```

**Layout algorithm (resolved centering rule):** a row of up to three zones — `left` zone (only rendered if `left` is given, sized to its own content, no reserved minimum width when absent), `title` (`flex:1`), `right` zone (same rule as `left`).

```
title textAlign = (left == null && right == null) ? 'center' : 'left'
title marginLeft  = left  != null ? spacing['2'] : 0
title marginRight = right != null ? spacing['2'] : 0
```

This is the literal reading of the user's own words — *"ensure the title is at the center unless there is a button on the left or the right ... then no [center], because that won't align with the title"* — rather than a mirrored-equal-slot-width trick that would force mathematical centering even with one-sided content. It was picked over the mirrored-slot alternative because (a) it's what the user explicitly asked for in their own words, (b) it's a single boolean check with no per-screen width bookkeeping, and (c) it matches the existing precedent in this codebase — `ExerciseDetailScreen`'s own hand-rolled header already left-aligns everything once any button is present, this just formalizes and centers-by-default the same pattern.

Row chrome: `flexDirection:'row'`, `alignItems:'center'`, `minHeight: 44` (touch-target minimum, 07 §4 convention already used by `Button`), `paddingHorizontal: spacing['4']` (`layout.screenGutter`), `paddingBottom: spacing['2']`, `paddingTop: safeTop ? insets.top + spacing['3'] : spacing['2']`. Title uses `typography.headline` (17/semibold) — the style already used by the majority of existing inline sheet titles (`ReorderExercisesSheet`, `ExercisePickerSheet`, `NoteEditSheet`, `AddToSupersetSheet`, `FolderNameSheet`, `ExerciseTypeSheet`, `FilterOptionSheet`, `MultiSelectOptionSheet`, `PlateCalculatorSheet`) — chosen for zero visual drift at most call sites; the two outliers currently on `typography.title2` inline (`SaveWorkoutSheet`, `LogEntrySheet`) step down to `headline` for consistency once they adopt `SheetHeader` (flagged per-row in §6).

`kind: 'back'` renders a `ChevronLeft` (lucide-react-native, `size=24 strokeWidth=1.75`, matching `ExerciseDetailScreen`'s existing back-chevron styling) with `hitSlop={8}`. `kind: 'label'` renders `Text` at `typography.body` weight 600, colored by `tone` (`default`→`text.primary`, `accent`→`accent.text`, `danger`→`semantic.danger`) inside a `Pressable` with `hitSlop={8}`. `kind: 'custom'` is the escape hatch for clusters like `ExerciseDetailScreen`'s Edit+⋯ pair (not used by this PRD's own retrofit, reserved for PRD E).

### 4.3 `src/ui/ScreenFooter.tsx` (new file)

```ts
export interface ScreenFooterProps {
  children: React.ReactNode;
  /** Extra gap beyond the raw safe-area bottom inset. Defaults to `spacing['4']` (16pt). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
```

```
paddingHorizontal: layout.screenGutter   // spacing['4'] = 16
paddingTop:         spacing['3']         // 12 — separates footer from the content above it
paddingBottom:       insets.bottom + (gap ?? spacing['4'])   // "decent gap" = one full spacing-scale step (16pt) beyond raw safe-area
```

**Why `spacing['4']` (16pt) as the default extra gap, resolved:** it's the token already doing double duty as `layout.screenGutter`/`layout.cardPadding` elsewhere in this design system, so the footer's bottom clearance reads as the same rhythm as the rest of the layout rather than a bespoke magic number. It's generous enough to solve the user's literal mis-tap complaint (16pt is a meaningful fraction of a 44pt touch target) without being so large it reads as broken whitespace.

**Placement contract — not sticky, "brings up" short content, this is the part most retrofits will get wrong if not called out explicitly:** `ScreenFooter` must be rendered as the **last child inside the same scrollable container as the rest of the content** (i.e. the last item passed to a `ScrollView`'s children / laid out in its `contentContainerStyle` flow), **not** as a sibling positioned after a separate `flex:1`-sized `ScrollView`. The difference matters:
- Wrong (today's pattern, e.g. `ReorderExercisesSheet`): `<ScrollView style={{flex:1}}>…</ScrollView><Button/>` — the `ScrollView` claims all remaining flex space regardless of how little content it holds, so the footer always renders pinned to the physical bottom edge with a dead gap above it when content is short. This is the "sticky-by-accident" failure mode the user explicitly said they don't want.
- Right: put `ScreenFooter` as the final element *inside* the scrollable content (no `flex:1` on the `ScrollView`/its wrapper). Short content → the whole column (content + footer) is shorter than the viewport and renders in its natural position right below the last row — "brought up," exactly as asked. Long/overflowing content → `ScreenFooter` scrolls with everything else and lands immediately after the last item once scrolled to the end — never floats over content, never needs `position:'absolute'`.

Retrofits that currently use the `ScrollView(flex:1) + sibling Button` shape (`ReorderExercisesSheet`, `NoteEditSheet`, `DurationEditSheet`, etc. — see table) need this restructure, not just a style swap, when they adopt `ScreenFooter`. Fixed-content sheets with no `ScrollView` at all (content already fits, e.g. a short form) need no restructure — `ScreenFooter` as the last child of a plain column `View` already behaves correctly.

### 4.4 `src/ui/ButtonRow.tsx` (new file) + `Button.tsx` `fullWidth`

Root cause: in a `flexDirection:'row'` parent, `Button`'s `alignSelf` only ever affects the *cross* (vertical) axis — it was never going to make two `md`/`sm` buttons equal-width side by side, because nothing in `Button.tsx` sets anything on the row's *main* (horizontal) axis. The `lg`/full-width case only "worked" because `lg` buttons are conventionally used solo in a column, where `alignSelf` **is** the main axis.

Two independent, additive fixes:

**(a) `Button.tsx` — new optional prop, non-breaking:**
```ts
export interface ButtonProps {
  // ...existing fields unchanged...
  /** Forces full-width (`alignSelf:'stretch'`) regardless of `size`. For a solo button in a column that needs to be full-width without borrowing `size="lg"`'s 50pt height. Not useful inside `ButtonRow` (see below) — that's an equal-flex row problem, not a stretch problem. */
  fullWidth?: boolean;
}
```
`alignSelf: (size === 'lg' || fullWidth) ? 'stretch' : 'flex-start'` replaces the current `size === 'lg' ? 'stretch' : 'flex-start'` line — the only change to `Button.tsx`'s existing render logic.

**(b) `src/ui/ButtonRow.tsx` — new component, solves the actual row-of-equal-width-buttons case:**
```ts
export interface ButtonRowProps {
  /** One or more `<Button>` elements, rendered left-to-right with equal width. */
  children: React.ReactNode;
  /** Gap between buttons. Defaults to `spacing['3']` (12pt). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
```
Implementation: `<View style={[{ flexDirection:'row', gap: gap ?? spacing['3'] }, style]}>` wrapping `React.Children.map(children, (child) => React.isValidElement(child) ? React.cloneElement(child, { style: [child.props.style, { flex: 1 }] }) : child)`. Injecting `flex:1` into each `Button`'s own `style` prop works with zero `Button.tsx` changes, because `Button`'s internal style array already spreads the caller-supplied `style` last (`[styles.base, {...computed}, style]`), so `flex:1` wins over the computed `alignSelf`. Usage guideline (not enforced by the component): give every `Button` inside one `ButtonRow` the same `size` so their heights match.

This directly resolves the PRD B dependency noted in the brief ("footer buttons of different sizes not sitting side-by-side").

### 4.5 Decision matrix — Sheet vs. real full-screen route

Cited by PRDs C, D, E, F. Rule of thumb, in order:

1. **A Sheet that itself renders another `Sheet` while it is open (nesting) — the CHILD, not the parent, is what must stop being an independent `Sheet`.** Convert the child to either (a) a real `expo-router` full-screen route (`presentation:'fullScreenModal'`, `animation:'slide_from_bottom'` — matching the existing pattern for `workout/active`, `routine/new`, etc.) if it has enough independent identity to deserve its own URL/back-stack entry, or (b) inline conditional content within the *same* sheet body (no separate `Sheet`/`Modal` wrapper at all) if it's simple enough not to need one. Never leave it as a second independently-mounted `Sheet`.
2. **A Sheet that is a leaf (opens nothing further) can stay a `Sheet` at `detent="full"`**, once it adopts `SheetHeader` + `ScreenFooter` from this PRD — no route conversion needed. The fixed structural gaps (safe area, header centering, dismiss affordance) that used to be the reason to reach for a real route are solved at the primitive level now.
3. **A Sheet that is a leaf and semantically small** (a short menu, a single wheel-picker, a handful of fields with no independent navigation identity) **can stay at `detent="half"`** — no full-height/route conversion consideration applies at all; only the mechanical `SheetHeader`/`ScreenFooter` retrofit (if it has a title/footer) applies.
4. Practical test for "does this Sheet need to become a route": *does anything inside it ever need to open a second overlay while it's open?* If yes → rule 1 (the overlay it opens is what converts). If the Sheet in question is itself someone else's overlay-inside-a-sheet, it is the one that needs converting, not its parent.

**Full-detent-specific corollary — dismiss affordance is now mandatory (resolved decision, not in the original brief but required by the mechanics above):** once `detent="full"` is truly 100% of the window (4.1), the scrim `Pressable` behind the sheet has effectively zero visible/tappable area — tap-outside-to-dismiss is no longer a functioning affordance in practice, even though the `Pressable` is still technically mounted. **Every `detent="full"` call site must have an explicit dismiss control** — a `SheetHeader` `left`/`right` slot (`back` or `label` kind) or a `ScreenFooter` button — it can no longer rely on the scrim as its only way out. This is called out per-row in the retrofit table below; several current `full` call sites have no dismiss button today and need one added as part of this PRD (not deferred), since no other PRD in the B–H list owns that gap for those specific files.

## 5. API Change Summary

| File | Change | Breaking? |
|---|---|---|
| `src/ui/Sheet.tsx` | `detent="full"` height 90%→100%, radius/grabber removed for `full` only, `paddingBottom: insets.bottom` added for both detents, `paddingTop` insets left to `SheetHeader` | Non-breaking prop-wise (`SheetProps` unchanged); visually changes every existing `detent="full"` call site — intended |
| `src/ui/SheetHeader.tsx` | New file/export | New |
| `src/ui/ScreenFooter.tsx` | New file/export | New |
| `src/ui/ButtonRow.tsx` | New file/export | New |
| `src/ui/Button.tsx` | New optional `fullWidth?: boolean` prop | Non-breaking, additive |

No backend/data-layer API surface touched by this PRD.

## 6. Frontend Change Summary — retrofit table (all 28 call sites)

Legend: **SH** = adopt `SheetHeader`. **SF** = adopt `ScreenFooter` (± `ButtonRow` where noted). **FH** = full-height fix — automatic once §4.1 lands, listed only for awareness, not a separate task. **+Dismiss** = full-detent call site currently has no dismiss control and needs one added (§4.5 corollary). **LP** = lightweight "list-safe-bottom padding" only (`contentContainerStyle.paddingBottom: insets.bottom + spacing['2']`) for plain menu/list sheets with no title and no footer button — not worth a full `ScreenFooter` for a non-interactive scroll tail.

| # | Call site | Detent | SH | SF | FH | +Dismiss | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `app/dev/gallery.tsx` | half | optional | yes | – | – | Dev-only harness; low priority, apply for parity with the rest of the design system's own demo page. |
| 2 | `app/(tabs)/profile/settings/index.tsx` (2 sheets: default-rest-timer, weekly-goal) | half | yes | – | – | – | Title currently `alignSelf:'flex-start'` inline — becomes centered under `SheetHeader` (no header button present). No footer button (`WheelPicker` commits via `onChange`). |
| 3 | `src/features/calendar/CalendarScreen.tsx` | half | yes | yes | – | – | Title inline-left → `SheetHeader`, no button slots. Existing bottom `Button` → `ScreenFooter`, restructure off any `flex:1` ScrollView per §4.3. |
| 4 | `src/features/exercises/ExerciseDetailScreen.tsx` | half (own inline actions-sheet) | — | — | — | — | **OUT OF SCOPE — deferred to PRD E.** Screen's own header (back/Edit/⋯, separate title) and its embedding inside `ExerciseDetailSheet` are E's job. Its inline actions-`Sheet` has no title/footer, needs nothing from A even mechanically. |
| 5 | `src/features/exercises/ExerciseTypeSheet.tsx` | full | yes | LP | auto | **yes** | No dismiss control today. Add `left: { kind:'label', label:'Cancel' }` (list-picker precedent, iOS-idiomatic even though selection commits per-row). |
| 6 | `src/features/exercises/FilterOptionSheet.tsx` | full | — | — | — | — | **OUT OF SCOPE — deferred to PRD E** (nested under `ExercisePickerSheet`, 2 instances: equipment/muscle). |
| 7 | `src/features/exercises/MultiSelectOptionSheet.tsx` | full | yes | LP | auto | already has one | Existing title + "Done" (ghost/sm) top-right → `SheetHeader` `right:{kind:'label', label:'Done', tone:'accent'}`. |
| 8 | `src/features/measurements/LogEntrySheet.tsx` | full | yes | yes | auto | **yes** | Title (`title2`, inline in scroll) → fixed `SheetHeader` (step to `headline`) + add `left:{kind:'back'}` (form has its own multi-button footer already, don't crowd it with a second Cancel). Existing bottom button cluster (Retry/Save/etc.) → wrap in `ScreenFooter`, unchanged semantics — verify buttons currently sit at the true end of scroll content before wrapping. |
| 9 | `src/features/profile/ProfileScreen.tsx` | half | yes | verify/yes | – | – | Title inline-left → `SheetHeader`. Verify whether the edit sheet has a Save-type control at the bottom; if so wrap in `ScreenFooter`. |
| 10 | `src/features/routines/FolderNameSheet.tsx` | half | yes | yes | – | – | Title inline-left + `Button` (Save) → `SheetHeader` (no slots) + `ScreenFooter`. |
| 11 | `src/features/routines/MoveToFolderSheet.tsx` | half | n/a | LP | – | – | No title Text found — plain folder-list picker. No `SheetHeader` change required (nothing to center); apply list-safe-bottom padding only. |
| 12 | `src/features/routines/RoutineActionsSheet.tsx` | half | n/a | LP | – | – | Plain `Pressable` action menu, no title/footer button. LP only. |
| 13 | `src/features/routines/RoutineExerciseMenuSheet.tsx` | half | n/a | LP | – | – | Same shape as #12. LP only. |
| 14 | `src/features/routines/RoutineSetRow.tsx` (inline menu sheet) | half | n/a | LP | – | – | Same shape as #12. LP only. |
| 15 | `src/features/workout/AddToSupersetSheet.tsx` | half | yes | yes | – | – | Title inline-left + confirm `Button` → `SheetHeader` (no slots) + `ScreenFooter`. |
| 16 | `src/features/workout/AddWarmUpSetsSheet.tsx` | half | — | — | — | — | **EXCLUDED.** PRD H deletes this component entirely — retrofitting it here would be wasted/conflicting work. See §9. |
| 17 | `src/features/workout/ConnectedSetRow.tsx` (2 inline sheets: set-type menu, RPE picker) | half (both) | verify | verify | – | – | Verify each independently for a title/confirm button; apply `SheetHeader`/`ScreenFooter` only where one exists, else LP. |
| 18 | `src/features/workout/DurationEditSheet.tsx` | half | verify | yes | – | – | 3 `Button`s present (step controls + final confirm) — verify title presence; wrap the terminal confirm in `ScreenFooter`, restructure off `flex:1` ScrollView per §4.3 if present. |
| 19 | `src/features/workout/DurationTimerSheet.tsx` | half | verify | yes (`ButtonRow`) | – | – | 2 `Button`s (Start + Cancel/Reset) side by side — clean `ButtonRow` case, wrap in `ScreenFooter`. |
| 20 | `src/features/workout/EditWorkoutMetaSheet.tsx` | half | verify | yes | – | – | Single `Button` ("Save") → `ScreenFooter`; verify title presence for `SheetHeader`. |
| 21 | `src/features/workout/ExerciseCardMenuSheet.tsx` | half | n/a | LP | – | – | Menu-style, no title/footer button. LP only. |
| 22 | `src/features/workout/ExerciseDetailSheet.tsx` | full | — | — | — | — | **OUT OF SCOPE — deferred to PRD E** (wraps `ExerciseDetailScreen` with `showBackButton=false`, nested under `ExercisePickerSheet`). |
| 23 | `src/features/workout/NoteEditSheet.tsx` | half | yes | yes | – | – | Title inline-left + Save `Button`, no header dismiss control today (acceptable — `half` retains a functioning scrim). Apply mechanical `SheetHeader`/`ScreenFooter` now; **coordinate with PRD F** (`notes-rest-timer-inline`) before/after — F will further redesign this screen's content, but A's baseline wiring is not wasted work the way H's deletion makes AddWarmUpSetsSheet's retrofit wasted (F modifies, doesn't delete). |
| 24 | `src/features/workout/PlateCalculatorSheet.tsx` | full | yes | verify | auto | **yes** | Title inline (not fixed) → `SheetHeader`, add `right:{kind:'label', label:'Done', tone:'accent'}` (stateless calculator, nothing to "cancel"). Verify whether a terminal confirm control exists; if so `ScreenFooter`, else LP. |
| 25 | `src/features/workout/RestTimerSheet.tsx` | half | verify | yes | – | – | Existing `Button` (`onPress={onDismiss}`) already functions as a dismiss/skip action → wrap in `ScreenFooter`. Verify title presence. **Coordinate with PRD F**, same reasoning as #23. |
| 26 | `src/features/workout/SaveWorkoutSheet.tsx` | full | yes | yes (`ButtonRow`) | auto | **yes** | Title (`title2`, inline) → fixed `SheetHeader` (step to `headline`). Add Cancel: bottom `ButtonRow` `[Cancel (tonal), Save (primary)]` inside `ScreenFooter` — finite form, bottom preferred per user's own stated order over top-left. |
| 27 | `src/features/workout/TimerPill.tsx` (inline full-detent rest-timer sheet) | full | yes | yes | auto | **yes** | No title/dismiss today. Add `SheetHeader` title "Rest Timer" (no slots) + bottom `ScreenFooter` single "Close" button (tonal) — short fixed content (ring + controls), bottom preferred. |
| 28 | `src/features/workout/ReorderExercisesSheet.tsx` | full | yes | yes | auto | **flag, don't add** | Mechanical fixes (title via `SheetHeader`, wrap existing "Save Order" in `ScreenFooter`, restructure off `flex:1` ScrollView per §4.3) are in scope for A. The missing Cancel/dismiss affordance is *also* required per the §4.5 corollary, but **PRD C (`reorder-exercises-sheet-fixes`) is named specifically for this file** — leave a cross-reference rather than adding Cancel here, to avoid A and C making conflicting simultaneous edits to the same header row. |

Row counts: 28 call-site groups total (matching the brief's list, `ConnectedSetRow`'s 2 sheets and settings' 2 sheets each counted as one row per the brief's own list). 4 rows fully out of scope (4, 6, 22, and 16-excluded) leaves **24 rows** for `dev-tasks` to turn into per-call-site tasks, several of which (11–14, 21) resolve to a single-line LP change.

## 7. Testing

- **`src/ui/__tests__/Sheet.test.tsx`** (existing file, read in full): already parameterizes both detents (`it.each(DETENTS)`) for the smoke-render tests — extend with: (a) a `full`-detent height assertion (via inspecting the rendered `sheet-content` style height equals the mocked window height, not 90% of it), (b) a border-radius-zero assertion for `full` vs. non-zero for `half`, (c) an inset-math test using the existing `jest/safe-area-context-mock.tsx` pattern — that mock defaults every inset to `0`, so a *non-zero* case needs the test to wrap the tree in `SafeAreaInsetsContext.Provider value={{top:44,bottom:34,left:0,right:0}}` (exported from the mock file already) and assert `styles.content`'s computed `paddingBottom` includes `34`. All 6 existing open/dismiss behavioral tests are untouched by this change (they don't assert on height/padding) and should keep passing unmodified.
- **New `src/ui/__tests__/SheetHeader.test.tsx`**: (a) title centers with no slots, (b) title left-aligns + gets `marginLeft` with only `left` given, (c) same for `right`-only, (d) both given, (e) `kind:'back'` fires `onPress` on press, (f) `kind:'label'` renders the given label and tone color, (g) `safeTop` true adds `insets.top` (again using the `SafeAreaInsetsContext.Provider` override pattern above), false doesn't.
- **New `src/ui/__tests__/ScreenFooter.test.tsx`**: (a) `paddingBottom` = `insets.bottom + spacing['4']` by default with a non-zero inset override, (b) custom `gap` overrides the default, (c) renders `children` unchanged, (d) not `position:'absolute'` in its computed style (regression guard for the "not sticky" contract).
- **New `src/ui/__tests__/ButtonRow.test.tsx`**: (a) N `Button` children each receive `flex:1` in their rendered style, (b) `gap` prop passes through to the row container, (c) non-`Button` children (defensive) pass through unmodified rather than throwing.
- **`src/ui/__tests__/Button.test.tsx`** (existing, read in full for style-assertion conventions to match): extend with a `fullWidth` case asserting `alignSelf:'stretch'` for `size="sm"`/`"md"` when `fullWidth` is true, and that it's a no-op (still `'stretch'`) for `size="lg"`.
- **Per-call-site retrofit tasks** (§6 table): every row that already has an existing test file (11 of the 28 do — `LogEntrySheet.test.tsx`, `SaveWorkoutSheet.test.tsx`, `AddToSupersetSheet.test.tsx`, `DurationTimerSheet.test.tsx`, `DurationEditSheet.test.tsx`, `ExerciseCardMenuSheet.test.tsx`, `EditWorkoutMetaSheet.test.tsx`, `PlateCalculatorSheet.test.tsx`, `NoteEditSheet.test.tsx`, `RestTimerSheet.test.tsx`, `ExerciseTypeSheet.test.tsx`, `MultiSelectOptionSheet.test.tsx`) must keep passing after the retrofit — most will need `testID` lookups updated if a title's `testID` moves from an inline `Text` to `SheetHeader`'s internal title node (this PRD doesn't prescribe `SheetHeader`'s internal title `testID` format beyond `` `${testID}-title` `` — following this repo's `${testID}-suffix` convention used everywhere else in these files).

## 8. Manual Intervention Required From You

None. This is a design-only PRD; no external services, secrets, accounts, or manual approvals are needed to implement it. The one thing worth a heads-up: §6 row 26/27/28/24/5 add *new* Cancel/Done/Close buttons to sheets that don't have one today — these are new user-facing controls (new copy: "Cancel", "Done", "Close"), not purely cosmetic, so a quick eyeball of the final copy/placement once implemented is worth doing even though no approval gate blocks the work itself.

## 9. Open Questions & Decisions

1. **Should `Sheet.tsx` add a baseline `insets.bottom` to *all* detents, risking double-padding with `ScreenFooter`?** [RESOLVED: yes, add it unconditionally as a baseline safety net — see §4.1.3. The double-count is a deliberate, harmless safety margin (a few extra points of whitespace) versus the alternative of under-padding, which is the user's literal complaint. It also covers the ~5 plain-menu call sites that have no `ScreenFooter` at all and would otherwise get zero bottom protection.]
2. **Mirrored-equal-slot-width vs. literal "don't center if any button present" for `SheetHeader`?** [RESOLVED: literal reading, per §4.2 — matches the user's own words exactly, is simpler to spec and implement, and matches the existing `ExerciseDetailScreen` precedent in this codebase.]
3. **Should `detent="full"` sheets keep rounded top corners / the grabber?** [RESOLVED: no to both, for `full` only — see §4.1.1. This isn't explicitly requested line-by-line in the brief but follows directly from "outer slide-up panels should be full screens... the slide-up part is only the animation."]
4. **Do full-detent sheets need a mandatory dismiss control now that the scrim is gone?** [RESOLVED: yes — §4.5 corollary. Six production call sites (`ExerciseTypeSheet`, `LogEntrySheet`, `PlateCalculatorSheet`, `SaveWorkoutSheet`, `TimerPill`'s inline sheet, and `ReorderExercisesSheet` flagged-not-added) currently have no dismiss affordance at `detent="full"` and need one added as part of this PRD's retrofit — except `ReorderExercisesSheet`, which is flagged for PRD C instead of touched directly, to avoid two PRDs editing the same header simultaneously.]
5. **`AddWarmUpSetsSheet` sequencing risk (A retrofits it, H deletes it — wasted/conflicting work)?** [RESOLVED: excluded from this PRD's retrofit table entirely (§3, §6 row 16). H's job is deletion, not fixing; there is nothing for A to gain by touching a component that won't exist once H lands. `dev-tasks` should not generate a task for this row.]
6. **Should this PRD retrofit `ExerciseDetailScreen`'s own (non-Sheet) header, since the app-wide "all screens" instruction technically covers it?** [RESOLVED: no — deferred entirely to PRD E, which owns that exact file (`exercise-detail-fullscreen-summary`) and will very likely rebuild that header as part of its own conversion work anyway. Touching it here risks being overwritten by E immediately after. `SheetHeader`/`ScreenFooter` are built Sheet-agnostic specifically so E can adopt them without this PRD needing to touch the file first.]
7. **`NoteEditSheet`/`RestTimerSheet` mechanical retrofit now vs. wait for PRD F?** [RESOLVED: retrofit now (unlike `AddWarmUpSetsSheet`, these aren't being deleted, only further redesigned by F) — but flagged as a coordination note in the table so whoever picks up F's tasks knows A already touched these files and should build on top of, not revert, the `SheetHeader`/`ScreenFooter` wiring.]
8. **Exact `testID` convention for `SheetHeader`'s internal title/slot nodes?** [RESOLVED: `` `${testID}-title` ``, `` `${testID}-left` ``, `` `${testID}-right` `` — matches the `${testID}-suffix` convention already used consistently across every file read during this PRD's research (e.g. `${testID}-cancel`, `${testID}-save`, `${testID}-scrim`, `${testID}-content` in `Sheet.tsx` itself).]
9. **Does `ButtonRow` need to support more than 2 children (e.g. a 3-button row)?** [RESOLVED: yes, the `React.Children.map` implementation in §4.4(b) is arity-agnostic — N children each get `flex:1`, so a 3-way row divides evenly with no special-casing needed. No call site in the current retrofit table needs more than 2, but the primitive isn't artificially limited to 2.]
