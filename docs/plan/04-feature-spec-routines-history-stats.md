# 04 — Feature Spec: Routines, History, Statistics, PRs, Measurements

Data shapes per `05`; components/tokens per `07`; logging interactions per `02`.

---

## 1. Workout tab (routines hub)

Layout (default tab): "Workout" large title → **Quick Start** section: full-width primary `+ Start Empty Workout` → **Routines** section header with folder-plus icon (new folder) and `+` (new routine) → routine list grouped by folder.

- Folders render as collapsible headers (chevron, title, routine count, ⋯ menu: Rename / Reorder / Delete). Ungrouped routines live in the implicit "My Routines" section (`folder_id = null`), always last.
- **Routine card:** title; grey preview line of exercise names comma-joined, 2-line clamp; ⋯ menu; full-width tonal `Start Routine` button on the card's bottom edge.
- ⋯ menu (routine): Start Routine · Edit · Duplicate · Move to Folder (sheet of folders + "My Routines") · Reorder · Delete (confirm).
- **Reorder mode:** drag handles; routines reorder within/between folders; folders reorder among themselves. Order persists via `index` columns.
- Folder delete: choice dialog — "Delete N routines too" (destructive) or "Keep routines" (moves them to My Routines).
- Empty state: illustration + "Create a routine or start an empty workout" with both CTAs.
- No limits: unlimited routines and folders (D4/Pro-ungating).

**Acceptance criteria**
- [ ] Create/rename/delete folder; collapse state persists across launches.
- [ ] Drag routine between folders persists; order stable after relaunch.
- [ ] Folder delete offers both paths and both work.

## 2. Routines

### 2.1 Routine editor

Full-screen modal; `Cancel` left (confirm if dirty), title field, `Save` right (disabled until title non-empty and ≥ 1 exercise… exception: zero-exercise routines are allowed but warned).

Body mirrors the logger card layout with **target semantics** (no PREVIOUS autofill-commit, no checkmarks, no stopwatch):

- Per exercise: name header, note, rest-timer row (`rest_seconds`; default from settings), superset controls, set table.
- Set table columns per exercise type (same as `02` §4) minus ✓; SET cell still cycles set types (warm-up/normal/failure/dropset targets allowed).
- **Rep targets:** REPS cell accepts a single value; tapping the REPS column header (or long-press the cell) toggles **rep range** mode for that set → two inputs `from`–`to` (e.g. 6–8), stored as `rep_range_start/end`; single value stores `reps`. Range shown as "6-8" in the logger's placeholder.
- Target weight/duration/distance optional per set. PREVIOUS column shows the exercise's last logged values as reference (read-only, no tap action).
- `+ Add Set`, swipe-delete, ⋯ menu (reorder/replace/superset/note/rest timer/remove) — same as logger.

### 2.2 Routine lifecycle

- **Create:** from editor; from history (`Save as Routine` — copies exercises, set counts, set types, achieved values as targets, notes, rest timers, supersets); by **Duplicate**.
- **Edit:** anytime; edits don't affect past workouts. If the routine is the source of the current active workout, the active workout is unaffected.
- **Delete:** confirm dialog; past workouts keep their `routine_id` (FK kept via soft reference — display "(deleted routine)" where needed; `05` §3.3).

### 2.3 Start-workout flow

`Start Routine` → active workout per `02` §1. Targets become placeholders. **Decision:** a rep-range placeholder (`6-8`) never auto-commits on check — a range is a target, not a value, so reps must be typed. Weight targets and single-value rep targets do auto-commit per P6 (`02` §4).

### 2.4 Update-routine prompt

On finish of a routine-started workout, compute a diff vs the routine (material changes listed in `02` §14.4). If non-empty → prompt. **Update routine** applies:
- Exercise list/order/superset/rest/notes ← workout's final structure (checked exercises only).
- Per-set targets ← the workout's checked sets' actual values (weight/reps/duration/distance/type). Rep-range targets are preserved as ranges if the achieved reps fall inside the existing range (only weight target updates); otherwise the range collapses to the achieved value.
- `updated_at` bumped. "Keep original" changes nothing and is not re-asked for this workout.

**Acceptance criteria**
- [ ] Rep-range entry (6–8) in editor displays as `6-8` target placeholder in logger and never auto-commits reps.
- [ ] Save as Routine from history reproduces structure incl. supersets and rest timers.
- [ ] Update-routine correctly rewrites targets from actuals; in-range reps preserve the range; declining leaves routine untouched.
- [ ] Deleting a routine leaves its historical workouts intact and renderable.

## 3. History & calendar

### 3.1 History tab

- Reverse-chron list of workout cards (paged 20): title; relative date line ("Yesterday", "Tue, 15 Jul"); stats strip Duration · Volume · 🏆 N PRs (trophy omitted when 0); exercise summary lines "3 × Bench Press (Barbell) — best 80kg × 8"; card tap → workout detail.
- Header: `Calendar` icon button (→ §3.2), `+` menu (Log past workout).

