# Tasks: Active Workout Visual Parity (PRD J)

## Open Questions

These are ambiguities discovered while grounding tasks in the actual `TimerPill.tsx` code
(not covered by any of PRD §9's 10 already-RESOLVED items, all of which are binding and not
re-litigated below). Each lists the assumption made to keep moving and why. None of these
block execution.

1. **PRD §4.2.1's illustrative style-block names collide with the existing, unchanged, shared
   `TimerControlsRow`'s own style keys.** §4.2.1's snippet names the new panel's button-row
   style `controlsRow` and (implicitly, via §4.2.3's prose) its button style would naturally be
   called `controlButton` — but `TimerPill.tsx` already has a `styles.controlsRow` (`{
   flexDirection: 'row', alignItems: 'center' }`) and `styles.controlButton` (`{ minHeight: 32,
   ... }`), both used today by the existing `TimerControlsRow` component, which §3/§4.2.3
   explicitly keep **unchanged** because the full-screen `Sheet` still reuses it verbatim.
   Reusing those exact key names for the new panel's differently-shaped row (`gap`,
   `paddingHorizontal`, `paddingBottom`) and buttons (`flex:1`, `minHeight:48`, `radii.md`)
   would silently mutate `TimerControlsRow`'s own rendered row/buttons inside the sheet too —
   a real regression to an explicitly out-of-scope component.
   **Assumption:** the new panel-only styles are named `panelControlsRow`/`panelControlButton`
   instead, leaving `styles.controlsRow`/`styles.controlButton` byte-for-byte untouched for
   `TimerControlsRow`'s continued use. Tasks 2–3 below use the renamed keys.

2. **PRD §4.2.1's snippet embeds raw spacing-token values (`spacing['4']`, etc.) directly
   inside a `StyleSheet.create({...})` object** — but reading the actual file shows its real,
   consistent convention is the opposite: `StyleSheet.create` only ever holds static/structural
   values (position, flex, minHeight, hairline widths), and every theme/spacing/radii value is
   merged in via an inline array style (`[styles.foo, { backgroundColor: colors.x, gap:
   spacing['3'] }]`) at the JSX call site, sourced from `useTheme()` at render time — because
   `StyleSheet.create` runs at module-eval time, before any `ThemeProvider` context exists.
   **Assumption:** Tasks 2–3 follow the file's real, established convention (static-only
   `StyleSheet.create` + inline token values at render time) rather than copying §4.2.1's
   snippet literally — same visual result, same values, just placed where this file already
   puts them everywhere else.

3. **No existing precedent in this codebase's test suite for asserting a Reanimated
   shared-value-driven `transform` via RNTL.** `Sheet.tsx` is the only other component with an
   entrance animation, and `Sheet.test.tsx` (read in full) never asserts on its own
   `translateY`/`transform` — its own file header explicitly says its 6 tests "don't assert on
   height/padding/radius" either. PRD §7(d) explicitly asks for a new test proving the
   entrance animation re-triggers on a new timer, so Task 5 below writes one, relying on
   `jest.config.js`'s own documented synchronous "web" fallback for `react-native-reanimated`
   under Jest. **Assumption:** the test asserts on the panel `Animated.View`'s flattened
   `style.transform` at three points (initial settle, immediately after a new `timerKey` render,
   after the 250 ms `withTiming` duration elapses under fake timers) — if the exact
   `act()`/timer-advance mechanics need adjusting to match how that fallback actually behaves
   once run, the implementer should adjust the test's mechanics while preserving its
   behavioral intent (reset-to-`PANEL_ENTER_OFFSET`-then-settle-to-`0`), not weaken or drop the
   assertion.

## Task 1 — `tokens.ts`: new `semantic.onInfo` token + contrast test

- Files:
  - `/root/projects/kyro/src/ui/tokens.ts`
  - `/root/projects/kyro/src/ui/__tests__/tokens.test.ts`
