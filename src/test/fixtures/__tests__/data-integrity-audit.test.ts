/**
 * M5-10 — the data-integrity audit deliverable (08 §7, combined with
 * M5-10's own "How" line: "export CSV -> diff vs in-app history for 10
 * random fixture workouts"). A real, automated, deterministic Jest test —
 * per this task's own instruction and `docs/plan/BLOCKERS.md`'s
 * established tone throughout, this repo prefers CI-able evidence over a
 * fabricated/manual "I diffed it by hand" claim, so this test IS the audit,
 * not a write-up describing one.
 *
 * ## Harness: reuses `csv-round-trip.test.ts`'s own setup verbatim
 *
 * Same `node`-project cross-layer need that file's own header documents
 * (`src/data` + `src/domain` + `src/features/data-transfer` +
 * `src/test/fixtures` all in one file — only a file under `src/test/**` is
 * outside every `import/no-restricted-paths` zone that would otherwise
 * forbid this combination), same `expo-file-system/legacy` in-memory mock
 * (`CsvService.exportWorkout` writes through `writeCacheTextFile`), same
 * `freshDriver()`/`services()` shape.
 *
 * ## "10 random fixture workouts" — deterministic, not `Math.random()`
 *
 * `generateSyntheticHistory`'s own default seed (`0x5eed1e55`) plus an
 * explicit fixed `now` (matching `csv-round-trip.test.ts`'s own perf-test
 * precedent, `new Date('2026-07-25T12:00:00.000Z')`) already makes the
 * whole 1040-workout dataset byte-identical run to run. "Random" here means
 * "spread across the full 5-year span," not "seeded by the real system
 * clock" — {@link pickTenWorkoutIds} takes 10 evenly-spaced indices across
 * `synthetic-workout-0..1039` (first, last, and 8 stops in between), a
 * fixed, reproducible slice that exercises early/mid/late history rather
 * than clustering near one end, while staying exactly as deterministic as
 * every other fixed-seed test in this suite.
 *
 * ## What "diff vs in-app history" means here
 *
 * For each of the 10 picked workout ids: `workoutRepository.getFull(id)` —
 * the exact call `HistoryDetailScreen.tsx` makes to render "in-app
 * history" — is the reference. `CsvService.exportWorkout(id, units)` is the
 * export side, its written CSV text re-parsed back into structured data via
 * `domain/hevy-import.ts`'s real, independently-tested `parseHevyCsvRecords`
 * (used purely as a read-only comparison oracle here, the exact same "never
 * as the thing under test" posture `csv-round-trip.test.ts`'s round trip 2
 * already established for the identical parser). Every meaningful field is
 * compared: title, date/time (floored to the minute — the CSV format's own
 * `d MMM yyyy, HH:mm` has no seconds column, so `domain/csv-codec.ts`'s
 * `parseCsvDateTime` always reconstructs `:00` seconds; this is the one
 * legitimate formatting-only difference this test accounts for, the same
 * kind of allowance the task text itself calls out), description, exercise
 * names (resolved from `exercises.id -> name`, both sides), notes, set
 * count, weight/reps/distance/duration/RPE per set, and superset grouping
 * (by partition equivalence, not literal `supersetId` value — the CSV
 * format doesn't preserve the raw integer id, only which exercises share
 * one, same as `csv-round-trip.test.ts`'s own `supersetPartition` handling).
 * `weightUnit: 'kg'`/`distanceUnit: 'km'` are requested explicitly — the
 * app's canonical storage units — so weight needs no unit-conversion
 * arithmetic at all (only `domain/csv-codec.ts`'s own "2 decimals max"
 * rounding, well within the tolerance below); distance still needs a small
 * tolerance because `formatDistanceKm` itself rounds to 2 decimals (10 m
 * granularity, up to 5 m of legitimate rounding either direction) before
 * that value round-trips back through `parseHevyCsvRecords`' own km->m
 * conversion.
 */
