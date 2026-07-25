/**
 * `WorkoutRepositoryImpl` (M2-01, extended M2-02) — active-workout lifecycle
 * methods against
 * the raw `SqliteDriver` surface, following the exact pattern
 * `ExerciseRepositoryImpl` (M1-06) established: both backends
 * (`better-sqlite3` in Jest, `expo-sqlite` on device) are reached through
 * the one narrow `SqliteDriver` surface (`../sqlite/driver.ts`) rather than
 * a second, backend-specific Drizzle client — see that file's header for
 * the fuller rationale, unchanged here. `src/data/sqlite/schema.ts` (05
 * §3.2) remains the source of truth for the table DDL.
 *
 * **Folder placement note:** M2-01's task text says "In `src/data/sqlite/`"
 * — read here as "the sqlite-backed data layer" in the loose sense the M1
 * task briefs already used (M1-06's own brief never named a folder either,
 * and landed in `src/data/exercises/`). This file follows the established,
 * actual convention instead — one folder per repository domain
 * (`src/data/exercises/`, `src/data/settings/`, now `src/data/workouts/`)
 * — so `WorkoutRepository` sits beside its sibling repositories rather than
 * inside the low-level driver folder that only ever holds the
 * backend-agnostic driver/migration plumbing itself. Logged in
 * `docs/plan/EXECUTION-LOG.md`'s M2-01 entry.
 *
 * ## Design notes
 *
 * - **One-active invariant** (05 §3.2 `idx_one_active_workout`, 02 §1):
 *   enforced twice — the partial unique index is the hard backstop, and
 *   `startEmpty` pre-checks `getActive()` (throwing {@link ActiveWorkoutExistsError}
 *   before ever attempting the INSERT) so the common case gets a clean typed
 *   error instead of a raw SQLite `UNIQUE constraint failed`; a defensive
 *   `catch` around the INSERT covers the same benign TOCTOU race
 *   `ExerciseRepositoryImpl.create`'s `catch` blocks exist for.
 * - **Auto-heal** (06 §9: "domain invariant violations ... auto-heal where
 *   safe (keep newest active, complete the other with `end_time=updated_at`),
 *   log to Sentry as warning"): `getActive()` defensively re-checks for
 *   *more than one* active row every time it runs — normally impossible
 *   given the unique index, but the index is exactly the kind of thing a
 *   future migration bug, a manual DB edit, or a pre-index legacy row could
 *   violate, and 08 §4.9 explicitly test-gates this path. When it finds
 *   more than one, it keeps the newest (by `start_time` then `created_at`
 *   DESC) and completes the rest (`state='completed'`, `end_time=updated_at`,
 *   both set to the same "now" timestamp). Reporting goes through the
 *   injectable {@link WorkoutRepositoryDeps.onAutoHeal} rather than calling
 *   `src/lib/sentry.ts` directly — `src/data` cannot import `src/lib` (06 §2
 *   dependency rule, lint-enforced) — defaulting to a `console.warn` so the
 *   event is never silently dropped even before the real caller (M2-03's
 *   `activeWorkoutStore`) wires in `recordBreadcrumb`/`captureError`.
 * - **`finish`** (05 §3.2's own invariants comment: "on finish,
 *   `is_completed=0` rows deleted and remaining all `=1`; positions
 *   contiguous from 0"): one transaction that (1) deletes every unchecked
 *   `sets` row for the workout, (2) renumbers each remaining exercise's
 *   surviving sets back to contiguous 0-based positions, (3) drops any
 *   `workout_exercises` row left with zero sets, (3b) auto-dissolves any
 *   superset group step 3 left with exactly one surviving member (02 §8
 *   "group of 1 dissolves automatically" — added per the M2-19 follow-up
 *   review; previously this only fired from the explicit "Remove from
 *   Superset" action, `activeWorkoutStore.removeFromSuperset`), (4) renumbers
 *   the workout's remaining exercises back to contiguous 0-based positions,
 *   (5) applies `meta` overrides and flips `state`/`end_time`.
 * - **Id generation**: `../shared/uuid.ts`'s `generateUuid` (async — the
 *   OS CSPRNG on device). Every mutator that both mints new ids **and**
 *   needs multi-statement atomicity pre-generates all needed ids via
 *   `await generateUuid()` calls *before* entering `driver.transaction(...)`
 *   — `SqliteDriver.transaction`'s callback is synchronous (mirrors
 *   `better-sqlite3`'s own `db.transaction()` contract), so nothing inside
 *   it may `await`.
 *
 * ## M2-02 additions — granular mutators + `previousSets`
 *
 * - **`addExercises`** (02 §3: "same number of set rows as its most recent
 *   performance ... otherwise one empty normal set"): row *count* only —
 *   the new rows are always bare (`set_type='normal'`, every value field
 *   `NULL`, unchecked). "Previous values as placeholders" is a *display*
 *   concept computed live by `previousSets`, never baked into stored rows
 *   (nothing here duplicates that data). Set-count lookup always uses
 *   occurrence 0 (the exercise's first/only occurrence in its most recent
 *   completed workout) regardless of how many times the exercise is being
 *   added *this* call — 02 §3 doesn't mention occurrence for row-count
 *   seeding, only `previousSets`' display lookup does (02 §16.6).
 * - **`previousSets`** (02 §6/§16.6, 05 §4's query-perf note): finds the
 *   single most recent completed workout containing `exerciseId` (optional
 *   `routineId` restriction, optional `beforeWorkoutId` "at or before this
 *   workout, excluding it" restriction — see `PreviousSetsQuery`'s doc
 *   comment in `./types.ts`), then the `occurrenceIndex`-th
 *   `workout_exercises` row for that exercise within that one workout (0-based,
 *   default 0), then all of that occurrence's `sets` split into two
 *   **independently-numbered buckets** — warm-up and non-warm-up — each in
 *   `position` order (02 §6: "warm-up rows reference the previous session's
 *   warm-up sets by warm-up index"). No `is_completed` filter is needed:
 *   every set in a *completed* workout is `is_completed=1` by the finish
 *   invariant, so "checked" is automatically true. A previous session with
 *   fewer sets than the current one simply yields fewer entries in the
 *   returned array — callers (M2-04's `domain/previous-values.ts`) treat a
 *   missing `bucketIndex` as "no previous value" (`—`), not this
 *   repository's concern. Reuses `idx_we_exercise` (exercise_id lookup) +
 *   `idx_workouts_start` (start_time ordering/filtering), per 05 §4.
 * - **`addExercises`'s internal set-count lookup** shares the exact same
 *   private helper `previousSets` uses (`findMostRecentOccurrenceSetRows`),
 *   just called with `occurrenceIndex: 0` and no `routineId`/`beforeWorkoutId`
 *   restriction — one source of truth for "what did the most recent
 *   completed occurrence of this exercise look like."
 * - **Undefined-vs-null patch convention** (`updateSet`/`updateExercise`/
 *   `updateMeta`): a key's absence in the patch object means "leave this
 *   field unchanged"; an explicit `null` (on nullable fields) means "clear
 *   it." Mirrors `ExerciseRepositoryImpl.update`'s `patch.field !== undefined`
 *   convention, extended to nullable value fields.
 * - **Position renumbering** (`removeExercise`/`reorderExercises`/`addSet`/
 *   `removeSet`): every mutator that adds/removes a row keeps
 *   `position` contiguous 0-based immediately, in the same transaction —
 *   not deferred to `finish` (05 §3.2's invariant applies at rest, not just
 *   post-finish).
 * - **`replaceExercise`** (02 §3: "keeps set count, clears values/placeholders"):
 *   repoints `exercise_id`, keeps every set row (and its `position`), but
 *   resets `set_type` to `'normal'`, `is_completed` to `0`, and nulls every
 *   value field — a wholesale "different exercise, same empty slots" reset.
 *   `notes`/`restSeconds`/`supersetId` are left untouched (conservative
 *   reading — the spec only calls out set values/placeholders).
 *
 * ## M3-05 addition — `startFromRoutine`
 *
 * - **Routine data access: raw SQL against `routines`/`routine_exercises`/
 *   `routine_sets`, not a `RoutineRepository` dependency.** Mirrors
 *   `RoutineRepositoryImpl.createFromWorkout`'s own already-established
 *   choice in the opposite direction (`data/routines/routine-repository.ts`'s
 *   header: "`src/data/routines/` has no reason to take a same-layer
 *   sibling repository as a constructor dependency when the three SELECTs
 *   it needs are this simple, and it keeps this repository constructible
 *   with only a `SqliteDriver`, same as every other one") — the identical
 *   reasoning applies here, symmetrically: three read-only `SELECT`s
 *   (`routines`, `routine_exercises`, `routine_sets`) don't justify adding
 *   `RoutineRepository` to this class's constructor, which would also
 *   force every `WorkoutRepositoryImpl` construction site (including every
 *   test in `__tests__/`) to also construct/inject a `RoutineRepository`
 *   just to satisfy the type.
 * - **Targets are never copied onto the new `sets` rows** — only
 *   `set_type`/`position` (all value fields stay `NULL`), same "previous
 *   values as placeholders is a display concept, never baked into stored
 *   rows" convention `addExercises` already established above; a routine
 *   target is resolved live at render time by the logger
 *   (`ExerciseSetTableSection.tsx`) looking up the source routine via
 *   `workout.routineId`, exactly parallel to how `previousSets` resolves
 *   live from history.
 * - **Exercise/set positions are renumbered 0-based contiguous from the
 *   source routine's own `position ASC` read order**, not copied verbatim
 *   — defensively matches every other position-owning mutator in this file
 *   (`addExercises`, `renumberExercisePositions`, …) rather than trusting
 *   the routine's stored positions are already gap-free.
 * - **`superset_id` is copied verbatim**, no remapping — a routine's
 *   `superset_id` is not a globally-unique id, just "the lowest `position`
 *   among the group's current members" (same scheme
 *   `ActiveWorkoutScreen.tsx`'s `handlePickerAdd`/`handleAddToSupersetConfirm`
 *   use for workouts), and since exercises are copied in the same order at
 *   the same 0-based positions, the source routine's own superset-group
 *   position-based ids remain correct unchanged on the new workout.
 * - **`title`/`description`** come from the routine's `title`/`notes` (02
 *   §1: "title = routine title"; this task's own reading of "routine note
 *   pre-fills each run" — `workouts.description` is the only workout-level
 *   note field, `RoutineFull.notes` the only routine-level one). Copied
 *   once at start time only — mid-workout edits to `workouts.description`
 *   never write back to `routines.notes` (`updateMeta` already only ever
 *   touches the `workouts` row).
 *
 * ## M3-05 review fix — `routine_occurrence_index` (migration 0003)
 *
 * The original landing computed each workout exercise's "which routine
 * occurrence do I match" purely from the *workout's* current position
 * order, live, on every render (`ActiveWorkoutScreen.tsx`'s now-removed
 * `exerciseOccurrenceIndexByWorkoutExerciseId` memo) — correct immediately
 * after `startFromRoutine` (positions mirror the routine 1:1) but silently
 * wrong once `reorderExercises` changed the workout's position order
 * without the source routine's own (fixed) order changing to match: for a
 * routine with the same exercise twice, flipping the two duplicated
 * instances' relative order in the workout cross-wired each one onto the
 * *other's* routine target. Fixed by pinning `routine_occurrence_index`
 * onto the `workout_exercises` row **once, here, at creation time** — the
 * exact order this exercise appears among same-`exercise_id` rows in the
 * *source routine's* own `position ASC` order (computed just below, from
 * `routineExerciseRows`, before any workout-side reordering can exist) —
 * rather than recomputing it later from state that reordering can change.
 * `addExercises` leaves it `NULL` (an exercise added mid-workout never came
 * from a routine occurrence); `replaceExercise` clears it back to `NULL`
 * (a stale index pointing at the *old* exercise's occurrence would be
 * actively wrong for the new one). See `schema.ts`'s column doc comment and
 * `ExerciseSetTableSection.tsx`'s file header for the read side.
 *
 * ## M3-06 review fix — `routine_set_position` (migration 0004)
 *
 * The identical class of bug, one level down, in M3-06's own landing this
 * time: `domain/routine-diff.ts`'s `computeRoutineDiff` and
 * `RoutineRepositoryImpl.updateFromWorkout` both originally correlated a
 * matched exercise's *sets* via plain `sets[i] <-> routine_sets[i]`
 * position-order matching, reasoning that "both sides are already stored in
 * `position ASC` order" made that a genuine 1:1 correspondence. False: this
 * file's own `finish()` (below) deletes every `is_completed=0` set and then
 * calls `renumberSetPositions` to re-compact the survivors back to
 * contiguous 0-based positions — preserving relative order but closing any
 * gap. So a *non-trailing* skipped set (e.g. set 1 of a 3-set exercise left
 * unchecked while sets 0 and 2 are completed) silently shifts every later
 * surviving set's `position` down by one: the achieved set that was
 * genuinely `routine_sets[2]` lands at post-finish `position` 1, and a
 * plain positional diff/write-back wrongly correlates it against
 * `routine_sets[1]` instead — silently collapsing a rep-range target that
 * should have survived, purely because a middle set was skipped. Nothing in
 * the UI/store enforces checking sets in order, so this was a real,
 * reachable path. Fixed with the exact same shape as the M3-05 fix above:
 * `routine_set_position` is pinned onto each `sets` row **once, here, at
 * `startFromRoutine` creation time** — the set's fixed 0-based position
 * among its *source routine_exercise's own* `routine_sets` (`position ASC`)
 * — and never touched again by `renumberSetPositions` (which only ever
 * writes `position`), so it keeps naming the true original `routine_sets`
 * row no matter what gets skipped around it later. `addSet`/
 * `insertWarmupSets`/`addExercises`'s own set inserts all leave it `NULL`
 * (never came from a routine set); `replaceExercise` clears it back to
 * `NULL` on every set under the row it repoints (same "stale index would be
 * actively wrong" reasoning as `routine_occurrence_index`). See
 * `domain/routine-diff.ts`'s file header ("Set correlation") for the full
 * write-up, including why a bucket-relative (warm-up/working) index —
 * `domain/previous-values.ts`'s scheme for a *different* problem — would
 * only have narrowed this bug, not closed it: that scheme is still
 * recomputed live from current row order, so a same-bucket skip reproduces
 * the identical shift.
 *
 * ## M3-07 addition -- startFromWorkout ("Repeat Workout", 02 par.1)
 *
 * Deliberately the leaner sibling of startFromRoutine above, not a
 * verbatim copy padded with routine-only fields: reads
 * workouts/workout_exercises/sets directly (raw SQL, same "don't take a
 * sibling repository as a constructor dependency for three read-only
 * SELECTs" reasoning startFromRoutine's own header already gives), copies
 * exercise order/superset grouping/notes/rest timers verbatim, and every
 * set as a bare unchecked row (setType/position only) -- identical shape
 * to startFromRoutine's own set-copy. Three deliberate differences from
 * startFromRoutine, each a judgment call documented here rather than
 * silently decided:
 *
 * - **routine_id is always NULL** on the new workout, never copied from
 *   the source workout's own routine_id even when it has one -- a repeat
 *   is explicitly "sourced from a past workout" (02 par.1's own wording),
 *   a different entry point from "Start Routine," and inheriting the
 *   source's routine_id would silently make the M3-06 update-routine
 *   prompt fire on finish for a workout the user never chose to start
 *   from that routine.
 * - **routine_occurrence_index/routine_set_position stay NULL** on every
 *   new row (both columns' default) for the identical reason -- nothing
 *   here came from a routine occurrence, so nothing should ever resolve a
 *   routine target against these rows.
 * - **No live "placeholder" plumbing needed at all** -- unlike
 *   startFromRoutine, whose targets are resolved live via
 *   workout.routineId + getRoutineFull (this file's own M3-05 note
 *   above), a repeated workout has no persistent link back to its source
 *   workout to resolve against later, and none is added (no schema
 *   change, no new column) -- because none is needed: with routineId
 *   null, ExerciseSetTableSection's own PREVIOUS query
 *   (`previousValuesMode === 'same_routine' && routineId ? {routineId} :
 *   undefined`) always falls through to `undefined` (any_workout mode)
 *   for a repeated workout, and any_workout mode's own definition -- "the
 *   single most recent completed workout containing this exerciseId" --
 *   is *already* the source workout at the moment the repeat starts
 *   (nothing more recent has finished yet). So the source workout's
 *   achieved values surface as PREVIOUS placeholders through the exact
 *   same, already-tested previousSets mechanism every non-routine workout
 *   already uses, with zero new display-layer code.
 *
 * ## M4-02 additions — `setsForExercise` + `exerciseHistoryWatermark`
 *
 * The records/charts feed 05 §6 always specified but M2/M3 never
 * implemented (`./types.ts`'s own header). Both are plain reads, both
 * scoped identically (`workout_exercises.exercise_id = ?` joined to
 * `workouts`, filtered to `state = 'completed' AND deleted_at IS NULL` — an
 * active workout's own sets are never PR-eligible history, 04 §5.2) and
 * both are documented in full on their own interface declarations in
 * `./types.ts` rather than here, matching that file's existing convention
 * of carrying the "why" for query-only methods (`previousSets` is the
 * precedent). `exerciseHistoryWatermark` has no 05 §6 citation — it is a
 * new addition this task introduces specifically to make `RecordsService`'s
 * `06` §4.4 "memoized ... cache keyed by `updated_at` watermark" possible
 * without re-fetching and re-folding a whole exercise's history just to
 * find out nothing changed.
 */