**Workout detail:** read-only logger layout — meta stats, exercise cards with all sets (type badges, values, RPE), trophy badge on record-setting sets, notes. ⋯ → Edit Workout / Repeat Workout / Save as Routine / Export CSV (single workout) / Delete.

### 3.2 Calendar

- Month pager (swipe, ± chevrons); day cells: accent-filled dot/circle on workout days; today outlined; tap day → sheet listing that day's workouts (tap-through to detail) + `Log past workout` on empty days.
- **Streak header:** "🔥 N-week streak" = consecutive calendar weeks (respecting first-day-of-week setting) with ≥ 1 completed workout, counting backwards from the current week; current week counts if it has a workout or is still in progress (streak shows but doesn't break until the week ends workoutless).
- Multi-workout days show a small ×2 badge.

**Acceptance criteria**
- [ ] Cards show accurate volume/PR counts; list virtualizes smoothly with 1000+ workouts (imported history).
- [ ] Workout crossing midnight appears on its start date only.
- [ ] Streak respects first-day-of-week changes (recomputes; e.g. Sunday vs Monday weeks).
- [ ] Deleting a workout updates list, calendar dots, and streak immediately.

## 4. Statistics

### 4.1 Dashboard (Profile → Statistics)

Stacked chart cards, each with a time-range segmented control **3M / 1Y / All** (all free — Pro-ungated):

1. **Workouts per week** — bar chart; optional weekly goal line (settings: workouts/week goal, default off; goal-met bars in accent, others muted).
2. **Aggregate trend** — metric switcher Duration | Volume | Reps; weekly buckets (monthly when range = All and span > 2 y); line/bar per `07` §7.
3. **Muscle distribution** — sets per muscle group (checked, non-warm-up unless warm-up-stats on; primary muscle of the exercise; secondary muscles count 0.5) — horizontal bar breakdown for the selected range: 7D / 30D / 3M / 1Y / All.
4. **Sets per muscle group per week** — stacked weekly bars, top-8 muscle groups + Other.

Summary tiles above charts: total workouts, total volume, total time, current streak.

### 4.2 Computation rules

- Weekly buckets respect **first day of week** setting.
- Volume (canonical kg): per set, by type — `weight_reps`, `weight_duration`, `short_distance_weight`: `weight_kg × max(reps, 1)`; `bodyweight_reps`: `weight_kg (added) × reps`; all others contribute 0 (P7).
- Warm-up sets: excluded from volume/sets/reps stats when "Warm Up Sets in stats" is off (default off); **always** excluded from PRs and set records.
- Only checked sets of completed workouts count anywhere.
- Duration stat = `end_time − start_time` (with manual overrides already folded into those fields).

### 4.3 Per-exercise charts

In exercise detail (`03` §3): metrics per type —
- Rep/weight types: **Heaviest Weight** (max weight_kg per workout), **Estimated 1RM** (max Epley per workout, reps ≤ 10), **Best Set Volume** (max weight×reps per workout), **Session Volume** (sum weight×reps per workout), **Total Reps** (sum reps per workout).
- `duration`/`weight_duration`: Longest Duration, Total Duration (+ Heaviest Weight for weighted).
- `distance_duration`: Total Distance, Total Duration, Best Pace (min distance/duration per workout, displayed min/km or min/mi).
- `short_distance_weight`: Heaviest Weight, Total Distance.

One point per workout date; tap point → tooltip with value + date; ranges 3M/1Y/All.

**Acceptance criteria**
- [ ] Bodyweight pull-up +10 kg × 8 contributes 80 kg volume; assisted and reps-only contribute 0.
- [ ] Warm-up toggle flips dashboard numbers live but never changes Records tabs.
- [ ] First-day-of-week switch re-buckets weekly charts.
- [ ] All ranges perform < 300 ms compute on 5 years of history (indexed queries, `05` §4).

## 5. Personal records (PR) system

### 5.1 Record types (per exercise)

| Record | Applies to types | Definition (checked, non-warm-up sets) |
|---|---|---|
| Heaviest Weight | weight-bearing types | max `weight_kg` |
| Best Estimated 1RM | `weight_reps` | max Epley `w × (1 + reps/30)`, `1 ≤ reps ≤ 10`; reps=1 → w |
| Best Set Volume | `weight_reps`, `bodyweight_reps` | max `weight_kg × reps` |
| Most Reps | rep types | max `reps` |
| Longest Duration | duration types | max `duration_seconds` |
| **Set Records** | `weight_reps`, `bodyweight_reps` | per rep count 1–10 and "10+" bucket: max weight at exactly that rep count (10+ = reps ≥ 10 bucket keyed as 10+) |

`bodyweight_reps` records use **added** weight; `bodyweight_assisted_reps` tracks Most Reps and *least assistance* is shown informationally on Records tab (min weight_kg), not as a trophy type.

### 5.2 Derived, never stored (P10)

Records are **query results over history**, held in a per-exercise in-memory cache (`RecordsService`, `06` §4.4) invalidated whenever any workout containing that exercise is created/edited/deleted (incl. CSV import: bulk invalidate all). No `prs` table exists. Trophy badges in history views are computed by asking, per set: "was this set a record *at save time relative to all history*?" — implemented as: a set shows a trophy for record type R iff it strictly beats the best value of R among all **earlier** sets (by workout start_time, then set order). This makes badges stable and edit-consistent.

### 5.3 Tie & edge rules

- Strictly-greater beats; equal does not re-award.
- Weight comparisons in canonical kg with 0.001 tolerance (unit-conversion float safety).
- Sets with weight 0 excluded from weight-based records; reps 0 / duration 0 excluded everywhere.
- Failure and dropset sets are eligible (only warm-ups are excluded).

### 5.4 Records surfaces

- Exercise detail → Records tab (`03` §3).
- Finish/save screen: "Records earned" list = record types this workout's sets newly hold.
- Workout detail: trophy icon on record-defining sets with record-type label on tap.
- History cards: "🏆 N PRs" where N = count of (set, record-type) awards in that workout.

### 5.5 Live PR banner

Setting-gated (default on). On checking a set in the active workout, evaluate §5.1 against history (excluding the active workout's own earlier sets? **No** — including them: beating your own set from 2 minutes ago is not a new PR vs history; the comparison baseline is all completed history **plus** already-checked sets of the current session). If a record is beaten: non-blocking banner slides from top: trophy icon + "Heaviest Weight PR — 102.5 kg" (multiple types combine into one banner), accent-tinted, auto-dismiss 3 s, success haptic. Unchecking the set removes its contribution (a subsequent equal set would re-trigger).

### 5.6 Retroactive recompute

On any workout create/edit/delete/import: invalidate caches for affected exercises; all surfaces (§5.4) re-derive on next render. Because badges are computed relative to earlier history (§5.2), editing an old workout automatically re-flows which later sets hold trophies. Test cases in `08` §4.1 are the contract.

**Acceptance criteria**
- [ ] Checking 102.5 kg with previous best 100 shows live banner and post-save records list.
- [ ] Editing an old workout to 105 kg moves Heaviest Weight trophy to it; the newer 102.5 workout's badge disappears.
- [ ] Deleting the 105 workout restores 102.5 as PR everywhere.
- [ ] Set record table shows best weight per rep count 1–10, 10+ bucketed.
- [ ] Warm-up set heavier than any working set never awards a PR.
- [ ] Second identical-weight set same session does not banner.

## 6. Body measurements & progress photos

### 6.1 Measurements

17 fields (canonical units): `weight_kg`, `fat_percent`, `lean_mass_kg`, and cm-family `neck`, `shoulders`, `chest`, `left_bicep`, `right_bicep`, `left_forearm`, `right_forearm`, `abdomen`, `waist`, `hips`, `left_thigh`, `right_thigh`, `left_calf`, `right_calf`. **Keyed by date — one entry per day; saving again upserts** (merge non-null fields; explicit clear per field supported).

- **Measures home** (Profile → Measures): list of measurement types showing latest value + delta vs previous + 90-day sparkline; `+` FAB → log entry.
- **Log entry sheet:** date picker (default today), all 17 fields optional (numeric, unit-labeled per body-measurement unit setting: metric kg/cm or imperial lb/in), photo attach section (§6.2), Save.
- **Detail per measurement:** line chart (3M/1Y/All) + reverse-chron entry list; entries editable/deletable (delete clears that field for the date; empty entries with no photos are removed).
- Body-measurement units independent from workout weight units.

### 6.2 Progress photos

- Attached to a measurement date (0..n per date); camera or library; stored as files (`05` §8), never in cloud, excluded from CSV (included in backup archive).
- **Gallery:** grid by date (Photos tab within Measures); tap → full-screen pager with date + that date's weight overlay.
- **Compare:** select two photos → side-by-side view with dates + weight/measurement deltas.
- Delete photo with confirm.

**Acceptance criteria**
- [ ] Two saves on the same date merge into one entry (second save of weight keeps earlier waist).
- [ ] Imperial entry (lb/in) stores canonical kg/cm exactly and round-trips display.
- [ ] Charts per measurement work with sparse data (gaps don't interpolate misleadingly — line connects existing points, no zero-fill).
- [ ] Photos persist across app updates; compare view renders two photos with deltas.
- [ ] Deleting the last field value + photos of a date removes the entry from lists.

## 7. Profile & settings surface

Profile tab: avatar/name (local vanity only), workout count + streak, shortcut cards (Statistics · Exercises[archived mgmt] · Measures · Calendar), recent workouts (3, link to History), gear icon → Settings.

Settings groups: **Units** (weight kg/lb · distance km/mi · body measurements metric/imperial) · **General** (first day of week; theme System/Light/Dark; weekly workout goal) · **Workouts** (the 12, `02` §13) · **Notifications** (rest timer on/off) · **Data** (Export CSV · Import Hevy CSV · Backup/Restore — `05` §7/§9) · **About** (version, licenses incl. free-exercise-db credit, Sentry toggle).

**Acceptance criteria**
- [ ] Every setting persists across relaunch and applies without restart.
- [ ] Theme switch is instant, app-wide, and matches `07` tokens in both modes.
