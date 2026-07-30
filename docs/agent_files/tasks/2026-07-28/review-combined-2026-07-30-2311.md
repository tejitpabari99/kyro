# Review — 2026-07-30 23:11 — Combined cross-sub-project integration review

Scope: `git diff main...HEAD -- '*.ts' '*.tsx'` (109 files, all 10 sub-projects composed
together at current HEAD). This is a SEPARATE, additional review layered on top of the 10
individual per-sub-project `dev-review` passes already done and committed — it does not
re-litigate any finding that was already in-scope for a single sub-project's own isolated
commit range. Its job is integration: interactions between sub-projects that touched the
same files, whether HEAD reads as one coherent product, and whether earlier findings are
still relevant given later sub-projects' changes.

Personas: Bug Hunter, Security, Architect (each briefed explicitly for cross-project
integration review, not re-review of in-scope diffs; each given the cross-touched-file
list below plus two orchestrator-pre-verified facts to confirm or refute).

## Part 1 — The 10 sub-projects and their individual verdicts

| # | Sub-project | Individual verdict | Note |
|---|---|---|---|
| 01 | sheet-header-footer-foundation | NEEDS_CHANGES | Must-fix: `NoteEditSheet.tsx` `ScreenFooter` placement bug — **MOOT, see Part 2** |
| 02 | active-workout-footer-buttons | PASS | — |
| 03 | reorder-exercises-sheet-fixes | PASS | non-blocking stray-comment note only |
| 04 | exercise-picker-settings-icon | PASS | — |
| 05 | exercise-detail-fullscreen-summary | PASS | — |
| 06 | notes-rest-timer-inline | NEEDS_CHANGES | Must-fix: `InlineNoteField.commit()` unconditional `onSave` — **STILL OPEN, see Part 2** |
| 07 | history-routines-list-decarding | PASS | — |
| 08 | warmup-set-menu-cleanup | PASS | see new integration finding in Part 3 |
| 09 | tabs-navigation-restructure | PASS | — |
| 10 | active-workout-visual-parity | PASS | see new integration finding in Part 3 |

## Part 2 — Disposition of the two known must-fix findings, at combined HEAD

**01's `NoteEditSheet.tsx` finding: MOOT (resolved by deletion).**
Confirmed: `test -f src/features/workout/NoteEditSheet.tsx` → file does not exist.
`git log --oneline --diff-filter=D -- '**/NoteEditSheet.tsx'` → deleted in `bf7f18d`
("06-notes-rest-timer-inline: Task 9 — Mount KeyboardDoneBar in RoutineEditorScreen"),
which is part of sub-project 06's replacement of the `NoteEditSheet` modal with the
always-visible `InlineNoteField.tsx`. The buggy code no longer exists anywhere in the
tree. No action needed. (Process note, not a defect: 01 spent a dedicated retrofit task
wiring `SheetHeader`/`ScreenFooter` into a component that 06 deleted two sub-projects
later — wasted effort in hindsight, not a correctness problem.)

**06's `InlineNoteField.tsx` finding: STILL OPEN, carries forward as a live must-fix.**
`git log --oneline --all -- src/features/workout/InlineNoteField.tsx` shows exactly one
commit (`2a571bd`, 06's own) — no other sub-project has touched this file since. Read at
current HEAD and reconfirmed: `src/features/workout/InlineNoteField.tsx:41-45`'s
`commit()` still calls `onSave(trimmed.length > 0 ? draft : null)` unconditionally on
every blur, with no comparison against the value the field was seeded with. Corroborated
independently by the Bug Hunter persona in this pass. Downstream consequence unchanged:
`src/features/routines/RoutineExerciseCard.tsx:189-190`'s `handleSaveNote` routes every
call through `mutate(...)` with no equality check, and
`src/features/routines/RoutineEditorScreen.tsx:208-211`'s `mutate` unconditionally calls
`setDirty(true)` — so opening a routine exercise's note just to look at it, then tapping
away, still marks the routine dirty and triggers a false "Discard changes?" prompt on
Cancel (`RoutineEditorScreen.tsx:220-228`).

## Part 3 — New findings, integration-level (this pass only)

### Must-fix

- **[Architect, elevated from orchestrator triage]** `app/(tabs)/profile/settings/warmup-calculator.tsx` (whole file; linked from `app/(tabs)/profile/settings/index.tsx:558-560`, "Warm-up Calculator" row) — orphaned settings screen whose only reason to exist was deleted by sub-project 08, but the screen itself was never touched or reconsidered → users can still open Settings → Warm-up Calculator, add/edit/remove formula rows, change rounding increments, and hit "Reset to Default" — all of it persists to `settings.warmup_calc`, which as of 08's deletion of `AddWarmUpSetsSheet.tsx` + `domain/warmup-calc.ts` has **zero remaining production readers** (confirmed by `grep -rn "warmup_calc" src/ app/`: only `settings-schema.ts` (definition) and this file itself (read/write) remain). The file's own header doc comment (lines 4-7) still asserts `` `AddWarmUpSetsSheet` ... is the consumer of whatever this screen writes `` — a component that no longer exists anywhere in the tree. 08's own PRD (§9 Open Questions) explicitly reasoned about `settings.warmup_calc` as an inert *schema field* ("costs nothing to leave... unread by any production code path") and judged that acceptable — but that reasoning never considered that a fully live, linked, tested (`__tests__/warmup-calculator.test.tsx`) settings UI sits on top of the field, presenting fully-functional-looking controls that now do nothing. This is exactly the kind of whole-product-coherence gap that's invisible from any single sub-project's own diff (08's diff never touches `warmup-calculator.tsx`) and only surfaces when reading HEAD as one product. Two personas (Architect, independently corroborated by orchestrator) confirm.
  Fix direction: either remove the "Warm-up Calculator" settings row + route (matching the product decision that killed the underlying feature), or explicitly re-wire it to a real consumer if the feature is meant to survive in some form; at minimum, fix the false doc comment so a future reader isn't misled.