import type { ExerciseType, Rpe, SetType } from '@/domain/enums';
import type { HistoricalSet } from '@/domain/records';

import { generateUuid } from '../shared/uuid';
import type { SqliteDriver } from '../sqlite/driver';
import {
  ActiveWorkoutExistsError,
  ReorderMismatchError,
  RoutineNotFoundForWorkoutError,
  SetNotFoundError,
  WorkoutExerciseNotFoundError,
  WorkoutNotActiveError,
  WorkoutNotFoundError,
} from './errors';
import type {
  AddExerciseItem,
  AutoHealEvent,
  FinishMeta,
  ListCompletedPage,
  NewSetInput,
  PreviousSet,
  PreviousSetsQuery,
  UpdateExerciseInput,
  UpdateMetaInput,
  UpdateSetInput,
  WorkoutExerciseFull,
  WorkoutFull,
  WorkoutRepository,
  WorkoutRepositoryDeps,
  WorkoutSet,
  WorkoutSummary,
} from './types';

// ---------------------------------------------------------------------------
// Raw row shapes (snake_case) — the SQL-boundary shape this file maps
// to/from the camelCase `WorkoutFull`/`WorkoutExerciseFull`/`WorkoutSet`
// types (05 §3.2).
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string;
  title: string;
  description: string | null;
  routine_id: string | null;
  state: string;
  start_time: number;
  end_time: number | null;
  duration_pause_offset_ms: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  superset_id: number | null;
  notes: string | null;
  rest_seconds: number | null;
  routine_occurrence_index: number | null;
}

