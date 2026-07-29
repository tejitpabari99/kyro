# PRD B: Active Workout Footer Buttons

Sub-project **B** of the 8-part Hevy-style UI/UX overhaul decomposition. Depends on **A** (`sheet-header-footer-foundation`) for context only — see §9 for why this PRD does not actually block on A landing first.

- Target file: `/root/projects/kyro/src/features/workout/ActiveWorkoutScreen.tsx`
- Route: `app/workout/active.tsx` (`fullScreenModal`)
- Out of scope: `EditWorkoutScreen.tsx`, `src/ui/Button.tsx` (confirmed not modified — see §4.2), any workout-settings screen build-out (M2-17)

---

## 1. Problem

`ActiveWorkoutScreen`'s footer (lines ~1159–1182) stacks three buttons vertically in a single-column `View`:

```tsx
<View style={[styles.footer, { padding: spacing['4'], gap: spacing['2'] }]}>
  <Button label="+ Add Exercise" variant="primary" size="lg" .../>   {/* 50pt tall, full-width */}
  <Button label="Settings" variant="tonal" size="md" .../>            {/* 40pt tall, hug-content */}
  <Button label="Discard Workout" variant="destructive" size="md" .../> {/* 40pt tall, hug-content */}
</View>
```

Two concrete defects, both confirmed by reading the current source:

1. **Settings and Discard Workout are not side by side and not equal-sized.** There is no `flexDirection: 'row'` anywhere in this `View`, so all three buttons stack vertically. Both `md`-size buttons hug their own label width (`Button.tsx`'s `alignSelf: size === 'lg' ? 'stretch' : 'flex-start'`), so "Settings" renders narrow and "Discard Workout" renders wide — neither matches the other, and neither matches "+ Add Exercise" above them.
2. **The footer has no safe-area-aware bottom gap, and is unconditionally pinned to the screen's bottom edge.** The footer `View` is a sibling rendered immediately after the body `ScrollView`, which has `style={{flex: 1}}` — in a flex column, a `flex: 1` sibling always consumes exactly the remaining vertical space, which pins whatever follows it (the footer) to the true bottom of the screen regardless of how much content is above it. Its own padding is a flat `spacing['4']` (16pt) with no `insets.bottom` term, unlike this same file's own header (`paddingTop: insets.top + spacing['3']`, line ~1010) or the established codebase idiom (`insets.bottom + spacing['4']`, used identically in `MeasuresHomeScreen.tsx:191`, `PhotoPagerScreen.tsx:286`, `PhotoGalleryScreen.tsx:338`) — so on a home-indicator device the buttons sit uncomfortably close to the indicator, and on a workout with few/no exercises there's a large dead gap between the last card and the footer instead of the footer sitting naturally below the content.

## 2. Goals

- G1: "Settings" and "Discard Workout" render side by side, in one row, each exactly half the row's width (equal-sized), same height.
- G2: "+ Add Exercise" stays a full-width `primary`/`lg` button on its own row above the Settings/Discard row (unchanged visually).
- G3: The footer has a "decent" gap from the physical bottom of the screen (safe-area aware), matching this file's own header precedent and the codebase-wide `insets.bottom + spacing['4']` idiom.
- G4: The footer is not artificially pinned to the screen's bottom edge when the workout has few/no exercises — it sits just below the last exercise card (or below the meta row, if the workout is empty) rather than leaving a large dead gap.
- G5: Variant colors are preserved exactly: Settings stays `tonal` (accent-tinted), Discard stays `destructive` (danger text).

## 3. Non-Goals

- NG1: Building a real Workout Settings screen. `handleSettingsPress` stays the existing `Alert.alert('Workout Settings', 'Workout settings arrive in M2-17.')` stub, byte-for-byte unchanged. M2-17 is a separate, already-deferred milestone.
- NG2: Changing Discard's confirmation-alert UX (`handleDiscardPress` → `Alert.alert` → `performDiscard` → `useActiveWorkoutStore.getState().discard()` → cancel rest timer → `router.back()`). That flow is correct today and untouched.
- NG3: `EditWorkoutScreen.tsx`. Confirmed (grep) it has only a single `+ Add Exercise` footer button, no Settings/Discard pair — there is nothing to make "side by side," so this PRD's scope is `ActiveWorkoutScreen` only.
- NG4: Modifying `src/ui/Button.tsx`. See §4.2 for why this is achievable with zero changes to the shared component.
- NG5: Making the footer a truly sticky/pinned overlay (e.g. `position: 'absolute'`). The explicit ask is the opposite — non-sticky, content-following.

## 4. Architecture Decisions

### 4.1 `ActiveWorkoutScreen.tsx` — footer moves inside the body `ScrollView`'s content, as its last child

**Decision:** Delete the footer `View` as a sibling rendered after `</ScrollView>`. Instead, append it as the last item inside `ScrollView`'s content, immediately after `{workout.exercises.map(...)}`.

**Why (rejected alternative considered):** The other way to satisfy G4 without moving the footer into scroll content is a `flexShrink: 1` hybrid — give the `ScrollView`'s outer `style` `flexShrink: 1` instead of `flex: 1` inside a `flex: 1` parent, so it naturally clamps to available space when content overflows but shrinks to content height when short, with the footer as a still-pinned sibling below it. This was rejected: React Native's Yoga layout engine defaults every node to `flexShrink: 0` (unlike web CSS's `flex-shrink: 1` default), so this pattern is less road-tested in this codebase (no existing precedent for it anywhere in `src/`) and riskier to get right without a way to visually verify it in this planning-only pass. Moving the footer into the scroll content is the standard, already-idiomatic React Native pattern for "trailing action row that should sit right below list content, not float independently," has a direct precedent in how the reference app (Hevy) itself places its own "+ Add Exercise" affordance as part of the scrollable list rather than a floating pinned button, and — critically — is verified safe against the existing test suite: `ActiveWorkoutScreen.test.tsx` finds these buttons via `screen.getByTestId('screen-add-exercise' | 'screen-settings' | 'screen-discard')`, and React Native Testing Library's `getByTestId` walks the full render tree regardless of `ScrollView` scroll position (this is a plain `ScrollView`, not a `FlatList`, so it never virtualizes children) — none of the existing 6+ tests that reference these three testIDs need to change.

**Before** (lines ~1088–1143, `ScrollView`, and ~1159–1182, footer, today two separate blocks with a **sibling** relationship):

```tsx
<ScrollView
  testID={`${testID}-body`}
  ref={scrollViewRef}
  style={styles.body}
  contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}
  keyboardShouldPersistTaps="handled"
>
  {workout.exercises.map((workoutExercise) => {
    /* ...unchanged card rendering... */
  })}
</ScrollView>

{/* Remove-exercise Snackbars */}
{Object.entries(pendingRemovals).map(/* ... */)}

{/* Footer — + Add Exercise (primary), Settings (tonal, stub for M2-17), Discard Workout (destructive, confirm) (02 §2). */}
<View style={[styles.footer, { padding: spacing['4'], gap: spacing['2'] }]}>
  <Button
    testID={`${testID}-add-exercise`}
    label="+ Add Exercise"
    variant="primary"
    size="lg"
    onPress={handleAddExercisePress}
  />
  <Button
    testID={`${testID}-settings`}
    label="Settings"
    variant="tonal"
    size="md"
    onPress={handleSettingsPress}
  />
  <Button
    testID={`${testID}-discard`}
    label="Discard Workout"
    variant="destructive"
    size="md"
    onPress={handleDiscardPress}
  />
</View>
```

**After:**

```tsx
<ScrollView
  testID={`${testID}-body`}
  ref={scrollViewRef}
  style={styles.body}
  contentContainerStyle={{
    padding: spacing['4'],
    // G3: safe-area-aware bottom gap — same `insets.bottom + spacing[n]`
    // idiom this file's own header already uses (`paddingTop: insets.top +
    // spacing['3']`) and that MeasuresHomeScreen/PhotoPagerScreen/
    // PhotoGalleryScreen all use identically for a bottom-anchored element.
    paddingBottom: insets.bottom + spacing['4'],
    gap: spacing['4'],
  }}
  keyboardShouldPersistTaps="handled"