### Notes (non-blocking)

- **[Bug Hunter]** `src/features/workout/ActiveWorkoutScreen.tsx` footer vs. `src/features/workout/TimerPill.tsx`'s new bottom panel (02 + 10 composition) — 02 (`7f20166`) moved `ActiveWorkoutScreen`'s Add Exercise/Settings/Discard footer to be the last child *inside* the scrollable content (not a pinned sibling after the `ScrollView`). Sub-project 10's own PRD, when justifying that the new full-width `TimerPill` panel is allowed to visually sit on top of/near that footer while resting, reasoned from an assumption that the footer is "a plain, non-scrolling flex sibling... a fixed footer, not part of the scrollable content" — true when 10's PRD was written, no longer true once composed with 02's already-landed change. Net effect: for short workouts the footer no longer sits glued to the bottom the way 10's sign-off assumed (so the panel may not reliably sit "over" it as described), and for long/overflowing workouts scrolled to the end, the panel can now overlap the last exercise card's trailing content, not just the footer. Not a functional break — footer buttons remain reachable by scrolling, or by letting the timer run out/skip — so not called must-fix, but the written rationale in 10's PRD no longer matches the merged reality and is worth a manual on-device check.
- **[Bug Hunter/orchestrator, downgraded from suspected must-fix]** `src/features/workout/TimerPill.tsx:411-452` — the full-screen rest-timer `Sheet` (`detent="full"`) nests `ScreenFooter` as a sibling positioned after `sheetContent`, which itself has `flex: 1` — on its face the identical "ScreenFooter must never be a sibling after a separate flex:1 container" anti-pattern that was the actual bug in the (now-deleted) `NoteEditSheet.tsx`, introduced by the same sub-project (01, commit `59a3963`) and never touched by 10's later redesign of this file's *outer* bottom panel. On independent verification (Bug Hunter persona + orchestrator), this does **not** manifest the failure mode `ScreenFooter.tsx`'s doc comment describes: `detent="full"` sheets are always exactly `windowHeight` tall regardless of content (confirmed in `Sheet.tsx`), so there's no variable-length-content "dead gap that grows/shrinks" scenario — `sheetContent`'s `flex:1` + `justifyContent:'center'` is a deliberate centering of a fixed-size block (ring + one button row) between a fixed header and a fixed footer, not an accidental one. Downgraded from must-fix to a documentation/lint-consistency nit: worth a one-line comment in `ScreenFooter.tsx` carving out the "always-full-height sheet" case, or restructuring `TimerPill.tsx` to match the letter of the contract for consistency's sake, but no user-visible bug results.
- **[Architect]** `src/features/workout/TimerPill.tsx` — `TimerControlsRow`'s doc comment (still says it's "shared by the compact pill and the full-screen sheet" with "same controls") is now only half true: 10 introduced a separate, panel-only `RestTimerPanelControls` (Skip filled blue, order −15/+15/Skip) while the full-screen sheet still uses the original `TimerControlsRow` (all gray, order −15/Skip/+15) — the same timer now presents two different button treatments a user sees seconds apart (tap panel → open sheet). 10's own PRD reasoned through and deliberately scoped this split (one of its stated reasons — "PRD A/`ScreenFooter`/`ButtonRow fullWidth` isn't implemented yet" — is now stale, since 01 is implemented in the combined tree and this same file already imports `Button`/`ScreenFooter`/`SheetHeader`). Not a functional bug; worth a follow-up pass to reconcile the two control-row styles and refresh the stale doc comments.
- **[Architect]** `src/features/workout/ReorderExercisesSheet.tsx:~93-95` — the comment referencing a "§4.5 corollary" of 03's PRD for a not-yet-added Cancel/dismiss control is now permanently dangling: 03 has landed, its real §4.5 is unrelated content, and no such corollary exists or will arrive. Already flagged as a non-blocking note in 03's own individual review; now confirmed the promised follow-up will never happen since 03 is done. Still non-blocking (swipe/backdrop dismiss already works via `Sheet.tsx`), but worth deleting the comment.
- **[Architect, process note]** Sub-project 01 spent a dedicated task (commit `59a3963`/`c0e1227`-equivalent effort) retrofitting `SheetHeader`/`ScreenFooter` into `NoteEditSheet.tsx`, which sub-project 06 deleted entirely two sub-projects later. Not a defect in the current tree (see Part 2), but a coordination gap worth flagging for future batches of parallel/sequential sub-projects: no shared "who's deleting what" checkpoint existed between 01 and 06.

