# M3 Tasks — Routines & Folders

Milestone spec: `../09-milestones-and-delivery.md` (M3). Exit = Maestro flow 2 green; routine acceptance criteria (04 §2) pass; diff/update-routine unit tests green. M3 and M4 may partially overlap (09 dependency spine); M3-05/M3-06 must precede M4-10's finish-screen integration testing but nothing in M4 hard-depends on M3 except where noted.

No owner tasks gate M3.

Task count: **8**

---

### M3-01 — RoutineRepository + folders: CRUD + integration suite [done]
**Description:** Full repository for routines, routine exercises/sets (targets), and folders.
**How:** Implement per 05 §6: folders CRUD (INTEGER autoincrement ids, position, collapsed persisted), routines CRUD (uuid, folder_id nullable = "My Routines", position within folder), reorder (within/between folders; folders among themselves), duplicate, `getFull`, `createFromWorkout(workoutId)` (copies exercises, set counts, set types, achieved values as targets, notes, rest timers, supersets), `updateFromWorkout(routineId, workoutId)` (used by M3-06). Routine deletion: past workouts keep `routine_id` as soft reference — display "(deleted routine)" where needed (05 §3.3). Enforce the `routine_sets` reps-XOR-range CHECK at the repo boundary too.
**References:** 05 §3.3, §6; 04 §1–2.
**Dependencies:** M1-01 (schema), M2-01 (workout shapes for createFromWorkout).
**Acceptance / test gate:** Integration test per method; duplicate deep-copies sets/supersets; folder delete both paths (cascade-delete routines vs move to My Routines); createFromWorkout reproduces structure incl. supersets/rest; positions contiguous after reorder.
**Est:** 1.5 d

### M3-02 — Workout tab hub UI [done]
**Description:** The routines hub replacing the M0 placeholder.
**How:** Per 04 §1: large title, Quick Start `+ Start Empty Workout` primary, Routines section header (folder-plus = new folder, `+` = new routine), routine list grouped by collapsible folders (chevron/title/count/⋯ Rename-Reorder-Delete), implicit "My Routines" last. Routine card: title, 2-line grey exercise preview, ⋯ menu (Start/Edit/Duplicate/Move to Folder/Reorder/Delete confirm), full-width **tonal** `Start Routine` (07 §6 hierarchy). Folder delete choice dialog (delete routines vs keep→My Routines). Empty state with both CTAs. Collapse state persists (repo `collapsed`). TanStack Query for reads, invalidation on mutations.
**References:** 04 §1; 07 §5–6.
**Dependencies:** M3-01.
**Acceptance / test gate:** 04 §1 acceptance: folder CRUD + collapse persists across launches; both folder-delete paths; RNTL smoke both themes; empty state renders.
**Est:** 1.5 d

### M3-03 — Drag-reorder spike + implementation [done]
**Description:** Decide the dnd library and implement reorder mode for routines/folders (and adopt for exercise reorder sheet if it wins).
**How:** Time-boxed spike (≤ 0.5 d) per 06 §1: `react-native-reanimated-dnd` vs `react-native-draggable-flatlist` on RN 0.85/New Architecture — evaluate stability, FlashList coexistence, haptics hooks. Record the decision in the task log/PR. Implement reorder mode: drag handles, routines within/between folders, folders among themselves, `impactLight` on pickup/drop (07 §8), persist via `index`/position columns.
**References:** 06 §1 (decide at M3 spike); 04 §1; 07 §8.
**Dependencies:** M3-02.
**Acceptance / test gate:** Drag routine between folders persists and order stable after relaunch (04 §1 acceptance); decision documented; no frame drops on a 30-routine list (manual).
**Est:** 1.5 d

### M3-04 — Routine editor [done]
**Description:** Full-screen modal editor with target semantics and rep ranges.
**How:** Routes `routine/new` and `routine/[id]/edit` (modals, 06 §3). Per 04 §2.1: Cancel (confirm-if-dirty), title field, Save (disabled until title non-empty; zero-exercise allowed but warned). Reuses the logger card/SetTable machinery in **target mode**: no ✓ column, no stopwatch, no autofill-commit; SET cell cycles set types; PREVIOUS column shows last logged values read-only (no tap action). Rep targets: single value, or **rep range** toggle per set (tap REPS header or long-press cell) → `from`–`to` inputs stored as rep_range_start/end (XOR with reps). Target weight/duration/distance optional. `+ Add Set`, swipe-delete, ⋯ menu (reorder/replace/superset/note/rest timer/remove) — same interactions as the logger. Exercise picker reuse (M2-09).
**References:** 04 §2.1; 02 §3–4 (shared interactions); 05 §3.3.
**Dependencies:** M3-01, M2-06/M2-09 (shared components).
**Acceptance / test gate:** Rep-range entry displays `6-8`; XOR storage verified (repo test); dirty-cancel confirm; save round-trips through getFull; RNTL behavioral tests on range toggle.
**Est:** 2 d

