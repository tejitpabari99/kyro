# PRD J — Active Workout Visual Parity (Set-Complete Color Verification + Rest-Timer Bottom-Panel Redesign)

Sub-project **J** of batch 2. Independent of batch 2's other PRD (**I**, `tabs-navigation-restructure`) and independent of batch 1's 8-PRD set (**A–H**, `docs/agent_files/tasks/2026-07-28/01…08`). Design only — no code changes were made while authoring this document; all findings below were confirmed by reading the actual source files, not assumed. House format matches PRD A (`01-sheet-header-footer-foundation/PRD.md`), read in full before writing this one.

---

## 1. Problem

The user filed two asks, verbatim: "Once I mark a set as done, it shouldnt turn red It should turn green," and "it should pop up the timer at the bottom, like this image" (a Hevy marketing screenshot, `log-and-track-workouts-featured-image.png`, referenced twice — one image, not two).

**Investigation found the two asks are not symmetric.** One is a real, unbuilt feature gap; the other does not describe this codebase's current behavior.

1. **Set-completion color.** Reading `src/ui/SetRow.tsx` and `src/ui/tokens.ts` directly (not from memory or the brief) confirms the completed-set row and checkmark already render in emerald green, not red, and have since the row/check UI first landed (`git log --oneline -- src/ui/SetRow.tsx src/ui/tokens.ts` shows no commit ever introduced a red completed-state — the earliest commit touching this code, `e8363ad` "design tokens, theme provider, WCAG contrast test," is where `colors.semantic.success` was defined as a direct alias of `colors.accent.primary` with the token file's own comment "no separate green," i.e. green has been the singular completion color by design from the start). `colors.semantic.danger` (genuinely red, `#EF4444`/`#DC2626`) exists in this codebase but is wired to three unrelated things, all confirmed by direct read: the swipe-to-delete panel behind a set row (`SetRow.tsx:328`), the Failure-set badge's letter "F" (`SetTypeBadge.tsx:69`, via `setTypeBadgeColors`), and `Button.tsx`'s `destructive` variant. None of these sit in the completed-check code path. `ConnectedSetRow.tsx` (the real feature-layer wiring, `grep`'d directly) passes `isCompleted={set.isCompleted}` straight through to `SetRow` with zero color logic of its own — there is no second, different completed-state code path anywhere that could independently be red. **This part of the brief is therefore a false premise as of the current source tree**, and is written up in §8 as a verification ask back to the user rather than a code-change task — see that section for what to actually check on-device.

2. **Rest timer.** `src/features/workout/TimerPill.tsx` is real and does what its name says: an inset (`left:16, right:16, bottom:16`), rounded, floating pill — a small 40pt `ProgressRing` + `mm:ss` text + an inline `−15s / Skip / +15s` row, all in one bar. This is structurally nothing like Hevy's reference: a full-width, edge-to-edge, no-margin fixed bottom panel with a thin *linear* countdown bar at its top edge, a large centered countdown number, and a 3-button row (`−15`, `+15`, `Skip`, with `Skip` alone styled as the primary/filled action). Separately, `TimerPill.tsx` has **no mount/unmount animation of any kind today** — it is a plain `View` gated by `if (!timer) return null`, with zero `Animated.View`/Reanimated usage anywhere in the file, so its current appearance is an instant hard cut, not a "pop up." This part of the brief is a real, unbuilt gap — full redesign scoped in §4.2.

## 2. Goals

- Confirm, on the record, that `SetRow`'s completed-state styling is already green end-to-end (row tint + checkmark fill), and give the user a concrete, on-device way to figure out what they were actually seeing that read as "red" — without touching code that isn't broken.
- Redesign `TimerPill.tsx`'s rendered panel to match Hevy's literal reference layout: full-width fixed bottom panel, top linear progress bar, large centered countdown, 3-button row with `Skip` as the sole primary-styled control.
- Make an explicit, reasoned call on whether the timer panel's progress bar / `Skip` button should use this app's existing green accent or a different color, given Hevy's reference uses blue and this app's `accent.primary` is green (the same green Part 1 confirms is the app's singular "success" color) — grounded in what `tokens.ts` actually contains, not assumption.
- Give the panel an entrance ("pop up") animation using this codebase's existing Reanimated idiom (`Sheet.tsx`'s 250ms `withTiming`/`Easing.out(Easing.quad)` precedent), and reason explicitly about the exit case too, rather than leaving it unaddressed.
- Resolve, not leave open, whether the new full-width panel needs to coexist with a bottom tab bar during rest.

## 3. Non-Goals

