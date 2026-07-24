# M2 Tasks — Core Logging (make-or-break milestone)

Milestone spec: `../09-milestones-and-delivery.md` (M2). Exit = Maestro flows 1 & 3 green; kill-resume 10/10; notification drill; domain suites (volume, calculators, units, previous-values, timers) green; keypress-to-paint < 50 ms; 20-minute logging drill passes. Owner starts dogfooding after this milestone.

Notes:
- PR banner / records-earned content is **M4** (RecordsService). The finish screen ships here with the records section hidden/empty-capable (M2-14) and gets populated in M4-10. Live PR check hook points are stubbed behind a no-op interface here.
- The physical-device notification drill needs a real iPhone. Dev verifies scheduling via simulator + debug hook (Maestro flow 7 semi-manual); the on-device lock-screen check is owner verification (O-09) and does **not** block M3 starting.

Task count: **19**

---

### M2-01 — WorkoutRepository, part 1: lifecycle [done]
**Description:** Active-workout lifecycle methods with the one-active invariant.
**How:** In `src/data/sqlite/`: `getActive`, `startEmpty({title,startTime})`, `discard`, `finish(id, meta)` (delete `is_completed=0` rows, drop exercises left with zero sets, set `end_time`/`state='completed'`, positions stay contiguous), `getFull`, `listCompleted({before?,limit})`, `softDelete`. One-active enforced by the partial unique index + repo guard: second `startEmpty` with an active present throws; auto-heal path per 06 §9 (keep newest active, complete the other with `end_time=updated_at`, Sentry warning). Every mutator = one transaction (06 §5.2). `startFromRoutine` lands in M3-05 (stub signature now).
**References:** 05 §3.2, §6; 02 §1, §14; 06 §5.2, §9.
**Dependencies:** M1-01.
**Acceptance / test gate:** Integration tests: happy paths; one-active throw; auto-heal (08 §4.9); finish deletes unchecked + empty exercises and sets state/end_time (fixtures: unchanged/value-change/structural); soft delete hides from listCompleted.
**Est:** 1.5 d

### M2-02 — WorkoutRepository, part 2: granular mutators + previousSets [done]
**Description:** The per-action mutators the store drives, plus the previous-values query.
**How:** `addExercises` (with N pre-created set rows), `removeExercise`, `reorderExercises`, `replaceExercise` (keep set count, clear values), `addSet`, `updateSet`, `removeSet` (renumber positions), `setSetType`, `setCompleted`, `updateExercise` (notes/rest_seconds/superset_id), `updateMeta` (title/times/pause offset). `previousSets(exerciseId, {routineId?, beforeWorkoutId?})`: i-th checked non-warm-up set of the most recent completed workout containing the exercise (warm-up rows matched by warm-up index), optional routine restriction, **occurrence-aware** for duplicated exercises (02 §16.6). Uses `idx_we_exercise` + `idx_workouts_start` (05 §4).
**References:** 05 §6; 02 §3–§6, §16.6.
**Dependencies:** M2-01.
**Acceptance / test gate:** Integration test per mutator incl. position renumbering and single-transaction atomicity; previousSets: any_workout vs same_routine, occurrence matching, fewer-previous-sets → missing entries (feeds 08 §4.8 previous-values cases together with M2-04).
**Est:** 1.5 d