>
  {workout.exercises.map((workoutExercise) => {
    /* ...unchanged card rendering... */
  })}

  {/* Footer — + Add Exercise (primary, full-width), Settings/Discard Workout
      (tonal/destructive, equal-width side-by-side row) (02 §2, revised —
      sub-project B). Lives inside the scroll content, not a pinned sibling
      after the ScrollView: on a short/empty workout it sits right below the
      last card (or right below the meta row, if there are zero exercises)
      instead of being glued to the screen's bottom edge with a large empty
      gap (G4); on a long workout it's reached by scrolling with everything
      else, matching the reference app's own placement of this affordance. */}
  <View style={[styles.footer, { gap: spacing['2'] }]} testID={`${testID}-footer`}>
    <Button
      testID={`${testID}-add-exercise`}
      label="+ Add Exercise"
      variant="primary"
      size="lg"
      onPress={handleAddExercisePress}
    />
    <View style={{ flexDirection: 'row', gap: spacing['2'] }}>
      <Button
        testID={`${testID}-settings`}
        label="Settings"
        variant="tonal"
        size="md"
        onPress={handleSettingsPress}
        style={{ flex: 1 }}
      />
      <Button
        testID={`${testID}-discard`}
        label="Discard Workout"
        variant="destructive"
        size="md"
        onPress={handleDiscardPress}
        style={{ flex: 1 }}
      />
    </View>
  </View>
</ScrollView>

