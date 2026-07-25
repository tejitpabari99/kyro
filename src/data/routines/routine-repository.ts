/**
 * `RoutineRepositoryImpl` (M3-01) — folders + routines CRUD against the raw
 * `SqliteDriver` surface, following the exact pattern `ExerciseRepositoryImpl`
 * (M1-06) and `WorkoutRepositoryImpl` (M2-01/M2-02) established: both
 * backends (`better-sqlite3` in Jest, `expo-sqlite` on device) are reached
 * through the one narrow `SqliteDriver` surface (`../sqlite/driver.ts`).
 * `src/data/sqlite/schema.ts` (05 §3.3) remains the source of truth for the
 * table DDL — see its header for why `routine_folders.id` is still
 * `INTEGER AUTOINCREMENT` today (the `[sync]` TEXT-uuid conversion is
 * MC-03's scope, not this task's).
 *
 * ## Design notes
 *
 * - **Id generation:** `routines`/`routine_exercises`/`routine_sets` use
 *   `../shared/uuid.ts`'s `generateUuid` (same shared helper every other
 *   `src/data/**` repository uses); `routine_folders` uses its own
 *   `INTEGER PRIMARY KEY AUTOINCREMENT` (05 §3.3 / this task's own text:
 *   "folders CRUD (INTEGER autoincrement ids...)") — `createFolder` reads
 *   the new id off `SqliteRunResult.lastInsertRowId` rather than
 *   pre-generating one, the one place this repository's write pattern
 *   differs from `generateUuid`-based inserts. Every multi-id mutator that
 *   both mints new ids **and** needs multi-statement atomicity
 *   pre-generates all needed ids via `await generateUuid()` calls *before*
 *   entering `driver.transaction(...)` (its callback is synchronous, same
 *   constraint `WorkoutRepositoryImpl`'s header documents).
 * - **`moveToFolder` vs `reorderRoutines`:** deliberately split (see
 *   `types.ts`'s header for the full rationale) — `moveToFolder` changes
 *   membership (append at the destination scope's end, renumber the
 *   source scope), `reorderRoutines` changes order within one scope only
 *   and validates the supplied id list is an exact permutation of that
 *   scope's current members (`RoutineReorderMismatchError`), mirroring
 *   `WorkoutRepositoryMutators.reorderExercises`'s contract exactly.
 * - **Position renumbering** stays contiguous 0-based immediately, in the
 *   same transaction as every mutator that adds/removes/moves a row —
 *   same "at rest, not just eventually" invariant `WorkoutRepositoryImpl`
 *   documents for `workout_exercises`/`sets`.
 * - **`deleteFolder`'s two modes** (04 §1's folder-delete choice dialog):
 *   `'cascade'` explicitly `DELETE`s the folder's routines *before*
 *   deleting the folder row itself — `routines.folder_id`'s FK action is
 *   `ON DELETE SET NULL` (`schema.ts`), so deleting the folder first would
 *   silently move those routines to My Routines instead of removing them
 *   (foreign keys are `PRAGMA`-enabled on both backends,
 *   `open-database.ts`/`driver.expo.ts`). `'moveToMyRoutines'` sets
 *   `folder_id = NULL` on them explicitly (appended after My Routines'
 *   existing members, preserving relative order) before the same folder
 *   delete — the FK action is then a no-op since nothing still references
 *   the row.
 * - **Routine `delete` is a real hard delete**, not a `deleted_at`
 *   tombstone — there is no `deleted_at` column on `routines` yet (same
 *   "MC-03 adds this later" scope note `schema.ts`'s header gives for
 *   `exercises`/`routine_folders`; `ExerciseRepositoryImpl.delete` makes
 *   the identical call today). `workouts.routine_id` has no FK
 *   (`schema.ts`: "soft reference (no FK action; routine may be
 *   deleted)"), so a hard delete here just orphans that text column —
 *   exactly the "(deleted routine)" display case 05 §3.3 / 04 §2.2
 *   describe; callers detect it by `get(routineId) === null`.
 * - **Reps-XOR-range enforced at the repo boundary** (this task's explicit
 *   instruction, beyond the `routine_sets_reps_xor_range_check` CHECK
 *   already in `schema.ts`): every `NewRoutineSetInput` passed to
 *   `create`/`update` is checked by `assertRepsXorRange` *before* any SQL
 *   runs, throwing {@link RepsXorRangeViolationError} — a clear typed error
 *   instead of a raw SQLite CHECK-constraint failure. `duplicate` and
 *   `createFromWorkout` never need this check: both copy already-valid
 *   rows (an existing `routine_sets` row, or a `sets` row's achieved
 *   values collapsed to a fixed `reps` with both range columns left
 *   `NULL`) — one side of the XOR is always structurally absent.
 * - **`createFromWorkout`** (04 §2.2 "Save as Routine", 05 §3.3):
 *   reads directly from the `workouts`/`workout_exercises`/`sets` tables
 *   via raw SQL rather than depending on a `WorkoutRepository` instance —
 *   `src/data/routines/` has no reason to take a same-layer sibling
 *   repository as a constructor dependency when the three SELECTs it needs
 *   are this simple, and it keeps this repository constructible with only
 *   a `SqliteDriver`, same as every other one. Achieved values (whatever
 *   `sets` rows currently exist for the workout — typically all
 *   `is_completed = 1` for a *completed* workout post-`finish()`, but this
 *   method itself applies no `is_completed` filter, so it also works
 *   against an in-progress active workout's checked-and-unchecked mix if a
 *   future caller ever needs that) become fixed `reps`/`weightKg`/etc.
 *   targets — never a rep range (only the routine editor, M3-04, ever
 *   writes ranges) — so `rep_range_start`/`rep_range_end` are always
 *   `NULL` here, trivially satisfying the XOR.
 * - **`updateFromWorkout`** (M3-06, 02 §14.4 / 04 §2.4): see its own method
 *   doc comment below for the full write-back rules (structure/target
 *   replacement, rep-range preservation) — it shares its exercise/set
 *   correlation scheme with `@/domain/routine-diff`'s `computeRoutineDiff`
 *   (the material-change detector that decides *whether* to offer this)
 *   via that module's exported `matchWorkoutToRoutineExercises`/
 *   `repsWithinRoutineRange` helpers, so the two can never disagree about
 *   which achieved set maps to which target.
 */
