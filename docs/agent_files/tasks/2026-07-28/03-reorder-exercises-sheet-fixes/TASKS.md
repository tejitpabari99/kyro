## Open Questions

- **RECONCILIATION NOTE (2026-07-30) — the "no drift" claim below is FALSE and
  is superseded by this note.** This file was originally generated against
  the PRD §4.1–§4.5 before-snippets (hand-rolled title `<Text>` + a manual
  `<Button>` sitting after a `flex:1` `ScrollView`, with no `SheetHeader`/
  `ScreenFooter` in the picture at all). Since then:
  - **PRD A (`01-sheet-header-footer-foundation`) shipped and merged** —
    `src/ui/SheetHeader.tsx` and `src/ui/ScreenFooter.tsx` exist for real.
  - **Subproject 01's own task list already retrofitted this exact file**
    (commit `c0e1227`, "Adopt SheetHeader and ScreenFooter in
    ReorderExercisesSheet (Task 28)") to use both primitives, *before* this
    subproject's tasks were ever executed.
  - Every before-snippet in Tasks 1–3 below (the old hand-rolled `Text`/
    `Button` markup) now describes code that **does not exist on disk**. The
    live `src/features/workout/ReorderExercisesSheet.tsx` was re-read in full
    on 2026-07-30 to re-derive what PRD C's 3 goals actually still require.
    Findings, resolved item by item:

  1. **Goal — title centered.** [RESOLVED: already true, zero further work.]
     The live file renders `<SheetHeader testID={`${testID}-header`}
     title="Reorder Exercises" safeTop />` with no `left`/`right` slot passed.
     `SheetHeader`'s own layout algorithm (`src/ui/SheetHeader.tsx`:
     `textAlign: !hasLeft && !hasRight ? 'center' : 'left'`) centers the title
     automatically whenever both slots are absent, which is the case here.
     The old Task 2's `textAlign: 'center'` instruction is superseded —
     there is no title `<Text>` left in this file to add it to, and the
     centering is already correct.

  2. **Goal — title "appropriately sized."** [RESOLVED: keep `SheetHeader`'s
     default `typography.headline` size — do not attempt to bump it. Judgment
     call, documented here.] The old Task 2 also bumped the title from
     `typography.headline` to `typography.title2`, justified at authoring
     time by citing `SaveWorkoutSheet.tsx` as sibling precedent for `title2`
     on a `detent="full"` sheet title. That precedent **no longer exists**:
     `SaveWorkoutSheet.tsx` was itself retrofitted under subproject 01
     (commit `a1d4758`) to `<SheetHeader testID={`${testID}-header`}
     title="Save Workout" safeTop />` — plain default-size `SheetHeader`,
     same as this file, no `title2` anywhere. Re-checked `src/ui/
     SheetHeader.tsx` in full: it renders its title at a fixed
     `typography.headline` with **no prop to override the size** — there is
     no escape hatch. Two ways to still chase a size bump were considered and
     rejected:
     - Add a size-override prop to `SheetHeader.tsx` itself — **out of
       scope**: PRD C's target file is `ReorderExercisesSheet.tsx` only (see
       PRD.md's own header, "Target file (only file touched)"), and a change
       to the shared primitive would ripple into every other sheet that has
       already converged on the default size.
     - Render a separate oversized title element instead of using
       `SheetHeader`'s own `title` prop — rejected as a straight regression:
       it would re-introduce the exact hand-rolled-title anti-pattern
       subproject 01 just finished removing from this file, for a goal
       (visual size bump) whose own justification (matching
       `SaveWorkoutSheet`) has evaporated.
     **Recommendation: leave the title at `SheetHeader`'s default headline
     size.** PRD C's goal #3 literally asks for a title "consistent with the
     codebase's own... title precedent" — that precedent has shifted, from
     one sheet (`SaveWorkoutSheet`) using a bespoke `title2` size, to every
     retrofitted sheet in the codebase (`SaveWorkoutSheet`,
     `ExerciseTypeSheet`, `LogEntrySheet`, `MultiSelectOptionSheet`,
     `PlateCalculatorSheet`, and this file) using `SheetHeader`'s one
     consistent default. Honoring goal #3's literal wording today means
     **not** bumping the size — doing so would make this the *one* outlier
     sheet with an oversized title, the opposite of "consistent." No further
     code change is needed for this goal.

  3. **Goal — Save button full-width.** [NOT YET DONE — this is the one real
     remaining code change.] Confirmed by reading the live file and grepping
     it for `size=`: the `<Button testID={`${testID}-save`} label="Save
     Order" variant="primary" onPress={handleSave} />` inside `ScreenFooter`
     sets no `size` prop at all, so it defaults to `size="md"` (`src/ui/
     Button.tsx`: `size = 'md'`), which resolves `alignSelf: 'flex-start'`
     (`Button.tsx`: `alignSelf: size === 'lg' || fullWidth ? 'stretch' :
     'flex-start'`) — the button still hugs its label's intrinsic width, not
     full-width. Adding `size="lg"` is the fix (`SIZE_HEIGHT.lg = 50`,
     `alignSelf: 'stretch'`) — see rewritten Task 1 below. This is also still
     the correct sibling-precedent pick: `ExercisePickerSheet.tsx:339`'s
     single-button `ScreenFooter` confirm action still uses `size="lg"`
     today (re-checked live). `SaveWorkoutSheet.tsx` is no longer a `size=
     "lg"` precedent — it moved to a two-button `ButtonRow` of `size="md"`
     buttons (Cancel + Save) in the same `a1d4758` retrofit — but that's
     because it added a second (Cancel) button, which this PRD does not.
     `ExercisePickerSheet.tsx` (single button, no Cancel, same shape as this
     file) remains the applicable precedent for `size="lg"`.

  4. **Goal — Save button never obscured by the home indicator / safe-area
     bottom gap.** [RESOLVED: already true today, zero further code change.]
     The old Task 1 (import + call `useSafeAreaInsets()`) and the
     `insets.bottom + spacing['4']` half of the old Task 3 (a manual
     `marginBottom` on the `<Button>`) are **both superseded and dropped
     entirely** — re-checked `src/ui/ScreenFooter.tsx` in full: it already
     applies `paddingBottom: insets.bottom + (gap ?? spacing['4'])` to every
     child it wraps, via its own internal `useSafeAreaInsets()` call. The
     live file already wraps the Save button in `<ScreenFooter
     testID={`${testID}-footer`}>`, and `ScreenFooter` is rendered as the
     scrolling content's actual last child (`ScrollView` has no `flex:1` —
     it uses `contentContainerStyle={{ paddingHorizontal: spacing['4'] }}`
     only), matching `ScreenFooter`'s own documented placement contract (its
     file header explicitly calls out the old `ScrollView(flex:1)` +
     sibling-`Button` shape — this file's *previous* shape — as the
     "sticky-by-accident" anti-pattern to avoid, and this file no longer has
     it). Adding a second, manual `insets.bottom`-based margin directly on
     the `Button` on top of this would double-count the safe-area inset —
     redundant padding, not a fix. No action needed for this goal.

  5. **Stray comment found in the live file, flagged but not acted on.** The
     live file (inserted by the `c0e1227` retrofit) carries this comment
     immediately after its `SheetHeader`:
     ```tsx
     {/* PRD C (reorder-exercises-sheet-fixes) owns adding a Cancel/dismiss
         control to this header per §4.5's corollary — deliberately not
         added here to avoid two PRDs editing the same header row. */}
     ```
     Re-read `PRD.md` (this subproject's own PRD, C) in full: it contains no
     §4.5 "corollary" about a Cancel/dismiss control, and its 3 goals (§2)
     are exclusively about title centering/sizing, button full-width, and
     the bottom safe-area gap — nothing about adding a header dismiss
     control, and §5 ("API Change Summary") explicitly says no props change.
     Best guess: this references either an earlier draft of PRD C that was
     later narrowed, or a forward-assumption made by the subproject-01 agent
     that didn't end up matching PRD C's final, settled scope. **Judgment
     call: do not add a Cancel/dismiss control as part of this
     reconciliation.** PRD.md is the settled source of truth for this
     subproject's scope (per this session's instructions, it is not to be
     edited here), and it does not ask for one. If a Cancel control is
     wanted, that's a new decision for a future PRD revision, not something
     to backfill silently into a docs-only reconciliation pass.

  (The rest of this note is the original, now-superseded verification text,
  left in place for a paper trail rather than deleted outright — do not
  trust any of it, everything above supersedes it:)

  ~~None — all PRD §9 items are already RESOLVED or DEFERRED.~~

  ~~(Verification note: all 5 §9 entries were re-scanned. Four are
  `[RESOLVED: ...]`, one is `[DEFERRED: ...]`. No `[OPEN]` items exist. Every
  before-snippet in PRD §4.1–§4.5 was also diffed against the current
  `ReorderExercisesSheet.tsx` on disk and matches verbatim — no line-number
  drift. The PRD's claim that all 3 call sites need zero code changes was
  independently re-verified by reading each call site:
  `ActiveWorkoutScreen.tsx:1224-1233`, `EditWorkoutScreen.tsx:601-610`,
  `RoutineEditorScreen.tsx:434-442` each pass exactly `testID`, `visible`,
  `onDismiss`, `exercises`, `onSave` — the full and only
  `ReorderExercisesSheetProps` shape, unchanged. This claim holds.)~~ — this
  was true of the PRD's own §9 entries, but false of this TASKS.md's Tasks
  1–3 themselves, which had drifted from the real file without anyone
  re-checking their before-snippets against it. That's what this
  reconciliation pass fixes.