interface SetRow {
  id: string;
  workout_exercise_id: string;
  position: number;
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
  is_completed: number;
  routine_set_position: number | null;
}

function mapSetRow(row: SetRow): WorkoutSet {
  return {
    id: row.id,
    position: row.position,
    setType: row.set_type as WorkoutSet['setType'],
    weightKg: row.weight_kg,
    reps: row.reps,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    rpe: row.rpe as WorkoutSet['rpe'],
    customMetric: row.custom_metric,
    isCompleted: row.is_completed === 1,
    routineSetPosition: row.routine_set_position,
  };
}

function mapWorkoutExerciseRow(row: WorkoutExerciseRow, sets: WorkoutSet[]): WorkoutExerciseFull {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    position: row.position,
    supersetId: row.superset_id,
    notes: row.notes,
    restSeconds: row.rest_seconds,
    routineOccurrenceIndex: row.routine_occurrence_index,
    sets,
  };
}

function mapWorkoutRow(row: WorkoutRow, exercises: WorkoutExerciseFull[]): WorkoutFull {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    routineId: row.routine_id,
    state: row.state as WorkoutFull['state'],
    startTime: row.start_time,
    endTime: row.end_time,
    durationPauseOffsetMs: row.duration_pause_offset_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    exercises,
  };
}

function mapWorkoutSummaryRow(row: WorkoutRow): WorkoutSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    routineId: row.routine_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationPauseOffsetMs: row.duration_pause_offset_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPreviousSetRow(row: SetRow, bucketIndex: number, isWarmup: boolean): PreviousSet {
  return {
    bucketIndex,
    isWarmup,
    setType: row.set_type as SetType,
    weightKg: row.weight_kg,
    reps: row.reps,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    rpe: row.rpe as Rpe | null,
    customMetric: row.custom_metric,
  };
}

/** One joined `sets`/`workout_exercises`/`workouts` row for {@link WorkoutRepositoryImpl.setsForExercise} — already filtered/ordered by the SQL query itself (M4-02); `setOrder` is assigned afterward from the row's position in that already-sorted array, not read off any column (see that method's own comment). */
interface HistoricalSetRow {
  set_id: string;
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  is_completed: number;
  workout_id: string;
  workout_start_time: number;
}

function mapHistoricalSetRow(row: HistoricalSetRow, setOrder: number, exerciseType: ExerciseType): HistoricalSet {
  return {
    setId: row.set_id,
    workoutId: row.workout_id,
    workoutStartTime: row.workout_start_time,
    setOrder,
    exerciseType,
    setType: row.set_type as SetType,
    isCompleted: row.is_completed === 1,
    weightKg: row.weight_kg,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
  };
}

