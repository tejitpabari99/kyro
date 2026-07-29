# Kyro Design Principles

**Status:** Durable reference. Living document — update it whenever a future PRD/screen makes a new cross-cutting UI/UX decision, rather than re-deriving conventions per screen.

**Source:** Synthesized from the 10-PRD Hevy-style UI/UX overhaul planning batch authored 2026-07-28 (`docs/agent_files/tasks/2026-07-28/01`–`10`), all ten of which were authored in parallel by independent agents with no shared context and no human available to resolve conflicts. This doc reads all ten PRDs plus `src/ui/tokens.ts` directly, reconciles what they decided, and canonicalizes the result. **As of this writing, none of the 10 PRDs have been implemented** — this is a design-only planning batch. Section 8 lists every place the PRDs disagree with each other or with themselves; whoever implements these PRDs (via `dev-tasks`/`dev-code`) must resolve those, not silently pick one side.

Every rule below cites the PRD(s) it came from, using the batch's own letters: **A**=`01-sheet-header-footer-foundation`, **B**=`02-active-workout-footer-buttons`, **C**=`03-reorder-exercises-sheet-fixes`, **D**=`04-exercise-picker-settings-icon`, **E**=`05-exercise-detail-fullscreen-summary`, **F**=`06-notes-rest-timer-inline`, **G**=`07-history-routines-list-decarding`, **H**=`08-warmup-set-menu-cleanup`, **I**=`09-tabs-navigation-restructure`, **J**=`10-active-workout-visual-parity`.

**Scope discipline for future editors:** this doc extracts and reconciles decisions the PRDs already made. It does not invent new ones. If a future screen needs a decision this doc doesn't cover, make the decision in that screen's own PRD, then fold the reusable part back into this doc — don't silently diverge.

---

## 1. Color & semantic tokens

