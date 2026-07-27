/**
 * M5-08 — CSV round-trip + import-performance acceptance tests (05 §7.3,
 * 08 §4.6/§4.9). Proves the *composition* of two already-reviewed pipelines
 * (M5-05/M5-06's `CsvService.exportAll`/`encodeWorkoutsCsv`, M5-07's
 * `HevyImportService.preview`/`confirm`), not either pipeline's own internal
 * correctness in isolation — that's already covered by `domain/__tests__/
 * csv-codec.test.ts`, `domain/__tests__/hevy-import.test.ts`, `features/
 * data-transfer/__tests__/csv-service.test.ts` and `.../hevy-import-
 * service.test.ts` individually.
 *
 * Lives under `src/test/**` (the `node` Jest project, per `jest.config.js`)
 * rather than `src/domain/__tests__/` or `src/features/data-transfer/
 * __tests__/` for the exact reason `perf-budgets.test.ts`'s own header
 * documents: this suite needs a real `SqliteDriver` + `WorkoutRepositoryImpl`/
 * `ExerciseRepositoryImpl` (`src/data`) *and* `CsvService`/`HevyImportService`
 * (`src/features/data-transfer`) *and* the M4-11 synthetic-history generator
 * (`src/test/fixtures`) all in one file — `eslint.config.js`'s
 * `import/no-restricted-paths` zones only allow `src/features/**` files to
 * import both `src/data` and `src/domain`/`src/lib` together, and forbid
 * `src/domain`/`src/data` from reaching sideways into each other or into
 * `src/features` at all; a file under `src/test/**` is outside every one of
 * those zones' `files` globs, so it can freely import all three layers for a
 * genuine cross-layer integration test without fighting the boundary.
 *
 * `expo-file-system/legacy` is the one native seam either pipeline touches
 * (`lib/csv-export-file.ts`'s `writeCacheTextFile` for export,
 * `lib/hevy-import-file.ts`'s `readTextFile` for import) — mocked once below
 * with a shared in-memory `uri -> contents` store so a round trip's export
 * step and its own subsequent import step transparently hand data to each
 * other exactly the way a real cache-directory file would, without either
 * pipeline knowing it's not talking to a real filesystem.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { parseHevyCsvRecords, type ImportWorkoutDraft } from '@/domain/hevy-import';
import { createCsvService } from '@/features/data-transfer/csv-service';
import { createHevyImportService } from '@/features/data-transfer/hevy-import-service';
import { parseCsv } from '@/lib/csv';

import { generateSyntheticHistory, SYNTHETIC_EXERCISES } from '../synthetic-history';
import { insertSyntheticHistory } from '../synthetic-history-loader';

// ---------------------------------------------------------------------------
// Shared `expo-file-system/legacy` mock — in-memory `uri -> contents` store
// (see file header). Both `writeCacheTextFile` (export) and `readTextFile`
// (import) go through this one module, so a test can hand an `exportAll()`
// result's own `uri` straight to `preview()` and get back exactly what was
// just written, the same way a real cache-directory round trip would.
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
        throw new Error(`csv-round-trip mock file system: no file written at "${uri}".`);
      }
      return value;
    }),
    EncodingType: { UTF8: 'utf8' },
    __reset: () => store.clear(),
    __write: (uri: string, contents: string) => store.set(uri, contents),
    __read: (uri: string) => store.get(uri),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFileSystem = require('expo-file-system/legacy') as {
  writeAsStringAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
  __reset: () => void;
  __write: (uri: string, contents: string) => void;
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
// Small local test harness — real driver + real repositories + real
// services, same posture every other `src/data`/`src/features` integration
// test in this repo already uses.
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
    csvService: createCsvService({ workoutRepository, exerciseRepository }),
    hevyImportService: createHevyImportService({ driver, exerciseRepository }),
    exerciseRepository,
  };
}

function tableCount(driver: SqliteDriver, table: 'workouts' | 'workout_exercises' | 'sets'): number {
  const rows = driver.queryAll<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0].n;
}

// ===========================================================================
// Round trip 1 — import(export(db)) is a no-op (05 §7.3, 08 §4.6)
// ===========================================================================

describe('CSV round trip 1 — import(export(db)) is a no-op (M5-08)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    mockFileSystem.__reset();
    jest.clearAllMocks();
    driver = freshDriver();
  });

  afterEach(() => {
    driver.close();
  });

  function localDate(y: number, m: number, day: number, h = 0, min = 0): number {
    return new Date(y, m - 1, day, h, min).getTime();
  }

  function insertExercise(id: string, name: string): void {
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

  interface SeedSet {
    position: number;
    setType: string;
    weightKg?: number | null;
    reps?: number | null;
    distanceMeters?: number | null;
    durationSeconds?: number | null;
    rpe?: number | null;
  }

  interface SeedExercise {
    exerciseId: string;
    position: number;
    supersetId?: number | null;
    notes?: string | null;
    sets: SeedSet[];
  }

  interface SeedWorkout {
    id: string;
    title: string;
    description?: string | null;
    startTime: number;
    endTime: number;
    exercises: SeedExercise[];
  }

  function insertWorkout(workout: SeedWorkout): void {
    const now = Date.now();
    driver.execute(
      `INSERT INTO workouts (id, title, description, state, start_time, end_time, duration_pause_offset_ms, created_at, updated_at)
       VALUES (?, ?, ?, 'completed', ?, ?, 0, ?, ?)`,
      [workout.id, workout.title, workout.description ?? null, workout.startTime, workout.endTime, now, now],
    );
    for (const exercise of workout.exercises) {
      const weId = `we-${workout.id}-${exercise.position}`;
      driver.execute(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [weId, workout.id, exercise.exerciseId, exercise.position, exercise.supersetId ?? null, exercise.notes ?? null],
      );
      for (const set of exercise.sets) {
        driver.execute(
          `INSERT INTO sets
             (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
              duration_seconds, rpe, custom_metric, is_completed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
          [
            `set-${weId}-${set.position}`,
            weId,
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
  }

  /** Seeds 3 completed workouts (superset + rpe + mixed set types + a distance/duration exercise + a bodyweight-shaped reps-only exercise) — a realistic "real DB with some completed workouts" per this task's own text. */
  function seedRealHistory(): void {
    insertExercise('squat', 'Squat');
    insertExercise('leg-press', 'Leg Press');
    insertExercise('calf-raise', 'Calf Raise');
    insertExercise('rowing', 'Rowing Machine');
    insertExercise('pull-up', 'Pull Up');

    insertWorkout({
      id: 'w-leg-day',
      title: 'Leg Day',
      description: 'Heavy day',
      startTime: localDate(2026, 2, 1, 8, 0),
      endTime: localDate(2026, 2, 1, 9, 0),
      exercises: [
        {
          exerciseId: 'squat',
          position: 0,
          sets: [
            { position: 0, setType: 'warmup', weightKg: 60, reps: 8 },
            { position: 1, setType: 'normal', weightKg: 100, reps: 5, rpe: 8 },
            { position: 2, setType: 'normal', weightKg: 100, reps: 5, rpe: 8.5 },
            { position: 3, setType: 'failure', weightKg: 105, reps: 3, rpe: 9 },
          ],
        },
        {
          exerciseId: 'leg-press',
          position: 1,
          supersetId: 1,
          notes: 'paired',
          sets: [{ position: 0, setType: 'normal', weightKg: 150, reps: 10 }],
        },
        {
          exerciseId: 'calf-raise',
          position: 2,
          supersetId: 1,
          sets: [{ position: 0, setType: 'normal', weightKg: 40, reps: 15 }],
        },
      ],
    });

    insertWorkout({
      id: 'w-cardio',
      title: 'Cardio Session',
      startTime: localDate(2026, 2, 2, 7, 0),
      endTime: localDate(2026, 2, 2, 7, 30),
      exercises: [
        {
          exerciseId: 'rowing',
          position: 0,
          sets: [{ position: 0, setType: 'normal', distanceMeters: 5000, durationSeconds: 1200 }],
        },
      ],
    });

    insertWorkout({
      id: 'w-bodyweight',
      title: 'Bodyweight',
      startTime: localDate(2026, 2, 3, 18, 0),
      endTime: localDate(2026, 2, 3, 18, 40),
      exercises: [
        {
          exerciseId: 'pull-up',
          position: 0,
          sets: [
            { position: 0, setType: 'normal', reps: 10 },
            { position: 1, setType: 'normal', reps: 8 },
          ],
        },
      ],
    });
  }

  it('re-importing a freshly-exported CSV against the same DB creates zero new rows — every workout detected as a duplicate', async () => {
    seedRealHistory();

    const beforeWorkouts = tableCount(driver, 'workouts');
    const beforeExercises = tableCount(driver, 'workout_exercises');
    const beforeSets = tableCount(driver, 'sets');
    expect(beforeWorkouts).toBe(3);
    expect(beforeExercises).toBe(5);
    expect(beforeSets).toBe(9);

    const { csvService, hevyImportService } = services(driver);

    const exportResult = await csvService.exportAll({ weightUnit: 'kg', distanceUnit: 'km' });

    const preview = await hevyImportService.preview(exportResult.uri);
    if ('error' in preview) throw new Error(`expected a valid preview, got: ${preview.error}`);

    // The whole point of this test: every workout the export produced is
    // recognized as already present, not silently mismatched/renamed.
    expect(preview.workoutsFoundCount).toBe(3);
    expect(preview.duplicateWorkoutCount).toBe(3);
    expect(preview.malformedRows).toEqual([]);
    expect(preview.workoutSkips).toEqual([]);

    const report = await hevyImportService.confirm(preview);

    expect(report.importedWorkoutCount).toBe(0);
    expect(report.importedSetCount).toBe(0);
    expect(report.duplicateSkippedCount).toBe(3);
    expect(report.touchedExerciseIds).toEqual([]);

    // Real assertion, not just a title-count check: the actual row counts in
    // every affected table are byte-for-byte unchanged, proving nothing was
    // inserted (or deleted) anywhere along the way.
    expect(tableCount(driver, 'workouts')).toBe(beforeWorkouts);
    expect(tableCount(driver, 'workout_exercises')).toBe(beforeExercises);
    expect(tableCount(driver, 'sets')).toBe(beforeSets);
  });

  // Regression (found in M5 milestone-wide review): every workout above is
  // seeded via the local `localDate(y, m, day, h = 0, min = 0)` helper,
  // which always produces a whole-minute (`:00` seconds) timestamp — never
  // exercising the actual bug. A *real*, live-logged workout's `startTime`
  // is stamped via `Date.now()` (`workout-repository.ts`), which lands on a
  // non-zero second essentially every time. `formatCsvDateTime` only ever
  // emits `HH:mm` (05 §7.1's own spec'd Hevy-compatible format, no
  // seconds), so re-exporting such a workout and re-importing it produces a
  // parsed `startTime` with its seconds truncated to `:00` — if duplicate
  // detection compares raw millisecond values, that reimport no longer
  // matches the original row and gets inserted as a second copy, silently
  // violating this describe block's own "is a no-op" guarantee.
  it('a workout timestamp with non-zero seconds (e.g. stamped via Date.now()) is still recognized as a duplicate after export + reimport', async () => {
    insertExercise('squat', 'Squat');

    // 37s/12s past the minute — deliberately not a whole-minute boundary,
    // unlike every other timestamp in this file.
    const startTime = new Date(2026, 1, 5, 8, 0, 37).getTime();
    const endTime = new Date(2026, 1, 5, 9, 0, 12).getTime();
    insertWorkout({
      id: 'w-odd-seconds',
      title: 'Odd Seconds Day',
      startTime,
      endTime,
      exercises: [
        {
          exerciseId: 'squat',
          position: 0,
          sets: [{ position: 0, setType: 'normal', weightKg: 100, reps: 5 }],
        },
      ],
    });

    const beforeWorkouts = tableCount(driver, 'workouts');
    expect(beforeWorkouts).toBe(1);

    const { csvService, hevyImportService } = services(driver);
    const exportResult = await csvService.exportAll({ weightUnit: 'kg', distanceUnit: 'km' });

    const preview = await hevyImportService.preview(exportResult.uri);
    if ('error' in preview) throw new Error(`expected a valid preview, got: ${preview.error}`);

    expect(preview.workoutsFoundCount).toBe(1);
    expect(preview.duplicateWorkoutCount).toBe(1);

    const report = await hevyImportService.confirm(preview);

    expect(report.importedWorkoutCount).toBe(0);
    expect(report.duplicateSkippedCount).toBe(1);
    expect(tableCount(driver, 'workouts')).toBe(beforeWorkouts);
  });
});