/** `true` when `error` is the SQLite unique-constraint-violation raised by either backend (both surface the SQLite engine's verbatim message text) — same helper `ExerciseRepositoryImpl` uses. */
function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

const DEFAULT_ON_AUTO_HEAL = (event: AutoHealEvent): void => {
  // See WorkoutRepositoryDeps.onAutoHeal's doc comment: src/data cannot
  // import src/lib/sentry.ts, so this is the fallback reporter until the
  // real caller injects one.
  console.warn(
    `[WorkoutRepository] auto-healed ${event.healedWorkoutIds.length} extra active workout(s) ` +
      `(kept "${event.keptWorkoutId}"); healed: ${event.healedWorkoutIds.join(', ')}. ` +
      'Wire WorkoutRepositoryDeps.onAutoHeal to src/lib/sentry.ts at the construction site for real Sentry reporting (06 §9).',
  );
};

export class WorkoutRepositoryImpl implements WorkoutRepository {
  private readonly onAutoHeal: (event: AutoHealEvent) => void;

  constructor(
    private readonly driver: SqliteDriver,
    deps: WorkoutRepositoryDeps = {},
  ) {
    this.onAutoHeal = deps.onAutoHeal ?? DEFAULT_ON_AUTO_HEAL;
  }

  // ---------------------------------------------------------------------
  // M2-01 — lifecycle
  // ---------------------------------------------------------------------

  async getActive(): Promise<WorkoutFull | null> {
    const activeRows = this.driver.queryAll<WorkoutRow>(
      `SELECT * FROM workouts WHERE state = 'active' AND deleted_at IS NULL
       ORDER BY start_time DESC, created_at DESC`,
    );

    if (activeRows.length === 0) {
      return null;
    }

    if (activeRows.length > 1) {
      this.autoHealMultipleActive(activeRows);
      const healed = this.driver.queryAll<WorkoutRow>(
        `SELECT * FROM workouts WHERE state = 'active' AND deleted_at IS NULL`,
      )[0];
      return healed ? this.hydrateWorkout(healed) : null;
    }

    return this.hydrateWorkout(activeRows[0]!);
  }

