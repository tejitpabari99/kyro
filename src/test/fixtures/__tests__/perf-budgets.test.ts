/**
 * M4-11 acceptance gate — "automated timing test (node) for bucketing/
 * records on the fixture." Loads the synthetic 5-year, 1000+-workout
 * fixture (`../synthetic-history.ts` + `../synthetic-history-loader.ts`)
 * into a real `better-sqlite3` driver running the actual migrated schema
 * (same integration-test posture `workout-repository.stats.test.ts`/
 * `workout-repository.records.test.ts` already established), then times
 * the real production read paths against it:
 *
 *  - `WorkoutRepositoryImpl.statsFeed(range)` + `domain/stats-buckets.ts`'s
 *    full bucketing suite (workouts-per-week, the 3 aggregate-trend
 *    metrics, muscle distribution, the muscle-per-week stack, summary
 *    totals) for every `DashboardRangeKey` — 06 §8's "charts/stats < 300 ms
 *    per range (single ranged feed query + pure bucketing)" budget, timed
 *    as one query+compute unit per range (matching how the real dashboard
 *    screen actually pays for a range switch: `statsFeed` refetch +
 *    re-derive every card from the fresh rows).
 *  - `WorkoutRepositoryImpl.setsForExercise(exerciseId)` +
 *    `domain/records.ts`'s `computeRecordsSnapshot` for every exercise in
 *    the synthetic roster — 05 §4's "records computation per exercise
 *    acceptable (low-thousands rows)" budget.
 *
 * This is a `src/test/**` file (not `src/domain/__tests__/`) specifically
 * so it can import both `src/data` (the real driver/migrator/repository)
 * and `src/domain` (stats-buckets/records) without tripping
 * `eslint.config.js`'s `src/domain` import-boundary zone (that zone bans
 * `src/domain/**` files from importing `src/data` — correct for production
 * domain code, irrelevant to a test file that legitimately needs both to
 * prove an integration-level budget, not a pure-function one).
 *
 * Budget is asserted at 300 ms per file header/06 §8; actual measured
 * numbers are logged via `console.log` (captured in this task's
 * `docs/plan/EXECUTION-LOG.md` row) rather than hard-coded, since they
 * depend on this machine's own CPU.
 */
import { openBetterSqlite3Driver } from '../../../data/sqlite/driver.better-sqlite3';
import { migrate } from '../../../data/sqlite/migrator';
import type { SqliteDriver } from '../../../data/sqlite/driver';
import { WorkoutRepositoryImpl } from '../../../data/workouts/workout-repository';
import {
  DASHBOARD_CHART_RANGES,
  MUSCLE_DISTRIBUTION_RANGES,
  bucketAggregateTrend,
  bucketSetsPerMuscleGroupPerWeek,
  bucketWorkoutsPerWeek,
  chooseTrendGranularity,
  computeMuscleDistribution,
  computeSummaryTotals,
  displayRangeBounds,
  rangeQueryBounds,
  type DashboardRangeKey,
} from '../../../domain/stats-buckets';
import { computeRecordsSnapshot, type HistoricalSet } from '../../../domain/records';
import { generateSyntheticHistory, SYNTHETIC_EXERCISES } from '../synthetic-history';
import { insertSyntheticHistory } from '../synthetic-history-loader';

const PERF_BUDGET_MS = 300;
// Every range key the dashboard can ever request — the union of
// `DASHBOARD_CHART_RANGES` (3m/1y/all) and `MUSCLE_DISTRIBUTION_RANGES`'s
// wider 7d/30d addition (`domain/stats-buckets.ts`'s own exports) — so this
// test covers "all stats ranges" (M4-11's own acceptance line) rather than
// only the 3-entry subset most cards use.
const ALL_RANGES: readonly DashboardRangeKey[] = Array.from(
  new Set([...MUSCLE_DISTRIBUTION_RANGES, ...DASHBOARD_CHART_RANGES]),
);

function toHistoricalSets(
  rows: Awaited<ReturnType<WorkoutRepositoryImpl['setsForExercise']>>,
): HistoricalSet[] {
  return rows;
}

describe('M4-11 perf budgets — synthetic 5-year fixture (node, real better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;
  const now = new Date('2026-07-25T12:00:00.000Z');

  beforeAll(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new WorkoutRepositoryImpl(driver);

    const dataset = generateSyntheticHistory({ now });
    const seedResult = insertSyntheticHistory(driver, dataset);

    // Fixture-shape sanity — not the perf budget itself, but a real assertion
    // that the "1000+ workouts, realistic exercise spread" fixture actually
    // landed at the scale/shape this whole test depends on.
    expect(seedResult.workoutCount).toBeGreaterThanOrEqual(1000);
    expect(seedResult.exerciseCount).toBe(SYNTHETIC_EXERCISES.length);
    expect(new Set(SYNTHETIC_EXERCISES.map((e) => e.exerciseType)).size).toBe(8);

    console.log(
      `[M4-11 fixture] ${seedResult.workoutCount} workouts, ${seedResult.setCount} sets, ` +
        `${seedResult.exerciseCount} exercises (8 distinct exercise_types), ` +
        `seeded in ${seedResult.elapsedMs} ms.`,
    );
  });

  afterAll(() => {
    driver.close();
  });

  it.each(ALL_RANGES)('statsFeed + full stats-buckets compute for range "%s" is under budget', async (range) => {
    const startedAt = performance.now();

    const bounds = rangeQueryBounds(range, now);
    const rows = await repo.statsFeed(bounds);
    const displayBounds = displayRangeBounds(range, rows, now);
    const granularity = chooseTrendGranularity(range, rows);

    bucketWorkoutsPerWeek(rows, displayBounds, 'monday');
    bucketAggregateTrend(rows, displayBounds, 'monday', granularity, 'duration', true);
    bucketAggregateTrend(rows, displayBounds, 'monday', granularity, 'volume', true);
    bucketAggregateTrend(rows, displayBounds, 'monday', granularity, 'reps', true);
    // Computed once, shared with bucketSetsPerMuscleGroupPerWeek below (both
    // read the same `(rows, true)` distribution here — a real dashboard
    // render with dashboardRange === muscleRange would too) — see that
    // function's own "M4-11 perf-budget review fix" doc comment
    // (domain/stats-buckets.ts) for why a second full pass over 15.7k rows
    // was redundant and worth avoiding at this range's scale.
    const muscleDistribution = computeMuscleDistribution(rows, true);
    bucketSetsPerMuscleGroupPerWeek(rows, displayBounds, 'monday', true, muscleDistribution);
    computeSummaryTotals(rows, true);

    const elapsedMs = performance.now() - startedAt;
    console.log(
      `[M4-11 perf] statsFeed+buckets range="${range}" rows=${rows.length} elapsed=${elapsedMs.toFixed(1)}ms`,
    );

    expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS);
  });

  it.each(SYNTHETIC_EXERCISES.map((e) => e.id))(
    'setsForExercise + computeRecordsSnapshot for exercise "%s" is under budget',
    async (exerciseId) => {
      const startedAt = performance.now();

      const rows = await repo.setsForExercise(exerciseId);
      const sets = toHistoricalSets(rows);
      const { snapshot, awards } = computeRecordsSnapshot(sets);

      const elapsedMs = performance.now() - startedAt;
      console.log(
        `[M4-11 perf] setsForExercise+records exercise="${exerciseId}" rows=${rows.length} ` +
          `awards=${awards.length} elapsed=${elapsedMs.toFixed(1)}ms`,
      );

      expect(snapshot).toBeDefined();
      expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS);
    },
  );
});
