/**
 * `ExerciseRepositoryImpl` (M1-06) — 05 §6's `ExerciseRepository` interface
 * (`./types.ts`) implemented against the raw `SqliteDriver` surface
 * (`../sqlite/driver.ts`), the same driver-access pattern `SettingsRepository`
 * (M0-10) and `seedBuiltinExercises` (M1-05) already established: both
 * backends (`better-sqlite3` in Jest, `expo-sqlite` on device) are reached
 * through this one narrow surface so repository behavior is provably
 * identical on both (08 §5 parity) without a second, backend-specific
 * Drizzle client duplicating that split for no behavioral gain — see
 * `settings-repository.ts`'s header for the fuller rationale, which applies
 * unchanged here. `src/data/sqlite/schema.ts` remains the source of truth
 * for the table DDL; this file only reads/writes it.
 *
 * `seedBuiltins` is a thin wrapper around the already-reviewed
 * `seedBuiltinExercises` (M1-05, `./seed-builtins.ts`) — this class does not
 * reimplement any of that logic, exactly as that module's header directs.
 *
 * ## Design notes on the constraints in 05 §6 / 03 §5
 *
 * - **Id generation** (`create`): `../shared/uuid.ts`'s `generateUuid` —
 *   shared across every `src/data/**` repository that mints a UUIDv4 primary
 *   key (05's conventions line), not a copy local to this file. See that
 *   module's header for why it lives in `src/data/shared/` rather than
 *   `src/domain/`/`src/lib/`, and for the `expo-crypto`-backed fix to an
 *   earlier `Math.random`-fallback review finding.
 * - **Name uniqueness** (`create`/`update`/`restore`): enforced twice —
 *   once as a pre-check (`assertNameAvailable`, a `SELECT` against
 *   `idx_exercises_name_active`'s exact condition: `name = ? COLLATE NOCASE
 *   AND archived_at IS NULL`) so the common case raises the typed
 *   {@link DuplicateExerciseNameError} directly, and again as a defensive
 *   `catch` around the `INSERT`/`UPDATE` translating a raw SQLite `UNIQUE
 *   constraint failed` (a benign TOCTOU race between the pre-check and the
 *   write, or the equivalent of the DB doing its job when a caller bypasses
 *   the pre-check) into the same typed error rather than letting the raw
 *   driver error leak out.
 * - **Type-immutable-after-first-logged-set** (`update`): 05 §6's
 *   `referenceCount` counts `workout_exercises`/`routine_exercises` *rows*
 *   (used by `delete`'s reference check) — that is deliberately a different,
 *   coarser signal than "has a set ever been logged," because an exercise
 *   can be added to an in-progress workout (a `workout_exercises` row
 *   exists) before any set on it is checked off. The task's own wording is
 *   "check referenceCount/whether any sets exist ... before allowing
 *   exercise_type to change" — `hasLoggedSets` implements the latter,
 *   precise reading: `SELECT COUNT(*) FROM sets s JOIN workout_exercises we
 *   ON we.id = s.workout_exercise_id WHERE we.exercise_id = ?`. Only
 *   `exerciseType` changes are gated by this check; every other custom
 *   field stays editable regardless (03 §5: "Edit: all fields except
 *   type-after-use").
 * - **Built-ins are immutable** (`update`/`delete`): both throw
 *   {@link BuiltinExerciseImmutableError} when targeting an `is_custom = 0`
 *   row — matches `schema.ts`'s own header note ("`ExerciseRepository.delete`
 *   (custom, unreferenced rows only, unchanged rule)") and 03 §1/§5's
 *   "Built-ins are immutable except: user may duplicate one into a custom
 *   copy." `archive`/`restore` are deliberately NOT built-in-gated: dataset
 *   seeding already archives/restores built-in rows internally
 *   (`seedBuiltinExercises`), and 05 §6 gives `archive`/`restore` no
 *   custom-only qualifier, unlike `delete`.
 * - **Delete throws IfReferenced**: `referenceCount` (workout_exercises +
 *   routine_exercises row count) gates the hard delete; zero references ->
 *   real `DELETE FROM exercises`. There is no `deleted_at` tombstone column
 *   on `exercises` yet (`schema.ts`'s header: that lands with MC-03/cloud
 *   sync) — 05's `[sync]` softening of this rule is explicitly out of scope
 *   until then, so `delete` here really does remove the row, matching the
 *   schema as it exists today.
 * - **`recentlyUsed`**: "last N distinct exercises from completed workouts,
 *   most-recent-first" (05 §6) — grouped by `exercise_id` over
 *   `workout_exercises` joined to `workouts` (`state = 'completed' AND
 *   deleted_at IS NULL`), keeping each exercise's most recent
 *   `workouts.start_time`, then ordered by that descending and limited.
 *   Archived exercises are excluded (`exercises.archived_at IS NULL`) to
 *   match 03 §2's Recent section being part of the browse screen (which
 *   excludes archived by default) — archived exercises still render in
 *   *history* (03 §5), just not in this browse-facing "recent" list.
 *   **M2 caller note:** `WorkoutRepository` does not exist yet (M2), so this
 *   method can only be exercised today against `workouts`/`workout_exercises`
 *   rows inserted directly via raw SQL in tests — exactly as the task
 *   anticipates ("that's fine and expected at this stage, M2 will be the
 *   first real caller"). The query only depends on the `workouts` /
 *   `workout_exercises` table shapes (05 §3.2), which are already final.
 * - **Search** (`list`'s `query` filter): 03 §2 requires a
 *   case/diacritic-insensitive substring match against `name` **and**
 *   `aliases`, which plain SQL `LIKE ... COLLATE NOCASE` cannot express
 *   (ASCII case-folding only, no diacritic folding). Given the dataset's
 *   size (~870 rows, 03 §2/06 §8), `muscle`/`equipment`/`includeArchived`
 *   are pushed down into the `WHERE` clause (cheap, exact, index-friendly),
 *   then `query` is applied in JS afterward via `domain/search.ts`'s
 *   `matchesSearchQuery` against the row's `name` and every `aliases`
 *   entry — the same "in-memory over the preloaded array" approach the
 *   Exercises tab itself will use (M1-07), just applied inside the
 *   repository instead of the UI layer.
 */
