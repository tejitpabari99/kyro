/**
 * `WorkoutRepositoryImpl.workoutDates` / `.workoutsForDate` integration
 * tests (M4-06 acceptance gate) — same pattern
 * `workout-repository.records.test.ts` (M4-02) established: real
 * `better-sqlite3` against the migrated schema, raw-SQL fixture helpers for
 * `workouts` rows (no exercises/sets needed — these two methods only ever
 * read `workouts.start_time`/`state`/`deleted_at`).
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { WorkoutRepositoryImpl } from '../workout-repository';

function insertWorkout(
  driver: SqliteDriver,
  id: string,
  opts: {
    title?: string;
    state?: 'active' | 'completed';
    startTime: number;
    deletedAt?: number | null;
  },
): void {
  const state = opts.state ?? 'completed';
  driver.execute(
    `INSERT INTO workouts (id, title, state, start_time, end_time, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.title ?? 'Fixture workout',
      state,
      opts.startTime,
      state === 'completed' ? opts.startTime + 1_000 : null,
      opts.startTime,
      opts.startTime,
      opts.deletedAt ?? null,
    ],
  );
}

function local(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe('WorkoutRepositoryImpl — workoutDates / workoutsForDate (M4-06 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new WorkoutRepositoryImpl(driver);
  });

  afterEach(() => {
    driver.close();
  });

  describe('workoutDates', () => {
    it('groups multiple workouts on the same local day into one row with count > 1', async () => {
      insertWorkout(driver, 'w1', { startTime: local(2026, 7, 10, 8) });
      insertWorkout(driver, 'w2', { startTime: local(2026, 7, 10, 18) });
      insertWorkout(driver, 'w3', { startTime: local(2026, 7, 11, 9) });

      const dates = await repo.workoutDates();
      expect(dates).toEqual([
        { date: '2026-07-10', count: 2 },
        { date: '2026-07-11', count: 1 },
      ]);
    });

    it('excludes active workouts and soft-deleted workouts', async () => {
      insertWorkout(driver, 'w-active', { state: 'active', startTime: local(2026, 7, 10) });
      insertWorkout(driver, 'w-deleted', { startTime: local(2026, 7, 11), deletedAt: Date.now() });
      insertWorkout(driver, 'w-ok', { startTime: local(2026, 7, 12) });

      const dates = await repo.workoutDates();
      expect(dates).toEqual([{ date: '2026-07-12', count: 1 }]);
    });

    it('a workout starting at 23:50 buckets to its own start date (02 §16.3 midnight-crossing)', async () => {
      insertWorkout(driver, 'w-late', { startTime: local(2026, 7, 10, 23, 50) });

      const dates = await repo.workoutDates();
      expect(dates).toEqual([{ date: '2026-07-10', count: 1 }]);
    });

    it('respects an inclusive start / exclusive end range', async () => {
      insertWorkout(driver, 'w-before', { startTime: local(2026, 7, 9) });
      insertWorkout(driver, 'w-in', { startTime: local(2026, 7, 10) });
      insertWorkout(driver, 'w-at-end', { startTime: local(2026, 7, 11) });

      const dates = await repo.workoutDates({ start: local(2026, 7, 10, 0), end: local(2026, 7, 11, 0) });
      expect(dates).toEqual([{ date: '2026-07-10', count: 1 }]);
    });

    it('returns [] when there are no completed workouts', async () => {
      expect(await repo.workoutDates()).toEqual([]);
    });
  });

  describe('workoutsForDate', () => {
    it('returns every completed workout on that local day, ordered by start_time ASC', async () => {
      insertWorkout(driver, 'w-evening', { title: 'Evening', startTime: local(2026, 7, 10, 18) });
      insertWorkout(driver, 'w-morning', { title: 'Morning', startTime: local(2026, 7, 10, 7) });
      insertWorkout(driver, 'w-other-day', { title: 'Other day', startTime: local(2026, 7, 11, 7) });

      const results = await repo.workoutsForDate('2026-07-10');
      expect(results.map((r) => r.title)).toEqual(['Morning', 'Evening']);
    });

    it('excludes active and soft-deleted workouts on that day', async () => {
      insertWorkout(driver, 'w-active', { state: 'active', startTime: local(2026, 7, 10, 8) });
      insertWorkout(driver, 'w-deleted', { startTime: local(2026, 7, 10, 9), deletedAt: Date.now() });

      expect(await repo.workoutsForDate('2026-07-10')).toEqual([]);
    });

    it('a workout starting at 23:50 is returned for its start date, not the next calendar day', async () => {
      insertWorkout(driver, 'w-late', { title: 'Late night', startTime: local(2026, 7, 10, 23, 50) });

      expect((await repo.workoutsForDate('2026-07-10')).map((r) => r.title)).toEqual(['Late night']);
      expect(await repo.workoutsForDate('2026-07-11')).toEqual([]);
    });

    it('returns [] for a day with no workouts', async () => {
      expect(await repo.workoutsForDate('2026-01-01')).toEqual([]);
    });
  });
});
