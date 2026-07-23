/**
 * CHECK-constraint verification tests (M1-01 acceptance gate) — 05 §3.1-3.3:
 * insert-rejection tests for a bad enum value, an out-of-domain `rpe`, and a
 * `routine_sets` row violating the reps-vs-range XOR check. Also proves the
 * happy path (a fully valid row through the exercises → workouts →
 * workout_exercises → sets chain, and a valid routine_sets row) so the
 * rejections are known to be about the specific bad value, not some
 * unrelated FK/NOT NULL failure.
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';

const NOW = 1_700_000_000_000;

describe('full v1 schema CHECK constraints (M1-01)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver); // fresh DB, up to date (version 2) — full v1 schema present.
  });

  afterEach(() => {
    driver.close();
  });

  function insertExercise(overrides: Partial<Record<string, unknown>> = {}) {
    const row = {
      id: 'bench-press',
      name: 'Bench Press',
      exercise_type: 'weight_reps',
      primary_muscle_group: 'chest',
      equipment: 'barbell',
      archived_at: null as number | null,
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    };
    driver.execute(
      `INSERT INTO exercises
         (id, name, exercise_type, primary_muscle_group, equipment, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.name,
        row.exercise_type,
        row.primary_muscle_group,
        row.equipment,
        row.archived_at,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  it('happy path: a fully valid exercise row inserts fine', () => {
    expect(() => insertExercise()).not.toThrow();
    expect(driver.queryAll(`SELECT id FROM exercises`)).toEqual([{ id: 'bench-press' }]);
  });

  it('rejects an exercise row with a bad exercise_type enum value', () => {
    expect(() => insertExercise({ exercise_type: 'not_a_real_type' })).toThrow(
      /CHECK constraint failed/i,
    );
  });

  it('rejects an exercise row with a bad primary_muscle_group enum value', () => {
    expect(() => insertExercise({ primary_muscle_group: 'not_a_real_muscle' })).toThrow(
      /CHECK constraint failed/i,
    );
  });

  it('rejects an exercise row with a bad equipment enum value', () => {
    expect(() => insertExercise({ equipment: 'not_a_real_equipment' })).toThrow(
      /CHECK constraint failed/i,
    );
  });

  describe('sets.rpe domain', () => {
    function setUpWorkoutExercise() {
      insertExercise();
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
         VALUES ('w1', 'Workout', 'active', ?, ?, ?)`,
        [NOW, NOW, NOW],
      );
      driver.execute(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, position)
         VALUES ('we1', 'w1', 'bench-press', 0)`,
      );
    }

    beforeEach(() => {
      setUpWorkoutExercise();
    });

    it('happy path: a set with an allowed rpe value inserts fine', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO sets (id, workout_exercise_id, position, reps, weight_kg, rpe)
           VALUES ('s1', 'we1', 0, 8, 100, 8.5)`,
        ),
      ).not.toThrow();
    });

    it('happy path: a set with a null rpe inserts fine (rpe is optional)', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO sets (id, workout_exercise_id, position, reps, weight_kg)
           VALUES ('s2', 'we1', 0, 8, 100)`,
        ),
      ).not.toThrow();
    });

    it('rejects rpe = 6.2 — not in the allowed domain (6, 7, 7.5, 8, 8.5, 9, 9.5, 10)', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO sets (id, workout_exercise_id, position, reps, weight_kg, rpe)
           VALUES ('s3', 'we1', 0, 8, 100, 6.2)`,
        ),
      ).toThrow(/CHECK constraint failed/i);
    });

    it('rejects a bad set_type enum value', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO sets (id, workout_exercise_id, position, set_type)
           VALUES ('s4', 'we1', 0, 'not_a_real_set_type')`,
        ),
      ).toThrow(/CHECK constraint failed/i);
    });
  });

  describe('routine_sets reps-vs-range XOR check', () => {
    function setUpRoutineExercise() {
      insertExercise();
      driver.execute(
        `INSERT INTO routines (id, title, position, created_at, updated_at)
         VALUES ('r1', 'Routine', 0, ?, ?)`,
        [NOW, NOW],
      );
      driver.execute(
        `INSERT INTO routine_exercises (id, routine_id, exercise_id, position)
         VALUES ('re1', 'r1', 'bench-press', 0)`,
      );
    }

    beforeEach(() => {
      setUpRoutineExercise();
    });

    it('happy path: a routine_sets row with only reps set inserts fine', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO routine_sets (id, routine_exercise_id, position, reps)
           VALUES ('rs1', 're1', 0, 8)`,
        ),
      ).not.toThrow();
    });

    it('happy path: a routine_sets row with only a rep range set inserts fine', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO routine_sets (id, routine_exercise_id, position, rep_range_start, rep_range_end)
           VALUES ('rs2', 're1', 0, 6, 8)`,
        ),
      ).not.toThrow();
    });

    it('happy path: a routine_sets row with neither reps nor a range set inserts fine', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO routine_sets (id, routine_exercise_id, position)
           VALUES ('rs3', 're1', 0)`,
        ),
      ).not.toThrow();
    });

    it('rejects a routine_sets row with both reps AND rep_range_start set', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO routine_sets (id, routine_exercise_id, position, reps, rep_range_start)
           VALUES ('rs4', 're1', 0, 8, 6)`,
        ),
      ).toThrow(/CHECK constraint failed/i);
    });
  });

  describe('workouts.state domain + partial unique index', () => {
    it('rejects a bad workouts.state enum value', () => {
      expect(() =>
        driver.execute(
          `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
           VALUES ('w2', 'Workout', 'paused', ?, ?, ?)`,
          [NOW, NOW, NOW],
        ),
      ).toThrow(/CHECK constraint failed/i);
    });

    it('idx_one_active_workout rejects a second concurrent active workout', () => {
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
         VALUES ('w3', 'Workout 3', 'active', ?, ?, ?)`,
        [NOW, NOW, NOW],
      );
      expect(() =>
        driver.execute(
          `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
           VALUES ('w4', 'Workout 4', 'active', ?, ?, ?)`,
          [NOW, NOW, NOW],
        ),
      ).toThrow(/UNIQUE constraint failed/i);
    });
  });

  describe('idx_exercises_name_active partial unique index', () => {
    it('rejects a second active exercise with the same name (case-insensitive)', () => {
      insertExercise({ id: 'bench-press-1', name: 'Bench Press' });
      expect(() => insertExercise({ id: 'bench-press-2', name: 'BENCH PRESS' })).toThrow(
        /UNIQUE constraint failed/i,
      );
    });

    it('allows an archived exercise to share a name with an active one', () => {
      insertExercise({ id: 'bench-press-1', name: 'Bench Press' });
      expect(() =>
        insertExercise({ id: 'bench-press-2', name: 'Bench Press', archived_at: NOW }),
      ).not.toThrow();
    });
  });
});