## Security

**PASS, zero findings.** Full persona report: pure local-data app (SQLite + Zustand, no
network, no auth), `package.json` has zero diff vs. `main`, all new imports
(`react-native-reanimated`, `react-native-safe-area-context`, `lucide-react-native`,
`expo-router` hooks) are pre-existing project dependencies. `router.push(`/exercise/${exercise.id}`
as never)` (05+09 composition) uses a SQLite-originated id, never free-typed user input —
no route-injection concern. `InlineNoteField`'s new mount sites all route auto-linked note
text through the same `splitTextWithUrls` (only matches explicit `http(s)://`, no
`javascript:`/`data:` scheme risk). Exercise-picker data scoping (flagged as a note in 05's
individual review) still holds — `RoutineEditorScreen.tsx` and `ActiveWorkoutScreen.tsx`
each construct and pass their own `exerciseRepository`, no cross-context leakage. The
orphaned `warmup_calc` setting (Part 3) has no security dimension — purely UX/architecture.

## Verdict: NEEDS_CHANGES

Worst-of-three: Architect found a real, verified must-fix (orphaned `warmup-calculator.tsx`
settings screen). Bug Hunter corroborated that 06's `InlineNoteField.tsx` must-fix is still
open and unaddressed at HEAD. Security is a clean PASS with no integration-level concerns.
Neither must-fix is a data-loss/exploit/broken-core-behavior severity (no BLOCK), so this is
NEEDS_CHANGES rather than BLOCK.

## Combined must-fix list (carried-forward + new)

1. **[Carried forward, still open]** `src/features/workout/InlineNoteField.tsx:41-45` —
   `commit()` calls `onSave` unconditionally on blur even with no change, spuriously
   dirtying the routine editor. (Originally found by 06's individual review; unaffected by
   any later sub-project; still live at HEAD.)
2. **[New, this pass]** `app/(tabs)/profile/settings/warmup-calculator.tsx` (+ its
   settings-index entry point) — fully live, linked, tested settings screen editing
   `settings.warmup_calc`, a value with zero remaining production readers after 08 deleted
   its only consumer (`AddWarmUpSetsSheet.tsx` / `domain/warmup-calc.ts`). Doc comment
   still names the deleted component as "the consumer." Remove or re-wire.

## Next step

Route both must-fix items back to `dev-code`:
- Item 1 belongs to 06's fix loop (already identified there; simply hasn't been picked up
  yet — no other sub-project depends on or blocks this fix).
- Item 2 is a new gap that falls between sub-project 08 (which deleted the consumer) and
  no sub-project owns the settings-screen side — needs either a follow-up task under 08 or
  a new small sub-project ("remove/disable orphaned Warm-up Calculator settings screen").

Re-run `dev-review` (or at minimum re-check this combined diff) once both are addressed —
specifically re-verify `RoutineEditorScreen`'s `dirty` state stays `false` after opening
and closing a note with no edit (item 1), and re-verify `grep -rn "warmup_calc" src/ app/`
shows no remaining live UI surface once item 2 is resolved.