import type { SetType } from '@/domain/enums';
import {
  matchWorkoutSetsToRoutineSets,
  matchWorkoutToRoutineExercises,
  repsWithinRoutineRange,
} from '@/domain/routine-diff';

import { generateUuid } from '../shared/uuid';
import type { SqliteDriver, SqliteRunResult } from '../sqlite/driver';
import {
  FolderReorderMismatchError,
  RepsXorRangeViolationError,
  RoutineFolderNotFoundError,
  RoutineNotFoundError,
  RoutineReorderMismatchError,
  WorkoutNotFoundForRoutineError,
  WorkoutRoutineMismatchError,
} from './errors';
import type {
  CreateRoutineFromWorkoutOptions,
  DeleteFolderOptions,
  NewRoutineExerciseInput,
  NewRoutineFolderInput,
  NewRoutineInput,
  NewRoutineSetInput,
  RoutineFolder,
  RoutineFull,
  RoutineExerciseFull,
  RoutineListFilter,
  RoutineRepository,
  RoutineSet,
  RoutineSummary,
  UpdateRoutineInput,
} from './types';

// ---------------------------------------------------------------------------
// Raw row shapes (snake_case) — the SQL-boundary shape this file maps
// to/from the camelCase `RoutineFolder`/`RoutineFull`/`RoutineExerciseFull`/
// `RoutineSet` types (05 §3.3).
// ---------------------------------------------------------------------------

interface RoutineFolderRow {
  id: number;
  title: string;
  position: number;
  collapsed: number;
  created_at: number;
  updated_at: number;
}

interface RoutineRow {
  id: string;
  title: string;
  notes: string | null;
  folder_id: number | null;
  position: number;
  created_at: number;
  updated_at: number;
}

interface RoutineExerciseRow {
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  superset_id: number | null;
  notes: string | null;
  rest_seconds: number | null;
}

interface RoutineSetRow {
  id: string;
  routine_exercise_id: string;
  position: number;
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  rep_range_start: number | null;
  rep_range_end: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  custom_metric: number | null;
}

/** Raw `workout_exercises` shape, read-only slice `createFromWorkout` needs. */
interface WorkoutExerciseSourceRow {
  id: string;
  exercise_id: string;
  position: number;
  superset_id: number | null;
  notes: string | null;
  rest_seconds: number | null;
}

/** Raw `sets` shape, read-only slice `createFromWorkout` needs. */
interface SetSourceRow {
  id: string;
  position: number;
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  custom_metric: number | null;
}

/** Raw `sets` shape `updateFromWorkout` (M3-06) needs — `SetSourceRow` plus `routine_set_position` (migration 0004), the set-correlation key `matchWorkoutSetsToRoutineSets` (`@/domain/routine-diff`) reads (M3-06 review fix — see that file's header, "Set correlation"). `createFromWorkout` never needs this field (it has no prior routine structure to correlate against), so it stays off `SetSourceRow` itself, same split `WorkoutExerciseWithOccurrenceRow` below already establishes for exercises. */
interface SetSourceWithRoutinePositionRow extends SetSourceRow {
  routine_set_position: number | null;
}

/** Raw `workout_exercises` shape `updateFromWorkout` (M3-06) needs — `WorkoutExerciseSourceRow` plus `routine_occurrence_index`, the exercise-correlation key `matchWorkoutToRoutineExercises` (`@/domain/routine-diff`) reads (see that file's header). `createFromWorkout` never needs this field (it has no prior routine structure to correlate against), so it stays off `WorkoutExerciseSourceRow` itself. */
interface WorkoutExerciseWithOccurrenceRow extends WorkoutExerciseSourceRow {
  routine_occurrence_index: number | null;
}