import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import type { WorkoutFull } from '@/data/workouts/types';
import { parseHevyCsvRecords, type ImportWorkoutDraft } from '@/domain/hevy-import';
import { createCsvService } from '@/features/data-transfer/csv-service';
import { parseCsv } from '@/lib/csv';

import { generateSyntheticHistory } from '../synthetic-history';
import { insertSyntheticHistory } from '../synthetic-history-loader';

// ---------------------------------------------------------------------------
// Shared `expo-file-system/legacy` mock — same in-memory `uri -> contents`
// store `csv-round-trip.test.ts` uses (see that file's own header for why).
// ---------------------------------------------------------------------------

jest.mock('expo-file-system/legacy', () => {
  const store = new Map<string, string>();
  return {
    cacheDirectory: 'file:///mock-cache/',
    writeAsStringAsync: jest.fn(async (uri: string, contents: string) => {
      store.set(uri, contents);
    }),
    readAsStringAsync: jest.fn(async (uri: string) => {
      const value = store.get(uri);
      if (value === undefined) {
        throw new Error(`data-integrity-audit mock file system: no file written at "${uri}".`);
      }
      return value;
    }),
    EncodingType: { UTF8: 'utf8' },
    __read: (uri: string) => store.get(uri),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFileSystem = require('expo-file-system/legacy') as {
  __read: (uri: string) => string | undefined;
};

function textWrittenAt(uri: string): string {
  const text = mockFileSystem.__read(uri);
  if (text === undefined) {
    throw new Error(`expected something to have been written at "${uri}"`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function freshDriver(): SqliteDriver {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  return driver;
}

function services(driver: SqliteDriver) {
  const workoutRepository = new WorkoutRepositoryImpl(driver);
  const exerciseRepository = new ExerciseRepositoryImpl(driver);
  return {
    workoutRepository,
    exerciseRepository,
    csvService: createCsvService({ workoutRepository, exerciseRepository }),
  };
}

/** 10 evenly-spaced indices across `[0, workoutCount)` — see file header, "10 random fixture workouts." */
function pickTenWorkoutIds(workoutCount: number): string[] {
  const indices = Array.from({ length: 10 }, (_, k) =>
    Math.round((k * (workoutCount - 1)) / 9),
  );
  return indices.map((i) => `synthetic-workout-${i}`);
}

function parseHevyCsvText(text: string): { workouts: ImportWorkoutDraft[]; malformedCount: number } {
  const { records } = parseCsv(text);
  const result = parseHevyCsvRecords(records);
  if ('error' in result) {
    throw new Error(`unexpected header error: ${result.error}`);
  }
  return { workouts: result.workouts, malformedCount: result.malformedRows.length };
}

// ---------------------------------------------------------------------------
// Canonicalization: WorkoutFull (in-app) and ImportWorkoutDraft (export,
// re-parsed) both reduce to the same comparable shape.
// ---------------------------------------------------------------------------

interface ComparableSet {
  setType: string;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: number | null;
}

interface ComparableExercise {
  exerciseTitle: string;
  notes: string | null;
  setCount: number;
  sets: ComparableSet[];
}

interface ComparableWorkout {
  title: string;
  description: string | null;
  /** Epoch ms floored to the minute — see file header on why. */
  startTimeMinute: number;
  endTimeMinute: number | null;
  exercises: ComparableExercise[];
  /** Superset grouping equivalence (0-based post-position-sort exercise indices), same as `csv-round-trip.test.ts`'s own `supersetPartition`. */
  supersetPartition: number[][];
}

function floorToMinute(epochMs: number): number {
  return Math.floor(epochMs / 60_000) * 60_000;
}

function supersetPartitionOf(
  exercisesInOrder: readonly { supersetId: number | null }[],
): number[][] {
  const groupsBySupersetId = new Map<number, number[]>();
  exercisesInOrder.forEach((exercise, index) => {
    if (exercise.supersetId !== null) {
      const group = groupsBySupersetId.get(exercise.supersetId) ?? [];
      group.push(index);
      groupsBySupersetId.set(exercise.supersetId, group);
    }
  });
  return Array.from(groupsBySupersetId.values())
    .map((group) => group.slice().sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

/** In-app reference side: `WorkoutFull` (`WorkoutRepository.getFull`, the exact call `HistoryDetailScreen.tsx` makes) + a prefetched `exerciseId -> name` map. */
function canonicalizeWorkoutFull(
  full: WorkoutFull,
  namesById: ReadonlyMap<string, string>,
): ComparableWorkout {
  const sortedExercises = [...full.exercises].sort((a, b) => a.position - b.position);

  return {
    title: full.title,
    description: full.description,
    startTimeMinute: floorToMinute(full.startTime),
    endTimeMinute: full.endTime === null ? null : floorToMinute(full.endTime),
    exercises: sortedExercises.map((exercise) => ({
      exerciseTitle: namesById.get(exercise.exerciseId) ?? `<unknown:${exercise.exerciseId}>`,
      notes: exercise.notes,
      setCount: exercise.sets.length,
      sets: [...exercise.sets]
        .sort((a, b) => a.position - b.position)
        .map((set) => ({
          setType: set.setType,
          weightKg: set.weightKg,
          reps: set.reps,
          distanceMeters: set.distanceMeters,
          durationSeconds: set.durationSeconds,
          rpe: set.rpe,
        })),
    })),
    supersetPartition: supersetPartitionOf(sortedExercises),
  };
}

/** Export/re-parsed side: `ImportWorkoutDraft` (from `parseHevyCsvText`, itself a real invocation of the pure, independently-tested `domain/hevy-import.ts` parser — see file header). */
function canonicalizeImportDraft(draft: ImportWorkoutDraft): ComparableWorkout {
  const sortedExercises = [...draft.exercises].sort((a, b) => a.position - b.position);

  return {
    title: draft.title,
    description: draft.description,
    startTimeMinute: floorToMinute(draft.startTime),
    endTimeMinute: floorToMinute(draft.endTime),
    exercises: sortedExercises.map((exercise) => ({
      exerciseTitle: exercise.exerciseTitle,
      notes: exercise.notes,
      setCount: exercise.sets.length,
      sets: [...exercise.sets]
        .sort((a, b) => a.position - b.position)
        .map((set) => ({
          setType: set.setType,
          weightKg: set.weightKg,
          reps: set.reps,
          distanceMeters: set.distanceMeters,
          durationSeconds: set.durationSeconds,
          rpe: set.rpe,
        })),
    })),
    supersetPartition: supersetPartitionOf(sortedExercises),
  };
}

/** `weightKg`/RPE: exact-ish (CSV export's own "2 decimals max" rounding, well under this tolerance). `distanceMeters`: up to 5 m of legitimate rounding either direction — `formatDistanceKm`'s own 2-decimal-km (10 m) granularity, see file header. */
function assertSetsMatch(actual: ComparableSet, expected: ComparableSet): void {
  expect(actual.setType).toBe(expected.setType);
  expect(actual.reps).toBe(expected.reps);
  expect(actual.durationSeconds).toBe(expected.durationSeconds);
  expect(actual.rpe).toBe(expected.rpe);

  if (expected.weightKg === null) {
    expect(actual.weightKg).toBeNull();
  } else {
    expect(actual.weightKg).not.toBeNull();
    expect(Math.abs((actual.weightKg as number) - expected.weightKg)).toBeLessThan(0.01);
  }

  if (expected.distanceMeters === null) {
    expect(actual.distanceMeters).toBeNull();
  } else {
    expect(actual.distanceMeters).not.toBeNull();
    expect(Math.abs((actual.distanceMeters as number) - expected.distanceMeters)).toBeLessThanOrEqual(
      5,
    );
  }
}

/**
 * Field-by-field comparison, called once per picked workout inside its own
 * `it.each`-less loop below. Wrapped in a `try/catch` at the call site that
 * re-throws with `workoutId` prefixed onto the message — Jest's own
 * `expect()` has no built-in per-assertion custom-message parameter (that's
 * a Chai-ism, not part of Jest's actual API/types), so this is the
 * mechanism that makes a red run name which of the 10 fixture workouts
 * broke rather than just "the test failed."
 */
function assertWorkoutsMatch(actual: ComparableWorkout, expected: ComparableWorkout): void {
  expect(actual.title).toBe(expected.title);
  expect(actual.description).toBe(expected.description);
  expect(actual.startTimeMinute).toBe(expected.startTimeMinute);
  expect(actual.endTimeMinute).toBe(expected.endTimeMinute);
  expect(actual.supersetPartition).toEqual(expected.supersetPartition);
  expect(actual.exercises).toHaveLength(expected.exercises.length);

  expected.exercises.forEach((expectedExercise, exerciseIndex) => {
    const actualExercise = actual.exercises[exerciseIndex];

    expect(actualExercise.exerciseTitle).toBe(expectedExercise.exerciseTitle);
    expect(actualExercise.notes).toBe(expectedExercise.notes);
    expect(actualExercise.setCount).toBe(expectedExercise.setCount);
    expect(actualExercise.sets).toHaveLength(expectedExercise.sets.length);

    expectedExercise.sets.forEach((expectedSet, setIndex) => {
      assertSetsMatch(actualExercise.sets[setIndex], expectedSet);
    });
  });
}

// ===========================================================================
// The audit
// ===========================================================================

describe('Data-integrity audit — CSV export vs. in-app history, 10 fixture workouts (M5-10, 08 §7)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = freshDriver();
  });

  afterEach(() => {
    driver.close();
  });

  it('exports each of 10 deterministically-picked fixture workouts and matches WorkoutRepository.getFull field-by-field', async () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const dataset = generateSyntheticHistory({ now });
    const seedResult = insertSyntheticHistory(driver, dataset);
    expect(seedResult.workoutCount).toBeGreaterThanOrEqual(1000);

    const { workoutRepository, csvService } = services(driver);

    // One exercises table read for the whole audit — mirrors
    // `CsvService`'s own `buildExerciseNameMap` shape (one `list()` call,
    // never one lookup per exercise reference).
    const exerciseRows = driver.queryAll<{ id: string; name: string }>(
      'SELECT id, name FROM exercises',
    );
    const namesById = new Map(exerciseRows.map((row) => [row.id, row.name]));

    const workoutIds = pickTenWorkoutIds(seedResult.workoutCount);
    expect(workoutIds).toHaveLength(10);
    // Sanity: the 10 picks are genuinely distinct (guards against a future
    // `workoutCount` change collapsing the spread via rounding).
    expect(new Set(workoutIds).size).toBe(10);

    for (const workoutId of workoutIds) {
      const full = await workoutRepository.getFull(workoutId);
      if (!full) {
        throw new Error(`expected fixture workout "${workoutId}" to exist`);
      }

      const exportResult = await csvService.exportWorkout(workoutId, {
        weightUnit: 'kg',
        distanceUnit: 'km',
      });
      const csvText = textWrittenAt(exportResult.uri);
      const parsed = parseHevyCsvText(csvText);

      expect(parsed.malformedCount).toBe(0);
      expect(parsed.workouts).toHaveLength(1);

      const expected = canonicalizeWorkoutFull(full, namesById);
      const actual = canonicalizeImportDraft(parsed.workouts[0]);

      try {
        assertWorkoutsMatch(actual, expected);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`data-integrity audit failed for "${workoutId}" ("${full.title}"): ${message}`);
      }
    }
  });
});