- **Any code change for Part 1.** There is nothing to fix — see §1 item 1. §8 asks the user to verify, not to accept a diff.
- **`SetTypeBadge.tsx`'s Failure-badge red "F."** Correct as-is, unrelated to set-completion.
- **The full-screen ring `Sheet`** that `TimerPill.tsx` opens when the panel/countdown is tapped (`SHEET_RING_SIZE`, 220pt ring, same `TimerControlsRow` reused inside it). Only the bottom panel itself is redesigned. Note: PRD A (`01-sheet-header-footer-foundation`, batch 1, also design-only/unimplemented as of this writing — confirmed by reading `Sheet.tsx`, whose `DETENT_HEIGHT_RATIO.full` is still `0.9`, not the `1.0` PRD A specifies) already separately scoped this same full-screen sheet for a `SheetHeader`/`ScreenFooter` retrofit (its retrofit table row 27). That is a different, already-owned piece of work; this PRD does not duplicate or block on it.
- **`GlobalWorkoutBar.tsx`** (the collapsed/minimized-logger mini countdown bar, rendered by `app/(tabs)/_layout.tsx`, mutually exclusive with `TimerPill` via `loggerVisibilityStore`). Scoped out: it's a materially different, simpler surface (plain text, no progress bar, no ±15/Skip controls, shown only when the full logger is minimized), the user's reference image only shows the full active-workout screen, and touching it would mean redesigning a second, unrelated component for a screen state nobody asked about. Left as future work if the user later asks for the minimized state too.
- **`restTimerStore.ts` / `useRestTimerTicker.ts` internals.** Both already expose exactly what the redesigned panel needs (`endsAt`, `adjust`, `skip`, a 250ms `now` ticker); no store-shape changes are needed or made.
- **Reordering or restyling `TimerControlsRow`** (the `−15s / Skip / +15s` row currently shared between the pill and the full-screen sheet). It stays exactly as-is for the sheet (out of scope per above); the new panel gets its own, differently-ordered/styled control row (§4.2.3) rather than mutating the shared one out from under the sheet.

## 4. Architecture Decisions

### 4.1 Part 1 — no architecture change; disposition is "verify," see §8.

### 4.2 Part 2 — rest-timer bottom panel redesign

**Scope decision (naming/footprint):** keep the file `src/features/workout/TimerPill.tsx` and the exported symbol `TimerPill` unchanged, and keep every existing `testID` suffix (`${testID}-ring`→removed, `${testID}-remaining`, `${testID}-minus15`, `${testID}-skip`, `${testID}-plus15`, `${testID}-open`, `${testID}-sheet*`, `${testID}-debug-notification-id`) that a consuming test can still meaningfully target. Only the internal render tree and styles change. Reasoning: `ActiveWorkoutScreen.tsx` imports `TimerPill` by that exact name at one call site (line 1270, `<TimerPill testID={`${testID}-timer-pill`} />`), `src/features/workout/__tests__/TimerPill.test.tsx` already has ~20 tests keyed off `TimerPill`/its testID prefix, and 08 §6 flow 7's Maestro flow (referenced in the file's own `__DEV__` debug-hook comment) reads `${testID}-debug-notification-id` by that literal string. A rename buys nothing functionally and forces a mechanical rename ripple across three files for no behavior change — deliberately not done. (`${testID}-ring` is dropped because the compact `ProgressRing` face is removed — see 4.2.1 — there is no ring anymore in the panel; the sheet's own ring, `${testID}-sheet-ring`, is untouched.)

#### 4.2.1 Layout — replacing `pillContainer`

Old (`TimerPill.tsx:384-393`):
```ts
pillContainer: {
  position: 'absolute', left: 16, right: 16, bottom: 16,
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  borderWidth: StyleSheet.hairlineWidth,
},
```

New, matching Hevy's structure top-to-bottom (§ from the research doc: thin top linear bar → big centered countdown → 3-button row):

```ts
panelContainer: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,             // edge-to-edge, no side/bottom margin — was left:16/right:16/bottom:16
  // no borderRadius anywhere (was implicitly square already, but now
  // explicit-by-omission is the point: this reads as a fixed panel, not a
  // floating card)
  borderTopWidth: StyleSheet.hairlineWidth,   // was borderWidth all-around
  // paddingBottom: insets.bottom (computed, not static — see below)
},
progressTrack: {
  height: 4,               // thin bar; 4pt matches this design system's
                            // only other "thin bar" precedent, Sheet.tsx's
                            // GRABBER_SIZE.height (also 4)
  width: '100%',
},
progressFill: {
  height: 4,
  // width: `${progress * 100}%` — computed per-render from the same
  // `progress` fraction TimerPill already derives today (unchanged math)
},
countdownArea: {
  alignItems: 'center',
  paddingVertical: spacing['4'],   // 16
},
controlsRow: {
  flexDirection: 'row',
  gap: spacing['3'],               // 12
  paddingHorizontal: spacing['4'], // 16
  paddingBottom: spacing['4'],     // 16, before insets.bottom is added
},
```

`panelContainer` needs `useSafeAreaInsets()` — **new import** (`react-native-safe-area-context`), not currently imported by `TimerPill.tsx`. `paddingBottom: insets.bottom` on the outer container (below the button row, above the physical edge) is the only inset applied; there is no top inset concern since the panel is bottom-anchored. This mirrors `Sheet.tsx`'s own precedent of a `src/ui/`-adjacent feature file reaching for `react-native-safe-area-context` directly (PRD A §4.1 already established this isn't a boundary violation — a neutral RN library, not a domain/store import).

