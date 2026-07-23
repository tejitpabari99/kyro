# 02 — Feature Spec: Workout Logging

The core loop. Everything here must be implementable from this doc alone. Data shapes and enums referenced here are defined authoritatively in `05-data-model-and-storage.md`; visual tokens/components in `07-design-system.md`.

Terminology: an **active workout** is a `workouts` row with `state='active'`. A **set row** is one row in an exercise's set table. A set is **checked** when `is_completed=1`. "Placeholder values" are grey values shown in empty inputs (previous performance or routine target).

---

## 1. Starting a workout

**Entry points**
- Workout tab → `Start Empty Workout` (full-width primary button): creates an active workout with no exercises, `start_time = now`, auto title by time of day ("Morning Workout" 4:00–11:59, "Midday Workout" 12:00–16:59, "Evening Workout" 17:00–20:59, "Night Workout" otherwise).
- Routine card → `Start Routine`: creates an active workout pre-populated from the routine — exercises in order, each with the routine's sets as **unchecked** rows carrying target values as placeholders, per-exercise `rest_seconds`, notes, and superset groups; `routine_id` recorded on the workout; title = routine title.
- History → workout detail → ⋯ → `Repeat Workout`: same as routine start but sourced from a past workout.
- Retro-logging: Calendar day → `Log past workout`, or History → `+` → `Log past workout`: opens the same logger but with `start_time` = chosen date 12:00 and the duration stopwatch **paused at 0**; user sets duration/time manually.

**One-active-workout invariant**
- At most one `state='active'` workout may exist (enforced by partial unique index, `05` §3.2).
- Attempting to start a workout while one is active shows an action sheet: **Resume current workout** / **Discard current and start new** (destructive, second confirm) / Cancel.
- On app launch, if an active workout exists, show the minimized bar immediately (see §10).

**Acceptance criteria**
- [ ] Empty start opens logger in < 500 ms with running stopwatch and correct auto-title.
- [ ] Routine start pre-populates exercises, set counts, set types, targets-as-placeholders, rest timers, notes, superset colors; nothing is pre-checked.
- [ ] Starting while active triggers the resume/discard sheet; discard requires a second confirmation.
- [ ] Retro-log flow produces a workout dated on the chosen day with manually set duration.

## 2. Active workout screen anatomy

Top to bottom (component names per `07` §5):

1. **Header bar** — chevron-down (minimize) left; workout title center (tap → inline edit); `Finish` accent pill right.
2. **Meta row** — three stat columns: **Duration** (live mm:ss / h:mm:ss, accent color; tap → duration sheet: edit start date, start time, duration, pause/resume stopwatch), **Volume** (sum per `04` §5.3, display units), **Sets** (count of checked sets).
3. **Exercise cards** in workout order (see §3).
4. **Footer** — primary `+ Add Exercise`; tonal `Settings` (opens workout-settings subset); destructive text `Discard Workout` (confirm dialog: "Discard workout? All entered data will be lost.").

Duration is always computed from wall-clock `start_time` (never an in-memory counter): display = `now − start_time` unless manually overridden or paused (pause stores accumulated offset; see `06` §6.1). Volume and set counters update on every check/uncheck/edit.

**Acceptance criteria**
- [ ] Stopwatch shows correct elapsed time after backgrounding 10 min and after force-quit + relaunch.
- [ ] Editing start time/date/duration updates the meta row and persists.
- [ ] Volume/Sets counters count only checked sets and respect the warm-up-in-stats setting (`§13`).

## 3. Exercise cards

Each exercise card contains:

- **Header row:** 40 pt exercise thumbnail (image or initial-letter placeholder), exercise name in accent color (tap → exercise detail sheet, read-only), ⋯ overflow button.
- **Note row** (if note exists): grey italic text; tap to edit. `Add a Note` lives in the ⋯ menu. URLs in notes render as tappable links.
- **Superset indicator** (if grouped): 3 pt colored bar along the card's left edge + label "Superset A/B/C…" in the group color (§8).
- **Rest timer row:** clock icon + "Rest Timer: 2min 30s" (or "Rest Timer: Off"); tap → wheel picker sheet, Off / 5 s–5 min in 5 s steps up to 1 min then 15 s steps. Value defaults from Settings → Default Rest Timer at the moment the exercise is added; changes here affect only this workout's exercise (and are offered back to the routine via the update prompt, `04` §2.4).
- **Set table** (§4).
- **`+ Add Set`** ghost button: appends a row copying the previous row's type=normal, with placeholders from the previous-values source (§6).

