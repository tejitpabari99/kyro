/**
 * `CsvService` integration tests (M5-06 acceptance gate) — real
 * `better-sqlite3` against the migrated schema (same harness
 * `workout-repository.stats.test.ts`/`.records.test.ts` already established:
 * raw-SQL fixture helpers for `exercises`/`workouts`/`workout_exercises`/
 * `sets` rows, real `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl`), with
 * only `expo-file-system/legacy` mocked (the one native seam
 * `lib/csv-export-file.ts` touches).
 *
 * The `exportAll` golden-file case deliberately builds the **exact same**
 * dataset `domain/__tests__/csv-codec.test.ts`'s own `buildFixtureWorkouts()`
 * encodes (same titles/dates/exercises/sets/notes/superset ids/rpe values),
 * inserted here via raw SQL instead of that file's plain object literals —
 * so this test can assert against the identical committed golden fixtures
 * (`domain/__fixtures__/csv-codec/export-{kg,lbs}.csv`) without diverging
 * from M5-05's own byte-exact contract. This proves `CsvService.exportAll`'s
 * whole fetch-batch-hydrate-join-encode-write pipeline reproduces exactly
 * what the already-reviewed `encodeWorkoutsCsv` produces for the same
 * logical data — the codec's own escaping/rounding/date-formatting rules are
 * `csv-codec.test.ts`'s job, not re-tested here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';

import { createCsvService } from '../csv-service';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFileSystem = require('expo-file-system/legacy') as {
  writeAsStringAsync: jest.Mock;
};

function readFixture(name: string): string {
  return readFileSync(
    join(__dirname, '../../../domain/__fixtures__/csv-codec', name),
    'utf8',
  );
}

function localDate(y: number, m: number, day: number, h = 0, min = 0): number {
  return new Date(y, m - 1, day, h, min).getTime();
}

/** Last `writeAsStringAsync` call's own `contents` argument — the CSV text `CsvService` actually wrote to disk. */
function lastWrittenContents(): string {
  const calls = mockFileSystem.writeAsStringAsync.mock.calls;
  return calls[calls.length - 1]![1] as string;
}

function lastWrittenUri(): string {
  const calls = mockFileSystem.writeAsStringAsync.mock.calls;
  return calls[calls.length - 1]![0] as string;
}

// ---------------------------------------------------------------------------
// Raw-SQL fixture helpers (same shape as `workout-repository.stats.test.ts`)
// ---------------------------------------------------------------------------

function insertExercise(driver: SqliteDriver, id: string, name: string): void {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, name, now, now],
  );
}

interface FixtureSet {
  position: number;
  setType: string;
  weightKg?: number | null;
  reps?: number | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
}

