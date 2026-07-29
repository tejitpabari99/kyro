# Tasks: Active Workout Footer Buttons

## Open Questions

- **Q-T1 — Exact testID for the new Settings/Discard row wrapper (needed for the §7 item 1 row-layout assertion).** PRD §7 item 1 explicitly leaves the query mechanism ("via a `parent` traversal or a dedicated testID on the row itself if one is added during task generation") to `dev-tasks`. **Assumption:** add `testID={`${testID}-footer-row`}` to the new inner `View` that wraps the Settings/Discard `Button`s (i.e. `screen-footer-row` at runtime, sibling naming pattern to the PRD's own already-decided `${testID}-footer`). **Reason:** a dedicated testID is more robust to future JSX nesting changes than a `.parent` traversal from `screen-settings`, and follows the exact naming convention the PRD itself already established for the outer footer `View` in §4.1.
- **Q-T2 — Exact `describe`/`it` block naming and placement for the four new §7 tests.** PRD §7 says placement is a `dev-tasks` decision. **Assumption:** all four live in `ActiveWorkoutScreen.test.tsx` (no new test file), in one new `describe('ActiveWorkoutScreen — footer layout (02 §2, revised — sub-project B)', ...)` block inserted immediately after the existing `describe('ActiveWorkoutScreen — header/footer stub affordances', ...)` block closes (currently ends line 688) and before the `seedCheckedExercise` helper (currently line 690). **Reason:** keeps footer-specific tests colocated with the existing footer-button seam tests (discard/settings/add-exercise) rather than scattered, and doesn't depend on any fixture/helper defined later in the file.
- **Q-T3 — Is the "optional, nice-to-have" zero-exercise regression guard (§7 item 4) included as a task?** **Assumption: yes, included** (Task 6 below), but flagged as the one task that can be dropped without weakening the other three §7 assertions if the human reviewer wants to skip it. **Reason:** it's cheap (reuses the existing `startEmpty`-without-`addExercises` pattern already used elsewhere in this file, e.g. the "empty start" `describe` block) and directly guards G4's "no dead-gap / footer stays reachable with zero exercises" behavior at the one layer Jest *can* verify (presence, not pixel position) — PRD §7 itself frames it as low-cost, not risky.
- **Q-T4 — How does the new bottom-padding test (§7 item 3) get a *non-zero* `insets.bottom`, given the existing Jest mock (`jest/safe-area-context-mock.tsx`) always resolves `useSafeAreaInsets()` to `{top:0,right:0,bottom:0,left:0}` via a React Context default, and no test in this file currently overrides it?** Confirmed by reading the mock file and every existing call site in `ActiveWorkoutScreen.test.tsx` — none wraps `render(...)` in the mock's exported `SafeAreaInsetsContext.Provider`. A `paddingBottom` assertion against `insets.bottom + spacing['4']` is meaningless if `insets.bottom` is always `0` (indistinguishable from a bug where `insets.bottom` was silently dropped). **Assumption:** extend the test file's `renderScreen` helper with a new optional 4th parameter (`insetsOverride?: EdgeInsets`) that, when passed, wraps the render tree in `<SafeAreaInsetsContext.Provider value={insetsOverride}>` (imported from `react-native-safe-area-context`, which resolves to the mock under Jest via `jest.config.js`'s `moduleNameMapper`); omitting the 4th argument preserves every existing call site's current zero-insets-via-context-default behavior unchanged. See Task 5. **Reason:** this is the only way to make the assertion actually test something, and reuses the mock's own already-exported `SafeAreaInsetsContext` rather than inventing a new mocking mechanism.

No other ambiguity — PRD §9's Q1–Q6 are all `[RESOLVED]`/`[DEFERRED]` and fully pin down the architecture; §4.1/§4.2's "Before"/"After" code blocks are precise enough to transcribe directly once reconciled against the real file's current line numbers (done below).

## Parallelization

Hard constraint: at most 2 tasks in flight at once. Waves are ordered — a wave cannot start until every task in the previous wave has landed.

- **Wave 1 — Task 1 + Task 3.** Independent: Task 1 touches only `src/features/workout/ActiveWorkoutScreen.tsx`; Task 3 touches only `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`, and only its `renderScreen` helper region (the new import near line 32, and the function body currently at lines 121–139). Disjoint files, neither depends on the other.
- **Wave 2 — Task 2 + Task 4.** Task 2 is verification-only (no files changed) and depends only on Task 1 having landed, so it's compatible with anything else in this wave. Task 4 depends on Task 1 (it queries the `screen-footer-row` testID Task 1 introduces) and inserts a brand-new `describe` block into the test file at a region (~line 688, after the "header/footer stub affordances" block) that is entirely disjoint from the `renderScreen` region Task 3 already landed in Wave 1 — trivially non-overlapping even though both are edits to the same file. Task 2 (no files) and Task 4 (test file only) don't touch each other at all.
- **Wave 3 — Task 5 (alone).** Depends on Task 4 (adds the *second* `it` inside the `describe` block Task 4 opened) and on Task 1 (asserts the `flex: 1` styling Task 1's row wrapper adds). Cannot be paired: Tasks 5, 6, and 7 all insert sequentially into that same `describe` block (each is specified as "the next `it`," appended immediately after the previous one), so any two of {5, 6, 7} running concurrently would be racing to edit the same lines of the same file — not trivially non-overlapping, unlike the Wave 2 case.
- **Wave 4 — Task 6 (alone).** Depends on Task 3 (needs the `insetsOverride` 4th parameter on `renderScreen`) and on Task 4/5 (adds the *third* `it`, appended after Task 5's just-landed one, inside the same `describe` block). Same same-block collision risk with Task 5 and Task 7 rules out pairing.
- **Wave 5 — Task 7 (alone).** Depends on Task 4 (adds the *fourth* `it`, appended after Task 6's) and on Task 1 (checks `screen-footer` presence under the relocated-footer layout). Same same-block collision risk with Task 5 and Task 6 rules out pairing.
- **Wave 6 — Task 8 (alone).** Verification-only, but explicitly scoped as "after Tasks 1–7 are all applied" — it depends on every other task in this file, so there is nothing left to pair it with.

---

### Task 1 — Relocate the footer into the ScrollView's content, add safe-area-aware bottom padding, and make Settings/Discard an equal-width row

   - Files: `src/features/workout/ActiveWorkoutScreen.tsx`
   - Changes: This is one contiguous edit spanning the current lines 1089–1182 (verified by direct read of the file at task-generation time; the PRD's own cited line numbers, ~1088–1182, are accurate — the file has not shifted). Do the following four sub-edits together, since they touch overlapping/adjacent JSX:

     1. **`ScrollView`'s `contentContainerStyle` (currently line 1093):**
        ```tsx
        contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}
        ```
        becomes:
        ```tsx
        contentContainerStyle={{
          padding: spacing['4'],
          // G3: safe-area-aware bottom gap — same `insets.bottom + spacing[n]`
          // idiom this file's own header already uses (`paddingTop: insets.top +
          // spacing['3']`, line ~1010) and that MeasuresHomeScreen/PhotoPagerScreen/
          // PhotoGalleryScreen all use identically for a bottom-anchored element.
          paddingBottom: insets.bottom + spacing['4'],
          gap: spacing['4'],
        }}
        ```
        (`insets` is already in scope — destructured at line 239 via `const insets = useSafeAreaInsets();`. No new import needed.)

     2. **Delete the footer `View` as a sibling after `</ScrollView>`.** Currently at lines 1159–1182 (the `{/* Footer — ... */}` comment plus the `<View style={[styles.footer, ...]}>...</View>` block), sitting *after* the Remove-exercise Snackbars block (lines 1145–1157) and *after* `</ScrollView>` (line 1143). Remove this entire block from its current location.

     3. **Re-insert the footer as the last child inside `ScrollView`, immediately after the `{workout.exercises.map(...)}` block closes (currently line 1142, `})}`) and before `</ScrollView>` (currently line 1143).** Use this exact replacement content (adapted from the deleted block — same three `Button`s, same three testIDs, same `onPress` handlers, same variants — only the wrapping structure and styles change):
        ```tsx
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
              <View style={{ flexDirection: 'row', gap: spacing['2'] }} testID={`${testID}-footer-row`}>
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
        ```
        (Note the `testID={`${testID}-footer-row`}` on the inner row `View` — this is additive, not in the PRD's own snippet; see Open Questions Q-T1. Note the footer's own inline style dropped `padding: spacing['4']` and now only has `gap: spacing['2']` — horizontal/top padding already comes from the `ScrollView`'s `contentContainerStyle.padding`.)

     4. **Leave everything else untouched:** the Remove-exercise Snackbars block (`{Object.entries(pendingRemovals).map(...)}`), `DurationEditSheet`, `SaveWorkoutSheet`, `ExercisePickerSheet`, and every other sheet/overlay stay exactly where they are today, as siblings of `</ScrollView>` — they now simply follow the relocated footer's closing tags instead of the old sibling footer `View`. Do not touch `handleSettingsPress`, `handleDiscardPress`, `handleAddExercisePress`, or any other logic/imports. `styles.footer` in the `StyleSheet.create({...})` block (currently line 1300, `footer: {}`) stays as an empty object — unchanged.

   - Acceptance criteria:
     - The three `Button`s (`${testID}-add-exercise`, `${testID}-settings`, `${testID}-discard`) are now rendered as descendants of the `ScrollView` with `testID={`${testID}-body`}`, not as its siblings.
     - `${testID}-footer`'s `View` is the last child inside that `ScrollView`'s content, after the exercise-card `.map()` output.
     - Settings and Discard Workout are wrapped in a `View` with `flexDirection: 'row'` and `testID={`${testID}-footer-row`}`; both `Button`s carry `style={{ flex: 1 }}`.
     - `ScrollView`'s `contentContainerStyle` includes `paddingBottom: insets.bottom + spacing['4']`.
     - `handleSettingsPress`'s stub `Alert.alert('Workout Settings', 'Workout settings arrive in M2-17.')` is byte-for-byte unchanged (NG1); `handleDiscardPress`'s confirm flow is unchanged (NG2); no changes anywhere in `src/ui/Button.tsx` or `EditWorkoutScreen.tsx`.
     - `pnpm run typecheck` passes with no new errors in `ActiveWorkoutScreen.tsx`.

### Task 2 — Confirm zero regressions in the existing test suite

   - Files: none changed (verification-only task)
   - Changes: Run the existing suite for this file: `pnpm test -- ActiveWorkoutScreen`. Per PRD §7, every test that references `${testID}-add-exercise`, `${testID}-settings`, or `${testID}-discard` should keep passing unmodified, since `getByTestId` walks the full render tree regardless of `ScrollView` scroll position and none of the three testIDs changed.
   - Acceptance criteria:
     - All pre-existing tests in `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx` pass, in particular: "Discard Workout shows a confirm...", "Discard Workout — Cancel leaves the workout intact", "Discard Workout cancels any pending rest-timer notification", "Settings surfaces its M2-17 stub alert", and "\"+ Add Exercise\" opens the exercise picker sheet" (the five tests PRD §7 calls out by name).
     - No test file required any edits to keep passing (confirms PRD §4.1's "verified safe against the existing test suite" claim).

### Task 3 — Extend the `renderScreen` test helper to support a non-zero safe-area-insets override

   - Files: `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
   - Changes: This is a prerequisite for Task 5 (the bottom-padding assertion needs a non-zero `insets.bottom` to assert against — see Open Questions Q-T4).
     1. Add an import near the other top-of-file imports (after the existing `import { Alert } from 'react-native';` line, currently line 32):
        ```tsx
        import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
        ```
        (This resolves to `jest/safe-area-context-mock.tsx` under Jest via `jest.config.js`'s `moduleNameMapper` for `^react-native-safe-area-context$` — the same mock the app code already uses, which exports `SafeAreaInsetsContext` for exactly this purpose.)
     2. Change the `renderScreen` function signature (currently lines 121–139) from:
        ```tsx
        async function renderScreen(
          exerciseRepo: ExerciseRepository,
          overrides: Partial<React.ComponentProps<typeof ActiveWorkoutScreen>> = {},
          theme: 'dark' | 'light' = 'dark',
        ) {
          const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
          const result = await render(
            <QueryClientProvider client={queryClient}>
              <ThemeProvider preference={theme}>
                <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} {...overrides} />
              </ThemeProvider>
            </QueryClientProvider>,
          );
          return { ...result, queryClient };
        }
        ```
        to:
        ```tsx
        async function renderScreen(
          exerciseRepo: ExerciseRepository,
          overrides: Partial<React.ComponentProps<typeof ActiveWorkoutScreen>> = {},
          theme: 'dark' | 'light' = 'dark',
          insetsOverride?: EdgeInsets,
        ) {
          const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
          const tree = (
            <QueryClientProvider client={queryClient}>
              <ThemeProvider preference={theme}>
                <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} {...overrides} />
              </ThemeProvider>
            </QueryClientProvider>
          );
          const result = await render(
            insetsOverride ? (
              <SafeAreaInsetsContext.Provider value={insetsOverride}>{tree}</SafeAreaInsetsContext.Provider>
            ) : (
              tree
            ),
          );
          return { ...result, queryClient };
        }
        ```
   - Acceptance criteria:
     - Every existing call site of `renderScreen(...)` (none pass a 4th argument) compiles and behaves identically to before — `insetsOverride` is `undefined`, so no `SafeAreaInsetsContext.Provider` wraps the tree, and `useSafeAreaInsets()` still falls back to the mock's zero-value context default.
     - `pnpm run typecheck` passes.

### Task 4 — Add the row-layout assertion (PRD §7 item 1)

   - Files: `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
   - Changes: Insert a new `describe` block immediately after the existing `describe('ActiveWorkoutScreen — header/footer stub affordances', ...)` block closes (currently ends line 688) and before the `seedCheckedExercise` helper function (currently line 690) — see Open Questions Q-T2. Start the block now (Tasks 4–6 all add `it`s to this same block):
     ```tsx
     describe('ActiveWorkoutScreen — footer layout (02 §2, revised — sub-project B)', () => {
       it('Settings and Discard Workout share a row (flexDirection: row)', async () => {
         const { driver, workoutRepo, exerciseRepo } = setup();
         await rehydrateStores(workoutRepo, driver);
         await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

         await renderScreen(exerciseRepo);
         await waitFor(() => expect(screen.getByTestId('screen-footer-row')).toBeTruthy());

         expect(screen.getByTestId('screen-footer-row')).toHaveStyle({ flexDirection: 'row' });
       });
     });
     ```
   - Acceptance criteria:
     - Test queries `screen-footer-row` (the new testID from Task 1) and asserts its resolved style includes `flexDirection: 'row'`.
     - Test passes against the Task 1 implementation and fails if `flexDirection: 'row'` is removed from that `View`'s style (sanity-check by temporarily reverting Task 1's row wrapper — should fail — then restoring).

### Task 5 — Add the equal-width (`flex: 1`) assertion (PRD §7 item 2)

   - Files: `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
   - Changes: Add a second `it` inside the `describe` block opened in Task 4:
     ```tsx
       it('Settings and Discard Workout are each flex: 1 (equal width)', async () => {
         const { driver, workoutRepo, exerciseRepo } = setup();
         await rehydrateStores(workoutRepo, driver);
         await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

         await renderScreen(exerciseRepo);
         await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeTruthy());

         expect(screen.getByTestId('screen-settings')).toHaveStyle({ flex: 1 });
         expect(screen.getByTestId('screen-discard')).toHaveStyle({ flex: 1 });
       });
     ```
     (Per PRD §7 item 2: this is style-prop inspection, not a measured-pixel-width assertion — RNTL under Jest doesn't run a real Yoga layout pass, so `flex: 1` on both is the correct-and-sufficient proxy for "equal width.")
   - Acceptance criteria:
     - Both `screen-settings` and `screen-discard` assert `flex: 1` present in their resolved style.
     - Test passes against Task 1's implementation.

### Task 6 — Add the bottom-padding assertion (PRD §7 item 3)

   - Files: `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
   - Changes: Depends on Task 3 (the `insetsOverride` parameter). Add a third `it` inside the same `describe` block:
     ```tsx
       it('applies insets.bottom + spacing[4] as the ScrollView contentContainerStyle paddingBottom', async () => {
         const { driver, workoutRepo, exerciseRepo } = setup();
         await rehydrateStores(workoutRepo, driver);
         await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

         const insetsOverride = { top: 0, right: 0, bottom: 34, left: 0 };
         await renderScreen(exerciseRepo, {}, 'dark', insetsOverride);
         await waitFor(() => expect(screen.getByTestId('screen-body')).toBeTruthy());

         // insets.bottom (34) + spacing['4'] (16, `src/ui/tokens.ts`) = 50.
         expect(screen.getByTestId('screen-body').props.contentContainerStyle).toEqual(
           expect.objectContaining({ paddingBottom: 50 }),
         );
       });
     ```
     (Read directly off `.props.contentContainerStyle` rather than `toHaveStyle` — `contentContainerStyle` is a distinct prop RNTL's `toHaveStyle` matcher does not inspect on `ScrollView`, since it isn't part of the component's own rendered `style`.)
   - Acceptance criteria:
     - Test passes with a non-zero `insetsOverride.bottom` and would fail (proving it's a real assertion, not a vacuous zero-vs-zero check) if `paddingBottom` were reverted to a flat `spacing['4']` with no `insets.bottom` term.
     - `pnpm run typecheck` passes.

### Task 7 — (Optional, per PRD §7 item 4) Add the zero-exercise footer-presence regression guard

   - Files: `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
   - Changes: PRD §7 calls this "optional, nice-to-have" — see Open Questions Q-T3 for why it's included here as a real task rather than dropped. Add a fourth `it` inside the same `describe` block:
     ```tsx
       it('renders the footer even when the workout has zero exercises (G4 regression guard)', async () => {
         const { driver, workoutRepo, exerciseRepo } = setup();
         await rehydrateStores(workoutRepo, driver);
         await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
         // No `addExercises(...)` call — `workout.exercises` stays empty, same
         // "empty start" shape as the `describe('ActiveWorkoutScreen — empty
         // start (02 §1)')` block above.

         await renderScreen(exerciseRepo);
         await waitFor(() => expect(screen.getByTestId('screen-footer')).toBeTruthy());
       });
     ```
     Note (mirrors PRD §7 item 4's own caveat): this only asserts presence, not on-screen pixel position — RNTL under Jest does not run a real layout pass, so it cannot verify the footer "sits just below the meta row" vs. "pinned far down the screen." That visual confirmation is the real-device check in Task 8 / PRD §8.
   - Acceptance criteria:
     - Test passes; `screen-footer` is found even with zero exercises.
     - This test is explicitly *not* a substitute for the manual visual check (Task 8) — it only guards against the footer failing to render at all, not against a visual regression back to "pinned to the bottom with a dead gap."

### Task 8 — Full-suite check and typecheck/lint pass

   - Files: none changed (verification-only task)
   - Changes: Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm test -- ActiveWorkoutScreen` one final time after Tasks 1–7 are all applied.
   - Acceptance criteria:
     - All three commands exit 0.
     - Full `ActiveWorkoutScreen.test.tsx` suite (pre-existing tests + the new `describe('ActiveWorkoutScreen — footer layout ...')` block) passes.

---

## Summary of what requires you (not a dev agent)

- **Real-device/simulator visual check (PRD §8).** After Tasks 1–8 land, do a manual pass on a device or simulator with a home indicator (e.g. iPhone 14/15 class) confirming three things Jest cannot verify (no real Yoga layout pass under RNTL):
  1. Settings and Discard Workout render as a genuinely equal-width row (not just `flex: 1` in the style prop, but actually visually even).
  2. The gap above the home indicator reads as "decent," not cramped.
  3. Starting a brand-new empty workout shows the footer sitting just below the meta row, not pinned far down the screen with a large dead gap (this is what Task 7's regression guard can only partially cover — it checks presence, not position).
  The PRD notes the `run` skill is available if you want this driven interactively rather than just eyeballed from the diff.
- No environment variables, API keys, native config, or store/schema decisions are needed (PRD §8: "None required to approve this PRD").