**⋯ menu items:** Reorder Exercises (drag-handle sheet listing all workout exercises) · Replace Exercise (opens picker; replaces template, keeps set count, clears values/placeholders) · Add to Superset / Remove from Superset (§8) · Add Warm-Up Sets (§12) · Add a Note · Rest Timer · Remove Exercise (no confirm; snackbar with Undo, 5 s).

**Adding exercises:** `+ Add Exercise` opens the exercise picker (`03` §3) in multi-select mode with a Superset toggle. Selected exercises append in selection order. If the exercise has prior history, pre-create the same number of set rows as its most recent performance with previous values as placeholders; otherwise one empty `normal` set.

**Acceptance criteria**
- [ ] Adding a previously-logged exercise recreates last session's row count with correct PREVIOUS values.
- [ ] Replace Exercise keeps row count, clears values, and updates PREVIOUS to the new exercise's history.
- [ ] Remove Exercise offers Undo; undo restores the card with all entered values.
- [ ] Reorder persists and PREVIOUS values stay attached to the right exercises.

## 4. Set table

Column layout adapts to exercise type (canonical storage always kg/m/s; display converts per unit settings):

| `exercise_type` | Columns after SET, PREVIOUS |
|---|---|
| `weight_reps` | KG (or LBS) · REPS |
| `reps_only` | REPS |
| `bodyweight_reps` | +KG (optional added weight) · REPS |
| `bodyweight_assisted_reps` | −KG (assistance, entered positive) · REPS |
| `duration` | TIME (mm:ss) |
| `weight_duration` | KG · TIME |
| `distance_duration` | KM (or MILES) · TIME |
| `short_distance_weight` | KG · METERS |

- Exercises flagged `uses_custom_metric` (e.g. stair machine) append a **CUSTOM** numeric column (generic; no unit).
- If RPE tracking is enabled (Settings), an **RPE** column is appended for rep-based types (`weight_reps`, `reps_only`, `bodyweight_reps`, `bodyweight_assisted_reps`).
- Row ends with the **✓ check cell**.

**Cells**
- **SET:** working-set index (1, 2, 3…) or a type badge: `W` warm-up (warning orange), `D` drop set (info blue), `F` failure (danger red) — colors per `07` §2.4. Warm-ups don't consume working-set numbering (W, 1, 2, W, 3 is valid). Tap → set-type menu: Warm Up Set / Normal Set / Failure Set / Drop Set / **Remove Set** (destructive). Type changeable any number of times.
- **PREVIOUS:** grey compact summary of the reference performance for this set index (e.g. `45kg × 9`, `+10kg × 8`, `−20kg × 12`, `1:30`, `5km / 28:00`, `60kg / 20m`), or `—` when none. Tap **autofills** current row's inputs with those values (editable after). Source per §6.
- **Value cells:** boxed numeric inputs, tabular numerals. Empty inputs show grey placeholder = previous value (or routine target when started from a routine and no previous exists). Weight accepts one decimal; reps integer; TIME uses mm:ss entry (typing digits fills seconds→minutes, e.g. "130" → 1:30); distance decimal.
- **RPE cell:** shows value or `—`; tap opens the RPE picker (horizontal selector 6 · 7 · 7.5 · 8 · 8.5 · 9 · 9.5 · 10 with descriptions, plus Clear). Optional per set.
- **✓ cell:** outline square → filled accent with checkmark when done; completed rows tint their background with `accent @ 8%`.

**Check behavior (decision P6):** tapping ✓ commits the row —
1. Any typed values are saved as-is.
2. Any **empty field that shows a placeholder commits the placeholder value**. Exception: rep-**range** targets from routines (`6-8`) are not committable placeholders — reps must be typed (`04` §2.3).
3. Any empty field with no placeholder blocks the check for required fields (row shakes + haptic warning). Required per type: reps for rep-types, duration for time-types, distance+duration for cardio, weight+distance for `short_distance_weight`. Weight of 0 is valid (empty bar/bodyweight). RPE and custom metric never required; +KG on `bodyweight_reps` optional (empty = 0).
4. On success: haptic light tick + optional sound; volume/sets counters update; rest timer starts (§7) unless suppressed; live PR check runs (`04` §5.5); if Smart Superset Scrolling is on and the exercise is in a superset, scroll to the next member (§8).
5. Unchecking a set is allowed anytime before finish; it reverses counters and cancels a running rest timer only if that timer was started by this set.

**Row interactions:** swipe left → red Delete (removes row, renumbers). No confirm; deletion of a checked row updates counters.

