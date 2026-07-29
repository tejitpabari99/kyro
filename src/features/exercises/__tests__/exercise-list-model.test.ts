/**
 * `exercise-list-model.test.ts` (M1-07) — search+filter AND-composition and
 * row-building against the **real** 873-row vendored dataset (seeded
 * through the actual `ExerciseRepositoryImpl`/`seedBuiltinExercises` path,
 * `better-sqlite3` backend, 08 §5 parity), not synthetic fixtures. This is
 * also the acceptance-gate evidence for "all 873 rows are logically
 * present/reachable in the data layer without crashing" — `repository.list()`
 * and `buildExerciseRows` both run over the complete dataset below with no
 * synthetic slicing.
 */
import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { BUNDLED_EXERCISE_DATASET, seedBuiltinExercises } from '@/data/exercises/seed-builtins';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import type { Exercise } from '@/data/exercises/types';

import {
  AZ_RAIL_LETTERS,
  buildExerciseRows,
  filterExercises,
  isBrowsingUnfiltered,
  sectionLetterFor,
  type ExerciseFilterState,
} from '../exercise-list-model';

describe('exercise-list-model (real vendored dataset)', () => {
  let driver: SqliteDriver;
  let repository: ExerciseRepositoryImpl;
  let all: Exercise[];

  beforeAll(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    seedBuiltinExercises(driver, BUNDLED_EXERCISE_DATASET.exercises, BUNDLED_EXERCISE_DATASET.version);
    repository = new ExerciseRepositoryImpl(driver);
    all = await repository.list();
  });

  afterAll(() => {
    driver.close();
  });

  const noFilter: ExerciseFilterState = { query: '', muscle: null, equipment: null };

  it('preloads all 873 active built-ins via a single repository.list() call', () => {
    expect(all).toHaveLength(873);
  });

  describe('isBrowsingUnfiltered', () => {
    it('is true only with no query and no filters', () => {
      expect(isBrowsingUnfiltered(noFilter)).toBe(true);
      expect(isBrowsingUnfiltered({ ...noFilter, query: '  ' })).toBe(true); // whitespace-only
      expect(isBrowsingUnfiltered({ ...noFilter, query: 'press' })).toBe(false);
      expect(isBrowsingUnfiltered({ ...noFilter, muscle: 'chest' })).toBe(false);
      expect(isBrowsingUnfiltered({ ...noFilter, equipment: 'barbell' })).toBe(false);
    });
  });

  describe('filterExercises — AND-composition (03 §2 acceptance)', () => {
    it('search alone: "press" matches 97 exercises', () => {
      const result = filterExercises(all, { ...noFilter, query: 'press' });
      expect(result).toHaveLength(97);
    });

    it('search "press" + equipment "barbell" narrows to a known 32-exercise subset', () => {
      const result = filterExercises(all, { ...noFilter, query: 'press', equipment: 'barbell' });
      const ids = result.map((e) => e.id);
      expect(result).toHaveLength(32);
      expect(ids).toContain('Barbell_Bench_Press_-_Medium_Grip');
      expect(ids).toContain('Barbell_Shoulder_Press');
      // Same-name-family exercise on different equipment must be excluded —
      // proves equipment is a real AND filter, not ignored.
      expect(ids).not.toContain('Dumbbell_Bench_Press');
    });

    it('search "squat" + muscle "quadriceps" + equipment "barbell" AND-composes all three dimensions', () => {
      const result = filterExercises(all, {
        query: 'squat',
        muscle: 'quadriceps',
        equipment: 'barbell',
      });
      const ids = result.map((e) => e.id);
      expect(result).toHaveLength(30);
      expect(ids).toContain('Barbell_Squat');
      expect(ids).toContain('Zercher_Squats');
      // Matches query + muscle but wrong equipment -> excluded.
      expect(ids).not.toContain('Bodyweight_Squat');
      expect(ids).not.toContain('Dumbbell_Squat');
    });

    it('equipment filter alone composes correctly (no query, no muscle)', () => {
      const result = filterExercises(all, { ...noFilter, equipment: 'kettlebell' });
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((e) => e.equipment === 'kettlebell')).toBe(true);
    });

    it('muscle filter alone composes correctly', () => {
      const result = filterExercises(all, { ...noFilter, muscle: 'chest' });
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((e) => e.primaryMuscleGroup === 'chest')).toBe(true);
    });

    it('an over-constrained combination can legitimately return zero results', () => {
      const result = filterExercises(all, {
        query: 'zzz_not_a_real_exercise_zzz',
        muscle: null,
        equipment: null,
      });
      expect(result).toHaveLength(0);
    });

    it('search matches case/diacritic-insensitively (03 §2)', () => {
      const upper = filterExercises(all, { ...noFilter, query: 'BARBELL SQUAT' });
      const lower = filterExercises(all, { ...noFilter, query: 'barbell squat' });
      expect(upper.map((e) => e.id).sort()).toEqual(lower.map((e) => e.id).sort());
      expect(upper.length).toBeGreaterThan(0);
    });
  });

  describe('sectionLetterFor', () => {
    it('uppercases the first letter', () => {
      expect(sectionLetterFor('Barbell Squat')).toBe('B');
      expect(sectionLetterFor('zercher squats')).toBe('Z');
    });

    it('buckets non-letter leads (e.g. digits) under "#"', () => {
      expect(sectionLetterFor('3/4 Sit-Up')).toBe('#');
    });
  });

  describe('buildExerciseRows', () => {
    it('produces exactly one row per exercise across the whole dataset (no drops, no dupes) with no Recent section', () => {
      const { rows } = buildExerciseRows({ recent: [], all, showRecent: false });
      const exerciseRows = rows.filter((row) => row.type === 'exercise');
      expect(exerciseRows).toHaveLength(873);
      const uniqueIds = new Set(exerciseRows.map((row) => (row.type === 'exercise' ? row.exercise.id : '')));
      expect(uniqueIds.size).toBe(873);
    });

    it('inserts one header row per distinct first letter, each header preceding its own group', () => {
      const { rows, sectionIndex } = buildExerciseRows({ recent: [], all, showRecent: false });
      const headerLabels = rows.filter((row) => row.type === 'header').map((row) => row.label);
      expect(new Set(headerLabels).size).toBe(headerLabels.length); // no duplicate letter headers
      for (const [letter, index] of Object.entries(sectionIndex)) {
        expect(rows[index]).toEqual({ type: 'header', key: expect.any(String), label: letter });
      }
    });

    it('omits the Recent section when showRecent is false, even with recent exercises supplied', () => {
      const { rows } = buildExerciseRows({ recent: all.slice(0, 3), all, showRecent: false });
      expect(rows.some((row) => row.type === 'header' && row.label === 'Recent')).toBe(false);
    });

    it('includes a Recent header + rows first when showRecent is true and recent is non-empty', () => {
      const recent = all.slice(0, 3);
      const { rows, sectionIndex } = buildExerciseRows({ recent, all, showRecent: true });
      expect(rows[0]).toEqual({ type: 'header', key: 'header:recent', label: 'Recent' });
      expect(sectionIndex.Recent).toBe(0);
      expect(rows[1]).toEqual({ type: 'exercise', key: `recent:${recent[0].id}`, exercise: recent[0] });
    });

    it('omits the Recent header entirely when recent is empty, even if showRecent is true', () => {
      const { rows } = buildExerciseRows({ recent: [], all, showRecent: true });
      expect(rows.some((row) => row.type === 'header' && row.label === 'Recent')).toBe(false);
    });
  });

  it('AZ_RAIL_LETTERS is the fixed 26-letter alphabet', () => {
    expect(AZ_RAIL_LETTERS).toHaveLength(26);
    expect(AZ_RAIL_LETTERS[0]).toBe('A');
    expect(AZ_RAIL_LETTERS[25]).toBe('Z');
  });
});