// ===========================================================================
// Round trip 2 — export(import(hevy.csv)) is semantically equal to the
// source (05 §7.3, 02 §8's superset-survival acceptance case)
// ===========================================================================

/**
 * Reuses M5-07's own committed fixture (`domain/__fixtures__/hevy-import/
 * sample.csv`) rather than building a second one — its shape (4 well-formed
 * workouts spanning every set_type/RPE/superset/exercise-type-inference case,
 * plus one deliberately malformed row) is exactly what a full round-trip
 * check needs, and it's already hand-verified (M5-07's own review). The one
 * adjustment this test makes: "Broken Entry" (line 16, missing `start_time`)
 * never forms a workout at all — `parseHevyCsvRecords` drops it before
 * grouping, the same way the real import pipeline does — so it's naturally
 * excluded from both sides of the semantic-equality comparison below rather
 * than needing special-casing.
 */
function readSampleFixture(): string {
  return readFileSync(join(__dirname, '../../../domain/__fixtures__/hevy-import/sample.csv'), 'utf8');
}

/** Parses Hevy-shaped CSV text into `ImportWorkoutDraft[]` using the real, independently-tested `domain/hevy-import.ts` pure parser — used here purely as a read-only comparison oracle (never as the thing under test: that's `domain/__tests__/hevy-import.test.ts`'s job) to interpret both the original fixture text and the round-tripped export in the exact same way a real import would. */
function parseHevyCsvText(text: string): { workouts: ImportWorkoutDraft[]; malformedCount: number } {
  const { records } = parseCsv(text);
  const result = parseHevyCsvRecords(records);
  if ('error' in result) {
    throw new Error(`unexpected header error: ${result.error}`);
  }
  return { workouts: result.workouts, malformedCount: result.malformedRows.length };
}

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
  sets: ComparableSet[];
}