**Keyboard flow (the product's soul):**
- Numeric keypad (decimal pad for weight/distance) with an **accessory bar**: `Calculator` button on the left when a weight field is focused and plate calculator is enabled (§11); `Next` on the right.
- `Next` advances weight → reps → (rpe skipped) → next row's weight → … → next exercise's first input; keyboard stays up throughout.
- Tapping ✓ while keyboard is up commits without dismissing the keyboard.
- Duration cells with Inline Timer enabled show a start/stop stopwatch control in the cell sheet: start counts up; stop writes the elapsed seconds into the cell.

**Acceptance criteria**
- [ ] Each of the 8 types shows exactly the columns above; custom-metric and RPE columns appear only when applicable.
- [ ] Tap PREVIOUS autofills; check-with-placeholders commits placeholder values; check with missing required field is blocked with shake + haptic.
- [ ] `130` typed in TIME renders 1:30 and stores 90 s.
- [ ] Set-type changes re-badge and renumber correctly (warm-ups excluded from numbering).
- [ ] Swipe-delete renumbers remaining sets and updates counters.
- [ ] `Next` traverses fields in the specified order across exercises without dismissing the keyboard.
- [ ] Assisted weight entered as `20` displays `−20kg` in PREVIOUS/history and stores 20 in `weight_kg`.

## 5. RPE

- Off by default; toggle in Settings → Workouts → RPE Tracking. Toggling mid-workout adds/removes the column live (values retained when hidden).
- Allowed values exactly: 6, 7, 7.5, 8, 8.5, 9, 9.5, 10 (`05` §2). Stored per set, optional.
- Picker shows helper text (e.g. 10 "Max effort", 9 "1 rep left", 8 "2 reps left", 7 "3 reps left", 6 "4+ reps left"; 0.5 steps interpolate).
- RPE exports/imports via CSV column `rpe`.

**Acceptance criteria**
- [ ] Only the 8 enum values are enterable; Clear removes the value.
- [ ] RPE column appears for the 4 rep-based types only.

## 6. Previous-values source

Setting **Previous Workout Values** = `any_workout` (default) | `same_routine`.

- `any_workout`: PREVIOUS for exercise E, set index i = the i-th **checked non-warm-up** set of E's most recent completed workout containing E. Row-type aware: warm-up rows reference the previous session's warm-up sets by warm-up index.
- `same_routine`: same lookup but restricted to completed workouts with the current workout's `routine_id`. Empty-start workouts fall back to `any_workout` behavior. No match → routine targets (if any) → `—`.
- If the previous session had fewer sets than the current, extra rows show `—` (routine target placeholder still applies if present).

**Acceptance criteria**
- [ ] Switching the setting mid-workout refreshes PREVIOUS columns.
- [ ] Exercise in two routines with different loads shows routine-correct PREVIOUS under `same_routine`.

## 7. Rest timers & notifications

**Start rules:** checking a set starts that exercise's timer, except: timer set to Off; the next set row (same exercise, next index) is type `dropset` (no rest within a drop); or the checked set is the exercise's last row **and** the next superset member has its own timer flow (superset: timer still starts — the pill guides rest before the next member's set; suppression applies only to the immediate-next-row-dropset rule).

**Mechanics** (implementation in `06` §6.2):
- Timer state = absolute `ends_at` timestamp (wall clock), persisted alongside the active workout (kv storage per `06` §4). Surviving backgrounding/kill: on resume, remaining = `ends_at − now` (≤ 0 → finished silently).
- Starting a timer schedules a **local notification** at `ends_at` ("Rest over — set 3 of Bench Press") with the chosen timer sound. `−15s`/`+15s`/`Skip` and set-uncheck cancel and reschedule/remove the pending notification.
- Only one timer runs at a time; starting a new one replaces the old.

**UI**
- **Timer pill** docked above the tab bar / keyboard: circular progress + remaining time + `−15s · +15s · Skip`. Tap pill → full-screen timer sheet (big countdown ring, same controls).
- In minimized mode, the mini-bar shows the countdown (§10).
- Completion in-foreground: chime (per sound settings) + haptic; pill collapses.

**Sounds setting:** timer sound choice (default / bell / beep / none) + volume (off/low/normal/high) for timer, set-check, and notifications independently.

**Acceptance criteria**
- [ ] Timer fires a notification with sound while app is backgrounded and screen locked.
- [ ] ±15 s updates both the pill and the pending notification (verify by locking immediately after adjust).
- [ ] Skip cancels the notification; no ghost notification later.
- [ ] Checking a set whose next row is a drop set starts no timer.
- [ ] Timer state survives force-quit: relaunch within the window shows correct remaining time; relaunch after `ends_at` shows no timer and no duplicate notification.

## 8. Supersets

- Create: ⋯ → `Add to Superset` → sheet lists other exercises in the workout (checkboxes) → confirm groups them under the lowest involved position; or picker's Superset toggle when adding multiple exercises at once. Groups may have 2+ members (circuits).
- Representation: nullable integer `superset_id` per workout exercise, unique per group within the workout (0, 1, 2…). Labels A, B, C… map to ids in first-appearance order; colors cycle the 6-color superset palette (`07` §2.5).
- Remove: ⋯ → `Remove from Superset` (group of 1 dissolves automatically).
- **Smart Superset Scrolling** (setting, default on): after checking a set in a grouped exercise, auto-scroll to the next member (cycling) that still has unchecked sets.
- Supersets persist to routines and export via CSV `superset_id`.

**Acceptance criteria**
- [ ] 3-exercise circuit: A/B/C badge + one shared color; scrolling cycles A→B→C→A skipping completed exercises.
- [ ] Removing the second-to-last member dissolves the group entirely.
- [ ] Superset ids survive save, edit, CSV round-trip.

## 9. Notes

- **Exercise note:** free text, multiline, saved on the workout exercise; shown during logging; visible in history detail. Notes from routines pre-fill each run.
- **Workout note (description):** edited on the finish screen or via title tap sheet; shown on history cards/detail.

**Acceptance criteria**
- [ ] Routine note appears every run; editing it mid-workout affects only this workout (routine unchanged unless update-prompt accepted).

## 10. Minimize, resume & crash persistence

- Chevron-down (or swipe-down on the header) collapses the logger to a **mini-bar** pinned above the tab bar on every screen: workout title + live elapsed time; when a rest timer runs, remaining time replaces elapsed (accent-colored). Tap → re-expand. Apple-Music-mini-player pattern.
- The rest of the app is fully navigable mid-workout; destructive collisions (e.g. deleting a routine in use) are allowed — the active workout keeps its copy.
- **Durability:** every mutation (check, value edit, add/remove set/exercise, reorder, note, timer change) writes through to SQLite synchronously with UI update (`06` §5.3). No timer-based autosave; the DB is always current.
- On relaunch: `state='active'` workout found → restore Zustand store from DB → show mini-bar (not the full logger) → stopwatch correct from `start_time`.

**Acceptance criteria**
- [ ] Force-quit mid-typing loses at most the single uncommitted text field, nothing else.
- [ ] Mini-bar shows on all 4 tabs; timer countdown mirrors the pill.
- [ ] Device restart mid-workout → relaunch resumes with correct duration and all checked sets.

## 11. Plate calculator

- Setting-gated (off by default). When on and a weight input is focused, `Calculator` shows in the keyboard accessory bar.
- Sheet: target weight (pre-filled from the focused field), bar selector — **Barbell 20 kg / EZ Bar 7.5 kg / Short Bar 10 kg** (bar weights editable in settings), plate inventory from Settings → Plate Calculator → Available Equipment (default kg: 25/20/15/10/5/2.5/1.25 ×∞; default lb: 45/35/25/10/5/2.5; counts editable, custom plates addable).
- Output: visual bar diagram with plates per side, largest-first greedy fill. If exact load impossible: show closest achievable ≤ and ≥ weights with a one-tap "use this value" writing back to the input.
- Pure function `platesFor(target, bar, inventory) → {perSide[], achieved}` — unit-tested (`08` §4.4).

**Acceptance criteria**
- [ ] 102.5 kg on 20 kg bar with default inventory → 25+15+1.25 per side.
- [ ] Impossible target shows nearest achievable options; tapping writes value into the set input.

## 12. Warm-up calculator

- Enabled via Settings → Workouts → Warm-up Calculator. Formula = ordered list of `{percent_of_working_weight, reps}`; default (decision P8): bar × 10 (percent 0 = empty bar), 40% × 8, 60% × 5, 80% × 3. Add/remove/edit rows; `Reset to Default`.
- Rounding preferences: plate-loaded increment (default 2.5 kg / 5 lb) and dumbbell increment (default 2 kg / 5 lb); rounding to nearest increment, minimum = bar weight for barbell exercises.
- Usage: exercise ⋯ → `Add Warm-Up Sets` → enter working weight (pre-filled from first normal set's value/placeholder) → generated `W` rows inserted above existing sets, values pre-filled and **unchecked**.
- Pure function `warmupSets(workingWeight, formula, rounding) → rows[]` — unit-tested.

**Acceptance criteria**
- [ ] Default formula on 100 kg barbell → 20×10, 40×8, 60×5, 80×3 (2.5 kg rounding).
- [ ] Generated rows are type `warmup`, sit above existing rows, don't disturb working-set numbering.

## 13. The 12 workout settings

All live under Settings → Workouts; each is specified where used: 1 Sounds (§7) · 2 Default Rest Timer (§3) · 3 Previous Workout Values (§6) · 4 Warm-up Calculator (§12) · 5 Warm-Up Sets in stats (`04` §4/§5: when off, warm-ups excluded from volume/sets stats; **always** excluded from PRs) · 6 Keep Awake During Workout (screen never sleeps while logger open, `06` §6.3) · 7 Plate Calculator (§11) · 8 RPE Tracking (§5) · 9 Smart Superset Scrolling (§8) · 10 Inline Timer (§4 keyboard flow) · 11 Live PR Notification (`04` §5.5) · 12 Units (kg/lb, km/mi — apply instantly app-wide including mid-workout; storage stays canonical).

**Acceptance criteria**
- [ ] Switching kg→lb mid-workout converts displayed values and placeholders; checked data unchanged in DB; switching back shows original values exactly (no drift).

## 14. Finish flow

1. Tap `Finish`. If any unchecked set rows exist → alert: "Uncompleted sets — N sets are not marked complete and will be discarded." [Cancel / Finish anyway].
2. **Save screen (sheet):** editable title, description, start date/time + duration fields, computed stats row (Duration · Volume · Sets), **Records earned** list (trophy rows, from PR evaluation `04` §5), primary `Save Workout`.
3. On save: delete unchecked set rows (and exercises left with zero sets); set `end_time` (= start + duration override if edited, else now); `state='completed'`; cancel any pending rest-timer notification; recompute PR cache for affected exercises; navigate to a summary/detail view.
4. **Update-routine prompt:** if started from a routine and materially changed (any of: exercise set added/removed, exercise added/removed/replaced/reordered, target-relevant value differs from routine target, rest timer changed, superset changed) → dialog "Update routine? Your workout differs from *{routine}*." [Keep original / Update routine] — update writes the workout's structure back as new targets (`04` §2.4).
5. Empty finish (zero checked sets) → offer Discard instead of save.

**Acceptance criteria**
- [ ] Unchecked sets are absent from saved workout, history, stats, and CSV export.
- [ ] Records-earned list matches recomputed PRs post-save.
- [ ] Update prompt appears only when materially changed; "Keep original" leaves the routine byte-identical.
- [ ] Rest-timer notification never fires after finishing.

## 15. Editing & deleting past workouts

- History detail ⋯ → **Edit Workout**: reopens the full logger against the saved workout (all sets checked, no stopwatch, no rest timers). Editable: everything. `Save` replaces content, bumps `updated_at`; PRs/stats/streaks recompute for affected exercises (`04` §5.6). ⋯ also offers **Save as Routine**, **Repeat Workout**, **Delete** (confirm; soft delete per `05` §3.2; recompute follows).
- Editing while another workout is active is allowed (editor is a separate modal; the active workout is untouched).

**Acceptance criteria**
- [ ] Raising an old workout's weight above the current PR makes that historical set the PR (trophy moves; charts update).
- [ ] Deleting the PR-holding workout reassigns records to the next-best historical set.
- [ ] Edit flow cannot corrupt the one-active-workout invariant.

## 16. Edge cases (consolidated)

| # | Case | Behavior |
|---|---|---|
| 1 | App killed during rest timer | Notification still fires (scheduled with OS); resume shows correct remaining/none. |
| 2 | Time zone change / DST mid-workout | All times stored UTC epoch ms; duration unaffected. |
| 3 | Workout crossing midnight | Belongs to `start_time` calendar day (calendar, streaks, CSV). |
| 4 | Exercise deleted from library while in active workout | Impossible for built-ins; custom exercise delete is blocked if referenced (offers archive instead, `03` §5). |
| 5 | 0-weight weighted set | Valid (empty-bar work); volume adds 0; excluded from weight PRs but counts toward most-reps. |
| 6 | Duplicate exercise twice in one workout | Allowed; PREVIOUS matches by occurrence order (1st card ↔ 1st occurrence last session, etc.). |
| 7 | > 99 sets or absurd values | Soft caps: warn > 50 sets/exercise; inputs clamp weight ≤ 1000 kg, reps ≤ 1000, duration ≤ 24 h, distance ≤ 1000 km. |
| 8 | Phone storage full during logging | SQLite write failure surfaces a blocking error with retry; no silent loss (`06` §9). |
| 9 | Notification permission denied | Timer pill still works in-app; one-time inline warning on first timer start with link to iOS Settings. |
| 10 | Unit switch after logging in other unit | Storage canonical kg/m/s; display converts with 0.5-step-safe rounding (`05` §5); placeholders convert too. |