**Background/separation:** `backgroundColor: colors.bg.surface` (matches every other elevated overlay surface in this app — `Sheet`, cards), `borderTopColor: colors.border.hairline` for the one-line separation from the scroll content above it (Hevy's own screenshot shows a plain white card with no visible border in a plain white app; this app is dark-first, so a hairline top border is the equivalent "this is a distinct surface" cue this design system already uses everywhere else instead of a shadow).

**Countdown text:** `typography.display` (34pt bold — the largest token in `typography.ts`), matching the size the full-screen sheet's own `${testID}-sheet-remaining` already uses today (`TimerPill.tsx:315`) — reused for consistency rather than inventing a new size, and it naturally reads as "the biggest text on screen" (Hevy's own description) since no bigger token exists in this design system.

**Compact `ProgressRing` face removed.** The old pill's 40pt ring (`PILL_RING_SIZE`) is dropped entirely — Hevy's panel has no ring, only the linear top bar. `ProgressRing`/`PILL_RING_SIZE`/`PILL_RING_STROKE` constants are deleted from this file; the full-screen sheet's own 220pt ring (`SHEET_RING_SIZE`/`SHEET_RING_STROKE`) is untouched (out of scope, §3).

#### 4.2.2 Color decision — blue progress bar / `Skip`, not green (resolved, with reasoning)

The user's reference image uses blue for the progress bar and `Skip`; this app's only accent color, `accent.primary`, is emerald green — and per Part 1's own finding, that green is deliberately the *sole* "success/completion" signal in this design system (`tokens.ts:134`: "`success` — Checked states, PR banner — equals `accent.primary` (no separate green)"). Reusing green for the timer as well would blur exactly the signal Part 1 confirms is working correctly today (a completed set turning green) with an unrelated "resting" state — a real design-system regression risk, not just a stylistic quibble.

**Investigated `tokens.ts` in full before deciding.** It already defines `colors.semantic.info` — dark `#3B82F6`, light `#2563EB` — genuinely blue, already present in both themes, already has a doc comment ("Drop-set badge `D` only") describing its current single use in `SetTypeBadge.tsx:69`/`tokens.ts:253`. This is not a color I'm inventing; it is an existing, themed, already-contrast-considered token that happens to be under-used (exactly one call site today).