import { matchesSearchQuery } from '@/domain/search';
import type { Equipment, ExerciseType, MuscleGroup } from '@/domain/enums';
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';

import type { SqliteDriver } from '../sqlite/driver';
import { generateUuid } from '../shared/uuid';
import {
  BuiltinExerciseImmutableError,
  DuplicateExerciseNameError,
  ExerciseNotFoundError,
  ExerciseReferencedError,
  ExerciseTypeImmutableError,
} from './errors';
import { seedBuiltinExercises } from './seed-builtins';
import type {
  CustomExerciseFields,
  Exercise,
  ExerciseListFilter,
  ExerciseRepository,
  NewCustomExercise,
} from './types';

/** Raw `exercises` row shape (snake_case, JSON columns still encoded as TEXT) — the SQL-boundary shape this file maps to/from `Exercise`. */
interface ExerciseRow {
  id: string;
  name: string;
  exercise_type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string;
  equipment: string;
  instructions: string;
  images: string;
  animation_uri: string | null;
  is_custom: number;
  uses_custom_metric: number;
  aliases: string;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapExerciseRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    exerciseType: row.exercise_type as ExerciseType,
    primaryMuscleGroup: row.primary_muscle_group as MuscleGroup,
    secondaryMuscleGroups: JSON.parse(row.secondary_muscle_groups) as MuscleGroup[],
    equipment: row.equipment as Equipment,
    instructions: JSON.parse(row.instructions) as string[],
    images: JSON.parse(row.images) as string[],
    animationUri: row.animation_uri,
    isCustom: row.is_custom === 1,
    usesCustomMetric: row.uses_custom_metric === 1,
    aliases: JSON.parse(row.aliases) as string[],
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `true` when `error` is the SQLite unique-constraint-violation raised by either backend (both surface the SQLite engine's verbatim message text). */
function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export class ExerciseRepositoryImpl implements ExerciseRepository {
  constructor(private readonly driver: SqliteDriver) {}

  async list(filter: ExerciseListFilter = {}): Promise<Exercise[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filter.includeArchived) {
      conditions.push('archived_at IS NULL');
    }
    if (filter.muscle) {
      conditions.push('primary_muscle_group = ?');
      params.push(filter.muscle);
    }
    if (filter.equipment) {
      conditions.push('equipment = ?');
      params.push(filter.equipment);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.driver.queryAll<ExerciseRow>(
      `SELECT * FROM exercises ${whereSql} ORDER BY name COLLATE NOCASE`,
      params,
    );
    const exercises = rows.map(mapExerciseRow);

    const query = filter.query?.trim();
    if (!query) {
      return exercises;
    }

    return exercises.filter(
      (exercise) =>
        matchesSearchQuery(exercise.name, query) ||
        exercise.aliases.some((alias) => matchesSearchQuery(alias, query)),
    );
  }

  async get(id: string): Promise<Exercise | null> {
    const row = this.findRow(id);
    return row ? mapExerciseRow(row) : null;
  }

  async create(input: NewCustomExercise): Promise<Exercise> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new Error('Exercise name is required.');
    }
    this.assertNameAvailable(name);

    const id = await generateUuid();
    const now = Date.now();
    const secondaryMuscleGroups = input.secondaryMuscleGroups ?? [];
    const equipment = input.equipment ?? 'none';
    const instructions = input.instructions ?? [];
    const images = input.images ?? [];
    const usesCustomMetric = input.usesCustomMetric ?? false;

    try {
      this.driver.execute(
        `INSERT INTO exercises
           (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
            equipment, instructions, images, animation_uri, is_custom,
            uses_custom_metric, aliases, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, '[]', NULL, ?, ?)`,
        [
          id,
          name,
          input.exerciseType,
          input.primaryMuscleGroup,
          JSON.stringify(secondaryMuscleGroups),
          equipment,
          JSON.stringify(instructions),
          JSON.stringify(images),
          usesCustomMetric ? 1 : 0,
          now,
          now,
        ],
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateExerciseNameError(name);
      }
      throw error;
    }

    return mapExerciseRow(this.requireRow(id));
  }