interface ComparableWorkout {
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  exercises: ComparableExercise[];
  /**
   * Superset **grouping equivalence**, not literal id equality (this task's
   * own explicit acceptance case, 02 §8): each entry is a sorted list of
   * 0-based exercise indices (within this workout, post position-sort) that
   * share one non-null `supersetId` — the actual integer value is discarded
   * entirely, only "which exercises are grouped together" survives into the
   * comparison.
   */
  supersetPartition: number[][];
}

function canonicalizeWorkout(draft: ImportWorkoutDraft): ComparableWorkout {
  const sortedExercises = [...draft.exercises].sort((a, b) => a.position - b.position);

  const groupsBySupersetId = new Map<number, number[]>();
  sortedExercises.forEach((exercise, index) => {
    if (exercise.supersetId !== null) {
      const group = groupsBySupersetId.get(exercise.supersetId) ?? [];
      group.push(index);
      groupsBySupersetId.set(exercise.supersetId, group);
    }
  });
  const supersetPartition = Array.from(groupsBySupersetId.values())
    .map((group) => group.slice().sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);

  return {
    title: draft.title,
    description: draft.description,
    startTime: draft.startTime,
    endTime: draft.endTime,
    exercises: sortedExercises.map((exercise) => ({
      exerciseTitle: exercise.exerciseTitle,
      notes: exercise.notes,
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
    supersetPartition,
  };
}

function canonicalizeAndSort(workouts: readonly ImportWorkoutDraft[]): ComparableWorkout[] {
  return workouts
    .map(canonicalizeWorkout)
    .sort((a, b) => a.startTime - b.startTime || a.title.localeCompare(b.title));
}

describe('CSV round trip 2 — export(import(hevy.csv)) is semantically equal to the source (M5-08)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    mockFileSystem.__reset();
    jest.clearAllMocks();
    driver = freshDriver();
  });

  afterEach(() => {
    driver.close();
  });

  it('imports the sample fixture into a fresh DB, exports it back out, and matches the source field-by-field in canonical units — including superset grouping', async () => {
    const sourceCsvText = readSampleFixture();
    const IMPORT_URI = 'file:///mock-cache/hevy_export.csv';
    mockFileSystem.__write(IMPORT_URI, sourceCsvText);

    const { csvService, hevyImportService } = services(driver);

    const preview = await hevyImportService.preview(IMPORT_URI);
    if ('error' in preview) throw new Error(`expected a valid preview, got: ${preview.error}`);
    expect(preview.workoutsFoundCount).toBe(4); // Push Day, Cardio, Mixed Day, Quirky Day
    expect(preview.malformedRows).toHaveLength(1); // "Broken Entry" — missing start_time

    const report = await hevyImportService.confirm(preview);
    expect(report.importedWorkoutCount).toBe(4);
    expect(report.duplicateSkippedCount).toBe(0);

    const exportResult = await csvService.exportAll({ weightUnit: 'kg', distanceUnit: 'km' });
    const exportedCsvText = textWrittenAt(exportResult.uri);

    const expected = parseHevyCsvText(sourceCsvText);
    const actual = parseHevyCsvText(exportedCsvText);

    // The round-tripped export must be internally well-formed (no dates it
    // wrote itself should ever fail to parse) — 0 malformed rows on the
    // export side, vs. the source's 1 ("Broken Entry", which never became a
    // workout in the first place and so has nothing to round-trip).
    expect(expected.malformedCount).toBe(1);
    expect(actual.malformedCount).toBe(0);
    expect(actual.workouts).toHaveLength(4);

    const expectedCanonical = canonicalizeAndSort(expected.workouts);
    const actualCanonical = canonicalizeAndSort(actual.workouts);

    // The main semantic-equality assertion: every workout/exercise/set field
    // in canonical units, plus superset grouping equivalence (not literal id
    // equality — see `ComparableWorkout.supersetPartition`'s own doc
    // comment), matches between the original fixture and the fully
    // round-tripped export.
    expect(actualCanonical).toEqual(expectedCanonical);

    // Named acceptance case (02 §8): "Push Day"'s superset (Incline Dumbbell
    // Press + Cable Fly, NOT Bench Press) must still be one group after the
    // round trip, called out explicitly rather than only implicitly via the
    // blanket `toEqual` above.
    const pushDay = actualCanonical.find((w) => w.title === 'Push Day');
    if (!pushDay) throw new Error('expected "Push Day" to survive the round trip');
    expect(pushDay.exercises.map((e) => e.exerciseTitle)).toEqual([
      'Bench Press',
      'Incline Dumbbell Press',
      'Cable Fly',
    ]);
    expect(pushDay.supersetPartition).toEqual([[1, 2]]); // Incline Dumbbell Press + Cable Fly grouped; Bench Press (index 0) excluded
  });
});