**Resolved decision: reuse `colors.semantic.info` for the panel's top progress-bar fill and the `Skip` button's background.** Reasoning:
- It is a real blue that already exists in both themes — no new hex value, no new token needs inventing, keeping faith with `tokens.ts`'s own stated rule ("nothing here is invented" — every color traces to the design doc).
- It does not collide with `accent.primary`/green's meaning as the app's one success color (the concern above).
- It gives the timer surface a visually distinct identity from the checkmark/success color, matching Hevy's own two-accent scheme (blue = timer/action, green = completion) — while staying inside this app's existing vocabulary rather than growing it.
- The alternative (using `accent.primary` for the timer too, "simpler, more consistent with a single-accent system") was seriously considered and rejected: it was already effectively true today (`ProgressRing`'s `color` prop defaults to `colors.accent.primary`, and both pill and sheet ring currently render green) and is exactly what an on-device user could mistake for "everything is green, including the thing that's resting, not completing" — the ambiguity risk outweighs the minor simplicity gain of not touching a second token.

**New, additive token needed: text color for `Skip`'s filled background.** `Button.tsx`'s own `primary` variant (`Button.tsx:84-87`) pairs `accent.primary` fill with `accent.onAccent` text — but `accent.onAccent` is tuned specifically for the *green* fill (dark theme: `#04231A`, a dark green-tinted near-black — legible on `#10B981` but wrong, low-contrast, and the wrong hue-family on a `#3B82F6` blue fill; light theme's `accent.onAccent` is plain white, which happens to work on blue too, but the dark-theme value does not, so this token cannot be blindly reused for an `info`-filled control). Rather than hardcode an inline hex in the component (which would break `tokens.ts`'s explicit "every color is traceable to the token file, nothing invented in a component" convention — the same rule that makes `accent.onAccent` exist as a token in the first place instead of being hardcoded per `Button` variant), **add one new field: `ThemeColors.semantic.onInfo: string`, `'#FFFFFF'` in both dark and light theme** (mirrors the existing `accent.onAccent` shape/precedent, just for the `info` pairing instead of `accent`). White on `#3B82F6`/`#2563EB` is comfortably legible at any of this app's button-label sizes; §7 lists the one WCAG-suite assertion to add alongside it, following the same pattern the existing `tokens.test.ts` presumably already uses for `onAccent`/`accent.primary`.

`−15`/`+15` keep the existing gray/elevated treatment (`colors.bg.elevated` background, `colors.text.primary` text) — unchanged from today's `TimerControlsRow` styling, matching Hevy's "light gray, black text" description for those two buttons exactly as-is.

#### 4.2.3 New control-row component (not a `TimerControlsRow` edit)

Hevy's literal button order is **`−15`, `+15`, `Skip`** (gray, gray, filled-blue) — different from this app's current `TimerControlsRow` order, **`−15s`, `Skip`, `+15s`** (all three gray). Since `TimerControlsRow` is also reused, unchanged, inside the full-screen sheet (out of scope, §3), the fix is a **new** small component — `RestTimerPanelControls` (declared locally in `TimerPill.tsx`, not exported, same file-locality precedent as the existing `TimerControlsRow`) — with the Hevy order/styling, used only by the new bottom panel. `TimerControlsRow` itself is untouched, still used only by the `Sheet`.

```ts
interface RestTimerPanelControlsProps {
  testIDPrefix: string;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
}
```
Three `Pressable`s in `controlsRow` (4.2.1), each `flex: 1`, `minHeight: 48`, `borderRadius: radii.md` (12pt — the token `radii.ts`/`tokens.ts:382` explicitly documents for "Cards, buttons," and what `Button.tsx:134` itself already uses for non-`sm` sizes — not `radii.sm`, which `TimerControlsRow`'s existing gray buttons use today; the panel's buttons are meant to read as full/weighty footer-style buttons, matching Hevy's screenshot, not small inline chips). `−15`/`+15`: `colors.bg.elevated` fill, `colors.text.primary` text, `typography.footnote` weight 600 (unchanged copy/weight from today, just reflowed). `Skip`: `colors.semantic.info` fill, `colors.semantic.onInfo` text (4.2.2), same typography. `testID`s: `${testIDPrefix}-minus15`, `${testIDPrefix}-plus15`, `${testIDPrefix}-skip` — identical suffixes to today's `TimerControlsRow`, so `TimerPill.test.tsx`'s existing press-and-assert-dispatch tests (`-15s dispatches adjust(-15)`, `Skip dispatches skip()`, `+15s dispatches adjust(+15)`) need no testID changes, only re-verification that the same presses still fire the same handlers (they do — `handleAdjust`/`handleSkip` are untouched).

**Deliberately not adopting `src/ui/ButtonRow`/`Button`'s `fullWidth` prop** (PRD A, batch 1) for this row: PRD A is itself design-only/unimplemented as of this writing (confirmed, §3), and `ButtonRow` is built to wrap `<Button>` elements specifically, while the panel's buttons need custom fill colors (`semantic.info`) `Button.tsx`'s `variant` table doesn't have (its `primary` variant is hardwired to `accent.primary`/`accent.onAccent`, not swappable per §4.2.2's own finding). Hand-rolled `Pressable`s (this file's existing pattern already) stay the more direct fit; if PRD A's `ButtonRow` lands first and `Button.tsx` later grows a color-override escape hatch, revisiting this is a cheap future refactor, not a blocker now.

#### 4.2.4 Entrance ("pop up") animation

Precedent: `Sheet.tsx`'s own 250ms `withTiming(0, {duration: 250, easing: Easing.out(Easing.quad)})` on a `translateY` shared value (`Sheet.tsx:56-57, 81-89`). Reused directly — same duration constant, same easing curve, same `react-native-reanimated` primitives this codebase already uses everywhere else for exactly this kind of slide-in.

**Why this can't be a direct copy of `Sheet.tsx`'s `useEffect(() => {...}, [])` (empty deps):** `Sheet.tsx`'s comment claims the entrance effect "runs once per mount (component only mounts while visible)" — true only if callers conditionally render `<Sheet>` itself in JSX. `TimerPill` is different and confirmed by direct read: `ActiveWorkoutScreen.tsx:1270` renders `<TimerPill testID={...} />` **unconditionally** — the component instance (and all its hooks, including any `useSharedValue`) persists for the entire lifetime of the active-workout screen; only `TimerPill`'s own internal `if (!timer) return null` (line 214-216) toggles visual presence. An empty-deps entrance effect would therefore only ever fire once — the very first timer of the session — and silently stop "popping up" for every timer after that, which is the opposite of what's being asked (every set-completion should pop the panel up).

**Resolved fix:** key the entrance effect off `timerKey` (`timer ? timer.setId : null`, the same value `TimerPill.tsx:178` already derives and already uses to detect "a genuinely new timer instance replaced the old one," §4.2.5) instead of `[]`:
```ts
const translateY = useSharedValue(PANEL_ENTER_OFFSET);
useEffect(() => {
  if (!timer) {
    return;
  }
  translateY.value = PANEL_ENTER_OFFSET;
  translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
}, [timerKey]);
```
This is a genuine side effect (kicking off an animation), not a React `setState` call, so it does not trip this repo's `react-hooks/set-state-in-effect` rule (that rule is about React's own state, not Reanimated shared-value writes — same distinction `TimerPill.tsx`'s own file header already draws between its render-time `totalMs`/`sheetVisible` reset and its effect-based completion-detection logic). `PANEL_ENTER_OFFSET` is a fixed constant (`220`), deliberately larger than the panel's realistic max rendered height (~4pt bar + ~16pt pad + ~40pt countdown line + ~16pt pad + 48pt button row + ~16pt pad + up to ~34pt safe-area bottom ≈ 174pt, so 220 gives comfortable headroom) rather than a measured `onLayout` value — simpler, no extra measure-then-animate frame, and since the panel is always `position:'absolute', left:0, right:0` with a fixed off-screen start, an oversized offset is visually indistinguishable from a precisely-measured one (both start fully below the visible screen either way).

#### 4.2.5 Exit animation — resolved: none, matches existing codebase convention

Considered adding a symmetric slide-down-then-unmount. **Decided against it.** Every existing overlay primitive in this codebase that has an entrance animation — `Sheet.tsx` (250ms `translateY` in) and `Snackbar.tsx` (no animation at all, just conditional mount) — has **no** exit animation on its actual dismiss path; both just instantly unmount (`if (!visible) return null`) the moment their controlling boolean flips. (`Sheet.tsx`'s drag-gesture *does* animate `translateY` back to `sheetHeight` before calling `onDismiss` on a failed/threshold drag, but that's a snap-back-then-dismiss for an in-progress gesture, not a general "exit transition" pattern reusable here — `TimerPill`'s dismissal path, whether by `skip()`, natural completion, or the rest-suppression rules in `restTimerStore.ts`, is never gesture-driven.) Building a genuinely new "animate out, *then* unmount" pattern (a delayed-unmount local-state wrapper) would be new machinery this codebase doesn't have anywhere else, for a detail the reference marketing screenshot cannot even confirm either way (the research doc is explicit: "Animation/entry motion: NOT verifiable from a static image — can't confirm 'pops up' motion, only the settled/resting composition"). The panel disappears exactly as instantly as today's pill already does on `skip()`/natural completion — no regression, only the entrance is new.

#### 4.2.6 Tab bar interaction — resolved, not actually a conflict

Confirmed by reading `app/_layout.tsx:386-387` and `app/workout/active.tsx`: the route `workout/active` (which hosts `ActiveWorkoutScreen`, which renders `TimerPill`) is registered with `presentation: 'fullScreenModal', animation: 'slide_from_bottom'` — it is presented as a full-screen modal *above* the entire `(tabs)` navigator stack, not as a screen hosted inside it. Confirmed further by reading `GlobalWorkoutBar.tsx` (the one component that renders a bottom tab bar-adjacent overlay): it is mounted by `app/(tabs)/_layout.tsx`, a completely separate layout tree from `workout/active`, and is gated on `!loggerVisible` — `loggerVisibilityStore`'s flag that is `true` for exactly the duration `ActiveWorkoutScreen` (and therefore `TimerPill`) is mounted. **There is no tab bar rendered underneath the active-workout screen at any point** — the "does the panel overlay or replace the tab bar" question the research doc flagged as open does not actually arise in this app's navigation structure; it's a non-issue specific to Hevy's own (unknown-to-us) navigation shape, not something this app needs to solve.

#### 4.2.7 Interaction with the fixed footer (Add Exercise / Settings / Discard)

`ActiveWorkoutScreen.tsx`'s own layout (confirmed by reading `styles.container: {flex:1}`, `styles.body: {flex:1}` on the `ScrollView`, `styles.footer: {}` with no absolute positioning) places the exercise list in a `flex:1` `ScrollView` and the `+ Add Exercise / Settings / Discard Workout` button stack as a plain, non-scrolling flex sibling immediately after it — a fixed footer, not part of the scrollable content. `TimerPill` (both old and new) is `position: 'absolute'`, painted after the footer in JSX, so it already floats over that footer region today; the new panel, being full-width and taller (~150-175pt vs. the old pill's compact ~60pt), will cover **all three** footer buttons while a rest timer is active, not just partially overlap one of them as the old inset pill did. **Resolved as acceptable, not a regression to fix here:** this matches Hevy's own real behavior (its rest-timer panel visibly takes over the bottom of the screen for the whole rest period); the footer's three actions remain reachable the instant the timer is skipped or finishes (identical recovery path to today), and restructuring the footer to live inside the scrollable body (so it could stay reachable during rest, the way Hevy's own per-exercise "+ Add Set" button does by living inside its scrollable list) is a materially different layout change to a screen this PRD does not otherwise touch — out of scope, flagged here rather than silently absorbed.

#### 4.2.8 Tap-to-open the full-screen sheet — preserved, relocated trigger

Today, tapping the ring+text area (`pillTapArea`) opens the full-screen `Sheet`. The ring is gone (4.2.1), so the tap target moves to the `countdownArea` (thin bar + big countdown text region) — wrapped in the same `Pressable` (`accessibilityLabel="Rest timer, {remaining} remaining. Tap for details."`, `testID: ${testID}-open`, unchanged), excluding the button row (which needs its own three independent press targets). Behavior/wiring (`setSheetVisible(true)`, the `Sheet` itself, its ring, its own `TimerControlsRow`) is completely unchanged — out of scope per §3.

## 5. API Change Summary

| File | Change | Breaking? |
|---|---|---|
| `src/ui/tokens.ts` | New field `ThemeColors.semantic.onInfo: string` — `'#FFFFFF'` in both `darkColors`/`lightColors` (§4.2.2) | Non-breaking, additive |
| `src/features/workout/TimerPill.tsx` | Full internal redesign of the exported `TimerPill` component's render tree/styles (§4.2.1–4.2.8); new local `RestTimerPanelControls` component; new `react-native-safe-area-context` import (`useSafeAreaInsets`); `ProgressRing`/`PILL_RING_SIZE`/`PILL_RING_STROKE` no longer used by the pill face (sheet's own ring usage untouched); `Easing`/`useSharedValue`/`useAnimatedStyle`/`withTiming` newly imported from `react-native-reanimated`. Exported symbol name, file path, and every retained `testID` suffix unchanged (§4.2, scope decision). | Non-breaking for consumers (same export, same props); visually a full redesign — intended |

No backend/data-layer/store API surface touched — `restTimerStore.ts` and `useRestTimerTicker.ts` are consumed exactly as they are today (`timer`, `adjust`, `skip`, `complete`, the 250ms ticker).

## 6. Frontend Change Summary

- **Part 1:** no frontend change. See §8.
- **Part 2 — `src/features/workout/TimerPill.tsx`:**
  - Remove `pillContainer`/`pillTapArea` styles and the compact `ProgressRing` render; add `panelContainer`/`progressTrack`/`progressFill`/`countdownArea`/`controlsRow` styles per §4.2.1.
  - Add `useSafeAreaInsets()` and apply `insets.bottom` as the panel's outer bottom padding.
  - Add the entrance-animation `useSharedValue`/`useEffect` keyed on `timerKey` per §4.2.4; no exit animation (§4.2.5).
  - Add the new local `RestTimerPanelControls` component (§4.2.3) — `−15`/`+15`/`Skip` in that literal order, `Skip` alone filled with `colors.semantic.info`/`colors.semantic.onInfo`.
  - Keep `TimerControlsRow`, the full-screen `Sheet`, its `ProgressRing`, and all `${testID}-sheet*` nodes completely unchanged.
  - Keep the `__DEV__`-only `${testID}-debug-notification-id` text node, relocated into the new panel's content (e.g., a small caption under the button row), same testID, same gating.
- **`src/ui/tokens.ts`:** add `semantic.onInfo` to both theme color objects per §5.

## 7. Testing

- **Part 1:** no new production test strictly required (nothing is being fixed). Optional, low-risk regression guard, left to the implementer's judgment rather than mandated: extend `src/ui/__tests__/SetRow.test.tsx` (already exists, read the file before adding) with one assertion pinning `isCompleted` → row background `colors.bg.accentSubtle` and check-cell background `colors.accent.primary` — a cheap tripwire against this ever silently regressing to `semantic.danger` or any other token in the future. Explicitly not required for this PRD to be considered done, since there is no bug to close out.
- **Part 2 — `src/features/workout/__tests__/TimerPill.test.tsx`** (existing, ~20 tests, read in full before editing): the dispatch-and-haptic tests (`-15s dispatches adjust(-15)`, `Skip dispatches skip()`, `+15s dispatches adjust(+15)`, tap-opens-sheet, sheet-controls-dispatch-same-action, natural-completion, dedup-completion, fresh-timer-fresh-ring, debug-notification-id `__DEV__` gating) all target the retained `testID` suffixes (§4.2, §4.2.3) and store-level behavior, none of which changes — these should keep passing largely unmodified, but must be re-run/re-verified against the new render tree since `${testID}-ring` (the removed compact ring) is referenced nowhere in the current test file's `it` names shown, so no expected removal there; confirm no test asserts on the old `pillContainer`/`pillTapArea` style keys directly (unlikely, but check before assuming a clean pass).
- **New assertions to add** to the same file: (a) panel container has `left:0, right:0, bottom:0` (edge-to-edge) and `paddingBottom` includes a non-zero `insets.bottom` when overridden via the existing `jest/safe-area-context-mock.tsx` pattern (PRD A §7 already establishes this exact mock-override technique — reuse it); (b) `RestTimerPanelControls`' rendered DOM/press order is `-15`, `+15`, `Skip` (not the old `-15`, `Skip`, `+15`); (c) `Skip`'s rendered background resolves to `colors.semantic.info` and its text color to `colors.semantic.onInfo`, for both themes (mirrors how `Button.test.tsx` presumably already asserts variant colors — read that file's convention before writing this one); (d) a **new** test: starting a second timer (different `setId`) while the panel is already visible re-triggers the entrance animation (`translateY.value` reset to `PANEL_ENTER_OFFSET` then animated back to `0`) — this is the one behavioral case §4.2.4 exists specifically to get right, so it should be asserted, not just implemented and trusted.
- **`src/ui/__tests__/tokens.test.ts`** (existing WCAG contrast suite, read in full before editing): add one contrast-ratio case for the new `semantic.onInfo` vs. `semantic.info` pairing, in both themes, following whatever pattern the file already uses for `accent.onAccent` vs. `accent.primary` (same file, same suite, same reason to exist — a token this PRD adds should be held to the same contrast bar the rest of the file already enforces).

## 8. Manual Intervention Required From You

**Part 1 — please verify on a real device/build, this PRD did not change any code for it.** Reading `src/ui/SetRow.tsx` and `src/ui/tokens.ts` directly shows the completed-set row background and checkmark fill are already emerald green (`colors.accent.primary`/`colors.bg.accentSubtle`), and `git log` shows no commit ever made this red. Three concrete things worth checking, in likely order of probability:
1. **The Failure-set badge's letter "F".** It renders in genuine red (`colors.semantic.danger`) inside the same row's leftmost "SET" cell, right next to the checkmark — if you were logging a failure set and glanced at the row as a whole, the red "F" badge plus a green checkmark a few inches away could easily read as "the row turned red" at a glance.
2. **The swipe-to-delete panel.** Swiping a set row left briefly reveals a red (`colors.semantic.danger`) panel with a trash icon behind it, mid-gesture — if a swipe was in progress (even accidentally, e.g. a slightly diagonal tap) at the same moment a set was checked, that red panel could be what was seen.
3. **A stale build.** If you're testing against an older installed build/TestFlight version that predates whenever the green tokens/checkmark styling last shipped (the git log shows this has been green since the very first commit that added the row/check UI at all, so this would have to be an unusually old build), a fresh rebuild/reinstall should resolve it on its own with zero code change needed.

If none of these three explain what you saw, please send a screenshot or screen recording of the actual red you're seeing — that's the fastest way to find a real, different bug if one exists, rather than this PRD guessing further.

**Part 2:** no manual intervention needed to implement the redesign as specified. One cosmetic judgment call worth a quick glance once built (not a blocker): the panel now visibly covers the `Add Exercise`/`Settings`/`Discard Workout` footer while resting (§4.2.7) — confirm that reads as acceptable in practice, not just on paper.

## 9. Open Questions & Decisions

1. **Is there actually a red-to-green bug to fix?** [RESOLVED: no — confirmed by direct read of `SetRow.tsx`/`tokens.ts`/`ConnectedSetRow.tsx` and `git log`. Written up as a verification ask, §8, not a code task.]
2. **Should the timer panel's progress bar/`Skip` reuse `accent.primary` (green) for single-accent consistency, or a distinct blue?** [RESOLVED: distinct blue, via the existing `colors.semantic.info` token (already present, already themed, currently only used by the drop-set badge letter) — reusing green would blur the exact "green = completion" signal Part 1 confirms is already correct, and `semantic.info` requires zero new hex values. See §4.2.2.]
3. **Does the blue `Skip` fill need a new text-color token, or can `accent.onAccent` be reused?** [RESOLVED: new token, `semantic.onInfo` (`#FFFFFF` both themes) — `accent.onAccent`'s dark-theme value (`#04231A`) is tuned for the green fill specifically and is the wrong hue/too-low-contrast on a blue fill; a new, minimal, additive token is more correct than either a wrong-looking reuse or a components-layer hardcoded hex (which would violate `tokens.ts`'s own "nothing invented outside this file" convention). See §4.2.2, §5.]
4. **Does the new panel need a genuine slide-down exit animation to match a symmetric "pop up / pop down"?** [RESOLVED: no — no existing overlay primitive in this codebase (`Sheet`, `Snackbar`) animates its actual dismiss path either; building new animate-then-unmount machinery for a detail the reference screenshot can't even confirm is unjustified scope growth. Entrance-only, instant dismiss, matching existing local convention. See §4.2.5.]
5. **Does the entrance animation need to replay for every new timer, or just the first one of the session?** [RESOLVED: every new timer — this is the one place a naive copy of `Sheet.tsx`'s `useEffect(() => {...}, [])` precedent would have silently broken the actual ask (since `TimerPill` never remounts across a session, unlike how `Sheet.tsx`'s own comment assumes its callers behave). Keyed on `timerKey` instead. See §4.2.4.]
6. **Does the new full-width panel conflict with a bottom tab bar during rest?** [RESOLVED: no conflict exists — `workout/active` is a `fullScreenModal` presented above the entire tabs navigator, and `GlobalWorkoutBar` (the one tab-bar-adjacent overlay) is unmounted for the entire time `TimerPill` is mounted. Confirmed by reading `app/_layout.tsx`, `app/workout/active.tsx`, and `GlobalWorkoutBar.tsx` directly. See §4.2.6.]
7. **Should `GlobalWorkoutBar` get the same visual treatment for consistency?** [DEFERRED: out of scope for this PRD — materially different surface/content, and the user's reference image only shows the full active-workout screen. Revisit only if explicitly requested. See §3.]
8. **Does the redesigned panel permanently hide the footer's Add Exercise/Settings/Discard buttons while resting, and is that acceptable?** [RESOLVED: yes, it covers them (was already true, just partially, with today's smaller pill), and yes it's acceptable — matches Hevy's own real behavior, and full recovery happens the instant the timer ends/is skipped. Restructuring the footer to live inside the scrollable body so it stays reachable during rest is a separate, larger layout change not requested and not undertaken here. See §4.2.7.]
9. **Should the new 3-button row adopt PRD A's (batch 1) `ButtonRow`/`Button` `fullWidth` primitives instead of hand-rolled `Pressable`s?** [RESOLVED: no, not yet — PRD A is itself unimplemented as of this writing (verified: `Sheet.tsx`'s `DETENT_HEIGHT_RATIO.full` is still `0.9`, not PRD A's specified `1.0`), and `Button.tsx`'s `primary` variant is hardwired to `accent.primary`/`accent.onAccent` with no color-override escape hatch today, which the `Skip` button needs (`semantic.info`/`semantic.onInfo`). Hand-rolled, matching this file's own existing `TimerControlsRow` pattern. Revisit as a cheap follow-up refactor if/when both land. See §4.2.3.]
10. **Rename `TimerPill` to something that reflects it's no longer pill-shaped?** [RESOLVED: no — kept as-is to avoid an unnecessary rename ripple across `ActiveWorkoutScreen.tsx`'s one import/call site, `TimerPill.test.tsx`'s ~20 tests, and the `__DEV__` Maestro-flow testID reference, none of which need to change for this redesign to ship. See §4.2 scope decision.]