- Changes (traces to §4.2.2, §5, §9 decision 3):
  1. In `ThemeColors['semantic']`, add a new field with a doc comment matching the file's
     existing per-field comment style:
     ```ts
     /** Label on `semantic.info`-filled controls (e.g. the rest-timer panel's Skip button). */
     onInfo: string;
     ```
  2. In `darkColors.semantic`, add `onInfo: '#FFFFFF',`.
  3. In `lightColors.semantic`, add `onInfo: '#FFFFFF',`.
     (Both themes get the same literal value — §4.2.2's own resolution: "White on
     `#3B82F6`/`#2563EB` is comfortably legible at any of this app's button-label sizes.")
  4. In `tokens.test.ts`, add a new `describe` block alongside the existing `describe('accent-filled
     controls (label on fill)', ...)` block (same file, same `describe.each(THEMES)` scope), mirroring
     its exact shape:
     ```ts
     describe('info-filled controls (label on fill)', () => {
       it('semantic.onInfo on semantic.info is >= 3:1', () => {
         expect(contrastRatio(t.semantic.onInfo, t.semantic.info)).toBeGreaterThanOrEqual(3);
       });
     });
     ```
     (3:1 is the same bar the file's own header comment already documents for "accent-filled
     controls (label on fill)" — applied here to the new info-filled control for the same reason.)
- Acceptance criteria:
  - `colors.dark.semantic.onInfo` and `colors.light.semantic.onInfo` both equal `'#FFFFFF'`.
  - The new `tokens.test.ts` case passes for both themes (white on `#3B82F6` and white on
    `#2563EB` both clear 3:1 by a wide margin — sanity-checkable by eye before running).
  - No other existing `tokens.test.ts` case changes or regresses.

## Task 2 — `TimerPill.tsx`: new local `RestTimerPanelControls` component

- Files: `/root/projects/kyro/src/features/workout/TimerPill.tsx`
- Changes (traces to §4.2.3; depends on Task 1's `semantic.onInfo`):
  - Add a new, **not exported**, locally-declared component directly below the existing
    `TimerControlsRow` function (same file-locality precedent that function itself already
    sets) — do not edit `TimerControlsRow` itself, it stays exactly as-is for the sheet (§3).
    ```tsx
    interface RestTimerPanelControlsProps {
      testIDPrefix: string;
      onAdjust: (deltaSeconds: number) => void;
      onSkip: () => void;
    }

    /**
     * −15 / +15 / Skip, in Hevy's literal button order (§4.2.3) — a *new*,
     * panel-only control row, not an edit to `TimerControlsRow` above (that
     * component keeps its own order/styling, reused unchanged by the
     * full-screen sheet, §3). `Skip` alone is filled (`semantic.info` /
     * `semantic.onInfo`); `-15`/`+15` keep the existing gray/elevated
     * treatment.
     */
    function RestTimerPanelControls({
      testIDPrefix,
      onAdjust,
      onSkip,
    }: RestTimerPanelControlsProps): React.JSX.Element {
      const { colors, typography, spacing, radii } = useTheme();
      return (
        <View
          style={[
            styles.panelControlsRow,
            { gap: spacing['3'], paddingHorizontal: spacing['4'], paddingBottom: spacing['4'] },
          ]}
        >
          <Pressable
            testID={`${testIDPrefix}-minus15`}
            accessibilityRole="button"
            accessibilityLabel="Subtract 15 seconds"
            onPress={() => onAdjust(-ADJUST_STEP_SECONDS)}
            hitSlop={8}
            style={[
              styles.panelControlButton,
              { backgroundColor: colors.bg.elevated, borderRadius: radii.md },
            ]}
          >
            <Text style={[typography.footnote, { color: colors.text.primary, fontWeight: '600' }]}>
              −15s
            </Text>
          </Pressable>
          <Pressable
            testID={`${testIDPrefix}-plus15`}
            accessibilityRole="button"
            accessibilityLabel="Add 15 seconds"
            onPress={() => onAdjust(ADJUST_STEP_SECONDS)}
            hitSlop={8}
            style={[
              styles.panelControlButton,
              { backgroundColor: colors.bg.elevated, borderRadius: radii.md },
            ]}
          >
            <Text style={[typography.footnote, { color: colors.text.primary, fontWeight: '600' }]}>
              +15s
            </Text>
          </Pressable>
          <Pressable
            testID={`${testIDPrefix}-skip`}
            accessibilityRole="button"
            accessibilityLabel="Skip rest timer"
            onPress={onSkip}
            hitSlop={8}
            style={[
              styles.panelControlButton,
              { backgroundColor: colors.semantic.info, borderRadius: radii.md },
            ]}
          >
            <Text style={[typography.footnote, { color: colors.semantic.onInfo, fontWeight: '600' }]}>
              Skip
            </Text>
          </Pressable>
        </View>
      );
    }
    ```
  - Add two new keys to the file's bottom `StyleSheet.create({...})` block (leave every
    existing key — `pillContainer`, `pillTapArea`, `controlsRow`, `controlButton`,
    `sheetContent` — untouched for now; `pillContainer`/`pillTapArea` are removed in Task 3,
    not here):
    ```ts
    panelControlsRow: {
      flexDirection: 'row',
    },
    panelControlButton: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ```
  - Per Open Questions #1, these are deliberately **not** named `controlsRow`/`controlButton`
    (those names stay owned by the existing `TimerControlsRow`).
  - This component is not wired into the render tree yet — that happens in Task 3.
- Acceptance criteria:
  - File compiles; `RestTimerPanelControls` is defined but (until Task 3) unused — expect (and
    ignore for now) an unused-symbol lint warning, which Task 3 resolves by wiring it in.
  - `TimerControlsRow`'s own rendered output is provably unchanged (its own style keys were not
    touched).

## Task 3 — `TimerPill.tsx`: full-width bottom-panel layout + render tree

- Files: `/root/projects/kyro/src/features/workout/TimerPill.tsx`
- Changes (traces to §4.2.1, §4.2.8, §6; depends on Task 2's `RestTimerPanelControls`):
  1. **New import**: `import { useSafeAreaInsets } from 'react-native-safe-area-context';`
     (not currently imported by this file — §4.2.1).
  2. **Remove** the constants `PILL_RING_SIZE` and `PILL_RING_STROKE` (lines 81–82 today).
     **Keep** `SHEET_RING_SIZE`/`SHEET_RING_STROKE` and the `ProgressRing` import — both are
     still used, unchanged, by the full-screen sheet's own 220pt ring (§3, out of scope).
  3. Inside `TimerPill(...)`, immediately after the existing
     `const { colors, typography, spacing, radii } = useTheme();` line, add:
     ```ts
     const insets = useSafeAreaInsets();
     ```
     (a hook call — must sit unconditionally near the top of the component body, before the
     later `if (!timer) return null;` guard, same reasoning every other hook in this file
     already follows).
  4. **Remove** the `remainingTextStyle` computed variable (the `typography.statLarge` +
     `fontVariant` spread block) entirely — the panel's countdown text now uses
     `typography.display` directly (§4.2.1: "matching the size the full-screen sheet's own
     `${testID}-sheet-remaining` already uses today"), which has no `fontVariant` field to work
     around.
  5. Replace the render tree's first `<View testID={testID} ...>...</View>` block (today: the
     `pillContainer`-styled row containing the `pillTapArea` Pressable with `ProgressRing` +
     remaining-time text, plus `TimerControlsRow`, plus the `__DEV__` debug text) with:
     ```tsx
     <View
       testID={testID}
       style={[
         styles.panelContainer,
         {
           backgroundColor: colors.bg.surface,
           borderTopColor: colors.border.hairline,
           paddingBottom: insets.bottom,
         },
       ]}
     >
       <View style={[styles.progressTrack, { backgroundColor: colors.bg.elevated }]}>
         <View
           style={[
             styles.progressFill,
             { width: `${progress * 100}%`, backgroundColor: colors.semantic.info },
           ]}
         />
       </View>

       <Pressable
         testID={`${testID}-open`}
         accessibilityRole="button"
         accessibilityLabel={`Rest timer, ${remainingText} remaining. Tap for details.`}
         onPress={() => setSheetVisible(true)}
         style={[styles.countdownArea, { paddingVertical: spacing['4'] }]}
       >
         <Text
           testID={`${testID}-remaining`}
           style={[typography.display, { color: colors.text.primary }]}
         >
           {remainingText}
         </Text>
       </Pressable>

       <RestTimerPanelControls testIDPrefix={testID} onAdjust={handleAdjust} onSkip={handleSkip} />

       {__DEV__ ? (
         <Text
           testID={`${testID}-debug-notification-id`}
           style={[
             typography.caption,
             { color: colors.text.tertiary, textAlign: 'center', paddingBottom: spacing['2'] },
           ]}
         >
           {timer.notificationId ?? 'none'}
         </Text>
       ) : null}
     </View>
     ```
     (§4.2.8: the tap target that opens the full-screen sheet moves from the old
     `pillTapArea` — ring + text — onto `countdownArea` — thin bar's text area — since the ring
     no longer exists; same `testID`, same `accessibilityLabel`, same `onPress`, excluded from
     the button row per §4.2.8's own note. §6: the `__DEV__` debug text keeps its exact testID
     and gating, relocated under the button row.)
  6. Leave the `<Sheet testID={`${testID}-sheet`} ...>...</Sheet>` block immediately below
     completely unchanged (§3, out of scope) — it is still a sibling of the panel `View` inside
     the same `<>...</>` fragment.
  7. Update the `StyleSheet.create({...})` block: **remove** `pillContainer` and `pillTapArea`;
     **add**:
     ```ts
     panelContainer: {
       position: 'absolute',
       left: 0,
       right: 0,
       bottom: 0,
       borderTopWidth: StyleSheet.hairlineWidth,
     },
     progressTrack: {
       height: 4,
       width: '100%',
     },
     progressFill: {
       height: 4,
     },
     countdownArea: {
       alignItems: 'center',
     },
     ```
     Leave `controlsRow`, `controlButton`, `sheetContent`, and Task 2's `panelControlsRow`/
     `panelControlButton` untouched.
- Acceptance criteria:
  - Rendering `<TimerPill testID="pill" />` with a seeded timer shows, top to bottom inside the
    `pill` container: a 4pt bar, the countdown text (now sized via `typography.display`), the
    `-15/+15/Skip` row, and (in `__DEV__`) the debug notification-id caption — no ring anywhere.
  - The panel `View`'s flattened style has `left:0, right:0, bottom:0` and no `borderRadius`
    (edge-to-edge, not a floating pill).
  - `pill-open`'s accessible area no longer includes the button row (pressing anywhere in the
    `-15`/`+15`/`Skip` buttons does **not** also open the sheet).
  - `TimerControlsRow` (used only by the sheet) is visually and behaviorally unchanged —
    `pill-sheet-minus15`/`pill-sheet-skip`/`pill-sheet-plus15` still render in their original
    `-15s / Skip / +15s` order.
  - `ProgressRing`/`SHEET_RING_SIZE`/`SHEET_RING_STROKE` still render correctly inside the
    full-screen sheet, unchanged.

## Task 4 — `TimerPill.tsx`: entrance ("pop up") animation

- Files: `/root/projects/kyro/src/features/workout/TimerPill.tsx`
- Changes (traces to §4.2.4, §4.2.5, §9 decisions 4–5; depends on Task 3's `panelContainer`
  render tree):
  1. **New imports**:
     ```ts
     import Animated, {
       Easing,
       useAnimatedStyle,
       useSharedValue,
       withTiming,
     } from 'react-native-reanimated';
     ```
  2. **New constant**, alongside the existing `ADJUST_STEP_SECONDS`/ring-size constants:
     ```ts
     /** Fixed, deliberately-oversized off-screen start offset (§4.2.4) — larger
      * than the panel's realistic max rendered height (~174pt), so an
      * imprecise fixed value is visually indistinguishable from a measured
      * one, without an extra measure-then-animate frame. */
     const PANEL_ENTER_OFFSET = 220;
     ```
  3. Inside `TimerPill(...)`, insert the following **before** the existing
     `if (!timer) { return null; }` guard (hooks must run unconditionally on every render —
     same placement rule as every other hook already in this file), placed after the existing
     `completedForKeyRef` `useEffect` block:
     ```ts
     // Entrance ("pop up") animation (§4.2.4) — keyed on `timerKey`, not `[]`:
     // unlike `Sheet.tsx` (whose callers conditionally mount it), `TimerPill`
     // itself never remounts across a session — `ActiveWorkoutScreen` renders
     // it unconditionally — so an empty-deps effect would only ever animate
     // in the very first timer of the session. Keying on `timerKey` instead
     // re-arms the animation for every genuinely new timer instance, per
     // §9 decision 5.
     const translateY = useSharedValue(PANEL_ENTER_OFFSET);
     // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
     // re-fires only on a genuinely new timer instance (timerKey changing),
     // not on every remainingMs tick; translateY is a stable Reanimated
     // shared-value ref, same reasoning Sheet.tsx's own entrance effect uses.
     useEffect(() => {
       if (!timer) {
         return;
       }
       translateY.value = PANEL_ENTER_OFFSET;
       translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
     }, [timerKey]);
     const animatedStyle = useAnimatedStyle(() => ({
       transform: [{ translateY: translateY.value }],
     }));
     ```
  4. Change the panel's outer element from `View` to `Animated.View` and append `animatedStyle`
     to its style array:
     ```tsx
     <Animated.View
       testID={testID}
       style={[
         styles.panelContainer,
         {
           backgroundColor: colors.bg.surface,
           borderTopColor: colors.border.hairline,
           paddingBottom: insets.bottom,
         },
         animatedStyle,
       ]}
     >
       {/* ...unchanged children from Task 3... */}
     </Animated.View>
     ```
  5. **No exit animation** (§4.2.5, §9 decision 4) — do not add any unmount delay, dismiss
     transition, or new "animate out then unmount" machinery. The panel still disappears
     instantly the moment `timer` becomes `null`, exactly like today.
- Acceptance criteria:
  - On first mount with a seeded timer, the panel's `transform` starts at
    `translateY: PANEL_ENTER_OFFSET` (220) and animates to `translateY: 0` over 250 ms.
  - Seeding a second timer with a **different** `setId` while the panel is already visible
    resets `translateY.value` back to 220 and re-animates it to 0 (see Task 5's new test).
  - Seeding a timer adjustment that does *not* change `setId` (e.g. `-15s`/`+15s`) does **not**
    reset or replay the entrance animation.
  - Skipping or naturally completing a timer still instantly un-renders the panel (`timer`
    becomes `null` → the existing `if (!timer) return null;` guard fires) — no new delay.

## Task 5 — `TimerPill.test.tsx`: re-verify existing tests + add new assertions

- Files: `/root/projects/kyro/src/features/workout/__tests__/TimerPill.test.tsx`
- Changes (traces to §7; depends on Tasks 1–4):
  1. **Re-run the existing ~20 tests unmodified first.** None of them reference `pill-ring`,
     `pillContainer`, or `pillTapArea` directly (confirmed by reading the file in full before
     this task list was written) — they target retained testIDs (`pill`, `pill-remaining`,
     `pill-minus15`, `pill-plus15`, `pill-skip`, `pill-open`, `pill-sheet-*`,
     `pill-debug-notification-id`) and store-level behavior, none of which changed. They are
     expected to keep passing with **zero** edits. If any fails, treat that as a signal Tasks
     2–4 introduced an unintended behavior change, not a reason to loosen the test.
  2. Add new imports at the top of the file: `StyleSheet` and `within` from
     `'react-native'`/`'@testing-library/react-native'` (as needed alongside the existing
     `act, fireEvent, render, screen` import), `SafeAreaInsetsContext` from
     `'react-native-safe-area-context'` (resolves to `jest/safe-area-context-mock.tsx` via
     `jest.config.js`'s `moduleNameMapper`, same pattern PRD A's `Sheet.test.tsx` tasks
     establish), and `colors` from `'@/ui/tokens'`.
  3. Add a new `describe('TimerPill — bottom panel redesign (PRD J)', () => { ... })` block
     with the following cases:
     - **Edge-to-edge + live safe-area inset** (§4.2.1):
       ```tsx
       it('panel is edge-to-edge and its bottom padding includes the live safe-area inset', async () => {
         seedTimer(60_000);
         await render(
           <SafeAreaInsetsContext.Provider value={{ top: 0, right: 0, bottom: 34, left: 0 }}>
             <ThemeProvider preference="dark">
               <TimerPill testID="pill" />
             </ThemeProvider>
           </SafeAreaInsetsContext.Provider>,
         );
         const flatStyle = StyleSheet.flatten(screen.getByTestId('pill').props.style);
         expect(flatStyle.left).toBe(0);
         expect(flatStyle.right).toBe(0);
         expect(flatStyle.bottom).toBe(0);
         expect(flatStyle.paddingBottom).toBe(34);
       });
       ```
     - **Panel control order** (§4.2.3 — Hevy order, not the old sheet order):
       ```tsx
       it('renders the panel controls in Hevy order: -15, +15, Skip', async () => {
         seedTimer(60_000);
         await renderPill();
         const orderedIds = screen
           .getAllByRole('button')
           .map((el) => el.props.testID)
           .filter((id): id is string => typeof id === 'string' && !id.includes('sheet'));
         expect(orderedIds.indexOf('pill-minus15')).toBeLessThan(orderedIds.indexOf('pill-plus15'));
         expect(orderedIds.indexOf('pill-plus15')).toBeLessThan(orderedIds.indexOf('pill-skip'));
       });
       ```
     - **Skip color, both themes** (§4.2.2):
       ```tsx
       it.each(['dark', 'light'] as const)(
         'Skip is filled with semantic.info / text semantic.onInfo in %s theme',
         async (theme) => {
           seedTimer(60_000);
           await render(
             <ThemeProvider preference={theme}>
               <TimerPill testID="pill" />
             </ThemeProvider>,
           );
           const skip = screen.getByTestId('pill-skip');
           expect(StyleSheet.flatten(skip.props.style).backgroundColor).toBe(
             colors[theme].semantic.info,
           );
           const skipLabel = within(skip).getByText('Skip');
           expect(StyleSheet.flatten(skipLabel.props.style).color).toBe(
             colors[theme].semantic.onInfo,
           );
         },
       );
       ```
     - **Entrance animation re-triggers on a new timer instance** (§4.2.4, §9 decision 5 — the
       one behavioral case this whole subsection exists to get right, per §7's own note it
       should be asserted, not just implemented and trusted):
       ```tsx
       it('a new timer (different setId) re-triggers the entrance animation while the panel stays visible', async () => {
         seedTimer(10_000, { setId: 'set1' });
         await renderPill();
         await act(async () => {
           jest.advanceTimersByTime(300); // let the first entrance settle past 250ms
         });
         expect(
           StyleSheet.flatten(screen.getByTestId('pill').props.style).transform,
         ).toEqual([{ translateY: 0 }]);

         await act(async () => {
           seedTimer(30_000, { setId: 'set2' });
         });
         expect(
           StyleSheet.flatten(screen.getByTestId('pill').props.style).transform,
         ).toEqual([{ translateY: 220 }]);

         await act(async () => {
           jest.advanceTimersByTime(300);
         });
         expect(
           StyleSheet.flatten(screen.getByTestId('pill').props.style).transform,
         ).toEqual([{ translateY: 0 }]);
       });
       ```
       Per Open Questions #3: if the exact timing/`act()` mechanics don't line up with how
       `react-native-reanimated`'s Jest fallback actually resolves `withTiming` once this is
       run, adjust the mechanics (e.g. intermediate timer advances) but keep asserting the
       reset-then-settle behavior — do not drop this test.
- Acceptance criteria:
  - All pre-existing tests in the file pass unmodified.
  - All four new cases above pass.
  - No test in the file references the removed `pill-ring` testID or the removed
    `pillContainer`/`pillTapArea` style keys.

## Task 6 (optional) — `SetRow.test.tsx`: Part 1 regression guard

Per PRD §7: **"Optional, low-risk regression guard... Explicitly not required for this PRD to
be considered done, since there is no bug to close out."** Part 1 (§4.1) has no code change —
this is the only task associated with it, and it is a test-only tripwire, not a fix.

- Files: `/root/projects/kyro/src/ui/__tests__/SetRow.test.tsx`
- Changes (traces to §7, optional): add one new test to the existing
  `describe('SetRow — SET / PREVIOUS / ✓ / delete', ...)` block (alongside the existing
  `'reflects isCompleted in the check cell's accessibility state'` test at line ~292), pinning
  today's already-correct colors so a future change can't silently regress them to
  `semantic.danger` or any other token:
  ```tsx
  it('pins the completed-state row tint to bg.accentSubtle and check-cell fill to accent.primary — PRD J §7 regression guard, not a fix', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ isCompleted: true })} />
      </ThemeProvider>,
    );
    const rowStyle = StyleSheet.flatten(screen.getByTestId('row-content').props.style);
    expect(rowStyle.backgroundColor).toBe(colors.dark.bg.accentSubtle);
    const checkStyle = screen.getByTestId('row-check').props.style;
    expect(checkStyle.backgroundColor).toBe(colors.dark.accent.primary);
  });
  ```
  (`row-content`/`row-check` are the file's existing testIDs — confirmed by reading
  `SetRow.tsx` lines 353/571/590 — and `colors`/`StyleSheet` may need adding to this test
  file's imports if not already present.)
- Acceptance criteria: the new test passes today, with zero other changes to `SetRow.tsx` or
  any other file. Implementer may skip this task entirely without PRD J being considered
  incomplete — if skipped, note that explicitly rather than silently omitting it.

## Summary of what requires you (not a dev agent)

- **Part 1 — verify the set-complete color on a real device/build (PRD §8).** No code was
  changed for this (§4.1, §3 non-goal) — `SetRow.tsx`/`tokens.ts` already render the completed
  check as green (`colors.accent.primary`/`colors.bg.accentSubtle`), confirmed by direct
  read and `git log`. Please check, in likely order of probability:
  1. **The Failure-set badge's letter "F"** — genuinely red (`colors.semantic.danger`), sits in
     the same row's leftmost "SET" cell next to the checkmark; easy to misread as "the row
     turned red" at a glance.
  2. **The swipe-to-delete panel** — briefly reveals red (`colors.semantic.danger`) with a
     trash icon mid-swipe-gesture.
  3. **A stale build** — if testing an old installed build predating the green tokens (unlikely,
     per `git log`, but cheap to rule out with a fresh rebuild/reinstall).
  If none of these explain what was seen, please send a screenshot/recording — that's the
  fastest way to find a real, different bug if one exists.
- **Part 2 — footer-overlap sanity check (PRD §8).** Not a blocker, no code change gated on it:
  once Tasks 1–5 are built, confirm the new full-width rest-timer panel visibly covering the
  `+ Add Exercise` / `Settings` / `Discard Workout` footer buttons during rest (§4.2.7,
  resolved-as-acceptable, matches Hevy's own real behavior) actually reads as acceptable in
  practice, not just on paper. Recovery is instant (footer reappears the moment the timer is
  skipped/completes) — nothing to fix if it doesn't feel right, just flag it if so.
- **New user-facing surface, not new copy** — unlike PRD A's several new "Cancel"/"Done"/"Close"
  labels, this PRD introduces no new user-facing text; the countdown/`-15s`/`+15s`/`Skip`
  labels are all pre-existing strings, just relaid-out and recolored. Nothing to copy-review.
- **Task 6 is entirely optional** (see its own note) — no decision needed from you either way;
  the implementer may include or skip it at their discretion.
- **Nothing else requires you.** No external services, secrets, accounts, or manual infra
  approvals are needed for any of the 6 tasks above.