Source of truth: `src/ui/tokens.ts` (read directly for this doc — not paraphrased from any PRD). Dark theme is the default/primary; light theme is fully specified alongside it.

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `accent.primary` | `#10B981` | `#059669` | Buttons, active tab, **checked-set checkmark**, live duration, chart lines |
| `accent.text` | `#34D399` | `#047857` | Text links, exercise names, tinted icons |
| `accent.onAccent` | `#04231A` | `#FFFFFF` | Label color on an `accent.primary`-filled control — **tuned for green specifically**, not a generic "on-fill white" token (see J's `onInfo` addition below) |
| `accent.pressed` | `#0DA271` | `#04785C` | Pressed-state fill |
| `semantic.success` | `#10B981` (`= accent.primary`) | `#059669` (`= accent.primary`) | Checked states, PR banner. Token file's own comment: **"no separate green"** — there is exactly one green in this design system, and it is `accent.primary`. |
| `semantic.danger` | `#EF4444` | `#DC2626` | Destructive text/buttons, Failure-set badge `F`, delete-swipe panel |
| `semantic.warning` | `#F59E0B` | `#D97706` | Warm-up badge `W`, cautions |
| `semantic.info` | `#3B82F6` | `#2563EB` | Drop-set badge `D` (original single use) — **now also the rest-timer panel's progress bar / Skip button fill (PRD J)** |
| `semantic.onInfo` **(new, PRD J)** | `#FFFFFF` | `#FFFFFF` | Label color on a `semantic.info`-filled control. Added because `accent.onAccent`'s dark-theme value is a green-tuned near-black, wrong hue/contrast on a blue fill — see J §4.2.2, §5. |
| `semantic.chartSecondary` | `#2DD4BF` | `#14B8A6` | Second chart series (teal) |
| `bg.accentSubtle` | `rgba(16,185,129,.08)` | `rgba(5,150,105,.08)` | Checked-row tint, selected states |
| `semantic.overlay` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.5)` | Sheet scrim |

### The rule (confirmed, not just paraphrased — PRD J Part 1, §1/§8)

**Green (`accent.primary`/`semantic.success`) means completion, and only completion.** J's own investigation (reading `SetRow.tsx`, `tokens.ts`, and `git log`) confirmed the completed-set row/checkmark has been green since the very first commit that added that UI — there is no red-completion bug to fix. Any observed "red" on a completed row is one of: the Failure-badge `F` letter (`semantic.danger`, sits in the same row), the swipe-to-delete panel (`semantic.danger`, revealed mid-gesture), or a stale build.

**Blue (`semantic.info`) means "timer / informational emphasis," never completion.** J deliberately did **not** reuse green for the new rest-timer panel (progress bar fill, Skip button), even though the Hevy reference and this app's own single-accent system might tempt it, specifically to avoid diluting green's "completion" meaning (J §4.2.2). This is the template for the app's growing color vocabulary: green = "you did the thing," blue = "something is actively counting down / needs attention but isn't success or failure," red = "destructive/failure only."

**Rule for future screens:** do not introduce a new color meaning (a new "state" a hue represents) without updating this table. If an existing token's hue already fits the new state's semantics (as `semantic.info` did for the rest timer), reuse it — don't invent a new hex. If no existing token fits, add one to `tokens.ts` following the existing `{tone}`/`on{Tone}` pairing shape (see `accent.primary`/`accent.onAccent`, `semantic.info`/`semantic.onInfo`), and update this doc in the same change.

### Typography scale (`src/ui/tokens.ts` §3, verbatim)

| Token | Size/weight | Common use |
|---|---|---|
| `display` | 34/700 | Largest token in the system — biggest number on screen (e.g. rest-timer countdown, PRD J) |
| `title1` | 28/700 | Screen-level titles (e.g. `ExerciseBrowseScreen`, `MeasuresHomeScreen`) |
| `title2` | 22/600 | See §8 — contested between PRD A and PRD C for sheet titles |
| `title3` | 20/600 | — |
| `headline` | 17/600 | See §8 — PRD A's default `SheetHeader` title size |
| `body` | 17/400 | `ListRow` default title weight (regular, not semibold) |
| `subhead` | 15/400 | Secondary/preview text |
| `footnote` | 13/400 | Meta text, dense-row secondary content |
| `caption` | 12/400 | — |
| `statLarge`/`statSmall`/`setValue` | 28/15/17, tabular-nums | Any mutable numeric display |

### Spacing / radii (`src/ui/tokens.ts` §4, verbatim)

Spacing scale (pt): `spacing['0.5']=2, '1'=4, '2'=8, '3'=12, '4'=16, '5'=20, '6'=24, '8'=32, '10'=40, '12'=48`. `layout.screenGutter = layout.cardPadding = spacing['4']` (16pt); `layout.cardGap = spacing['3']` (12pt). Radii: `sm=8` (inputs/chips), `md=12` (cards/buttons), `lg=16` (sheets/modals), `pill=999`.

---

## 2. Screen & panel structure

### Sheet vs. full-screen-route decision matrix (PRD A §4.5, applied by E, extended by I)

In order:

1. **A Sheet that itself renders another Sheet while it is open must stop nesting.** The *child*, not the parent, is what converts — either to a real `expo-router` full-screen route (`presentation:'fullScreenModal'`, `animation:'slide_from_bottom'`), or to inline conditional content within the same sheet body if it's simple enough not to need its own overlay. **A Sheet stacked on top of a Sheet (two grabbers, two rounded frames, two slide-up animations) is never allowed.**
2. A Sheet that is a **leaf** (opens nothing further) can stay a `Sheet` at `detent="full"` once it adopts `SheetHeader`+`ScreenFooter` — no route conversion needed.
3. A Sheet that is a leaf **and** semantically small (short menu, single wheel-picker, a handful of fields with no independent nav identity) can stay at `detent="half"` — no full-height consideration at all.
4. Practical test: *does anything inside this Sheet ever need to open a second overlay while it's open?* If yes, rule 1 applies to whichever is the inner one.

**Corollary — full-detent sheets need an explicit dismiss control (PRD A §4.5).** Once `detent="full"` is true 100%-of-window (§3 below), the scrim behind it has no visible/tappable area left — tap-outside-to-dismiss stops functioning in practice. **Every `detent="full"` call site must have an explicit dismiss control** (a `SheetHeader` `left`/`right` slot, or a `ScreenFooter` button). See §8 for one place this corollary is not actually satisfied after both PRDs that were supposed to jointly cover it land.

**Real-world refinement from PRD E:** converting a nested sheet doesn't always mean adopting `SheetHeader`. `ExercisePickerSheet`'s ⓘ-button conversion (nested `ExerciseDetailSheet` → real `/exercise/[id]` route) needed **zero** of PRD A's primitives — the destination route already has its own pre-existing header chrome, and the *parent* sheet's own header is untouched. E's pattern: **suspend, don't unmount** — when a nested sheet's child needs to become a real route but the parent's local state (selections, filters, search text) must survive the round trip, hide the parent's `Sheet` (`visible={visible && !isNavigatingAway}`) rather than dismissing it, and restore it via `useFocusEffect` when the underlying screen regains focus. Accepted cosmetic tradeoff: the parent Sheet replays its 250ms entrance animation on return, since `Sheet` has no "resume without re-animating" mode (E AD-4). This is the reusable template for any future "sheet opens something that needs to be a route, but must preserve sheet-local state" case. Note: `useFocusEffect` is a first-of-its-kind pattern in this codebase (E flags it for on-device verification, and flags that every test mocking `expo-router` around a component using it needs an explicit `useFocusEffect` override or it crashes under RNTL).

### Centered-title algorithm — `SheetHeader` (PRD A §4.2, exact API)

```ts
export type SheetHeaderSlot =
  | { kind: 'back'; onPress: () => void; ... }
  | { kind: 'label'; label: string; onPress: () => void; tone?: 'default' | 'accent' | 'danger'; ... }
  | { kind: 'custom'; content: React.ReactNode };