// ===========================================================================
// Perf: 1000-workout Hevy CSV import < 10 s, single-transaction batch,
// no O(n²) duplicate-scan (05 §7.3, 08 §4.9)
// ===========================================================================

describe('CSV import perf budget — 1000-workout synthetic fixture (M5-08, 08 §4.9)', () => {
  const PERF_BUDGET_MS = 10_000;

  it('imports the M4-11 synthetic 1000+-workout history (exported through the real M5-06 CSV pipeline) into a fresh DB in under 10 s, as one transaction, without an O(n²) duplicate scan', async () => {
    mockFileSystem.__reset();
    jest.clearAllMocks();

    // --- Build the source dataset: real production insert shape (M4-11's
    // own bulk-insert helper, already established/tested), then the real
    // M5-06 export pipeline (CsvService.exportAll -> encodeWorkoutsCsv) --
    // this avoids re-deriving the dataset -> CsvExportWorkout[] mapping a
    // second time (`synthetic-history-loader.ts`'s own mapping is reused via
    // insert-then-refetch, per this task's own suggested option).
    const sourceDriver = freshDriver();
    try {
      const now = new Date('2026-07-25T12:00:00.000Z');
      const dataset = generateSyntheticHistory({ now });
      const seedResult = insertSyntheticHistory(sourceDriver, dataset);
      expect(seedResult.workoutCount).toBeGreaterThanOrEqual(1000);
      console.log(
        `[M5-08 perf] synthetic source dataset: ${seedResult.workoutCount} workouts, ` +
          `${seedResult.setCount} sets, seeded in ${seedResult.elapsedMs} ms.`,
      );

      const { csvService: sourceCsvService } = services(sourceDriver);
      const exportResult = await sourceCsvService.exportAll({ weightUnit: 'kg', distanceUnit: 'km' });
      const csvText = textWrittenAt(exportResult.uri);
      const csvRowCount = csvText.trim().split('\n').length - 1; // minus header
      expect(csvRowCount).toBe(seedResult.setCount); // one CSV row per set (05 §7.1)

      // --- Import into a FRESH, empty DB (no pre-seeded exercise library —
      // every one of the 9 synthetic exercise titles will be auto-created,
      // exactly like a real user's very first Hevy import) and time it.
      const targetDriver = freshDriver();
      try {
        const IMPORT_URI = 'file:///mock-cache/perf-import.csv';
        mockFileSystem.__write(IMPORT_URI, csvText);
        const { hevyImportService: targetImportService } = services(targetDriver);

        // Spy on the two things a naive-but-wrong implementation could get
        // pathologically slow on at this scale: more than one transaction
        // for the whole batch, or a per-workout (rather than one-shot)
        // existing-workouts scan.
        const transactionSpy = jest.spyOn(targetDriver, 'transaction');
        const queryAllSpy = jest.spyOn(targetDriver, 'queryAll');

        const startedAt = performance.now();
        const preview = await targetImportService.preview(IMPORT_URI);
        if ('error' in preview) throw new Error(`expected a valid preview, got: ${preview.error}`);
        const report = await targetImportService.confirm(preview);
        const elapsedMs = performance.now() - startedAt;

        console.log(
          `[M5-08 perf] Hevy CSV import: ${report.importedWorkoutCount} workouts, ` +
            `${report.importedSetCount} sets, elapsed=${elapsedMs.toFixed(1)}ms ` +
            `(budget ${PERF_BUDGET_MS}ms).`,
        );

        // Correctness at scale, not just speed — a fast-but-wrong import
        // would be a worse bug than a slow-but-correct one.
        expect(preview.workoutsFoundCount).toBe(seedResult.workoutCount);
        expect(preview.duplicateWorkoutCount).toBe(0); // fresh DB — nothing pre-existing to collide with
        expect(preview.malformedRows).toEqual([]);
        expect(preview.workoutSkips).toEqual([]);
        expect(report.importedWorkoutCount).toBe(seedResult.workoutCount);
        expect(report.importedSetCount).toBe(seedResult.setCount);
        expect(report.duplicateSkippedCount).toBe(0);
        expect(report.autoCreatedExercises).toHaveLength(SYNTHETIC_EXERCISES.length);

        // The actual perf budget (08 §4.9: "< 10 s ... measured in
        // integration harness"). Asserted, never hard-coded — the real
        // measured number is logged above for `docs/plan/EXECUTION-LOG.md`.
        expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS);

        // Single-transaction batch (M5-07's own `bulkInsertWorkouts` doc
        // comment; re-confirmed here at 1000+-workout scale rather than
        // trusted from the doc comment alone) — exactly one
        // `driver.transaction(...)` call for the whole confirm(), not one
        // per workout.
        expect(transactionSpy).toHaveBeenCalledTimes(1);

        // No O(n²) duplicate-scan: `loadExistingWorkoutKeys` runs as one
        // `SELECT ... FROM workouts` query per `preview`/`confirm` call (2
        // total for this whole test), never once per imported workout —
        // real assertion against the query count, not just a read of the
        // source.
        const workoutScanCalls = queryAllSpy.mock.calls.filter(([sql]) =>
          String(sql).includes('FROM workouts'),
        );
        expect(workoutScanCalls.length).toBeLessThanOrEqual(2);
        expect(workoutScanCalls.length).toBeLessThan(seedResult.workoutCount);
      } finally {
        targetDriver.close();
      }
    } finally {
      sourceDriver.close();
    }
  }, 30_000);
});
