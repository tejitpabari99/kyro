# Hevy Deep-Dive (iOS, as of mid-2026)

Research appendix for the personal Hevy-clone PRD (React Native + Expo, iPhone-first, single user).
Sources: Hevy public API (api.hevyapp.com — OpenAPI spec extracted 2026-07-23, ground truth), hevyapp.com feature pages, Hevy tutorial, App Store listing (v3.1.5), Hevy CSV export samples from third-party importers, and app reviews. Items marked **[confidence: medium]** are from direct product knowledge/reviews rather than an authoritative document; everything else is sourced.

App snapshot: Hevy v3.1.5 (July 2026), iOS 15.1+, ~249 MB, iPhone/iPad/Apple Vision/Apple Watch (watchOS 8+), 12 languages, 4.9★ (82k ratings), 10–15M users. The mid-2026 release added "liquid glass" native iOS 26-style components.

Scope note: the clone excludes social (feed/follow/likes/comments/leaderboards/community routines), integrations (Strava, Apple Health), coaching/AI (Hevy Trainer, HevyGPT, Hevy Coach), and paywall mechanics. All Hevy Pro-gated features are included free in the clone. Apple Watch is out of v1.

---

## 1. Full Feature Inventory

### 1.1 Workout Logging (the core loop)

**Starting a workout**
- Two entry points on the Workout/Routines tab: `+ Start Empty Workout` (top button) and `Start Routine` on any routine card. Both open the active-workout screen and start the duration stopwatch immediately.
- Starting from a routine pre-populates all exercises, target sets (with rep or rep-range targets, target weight, set types), per-exercise rest timers, and exercise notes.
- Only one active workout can exist at a time. Starting a routine while another workout is in progress prompts to discard/resume the existing one. **[confidence: medium]**

**Header counters (active workout)**
- Duration stopwatch (top-left), live Volume total, and completed Sets count. Tapping the stopwatch lets you edit the session's duration, start date, and start time, or pause/restart the timer (useful for retro-logging).

**Adding exercises**
- Blue `+ Add Exercise` button opens the exercise picker (search + muscle/equipment filters, multi-select allowed, "Superset" grouping option in picker). Selected exercises append to the workout.
- If the exercise was logged before, Hevy auto-populates the same number of set rows as last time, with previous values shown in the PREVIOUS column (values are editable, not pre-committed).
- Per-exercise three-dot menu: Reorder Exercises, Replace Exercise, Add To Superset / Remove From Superset, Add Warm-Up Sets (calculator), Add a Note, adjust Rest Timer, Remove Exercise. Exercise reorder happens in a dedicated drag-handle list sheet.