export interface SheetHeaderProps {
  title: string;
  left?: SheetHeaderSlot;
  right?: SheetHeaderSlot;
  safeTop?: boolean; // insets.top clearance — true only for detent="full" / edge-to-edge full-screen routes
}
```

Three zones: `left` (sized to content, not reserved when absent), `title` (`flex:1`), `right` (same as `left`). The rule, literally:

```
title textAlign = (left == null && right == null) ? 'center' : 'left'
```

**No mirrored-equal-slot-width trick.** A single boolean check, not forced-centering-via-symmetric-slots — chosen because it's the literal reading of the user's own words ("center unless there's a button on the left or right"), and it matches the pre-existing precedent in `ExerciseDetailScreen`'s hand-rolled header (already left-aligns everything once any button is present). **Exception rule, stated precisely: any button on either side (even just one) disables centering entirely — it does not shift the title away from that one side only.**

Row chrome: `minHeight: 44` (touch-target floor, matches `Button`'s convention), `paddingHorizontal: layout.screenGutter` (16pt), title at `typography.headline` (17/semibold) — see §8 for the one place this default is contradicted by a sibling PRD.

### Full-height fix (PRD A §4.1)

`detent="full"` changes from `windowHeight * 0.9` to true `windowHeight` (100%); `detent="half"` stays `windowHeight * 0.5`. For `full` only: corner radius → `0`, grabber → hidden (a `detent="full"` sheet should be visually indistinguishable from a real full-screen route — differing only in that it plays a 250ms slide transition instead of the router's native one). `half` keeps its rounded/grabber look unchanged. `insets.top` is deliberately **not** applied inside `Sheet.tsx` itself — `SheetHeader`'s own `safeTop` prop is the single owner of top-inset clearance (for both Sheet and non-Sheet contexts), to avoid double-padding once a caller renders both `Sheet` and `SheetHeader`.

### Navigator requirement — Stack, not Slot (PRD I §4.4)

Every tab segment layout (`app/(tabs)/{home,workout,profile}/_layout.tsx`) converts from `<Slot/>` to `<Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />`. `<Slot/>` builds route state via `StackRouter` (so `router.push`/`router.back()` work) but **never mounts a native-stack container** — no native header, no native back button, no swipe-back gesture, structurally, for every route nested under every tab. `<Stack>` is adopted purely for that native container (back-button plumbing + gesture recognizer); `headerShown: false` is kept on it, same as the root layout's own `<Stack>` — **this codebase's header convention stays "every screen hand-builds its own header row," even after the navigator can supply one natively.** This is the load-bearing reason `SheetHeader`/hand-rolled headers remain the UI's real header primitive, not React Navigation's native header.

### Back-button placement convention (PRD I §4.5)

Top-left, `ChevronLeft` (lucide-react-native, `size=24 strokeWidth=1.75`) + `Pressable` (`hitSlop={8}`) + `router.back()`, as the first sibling before the title `Text` in each screen's existing header row. This is the pre-`SheetHeader` hand-rolled convention (matches `ArchivedExercisesScreen.tsx`'s already-shipped pattern) — maps 1:1 onto `SheetHeader`'s `kind:'back'` slot once that primitive is actually adopted (I explicitly flags this as a follow-up migration, not done as part of I itself, since `SheetHeader` doesn't exist in code yet).

---

## 3. Bottom actions / footers

### The safe-area gap formula — canonical form

```
paddingBottom: insets.bottom + spacing['4']   // 16pt beyond the raw safe-area inset
```

This exact formula (magnitude, not necessarily code shape) is independently arrived at by **four** PRDs:

- **PRD A**, `ScreenFooter.tsx` (the canonical, shared primitive): `paddingBottom: insets.bottom + (gap ?? spacing['4'])`, default gap `spacing['4']`.
- **PRD B**, `ActiveWorkoutScreen.tsx`'s `ScrollView.contentContainerStyle`: `paddingBottom: insets.bottom + spacing['4']`, citing the *pre-existing* codebase idiom (`MeasuresHomeScreen.tsx:191`, `PhotoPagerScreen.tsx:286`, `PhotoGalleryScreen.tsx:338` all already used this before any of these PRDs existed).
- **PRD C**, `ReorderExercisesSheet.tsx`'s Save button: `marginBottom: insets.bottom + spacing['4']`.
- **PRD J**, `TimerPill.tsx`'s new panel: `insets.bottom` applied as outer container padding, stacked on top of the button row's own pre-existing `paddingBottom: spacing['4']` — same total, split across two style properties instead of one expression.

**They agree on the number. They do not agree on the mechanism** — see §8 for why this is flagged as unconverged reconciliation debt rather than settled precedent. `ScreenFooter` is the one that should win once PRD A ships; B/C/J all predate PRD A's existence and had no primitive to build on.

`Sheet.tsx` itself additionally applies a **baseline** `paddingBottom: insets.bottom` (no extra gap) unconditionally, for both detents, as a safety net for sheets that never render `ScreenFooter` at all (plain menu/list sheets) — this is a deliberate double-count with `ScreenFooter`'s own `insets.bottom` when both apply to the same sheet (PRD A §4.1.3): "the double-count is a deliberate, harmless safety margin... versus the alternative of under-padding, which is the user's literal complaint."

### Non-sticky, in-scroll-content placement rule (PRD A §4.3, PRD B §4.1)

`ScreenFooter` (and any footer-shaped block) must be the **last child inside the same scrollable container as the rest of the content** — never a sibling rendered after a separate `flex:1`-sized `ScrollView`.

- **Wrong** (the pre-existing bug pattern): `<ScrollView style={{flex:1}}>…</ScrollView><Footer/>` — the `ScrollView` claims all remaining flex space regardless of content length, so the footer is always pinned to the physical bottom edge with dead space above it on short content. This is the "sticky-by-accident" failure mode both A and B explicitly reject.
- **Right**: footer as the final element *inside* the scrollable content (no `flex:1` on the `ScrollView`/wrapper). Short content → whole column renders in natural position, "brought up." Long content → footer scrolls with everything else, reached at the natural end — never `position:'absolute'`.

B's application of this rule to `ActiveWorkoutScreen` is the concrete worked example: the `+ Add Exercise`/`Settings`/`Discard Workout` block moves from a pinned sibling to the last child of the exercise-list `ScrollView`. B explicitly rejected a `flexShrink:1`-hybrid alternative (RN Yoga defaults `flexShrink` to `0`, unlike web CSS, and no existing codebase precedent for that pattern) in favor of this simpler, already-idiomatic move.

### Equal-width button row — `ButtonRow` (PRD A §4.4)

Root cause fixed: in a `flexDirection:'row'` parent, `Button`'s `alignSelf` only ever governs the cross-axis — nothing in `Button.tsx` sets anything on the row's main axis, so `md`/`sm` buttons placed side by side never get equal width on their own.

Two additive, non-breaking fixes:
- **`Button.tsx` gains `fullWidth?: boolean`** — `alignSelf: (size==='lg' || fullWidth) ? 'stretch' : 'flex-start'`. For a *solo* button in a column that needs full width without borrowing `size="lg"`'s 50pt height.
- **New `ButtonRow.tsx`** — wraps children in `flexDirection:'row', gap: spacing['3']` and injects `flex:1` into each child's own `style` (via `React.cloneElement`), requiring zero `Button.tsx` internal change. Arity-agnostic (works for 2+ children). Usage convention: give every `Button` inside one `ButtonRow` the same `size` so heights match.

**Adoption status:** as of this batch, `ButtonRow`/`fullWidth` exist only as PRD A's design (not implemented in code). PRDs B, G, and J each independently solved the same "equal-width row" or "stretch this one button" problem using pre-existing mechanisms (`style={{flex:1}}` directly, `style={{alignSelf:'stretch'}}`, hand-rolled `Pressable`s) because A didn't exist yet when they were authored. See §8 for the full reconciliation list.

### Full-width primary-button convention for single-CTA sheets (PRD C §4.4)

`size="lg"` is the existing, already-established mechanism for a full-width solo primary CTA (`Button.tsx`: `alignSelf: size==='lg' ? 'stretch' : 'flex-start'`, `SIZE_HEIGHT.lg = 50`) — this is *not* superseded by PRD A's new `fullWidth` prop; `fullWidth` exists for `sm`/`md` buttons that need full width *without* the 50pt height bump. For a lone, full-width, bottom-anchored confirm button in a `detent="full"` sheet, use `size="lg"` (precedent: `ExercisePickerSheet.tsx`, `SaveWorkoutSheet.tsx`, and — per PRD C — `ReorderExercisesSheet.tsx`'s Save Order button).

---

## 4. Lists & density

### Card vs. plain-row rule (PRD G §9.1, §4)

**Rule, resolved:** default to a plain, unfilled row separated by a hairline divider (`colors.border.hairline`, `StyleSheet.hairlineWidth`) — not a `Card` (fill + shadow + rounded corners + 16pt padding) — for any **list of many similar items** (a routine list, a workout history feed). `Card` stays reserved for genuinely card-like, non-list content (detail-screen sections, stat blocks, standalone panels — its ~10 other call sites, none touched by this batch).

This resolves a literal tension G found in its own reference screenshot: Hevy's own routine rows are still inside a thin-bordered box, not truly borderless. G's resolution: **honor the user's literal words ("no cards, just regular") over the screenshot's literal chrome** — use the screenshot only for density/proportion reference, not as a pixel spec for "keep a border." If this reading is ever judged wrong, it's a small, contained fix (add a border back to the outer `View`) with nothing else depending on the no-border choice.

**Where to build the plain row:** compose the shared `ListRow` primitive directly (the established "plain dense list row" component, already proven in `ExerciseRow.tsx`/`ExerciseBrowseScreen.tsx`, including inside a `FlashList`) rather than hand-rolling a new row shape. Do not add new props to `ListRow` for one-off needs — pass custom nodes via its `trailing`/`leading` slots instead (G's approach for `HistoryWorkoutCard`'s relative-date trailing text).

### Row-height guidance

| Row shape | Target height | Precedent |
|---|---|---|
| Dense, buttonless, navigational row (title + one subtitle line, optional trailing text/chevron) | **~56–72pt** | `ExerciseRow.tsx`'s pre-existing `EXERCISE_ROW_HEIGHT = 64` is the anchor precedent. `HistoryWorkoutCard`'s de-carded redesign lands at ~57pt (PRD G §4.2) — in-band. |
| Row that must carry a full-width inline primary action + a 2-line preview + a menu trigger (e.g. `RoutineCard`'s "Start Routine") | **~130pt** | Cannot realistically hit the 64pt precedent without cutting the button, the preview, or the menu — G explicitly does **not** force a uniform height across dissimilar rows; ~129pt is the reasoned, token-derived target here (G §9.4). |

**Constant height over variable height, when the two are in tension:** G deliberately drops `HistoryWorkoutCard`'s old variable-length (0–N) inline per-exercise summary lines rather than keep them, specifically because a variable line count is incompatible with the fixed-height dense-row goal — the same information is one tap away in `HistoryDetailScreen` (G §9.2). **General rule for future dense rows:** if a summary field can be arbitrarily long/variable, prefer moving it to the detail screen over stretching the list row to accommodate it, unless the field is the row's primary scan target.

### Divider-vs-shadow convention

Plain rows get a **bottom hairline divider** (`StyleSheet.hairlineWidth`, `colors.border.hairline`) — never a `Card`-style shadow or filled background. When de-carding removes `Card`'s implicit "this is tappable" visual cue (a raised box reads as pressable; a flat divided row does not, on its own), **restore the affordance explicitly** — `ListRow`'s `chevron` prop for rows whose only action is "tap to navigate" (G's `HistoryWorkoutCard` fix, §9.6). Rows that already have an unambiguous affordance of their own (a real inline button, e.g. `RoutineCard`'s "Start Routine") don't need a chevron — the button itself is the affordance.

---

## 5. Inline vs. sheet-gated editing

### When a field should be always-visible/inline vs. behind a menu+sheet (PRD F §4.1)

**Promote a field to always-visible inline editing when:** it's a high-frequency, low-friction action the user does in the middle of another task (not as its own destination), it doesn't need a distinct "you are now editing this" full-screen/modal context, and hiding it behind a menu item adds a tap with no corresponding benefit. F's worked example: the per-exercise note, which used to require `⋯ → Add a Note → half-sheet → type → Save` (three taps + a modal transition) for something as small as "warm up longer."

**Keep it in a menu/sheet when:** it's infrequent, destructive, needs a dedicated confirmation step, or genuinely needs more screen than an inline field can offer (this batch didn't move anything the other direction — no example of "inline was over-promoted"; use judgment symmetrically).

**The dual-mode pattern** (not "always render a live `TextInput`," which was explicitly considered and rejected — F §4.1): a field that has both a rich **display** representation (e.g. `NoteText`'s tappable-URL-link rendering, which a raw `TextInput` cannot reproduce) and an **edit** representation should render two distinct states, not one compromise state:
- **Display mode** (default): the rich read-only view, or a placeholder when empty. Tapping switches to edit mode.
- **Edit mode**: a borderless, auto-growing input, autofocused. Blur (tap-away, or an explicit dismiss action) commits and returns to display mode.

No fixed `minHeight` on an inline field that replaces a dedicated sheet's input (a sheet-sized `minHeight:120` box looks jarring inline on a compact card) — size to content instead: single placeholder line when empty, grows with typing. No background box/border in either mode, when the surrounding card/row chrome is itself typography-driven rather than box-driven (matches this codebase's existing note styling) — avoids a jarring "pop into a box" transition between modes.

### Keyboard-dismiss-affordance pattern (PRD F §4.3, §4.4)

**Don't share one keyboard accessory bar across two components with opposite dismiss contracts.** The existing `KeyboardAccessoryBar` is purpose-built around the numeric set-table's ordered Next-traversal chain, whose own documented contract is "**keyboard never dismisses**" (it calls `.focus()` on the next field, never `Keyboard.dismiss()`). A free-text field's natural contract is the opposite: "I'm done writing, dismiss." F's resolution: a small, separate `KeyboardDoneBar` — same `InputAccessoryView`-per-screen mounting pattern as the numeric bar (one shared `nativeID`, referenced by every `TextInput` on that screen that wants it), but with a single Done button whose only job is `Keyboard.dismiss()`. It needs no callback prop — dismissing the keyboard fires the focused field's native `onBlur`, and that's already where commit logic lives.

**General rule:** when two input surfaces look similar but have deliberately opposite behavioral contracts (dismiss-never vs. dismiss-on-done), build two small components, not one component with a mode flag. iOS-only (`InputAccessoryView` has no Android equivalent) is an accepted, pre-existing gap — matches the numeric bar's own platform limitation; Android falls back to OS-default dismiss (tap-away/back gesture).

---

## 6. Navigation & gestures

### 3-tab structure (PRD I §4.1)

**Home / Workout / Profile**, in that order (JSX order = display order = default/landing tab). `app/index.tsx`'s redirect target is `/home`. Home replaces History as a concept (a combined feed of past workouts) — "first tab" is read as also meaning "the app's default landing screen." Exercises is removed as a top-level tab entirely; general exercise browsing relocates to a repurposed Profile shortcut card (`/profile/exercises`), and the narrower archived-exercise management relocates into Settings' WORKOUTS section as a `ListRow`.

**Tab-shortcut-repurposing precedent:** when a shortcut card exists but points at a feature that reads as broken/empty to most users (Profile's old "Exercises" card → an always-empty archived-exercises screen), **repurpose the existing card to point at the feature that was actually wanted, rather than adding a second, parallel card.** Read the user's own phrasing carefully for which was meant ("the exercises button which already is there" = fix this one, don't add a new one).

### Slot-vs-Stack rule (PRD I §4.4 — also in §2 above)

Every tab segment layout must use `<Stack screenOptions={{headerShown:false, gestureEnabled:true}}>`, never `<Slot/>` — `Slot` provides route state (`push`/`back()` work) but never mounts a native-stack container, so no route nested under a `Slot`-based tab can have a back button or swipe-back gesture, structurally. This applies uniformly to all tab segments, including ones with no nested routes yet (e.g. `workout/_layout.tsx`) — zero risk (an empty `Stack` with one root screen behaves identically to the `Slot` it replaces) and keeps the segment ready for whenever it does grow nested routes.

### Swipe-back gesture rules (PRD I §4.4)

Two structurally different cases, resolved with concrete version-specific evidence from the installed `react-native-screens@~4.26.2`:

- **Pushed routes under a real `<Stack>` (tab sub-routes):** `gestureEnabled` **defaults to `true`** — horizontal edge-swipe-to-pop is a free byproduct of the Slot→Stack conversion itself; no extra prop is strictly required (though I sets it explicitly anyway, matching this codebase's habit of being explicit even about defaults).
- **The 6 root-level `fullScreenModal` routes** (`workout/active`, `routine/new`, `routine/[id]/edit`, `workout/[id]/edit`, `import/hevy`, `backup/restore`): `gestureEnabled` alone does **not** work here — `presentation:'fullScreenModal'` maps to `UIModalPresentationFullScreen` on iOS, which has no native interactive-pop transition to attach a horizontal swipe to. **The exception, explicit and deliberate:** these 6 routes instead get `swipeDirection: 'vertical'` (swipe **down** to dismiss), which `react-native-screens` itself bundles with `fullScreenSwipeEnabled:true` + `customAnimationOnSwipe:true` + `stackAnimation:'slide_from_bottom'` by default — exactly matching the entrance animation these 6 routes already use. Rationale for the vertical deviation, not a literal horizontal-left reading: (1) fighting the framework's own vertical/`slide_from_bottom` pairing would be gesture-direction-mismatched against the entrance animation; (2) it matches the platform-idiomatic convention (a sheet that slides up dismisses by swiping down, per Apple HIG); (3) the original user complaint about missing back-navigation was about ordinary pushed screens, not these 6 full-screen modals — a vertical swipe satisfies the same underlying intent ("let me swipe to dismiss, don't make me hunt for a button") without the mismatch.
- **Android:** both mechanisms above are iOS-only (`@platform ios` in `react-native-screens`' own type declarations). Android's back gesture/hardware back button wires up automatically through React Navigation once a route is hosted by a real `Stack` — restored by the Slot→Stack conversion alone, no extra prop needed.
- **Deferred, not solved here:** dynamically disabling the swipe mid-flow for the two multi-step routes (`import/hevy`, `backup/restore`) where an accidental swipe-dismiss during an active operation is a real risk. Flagged as a follow-up owned by whichever task owns those screens' internal state machines (I §9.10) — not blocking, since it needs screen-level `navigation.setOptions`, not a static route-level option.

### Nested-sheet policy

See §2 above (PRD A's decision matrix + PRD E's suspend/`useFocusEffect` conversion pattern) — repeated here because it's as much a navigation-structure rule as a panel-structure one. Short form: **a sheet that opens another sheet converts its child to a full-screen route (or inline content); a leaf sheet with nothing further inside it can stay a Sheet.** See §8 for two places this rule is not actually satisfied by the batch as planned.

### Route rename vs. feature-file rename — decoupling convention (PRD I §4.1, §9.2)

When a route's *user-facing* identity changes (History → Home) but the underlying feature is unchanged, rename only the route segment (`app/(tabs)/history/` → `app/(tabs)/home/`) — **do not** rename the feature components/directory backing it (`src/features/history/HistoryListScreen.tsx`, `HistoryWorkoutCard.tsx`, etc. keep their names). This codebase already treats route-file naming and feature/component naming as independent by convention (e.g. `app/(tabs)/workout/index.tsx` wires a component called `RoutinesHubScreen`, not `WorkoutScreen`) — a rename PRD should not force a mechanical, high-blast-radius rename ripple through every PRD that cites those feature files by path.

---

## 7. Animation conventions

### Entrance timing precedent

**250ms**, `withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })` on a `translateY` shared value. Established by `Sheet.tsx` (cited by PRD A), reused verbatim by PRD J for the redesigned rest-timer panel's entrance. This is the canonical slide-in timing/easing for any future overlay/panel entrance animation in this app — don't invent a new duration or curve without a specific reason.

### Key entrance effects off a changing id/token, not mount, for persistently-mounted components (PRD J §4.2.4 — important, easy to get wrong)

`Sheet.tsx`'s own entrance effect is `useEffect(() => {...}, [])` (empty deps) — correct *only* because every `Sheet` caller conditionally mounts/unmounts the `<Sheet>` element itself in JSX, so a fresh mount is a fresh entrance. **This breaks silently for any component that stays mounted across multiple "activations" of the same visual effect** — J's concrete case: `TimerPill` is rendered unconditionally by `ActiveWorkoutScreen` for the screen's entire lifetime; only its internal `if (!timer) return null` toggles visible presence. A naive copy of `Sheet.tsx`'s empty-deps pattern would only ever animate in once per session (the first rest timer), then silently stop "popping up" for every timer after that.

**The fix:** key the effect off a value that changes with each new logical activation, not `[]` — J uses `timerKey` (`timer?.setId ?? null`, already derived elsewhere in the file to detect "a genuinely new timer replaced the old one"):

```ts
useEffect(() => {
  if (!timer) return;
  translateY.value = PANEL_ENTER_OFFSET;
  translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
}, [timerKey]);
```

**General rule for future Reanimated entrance effects:** before copying `Sheet.tsx`'s `useEffect(() => {...}, [])` precedent, ask whether the component doing the animating is itself conditionally mounted/unmounted by its caller (→ empty deps is fine) or persistently mounted with only its *visual* presence toggled internally (→ key the effect off a changing id/token that represents "this is a new activation," or the animation silently fires once and never again).

### No-exit-animation-today precedent — flagged as a real gap, not papered over (PRD J §4.2.5)

**Every current overlay primitive in this codebase enters with an animation but exits with none** — `Sheet.tsx` slides in over 250ms but unmounts instantly on dismiss (`if (!visible) return null`); `Snackbar.tsx` has no animation in either direction. PRD J's rest-timer panel redesign deliberately follows this existing convention (entrance-only, instant dismiss) rather than building new "animate out, then unmount" machinery, reasoning that (a) no existing pattern in this codebase does this today, so it would be new infrastructure, not an established idiom, and (b) the Hevy reference screenshot this batch worked from is static and can't confirm exit behavior either way.

**This is named here explicitly as a known, unaddressed product gap** — every overlay in the app currently "pops in, cuts out." Whether that asymmetry is acceptable long-term is a real design decision nobody in this batch was positioned to make (no exit-animation precedent existed to extend, and building one from scratch was out of scope for each PRD's narrow mandate). A future PRD that wants symmetric enter/exit motion across `Sheet`, `Snackbar`, and any panel like `TimerPill`'s should treat it as one shared piece of new infrastructure (a delayed-unmount wrapper or equivalent), not a per-component patch.

---

## 8. Known inconsistencies / unresolved tensions between PRDs

These are real, load-bearing conflicts or gaps found by reading all 10 PRDs together. **Do not silently pick a side when implementing** — resolve deliberately, ideally before generating `dev-tasks` for the affected files, since several of these affect the same files from two different PRDs' diffs.

### 8.1 Sheet title size: PRD A demotes exactly the sheet PRD C cites as the reason to promote

- **PRD A** (`01-sheet-header-footer-foundation/PRD.md` §4.2, "Layout algorithm"): sets `SheetHeader`'s default title to `typography.headline` (17/semibold), and explicitly plans to **step down** `SaveWorkoutSheet.tsx` and `LogEntrySheet.tsx` from their current `typography.title2` (22/semibold) to `headline` once they adopt `SheetHeader` — "the two outliers... step down to `headline` for consistency."
- **PRD C** (`03-reorder-exercises-sheet-fixes/PRD.md` §4.3, §9): bumps `ReorderExercisesSheet.tsx`'s title **up** from `headline` to `title2`, citing `SaveWorkoutSheet.tsx`'s *current* `title2` styling as the precedent to match: "matches the existing precedent set by `SaveWorkoutSheet.tsx`... `ReorderExercisesSheet` was the inconsistent outlier at `headline`."

**The contradiction:** if both PRDs ship as specified, `SaveWorkoutSheet` ends up at `headline` (per A) while `ReorderExercisesSheet` ends up at `title2` (per C) — modeled after `SaveWorkoutSheet`'s *soon-to-be-reverted* styling. The two full-detent sibling sheets end up mismatched in exactly the way both PRDs independently said they were trying to eliminate. Whoever implements this must pick one canonical size for full-detent sheet titles (the batch's stated intent leans toward `headline` as the systemic default, per A's own `SheetHeader` primitive — but that requires re-deciding C's specific fix, not just merging both diffs) and apply it to both files identically, rather than landing both diffs as literally written.

### 8.2 PRD A plans to retrofit a file PRD F deletes

- **PRD A** (§6 retrofit table, row 23, `NoteEditSheet.tsx`): "Apply mechanical `SheetHeader`/`ScreenFooter` now; coordinate with PRD F... — F will further redesign this screen's content, but A's baseline wiring is **not wasted work** the way H's deletion makes `AddWarmUpSetsSheet`'s retrofit wasted (**F modifies, doesn't delete**)."
- **PRD F** (`06-notes-rest-timer-inline/PRD.md` §4.2): "`NoteEditSheet.tsx` becomes fully dead code — **delete it**... **Decision: delete `NoteEditSheet.tsx` and its test file entirely**."

**The contradiction:** A's own stated reason for doing the `NoteEditSheet` retrofit anyway (unlike the explicitly-excluded `AddWarmUpSetsSheet`, which A skips specifically because H deletes it) was the assumption that F modifies rather than deletes this file. That assumption is wrong — F's actual, final decision is exactly the same "PRD deletes this file" shape as H's `AddWarmUpSetsSheet`, which A already knows how to handle (exclude from the retrofit table). **Action for implementation:** treat `NoteEditSheet.tsx` exactly like `AddWarmUpSetsSheet.tsx` — exclude it from PRD A's retrofit table entirely; F's deletion should land without A's `SheetHeader`/`ScreenFooter` wiring ever being applied to a file that won't exist. (PRD A's row 25, `RestTimerSheet.tsx`, makes the same "coordinate with F" assumption, but is not actually contradicted — F's own non-goals explicitly leave `RestTimerSheet.tsx` untouched, so A's retrofit there is not wasted, just based on an incorrect prediction about *why* it wouldn't be wasted.)

### 8.3 `ReorderExercisesSheet` ends up with no dismiss control at all, violating PRD A's own corollary

- **PRD A** (§4.5 corollary): "Every `detent="full"` call site must have an explicit dismiss control." §6 row 28 explicitly flags `ReorderExercisesSheet.tsx` as missing one, but **defers adding it to PRD C** rather than adding it directly, "to avoid A and C making conflicting simultaneous edits to the same header row."
- **PRD C** (`03-reorder-exercises-sheet-fixes/PRD.md` §2 Goals, §3 Non-Goals, §4.5 full after-state): scope is title/button-width/bottom-gap only. C's own final render tree (§4.5) is `Sheet > View > Text(title) > ScrollView > Button(Save)` — **no Cancel/back/dismiss control anywhere.** C never mentions the missing-dismiss-control gap at all, in either its problem statement or its open questions.

**The gap:** PRD A explicitly hands this requirement to PRD C by name, and PRD C — authored independently, without ever having read PRD A's corollary (A didn't exist yet at C's authoring time either, per C's own dependency note) — never picks it up. After both land as specified, `ReorderExercisesSheet` is a `detent="full"` sheet with a now-functionally-invisible scrim and no header/footer dismiss button at all. **This needs an explicit fix at implementation time**, most likely adding a `SheetHeader` `left:{kind:'back'}` or `right:{kind:'label', label:'Cancel'}` slot to `ReorderExercisesSheet.tsx` alongside whichever title-size decision comes out of §8.1.

### 8.4 PRD D adds a new sheet-inside-a-sheet that PRD A's own policy would prohibit

PRD A's decision-matrix rule 1 (§2/§4.5 above) is unambiguous: a Sheet that itself opens another Sheet while open must convert the *child*, not leave it as a second independently-mounted `Sheet`. PRD A's own problem statement (§1.1) cites `ExercisePickerSheet` mounting `ExerciseDetailSheet` and two `FilterOptionSheet`s while itself open as the exact anti-pattern this rule exists to eliminate.

**PRD D** (`04-exercise-picker-settings-icon/PRD.md` §4.1), authored without PRD A available (confirmed in D's own header), adds a **third** such nested sheet: `ExercisePickerOptionsSheet`, a new `detent="half"` `Sheet` opened from inside `ExercisePickerSheet` (itself a `detent="full"` `Sheet`) via a gear icon. D's own justification is that this is "the same 'nested sheet opened from inside `ExercisePickerSheet`' shape already established twice in this file" — true, but that established shape is precisely what PRD A's rule 1 says must stop. Given `ExercisePickerOptionsSheet`'s content (two `ListRow`s, no independent navigation identity), it is a strong candidate for rule 1's "(b) inline conditional content within the same sheet body" resolution instead of a nested `Sheet` — i.e., render it as a conditionally-shown `View` inside `ExercisePickerSheet`'s own body rather than a second `Sheet`/`Modal`.

Separately: **PRD A defers `FilterOptionSheet`'s own nested-sheet fix to PRD E** (§3, §6 row 6: "OUT OF SCOPE — deferred to PRD E"), but **PRD E's actual scope never touches `FilterOptionSheet` at all** — E's architecture decisions (AD-1 through AD-10) address only the `ExerciseDetailSheet`/ⓘ-button conversion. `FilterOptionSheet` (equipment/muscle chip pickers, 2 instances) remains an unresolved nested-sheet-in-a-sheet after the entire batch, with no PRD actually assigned to fix it despite A explicitly naming E as the owner. Flag this as an open gap for a future PRD, not something either A or E actually closes.

### 8.5 Reconciliation debt: multiple PRDs hand-rolled what PRD A's primitives were meant to centralize

Because all 10 PRDs were authored in parallel by independent agents, and PRD A (the foundation the other 9 are supposed to build on) didn't exist on disk yet when B, C, D, E, F, G, H, I, and J were each written, **every one of B through J proceeded independently and, where relevant, hand-rolled a local equivalent of something PRD A was designed to centralize.** None of this is a logic error — each PRD explicitly flagged the gap and reasoned about it — but it means PRD A landing does not automatically converge the codebase; a deliberate sweep is needed. Concretely:

| What PRD A centralizes | Who hand-rolled it instead, and how | Citation |
|---|---|---|
| `useSafeAreaInsets()` bottom-padding via `ScreenFooter` | B: direct `insets.bottom + spacing['4']` on `ScrollView.contentContainerStyle`. C: direct `useSafeAreaInsets()` call + `marginBottom` on the Button (C's own text calls this "the first sheet-content component to call `useSafeAreaInsets()` directly"). J: direct `useSafeAreaInsets()` import in `TimerPill.tsx`. | B §4.1, C §4.1–4.2/§4.6, J §4.2.1 |
| Equal-width button row (`ButtonRow`) | B: hand-rolled `View{flexDirection:'row', gap}` + `style={{flex:1}}` on two `Button`s directly, explicitly declining to wait for A ("this PRD's footer-row fix is achieved entirely with existing `Button.tsx` API... no new shared primitive is required"). | B §4.2, §9 Q1 |
| Full-width solo button (`fullWidth` prop) | G: `RoutineCard`'s "Start Routine" button uses `size="md"` + manual `style={{alignSelf:'stretch'}}` rather than the new `fullWidth` escape hatch (G predates A and is explicitly independent of it). | G §4.1 |
| Header row / dismiss slot (`SheetHeader`) | D: hand-rolled `View + justifyContent:'space-between'` header row, flagged for future migration once `SheetHeader` exists (D §9.5). I: 6 new back buttons use the pre-`SheetHeader` hand-rolled `ChevronLeft`+`Pressable` convention, explicitly not `SheetHeader`'s `kind:'back'` slot, because `SheetHeader` isn't implemented in code yet (I §3, §9.14). | D §4.2, §9.5; I §4.5, §9.14 |
| Custom-fill button row (would need a `Button` color-override escape hatch A doesn't provide) | J: `RestTimerPanelControls` is hand-rolled `Pressable`s, explicitly because `Button.tsx`'s `primary` variant is hardwired to `accent.primary`/`accent.onAccent` with no override for `semantic.info`/`semantic.onInfo`. | J §4.2.3, §9.9 |

**Net effect:** once PRD A actually ships, a follow-up sweep should revisit B (footer row → `ButtonRow`?), C (insets call → `ScreenFooter`, if §8.1/§8.3 above are also being fixed in the same pass), D (header row → `SheetHeader`), G (`RoutineCard`'s stretch → `fullWidth`), I (6 back buttons → `SheetHeader`'s `kind:'back'`), and J (control row → `ButtonRow`, if/when `Button` grows a fill-color override) — each of these PRDs already flags itself as a migration candidate, so this is confirmation/aggregation of self-reported debt, not new discovery.

### 8.6 History screenshot doesn't actually depict what PRD G used it for

Noted for completeness, not a cross-PRD conflict: PRD G's own §4.0 documents that the Hevy screenshot its brief pointed at (`Img-5173-5174...png`) shows the *Workout tab* (routine list) and an *active workout logger*, not Hevy's History/past-workouts tab at all. G's `HistoryWorkoutCard` redesign is therefore derived from first principles (the user's stated goals + this codebase's own `ListRow`/`ExerciseRow` precedent), not from a literal visual reference — G states this explicitly rather than silently treating the screenshot as authoritative for a screen it doesn't show. Worth knowing if a future reviewer goes looking for the "reference image" for the History row redesign and can't find one that matches — there isn't one; it was never meant to exist.

---

## Appendix: quick-reference table of primitives introduced or extended this batch

| Primitive | File | Status | Introduced by |
|---|---|---|---|
| `SheetHeader` | `src/ui/SheetHeader.tsx` | New (unimplemented) | A |
| `ScreenFooter` | `src/ui/ScreenFooter.tsx` | New (unimplemented) | A |
| `ButtonRow` | `src/ui/ButtonRow.tsx` | New (unimplemented) | A |
| `Button.fullWidth` | `src/ui/Button.tsx` | New prop (unimplemented) | A |
| `KeyboardDoneBar` | `src/ui/KeyboardDoneBar.tsx` | New (unimplemented) | F |
| `InlineNoteField` | `src/features/workout/InlineNoteField.tsx` | New (unimplemented) | F |
| `ExercisePickerOptionsSheet` | `src/features/workout/ExercisePickerOptionsSheet.tsx` | New (unimplemented) — see §8.4 for a structural concern before building as-specified | D |
| `ExerciseSummaryTab` | `src/features/exercises/ExerciseSummaryTab.tsx` | New (unimplemented) | E |
| `HowToTab` | `src/features/exercises/HowToTab.tsx` | New, extracted from inline (unimplemented) | E |
| `RestTimerPanelControls` | `src/features/workout/TimerPill.tsx` (local, unexported) | New (unimplemented) | J |
| `semantic.onInfo` token | `src/ui/tokens.ts` | New field (unimplemented) | J |
| `NoteEditSheet` | `src/features/workout/NoteEditSheet.tsx` | Deleted (unimplemented) — see §8.2 | F |
| `AddWarmUpSetsSheet` + `domain/warmup-calc.ts` | `src/features/workout/AddWarmUpSetsSheet.tsx` | Deleted (unimplemented) | H |
| `ExerciseDetailSheet` | `src/features/workout/ExerciseDetailSheet.tsx` | Deleted (unimplemented) | E |