  async update(id: string, patch: Partial<CustomExerciseFields>): Promise<Exercise> {
    const existing = this.requireRow(id);
    if (existing.is_custom === 0) {
      throw new BuiltinExerciseImmutableError(id);
    }

    if (patch.exerciseType !== undefined && patch.exerciseType !== existing.exercise_type) {
      if (this.hasLoggedSetsSync(id)) {
        throw new ExerciseTypeImmutableError(id);
      }
    }

    let name = existing.name;
    if (patch.name !== undefined) {
      name = patch.name.trim();
      if (name.length === 0) {
        throw new Error('Exercise name is required.');
      }
      this.assertNameAvailable(name, id);
    }

    const exerciseType = patch.exerciseType ?? existing.exercise_type;
    const primaryMuscleGroup = patch.primaryMuscleGroup ?? existing.primary_muscle_group;
    const secondaryMuscleGroupsJson =
      patch.secondaryMuscleGroups !== undefined
        ? JSON.stringify(patch.secondaryMuscleGroups)
        : existing.secondary_muscle_groups;
    const equipment = patch.equipment ?? existing.equipment;
    const instructionsJson =
      patch.instructions !== undefined ? JSON.stringify(patch.instructions) : existing.instructions;
    const imagesJson = patch.images !== undefined ? JSON.stringify(patch.images) : existing.images;
    const usesCustomMetric =
      patch.usesCustomMetric !== undefined
        ? (patch.usesCustomMetric ? 1 : 0)
        : existing.uses_custom_metric;
    const now = Date.now();

    try {
      this.driver.execute(
        `UPDATE exercises SET
           name = ?, exercise_type = ?, primary_muscle_group = ?, secondary_muscle_groups = ?,
           equipment = ?, instructions = ?, images = ?, uses_custom_metric = ?, updated_at = ?
         WHERE id = ?`,
        [
          name,
          exerciseType,
          primaryMuscleGroup,
          secondaryMuscleGroupsJson,
          equipment,
          instructionsJson,
          imagesJson,
          usesCustomMetric,
          now,
          id,
        ],
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateExerciseNameError(name);
      }
      throw error;
    }

    return mapExerciseRow(this.requireRow(id));
  }