function mapFolderRow(row: RoutineFolderRow): RoutineFolder {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    collapsed: row.collapsed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoutineSetRow(row: RoutineSetRow): RoutineSet {
  return {
    id: row.id,
    position: row.position,
    setType: row.set_type as RoutineSet['setType'],
    weightKg: row.weight_kg,
    reps: row.reps,
    repRangeStart: row.rep_range_start,
    repRangeEnd: row.rep_range_end,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    customMetric: row.custom_metric,
  };
}

function mapRoutineExerciseRow(row: RoutineExerciseRow, sets: RoutineSet[]): RoutineExerciseFull {
  return {
    id: row.id,
    routineId: row.routine_id,
    exerciseId: row.exercise_id,
    position: row.position,
    supersetId: row.superset_id,
    notes: row.notes,
    restSeconds: row.rest_seconds,
    sets,
  };
}

function mapRoutineRow(row: RoutineRow, exercises: RoutineExerciseFull[]): RoutineFull {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    folderId: row.folder_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    exercises,
  };
}

function mapRoutineSummaryRow(row: RoutineRow): RoutineSummary {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    folderId: row.folder_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Throws {@link RepsXorRangeViolationError} if `input` sets both a fixed `reps` value and a rep range — the repo-boundary re-enforcement of `routine_sets_reps_xor_range_check` (this file's header). */
function assertRepsXorRange(input: NewRoutineSetInput): void {
  const hasReps = input.reps !== undefined && input.reps !== null;
  const hasRange =
    (input.repRangeStart !== undefined && input.repRangeStart !== null) ||
    (input.repRangeEnd !== undefined && input.repRangeEnd !== null);
  if (hasReps && hasRange) {
    throw new RepsXorRangeViolationError();
  }
}

/**
 * `updateFromWorkout`'s (M3-06) rep-target write-back rule (04 §2.4): if
 * `originalTarget` (the matched routine_set this achieved set correlates
 * to — `undefined` when there was none, e.g. a mid-workout-added exercise
 * or a newly-added set past the routine's own set count) was a rep range
 * and `achievedReps` falls inside it (inclusive both ends,
 * `repsWithinRoutineRange`, `@/domain/routine-diff`), the range is
 * preserved verbatim; otherwise the target collapses to a fixed `reps`
 * value — never a range — matching `createFromWorkout`'s own "achieved
 * values become fixed targets, never a range" convention (this file's
 * header) for every other case.
 */
function computeUpdatedRepTarget(
  achievedReps: number | null,
  originalTarget: RoutineSetRow | undefined,
): { reps: number | null; repRangeStart: number | null; repRangeEnd: number | null } {
  if (
    originalTarget &&
    repsWithinRoutineRange(achievedReps, {
      repRangeStart: originalTarget.rep_range_start,
      repRangeEnd: originalTarget.rep_range_end,
    })
  ) {
    return {
      reps: null,
      repRangeStart: originalTarget.rep_range_start,
      repRangeEnd: originalTarget.rep_range_end,
    };
  }
  return { reps: achievedReps, repRangeStart: null, repRangeEnd: null };
}

/** One exercise-with-sets input, pre-generated ids attached — the shape `create`/`update`'s shared insert helper consumes (ids must be minted with `await generateUuid()` before entering the synchronous `driver.transaction` callback). */
interface PreparedExercise {
  id: string;
  setIds: string[];
  input: NewRoutineExerciseInput;
}

export class RoutineRepositoryImpl implements RoutineRepository {
  constructor(private readonly driver: SqliteDriver) {}

  // ---------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------

  async listFolders(): Promise<RoutineFolder[]> {
    const rows = this.driver.queryAll<RoutineFolderRow>(
      `SELECT * FROM routine_folders ORDER BY position ASC`,
    );
    return rows.map(mapFolderRow);
  }

  async createFolder(input: NewRoutineFolderInput): Promise<RoutineFolder> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new Error('Folder title is required.');
    }
    const now = Date.now();

    let result!: SqliteRunResult;
    this.driver.transaction(() => {
      const position = this.nextFolderPosition();
      result = this.driver.execute(
        `INSERT INTO routine_folders (title, position, collapsed, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`,
        [title, position, now, now],
      );
    });

    return mapFolderRow(this.requireFolderRow(result.lastInsertRowId));
  }

  async renameFolder(id: number, title: string): Promise<RoutineFolder> {
    this.requireFolderRow(id);
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new Error('Folder title is required.');
    }
    const now = Date.now();
    this.driver.transaction(() => {
      this.driver.execute(`UPDATE routine_folders SET title = ?, updated_at = ? WHERE id = ?`, [
        trimmed,
        now,
        id,
      ]);
    });
    return mapFolderRow(this.requireFolderRow(id));
  }

  async setFolderCollapsed(id: number, collapsed: boolean): Promise<RoutineFolder> {
    this.requireFolderRow(id);
    const now = Date.now();
    this.driver.transaction(() => {
      this.driver.execute(
        `UPDATE routine_folders SET collapsed = ?, updated_at = ? WHERE id = ?`,
        [collapsed ? 1 : 0, now, id],
      );
    });
    return mapFolderRow(this.requireFolderRow(id));
  }

  async deleteFolder(id: number, options: DeleteFolderOptions): Promise<void> {
    this.requireFolderRow(id);
    const now = Date.now();

    this.driver.transaction(() => {
      if (options.mode === 'cascade') {
        // Explicit delete first — routines.folder_id's FK action is
        // ON DELETE SET NULL, which would otherwise silently move these
        // routines to My Routines instead of removing them (this file's
        // header). ON DELETE CASCADE on routine_exercises/routine_sets
        // (schema.ts) handles the rest.
        this.driver.execute(`DELETE FROM routines WHERE folder_id = ?`, [id]);
      } else {
        const routineIds = this.driver
          .queryAll<{ id: string }>(
            `SELECT id FROM routines WHERE folder_id = ? ORDER BY position ASC`,
            [id],
          )
          .map((row) => row.id);
        let position = this.nextRoutinePosition(null);
        for (const routineId of routineIds) {
          this.driver.execute(
            `UPDATE routines SET folder_id = NULL, position = ?, updated_at = ? WHERE id = ?`,
            [position, now, routineId],
          );
          position += 1;
        }
      }

      this.driver.execute(`DELETE FROM routine_folders WHERE id = ?`, [id]);
      this.renumberFolderPositions();
    });
  }

  async reorderFolders(orderedFolderIds: number[]): Promise<void> {
    const existingIds = this.driver
      .queryAll<{ id: number }>(`SELECT id FROM routine_folders`)
      .map((row) => row.id);
    const existingSet = new Set(existingIds);
    const isExactPermutation =
      existingSet.size === orderedFolderIds.length &&
      new Set(orderedFolderIds).size === orderedFolderIds.length &&
      orderedFolderIds.every((id) => existingSet.has(id));

    if (!isExactPermutation) {
      throw new FolderReorderMismatchError();
    }

    this.driver.transaction(() => {
      orderedFolderIds.forEach((id, index) => {
        this.driver.execute(`UPDATE routine_folders SET position = ? WHERE id = ?`, [index, id]);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Routines
  // ---------------------------------------------------------------------

  async list(filter: RoutineListFilter = {}): Promise<RoutineSummary[]> {
    if (filter.folderId !== undefined) {
      const rows =
        filter.folderId === null
          ? this.driver.queryAll<RoutineRow>(
              `SELECT * FROM routines WHERE folder_id IS NULL ORDER BY position ASC`,
            )
          : this.driver.queryAll<RoutineRow>(
              `SELECT * FROM routines WHERE folder_id = ? ORDER BY position ASC`,
              [filter.folderId],
            );
      return rows.map(mapRoutineSummaryRow);
    }

    // Folders first (position order), My Routines (folder_id IS NULL) last —
    // matches 04 §1's "implicit 'My Routines' section ... always last".
    // Must join routine_folders to sort by the folder's *position* column
    // (user-reorderable via reorderFolders), not by folder_id — folder_id
    // is an autoincrement PK that reflects creation order and drifts from
    // position the moment a folder gets reordered.
    const rows = this.driver.queryAll<RoutineRow>(
      `SELECT routines.* FROM routines
       LEFT JOIN routine_folders ON routines.folder_id = routine_folders.id
       ORDER BY (routines.folder_id IS NULL) ASC, routine_folders.position ASC, routines.position ASC`,
    );
    return rows.map(mapRoutineSummaryRow);
  }

  async get(id: string): Promise<RoutineSummary | null> {
    const row = this.findRoutineRow(id);
    return row ? mapRoutineSummaryRow(row) : null;
  }

  async getFull(id: string): Promise<RoutineFull | null> {
    const row = this.findRoutineRow(id);
    return row ? this.hydrateRoutine(row) : null;
  }

  async create(input: NewRoutineInput): Promise<RoutineFull> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new Error('Routine title is required.');
    }
    const folderId = input.folderId ?? null;
    if (folderId !== null) {
      this.requireFolderRow(folderId);
    }

    const exerciseInputs = input.exercises ?? [];
    for (const exercise of exerciseInputs) {
      exercise.sets.forEach(assertRepsXorRange);
    }
    const prepared = await this.prepareExercises(exerciseInputs);

    const routineId = await generateUuid();
    const now = Date.now();

    this.driver.transaction(() => {
      const position = this.nextRoutinePosition(folderId);
      this.driver.execute(
        `INSERT INTO routines (id, title, notes, folder_id, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [routineId, title, input.notes ?? null, folderId, position, now, now],
      );
      this.insertExercises(routineId, prepared);
    });

    return (await this.getFull(routineId))!;
  }

  async update(id: string, patch: UpdateRoutineInput): Promise<RoutineFull> {
    const existing = this.requireRoutineRow(id);

    let title = existing.title;
    if (patch.title !== undefined) {
      title = patch.title.trim();
      if (title.length === 0) {
        throw new Error('Routine title is required.');
      }
    }
    const notes = patch.notes !== undefined ? patch.notes : existing.notes;

    let prepared: PreparedExercise[] | undefined;
    if (patch.exercises !== undefined) {
      for (const exercise of patch.exercises) {
        exercise.sets.forEach(assertRepsXorRange);
      }
      prepared = await this.prepareExercises(patch.exercises);
    }

    const now = Date.now();
    this.driver.transaction(() => {
      this.driver.execute(
        `UPDATE routines SET title = ?, notes = ?, updated_at = ? WHERE id = ?`,
        [title, notes, now, id],
      );
      if (prepared) {
        // ON DELETE CASCADE (schema.ts) removes routine_sets with them.
        this.driver.execute(`DELETE FROM routine_exercises WHERE routine_id = ?`, [id]);
        this.insertExercises(id, prepared);
      }
    });

    return (await this.getFull(id))!;
  }

  async moveToFolder(id: string, folderId: number | null): Promise<RoutineFull> {
    const existing = this.requireRoutineRow(id);
    if (folderId !== null) {
      this.requireFolderRow(folderId);
    }

    if (existing.folder_id === folderId) {
      return (await this.getFull(id))!;
    }

    const now = Date.now();
    this.driver.transaction(() => {
      const position = this.nextRoutinePosition(folderId);
      this.driver.execute(
        `UPDATE routines SET folder_id = ?, position = ?, updated_at = ? WHERE id = ?`,
        [folderId, position, now, id],
      );
      this.renumberRoutinePositions(existing.folder_id);
    });

    return (await this.getFull(id))!;
  }

  async reorderRoutines(folderId: number | null, orderedRoutineIds: string[]): Promise<void> {
    if (folderId !== null) {
      this.requireFolderRow(folderId);
    }

    const existingIds =
      folderId === null
        ? this.driver
            .queryAll<{ id: string }>(`SELECT id FROM routines WHERE folder_id IS NULL`)
            .map((row) => row.id)
        : this.driver
            .queryAll<{ id: string }>(`SELECT id FROM routines WHERE folder_id = ?`, [folderId])
            .map((row) => row.id);
    const existingSet = new Set(existingIds);
    const isExactPermutation =
      existingSet.size === orderedRoutineIds.length &&
      new Set(orderedRoutineIds).size === orderedRoutineIds.length &&
      orderedRoutineIds.every((id) => existingSet.has(id));

    if (!isExactPermutation) {
      throw new RoutineReorderMismatchError(folderId);
    }

    this.driver.transaction(() => {
      orderedRoutineIds.forEach((id, index) => {
        this.driver.execute(`UPDATE routines SET position = ? WHERE id = ?`, [index, id]);
      });
    });
  }

  async duplicate(id: string): Promise<RoutineFull> {
    const original = this.requireRoutineFull(id);

    const newRoutineId = await generateUuid();
    const exerciseIds = await Promise.all(original.exercises.map(() => generateUuid()));
    const setIdsPerExercise = await Promise.all(
      original.exercises.map((exercise) => Promise.all(exercise.sets.map(() => generateUuid()))),
    );

    const now = Date.now();
    this.driver.transaction(() => {
      const position = this.nextRoutinePosition(original.folderId);
      this.driver.execute(
        `INSERT INTO routines (id, title, notes, folder_id, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newRoutineId, `${original.title} copy`, original.notes, original.folderId, position, now, now],
      );

      original.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseId = exerciseIds[exerciseIndex]!;
        this.driver.execute(
          `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, superset_id, notes, rest_seconds)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            exerciseId,
            newRoutineId,
            exercise.exerciseId,
            exercise.position,
            exercise.supersetId,
            exercise.notes,
            exercise.restSeconds,
          ],
        );

        exercise.sets.forEach((set, setIndex) => {
          const setId = setIdsPerExercise[exerciseIndex]![setIndex]!;
          this.driver.execute(
            `INSERT INTO routine_sets
               (id, routine_exercise_id, position, set_type, weight_kg, reps, rep_range_start,
                rep_range_end, distance_meters, duration_seconds, custom_metric)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              setId,
              exerciseId,
              set.position,
              set.setType,
              set.weightKg,
              set.reps,
              set.repRangeStart,
              set.repRangeEnd,
              set.distanceMeters,
              set.durationSeconds,
              set.customMetric,
            ],
          );
        });
      });
    });

    return (await this.getFull(newRoutineId))!;
  }

  async delete(id: string): Promise<void> {
    const existing = this.requireRoutineRow(id);
    this.driver.transaction(() => {
      // ON DELETE CASCADE (schema.ts) removes routine_exercises + routine_sets.
      // workouts.routine_id has no FK (soft reference, 05 §3.3) and is left
      // untouched — display layer renders "(deleted routine)" once get()
      // returns null for that id (04 §2.2).
      this.driver.execute(`DELETE FROM routines WHERE id = ?`, [id]);
      this.renumberRoutinePositions(existing.folder_id);
    });
  }

  async createFromWorkout(
    workoutId: string,
    opts: CreateRoutineFromWorkoutOptions = {},
  ): Promise<RoutineFull> {
    const workoutRow = this.driver.queryAll<{
      id: string;
      title: string;
      deleted_at: number | null;
    }>(`SELECT id, title, deleted_at FROM workouts WHERE id = ?`, [workoutId])[0];
    if (!workoutRow || workoutRow.deleted_at !== null) {
      throw new WorkoutNotFoundForRoutineError(workoutId);
    }

    const folderId = opts.folderId ?? null;
    if (folderId !== null) {
      this.requireFolderRow(folderId);
    }
    const title = (opts.title ?? workoutRow.title).trim() || workoutRow.title;

    const workoutExerciseRows = this.driver.queryAll<WorkoutExerciseSourceRow>(
      `SELECT id, exercise_id, position, superset_id, notes, rest_seconds
       FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC`,
      [workoutId],
    );
    const setRowsPerExercise = workoutExerciseRows.map((weRow) =>
      this.driver.queryAll<SetSourceRow>(
        `SELECT id, position, set_type, weight_kg, reps, distance_meters, duration_seconds, custom_metric
         FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
        [weRow.id],
      ),
    );

    const routineId = await generateUuid();
    const exerciseIds = await Promise.all(workoutExerciseRows.map(() => generateUuid()));
    const setIdsPerExercise = await Promise.all(
      setRowsPerExercise.map((rows) => Promise.all(rows.map(() => generateUuid()))),
    );

    const now = Date.now();
    this.driver.transaction(() => {
      const position = this.nextRoutinePosition(folderId);
      this.driver.execute(
        `INSERT INTO routines (id, title, notes, folder_id, position, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        [routineId, title, folderId, position, now, now],
      );

      workoutExerciseRows.forEach((weRow, exerciseIndex) => {
        const exerciseId = exerciseIds[exerciseIndex]!;
        this.driver.execute(
          `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, superset_id, notes, rest_seconds)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            exerciseId,
            routineId,
            weRow.exercise_id,
            exerciseIndex,
            weRow.superset_id,
            weRow.notes,
            weRow.rest_seconds,
          ],
        );

        setRowsPerExercise[exerciseIndex]!.forEach((setRow, setIndex) => {
          const setId = setIdsPerExercise[exerciseIndex]![setIndex]!;
          // Achieved values become fixed targets — rep_range_start/end
          // always NULL (this file's header): only the routine editor
          // (M3-04) ever writes a range.
          this.driver.execute(
            `INSERT INTO routine_sets
               (id, routine_exercise_id, position, set_type, weight_kg, reps, rep_range_start,
                rep_range_end, distance_meters, duration_seconds, custom_metric)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
            [
              setId,
              exerciseId,
              setIndex,
              setRow.set_type,
              setRow.weight_kg,
              setRow.reps,
              setRow.distance_meters,
              setRow.duration_seconds,
              setRow.custom_metric,
            ],
          );
        });
      });
    });

    return (await this.getFull(routineId))!;
  }

  /**
   * M3-06 (02 §14.4 / 04 §2.4): writes a finished routine-started workout's
   * final structure back onto `routineId` as its new targets — the
   * "Update routine" half of the finish-flow prompt (`computeRoutineDiff`,
   * `@/domain/routine-diff`, decides *whether* to offer this; this method
   * unconditionally applies it once the caller decides "yes").
   *
   * **Data access:** raw SQL against `workouts`/`workout_exercises`/`sets`,
   * no `WorkoutRepository` dependency — the identical choice
   * `createFromWorkout` (this file's header) and `startFromRoutine`
   * (`workout-repository.ts`'s header) already made in both directions, for
   * the same reason (a few read-only `SELECT`s don't justify a cross-repo
   * constructor dependency).
   *
   * **Structure — "checked exercises only" is already true by construction:**
   * this method never applies its own `is_completed` filter to `sets` — by
   * the time `finish()` (`workout-repository.ts`) has run, every unchecked
   * `sets` row has already been deleted and every remaining exercise has at
   * least one (checked) set, so the workout's own `workout_exercises` table,
   * read in `position ASC` order, already **is** "checked exercises only,
   * in final position order." Replicating a completedness filter here would
   * be redundant at best and silently wrong if this method were ever called
   * against a still-active workout (out of scope today — only
   * `ActiveWorkoutScreen`'s post-`finish()` hook calls this).
   *
   * **Per-set targets:** weight/distance/duration/customMetric/type always
   * become the achieved actual value (mirrors `createFromWorkout`'s own
   * "achieved becomes target" convention) with one carve-out — reps: if the
   * *original* target this set correlates to (via `matchWorkoutToRoutineExercises`
   * exercise-matching + `matchWorkoutSetsToRoutineSets`'s `routine_set_position`
   * set-matching — M3-06 review fix, `@/domain/routine-diff`'s own file
   * header's "Set correlation" section has the full write-up — the identical
   * scheme the diff itself uses, so the two can never disagree about which
   * target a set maps to) was a rep range and the achieved reps
   * falls inside it (inclusive both ends, `repsWithinRoutineRange`), the
   * range is preserved verbatim and only `weightKg` (already unconditional
   * above) actually changed; otherwise (no original target, not a range, or
   * out of range) the set collapses to a fixed `reps` target — never a
   * range — same as every other "achieved value becomes a target" case in
   * this file.
   *
   * **Routine-level fields:** only `updated_at` bumps; `title`/`notes`
   * (the routine's own top-level fields) are untouched — 04 §2.4's
   * write-back list ("exercise list/order/superset/rest/notes") names only
   * per-*exercise* fields, and `notes` there is `routine_exercises.notes`
   * (grouped alongside `supersetId`/`restSeconds`, exercise-level fields),
   * not `routines.notes`.
   */
  async updateFromWorkout(routineId: string, workoutId: string): Promise<RoutineFull> {
    this.requireRoutineRow(routineId);

    const workoutRow = this.driver.queryAll<{
      id: string;
      routine_id: string | null;
      deleted_at: number | null;
    }>(`SELECT id, routine_id, deleted_at FROM workouts WHERE id = ?`, [workoutId])[0];
    if (!workoutRow || workoutRow.deleted_at !== null) {
      throw new WorkoutNotFoundForRoutineError(workoutId);
    }
    if (workoutRow.routine_id !== routineId) {
      throw new WorkoutRoutineMismatchError(routineId, workoutId);
    }

    const workoutExerciseRows = this.driver.queryAll<WorkoutExerciseWithOccurrenceRow>(
      `SELECT id, exercise_id, position, superset_id, notes, rest_seconds, routine_occurrence_index
       FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC`,
      [workoutId],
    );
    const setRowsPerExercise = workoutExerciseRows.map((weRow) =>
      this.driver.queryAll<SetSourceWithRoutinePositionRow>(
        `SELECT id, position, set_type, weight_kg, reps, distance_meters, duration_seconds, custom_metric, routine_set_position
         FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
        [weRow.id],
      ),
    );

    // The routine's *current* live structure — it may have been edited
    // since the workout started (04 §2.2: "edits don't affect past
    // workouts," so the workout's own routine_occurrence_index values were
    // pinned against whatever the routine looked like at start time, not
    // necessarily now); `matchWorkoutToRoutineExercises` re-derives
    // occurrence indexes fresh from this live read, exactly like
    // `computeRoutineDiff` does (`@/domain/routine-diff`'s file header).
    const routineExerciseRows = this.driver.queryAll<RoutineExerciseRow>(
      `SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY position ASC`,
      [routineId],
    );
    const routineSetRowsPerExercise = routineExerciseRows.map((reRow) =>
      this.driver.queryAll<RoutineSetRow>(
        `SELECT * FROM routine_sets WHERE routine_exercise_id = ? ORDER BY position ASC`,
        [reRow.id],
      ),
    );

    const matches = matchWorkoutToRoutineExercises(
      workoutExerciseRows.map((we) => ({
        exerciseId: we.exercise_id,
        routineOccurrenceIndex: we.routine_occurrence_index,
      })),
      routineExerciseRows.map((re) => ({ exerciseId: re.exercise_id })),
    );
    const routineExerciseIndexByWorkoutIndex = new Map(
      matches.map((m) => [m.workoutExerciseIndex, m.routineExerciseIndex]),
    );

    const newExerciseInputs: NewRoutineExerciseInput[] = workoutExerciseRows.map((weRow, weIndex) => {
      const matchedRoutineIndex = routineExerciseIndexByWorkoutIndex.get(weIndex);
      const originalSets = matchedRoutineIndex !== undefined ? routineSetRowsPerExercise[matchedRoutineIndex]! : [];

      // Set correlation via `routine_set_position`, not plain position-order
      // — see `@/domain/routine-diff`'s file header, "Set correlation"
      // (M3-06 review fix): `finish()`'s `renumberSetPositions` can compact
      // `setRow.position` around a skipped non-trailing set, so `setIndex`
      // alone can no longer be trusted to name the correct `originalSets`
      // entry. `matchWorkoutSetsToRoutineSets` is the exact same helper
      // `computeRoutineDiff` uses, so the two can never disagree about which
      // achieved set maps to which target.
      const setMatches = matchWorkoutSetsToRoutineSets(
        setRowsPerExercise[weIndex]!.map((setRow) => ({ routineSetPosition: setRow.routine_set_position })),
        originalSets.length,
      );
      const originalSetByWorkoutSetIndex = new Map(
        setMatches.map((m) => [m.workoutSetIndex, originalSets[m.routineSetIndex]]),
      );

      const sets: NewRoutineSetInput[] = setRowsPerExercise[weIndex]!.map((setRow, setIndex) => {
        const repTarget = computeUpdatedRepTarget(setRow.reps, originalSetByWorkoutSetIndex.get(setIndex));
        return {
          setType: setRow.set_type as SetType,
          weightKg: setRow.weight_kg,
          reps: repTarget.reps,
          repRangeStart: repTarget.repRangeStart,
          repRangeEnd: repTarget.repRangeEnd,
          distanceMeters: setRow.distance_meters,
          durationSeconds: setRow.duration_seconds,
          customMetric: setRow.custom_metric,
        };
      });

      return {
        exerciseId: weRow.exercise_id,
        supersetId: weRow.superset_id,
        notes: weRow.notes,
        restSeconds: weRow.rest_seconds,
        sets,
      };
    });

    const prepared = await this.prepareExercises(newExerciseInputs);
    const now = Date.now();
    this.driver.transaction(() => {
      this.driver.execute(`UPDATE routines SET updated_at = ? WHERE id = ?`, [now, routineId]);
      // ON DELETE CASCADE (schema.ts) removes routine_sets with them —
      // identical replace-all shape `update`'s own `exercises` patch uses.
      this.driver.execute(`DELETE FROM routine_exercises WHERE routine_id = ?`, [routineId]);
      this.insertExercises(routineId, prepared);
    });

    return (await this.getFull(routineId))!;
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private findFolderRow(id: number): RoutineFolderRow | undefined {
    return this.driver.queryAll<RoutineFolderRow>(
      `SELECT * FROM routine_folders WHERE id = ?`,
      [id],
    )[0];
  }

  private requireFolderRow(id: number): RoutineFolderRow {
    const row = this.findFolderRow(id);
    if (!row) {
      throw new RoutineFolderNotFoundError(id);
    }
    return row;
  }

  private findRoutineRow(id: string): RoutineRow | undefined {
    return this.driver.queryAll<RoutineRow>(`SELECT * FROM routines WHERE id = ?`, [id])[0];
  }

  private requireRoutineRow(id: string): RoutineRow {
    const row = this.findRoutineRow(id);
    if (!row) {
      throw new RoutineNotFoundError(id);
    }
    return row;
  }

  private requireRoutineFull(id: string): RoutineFull {
    return this.hydrateRoutine(this.requireRoutineRow(id));
  }

  private hydrateRoutine(row: RoutineRow): RoutineFull {
    const exerciseRows = this.driver.queryAll<RoutineExerciseRow>(
      `SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY position ASC`,
      [row.id],
    );
    const exercises = exerciseRows.map((exerciseRow) => {
      const setRows = this.driver.queryAll<RoutineSetRow>(
        `SELECT * FROM routine_sets WHERE routine_exercise_id = ? ORDER BY position ASC`,
        [exerciseRow.id],
      );
      return mapRoutineExerciseRow(exerciseRow, setRows.map(mapRoutineSetRow));
    });
    return mapRoutineRow(row, exercises);
  }

  private nextFolderPosition(): number {
    const row = this.driver.queryAll<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM routine_folders`,
    )[0];
    return row?.next ?? 0;
  }

  private nextRoutinePosition(folderId: number | null): number {
    const row =
      folderId === null
        ? this.driver.queryAll<{ next: number }>(
            `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM routines WHERE folder_id IS NULL`,
          )[0]
        : this.driver.queryAll<{ next: number }>(
            `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM routines WHERE folder_id = ?`,
            [folderId],
          )[0];
    return row?.next ?? 0;
  }

  /** Renumber `routine_folders.position` for every row to be contiguous 0-based, preserving current order. */
  private renumberFolderPositions(): void {
    const rows = this.driver.queryAll<{ id: number }>(
      `SELECT id FROM routine_folders ORDER BY position ASC`,
    );
    rows.forEach((row, index) => {
      this.driver.execute(`UPDATE routine_folders SET position = ? WHERE id = ?`, [
        index,
        row.id,
      ]);
    });
  }

  /** Renumber `routines.position` for one folder scope's rows to be contiguous 0-based, preserving current order. */
  private renumberRoutinePositions(folderId: number | null): void {
    const rows =
      folderId === null
        ? this.driver.queryAll<{ id: string }>(
            `SELECT id FROM routines WHERE folder_id IS NULL ORDER BY position ASC`,
          )
        : this.driver.queryAll<{ id: string }>(
            `SELECT id FROM routines WHERE folder_id = ? ORDER BY position ASC`,
            [folderId],
          );
    rows.forEach((row, index) => {
      this.driver.execute(`UPDATE routines SET position = ? WHERE id = ?`, [index, row.id]);
    });
  }

  /** Mint every id `create`/`update` needs for a batch of exercise+set inputs, before entering the synchronous `driver.transaction` callback (`generateUuid` is async). */
  private async prepareExercises(
    exercises: NewRoutineExerciseInput[],
  ): Promise<PreparedExercise[]> {
    const prepared: PreparedExercise[] = [];
    for (const input of exercises) {
      const id = await generateUuid();
      const setIds = await Promise.all(input.sets.map(() => generateUuid()));
      prepared.push({ id, setIds, input });
    }
    return prepared;
  }

  /** Insert a batch of prepared exercises + their sets for `routineId`, 0-based position per array order — shared by `create` and `update` (replace-all path). Must run inside the caller's `driver.transaction`. */
  private insertExercises(routineId: string, prepared: PreparedExercise[]): void {
    prepared.forEach(({ id: exerciseId, setIds, input }, exerciseIndex) => {
      this.driver.execute(
        `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, superset_id, notes, rest_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          exerciseId,
          routineId,
          input.exerciseId,
          exerciseIndex,
          input.supersetId ?? null,
          input.notes ?? null,
          input.restSeconds ?? null,
        ],
      );

      input.sets.forEach((set, setIndex) => {
        const setId = setIds[setIndex]!;
        this.driver.execute(
          `INSERT INTO routine_sets
             (id, routine_exercise_id, position, set_type, weight_kg, reps, rep_range_start,
              rep_range_end, distance_meters, duration_seconds, custom_metric)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            setId,
            exerciseId,
            setIndex,
            set.setType ?? 'normal',
            set.weightKg ?? null,
            set.reps ?? null,
            set.repRangeStart ?? null,
            set.repRangeEnd ?? null,
            set.distanceMeters ?? null,
            set.durationSeconds ?? null,
            set.customMetric ?? null,
          ],
        );
      });
    });
  }
}