function insertSets(driver: SqliteDriver, workoutExerciseId: string, sets: FixtureSet[]): void {
  for (const set of sets) {
    driver.execute(
      `INSERT INTO sets
         (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
          duration_seconds, rpe, custom_metric, is_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        `set-${workoutExerciseId}-${set.position}`,
        workoutExerciseId,
        set.position,
        set.setType,
        set.weightKg ?? null,
        set.reps ?? null,
        set.distanceMeters ?? null,
        set.durationSeconds ?? null,
        set.rpe ?? null,
      ],
    );
  }
}

interface FixtureExercise {
  exerciseId: string;
  position: number;
  supersetId?: number | null;
  notes?: string | null;
  sets: FixtureSet[];
}

function insertWorkoutExercise(
  driver: SqliteDriver,
  workoutId: string,
  exercise: FixtureExercise,
): void {
  const weId = `we-${workoutId}-${exercise.position}`;
  driver.execute(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [weId, workoutId, exercise.exerciseId, exercise.position, exercise.supersetId ?? null, exercise.notes ?? null],
  );
  insertSets(driver, weId, exercise.sets);
}

interface FixtureWorkout {
  id: string;
  title: string;
  description?: string | null;
  state: 'active' | 'completed';
  startTime: number;
  endTime?: number | null;
  exercises: FixtureExercise[];
}

function insertWorkout(driver: SqliteDriver, workout: FixtureWorkout): void {
  const now = Date.now();
  driver.execute(
    `INSERT INTO workouts (id, title, description, state, start_time, end_time, duration_pause_offset_ms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      workout.id,
      workout.title,
      workout.description ?? null,
      workout.state,
      workout.startTime,
      workout.endTime ?? null,
      now,
      now,
    ],
  );
  for (const exercise of workout.exercises) {
    insertWorkoutExercise(driver, workout.id, exercise);
  }
}

/** The exact dataset `domain/__tests__/csv-codec.test.ts`'s own `buildFixtureWorkouts()` encodes — see this file's header. */
function seedGoldenFixtureDataset(driver: SqliteDriver): void {
  insertExercise(driver, 'bench-press', 'Bench Press');
  insertExercise(driver, 'incline-db-press', 'Incline Dumbbell Press');
  insertExercise(driver, 'cable-fly', 'Cable Fly');
  insertExercise(driver, 'treadmill', 'Treadmill Run');
  insertExercise(driver, 'should-not-appear', 'Should Not Appear');

  insertWorkout(driver, {
    id: 'w-push-day',
    title: 'Push Day',
    description: 'Felt strong today',
    state: 'completed',
    startTime: localDate(2026, 1, 3, 8, 15),
    endTime: localDate(2026, 1, 3, 9, 5),
    exercises: [
      {
        exerciseId: 'bench-press',
        position: 0,
        sets: [
          { position: 0, setType: 'warmup', weightKg: 40, reps: 10 },
          { position: 1, setType: 'normal', weightKg: 100, reps: 5, rpe: 8 },
          { position: 2, setType: 'normal', weightKg: 102.5, reps: 5, rpe: 8.5 },
          { position: 3, setType: 'failure', weightKg: 105, reps: 3, rpe: 9.5 },
        ],
      },
      {
        exerciseId: 'incline-db-press',
        position: 1,
        supersetId: 1,
        notes: 'Slow eccentric',
        sets: [
          { position: 0, setType: 'normal', weightKg: 30, reps: 10 },
          { position: 1, setType: 'dropset', weightKg: 22.5, reps: 12 },
        ],
      },
      {
        exerciseId: 'cable-fly',
        position: 2,
        supersetId: 1,
        sets: [{ position: 0, setType: 'normal', weightKg: 15, reps: 15, rpe: 7 }],
      },
    ],
  });

  insertWorkout(driver, {
    id: 'w-cardio',
    title: 'Cardio',
    state: 'completed',
    startTime: localDate(2026, 1, 3, 18, 30),
    endTime: localDate(2026, 1, 3, 19, 0),
    exercises: [
      {
        exerciseId: 'treadmill',
        position: 0,
        sets: [{ position: 0, setType: 'normal', distanceMeters: 5000, durationSeconds: 1800 }],
      },
    ],
  });

  // Active (in-progress) — must be excluded entirely (05 §7.1: "completed
  // workouts only"). `listCompleted` itself already filters `state =
  // 'completed'` at the SQL layer, so this also proves that filter, not
  // just `encodeWorkoutsCsv`'s own defensive one.
  insertWorkout(driver, {
    id: 'w-in-progress',
    title: 'In Progress',
    state: 'active',
    startTime: localDate(2026, 1, 3, 20, 0),
    exercises: [
      {
        exerciseId: 'should-not-appear',
        position: 0,
        sets: [{ position: 0, setType: 'normal', weightKg: 50, reps: 5 }],
      },
    ],
  });
}

describe('CsvService.exportAll — golden file (M5-06)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    seedGoldenFixtureDataset(driver);
  });

  afterEach(() => {
    driver.close();
  });

  function service() {
    return createCsvService({
      workoutRepository: new WorkoutRepositoryImpl(driver),
      exerciseRepository: new ExerciseRepositoryImpl(driver),
    });
  }

  it('writes kyro_workouts.csv to the cache directory matching the committed kg/km golden fixture byte-for-byte', async () => {
    const result = await service().exportAll({ weightUnit: 'kg', distanceUnit: 'km' });

    expect(result.fileName).toBe('kyro_workouts.csv');
    expect(result.uri).toBe('file:///mock-cache/kyro_workouts.csv');
    expect(lastWrittenUri()).toBe('file:///mock-cache/kyro_workouts.csv');
    expect(lastWrittenContents()).toBe(readFixture('export-kg.csv'));
  });

  it('matches the committed lbs/miles golden fixture byte-for-byte (header switch + converted values)', async () => {
    await service().exportAll({ weightUnit: 'lbs', distanceUnit: 'miles' });

    expect(lastWrittenContents()).toBe(readFixture('export-lbs.csv'));
  });

  it('excludes the active workout and its exercise entirely, proving listCompleted\'s own SQL filter (not just the codec\'s defensive one)', async () => {
    await service().exportAll({ weightUnit: 'kg', distanceUnit: 'km' });

    const csv = lastWrittenContents();
    expect(csv).not.toContain('In Progress');
    expect(csv).not.toContain('Should Not Appear');
  });

  it('returns a header-only CSV and still writes the file when there are zero completed workouts', async () => {
    const emptyDriver = openBetterSqlite3Driver(':memory:');
    migrate(emptyDriver);
    const emptyService = createCsvService({
      workoutRepository: new WorkoutRepositoryImpl(emptyDriver),
      exerciseRepository: new ExerciseRepositoryImpl(emptyDriver),
    });

    const result = await emptyService.exportAll({ weightUnit: 'kg', distanceUnit: 'km' });

    expect(result.fileName).toBe('kyro_workouts.csv');
    expect(lastWrittenContents().trim().split('\n')).toHaveLength(1); // header row only
    emptyDriver.close();
  });
});

