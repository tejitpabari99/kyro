/**
 * `WorkoutRepositoryImpl` (M2-01) — active-workout lifecycle methods against
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
 */
import { generateUuid } from '../shared/uuid';
import type { SqliteDriver } from '../sqlite/driver';
import { ActiveWorkoutExistsError, WorkoutNotActiveError, WorkoutNotFoundError } from './errors';
import type {
  AutoHealEvent,
  FinishMeta,
  ListCompletedPage,
  WorkoutExerciseFull,
  WorkoutFull,
  WorkoutRepositoryDeps,
  WorkoutRepositoryLifecycle,
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

export class WorkoutRepositoryImpl implements WorkoutRepositoryLifecycle {
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
}
