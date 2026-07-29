/**
 * `RecordsService` × `WorkoutRepositoryImpl` end-to-end integration tests
 * (M4-05 acceptance gate, 02 §15) — real `better-sqlite3` against the
 * migrated schema (never mocked, 08 §5), the real `createRecordsService`
 * factory (not a fake `RecordsRepository` — `records-service.test.ts`'s own
 * file header explains why *that* file deliberately stays SQLite-free; this
 * file is the complementary "does it actually work against real rows"
 * proof), driving the exact repository calls the past-workout editor
 * (`EditWorkoutScreen`, M4-05) and the workout-detail delete flow (M4-04)
 * make: `update()` (full-content replace) and `softDelete()`.
 *
 * Directly proves 02 §15's own acceptance bullets:
 *  - "Raising an old workout's weight above the current PR makes that
 *    historical set the PR (trophy moves)."
 *  - "Deleting the PR-holding workout reassigns records to the next-best
 *    historical set."
 */
import { createRecordsService } from '../records-service';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';

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

describe('RecordsService × WorkoutRepositoryImpl (M4-05 integration, better-sqlite3)', () => {
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

  it("raising a past workout's weight above the current best (via update()) moves the Heaviest Weight trophy to the edited set", async () => {
    seedCompletedWorkout(driver, 'w-old', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    seedCompletedWorkout(driver, 'w-current-best', benchId, 2_000, [{ weightKg: 102.5, reps: 5 }]);
    const service = createRecordsService(repo);

    const before = await service.getSnapshot(benchId);
    expect(before.snapshot.heaviestWeightKg).toMatchObject({ value: 102.5, workoutId: 'w-current-best' });

    // Raise the *older* workout's weight above the current best via a
    // full-content update() — exactly the past-workout-editor's own Save
    // path (`EditWorkoutScreen.handleSave`).
    const oldWorkout = (await repo.getFull('w-old'))!;
    await repo.update('w-old', {
      title: oldWorkout.title,
      description: oldWorkout.description,
      startTime: oldWorkout.startTime,
      endTime: oldWorkout.endTime,
      durationPauseOffsetMs: oldWorkout.durationPauseOffsetMs,
      exercises: [
        {
          exerciseId: benchId,
          supersetId: null,
          notes: null,
          restSeconds: null,
          sets: [
            {
              setType: 'normal',
              weightKg: 150,
              reps: 5,
              distanceMeters: null,
              durationSeconds: null,
              rpe: null,
              customMetric: null,
              isCompleted: true,
            },
          ],
        },
      ],
    });

    const after = await service.getSnapshot(benchId);
    expect(after.snapshot.heaviestWeightKg).toMatchObject({ value: 150, workoutId: 'w-old' });
  });

  it('deleting the PR-holding workout (softDelete) reassigns the trophy to the next-best historical set', async () => {
    seedCompletedWorkout(driver, 'w-second-best', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    seedCompletedWorkout(driver, 'w-pr-holder', benchId, 2_000, [{ weightKg: 120, reps: 5 }]);
    const service = createRecordsService(repo);

    const before = await service.getSnapshot(benchId);
    expect(before.snapshot.heaviestWeightKg).toMatchObject({ value: 120, workoutId: 'w-pr-holder' });

    await repo.softDelete('w-pr-holder');

    const after = await service.getSnapshot(benchId);
    expect(after.snapshot.heaviestWeightKg).toMatchObject({ value: 100, workoutId: 'w-second-best' });
  });

  it("lowering a past workout's weight below another historical set (via update()) moves the trophy away from it", async () => {
    seedCompletedWorkout(driver, 'w-a', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    seedCompletedWorkout(driver, 'w-b', benchId, 2_000, [{ weightKg: 120, reps: 5 }]);
    const service = createRecordsService(repo);

    expect((await service.getSnapshot(benchId)).snapshot.heaviestWeightKg).toMatchObject({
      workoutId: 'w-b',
      value: 120,
    });

    const workoutB = (await repo.getFull('w-b'))!;
    await repo.update('w-b', {
      title: workoutB.title,
      description: workoutB.description,
      startTime: workoutB.startTime,
      endTime: workoutB.endTime,
      durationPauseOffsetMs: workoutB.durationPauseOffsetMs,
      exercises: [
        {
          exerciseId: benchId,
          supersetId: null,
          notes: null,
          restSeconds: null,
          sets: [
            {
              setType: 'normal',
              weightKg: 90,
              reps: 5,
              distanceMeters: null,
              durationSeconds: null,
              rpe: null,
              customMetric: null,
              isCompleted: true,
            },
          ],
        },
      ],
    });

    expect((await service.getSnapshot(benchId)).snapshot.heaviestWeightKg).toMatchObject({
      workoutId: 'w-a',
      value: 100,
    });
  });

  it('removing an exercise entirely from a workout via update() (e.g. Replace Exercise mid-edit) drops its contribution from the trophy computation', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    const service = createRecordsService(repo);
    expect((await service.getSnapshot(benchId)).snapshot.heaviestWeightKg).toMatchObject({ value: 100 });

    const workout = (await repo.getFull('w1'))!;
    await repo.update('w1', {
      title: workout.title,
      description: workout.description,
      startTime: workout.startTime,
      endTime: workout.endTime,
      durationPauseOffsetMs: workout.durationPauseOffsetMs,
      exercises: [],
    });

    expect((await service.getSnapshot(benchId)).snapshot.heaviestWeightKg).toBeNull();
  });
});