## Parallelization

Only one real code edit remains (adding `size="lg"` to the Save button), so
this collapses to a single task plus a verification gate plus the same
optional nice-to-have test task — no concurrent waves needed.

1. **Task 1 (alone).** The only remaining implementation change. Touches one
   line of `ReorderExercisesSheet.tsx`.
2. **Task 2 (alone, after Task 1).** Verification gate: typecheck, lint, the
   3 existing indirect spec files.
3. **Task 3 (optional, after Task 2).** Adds direct style assertions. Comes
   last so any breakage it introduces isn't mistaken for a Task 1 regression.

# Tasks: Reorder Exercises Sheet — Title, Button, and Bottom-Gap Fixes

### Task 1 — Full-width Save button (`size="lg"`)

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`
- Changes: Add `size="lg"` to the Save Order `<Button>` inside `ScreenFooter`
  (currently lines 141–146 — verified verbatim against the live file on
  2026-07-30):

  Before:
  ```tsx
          <ScreenFooter testID={`${testID}-footer`}>
            <Button
              testID={`${testID}-save`}
              label="Save Order"
              variant="primary"
              onPress={handleSave}
            />
          </ScreenFooter>
  ```

  After:
  ```tsx
          <ScreenFooter testID={`${testID}-footer`}>
            <Button
              testID={`${testID}-save`}
              label="Save Order"
              variant="primary"
              size="lg"
              onPress={handleSave}
            />
          </ScreenFooter>
  ```

  That's the entire change — one prop added. Do not touch anything else in
  this file: no `useSafeAreaInsets` import, no manual `marginBottom`/
  `marginTop` style, no title edits (see Open Questions items 1–2 above for
  why both are already resolved with zero code changes), no new imports.

- Acceptance criteria:
  - The Save Order `<Button>` has `size="lg"` set explicitly.
  - `testID={`${testID}-save`}`, `label="Save Order"`, `variant="primary"`,
    `onPress={handleSave}` are all unchanged.
  - No `style` prop is added to this `Button` — `ScreenFooter` already owns
    the safe-area-aware bottom padding for its children; a manual
    `marginBottom`/`insets.bottom` addition here would double-pad.
  - No other line in the file changes.

### Task 2 — Verify: typecheck, lint, and full existing test suite

- Files (read/run only, no edits):
  `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx` and
  the 3 existing spec files listed below.
- Changes: None — verification-only, confirming Task 1 landed correctly and
  introduced no regressions.
  1. Run the project's typecheck script (e.g. `pnpm tsc --noEmit` or the
     repo's `pnpm typecheck` — check `package.json` `scripts` for the exact
     name) and confirm it passes with no new errors in
     `ReorderExercisesSheet.tsx`.
  2. Run the project's lint script (e.g. `pnpm lint`) and confirm no new
     lint errors in `ReorderExercisesSheet.tsx`.
  3. Run the 3 existing spec files that indirectly cover this component —
     none assert on style/size, only `testID`s, so they should pass
     unchanged (re-confirmed to exist and still contain the referenced
     assertions on 2026-07-30):
     - `/root/projects/kyro/src/features/workout/__tests__/EditWorkoutScreen.test.tsx`
       — asserts `edit-reorder-sheet-row-{id}-up` press +
       `edit-reorder-sheet-save` press flow (lines ~338–340).
     - `/root/projects/kyro/src/features/routines/__tests__/RoutineEditorScreen.test.tsx`
       — asserts `${testID}-reorder-sheet` renders.
     - `/root/projects/kyro/src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`
       — full file (mounts the active-workout flow that can open this
       sheet).
- Acceptance criteria:
  - Typecheck passes with zero errors attributable to
    `ReorderExercisesSheet.tsx`.
  - Lint passes with zero new warnings/errors attributable to
    `ReorderExercisesSheet.tsx`.
  - All three spec files above pass in full, with no test modifications
    required.

### Task 3 (optional / nice-to-have, not required for acceptance) — Direct style assertions

No dedicated `ReorderExercisesSheet.test.tsx` exists today (re-confirmed
2026-07-30 — still true). Do this task only if direct coverage of the two
style facts below is wanted; skip it otherwise without blocking sign-off.

- Files: `/root/projects/kyro/src/features/workout/ReorderExercisesSheet.tsx`
  (no change), and either a new file
  `/root/projects/kyro/src/features/workout/__tests__/ReorderExercisesSheet.test.tsx`
  or additions to one of the 3 existing spec files in Task 2.
- Changes (if pursued):
  - Assert the save button's rendered style reflects `size="lg"`'s
    full-width behavior — e.g. via `getByTestId('...-save')` and checking
    the flattened style contains `alignSelf: 'stretch'` (per `Button.tsx`,
    `alignSelf: size === 'lg' || fullWidth ? 'stretch' : 'flex-start'`).
    This is the one assertion that actually exercises Task 1's change.
  - Optionally, as a regression guard (not new behavior — already true
    today per Open Questions item 1): assert the header title renders
    centered, e.g. via `getByTestId('...-header-title')` (the fallback
    `testID` `SheetHeader` derives from its own `testID` prop,
    `${testID}-header` → `${testID}-header-title`) and checking the
    flattened style's `textAlign` is `'center'`.
- Acceptance criteria (only if this task is done):
  - New/added assertions pass.
  - No existing test's behavior or assertions are altered — additive only.
  - Explicitly out of scope: any assertion on `ScreenFooter`'s
    `insets.bottom`-driven `paddingBottom`, since Jest's
    `react-native-safe-area-context` mock (`jest/safe-area-context-mock.tsx`)
    returns all-zero insets unconditionally and cannot exercise that logic
    meaningfully — and it's `ScreenFooter`'s own concern, not something this
    PRD's change touches.

## Summary of what requires you (not a dev agent)

The following cannot be verified by an automated agent or this repo's test
suite and require a human on a physical device or simulator (per PRD §8):

1. **Notched-device check (e.g. iPhone 14/15 class), across all 3 real call
   sites** — open the reorder sheet from each of:
   - `ActiveWorkoutScreen.tsx` (active workout ⋯ menu → Reorder Exercises)
   - `EditWorkoutScreen.tsx` (past-workout editor → Reorder Exercises)
   - `RoutineEditorScreen.tsx` (routine editor → Reorder Exercises)

   In each, confirm:
   - Save Order button is fully visible, fully clear of the home-indicator
     gesture bar, with a visible gap beneath it (now provided by
     `ScreenFooter`'s own `insets.bottom + spacing['4']` padding, not a
     manual style on the button).
   - Save Order button spans the full width of the sheet (minus the standard
     horizontal gutter) — this is Task 1's actual change, the one thing in
     this reconciled list that's new/untested on-device.
   - "Reorder Exercises" title is centered and reads as a proper title (this
     is unchanged from what subproject 01 already shipped — just re-confirm
     it still looks right after Task 1 lands).
   - **The sheet itself reaches the very top of the screen with no gap.**
     Updated from the original wording ("Only once PRD A has also landed") —
     **PRD A has landed**: re-checked `src/ui/Sheet.tsx` directly, and
     `DETENT_HEIGHT_RATIO.full` is now `1` (100%, not the `0.9` the original
     PRD documented as the bug), and the sheet's own content wrapper uses
     `paddingTop: isFull ? 0 : spacing['2']` (zero extra padding at the
     `full` detent), with `SheetHeader`'s `safeTop` prop separately handling
     `insets.top` clearance. This should already be fixed — confirm it as
     part of this same on-device pass rather than treating it as
     conditional/future.

2. **Non-notched device/simulator check** — confirm the bottom gap doesn't
   look excessive when there's no home indicator to clear (i.e.
   `insets.bottom === 0`): the button should still show `ScreenFooter`'s flat
   `spacing['4']` (16pt) breathing room, just without the extra inset.

3. **Dark and light theme check** — confirm both themes still render the
   (unchanged) colors correctly on the now-full-width button. No color
   values changed, but worth a glance given the layout change.

Dropped from the original list: the "`useSafeAreaInsets()`-inside-`Modal`
real-device sanity check" item — that risk analysis (PRD §4.6) applied to
this file calling `useSafeAreaInsets()` directly, which it no longer does
(that responsibility now lives entirely inside `ScreenFooter`/`SheetHeader`,
which subproject 01 already shipped and which other already-live sheets
exercise the same way). No separate check needed beyond items 1–3 above.

Nothing else requires human intervention — no data migrations, no
environment/config changes, no new dependencies to install.