{/* Remove-exercise Snackbars */}
{Object.entries(pendingRemovals).map(/* ... */)}
```

Notes on the diff:
- The footer's own `padding: spacing['4']` is dropped (was `padding: spacing['4'], gap: spacing['2']`, now just `gap: spacing['2']`) — horizontal/top padding is already supplied by the `ScrollView`'s `contentContainerStyle.padding`, and duplicating it would over-pad the footer relative to the exercise cards above it, which only get the shared `contentContainerStyle` padding.
- `contentContainerStyle`'s existing `gap: spacing['4']` (unchanged value) now also applies between the last exercise card and the footer block, and — because RN's `gap` only inserts space *between* siblings, never before the first or after the last — correctly produces zero artificial leading gap when `workout.exercises` is empty (G4's "zero exercises" case falls out for free, no special-casing needed).
- The `Object.entries(pendingRemovals).map(...)` Snackbar block, `DurationEditSheet`, `SaveWorkoutSheet`, and every sheet/overlay below stay exactly where they are today, as siblings of the `ScrollView` — only the footer `View` itself relocates.
- New `testID={`${testID}-footer`}` on the wrapping `View` is additive (not currently tested, but harmless and gives task-generation a stable hook if a "footer is inside body, buttons share a row" assertion is added later — see §7).

### 4.2 `src/ui/Button.tsx` — not modified

**Decision:** Ship this with zero changes to `Button.tsx`. Each of the two `md`-size buttons in the new row gets `style={{ flex: 1 }}` passed directly as its existing `style` prop.

**Why this already works, confirmed by reading `Button.tsx` line by line:**
- The `Pressable`'s `style` function returns `[styles.base, { height, paddingHorizontal, borderRadius, backgroundColor, alignSelf: size === 'lg' ? 'stretch' : 'flex-start', opacity }, style]` — RN/StyleSheet array flattening applies later entries on top of earlier ones **per property**, so the caller-supplied `style` prop (last in the array) can add `flex: 1` without needing to override anything already set (`alignSelf`, `height`, etc. are untouched, since the caller's object only sets `flex`).
- `alignSelf: 'flex-start'` (the `md`/`sm` branch) governs the **cross-axis** (vertical, inside a `flexDirection: 'row'` parent) — irrelevant here because `Button` also sets an explicit `height` in that same style object, which already fully determines the vertical size regardless of `alignSelf`.
- `flex: 1` governs the **main axis** (horizontal, inside a `flexDirection: 'row'` parent) — with no competing `width`/`flexBasis` set anywhere in `Button.tsx`, two sibling `Button`s each given `flex: 1` inside a `flexDirection: 'row'` wrapper split that row's width exactly evenly. This directly satisfies "equal sized" (G1) independent of each label's character count ("Settings" vs. "Discard Workout").
- Both buttons already use `size="md"` (40pt, `SIZE_HEIGHT.md`), so height parity (G1) requires no change at all — it was already true before this PRD, only the missing `flexDirection: 'row'` prevented it from being visible.

This was a deliberate call not to add a `fullWidth`/`equalFlex` prop to `Button.tsx` even though the task brief allowed it ("your call... since this is a small enough change it doesn't strictly need to wait on PRD A"): the existing `style` prop escape hatch already produces the exact required layout with no new API surface, so adding one would be pure surface area with no behavioral benefit. See §9 for how this reconciles with whatever PRD A eventually ships.

## 5. API Change Summary

None. No exported type, prop, or function signature changes anywhere (`ActiveWorkoutScreenProps` unchanged, `Button.tsx`'s `ButtonProps` unchanged). This is a pure internal-JSX-and-styles change to one component.

## 6. Frontend Change Summary

| File | Change |
|---|---|
| `src/features/workout/ActiveWorkoutScreen.tsx` | Footer `View` relocated from a sibling-after-`ScrollView` to the last child inside the `ScrollView`'s content (after the exercise-card `.map()`). `ScrollView`'s `contentContainerStyle` gains `paddingBottom: insets.bottom + spacing['4']`. Footer's own inline style drops `padding: spacing['4']`, keeps `gap: spacing['2']`. Settings and Discard Workout buttons now sit inside a new `View` with `flexDirection: 'row', gap: spacing['2']`, each given `style={{ flex: 1 }}`. New `testID={`${testID}-footer`}` on the outer footer `View`. No other props, imports, or logic touched — `handleSettingsPress`, `handleDiscardPress`, `handleAddExercisePress` all unchanged. |
| `src/ui/Button.tsx` | No change (confirmed unnecessary — §4.2). |
| `src/features/workout/EditWorkoutScreen.tsx` | No change (out of scope — NG3). |

## 7. Testing

All testIDs referenced by the existing suite are preserved exactly (`${testID}-add-exercise`, `${testID}-settings`, `${testID}-discard`), so every existing test in `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx` that exercises these three buttons keeps passing unmodified, specifically (line numbers from the file read during this PRD's research):
- L577–597 "Discard Workout shows a confirm; confirming clears the active workout and minimizes"
- L598–613 "Discard Workout — Cancel leaves the workout intact"
- L619–647 "Discard Workout cancels any pending rest-timer notification"
- L660–671 "Settings surfaces its M2-17 stub alert"
- L676–685-ish "+ Add Exercise" footer-button seam test

No snapshot tests exist for this region (confirmed by grep — no `toHaveStyle`/`toMatchSnapshot` hits touching footer/button testIDs), so there's no snapshot to update.

New test coverage to add at task-generation time (this PRD specifies the assertions; exact test-file placement is a `dev-tasks` decision):
1. **Layout assertion for the side-by-side row:** render the screen, get the `${testID}-settings` and `${testID}-discard` elements, and assert they share a common parent whose resolved style includes `flexDirection: 'row'` (via `@testing-library/react-native`'s `toHaveStyle` on the row `View`, queried by a `parent` traversal or a dedicated testID on the row itself if one is added during task generation).
2. **Equal-width assertion:** assert both `Button` elements' outer style includes `flex: 1` (style-prop inspection, not actual measured pixel width — RNTL under Jest doesn't run a real layout pass, so pixel-perfect width equality isn't directly assertable; asserting the `flex: 1` style prop on both is the correct-and-sufficient proxy).
3. **Bottom padding assertion:** assert the `ScrollView`'s `contentContainerStyle` includes a `paddingBottom` that is `insets.bottom + spacing['4']` under a mocked non-zero `useSafeAreaInsets` value (this screen's existing tests already mock `react-native-safe-area-context` — confirm the mock's `insets.bottom` value and assert against it, consistent with however this test suite already verifies the header's `insets.top` usage, if it does).
4. **Zero-exercise "brought up" regression guard (optional, nice-to-have):** with an empty `workout.exercises`, assert the footer testID is present without asserting on-screen pixel position (again, no real Yoga layout pass under Jest) — this is really only observable in a real-device/E2E pass; the `run` skill (see §8) is the practical way to visually confirm G4, not a Jest assertion.

## 8. Manual Intervention Required From You

None required to *approve* this PRD. At implementation time, no environment variables, API keys, native config, or store/schema changes are needed — this is a pure RN/JSX layout change. The one manual step worth doing post-implementation is a visual check on a real device or simulator with a home indicator (e.g. iPhone 14/15 class) confirming: (a) Settings/Discard render as an equal-width row, (b) the gap above the home indicator looks "decent" and not cramped, and (c) starting a brand-new empty workout shows the footer sitting just below the meta row rather than pinned far down the screen. The `run` skill is available for this if you want it driven interactively rather than just eyeballed from the diff.

## 9. Open Questions & Decisions

- **Q1 — Should this PRD block on PRD A landing first?** [RESOLVED: No. PRD A's file did not exist yet at authoring time (`docs/agent_files/tasks/2026-07-28/01-sheet-header-footer-foundation/PRD.md` not found). This PRD's footer-row fix is achieved entirely with existing `Button.tsx` API (`style={{flex:1}}`) and a plain inline `flexDirection: 'row'` wrapper — no new shared primitive is required, so there is nothing to wait on. If PRD A later ships a shared `ButtonRow`/`fullWidth`-equal-flex primitive intended for reuse across sheets, reconcile at `dev-tasks` generation time: either (a) leave this screen's row as the plain inline wrapper specified here (it's correct and self-contained, most likely posture is to leave it alone since ActiveWorkoutScreen isn't a sheet in the header/footer-foundation sense — it's a fullScreenModal), or (b) swap to PRD A's primitive if `dev-tasks` judges consistency is worth the refactor. Either choice is a drop-in replacement of the row `View` + two `style={{flex:1}}` props — low risk either way.]
- **Q2 — Footer-in-scroll-content vs. flexShrink-hybrid-pinned-footer?** [RESOLVED: footer-in-scroll-content (§4.1's chosen Option 1), for three reasons: (1) React Native's Yoga defaults `flexShrink` to `0` (unlike web), making the shrink-hybrid alternative less standard/road-tested in this specific codebase (no existing precedent found anywhere in `src/`); (2) it matches the reference app's (Hevy) own actual placement of "+ Add Exercise" as part of the scrollable list, not a floating/pinned button; (3) it's verified safe against the existing Jest test suite (RNTL's `getByTestId` finds children of a plain, non-virtualizing `ScrollView` regardless of scroll position), whereas the shrink-hybrid approach carries layout risk that can't be verified without a real device/simulator pass, which is out of scope for a planning-only PRD.]
- **Q3 — Does moving "+ Add Exercise" into scroll content hurt reachability on long workouts (many exercises, lots of scrolling to reach it)?** [RESOLVED: accepted trade-off. This is the literal, explicit ask in the task brief ("dont need to make them sticky... you can bring it up"), and matches the reference app's own behavior for the same button. If a future milestone wants a persistent quick-add affordance for very long workouts, that's a separate, distinct feature (e.g. a floating action button) — not in scope here, and not requested.]
- **Q4 — Will "Discard Workout" truncate inside its half-width slot on narrow devices?** [RESOLVED: acceptable, no mitigation needed. `Button.tsx`'s `Text` already has `numberOfLines={1}` (graceful ellipsis truncation, no layout break). Rough sizing check: at a typical 375–430pt-wide iPhone, screen width minus `paddingHorizontal: spacing['4']×2` (32pt) minus the row's `gap: spacing['2']` (8pt), split in half, leaves roughly 165–195pt per button; "Discard Workout" at `typography.headline` comfortably fits within that with the button's own `paddingHorizontal: spacing['5']` (20pt/side) accounted for. Below-375pt-wide devices are not part of this app's supported baseline (no evidence elsewhere in the codebase of sub-375pt design consideration).]
- **Q5 — Does the new `testID={`${testID}-footer`}` need to be wired into any existing test?** [RESOLVED: no. It's additive-only, doesn't change or replace any existing testID, and existing tests continue to query the three button testIDs directly. It exists purely as a convenience hook for the new tests specified in §7.]
- **Q6 — Any change needed to `EditWorkoutScreen.tsx` for consistency, since it has a similar (single-button, also un-inset) pinned footer?** [DEFERRED: confirmed out of scope for this PRD (NG3) — it has no Settings/Discard pair, so there is no "side by side, equal sized" problem to fix there, and its own missing-`insets.bottom` gap (same defect class as this file's original footer) is real but is a separate, smaller fix that should be its own follow-up if/when that screen is revisited, not silently bundled into this PRD's diff.]