describe('CsvService.exportWorkout — single workout (M5-06)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    seedGoldenFixtureDataset(driver);
  });

  afterEach(() => {
    driver.close();
  });

  function service() {
    return createCsvService({
      workoutRepository: new WorkoutRepositoryImpl(driver),
      exerciseRepository: new ExerciseRepositoryImpl(driver),
    });
  }

  it('exports only the requested workout\'s own rows, none of the other completed workout\'s', async () => {
    const result = await service().exportWorkout('w-push-day', { weightUnit: 'kg', distanceUnit: 'km' });

    const csv = lastWrittenContents();
    const dataRows = csv.trim().split('\n').slice(1);
    // Push Day has 7 sets total across its 3 exercises (4 + 2 + 1).
    expect(dataRows).toHaveLength(7);
    expect(csv).toContain('Push Day');
    expect(csv).not.toContain('Cardio');
    expect(csv).not.toContain('Treadmill Run');
    expect(result.fileName).toBe('kyro_workout_2026-01-03.csv');
  });

  it('names the file after the workout\'s own local start date', async () => {
    const result = await service().exportWorkout('w-cardio', { weightUnit: 'kg', distanceUnit: 'km' });

    expect(result.fileName).toBe('kyro_workout_2026-01-03.csv');
    expect(result.uri).toBe('file:///mock-cache/kyro_workout_2026-01-03.csv');
  });

  it('uses the live unit settings for the single-workout export too', async () => {
    await service().exportWorkout('w-cardio', { weightUnit: 'kg', distanceUnit: 'miles' });

    const csv = lastWrittenContents();
    expect(csv).toContain('distance_miles');
  });

  it('throws a clear error for an unknown workout id, without writing any file', async () => {
    await expect(
      service().exportWorkout('does-not-exist', { weightUnit: 'kg', distanceUnit: 'km' }),
    ).rejects.toThrow(/does-not-exist/);

    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });
});

describe('CsvService — exercise name join (M5-06)', () => {
  it('resolves an archived custom exercise\'s name too (03 §5: archived exercises still appear in old history)', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const now = Date.now();
    driver.execute(
      `INSERT INTO exercises
         (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
          equipment, instructions, images, animation_uri, is_custom,
          uses_custom_metric, aliases, archived_at, created_at, updated_at)
       VALUES ('old-custom', 'My Old Custom Move', 'weight_reps', 'chest', '[]', 'none', '[]', '[]', NULL, 1, 0, '[]', ?, ?, ?)`,
      [now, now, now],
    );
    insertWorkout(driver, {
      id: 'w-1',
      title: 'Archived Exercise Workout',
      state: 'completed',
      startTime: localDate(2026, 2, 1, 10, 0),
      endTime: localDate(2026, 2, 1, 10, 30),
      exercises: [
        {
          exerciseId: 'old-custom',
          position: 0,
          sets: [{ position: 0, setType: 'normal', weightKg: 20, reps: 10 }],
        },
      ],
    });

    const service = createCsvService({
      workoutRepository: new WorkoutRepositoryImpl(driver),
      exerciseRepository: new ExerciseRepositoryImpl(driver),
    });
    await service.exportAll({ weightUnit: 'kg', distanceUnit: 'km' });

    expect(lastWrittenContents()).toContain('My Old Custom Move');
    driver.close();
  });
});