### M2-03 — activeWorkoutStore + crash-safety suite [done]
**Description:** The Zustand store: optimistic in-memory draft, write-through to repo per action, rollback on failure, rehydrate from DB.
**How:** `src/features/workout/activeWorkoutStore.ts`. Each action updates the draft AND awaits the matching repo mutator in the same call; repo failure → rollback + error toast (typed `DataError`, 06 §9). Rehydrate from `getActive()` on cold start (wire into root layout DB-ready gate). Per-set Zustand selectors so SetRow subscribes only to its slice (06 §8). No persistence middleware — DB is the durable copy.
**References:** 06 §4.1, §5.3, §9; 02 §10.
**Dependencies:** M2-02.
**Acceptance / test gate:** 08 §4.9 crash-safety suite: every store action → DB state assertion; **kill simulation** — N seeded random valid actions, drop store, rehydrate, deep-equal (100 seeds); rollback-on-repo-failure test with an injected failing driver. **Also:** this is the first source file under `src/features/workout/**` — uncomment the `'./src/features/workout/**/*.{ts,tsx}': { lines: 85, branches: 80 }` `coverageThreshold` entry in `jest.config.js` (currently commented out with a `TODO(M2)`, per M0-03's review — Jest hard-errors on a zero-covered-file glob, which is why it was deferred, not weakened) and confirm `pnpm test -- --coverage` still passes with it active.
**Est:** 2 d

### M2-04 — domain/volume.ts + domain/previous-values.ts [done]
**Description:** Pure volume math (P7) and previous-values selection logic.
**How:** `volume.ts`: per-set by type — weight_reps/weight_duration/short_distance_weight = `weight_kg × max(reps,1)`; bodyweight_reps = added `weight_kg × reps`; bodyweight_assisted_reps/reps_only/duration/distance_duration = 0; warm-ups included iff `warmup_in_stats`; unchecked rows always 0; workout volume = Σ. `previous-values.ts`: pure mapping from `PreviousSet[]` + current rows → per-row PREVIOUS display value + placeholder payload (row-type aware, routine-target fallback, `—` when none). Display conversion via M1-02.
**References:** 04 §4.2 (P7); 02 §6; 00 P6/P7.
**Dependencies:** M1-02 (units), M0-03.
**Acceptance / test gate:** 08 §4.2 full suite green (all listed values incl. 80×8=640, +10×8=80, assisted=0, weight_duration 20 kg 60 s=20, kg→lb display) and 08 §4.8 previous-values cases (any_workout vs same_routine, occurrence matching, fewer-previous-sets → `—`).
**Est:** 1 d

### M2-05 — Logger screen shell: header, meta row, stopwatch, footer [done]
**Description:** The `workout/active` fullScreenModal route with everything except the set table.
**How:** Route per 06 §3 (slide-from-bottom, 350 ms spring damping 0.85). Header: chevron-down minimize, tappable inline-edit title, Finish accent pill. Meta row: Duration (accent, live, 1 s hook mounted only here — display = `now − start_time − pause_offset`), Volume, Sets (checked count) via StatColumn. Duration tap → sheet: edit start date/time, duration, pause/resume stopwatch (mutates start_time / duration_pause_offset_ms via updateMeta). Footer: `+ Add Exercise` primary, `Settings` tonal (opens M2-17 subset), `Discard Workout` destructive with confirm. Auto-title by time of day (02 §1). Support the retro-log variant: `start_time` = chosen date 12:00, stopwatch **paused at 0** (entry points arrive M4-05; the logger honors the mode now). Start-while-active → Resume/Discard-and-start action sheet (second confirm on discard).
**References:** 02 §1–§2; 06 §3, §6.1; 07 §6.
**Dependencies:** M2-03, M0-07/08.
**Acceptance / test gate:** 02 §1–2 acceptance: empty start < 500 ms with correct auto-title; stopwatch correct after 10 min background + force-quit relaunch (manual); duration/pause edits persist (RNTL + repo assertion); discard flow clears active state.
**Est:** 1.5 d

### M2-06 — SetTable column engine, SetRow, SetCell, set types [done]
**Description:** The crown jewel: the type-driven set table with badges, renumbering, swipe-delete.
**How:** `src/ui/SetTable|SetRow|SetCell|SetTypeBadge` + feature wiring. Column layouts per 02 §4 table for all 8 types + CUSTOM column when `uses_custom_metric` + RPE column when enabled (rep-based types only). SET cell: working-set index skipping warm-ups (W,1,2,W,3 valid); badges W/D/F colored per 07 §2.4; tap → set-type menu sheet (Warm Up/Normal/Failure/Drop/Remove). PREVIOUS cell: grey compact summary formats per type (`45kg × 9`, `+10kg × 8`, `−20kg × 12`, `1:30`, `5km / 28:00`, `60kg / 20m`) or `—`; tap autofills inputs. Value cells: NumericInput, placeholders grey = previous/target; weight 1 decimal, reps integer, TIME mm:ss (M1-02 parser), distance decimal; input clamps per 02 §16.7 (weight ≤ 1000 kg, reps ≤ 1000, duration ≤ 24 h, distance ≤ 1000 km; warn > 50 sets/exercise). Swipe-left delete → renumber. No virtualization inside logger; memoized rows with per-set selectors (06 §8). Assisted weight entered positive, displayed `−20kg`, stored positive in weight_kg.
**References:** 02 §4, §16.7; 07 §2.4, §5; 05 §3.2.
**Dependencies:** M2-03, M2-04.
**Acceptance / test gate:** RNTL behavioral: each of the 8 types renders exactly its columns; type change re-badges + renumbers; swipe-delete renumbers; PREVIOUS tap autofills; "130" → 1:30/90 s; assisted display. Both-themes smoke.
**Est:** 2 d

### M2-07 — Check flow (P6), validation, counters, RPE [done]
**Description:** The check/uncheck semantics — commit path, required-field blocking, RPE picker.
**How:** Check (✓): typed values save as-is; empty-with-placeholder commits placeholder **except rep-range targets** (`6-8` never auto-commits — reps must be typed, 04 §2.3); empty required field with no placeholder blocks with row shake 300 ms + `notificationWarning` haptic (required per type: reps for rep-types, duration for time-types, distance+duration for cardio, weight+distance for short_distance_weight; weight 0 valid; +KG optional = 0). Success: `impactLight` + optional sound, counters update, rest-timer start hook (M2-10), live-PR hook (no-op until M4-10), smart-superset hook (M2-12). Uncheck: reverses counters, cancels its own timer only. Checked rows tint bg.accentSubtle. RPE cell + picker sheet (6…10 in 0.5 steps with helper text, Clear); toggling the setting mid-workout adds/removes column live, values retained.
**References:** 02 §4 (check behavior), §5; 00 P6; 07 §8 (haptics).
**Dependencies:** M2-06.
**Acceptance / test gate:** RNTL: placeholder-commit, rep-range non-commit, blocked-check shake path, uncheck reversal; RPE enum-only entry + Clear; store/DB assertions for committed values (via M2-03 suite extension).
**Est:** 1.5 d

### M2-08 — Keyboard flow: accessory bar, Next traversal, inline timer [done]
**Description:** The typing experience — numeric keypads, accessory bar, cross-exercise Next, duration stopwatch cell.
**How:** `KeyboardAccessoryBar` (07 §5): `Calculator` on the left only when a weight field is focused AND plate calculator enabled (M2-15); `Next` right. Next order: weight → reps → (skip RPE) → next row's weight → … → next exercise's first input; keyboard never dismisses (verify no flicker between fields — keep keyboard mounted, 06 §8). Tapping ✓ with keyboard up commits without dismissal. Inline Timer setting: duration cells get a start/stop stopwatch control in the cell sheet (start counts up, stop writes elapsed seconds).
**References:** 02 §4 (keyboard flow); 06 §8 (keypress budget); 07 §5.
**Dependencies:** M2-07.
**Acceptance / test gate:** RNTL: Next traversal order across rows and exercises; check-while-keyboard-up. Manual: zero keyboard flicker; keypress-to-paint < 50 ms measured (React DevTools / simple timestamp harness — formal sign-off in M2-19).
**Est:** 1.5 d

### M2-09 — Exercise cards + picker sheet + card operations [done]
**Description:** Exercise card chrome and all add/remove/reorder/replace/note flows, including the library picker in multi-select mode.
**How:** Card per 02 §3: 40 pt thumb, accent name (tap → detail as sheet, read-only, must not disturb active workout), note row (URLs tappable), rest-timer row (wheel picker sheet: Off/5 s–1 min in 5 s steps, then 15 s steps to 5 min; default from settings at add-time), `+ Add Set` (copies previous row type=normal + placeholders). ⋯ menu: Reorder (drag-handle sheet), Replace (keeps count, clears values, refreshes PREVIOUS), Add to/Remove from Superset (M2-12), Add Warm-Up Sets (M2-16), Add a Note, Rest Timer, Remove Exercise (no confirm; Snackbar Undo 5 s — undo restores card with values). Picker: reuse M1-07 browse as a Sheet in multi-select mode (checkmarks, counter, Superset toggle, `Add N exercises`, ⓘ opens detail without selecting). On add: if history exists, pre-create last session's row count with PREVIOUS placeholders, else one empty normal set. Build `WheelPicker` primitive here (07 §5).
**References:** 02 §3; 03 §2 (picker mode); 07 §5.
**Dependencies:** M2-05, M2-06, M1-07.
**Acceptance / test gate:** 02 §3 acceptance: re-added exercise recreates last row count + PREVIOUS; replace keeps count/clears values; remove+undo restores values; reorder persists with PREVIOUS attached correctly (integration via store suite).
**Est:** 2 d

### M2-10 — Rest timer engine + notifications [done]
**Description:** `restTimerStore`, endsAt math, local-notification scheduling, permission flow.
**How:** `restTimerStore` = `{endsAt, exerciseId, setId, notificationId} | null`; 250 ms ticker hook active only while a timer surface is visible; persisted in kv-store key `active_timer` for relaunch restore (06 §4.3). `src/lib/notifications.ts` wraps expo-notifications: schedule at endsAt (time-interval trigger, `interruptionLevel: timeSensitive`, sound per settings, body "Rest over — set N of {exercise}"); cancel/reschedule on ±15 s/skip/uncheck; foreground completion → in-app chime + haptic, scheduled banner suppressed by the foreground handler. Start rules: on check unless timer Off, or next row same-exercise is dropset; superset members still start timers (02 §7). Only one timer at a time. Lazy permission request on first start with rationale copy; denial → in-app-only mode + one-time inline warning linking to iOS Settings (02 §16.9). ±15 s clamps: min → remaining floors at 0 (finishes); max unbounded (08 §4.10 resolution).
**References:** 02 §7, §16.1/16.9; 06 §4.3, §6.2; 08 §4.10.
**Dependencies:** M2-07, M0-11 (lib seams).
**Acceptance / test gate:** 08 §4.10 suite (fake timers + mocked expo-notifications): endsAt math across background gaps, clamps, skip clears notification id, next-set-dropset suppression, uncheck cancels only its own timer, scheduling calls match endsAt after each adjustment. Kill/relaunch within window restores remaining; after endsAt → no timer, no duplicate notification (integration).
**Est:** 2 d

### M2-11 — Timer UI (pill + full-screen sheet) + sounds/haptics libs
**Description:** The rest-timer surfaces and the audio/haptic seams.
**How:** `TimerPill` (07 §5): floating pill above tab bar/keyboard — progress ring, statLarge countdown, −15s/+15s/Skip; tap → full-screen sheet with big `ProgressRing` countdown + same controls (build ProgressRing primitive). `src/lib/sound.ts`: expo-audio, preload timer/check chimes, `playsInSilentMode: false`, volumes from `sounds` settings (timer sound default/bell/beep/none; volumes off/low/normal/high for timer, set-check, notifications independently). `src/lib/haptics.ts`: semantic wrappers `tickCheck`, `warnInvalid`, `successPR`, `selection`, etc. per 07 §8 table.
**References:** 02 §7 (UI, sounds setting); 06 §6.4; 07 §5, §8.
**Dependencies:** M2-10.
**Acceptance / test gate:** RNTL: pill renders countdown from store, ±15/skip dispatch; sheet opens from pill. Manual: chime + haptic on foreground completion; pill collapses.
**Est:** 1 d

### M2-12 — Supersets + smart scrolling
**Description:** Grouping, colors/labels, dissolution, and auto-scroll.
**How:** ⋯ → Add to Superset sheet (checkbox list of other exercises → group under lowest involved position); picker Superset toggle path (multi-add as one group). `superset_id` integer per workout exercise (0,1,2…); labels A/B/C by first-appearance order; colors cycle the 6-color palette (07 §2.5); 3 pt left edge bar + label. Remove from Superset; group of 1 auto-dissolves. Smart Superset Scrolling (setting, default on): after checking a set in a grouped exercise, scroll to the next member (cycling) with unchecked sets remaining.
**References:** 02 §8; 07 §2.5; 05 §3.2.
**Dependencies:** M2-09.
**Acceptance / test gate:** 02 §8 acceptance: 3-member circuit A/B/C one shared color, scroll cycles skipping completed; removing second-to-last member dissolves group; ids survive save (repo assertion). CSV round-trip covered later (M5-08).
**Est:** 1 d

### M2-13 — Minimize, GlobalWorkoutBar, resume-on-launch, keep-awake
**Description:** The mini-player pattern and lifecycle glue.
**How:** Minimize = `router.back()` from the fullScreenModal; store keeps the workout. `GlobalWorkoutBar` rendered in the tabs layout slot (M0-08): title + live elapsed; when a rest timer runs, remaining time replaces elapsed (accent); tap re-presents `workout/active`. Swipe-down on logger header also minimizes. On app launch with an active workout: rehydrate then show mini-bar (NOT the full logger). AppState handler: on active, recompute stopwatch/timer from wall clock, reconcile expired timer silently (06 §5.4). `useKeepAwake()` mounted only in the logger screen, gated by the setting, released on minimize.
**References:** 02 §10; 06 §3 (minimize pattern), §5.4, §6.3.
**Dependencies:** M2-05, M2-10.
**Acceptance / test gate:** 02 §10 acceptance: mini-bar on all 4 tabs mirroring timer; force-quit mid-typing loses at most one uncommitted field; relaunch resumes with correct duration + checked sets (manual ×3 here; the formal 10/10 drill is M2-19).
**Est:** 1 d

### M2-14 — Finish flow + minimal history
**Description:** Finish/save path and a plain saved-workout list to verify saves (real History tab is M4).
**How:** Finish per 02 §14: unchecked-sets alert (count, Cancel/Finish anyway); save sheet — editable title, description, start date/time + duration fields, computed stats row, `Save Workout` primary; **Records earned section renders only when the records provider returns data — wire to a no-op provider now, M4-10 fills it**. On save: repo `finish` (M2-01), cancel pending timer notification, invalidate queries, navigate to detail. Empty finish (0 checked) → offer Discard. Update-routine prompt hook = no-op until M3-06. Minimal history: simple list on History tab (title/date/volume) + read-only detail reusing SetTable in read-only mode.
**References:** 02 §14; 09 M2 scope (minimal history); 07 §5 (SetTable read-only).
**Dependencies:** M2-07, M2-10, M2-13.
**Acceptance / test gate:** 02 §14 acceptance: unchecked sets absent from saved workout/history; timer notification never fires post-finish (integration: cancel called); empty-finish path; saved workout appears in minimal history with correct volume.
**Est:** 1.5 d

### M2-15 — Plate calculator
**Description:** Pure domain solver + sheet UI + settings config.
**How:** `domain/plate-calc.ts`: `platesFor(target, bar, inventory) → {perSide[], achieved}` — largest-first greedy respecting counts; impossible → nearest achievable ≤ and ≥ suggestions. UI: setting-gated accessory `Calculator` button (M2-08) → sheet: target pre-filled from focused field, bar selector (Barbell 20 / EZ 7.5 / Short 10, weights editable in settings), visual bar diagram of plates per side, one-tap "use this value" writes back to the input. Settings → Plate Calculator → Available Equipment: default kg 25/20/15/10/5/2.5/1.25 ×∞, default lb 45/35/25/10/5/2.5; editable counts, custom plates addable (persist in `plate_calc` settings key).
**References:** 02 §11; 05 §3.5 (plate_calc); 08 §4.4.
**Dependencies:** M2-08, M0-10.
**Acceptance / test gate:** 08 §4.4 suite green: 102.5 on 20 → [25,15,1.25]/side; exact bar; target < bar; limited inventory; impossible → ≤/≥ suggestions; lb path; EZ/short bars. UI: write-back to input works.
**Est:** 1 d

### M2-16 — Warm-up calculator [done]
**Description:** Pure formula engine + Add Warm-Up Sets flow + settings config.
**How:** `domain/warmup-calc.ts`: `warmupSets(workingWeight, formula, rounding) → rows[]`; default formula (P8) bar×10 (percent 0 = empty bar), 40%×8, 60%×5, 80%×3; rounding **round-half-up** to nearest increment (43.75 → 45, per 08 §4.3 resolution — document in code); plate increment default 2.5 kg/5 lb, dumbbell increment 2 kg/5 lb; floor at bar weight for barbell exercises; lb working weight converts before math, output rounds in display-unit increments. Flow: exercise ⋯ → Add Warm-Up Sets → working weight pre-filled from first normal set's value/placeholder → insert generated `W` rows above existing sets, unchecked, without disturbing working-set numbering. Settings UI: formula rows add/remove/edit + Reset to Default; increments.
**References:** 02 §12; 00 P8; 05 §3.5 (warmup_calc); 08 §4.3.
**Dependencies:** M2-07, M0-10.
**Acceptance / test gate:** 08 §4.3 suite green (default @100 kg → 20×10/40×8/60×5/80×3; boundary rounding; dumbbell path; floor at bar; percent 0; custom formulas; lb path). UI: rows inserted as W above existing, numbering intact.
**Est:** 1 d

### M2-17 — Workout settings screens
**Description:** Settings → Workouts surface for the M2 subset (storage already exists from M0-10).
**How:** Screens under `app/(tabs)/profile/settings/`: Default Rest Timer (wheel), Previous Workout Values (any_workout/same_routine), RPE Tracking, Smart Superset Scrolling, Inline Timer, Keep Awake, Sounds (timer sound + 3 volumes), Warm-Up Sets in stats (storage-only effect until M4 stats; volume counter in logger already respects it via M2-04), Plate Calculator + Warm-up Calculator config entries (M2-15/16), Units (from M0-10). Every toggle applies live mid-workout (e.g. RPE column appears/disappears; kg→lb converts displayed values + placeholders with no DB drift).
**References:** 02 §13 (the 12 settings); 04 §7.
**Dependencies:** M2-15, M2-16, M0-10.
**Acceptance / test gate:** 02 §13 acceptance: kg→lb mid-workout converts display + placeholders, DB unchanged, switch-back exact; each setting persists across relaunch; RNTL smoke of the settings screens.
**Est:** 1 d

### M2-18 — Maestro setup + flows 1 & 3 + nightly CI
**Description:** E2E harness and the two critical flows.
**How:** Maestro installed + `e2e/` structure; testIDs added where needed. Flow 1 (smoke): launch → start empty → add Bench Press → 60/8 → check (pill appears) → add set via previous-tap → check → finish → discard-unchecked dialog → History shows workout with correct volume. Flow 3 (kill-resume): start → check 2 sets → stop/relaunch → mini-bar present → expand → sets checked, duration sane → finish. Flow 7 (semi-manual): debug hook asserting notification scheduling (lock-screen delivery is owner drill O-09). `nightly.yml`: full jest + Maestro on macOS runner + dataset-build determinism check (08 §9). Tag a < 5 min smoke subset.
**References:** 08 §6 (flows 1, 3, 7), §9 (nightly).
**Dependencies:** M2-14, M2-13.
**Acceptance / test gate:** Flows 1 & 3 green locally on iOS simulator; nightly workflow file complete (runs green if remote/macOS runner available; locally runnable via `pnpm e2e`).
**Est:** 1.5 d

### M2-19 — M2 QA drills, perf sign-off & exit gate
**Description:** The heavyweight milestone gate.
**How:** Kill-resume manual drill 10/10 (force-quit; note device-restart variant for owner's physical device, O-09). Backgrounding drill (08 §7): timer + lock screen on simulator-feasible parts, airplane mode no-op. 20-minute logging drill: 5 exercises incl. superset, drop set, warm-ups, RPE — zero data errors/mistaps. Keypress-to-paint < 50 ms measured and recorded; check-to-feedback < 100 ms. Re-render discipline profiling pass (06 §8). Fix all P0/P1 (+regression tests). `docs/qa/M2-checklist.md`; tag.
**References:** 09 M2 exit; 08 §7, §8; 06 §8.
**Dependencies:** all M2 tasks.
**Acceptance / test gate:** All M2 exit criteria evidenced in the checklist; domain suites (4.2–4.5, 4.9, 4.10) green in CI; zero P0/P1; tag pushed. Owner notified to begin dogfooding (O-12).
**Est:** 2 d
