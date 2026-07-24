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
 *   `workout_exercises` row left with zero sets, (4) renumbers the
 *   workout's remaining exercises back to contiguous 0-based positions, (5)
 *   applies `meta` overrides and flips `state`/`end_time`. Superset
 *   dissolution (a group shrinking to size 1) is deliberately **not**
 *   handled here — that is M2-12's feature-layer concern (its own ⋯ menu
 *   operations own that decision), not a side effect of finishing.
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
 */
import type { Rpe, SetType } from '@/domain/enums';

import { generateUuid } from '../shared/uuid';
import type { SqliteDriver } from '../sqlite/driver';
import {
  ActiveWorkoutExistsError,
  ReorderMismatchError,
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

  // WorkoutRepositoryLifecycle's signature is async (05 §6); this stub has
  // no `await` since it always throws synchronously (still returns a
  // rejected Promise, per normal `async function` semantics).
  async startFromRoutine(_routineId: string): Promise<WorkoutFull> {
    throw new Error('startFromRoutine is not implemented yet — lands in M3-05.');
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
      this.driver.execute(`UPDATE workout_exercises SET exercise_id = ? WHERE id = ?`, [
        newExerciseId,
        workoutExerciseId,
      ]);
      this.driver.execute(
        `UPDATE sets
         SET set_type = 'normal', weight_kg = NULL, reps = NULL, distance_meters = NULL,
             duration_seconds = NULL, rpe = NULL, custom_metric = NULL, is_completed = 0
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
