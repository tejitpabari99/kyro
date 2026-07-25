/**
 * `WorkoutRepositoryImpl.update` integration tests (M4-05 acceptance gate,
 * 02 §15 / 08 §4.9) — same pattern `workout-repository.records.test.ts`
 * (M4-02) established: real `better-sqlite3` against the migrated schema,
 * raw-SQL fixture helpers for parts no repository method covers, real
 * repository calls elsewhere. Two things this file proves end-to-end,
 * directly against 02 §15's own acceptance bullets:
 *
 *  1. `update()` itself: full-content replace (delete + reinsert
 *     `workout_exercises`/`sets`), `updated_at` bump, `state`/`id`/
 *     `routineId`/`createdAt` all left untouched, `WorkoutNotFoundError` for
 *     an unknown/soft-deleted id.
 *  2. **One-active-workout invariant preserved during a concurrent edit** —
 *     a genuinely active workout (via `startEmpty`) is completely
 *     unaffected by an `update()` call against a *different*, completed
 *     workout: `getActive()` still resolves the same active workout
 *     afterward, and the edited workout's own `state` never flips away from
 *     `'completed'`.
 *
 * **PR trophy movement** (raising/lowering a past weight moves the trophy;
 * deleting the PR-holder reassigns to next-best) is covered end-to-end
 * against the *real* `RecordsService` in a sibling-layer test,
 * `src/features/stats/__tests__/records-service.integration.test.ts` — this
 * file (`src/data/**`) cannot import `src/features/**` itself (06 §2's
 * dependency-direction rule, lint-enforced: "src/data may only depend on
 * src/domain").
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { WorkoutNotFoundError } from '../errors';
import { WorkoutRepositoryImpl } from '../workout-repository';
import type { WorkoutUpdateInput } from '../types';

function insertExercise(driver: SqliteDriver, id: string): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, id, now, now],
  );
  return id;
}

function seedCompletedWorkout(
  driver: SqliteDriver,
  workoutId: string,
  exerciseId: string,
  startTime: number,
  sets: { weightKg: number; reps: number }[],
): void {
  driver.execute(
    `INSERT INTO workouts (id, title, state, start_time, end_time, created_at, updated_at)
     VALUES (?, 'Fixture workout', 'completed', ?, ?, ?, ?)`,
    [workoutId, startTime, startTime + 1_000, startTime, startTime],
  );
  const weId = `we-${workoutId}`;
  driver.execute(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
     VALUES (?, ?, ?, 0, NULL, NULL, NULL)`,
    [weId, workoutId, exerciseId],
  );
  sets.forEach((set, index) => {
    driver.execute(
      `INSERT INTO sets
         (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
          duration_seconds, rpe, custom_metric, is_completed)
       VALUES (?, ?, ?, 'normal', ?, ?, NULL, NULL, NULL, NULL, 1)`,
      [`set-${workoutId}-${index}`, weId, index, set.weightKg, set.reps],
    );
  });
}

describe('WorkoutRepositoryImpl.update (M4-05 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;
  let benchId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new WorkoutRepositoryImpl(driver);
    benchId = insertExercise(driver, 'bench-press');
  });

  afterEach(() => {
    driver.close();
  });

  it('throws WorkoutNotFoundError for an unknown id', async () => {
    const input: WorkoutUpdateInput = {
      title: 'x',
      description: null,
      startTime: 1,
      endTime: 2,
      durationPauseOffsetMs: 0,
      exercises: [],
    };
    await expect(repo.update('does-not-exist', input)).rejects.toBeInstanceOf(WorkoutNotFoundError);
  });

  it('throws WorkoutNotFoundError for a soft-deleted workout', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    await repo.softDelete('w1');

    await expect(
      repo.update('w1', {
        title: 'x',
        description: null,
        startTime: 1,
        endTime: 2,
        durationPauseOffsetMs: 0,
        exercises: [],
      }),
    ).rejects.toBeInstanceOf(WorkoutNotFoundError);
  });

  it('replaces title/description/times and bumps updated_at, leaving id/state/routineId/createdAt untouched', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    const before = await repo.getFull('w1');
    // Ensure a real clock-tick difference so updated_at strictly increases.
    await new Promise((resolve) => setTimeout(resolve, 2));

    const updated = await repo.update('w1', {
      title: 'Renamed',
      description: 'New note',
      startTime: 2_000,
      endTime: 5_000,
      durationPauseOffsetMs: 100,
      exercises: [
        {
          exerciseId: benchId,
          supersetId: null,
          notes: null,
          restSeconds: 90,
          sets: [{ setType: 'normal', weightKg: 105, reps: 5, distanceMeters: null, durationSeconds: null, rpe: null, customMetric: null, isCompleted: true }],
        },
      ],
    });

    expect(updated.id).toBe('w1');
    expect(updated.state).toBe('completed');
    expect(updated.routineId).toBeNull();
    expect(updated.createdAt).toBe(before!.createdAt);
    expect(updated.title).toBe('Renamed');
    expect(updated.description).toBe('New note');
    expect(updated.startTime).toBe(2_000);
    expect(updated.endTime).toBe(5_000);
    expect(updated.durationPauseOffsetMs).toBe(100);
    expect(updated.updatedAt).toBeGreaterThan(before!.updatedAt);
  });

  it('replaces exercises/sets content wholesale — old rows gone, new rows present with fresh ids', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [
      { weightKg: 100, reps: 5 },
      { weightKg: 105, reps: 3 },
    ]);
    const before = await repo.getFull('w1');
    const oldSetIds = before!.exercises[0]!.sets.map((s) => s.id);

    const updated = await repo.update('w1', {
      title: before!.title,
      description: before!.description,
      startTime: before!.startTime,
      endTime: before!.endTime,
      durationPauseOffsetMs: before!.durationPauseOffsetMs,
      exercises: [
        {
          exerciseId: benchId,
          supersetId: null,
          notes: 'edited note',
          restSeconds: 60,
          sets: [
            { setType: 'normal', weightKg: 110, reps: 4, distanceMeters: null, durationSeconds: null, rpe: null, customMetric: null, isCompleted: true },
          ],
        },
      ],
    });

    expect(updated.exercises).toHaveLength(1);
    expect(updated.exercises[0]!.notes).toBe('edited note');
    expect(updated.exercises[0]!.restSeconds).toBe(60);
    expect(updated.exercises[0]!.sets).toHaveLength(1);
    expect(updated.exercises[0]!.sets[0]!.weightKg).toBe(110);
    expect(updated.exercises[0]!.sets[0]!.reps).toBe(4);
    expect(oldSetIds).not.toContain(updated.exercises[0]!.sets[0]!.id);
    // routine_occurrence_index/routine_set_position both reset to NULL —
    // see WorkoutUpdateExerciseInput's own doc comment.
    expect(updated.exercises[0]!.routineOccurrenceIndex).toBeNull();
    expect(updated.exercises[0]!.sets[0]!.routineSetPosition).toBeNull();

    // The old workout_exercises row is genuinely gone (cascaded away), not
    // just orphaned — a stray row would break the exercise-count assertion
    // above if the DELETE hadn't actually run.
    const remainingRows = driver.queryAll(`SELECT id FROM workout_exercises WHERE workout_id = ?`, ['w1']);
    expect(remainingRows).toHaveLength(1);
  });

  it('replacing with an empty exercises array removes every exercise/set', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);

    const updated = await repo.update('w1', {
      title: 'Now empty',
      description: null,
      startTime: 1_000,
      endTime: 2_000,
      durationPauseOffsetMs: 0,
      exercises: [],
    });

    expect(updated.exercises).toEqual([]);
  });

  // -------------------------------------------------------------------
  // One-active-workout invariant preserved during a concurrent edit
  // (02 §15 acceptance: "edit cannot corrupt one-active invariant").
  // PR trophy movement (raise/lower/delete) is covered end-to-end against
  // the real `RecordsService` in
  // `src/features/stats/__tests__/records-service.integration.test.ts` —
  // this file cannot import `src/features/**` itself (06 §2's `src/data`
  // dependency-direction rule, lint-enforced).
  // -------------------------------------------------------------------
  describe('one-active-workout invariant preserved during a concurrent edit', () => {
    it('update() against a completed workout leaves a separately-running active workout completely untouched', async () => {
      // A genuinely active workout, created through the normal lifecycle
      // path — the thing the one-active-workout invariant protects.
      const active = await repo.startEmpty({ title: 'Live session', startTime: 5_000 });

      seedCompletedWorkout(driver, 'w-past', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
      const past = (await repo.getFull('w-past'))!;

      await repo.update('w-past', {
        title: 'Edited past workout',
        description: past.description,
        startTime: past.startTime,
        endTime: past.endTime,
        durationPauseOffsetMs: past.durationPauseOffsetMs,
        exercises: [
          {
            exerciseId: benchId,
            supersetId: null,
            notes: null,
            restSeconds: null,
            sets: [
              { setType: 'normal', weightKg: 999, reps: 1, distanceMeters: null, durationSeconds: null, rpe: null, customMetric: null, isCompleted: true },
            ],
          },
        ],
      });

      // The active workout is completely unaffected — same id, same state,
      // same title.
      const stillActive = await repo.getActive();
      expect(stillActive).not.toBeNull();
      expect(stillActive!.id).toBe(active.id);
      expect(stillActive!.state).toBe('active');
      expect(stillActive!.title).toBe('Live session');

      // The edited workout itself never flipped state — it stays completed
      // throughout and after the edit.
      const editedNow = await repo.getFull('w-past');
      expect(editedNow!.state).toBe('completed');
      expect(editedNow!.title).toBe('Edited past workout');

      // A second startEmpty (the real invariant enforcement) still correctly
      // rejects — proving the index/pre-check itself was never bypassed by
      // the edit.
      await expect(repo.startEmpty({ title: 'Second', startTime: 6_000 })).rejects.toThrow(
        /already exists/,
      );
    });
  });
});