**Set types** (exact enum from API: `normal`, `warmup`, `failure`, `dropset`)
- Change type by tapping the set number in the SET column → menu: Warm Up Set / Normal Set / Failure Set / Drop Set + Remove Set. Type can be changed any number of times; multiple types can coexist in one exercise.
- Visual markers replace the set number: `W` (orange) for warm-up, `D` (blue) for drop set, `F` (red) for failure; normal sets show their working-set index (warm-ups don't consume numbering). **[confidence: medium for exact colors; letters confirmed]**
- Behavior: the auto rest timer does NOT start if the *next* set is a drop set (no rest in a drop). Warm-up sets are excluded from PR detection and (configurably) from volume/stats — there is a setting "Warm Up Sets: include in stats yes/no".

**Inputs per set, by exercise type** (8 exercise types; API enum → UI label → logged fields):

| API `exercise_type` | UI label | Set columns |
|---|---|---|
| `weight_reps` | Weight & Reps | KG/LBS + REPS |
| `reps_only` | Reps Only (e.g. sit-ups) | REPS |
| `bodyweight_reps` | Bodyweight Reps (e.g. pull-ups) | +KG (optional added weight) + REPS |
| `bodyweight_assisted_reps` | Assisted Bodyweight | −KG (assistance) + REPS |
| `duration` | Duration (e.g. plank) | TIME (mm:ss) |
| `weight_duration` | Weight & Duration (e.g. weighted carry/wall sit) | KG + TIME |
| `distance_duration` | Distance & Duration (cardio: run, row) | KM/MILES + TIME |
| `short_distance_weight` | Weight & Distance (e.g. suitcase carry, sled push) | KG + METERS |

- Extra field `custom_metric` (number) exists in the data model — currently used for **steps/floors on stair-machine exercises**.
- All value fields are nullable; a set stores only what applies to its exercise type.

**RPE tracking**
- Off by default; enabled in Settings → Workouts → RPE Tracking. Adds an RPE column for rep-based exercises.
- Scale is fixed: **6, 7, 7.5, 8, 8.5, 9, 9.5, 10** (exact API enum). Entered via a tap-picker per set; optional per set (typically skipped on warm-ups).

**Rest timers**
- Per-exercise auto rest timer, set from a control on the exercise card (below the note area). Range 5 s – 5 min in Hevy's picker; "Off" is an option. Default comes from Settings → Workouts → Default Rest Timer and applies to newly added exercises; per-exercise override persists in routines (`rest_seconds` per exercise in the routine model).
- Timer auto-starts when a set is checked complete. While running: a countdown appears (bottom bar / timer pill), with `−15 s`, `+15 s`, and `Skip` controls; finishing fires a local notification + sound ("timer done"). Sounds/volume configurable (off/low/normal/high).
- Timer does not start before a drop set (see above). In supersets the timer plus Smart Superset Scrolling guide you to the next paired exercise.

**Supersets**
- Create via exercise three-dot → `+ Add To Superset`, pick partner exercise(s); >2 exercises allowed (circuits). Remove via `Remove From Superset`.
- Each superset gets a **unique color**; member exercises show a colored vertical bar/label so groupings are obvious.
- Superset membership is stored as an integer `superset_id` per exercise (null = not in a superset); ids are unique within a workout (0, 1, 2, …).
- "Smart Superset Scrolling" setting: on set completion, the screen auto-scrolls to the next exercise in the superset, cycling through members.

**Notes**
- Workout-level: title + description, edited on the finish/save screen (or by editing the workout later).
- Exercise-level: free-text note per exercise, visible during logging, saved with the workout. In routines, notes support clickable links (e.g., form video URLs). Notes are also a field on the routine itself (`routine.notes`).
- Per-exercise pinned note behavior: notes written in a routine appear each time the routine is run.

**Previous-performance display**
- The PREVIOUS column on every set row shows last time's performance for that same set index, e.g. `45kg × 9`. Tapping the previous value **autofills** the current set's fields.
- Setting "Previous Workout Values": pull previous values from (a) the last time you did the exercise *anywhere*, or (b) the last time you did it *in this routine*.

**Set completion**
- Each set row ends in a checkmark button. Tapping marks the set done (row visually confirms — green/filled state), triggers the rest timer, live-PR check, and volume/sets counters. Unchecking is possible before finishing. Empty required fields block/complete-with-previous depending on values present (if the row has values typed or previous values shown, checking commits them). **[confidence: medium on autofill-on-check nuance]**

**In-progress workout persistence**
- The active workout can be minimized: swipe down / chevron collapses it to a **persistent bottom bar** above the tab bar showing workout name + elapsed time, with the rest-timer countdown when active; tap to re-expand. The rest of the app remains navigable mid-workout.
- The in-progress workout survives app kills/restarts (fully local persistence; on relaunch the workout is still running). **[confidence: medium]**
- Live Activity mirrors the workout on the lock screen / Dynamic Island (see 1.8).

**Finishing / editing / discarding**
- `Finish` button (top-right, blue) → save/summary screen: duration, volume, set count, PR/records earned; editable title (auto-title like "Midday Workout" by time of day), description, date/time adjustments, media upload, visibility (social — excluded), then Save.
- Finishing with unfinished (unchecked) sets prompts a confirmation that **uncompleted sets will be discarded** from the saved workout. **[confidence: medium — widely observed behavior]**
- `Discard Workout` button at the bottom of the active workout (destructive, confirm dialog).
- Past workouts: three-dot menu → Edit Workout (full re-open of the logger against historical data), Save as Routine, Share, Delete. Editing recomputes stats and records.

**Workout duration tracking**
- Auto-tracked from start; manually adjustable (duration, start date, start time) both during the workout (tap stopwatch) and on the save screen — supports retro-logging past workouts (there's a dedicated "log past workout" flow via calendar/plus). **[confidence: medium on entry point]**

**Plate calculator** (setting-gated, off by default)
- During a workout, a `Calculator` button sits bottom-left above the keyboard when a weight field is focused. It shows which plates to load per side for the target weight.
- Supports bar types: **barbell, EZ bar, short bar**; user selects bar weight. "Available Equipment → Manage" lets you define your gym's plate inventory (custom plate weights). If the target is impossible with available plates it shows the closest achievable weight.

**Warm-up set calculator** (Pro in Hevy; free in clone)
- Enabled in Settings → Workouts → Warm-up Calculator. Configurable formula: a list of warm-up sets each defined as a % of working weight + reps; add/remove sets; "Reset to Default"; two rounding preferences (plate-loaded increment, dumbbell increment).
- Used via exercise three-dot → `Add Warm Up Sets`: enter working/target weight → generated warm-up sets (marked `W`) are inserted at the top of the exercise.

**Other logging niceties**
- Inline Timer setting: a built-in stopwatch for duration-type sets (tap the TIME cell → start/stop stopwatch fills the value).
- Keep Awake During Workout setting (disables screen sleep).
- Sounds setting: timer sound choice + volumes for timer/set-check/notifications.
- Live PR notification banner (see 1.4).
- Units toggle kg/lbs applies app-wide, including mid-workout.

### 1.2 Exercise Library

- **~400+ built-in exercises** (official marketing "400+ high-quality exercises"; some reviews claim 1000+ — official number is the safer spec). Each has a demo animation/video and step-by-step written instructions.
- Categorization (exact API enums):
  - `primary_muscle_group` + `secondary_muscle_groups[]` from: `abdominals, shoulders, biceps, triceps, forearms, quadriceps, hamstrings, calves, glutes, abductors, adductors, lats, upper_back, traps, lower_back, chest, cardio, neck, full_body, other`
  - `equipment_category` from: `none, barbell, dumbbell, kettlebell, machine, plate, resistance_band, suspension, other`
- Exercise template ids are short uppercase hex-ish strings for built-ins (e.g. `D04AC939`, `05293BCA`); UUIDs for custom.
- **Search/filter UX**: search bar + two filter chips (Equipment, Muscle). Alphabetical list with thumbnail, name, primary muscle subtitle; sections for Recent / All; multi-select when adding to a workout/routine. Accessible from the Workout tab picker and Profile → Exercises.
- **Exercise detail page** — tabs/sections:
  - *About/Summary*: animation, instructions, primary/secondary muscles, equipment.
  - *Charts*: Heaviest Weight, One Rep Max (estimated), Best Set Volume, Session Volume, Total Reps — over selectable time ranges.
  - *Records*: Personal bests — heaviest weight, best (estimated) 1RM, best set volume, best session volume, most reps; plus **Set Records**: best weight × each rep count (1–10+ rep-record table).
  - *History*: every past performance of the exercise, workout by workout, with per-set details.
- **Custom exercises** (7 free / unlimited Pro; clone: unlimited): fields = image (photo/video/GIF), name, equipment (one of the 9 categories), primary muscle (one), secondary muscles (many), exercise type (one of the 8 measurement types). Editable/deletable via three-dot menu; built-ins can be duplicated then customized.

### 1.3 Routines & Templates

- **Routine** = reusable workout template: title, optional notes, ordered exercises; per exercise: sets (with type, target weight, target reps **or rep range** `{start, end}`, target duration/distance), `rest_seconds`, note, superset id.
- Rep ranges: entered as two values (e.g., 6–8); displayed as the target during logging.
- No %1RM-based programming (explicitly absent).
- **Folders**: named containers on the Routines tab; create via folder icon; drag-and-drop reorder of folders and routines; move routine between folders by long-press drag; rename/delete; collapsible sections. Default section "My Routines" (folder_id = null).
- Routine actions (three-dot): Start Routine, Edit, Duplicate, Share (excluded), Move to folder, Reorder, Delete.
- **Create from history**: any completed workout → three-dot → Save as Routine.
- **Update-from-workout prompt**: when you finish a workout started from a routine and you changed anything (weights, sets, exercises), Hevy asks "Update routine?" — accept to write the changes back to the template, or keep the original.
- Free-tier limit: 4 routines (folders effectively Pro-scoped by the limit); clone: unlimited.
- Hevy also ships a curated routine library and shared/community routines — excluded from clone.

### 1.4 History, Progress & PRs

**History**
- Profile tab lists recent workouts as cards: title, date, duration, volume, PR count, per-exercise summary lines ("3 × Bench Press (Barbell)"), best set. Tap → full workout detail (every exercise/set, notes, records badges).
- **Calendar view**: month grid; days with workouts highlighted in blue; tap a day to see that day's workout(s); also shows an **active streak** counter (consecutive weeks with ≥1 workout) and supports logging a past workout on a chosen date.

**Statistics dashboard** (Profile → charts area / Statistics)
- Workouts per week bar chart (with a configurable weekly goal line **[confidence: medium]**).
- Aggregate charts with metric switcher: Duration, Volume, Reps — per week/month.
- **Muscle distribution**: sets per muscle group per week (bar/stacked view) and a muscle-distribution breakdown for last 7 days / 30 days / 3 months / year / all time.
- Time-range filters: last 3 months free; **year / all-time gated Pro** (clone: all free).
- Monthly Report and Year in Review: generated summary screens (volume, sessions, top exercises, streaks) — nice-to-have, not core.

**Per-exercise charts** (in exercise detail): Heaviest Weight, Estimated 1RM, Best Set Volume, Session Volume, Total Reps — line charts over time; tap points for values.

**Personal records**
- PR types detected: **best estimated 1RM, heaviest weight, best set volume (weight × reps), most reps, longest duration** — plus per-rep-count **set records** (best weight at 1, 2, 3… reps).
- **Live PR notification**: on checking a set that beats a record, an in-workout banner appears immediately (toggleable in settings).
- Post-workout: the save screen and workout detail show a records section (trophy icons); workout cards show "🏆 N PRs".
- Estimated 1RM formula: **Epley** — `1RM = weight × (1 + reps/30)` **[confidence: medium — widely reported for Hevy; not officially documented]**. Estimates only counted for reps ≤ ~10; warm-up sets excluded from PRs; whether "include warm-up sets in stats" affects PRs is configurable via the warm-up stats toggle.
- **Retroactive recomputation**: editing or deleting an old workout recalculates affected records and charts (records are derived data, not stored one-shot events). **[confidence: medium — observed behavior; design implication: compute PRs from history, don't only store event flags]**

### 1.5 Body Measurements

- Exact measurement set (from API `BodyMeasurement`): `weight_kg`, `fat_percent`, `lean_mass_kg` (via Health/derived; field exists), `neck_cm`, `shoulder_cm`, `chest_cm`, `left_bicep_cm`, `right_bicep_cm`, `left_forearm_cm`, `right_forearm_cm`, `abdomen`, `waist`, `hips`, `left_thigh`, `right_thigh`, `left_calf`, `right_calf`. Keyed by **date** (one entry per day; PUT by date = upsert).
- Logging: Profile → Measures → `+`: fill any subset of fields; optionally attach **progress photos** (photos are attached to a measurement entry; always private regardless of profile visibility).
- Charts: individual line graph per measurement, horizontal selector buttons beneath the graph to switch measurement; entries editable/deletable; photo gallery with "See All", side-by-side compare of two photos, share-card export.
- Units: metric/imperial independent of workout weight unit (body measurement unit setting).
- Free tier restricts measurements to **body weight + waist** only (rest are Pro); clone: all free.

### 1.6 Profile & Settings

- Profile screen: avatar/name, workout count, (social counts — excluded), dashboard shortcuts (Statistics, Exercises, Measures, Calendar), recent workouts list.
- Settings (relevant to clone):
  - **Units**: weight kg/lbs; distance km/miles; body-measurement units.
  - **First day of week** (affects weekly stats + calendar).
  - **Theme**: System / Light / Dark. (Pro adds cosmetic app themes / custom app icon — cosmetic only.)
  - **Language** (12 languages; clone: English only fine).
  - **Workouts sub-settings (the "12 workout settings")**: Sounds (timer sound choice + volumes), Default Rest Timer, Previous Workout Values (any workout vs same routine), Warm-up Calculator (formula config), Warm Up Sets (include in stats toggle), Keep Awake During Workout, Plate Calculator (on/off + equipment config), RPE Tracking (on/off), Smart Superset Scrolling (on/off), Inline Timer (on/off), Live Personal Record Notification (on/off), Units.
  - **Notifications**: rest timer done, workout reminders, (social — excluded).
  - **Apple Health**: sync workouts + body weight both ways — *exists in Hevy; excluded from clone v1*.
  - **Export & Import Data**: export full workout history as CSV (emailed/shared file `workout_data.csv` / `hevy_workouts.csv`); import from Strong CSV and Hevy CSV (used for migration and retro-logging).
  - Account/auth, privacy — mostly irrelevant to a single-user clone.

### 1.7 Excluded-but-noted (Pro gating summary)

Hevy Pro ($2.99–3.99/mo, $23.99/yr, $74.99 lifetime) gates: unlimited routines (free = 4), unlimited custom exercises (free = 7), stats/history beyond 3 months (year + all-time ranges), full body measurements (free = weight + waist), warm-up set calculator, Hevy Trainer/AI, cosmetic themes, some sharing extras. **The clone ships all of these free** (minus Trainer/AI/social).

### 1.8 Platform extras

- **Live Activity + Dynamic Island** (free feature): lock-screen/Island card with current exercise + set number, prescribed weight × reps, previous performance for that set, workout duration, live rest-timer countdown with ±15 s / skip, and a **complete-set button** — all without unlocking. Clone note: achievable in Expo via `expo-live-activity`-style native module; flagged as stretch goal.
- **Home-screen widgets**: last-7-days data, calendar, calendar+stats combo, weekly streak/rest-days, day-of-week routine (tap to start), quick "log workout" launcher, saved-routines grid, configurable aggregate metric widget (volume/sets/duration over week/month/quarter). Interactive: tapping starts workouts / deep-links.
- **Apple Watch app** (excluded v1): standalone start-routine, set logging with previous values, set-type marking, rest timer with haptics, heart-rate capture into workout details, complications, live phone↔watch sync.
- **iMessage stickers** (trivial, ignore).
- **Offline behavior**: fully offline-capable logging; everything is stored locally and synced to Hevy's backend when connectivity returns. For a single-user clone this collapses to local-first storage (SQLite) — no sync needed, though the API's event model (see §3) is a good template if sync is ever added.

---

## 2. Screen-by-Screen UI/UX Breakdown

### 2.1 Navigation structure

Tab bar (5 slots, iOS): **Home** (social feed — excluded) · **Routines/Workout** · **Workout `+` (center, blue — starts empty workout / shows logger)** · **Discover** (excluded) · **Profile**. In recent versions the center action and the Routines tab are partially merged: the Workout tab hosts "Start Empty Workout" + routine list. **[confidence: medium on exact 2026 arrangement — Hevy has shuffled Home/Workout/Discover/Profile over versions; tutorial confirms Home, Workout, Profile, Discovery]**

**Clone recommendation** (given exclusions): 4 tabs — Workout (default), History, Exercises, Profile/Settings — preserving Hevy's Workout-tab layout as the hub.

### 2.2 Workout (Routines) tab

- Header: "Workout" title.
- Section "Quick Start": full-width blue-accent button `+ Start Empty Workout`.
- Section "Routines": row of small action cards (`New Routine`, `Explore` (excluded)); folder icon in section header creates folders.
- Folders render as collapsible headers with drag handles; each routine is a card: title, preview line of exercise names (comma-joined, truncated), grey `⋯` menu, and a prominent blue `Start Routine` button spanning the card bottom.
- Empty state: illustration + "Get started by creating a routine or starting an empty workout".
- Modals/sheets: new-folder name dialog; routine three-dot action sheet; reorder screen.

### 2.3 Routine editor

- Full-screen modal: title field at top, `Save` top-right, `Cancel`/back top-left.
- Body = same exercise-card stack as the live logger, but with target fields instead of live logging: per set — SET#, previous (blank), KG, REPS (tap REPS header/value to switch to rep range), no checkmarks.
- `+ Add Exercise` (blue), per-exercise ⋯ (superset, note, rest timer, reorder, replace, remove), `+ Add Set` per exercise.
- Rest-timer row per exercise (clock icon + duration).

### 2.4 Active workout screen (THE core screen)

Layout, top to bottom:
1. **Header bar**: chevron-down (minimize) left; workout title center (tap to edit); blue **Finish** pill right.
2. **Meta row**: Duration (live, blue), Volume (kg), Sets — three small stat columns. Tap duration to adjust/pause.
3. **Exercise cards**, one per exercise, in order:
   - Exercise name in blue (tap → exercise detail sheet), thumbnail avatar left, `⋯` right.
   - Optional note row (grey italic) — tap to edit.
   - Optional superset color bar along the card's left edge + "Superset A/B" tag.
   - Rest-timer row: clock icon + "Rest Timer: 2min 30s" (tap → duration picker wheel/sheet).
   - **Set table**: column headers `SET | PREVIOUS | KG | REPS | ✓` (columns adapt per exercise type: +KG/−KG/TIME/KM/MILES; RPE column appended if enabled).
     - SET cell: number or W/D/F badge → tap opens set-type menu.
     - PREVIOUS cell: grey `50kg × 8` → tap autofills.
     - Value cells: boxed inputs; empty shows grey placeholder of previous/target value.
     - Checkmark cell: grey outline → green/blue filled when done; completed row's background tints (subtle green). **[confidence: medium on tint]**
     - **Swipe left on a set row → red Delete**.
   - `+ Add Set` ghost button full-width at card bottom.
4. **Footer buttons**: blue `+ Add Exercise`; grey `Settings` (workout settings shortcut); red-text `Discard Workout`.

**Keyboard behavior**: numeric keypad with an accessory bar above it — `Next` advances field→field (weight→reps→next set), plate-`Calculator` button bottom-left when a weight field is focused, RPE picker replaces keypad for RPE cells, duration cells get mm:ss entry + inline stopwatch if enabled. Tapping ✓ while keyboard is up commits the row and keeps flow. **[confidence: medium on exact accessory layout]**

**Rest timer UI**: on set completion a countdown pill/bar appears (bottom of screen, above tab bar/keyboard) showing remaining time with `−15s | +15s | Skip`; also mirrored in Live Activity. Full-screen timer view available by tapping the pill. **[confidence: medium on full-screen view]**

**Minimized state**: chevron-down collapses the logger into a bottom banner ("<Workout name> — 25:31", with rest countdown when active) pinned above the tab bar app-wide; tap to restore. This is the pattern to copy exactly (identical to Apple Music's mini-player concept).

**Finish flow**: Finish → "Workout Summary" save sheet: editable title, description, duration/date fields, records earned list, (photo/visibility — excluded), blue `Save Workout`. If unchecked sets exist → alert "Uncompleted sets will be discarded".

### 2.5 Exercise picker (sheet)

Full-height modal: search bar, `Create Exercise` link, filter chips (All Equipment ▾, All Muscles ▾), alphabetical list with section index; rows = thumbnail, name, muscle subtitle; tap = select (multi-select with count), bottom blue button `Add N exercises`; "Superset" toggle to add selected as a superset.

### 2.6 Exercise detail

Pushed screen or sheet: header with animation/image; segmented tabs `Summary | History | Charts | Records` (Hevy currently: About / Charts / Records / History). Summary = instructions + muscles + equipment. Charts = metric selector + line chart + range selector. Records = cards for each PR + set-records table (reps 1…10 with best weight each). History = reverse-chron list of workout cards filtered to this exercise.

### 2.7 History / Calendar / Statistics

- History list (in Profile in Hevy; own tab recommended for clone): workout cards — title, relative date, stats row (Duration / Volume / Records), exercise summary lines with best set per exercise.
- Workout detail: full read-only rendering of the logger card layout + trophies on PR sets; ⋯ → Edit / Save as Routine / Delete.
- Calendar: month pager, blue-dot/blue-filled workout days, streak header ("🔥 N-week streak"), day tap → workouts.
- Statistics: stacked chart cards (Workouts per week, Volume, Reps, Duration; Muscle distribution donut/bars; Sets per muscle group per week) each with time-range segmented control (3M free / 1Y / All).

### 2.8 Measures

List of measurement types with latest value + sparkline; `+` FAB to log entry (form of all fields, all optional, photo attach); detail per measurement = line chart + entry list; photos gallery + compare view.

### 2.9 Visual design language (to replicate quality, NOT colors)

- **Themes**: true light (white bg, `#F5F5F7`-ish grouped background, white cards) and dark (near-black `#0E0F12`–`#111214` bg, `#1C1D21` cards). System-follow by default.
- **Accent**: Hevy blue ≈ `#3B82F6`/`#4A90E2` — used for: primary buttons (Start/Finish/Add Exercise), links/exercise names, active tab, chart lines/bars, checked states, live duration. Single-accent discipline: almost everything interactive is the one blue; semantic exceptions: red = destructive/failure sets, orange = warm-up, green = completed checkmarks, per-superset rainbow colors. **Clone must keep the single-accent discipline but choose a different hue.**
- **Typography**: SF Pro (system), heavy use of semibold for numbers/stats, 13–15 pt secondary grey text; big numerals for counters; tabular numerals in set tables.
- **Layout**: card-based, generous 16 pt paddings, 12–16 pt corner radii, thin hairline separators inside tables, no heavy borders/shadows (flat, iOS-native). Full-bleed lists; sheets/half-sheets for pickers (iOS native feel — v3.x adopted "liquid glass" iOS-26 material for nav/tab bars).
- **Charts**: minimalist line charts (accent stroke, subtle gradient fill, dot on selection), simple bar charts for weekly counts, no gridline clutter; range selector as segmented text buttons.
- **Buttons**: full-width rounded-rect primaries (accent bg, white text), ghost/tonal secondaries (accent-tinted 10% bg), destructive as plain red text rows.

---

## 3. Data Model Implications (ground truth: Hevy public API + CSV)

### 3.1 Entities (mapped from api.hevyapp.com OpenAPI spec)

```
ExerciseTemplate  { id, title, type: ExerciseType, primary_muscle_group: MuscleGroup,
                    secondary_muscle_groups: MuscleGroup[], equipment_category: EquipmentCategory,
                    is_custom: bool, [custom: image?] }
ExerciseType      = weight_reps | reps_only | bodyweight_reps | bodyweight_assisted_reps
                  | duration | weight_duration | distance_duration | short_distance_weight
MuscleGroup       = abdominals|shoulders|biceps|triceps|forearms|quadriceps|hamstrings|calves|glutes
                  | abductors|adductors|lats|upper_back|traps|lower_back|chest|cardio|neck|full_body|other
EquipmentCategory = none|barbell|dumbbell|kettlebell|machine|plate|resistance_band|suspension|other

Workout           { id(uuid), title, description?, routine_id?, start_time, end_time,
                    created_at, updated_at, exercises: WorkoutExercise[] }
WorkoutExercise   { index, exercise_template_id, superset_id?: int, notes?, sets: Set[] }
Set               { index, type: normal|warmup|failure|dropset, weight_kg?, reps?,
                    distance_meters?, duration_seconds?, rpe?: 6|7|7.5|8|8.5|9|9.5|10, custom_metric? }

Routine           { id(uuid), title, notes?, folder_id?: int|null, created_at, updated_at,
                    exercises: RoutineExercise[] }
RoutineExercise   { index, exercise_template_id, superset_id?, rest_seconds?, notes?, sets: RoutineSet[] }
RoutineSet        { type, weight_kg?, reps?, rep_range?: {start,end}, distance_meters?,
                    duration_seconds?, custom_metric? }   // targets, not results
RoutineFolder     { id(int), index, title, created_at, updated_at }   // index = display order

BodyMeasurement   { date (PK, one per day), weight_kg?, fat_percent?, lean_mass_kg?,
                    neck_cm?, shoulder_cm?, chest_cm?, left/right_bicep_cm?, left/right_forearm_cm?,
                    abdomen?, waist?, hips?, left/right_thigh?, left/right_calf?, [photos?] }
```

Canonical storage units: **kg, meters, seconds** — display units are a view concern (CSV export converts to account units). Weights allow decimals; reps integers.

Derived (not stored by API, computed):
```
PRRecord (per exercise): best_1rm_estimate, heaviest_weight, best_set_volume,
                         best_session_volume, most_reps, longest_duration,
                         set_records: {reps -> best_weight}
Settings: units, distance_units, first_day_of_week, theme, default_rest_timer,
          previous_values_mode(any|same_routine), warmup_in_stats, rpe_enabled,
          plate_calc{enabled, bars[], plates[]}, warmup_calc{sets:[{pct,reps}], rounding},
          smart_superset_scroll, inline_timer, keep_awake, live_pr_banner, sounds{...}
```

Notable API design details worth copying:
- Workouts expose an **event stream** `GET /v1/workouts/events?since=` returning `updated`/`deleted` events — the sync primitive. For a local-first clone this validates: soft-delete + `updated_at` on workouts is sufficient for any future sync/backup.
- Routine folders use integer ids + explicit `index` ordering; routines/workouts use UUIDs.
- Body measurements are date-keyed upserts (PUT `/body_measurements/{date}`).
- Superset representation: plain nullable integer group id on the exercise — simple and sufficient.

### 3.2 CSV export schema (ground truth from real exports)

One row per set, denormalized:
```
"title","start_time","end_time","description","exercise_title","superset_id",
"exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles",
"duration_seconds","rpe"
```
- Date format: `"28 Mar 2025, 17:29"` (localized d MMM yyyy, HH:mm).
- Weight/distance columns follow the account's unit setting (`weight_kg`/`distance_km` for metric accounts).
- `set_type` values: `normal`, `warmup`, `failure`, `dropset`. Empty strings = null. `superset_id` empty when not in a superset.
- Workout title+start_time acts as the de-facto workout key on import. Clone's CSV export should match this format for tool compatibility (Strong-CSV import exists in Hevy but is optional for the clone).

---

## 4. Known UX Details & Edge Cases Worth Copying

1. **Unfinished sets on Finish** → confirm dialog; unchecked sets are dropped from the saved workout (they never pollute history/stats).
2. **Previous-value auto-progression**: new workout of a known exercise pre-creates last session's set count with previous values as placeholders; nothing counts until checked. Tapping PREVIOUS autofills; typing overrides. Placeholder values commit when the checkmark is tapped with fields empty-but-placeholder-shown. **[confidence: medium on the last nuance — decide explicitly in PRD]**
3. **Bodyweight family**: `bodyweight_reps` logs bare reps with optional `+kg` added load (weight_kg holds the *added* weight, not total); `bodyweight_assisted_reps` logs assistance as a positive number displayed as `−kg` (stored positive in weight_kg). Volume math for these differs (Hevy counts only added weight toward volume, bodyweight itself excluded). **[confidence: medium on volume math]**
4. **Duration exercises**: TIME cell, mm:ss; Inline Timer setting turns the cell into a start/stop stopwatch. Duration PRs = longest duration.
5. **Cardio (distance+duration)**: logs km/mi + time; history shows pace implicitly; excluded from tonnage volume; distance stored in meters.
6. **Stair machine etc.**: `custom_metric` = steps/floors — include the column generically ("custom metric") rather than hardcoding.
7. **Drop sets & rest**: no auto rest timer before a set typed as dropset; warm-ups don't break working-set numbering.
8. **Retroactive PR integrity**: editing/deleting historical workouts recomputes records and charts; therefore compute PRs by query/materialized-view over sets, keyed by (exercise, metric), rather than storing immutable "PR happened" events. Live PR banners are transient UI, not data.
9. **Warm-up stats toggle**: volume/sets stats can include or exclude warm-up sets; PRs always exclude warm-ups.
10. **Same-routine vs anywhere previous values**: setting matters when an exercise appears in multiple routines with different loading schemes.
11. **Update-routine-after-workout prompt**: the single most-loved progressive-overload flow — deviations during the workout offer a one-tap template update at finish.
12. **One active workout invariant** + crash-proof persistence: the in-progress workout is durably persisted on every mutation; app kill/reopen resumes exactly, timer computed from wall-clock start_time (not a running counter).
13. **Rest timer via notifications**: timer end must fire as a local notification (sound + banner) since the phone is usually locked; ±15 s adjustments update the pending notification.
14. **Editing duration/start time** mid-workout supports retro-logging; a workout's duration is `end_time − start_time` unless manually overridden.
15. **Set row swipe-to-delete**; exercise deletion via ⋯ menu with no confirm (undo-less — acceptable for speed; clone may add undo snackbar).
16. **Keyboard flow is the product**: number pad + Next-field advancement + tap-✓-to-commit is what makes logging take <3 s per set. Prioritize this above everything else.

---

## 5. Open Questions / Unresolved

- Exact 2026 tab-bar arrangement after the v3.x "liquid glass" redesign (Home/Routines/Discover/Profile vs a 5th center button) — moot for the clone (social tabs excluded) but layout screenshots would confirm.
- Official confirmation of the Epley formula for estimated 1RM (strongly reported, not documented by Hevy).
- Default warm-up calculator formula percentages (page shows it visually only; commonly ~40/60/80% ladder).
- Whether checked-set placeholder values auto-commit or require explicit entry (decide a deliberate behavior in the PRD; recommendation: placeholder commits on check — fastest logging).
- Precise volume accounting for bodyweight/assisted types (recommendation: volume = added weight × reps for bodyweight_reps; assisted excluded).
- help.hevyapp.com articles are Cloudflare-blocked to bots and not on archive.org — deeper help-center details (e.g., exact free-tier measurement gating wording) rely on search snippets.