  async startEmpty(input: { title: string; startTime: number }): Promise<WorkoutFull> {
    const active = await this.getActive();
    if (active) {
      throw new ActiveWorkoutExistsError(active.id);
    }

    const id = await generateUuid();
    const now = Date.now();

    try {
      this.driver.transaction(() => {
        this.driver.execute(
          `INSERT INTO workouts
             (id, title, state, start_time, duration_pause_offset_ms, created_at, updated_at)
           VALUES (?, ?, 'active', ?, 0, ?, ?)`,
          [id, input.title, input.startTime, now, now],
        );
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ActiveWorkoutExistsError(id);
      }
      throw error;
    }

    return (await this.getFull(id))!;
  }

  async startFromRoutine(routineId: string): Promise<WorkoutFull> {
    const active = await this.getActive();
    if (active) {
      throw new ActiveWorkoutExistsError(active.id);
    }

    const routineRow = this.driver.queryAll<{ id: string; title: string; notes: string | null }>(
      `SELECT id, title, notes FROM routines WHERE id = ?`,
      [routineId],
    )[0];
    if (!routineRow) {
      throw new RoutineNotFoundForWorkoutError(routineId);
    }

    const routineExerciseRows = this.driver.queryAll<{
      id: string;
      exercise_id: string;
      superset_id: number | null;
      notes: string | null;
      rest_seconds: number | null;
    }>(
      `SELECT id, exercise_id, superset_id, notes, rest_seconds
       FROM routine_exercises WHERE routine_id = ? ORDER BY position ASC`,
      [routineId],
    );

    const routineSetRowsByExercise = routineExerciseRows.map((re) =>
      this.driver.queryAll<{ set_type: string }>(
        `SELECT set_type FROM routine_sets WHERE routine_exercise_id = ? ORDER BY position ASC`,
        [re.id],
      ),
    );

    // Each routine_exercise's own fixed 0-based occurrence index among every
    // routine_exercise sharing its `exercise_id`, in the routine's own
    // `position ASC` order — computed once, here, from the source routine's
    // exercise order (never the workout's own, which `reorderExercises` can
    // freely change later without disturbing this value). Pinned onto the
    // new `workout_exercises` row below (`routine_occurrence_index`) so
    // `ExerciseSetTableSection` can match each workout exercise back to
    // *its own* routine occurrence for its whole lifetime — see
    // `schema.ts`'s column doc comment and `ActiveWorkoutScreen.tsx`'s file
    // header for the review-fix writeup this addresses.
    const routineOccurrenceCounts = new Map<string, number>();
    const routineOccurrenceIndexes = routineExerciseRows.map((re) => {
      const occurrence = routineOccurrenceCounts.get(re.exercise_id) ?? 0;
      routineOccurrenceCounts.set(re.exercise_id, occurrence + 1);
      return occurrence;
    });

    // Ids first, before the sync transaction (file header's "Id generation"
    // note) — `driver.transaction`'s callback is synchronous.
    const workoutId = await generateUuid();
    const prepared = await Promise.all(
      routineExerciseRows.map(async (re, index) => ({
        weId: await generateUuid(),
        re,
        occurrenceIndex: routineOccurrenceIndexes[index]!,
        setTypes: routineSetRowsByExercise[index]!.map((row) => row.set_type),
        setIds: await Promise.all(routineSetRowsByExercise[index]!.map(() => generateUuid())),
      })),
    );

    const now = Date.now();
    try {
      this.driver.transaction(() => {
        this.driver.execute(
          `INSERT INTO workouts
             (id, title, description, routine_id, state, start_time, duration_pause_offset_ms, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?)`,
          [workoutId, routineRow.title, routineRow.notes, routineId, now, now, now],
        );

        prepared.forEach(({ weId, re, occurrenceIndex, setTypes, setIds }, position) => {
          this.driver.execute(
            `INSERT INTO workout_exercises
               (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds, routine_occurrence_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              weId,
              workoutId,
              re.exercise_id,
              position,
              re.superset_id,
              re.notes,
              re.rest_seconds,
              occurrenceIndex,
            ],
          );

          // `routine_set_position` pinned to this same 0-based index — the
          // set's fixed position among the *source* `routine_sets` (`position
          // ASC`, `routineSetRowsByExercise` above) — so it survives
          // `finish()`'s later `renumberSetPositions` compaction unchanged.
          // See this file's header, "M3-06 review fix".
          setIds.forEach((setId, setPosition) => {
            this.driver.execute(
              `INSERT INTO sets (id, workout_exercise_id, position, set_type, is_completed, routine_set_position)
               VALUES (?, ?, ?, ?, 0, ?)`,
              [setId, weId, setPosition, setTypes[setPosition], setPosition],
            );
          });
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ActiveWorkoutExistsError(workoutId);
      }
      throw error;
    }

    return (await this.getFull(workoutId))!;
  }

  async startFromWorkout(sourceWorkoutId: string): Promise<WorkoutFull> {
    const active = await this.getActive();
    if (active) {
      throw new ActiveWorkoutExistsError(active.id);
    }

    // Reuses the same `requireWorkoutRow` guard every other id-keyed lookup
    // in this class uses (excludes soft-deleted rows, throws the shared
    // `WorkoutNotFoundError` — see this file's header, "M3-07 addition").
    const sourceRow = this.requireWorkoutRow(sourceWorkoutId);

    const sourceExerciseRows = this.driver.queryAll<{
      id: string;
      exercise_id: string;
      superset_id: number | null;
      notes: string | null;
      rest_seconds: number | null;
    }>(
      `SELECT id, exercise_id, superset_id, notes, rest_seconds
       FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC`,
      [sourceWorkoutId],
    );

    const sourceSetRowsByExercise = sourceExerciseRows.map((we) =>
      this.driver.queryAll<{ set_type: string }>(
        `SELECT set_type FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
        [we.id],
      ),
    );

    // Ids first, before the sync transaction (file header's "Id generation"
    // note) — `driver.transaction`'s callback is synchronous.
    const workoutId = await generateUuid();
    const prepared = await Promise.all(
      sourceExerciseRows.map(async (we, index) => ({
        weId: await generateUuid(),
        we,
        setTypes: sourceSetRowsByExercise[index]!.map((row) => row.set_type),
        setIds: await Promise.all(sourceSetRowsByExercise[index]!.map(() => generateUuid())),
      })),
    );

    const now = Date.now();
    try {
      this.driver.transaction(() => {
        this.driver.execute(
          `INSERT INTO workouts
             (id, title, description, state, start_time, duration_pause_offset_ms, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, 0, ?, ?)`,
          [workoutId, sourceRow.title, sourceRow.description, now, now, now],
        );

        // No `routine_occurrence_index`/`routine_set_position` pinned here
        // (both stay `NULL`, their default) — this workout wasn't started
        // from a routine, so nothing should ever resolve a routine target
        // against these rows (mirrors `addExercises`'s own plain-add rows).
        prepared.forEach(({ weId, we, setTypes, setIds }, position) => {
          this.driver.execute(
            `INSERT INTO workout_exercises
               (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [weId, workoutId, we.exercise_id, position, we.superset_id, we.notes, we.rest_seconds],
          );

          setIds.forEach((setId, setPosition) => {
            this.driver.execute(
              `INSERT INTO sets (id, workout_exercise_id, position, set_type, is_completed)
               VALUES (?, ?, ?, ?, 0)`,
              [setId, weId, setPosition, setTypes[setPosition]],
            );
          });
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ActiveWorkoutExistsError(workoutId);
      }
      throw error;
    }

    return (await this.getFull(workoutId))!;
  }

  async discard(id: string): Promise<void> {
    const row = this.requireWorkoutRow(id);
    if (row.state !== 'active') {
      throw new WorkoutNotActiveError(id);
    }
    this.driver.transaction(() => {
      // ON DELETE CASCADE (05 §3.2) removes workout_exercises + sets.
      this.driver.execute(`DELETE FROM workouts WHERE id = ?`, [id]);
    });
  }

  async finish(id: string, meta: FinishMeta = {}): Promise<WorkoutFull> {
    const workout = this.requireWorkoutRow(id);
    if (workout.state !== 'active') {
      throw new WorkoutNotActiveError(id);
    }

    const now = Date.now();
    const title = meta.title ?? workout.title;
    const description = meta.description !== undefined ? meta.description : workout.description;
    const startTime = meta.startTime ?? workout.start_time;
    const endTime = meta.endTime ?? now;

    this.driver.transaction(() => {
      // 1. Delete every unchecked set in this workout.
      this.driver.execute(
        `DELETE FROM sets WHERE is_completed = 0
           AND workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
        [id],
      );

      // 2. Renumber each remaining exercise's surviving sets to stay
      //    contiguous from 0 (05 §3.2 invariant).
      const exerciseIds = this.driver
        .queryAll<{ id: string }>(`SELECT id FROM workout_exercises WHERE workout_id = ?`, [id])
        .map((row) => row.id);
      for (const workoutExerciseId of exerciseIds) {
        this.renumberSetPositions(workoutExerciseId);
      }

      // 3. Drop exercises left with zero sets.
      this.driver.execute(
        `DELETE FROM workout_exercises
         WHERE workout_id = ?
           AND id NOT IN (SELECT DISTINCT workout_exercise_id FROM sets)`,
        [id],
      );

      // 3b. Superset auto-dissolve (02 §8: "group of 1 dissolves
      // automatically"). Dropping a zero-set exercise above can leave a
      // superset group with exactly one surviving member — without this
      // pass that lone survivor would keep its `superset_id`, showing up in
      // saved history as a "superset" with no partner. This mirrors
      // `domain/supersets.ts`'s `computeDissolution`, which
      // `activeWorkoutStore.removeFromSuperset` already applies for the
      // explicit "Remove from Superset" action — `finish()` is the other
      // place group membership can shrink (every set of a member
      // unchecked), so it needs the same invariant (M2-19 follow-up review
      // finding, `docs/qa/M2-checklist.md` §3.1).
      const survivingExercises = this.driver.queryAll<{ id: string; superset_id: number | null }>(
        `SELECT id, superset_id FROM workout_exercises WHERE workout_id = ?`,
        [id],
      );
      const groupMemberIds = new Map<number, string[]>();
      for (const exercise of survivingExercises) {
        if (exercise.superset_id === null) {
          continue;
        }
        const members = groupMemberIds.get(exercise.superset_id) ?? [];
        members.push(exercise.id);
        groupMemberIds.set(exercise.superset_id, members);
      }
      for (const members of groupMemberIds.values()) {
        if (members.length === 1) {
          this.driver.execute(
            `UPDATE workout_exercises SET superset_id = NULL WHERE id = ?`,
            [members[0]],
          );
        }
      }

      // 4. Renumber the workout's remaining exercises to stay contiguous.
      this.renumberExercisePositions(id);

      // 5. Apply meta overrides and flip to completed.
      this.driver.execute(
        `UPDATE workouts
         SET title = ?, description = ?, start_time = ?, end_time = ?, state = 'completed', updated_at = ?
         WHERE id = ?`,
        [title, description, startTime, endTime, now, id],
      );
    });

    return (await this.getFull(id))!;
  }

  async getFull(id: string): Promise<WorkoutFull | null> {
    const row = this.findWorkoutRow(id);
    if (!row || row.deleted_at !== null) {
      return null;
    }
    return this.hydrateWorkout(row);
  }

  async listCompleted(page: ListCompletedPage = {}): Promise<WorkoutSummary[]> {
    const conditions = [`state = 'completed'`, `deleted_at IS NULL`];
    const params: unknown[] = [];

    if (page.before !== undefined) {
      conditions.push('start_time < ?');
      params.push(page.before);
    }

    const limit = page.limit ?? 20;
    params.push(limit);

    const rows = this.driver.queryAll<WorkoutRow>(
      `SELECT * FROM workouts WHERE ${conditions.join(' AND ')} ORDER BY start_time DESC LIMIT ?`,
      params,
    );
    return rows.map(mapWorkoutSummaryRow);
  }

  async softDelete(id: string): Promise<void> {
    this.requireWorkoutRow(id);
    const now = Date.now();
    this.driver.transaction(() => {
      this.driver.execute(`UPDATE workouts SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
        now,
        now,
        id,
      ]);
    });
  }

  // ---------------------------------------------------------------------
  // M2-02 — granular mutators + previousSets
  // ---------------------------------------------------------------------

  async addExercises(
    workoutId: string,
    items: AddExerciseItem[],
  ): Promise<WorkoutExerciseFull[]> {
    this.requireWorkoutRow(workoutId);
    if (items.length === 0) {
      return [];
    }

    // Reads (history lookups) + id generation happen before the sync
    // transaction — see this file's header note on `generateUuid` timing.
    const prepared: { weId: string; setIds: string[]; item: AddExerciseItem }[] = [];
    for (const item of items) {
      const weId = await generateUuid();
      const historyRows = this.findMostRecentOccurrenceSetRows(item.exerciseId, {});
      const setCount = historyRows.length > 0 ? historyRows.length : 1;
      const setIds = await Promise.all(Array.from({ length: setCount }, () => generateUuid()));
      prepared.push({ weId, setIds, item });
    }

    this.driver.transaction(() => {
      let position = this.nextExercisePosition(workoutId);
      for (const { weId, setIds, item } of prepared) {
        // `routine_occurrence_index` deliberately left unlisted — it has no
        // column default set in `schema.ts`, so SQLite leaves it `NULL`,
        // exactly right: an exercise added mid-workout via `+ Add Exercise`
        // never came from a routine occurrence, so it must never match one
        // (`ExerciseSetTableSection`'s matching short-circuits on `null`).
        this.driver.execute(
          `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            weId,
            workoutId,
            item.exerciseId,
            position,
            item.supersetId ?? null,
            item.notes ?? null,
            item.restSeconds ?? null,
          ],
        );
        position += 1;

        setIds.forEach((setId, index) => {
          this.driver.execute(
            `INSERT INTO sets (id, workout_exercise_id, position, set_type, is_completed)
             VALUES (?, ?, ?, 'normal', 0)`,
            [setId, weId, index],
          );
        });
      }
    });

    return prepared.map(({ weId }) => this.requireWorkoutExerciseFull(weId));
  }

  async removeExercise(workoutId: string, workoutExerciseId: string): Promise<void> {
    this.requireWorkoutExerciseRow(workoutExerciseId, workoutId);
    this.driver.transaction(() => {
      this.driver.execute(`DELETE FROM workout_exercises WHERE id = ?`, [workoutExerciseId]);
      this.renumberExercisePositions(workoutId);
    });
  }

  async reorderExercises(workoutId: string, orderedWorkoutExerciseIds: string[]): Promise<void> {
    const existingIds = this.driver
      .queryAll<{ id: string }>(`SELECT id FROM workout_exercises WHERE workout_id = ?`, [
        workoutId,
      ])
      .map((row) => row.id);
    const existingSet = new Set(existingIds);
    const isExactPermutation =
      existingSet.size === orderedWorkoutExerciseIds.length &&
      new Set(orderedWorkoutExerciseIds).size === orderedWorkoutExerciseIds.length &&
      orderedWorkoutExerciseIds.every((id) => existingSet.has(id));

    if (!isExactPermutation) {
      throw new ReorderMismatchError(workoutId);
    }

    this.driver.transaction(() => {
      orderedWorkoutExerciseIds.forEach((weId, index) => {
        this.driver.execute(`UPDATE workout_exercises SET position = ? WHERE id = ?`, [
          index,
          weId,
        ]);
      });
    });
  }

  async replaceExercise(
    workoutExerciseId: string,
    newExerciseId: string,
  ): Promise<WorkoutExerciseFull> {
    this.requireWorkoutExerciseRow(workoutExerciseId);
    this.driver.transaction(() => {
      // `routine_occurrence_index` is cleared here too, not just left as-is:
      // whatever routine occurrence this row's *old* `exercise_id` matched
      // is meaningless once the exercise identity itself has changed — the
      // stale index would otherwise silently point at some other exercise's
      // occurrence in the routine (or an out-of-range one) after this swap.
      this.driver.execute(
        `UPDATE workout_exercises SET exercise_id = ?, routine_occurrence_index = NULL WHERE id = ?`,
        [newExerciseId, workoutExerciseId],
      );
      // `routine_set_position` cleared here too, for the identical reason
      // `routine_occurrence_index` is cleared above: a stale index pointing
      // at the *old* exercise's routine_sets would be actively wrong for
      // the new one (this file's header, "M3-06 review fix").
      this.driver.execute(
        `UPDATE sets
         SET set_type = 'normal', weight_kg = NULL, reps = NULL, distance_meters = NULL,
             duration_seconds = NULL, rpe = NULL, custom_metric = NULL, is_completed = 0,
             routine_set_position = NULL
         WHERE workout_exercise_id = ?`,
        [workoutExerciseId],
      );
    });
    return this.requireWorkoutExerciseFull(workoutExerciseId);
  }

  async addSet(workoutExerciseId: string, input: NewSetInput = {}): Promise<WorkoutSet> {
    this.requireWorkoutExerciseRow(workoutExerciseId);
    const id = await generateUuid();

    this.driver.transaction(() => {
      const position = this.nextSetPosition(workoutExerciseId);
      this.driver.execute(
        `INSERT INTO sets
           (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
            duration_seconds, rpe, custom_metric, is_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          id,
          workoutExerciseId,
          position,
          input.setType ?? 'normal',
          input.weightKg ?? null,
          input.reps ?? null,
          input.distanceMeters ?? null,
          input.durationSeconds ?? null,
          input.rpe ?? null,
          input.customMetric ?? null,
        ],
      );
    });

    return mapSetRow(this.requireSetRow(id));
  }

  async insertWarmupSets(
    workoutExerciseId: string,
    rows: NewSetInput[],
  ): Promise<WorkoutExerciseFull> {
    this.requireWorkoutExerciseRow(workoutExerciseId);
    if (rows.length === 0) {
      return this.requireWorkoutExerciseFull(workoutExerciseId);
    }

    // Ids first, same "generate before entering the sync transaction"
    // ordering every multi-id mutator here uses (file header's `addExercises`
    // note) — `driver.transaction`'s callback is synchronous.
    const ids = await Promise.all(rows.map(() => generateUuid()));

    this.driver.transaction(() => {
      // Make room at the front: every existing set shifts down by
      // `rows.length`. No UNIQUE constraint on (workout_exercise_id,
      // position) (`idx_sets_we` is a plain lookup index, `schema.ts`), so
      // this single UPDATE is safe regardless of row order/overlap with the
      // new rows' target positions (0..rows.length-1), which are inserted
      // next, after the shift.
      this.driver.execute(
        `UPDATE sets SET position = position + ? WHERE workout_exercise_id = ?`,
        [rows.length, workoutExerciseId],
      );

      rows.forEach((input, index) => {
        this.driver.execute(
          `INSERT INTO sets
             (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
              duration_seconds, rpe, custom_metric, is_completed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            ids[index],
            workoutExerciseId,
            index,
            input.setType ?? 'warmup',
            input.weightKg ?? null,
            input.reps ?? null,
            input.distanceMeters ?? null,
            input.durationSeconds ?? null,
            input.rpe ?? null,
            input.customMetric ?? null,
          ],
        );
      });
    });

    return this.requireWorkoutExerciseFull(workoutExerciseId);
  }

  async updateSet(setId: string, patch: UpdateSetInput): Promise<WorkoutSet> {
    const existing = this.requireSetRow(setId);
    const weightKg = patch.weightKg !== undefined ? patch.weightKg : existing.weight_kg;
    const reps = patch.reps !== undefined ? patch.reps : existing.reps;
    const distanceMeters =
      patch.distanceMeters !== undefined ? patch.distanceMeters : existing.distance_meters;
    const durationSeconds =
      patch.durationSeconds !== undefined ? patch.durationSeconds : existing.duration_seconds;
    const rpe = patch.rpe !== undefined ? patch.rpe : existing.rpe;
    const customMetric =
      patch.customMetric !== undefined ? patch.customMetric : existing.custom_metric;

    this.driver.transaction(() => {
      this.driver.execute(
        `UPDATE sets
         SET weight_kg = ?, reps = ?, distance_meters = ?, duration_seconds = ?, rpe = ?, custom_metric = ?
         WHERE id = ?`,
        [weightKg, reps, distanceMeters, durationSeconds, rpe, customMetric, setId],
      );
    });

    return mapSetRow(this.requireSetRow(setId));
  }

  async removeSet(setId: string): Promise<void> {
    const existing = this.requireSetRow(setId);
    this.driver.transaction(() => {
      this.driver.execute(`DELETE FROM sets WHERE id = ?`, [setId]);
      this.renumberSetPositions(existing.workout_exercise_id);
    });
  }

  async setSetType(setId: string, setType: SetType): Promise<WorkoutSet> {
    this.requireSetRow(setId);
    this.driver.transaction(() => {
      this.driver.execute(`UPDATE sets SET set_type = ? WHERE id = ?`, [setType, setId]);
    });
    return mapSetRow(this.requireSetRow(setId));
  }

  async setCompleted(setId: string, isCompleted: boolean): Promise<WorkoutSet> {
    this.requireSetRow(setId);
    this.driver.transaction(() => {
      this.driver.execute(`UPDATE sets SET is_completed = ? WHERE id = ?`, [
        isCompleted ? 1 : 0,
        setId,
      ]);
    });
    return mapSetRow(this.requireSetRow(setId));
  }

  async updateExercise(
    workoutExerciseId: string,
    patch: UpdateExerciseInput,
  ): Promise<WorkoutExerciseFull> {
    const existing = this.requireWorkoutExerciseRow(workoutExerciseId);
    const notes = patch.notes !== undefined ? patch.notes : existing.notes;
    const restSeconds =
      patch.restSeconds !== undefined ? patch.restSeconds : existing.rest_seconds;
    const supersetId =
      patch.supersetId !== undefined ? patch.supersetId : existing.superset_id;

    this.driver.transaction(() => {
      this.driver.execute(
        `UPDATE workout_exercises SET notes = ?, rest_seconds = ?, superset_id = ? WHERE id = ?`,
        [notes, restSeconds, supersetId, workoutExerciseId],
      );
    });

    return this.requireWorkoutExerciseFull(workoutExerciseId);
  }

  async updateMeta(workoutId: string, patch: UpdateMetaInput): Promise<WorkoutFull> {
    const existing = this.requireWorkoutRow(workoutId);
    const title = patch.title !== undefined ? patch.title : existing.title;
    const description =
      patch.description !== undefined ? patch.description : existing.description;
    const startTime = patch.startTime !== undefined ? patch.startTime : existing.start_time;
    const endTime = patch.endTime !== undefined ? patch.endTime : existing.end_time;
    const durationPauseOffsetMs =
      patch.durationPauseOffsetMs !== undefined
        ? patch.durationPauseOffsetMs
        : existing.duration_pause_offset_ms;
    const now = Date.now();

    this.driver.transaction(() => {
      this.driver.execute(
        `UPDATE workouts
         SET title = ?, description = ?, start_time = ?, end_time = ?, duration_pause_offset_ms = ?, updated_at = ?
         WHERE id = ?`,
        [title, description, startTime, endTime, durationPauseOffsetMs, now, workoutId],
      );
    });

    return (await this.getFull(workoutId))!;
  }

  async previousSets(exerciseId: string, opts: PreviousSetsQuery = {}): Promise<PreviousSet[]> {
    const rows = this.findMostRecentOccurrenceSetRows(exerciseId, opts);
    const warmups = rows.filter((row) => row.set_type === 'warmup');
    const nonWarmups = rows.filter((row) => row.set_type !== 'warmup');

    return [
      ...nonWarmups.map((row, index) => mapPreviousSetRow(row, index, false)),
      ...warmups.map((row, index) => mapPreviousSetRow(row, index, true)),
    ];
  }

  async setsForExercise(exerciseId: string): Promise<HistoricalSet[]> {
    // `exercise_type` is a property of the exercise, not of any one set —
    // every row this query returns is for the same `exerciseId`, so one
    // lookup covers the whole result (see `./types.ts`'s doc comment). No
    // rows (unknown/never-logged exerciseId) is a legitimate "no history
    // yet" answer, not an error — mirrors `previousSets`'s own permissive
    // handling of an exercise it can't find anything for.
    const exerciseRow = this.driver.queryAll<{ exercise_type: string }>(
      `SELECT exercise_type FROM exercises WHERE id = ?`,
      [exerciseId],
    )[0];
    if (!exerciseRow) {
      return [];
    }

    const rows = this.driver.queryAll<HistoricalSetRow>(
      `SELECT s.id AS set_id, s.set_type, s.weight_kg, s.reps, s.duration_seconds, s.is_completed,
              we.workout_id AS workout_id, w.start_time AS workout_start_time
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE we.exercise_id = ? AND w.state = 'completed' AND w.deleted_at IS NULL
       ORDER BY w.start_time ASC, we.position ASC, s.position ASC`,
      [exerciseId],
    );

    const exerciseType = exerciseRow.exercise_type as ExerciseType;
    return rows.map((row, index) => mapHistoricalSetRow(row, index, exerciseType));
  }

  /**
   * M4-02 review fix: this must be sensitive to *every* completed workout
   * that ever referenced `exerciseId` being deleted, not just to whichever
   * one currently happens to hold the per-exercise max `updated_at`. A
   * naive `MAX(w.updated_at) WHERE deleted_at IS NULL` (the original M4-02
   * shape) drops a soft-deleted row out of the aggregate entirely — so if
   * that row wasn't already the max, its `updated_at` bump from
   * `softDelete` is invisible and the aggregate can return the *exact same
   * number* before and after the delete, even though `setsForExercise`'s
   * own result just changed (that workout's sets left history). A
   * `RecordsService` cache entry keyed on that unchanged watermark would
   * then wrongly report a hit and keep serving the deleted workout's sets
   * (proven by a repro test in `__tests__/workout-repository.records.test
   * .ts` before this fix; see also `records-service.test.ts`'s companion
   * integration case).
   *
   * Fix: aggregate `MAX(updated_at)` over **every** completed workout that
   * references `exerciseId`, deleted or not (so a delete's own `updated_at`
   * bump — `softDelete` always sets one — always moves the number), but
   * report `0` whenever no currently-alive (non-deleted) completed workout
   * remains, preserving "0 means no history to show" for every existing
   * caller/test. `aliveCount` and `watermark` are computed in the one
   * query (`SUM`/`MAX` over the same joined rows) rather than two round
   * trips.
   */
  async exerciseHistoryWatermark(exerciseId: string): Promise<number> {
    const row = this.driver.queryAll<{ alive_count: number | null; watermark: number | null }>(
      `SELECT
         SUM(CASE WHEN w.deleted_at IS NULL THEN 1 ELSE 0 END) AS alive_count,
         MAX(w.updated_at) AS watermark
       FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       WHERE we.exercise_id = ? AND w.state = 'completed'`,
      [exerciseId],
    )[0];
    if (!row || !row.alive_count) {
      return 0;
    }
    return row.watermark ?? 0;
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private findWorkoutRow(id: string): WorkoutRow | undefined {
    return this.driver.queryAll<WorkoutRow>(`SELECT * FROM workouts WHERE id = ?`, [id])[0];
  }

  private requireWorkoutRow(id: string): WorkoutRow {
    const row = this.findWorkoutRow(id);
    if (!row || row.deleted_at !== null) {
      throw new WorkoutNotFoundError(id);
    }
    return row;
  }

  private hydrateWorkout(row: WorkoutRow): WorkoutFull {
    const exerciseRows = this.driver.queryAll<WorkoutExerciseRow>(
      `SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC`,
      [row.id],
    );
    const exercises = exerciseRows.map((weRow) => this.hydrateWorkoutExercise(weRow));
    return mapWorkoutRow(row, exercises);
  }

  private hydrateWorkoutExercise(weRow: WorkoutExerciseRow): WorkoutExerciseFull {
    const setRows = this.driver.queryAll<SetRow>(
      `SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
      [weRow.id],
    );
    return mapWorkoutExerciseRow(weRow, setRows.map(mapSetRow));
  }

  /** Renumber `sets.position` for one exercise's rows to be contiguous 0-based, preserving current order. */
  private renumberSetPositions(workoutExerciseId: string): void {
    const rows = this.driver.queryAll<{ id: string }>(
      `SELECT id FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
      [workoutExerciseId],
    );
    rows.forEach((row, index) => {
      this.driver.execute(`UPDATE sets SET position = ? WHERE id = ?`, [index, row.id]);
    });
  }

  /** Renumber `workout_exercises.position` for one workout's rows to be contiguous 0-based, preserving current order. */
  private renumberExercisePositions(workoutId: string): void {
    const rows = this.driver.queryAll<{ id: string }>(
      `SELECT id FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC`,
      [workoutId],
    );
    rows.forEach((row, index) => {
      this.driver.execute(`UPDATE workout_exercises SET position = ? WHERE id = ?`, [
        index,
        row.id,
      ]);
    });
  }

  /** Keep the newest of `rows` (already ordered `start_time DESC, created_at DESC`), complete the rest, report via {@link onAutoHeal} (06 §9). */
  private autoHealMultipleActive(rows: WorkoutRow[]): void {
    const [keep, ...rest] = rows;
    const now = Date.now();
    this.driver.transaction(() => {
      for (const row of rest) {
        this.driver.execute(
          `UPDATE workouts SET state = 'completed', end_time = ?, updated_at = ? WHERE id = ?`,
          [now, now, row.id],
        );
      }
    });
    this.onAutoHeal({
      keptWorkoutId: keep!.id,
      healedWorkoutIds: rest.map((row) => row.id),
    });
  }

  private findWorkoutExerciseRow(id: string): WorkoutExerciseRow | undefined {
    return this.driver.queryAll<WorkoutExerciseRow>(
      `SELECT * FROM workout_exercises WHERE id = ?`,
      [id],
    )[0];
  }

  /** Look up a `workout_exercises` row, optionally also asserting it belongs to `workoutId` (`removeExercise`'s scoping). */
  private requireWorkoutExerciseRow(id: string, workoutId?: string): WorkoutExerciseRow {
    const row = this.findWorkoutExerciseRow(id);
    if (!row || (workoutId !== undefined && row.workout_id !== workoutId)) {
      throw new WorkoutExerciseNotFoundError(id);
    }
    return row;
  }

  private requireWorkoutExerciseFull(id: string): WorkoutExerciseFull {
    return this.hydrateWorkoutExercise(this.requireWorkoutExerciseRow(id));
  }

  private findSetRow(id: string): SetRow | undefined {
    return this.driver.queryAll<SetRow>(`SELECT * FROM sets WHERE id = ?`, [id])[0];
  }

  private requireSetRow(id: string): SetRow {
    const row = this.findSetRow(id);
    if (!row) {
      throw new SetNotFoundError(id);
    }
    return row;
  }

  private nextExercisePosition(workoutId: string): number {
    const row = this.driver.queryAll<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workout_exercises WHERE workout_id = ?`,
      [workoutId],
    )[0];
    return row?.next ?? 0;
  }

  private nextSetPosition(workoutExerciseId: string): number {
    const row = this.driver.queryAll<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM sets WHERE workout_exercise_id = ?`,
      [workoutExerciseId],
    )[0];
    return row?.next ?? 0;
  }

  /**
   * The shared lookup behind both `previousSets` and `addExercises`'s
   * set-count seeding (see this file's header, "M2-02 additions"): the
   * `occurrenceIndex`-th `workout_exercises` row for `exerciseId` (0-based,
   * default 0) within the single most recent completed workout containing
   * it, restricted per `opts.routineId`/`opts.beforeWorkoutId` — returns
   * that occurrence's `sets` rows in `position` order, or `[]` when no
   * matching workout/occurrence exists. An unresolvable `beforeWorkoutId`
   * (unknown id) degrades to "no restriction" rather than throwing — this
   * is a read-only query helper, not a mutator, so a stale/foreign id
   * should never hard-fail a PREVIOUS lookup.
   */
  private findMostRecentOccurrenceSetRows(
    exerciseId: string,
    opts: PreviousSetsQuery,
  ): SetRow[] {
    const occurrenceIndex = opts.occurrenceIndex ?? 0;
    const conditions = [`we.exercise_id = ?`, `w.state = 'completed'`, `w.deleted_at IS NULL`];
    const params: unknown[] = [exerciseId];

    if (opts.routineId !== undefined) {
      conditions.push('w.routine_id = ?');
      params.push(opts.routineId);
    }

    if (opts.beforeWorkoutId !== undefined) {
      const beforeRow = this.driver.queryAll<{ start_time: number }>(
        `SELECT start_time FROM workouts WHERE id = ?`,
        [opts.beforeWorkoutId],
      )[0];
      if (beforeRow) {
        conditions.push('w.id != ?', 'w.start_time <= ?');
        params.push(opts.beforeWorkoutId, beforeRow.start_time);
      }
    }

    const workoutRow = this.driver.queryAll<{ id: string }>(
      `SELECT w.id FROM workouts w
       INNER JOIN workout_exercises we ON we.workout_id = w.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY w.start_time DESC, w.created_at DESC
       LIMIT 1`,
      params,
    )[0];
    if (!workoutRow) {
      return [];
    }

    const occurrenceRows = this.driver.queryAll<{ id: string }>(
      `SELECT id FROM workout_exercises WHERE workout_id = ? AND exercise_id = ? ORDER BY position ASC`,
      [workoutRow.id, exerciseId],
    );
    const targetWorkoutExercise = occurrenceRows[occurrenceIndex];
    if (!targetWorkoutExercise) {
      return [];
    }

    return this.driver.queryAll<SetRow>(
      `SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
      [targetWorkoutExercise.id],
    );
  }
}