  async archive(id: string): Promise<void> {
    const existing = this.requireRow(id);
    if (existing.archived_at !== null) {
      return; // Idempotent no-op — already archived.
    }
    const now = Date.now();
    this.driver.execute(`UPDATE exercises SET archived_at = ?, updated_at = ? WHERE id = ?`, [
      now,
      now,
      id,
    ]);
  }

  async restore(id: string): Promise<void> {
    const existing = this.requireRow(id);
    if (existing.archived_at === null) {
      return; // Idempotent no-op — already active.
    }
    // Restoring must not silently violate the active-name-uniqueness rule —
    // e.g. archive "Bench Press", create a new active "Bench Press", then
    // try to restore the original: that must raise the same typed error
    // `create`/`update` would, not a raw UNIQUE-constraint failure.
    this.assertNameAvailable(existing.name, id);
    const now = Date.now();
    this.driver.execute(`UPDATE exercises SET archived_at = NULL, updated_at = ? WHERE id = ?`, [
      now,
      id,
    ]);
  }

  async delete(id: string): Promise<void> {
    const existing = this.requireRow(id);
    if (existing.is_custom === 0) {
      throw new BuiltinExerciseImmutableError(id);
    }
    const referenceCount = this.countReferences(id);
    if (referenceCount > 0) {
      throw new ExerciseReferencedError(id, referenceCount);
    }
    this.driver.execute(`DELETE FROM exercises WHERE id = ?`, [id]);
  }

  async referenceCount(id: string): Promise<number> {
    return this.countReferences(id);
  }

  async hasLoggedSets(id: string): Promise<boolean> {
    this.requireRow(id);
    return this.hasLoggedSetsSync(id);
  }

  async recentlyUsed(limit: number): Promise<Exercise[]> {
    const rows = this.driver.queryAll<ExerciseRow>(
      `SELECT e.* FROM exercises e
       INNER JOIN (
         SELECT we.exercise_id AS exercise_id, MAX(w.start_time) AS last_start_time
         FROM workout_exercises we
         INNER JOIN workouts w ON w.id = we.workout_id
         WHERE w.state = 'completed' AND w.deleted_at IS NULL
         GROUP BY we.exercise_id
       ) recent ON recent.exercise_id = e.id
       WHERE e.archived_at IS NULL
       ORDER BY recent.last_start_time DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map(mapExerciseRow);
  }

  async seedBuiltins(dataset: readonly MappedExerciseRecord[], version: string): Promise<void> {
    seedBuiltinExercises(this.driver, dataset, version);
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private findRow(id: string): ExerciseRow | undefined {
    return this.driver.queryAll<ExerciseRow>(`SELECT * FROM exercises WHERE id = ?`, [id])[0];
  }

  private requireRow(id: string): ExerciseRow {
    const row = this.findRow(id);
    if (!row) {
      throw new ExerciseNotFoundError(id);
    }
    return row;
  }

  /** Throws {@link DuplicateExerciseNameError} if an active row named `name` (case-insensitive) exists, other than `excludeId` itself. */
  private assertNameAvailable(name: string, excludeId?: string): void {
    const rows = this.driver.queryAll<{ id: string }>(
      `SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND archived_at IS NULL`,
      [name],
    );
    const conflict = rows.find((row) => row.id !== excludeId);
    if (conflict) {
      throw new DuplicateExerciseNameError(name);
    }
  }

  /** `true` when at least one `sets` row exists for any `workout_exercises` slot referencing `id` (05 §6 / 03 §5's type-immutability rule). Sync core shared by `update`'s internal gate and the public async `hasLoggedSets` (M1-10). */
  private hasLoggedSetsSync(id: string): boolean {
    const rows = this.driver.queryAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sets s
       INNER JOIN workout_exercises we ON we.id = s.workout_exercise_id
       WHERE we.exercise_id = ?`,
      [id],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  /** Count of `workout_exercises` + `routine_exercises` rows referencing `id` (05 §6's `referenceCount`, and `delete`'s IfReferenced gate). */
  private countReferences(id: string): number {
    const rows = this.driver.queryAll<{ n: number }>(
      `SELECT
         (SELECT COUNT(*) FROM workout_exercises WHERE exercise_id = ?) +
         (SELECT COUNT(*) FROM routine_exercises WHERE exercise_id = ?) AS n`,
      [id, id],
    );
    return rows[0]?.n ?? 0;
  }
}