### M3-05 — Start-from-routine
**Description:** `startFromRoutine` repo method + logger integration with targets-as-placeholders.
**How:** Repo: create active workout pre-populated per 02 §1 — exercises in order, routine's sets as unchecked rows carrying target values as placeholders, per-exercise rest_seconds/notes/superset groups, `routine_id` recorded, title = routine title. Logger: placeholder precedence = previous values → routine target (02 §6); rep-range targets render `6-8` and **never auto-commit** (M2-07 already enforces; wire the target payload). One-active invariant sheet applies. Routine note pre-fills each run; mid-workout edits touch only the workout.
**References:** 02 §1, §6; 04 §2.3; 00 P6.
**Dependencies:** M3-01, M2-05/M2-07.
**Acceptance / test gate:** 02 §1 acceptance (routine start pre-populates everything, nothing pre-checked); integration test: targets → placeholders mapping incl. ranges; same_routine previous-values mode now testable end-to-end (02 §6 acceptance: two routines, different loads → routine-correct PREVIOUS).
**Est:** 1 d

### M3-06 — Routine diff + update-routine prompt
**Description:** Material-change detection on finish and the write-back flow.
**How:** Pure `domain/routine-diff.ts`: compare finished workout vs source routine — material iff any of: set added/removed on an exercise, exercise added/removed/replaced/reordered, target-relevant value differs from target, rest timer changed, superset changed (02 §14.4). Finish flow (M2-14 hook): non-empty diff → dialog "Update routine? …" [Keep original / Update routine]. Update applies 04 §2.4: structure ← checked exercises only; per-set targets ← checked sets' actuals; rep-range preserved if achieved reps inside the range (weight target only updates), else collapses to achieved value; `updated_at` bumped. Keep original: byte-identical routine, not re-asked for this workout.
**References:** 02 §14.4; 04 §2.4; 08 §4.9 (routine-diff fixtures).
**Dependencies:** M3-05, M2-14.
**Acceptance / test gate:** Fixture-matrix unit tests: unchanged → no prompt; value change; structural change; in-range reps preserve range; decline leaves routine untouched (deep-equal). Integration through finish flow.
**Est:** 1.5 d

### M3-07 — Save as Routine, Repeat Workout, duplicate/delete flows
**Description:** History-side routine entry points and remaining lifecycle glue.
**How:** Workout detail ⋯ (minimal history from M2-14): `Save as Routine` (repo createFromWorkout → opens editor for confirm/rename), `Repeat Workout` (start active workout sourced from past workout, same semantics as routine start, 02 §1). Routine Duplicate from hub ⋯ (M3-02 wiring → repo). Delete routine confirm; verify historical workouts render "(deleted routine)" where the title is referenced. Starting a routine that contains an archived custom exercise still works (03 §5).
**References:** 02 §1, §15 (menu); 04 §2.2; 03 §5.
**Dependencies:** M3-01, M3-05, M2-14.
**Acceptance / test gate:** 04 §2 acceptance: Save as Routine reproduces structure incl. supersets + rest timers; repeat pre-populates placeholders; deleting a routine leaves history intact and renderable; archived-exercise routine starts.
**Est:** 1 d

### M3-08 — Maestro flow 2 + M3 QA & exit gate
**Description:** E2E for the routine loop and milestone close.
**How:** Maestro flow 2: new routine → 2 exercises, rep range 6-8, rest 90 s → save → start → placeholders show targets → complete → update-routine prompt → accept → routine shows new targets. Manual QA over all 04 §1–2 acceptance boxes both themes; fix P0/P1 + regression tests; `docs/qa/M3-checklist.md`; tag.
**References:** 08 §6 flow 2; 09 M3 exit.
**Dependencies:** all M3 tasks.
**Acceptance / test gate:** Flow 2 green; diff fixture suite green in CI; zero P0/P1; checklist + tag.
**Est:** 1 d
