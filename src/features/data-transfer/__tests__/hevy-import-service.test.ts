/**
 * `HevyImportService` integration tests (M5-07 acceptance gate, 08 §4.6) —
 * real `better-sqlite3` against the migrated schema + a real
 * `ExerciseRepositoryImpl` (same harness `csv-service.test.ts`, M5-06,
 * already established for this exact "features/data-transfer" layer), with
 * only `expo-file-system/legacy`'s `readAsStringAsync` mocked (the one
 * native seam `lib/hevy-import-file.ts`'s `readTextFile` touches). Pure
 * parse/group/infer-rule unit coverage lives in `domain/__tests__/
 * hevy-import.test.ts` instead — this file only ever asserts DB-level
 * outcomes: rows actually written, duplicate-skip counts against real
 * existing rows, exercise auto-create/re-link against a real
 * `ExerciseRepositoryImpl`, and the report shape `confirm()` hands back.
 *
 * Named acceptance cases covered here (`M5-tasks.md`'s M5-07 + 08 §4.6):
 * sample-fixture counts, supersets preserved, RPE snapping, set-type
 * mapping, imperial-header conversion, one case per exercise-type-inference
 * rule, duplicate workout skipped, malformed row line-numbered, and the
 * custom-exercise re-link (05 §7.4). The first `describe` block below
 * ("sample fixture") drives most of these off one committed, hand-verified
 * CSV file (`../../../domain/__fixtures__/hevy-import/sample.csv` — see
 * that directory's own placement rationale, this file's header just below
 * the imports) rather than an inline-built string, per the task's own
 * explicit instruction to "build an anonymized Hevy-format fixture now ...
 * so tests never wait on the owner file"; the remaining `describe` blocks
 * use small, purpose-built inline CSVs (`buildCsvText`) for cases that
 * inherently need a specific *pre-existing DB state* alongside the file
 * (duplicate-workout skip, the preview-to-confirm race) or a second file
 * variant (the imperial header) — a single static fixture can't demonstrate
 * those on its own regardless of how it's built.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { formatCsvDateTime } from '@/domain/csv-codec';
import { writeCsv } from '@/lib/csv';

import { createHevyImportService, type HevyImportPreview } from '../hevy-import-service';

/**
 * `src/domain/__fixtures__/hevy-import/sample.csv` — placed alongside
 * `domain/__fixtures__/csv-codec/` (the M5-05 golden-export-file convention)
 * rather than under `src/test/fixtures/` (M4-11's convention): that
 * directory holds *programmatic* TS dataset generators + a bulk-insert
 * loader for synthetic multi-year history (a fundamentally different shape
 * — no raw CSV text involved anywhere in that pattern), whereas this fixture
 * *is* raw Hevy CSV text, read here exactly the way a real picked file would
 * be, then round-tripped through the exact same `lib/csv.ts` parser +
 * `domain/hevy-import.ts` pure logic the real import path uses — the same
 * "fixture lives next to the domain module that owns its shape" precedent
 * `csv-codec.test.ts`'s own golden files already established, just for
 * import instead of export. Generated via a one-off script that calls this
 * repo's own `formatCsvDateTime`/`writeCsv` (never hand-typed row-by-row) so
 * every date string and quoting rule is provably correct against the same
 * code this suite is testing, then hand-verified against the fixture's own
 * design intent (documented in-line in this describe block).
 */
function readSampleFixture(): string {
  return readFileSync(
    join(__dirname, '../../../domain/__fixtures__/hevy-import/sample.csv'),
    'utf8',
  );
}

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFileSystem = require('expo-file-system/legacy') as { readAsStringAsync: jest.Mock };

const FILE_URI = 'file:///mock-cache/hevy_export.csv';

function mockFileText(text: string): void {
  mockFileSystem.readAsStringAsync.mockResolvedValue(text);
}

const KG_HEADER = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
  'rpe',
];

const LBS_HEADER = KG_HEADER.map((h) =>
  h === 'weight_kg' ? 'weight_lbs' : h === 'distance_km' ? 'distance_miles' : h,
);

function localDate(y: number, m: number, day: number, h = 0, min = 0): number {
  return new Date(y, m - 1, day, h, min).getTime();
}

function csvDate(epochMs: number): string {
  return formatCsvDateTime(epochMs);
}

interface RowInput {
  title: string;
  startTime: number;
  endTime: number;
  description?: string;
  exerciseTitle: string;
  supersetId?: number | '';
  exerciseNotes?: string;
  setIndex: number;
  setType?: string;
  weight?: string;
  reps?: string;
  distance?: string;
  duration?: string;
  rpe?: string;
  /** Overrides the formatted `start_time` field verbatim (e.g. `''` to build a malformed-row fixture) — bypasses `csvDate(startTime)` entirely so the override never has to fight `writeCsv`'s own quoting of a value that (like every real Hevy date string) already contains a comma. */
  startTimeFieldOverride?: string;
}

function buildCsvText(rows: readonly RowInput[], header: readonly string[] = KG_HEADER): string {
  const isLbs = header.includes('weight_lbs');
  const weightKey = isLbs ? 'weight_lbs' : 'weight_kg';
  const distanceKey = isLbs ? 'distance_miles' : 'distance_km';

  const dataRows = rows.map((r) => {
    const byName: Record<string, string> = {
      title: r.title,
      start_time: r.startTimeFieldOverride ?? csvDate(r.startTime),
      end_time: csvDate(r.endTime),
      description: r.description ?? '',
      exercise_title: r.exerciseTitle,
      superset_id: r.supersetId === undefined || r.supersetId === '' ? '' : String(r.supersetId),
      exercise_notes: r.exerciseNotes ?? '',
      set_index: String(r.setIndex),
      set_type: r.setType ?? 'normal',
      [weightKey]: r.weight ?? '',
      reps: r.reps ?? '',
      [distanceKey]: r.distance ?? '',
      duration_seconds: r.duration ?? '',
      rpe: r.rpe ?? '',
    };
    return header.map((col) => byName[col] ?? '');
  });

  return writeCsv([header as string[], ...dataRows]);
}

describe('HevyImportService', () => {
  let driver: SqliteDriver;
  let exerciseRepository: ExerciseRepositoryImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    exerciseRepository = new ExerciseRepositoryImpl(driver);
  });

  afterEach(() => {
    driver.close();
  });

  function service() {
    return createHevyImportService({ driver, exerciseRepository });
  }

  function insertBuiltin(id: string, name: string, aliases: string[] = []): void {
    const now = Date.now();
    driver.execute(
      `INSERT INTO exercises
         (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
          equipment, instructions, images, animation_uri, is_custom,
          uses_custom_metric, aliases, archived_at, created_at, updated_at)
       VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, ?, NULL, ?, ?)`,
      [id, name, JSON.stringify(aliases), now, now],
    );
  }

  function workoutCountForTitle(title: string): number {
    const rows = driver.queryAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM workouts WHERE title = ? AND deleted_at IS NULL`,
      [title],
    );
    return rows[0].n;
  }

  function setCountForWorkoutTitle(title: string): number {
    const rows = driver.queryAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE w.title = ?`,
      [title],
    );
    return rows[0].n;
  }

  // -------------------------------------------------------------------------
  // The committed sample fixture (`domain/__fixtures__/hevy-import/
  // sample.csv`) — one end-to-end pass exercising most of the named
  // acceptance cases together off a single real file (see this file's own
  // header for what it does and doesn't cover, and why).
  // -------------------------------------------------------------------------

  describe('sample fixture (domain/__fixtures__/hevy-import/sample.csv)', () => {
    beforeEach(() => {
      // The fixture's two matched-exercise workouts ("Push Day"/"Cardio")
      // reference these three built-in names verbatim — everything else in
      // the fixture is deliberately an unmatched/auto-create case.
      insertBuiltin('bench-press', 'Bench Press');
      insertBuiltin('incline-db-press', 'Incline Dumbbell Press');
      insertBuiltin('cable-fly', 'Cable Fly');
      insertBuiltin('treadmill', 'Treadmill Run');
      mockFileText(readSampleFixture());
    });

    it('finds every workout, matches the 4 built-ins, and lists all 6 to-be-auto-created exercises', async () => {
      const preview = await service().preview(FILE_URI);
      if ('error' in preview) throw new Error('expected a valid preview');

      // Push Day, Cardio, Mixed Day, Quirky Day — "Broken Entry" never forms
      // a workout at all (its one row is malformed, dropped before grouping).
      expect(preview.workoutsFoundCount).toBe(4);
      expect(preview.duplicateWorkoutCount).toBe(0);
      expect(preview.matchedExerciseTitles).toEqual([
        'Bench Press',
        'Cable Fly',
        'Incline Dumbbell Press',
        'Treadmill Run',
      ]);
      expect(preview.unmatchedExercises.map((e) => e.exerciseTitle).sort()).toEqual(
        ['Air Squat', 'Plank Hold', 'River Run', 'Sled Push', 'Wall Sit', 'Weighted Situp'].sort(),
      );
    });

    it('reports the malformed "Broken Entry" row at its real line number (16) without affecting any other workout', async () => {
      const preview = await service().preview(FILE_URI);
      if ('error' in preview) throw new Error('expected a valid preview');

      expect(preview.malformedRows).toEqual([
        { line: 16, reason: expect.stringContaining('start_time') },
      ]);
      expect(preview.workoutSkips).toEqual([]);
    });

    it('carries the unknown set_type and out-of-enum RPE warnings from "Quirky Day"', async () => {
      const preview = await service().preview(FILE_URI);
      if ('error' in preview) throw new Error('expected a valid preview');

      expect(preview.warnings).toEqual(
        expect.arrayContaining([
          { line: 15, message: expect.stringContaining('circuit') },
          { line: 15, message: expect.stringContaining('9.2') },
        ]),
      );
    });

    it('imports all 4 workouts and every set, preserves the Push Day superset, and auto-creates all 6 inferred types', async () => {
      const preview = await service().preview(FILE_URI);
      if ('error' in preview) throw new Error('expected a valid preview');
      const report = await service().confirm(preview);

      expect(report.importedWorkoutCount).toBe(4);
      // Push Day 6 + Cardio 1 + Mixed Day 6 + Quirky Day 1 = 14 sets total.
      expect(report.importedSetCount).toBe(14);
      expect(report.duplicateSkippedCount).toBe(0);

      const bySupersetId = driver.queryAll<{ exercise_id: string; superset_id: number | null }>(
        `SELECT we.exercise_id, we.superset_id FROM workout_exercises we
         JOIN workouts w ON w.id = we.workout_id WHERE w.title = 'Push Day'
         ORDER BY we.position`,
      );
      expect(bySupersetId).toEqual([
        { exercise_id: 'bench-press', superset_id: null },
        { exercise_id: 'incline-db-press', superset_id: 1 },
        { exercise_id: 'cable-fly', superset_id: 1 },
      ]);

      const inferredByName = new Map(
        report.autoCreatedExercises.map((e) => [e.exerciseTitle, e.inference.exerciseType]),
      );
      expect(inferredByName).toEqual(
        new Map([
          ['Weighted Situp', 'weight_reps'],
          ['Air Squat', 'reps_only'],
          ['Plank Hold', 'duration'],
          ['Wall Sit', 'weight_duration'],
          ['River Run', 'distance_duration'],
          ['Sled Push', 'short_distance_weight'],
        ]),
      );
      expect(report.autoCreatedExercises.every((e) => !e.inference.ambiguous)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Sample-fixture counts + supersets preserved (inline-built variant — see
  // this file's header; kept alongside the fixture-driven block above as a
  // second, independent construction of the same shape)
  // -------------------------------------------------------------------------

  it('imports the correct workout/set counts and preserves superset grouping', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    insertBuiltin('incline-db-press', 'Incline Dumbbell Press');
    insertBuiltin('cable-fly', 'Cable Fly');

    const startTime = localDate(2026, 1, 3, 8, 15);
    const endTime = localDate(2026, 1, 3, 9, 5);
    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 0, setType: 'warmup', weight: '40', reps: '10' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 1, weight: '100', reps: '5' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Incline Dumbbell Press', setIndex: 0, supersetId: 1, exerciseNotes: 'Slow eccentric', weight: '30', reps: '10' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Cable Fly', setIndex: 0, supersetId: 1, weight: '15', reps: '15' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.workoutsFoundCount).toBe(1);
    expect(preview.dateRange).toEqual({ start: startTime, end: startTime });
    expect(preview.matchedExerciseTitles).toEqual(['Bench Press', 'Cable Fly', 'Incline Dumbbell Press']);
    expect(preview.unmatchedExercises).toEqual([]);
    expect(preview.duplicateWorkoutCount).toBe(0);

    const report = await service().confirm(preview);
    expect(report.importedWorkoutCount).toBe(1);
    expect(report.importedSetCount).toBe(4);
    expect(report.duplicateSkippedCount).toBe(0);
    expect(report.autoCreatedExercises).toEqual([]);

    expect(workoutCountForTitle('Push Day')).toBe(1);
    expect(setCountForWorkoutTitle('Push Day')).toBe(4);

    const supersetRows = driver.queryAll<{ superset_id: number | null; exercise_id: string }>(
      `SELECT we.superset_id, we.exercise_id FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id WHERE w.title = 'Push Day'
       ORDER BY we.position`,
    );
    expect(supersetRows).toEqual([
      { superset_id: null, exercise_id: 'bench-press' },
      { superset_id: 1, exercise_id: 'incline-db-press' },
      { superset_id: 1, exercise_id: 'cable-fly' },
    ]);
  });

  // -------------------------------------------------------------------------
  // RPE snapping
  // -------------------------------------------------------------------------

  it('snaps an out-of-enum RPE to the nearest valid value and reports a warning', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const startTime = localDate(2026, 1, 3, 8, 15);
    const endTime = localDate(2026, 1, 3, 9, 5);
    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 0, weight: '100', reps: '5', rpe: '9.2' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    const report = await service().confirm(preview);

    expect(report.warnings).toEqual([{ line: 2, message: expect.stringContaining('9.2') }]);
    const rows = driver.queryAll<{ rpe: number }>(`SELECT rpe FROM sets`);
    expect(rows[0].rpe).toBe(9);
  });

  // -------------------------------------------------------------------------
  // Set-type mapping
  // -------------------------------------------------------------------------

  it('maps every known set_type 1:1 and defaults an unknown one to normal with a warning', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const startTime = localDate(2026, 1, 3, 8, 15);
    const endTime = localDate(2026, 1, 3, 9, 5);
    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 0, setType: 'warmup', weight: '40', reps: '10' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 1, setType: 'normal', weight: '100', reps: '5' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 2, setType: 'failure', weight: '105', reps: '3' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 3, setType: 'dropset', weight: '90', reps: '6' },
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 4, setType: 'circuit', weight: '80', reps: '8' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    const report = await service().confirm(preview);

    expect(report.warnings).toEqual([{ line: 6, message: expect.stringContaining('circuit') }]);
    const rows = driver.queryAll<{ set_type: string }>(
      `SELECT set_type FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
       ORDER BY s.position`,
    );
    expect(rows.map((r) => r.set_type)).toEqual(['warmup', 'normal', 'failure', 'dropset', 'normal']);
  });

  // -------------------------------------------------------------------------
  // Imperial-header conversion
  // -------------------------------------------------------------------------

  it('converts an imperial (lbs/miles) header file to canonical kg/m storage', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const startTime = localDate(2026, 1, 3, 8, 15);
    const endTime = localDate(2026, 1, 3, 9, 5);
    mockFileText(
      buildCsvText(
        [{ title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 0, weight: '225', reps: '5' }],
        LBS_HEADER,
      ),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.units).toEqual({ weightUnit: 'lbs', distanceUnit: 'miles' });
    await service().confirm(preview);

    const rows = driver.queryAll<{ weight_kg: number }>(`SELECT weight_kg FROM sets`);
    expect(rows[0].weight_kg).toBeCloseTo(225 / 2.2046226218, 6);
  });

  // -------------------------------------------------------------------------
  // Exercise-type inference: one fixture case per rule
  // -------------------------------------------------------------------------

  it.each([
    { name: 'Weighted Situp', weight: '10', reps: '15', distance: undefined, duration: undefined, expected: 'weight_reps' },
    { name: 'Air Squat', weight: undefined, reps: '20', distance: undefined, duration: undefined, expected: 'reps_only' },
    { name: 'Plank Hold', weight: undefined, reps: undefined, distance: undefined, duration: '60', expected: 'duration' },
    { name: 'Wall Sit', weight: '20', reps: undefined, distance: undefined, duration: '45', expected: 'weight_duration' },
    { name: 'River Run', weight: undefined, reps: undefined, distance: '2', duration: '600', expected: 'distance_duration' },
    { name: 'Sled Push', weight: '40', reps: undefined, distance: '20', duration: undefined, expected: 'short_distance_weight' },
  ])(
    'auto-creates $name as $expected from its populated columns',
    async ({ name, weight, reps, distance, duration, expected }) => {
      const startTime = localDate(2026, 1, 3, 8, 15);
      const endTime = localDate(2026, 1, 3, 9, 5);
      mockFileText(
        buildCsvText([
          { title: 'Mixed Day', startTime, endTime, exerciseTitle: name, setIndex: 0, weight, reps, distance, duration },
        ]),
      );

      const preview = await service().preview(FILE_URI);
      if ('error' in preview) throw new Error('expected a valid preview');
      expect(preview.unmatchedExercises).toEqual([
        { exerciseTitle: name, inference: { exerciseType: expected, ambiguous: false } },
      ]);

      const report = await service().confirm(preview);
      expect(report.autoCreatedExercises).toHaveLength(1);
      expect(report.autoCreatedExercises[0]).toMatchObject({
        exerciseTitle: name,
        inference: { exerciseType: expected, ambiguous: false },
      });

      const created = await exerciseRepository.get(report.autoCreatedExercises[0].exerciseId);
      expect(created?.exerciseType).toBe(expected);
      expect(created?.isCustom).toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // Duplicate workout skip
  // -------------------------------------------------------------------------

  it('skips a workout whose (title, start_time) already exists, counting it as a duplicate', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const startTime = localDate(2026, 1, 3, 8, 15);
    const endTime = localDate(2026, 1, 3, 9, 5);
    const now = Date.now();
    driver.execute(
      `INSERT INTO workouts (id, title, description, routine_id, state, start_time, end_time, duration_pause_offset_ms, created_at, updated_at, deleted_at)
       VALUES ('existing-w', 'Push Day', NULL, NULL, 'completed', ?, ?, 0, ?, ?, NULL)`,
      [startTime, endTime, now, now],
    );

    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime, endTime, exerciseTitle: 'Bench Press', setIndex: 0, weight: '100', reps: '5' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.duplicateWorkoutCount).toBe(1);

    const report = await service().confirm(preview);
    expect(report.importedWorkoutCount).toBe(0);
    expect(report.duplicateSkippedCount).toBe(1);
    expect(workoutCountForTitle('Push Day')).toBe(1); // still just the pre-existing row
  });

  it('does not skip a different workout in the same file just because one of its siblings is a duplicate', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const dupStart = localDate(2026, 1, 3, 8, 15);
    const dupEnd = localDate(2026, 1, 3, 9, 5);
    const now = Date.now();
    driver.execute(
      `INSERT INTO workouts (id, title, description, routine_id, state, start_time, end_time, duration_pause_offset_ms, created_at, updated_at, deleted_at)
       VALUES ('existing-w', 'Push Day', NULL, NULL, 'completed', ?, ?, 0, ?, ?, NULL)`,
      [dupStart, dupEnd, now, now],
    );

    const newStart = localDate(2026, 1, 10, 8, 15);
    const newEnd = localDate(2026, 1, 10, 9, 5);
    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime: dupStart, endTime: dupEnd, exerciseTitle: 'Bench Press', setIndex: 0, weight: '100', reps: '5' },
        { title: 'Push Day', startTime: newStart, endTime: newEnd, exerciseTitle: 'Bench Press', setIndex: 0, weight: '105', reps: '5' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    const report = await service().confirm(preview);

    expect(report.importedWorkoutCount).toBe(1);
    expect(report.duplicateSkippedCount).toBe(1);
    expect(workoutCountForTitle('Push Day')).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Malformed row line-numbered
  // -------------------------------------------------------------------------

  it('skips a malformed row (missing start_time) and reports its exact line number, importing the rest of the file', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const goodStart = localDate(2026, 1, 3, 8, 15);
    const goodEnd = localDate(2026, 1, 3, 9, 5);
    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime: goodStart, endTime: goodEnd, exerciseTitle: 'Bench Press', setIndex: 0, weight: '100', reps: '5' },
        // Line 3 (header=1, this=3rd overall record): fatally missing
        // start_time (05 §7.2's own worked example of a malformed row).
        { title: 'Broken Day', startTime: goodStart, endTime: goodEnd, startTimeFieldOverride: '', exerciseTitle: 'Bench Press', setIndex: 0, weight: '50', reps: '5' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.malformedRows).toEqual([{ line: 3, reason: expect.stringContaining('start_time') }]);
    expect(preview.workoutsFoundCount).toBe(1);

    const report = await service().confirm(preview);
    expect(report.malformedRows).toEqual([{ line: 3, reason: expect.stringContaining('start_time') }]);
    expect(report.importedWorkoutCount).toBe(1);
    expect(workoutCountForTitle('Push Day')).toBe(1);
    expect(workoutCountForTitle('Broken Day')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // All-or-nothing workout skip
  // -------------------------------------------------------------------------

  it('skips a whole workout (all-or-nothing) when its rows are internally inconsistent, without affecting other workouts', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    const start = localDate(2026, 1, 3, 8, 15);
    const csv = buildCsvText([
      { title: 'Inconsistent Day', startTime: start, endTime: localDate(2026, 1, 3, 9, 0), exerciseTitle: 'Bench Press', setIndex: 0, weight: '100', reps: '5' },
      { title: 'Inconsistent Day', startTime: start, endTime: localDate(2026, 1, 3, 9, 30), exerciseTitle: 'Bench Press', setIndex: 1, weight: '100', reps: '5' },
      { title: 'Good Day', startTime: localDate(2026, 1, 4, 8, 0), endTime: localDate(2026, 1, 4, 8, 30), exerciseTitle: 'Bench Press', setIndex: 0, weight: '90', reps: '8' },
    ]);
    mockFileText(csv);

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.workoutSkips).toEqual([
      { title: 'Inconsistent Day', startTime: start, reason: expect.stringContaining('end_time') },
    ]);

    const report = await service().confirm(preview);
    expect(report.workoutSkips).toHaveLength(1);
    expect(workoutCountForTitle('Inconsistent Day')).toBe(0);
    expect(workoutCountForTitle('Good Day')).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Custom-exercise re-link (05 §7.4)
  // -------------------------------------------------------------------------

  it('re-links a re-imported CSV\'s unmatched exercise name to the SAME previously-auto-created custom exercise, not a duplicate', async () => {
    const start1 = localDate(2026, 1, 3, 8, 15);
    const end1 = localDate(2026, 1, 3, 9, 0);
    mockFileText(
      buildCsvText([
        { title: 'Carry Day 1', startTime: start1, endTime: end1, exerciseTitle: 'Zercher Carry', setIndex: 0, weight: '40', distance: '20' },
      ]),
    );
    const firstPreview = await service().preview(FILE_URI);
    if ('error' in firstPreview) throw new Error('expected a valid preview');
    const firstReport = await service().confirm(firstPreview);
    expect(firstReport.autoCreatedExercises).toHaveLength(1);
    const createdId = firstReport.autoCreatedExercises[0].exerciseId;

    // Re-import a DIFFERENT workout (different start_time — not a duplicate)
    // that references the same exercise title again.
    const start2 = localDate(2026, 1, 10, 8, 15);
    const end2 = localDate(2026, 1, 10, 9, 0);
    mockFileText(
      buildCsvText([
        { title: 'Carry Day 2', startTime: start2, endTime: end2, exerciseTitle: 'Zercher Carry', setIndex: 0, weight: '45', distance: '25' },
      ]),
    );
    const secondPreview = await service().preview(FILE_URI);
    if ('error' in secondPreview) throw new Error('expected a valid preview');
    expect(secondPreview.matchedExerciseTitles).toEqual(['Zercher Carry']);
    expect(secondPreview.unmatchedExercises).toEqual([]);

    const secondReport = await service().confirm(secondPreview);
    expect(secondReport.autoCreatedExercises).toEqual([]); // re-linked, not re-created
    expect(secondReport.touchedExerciseIds).toEqual([createdId]);

    const allExercisesNamed = driver.queryAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM exercises WHERE name = 'Zercher Carry'`,
    );
    expect(allExercisesNamed[0].n).toBe(1); // exactly one row, never duplicated
  });

  it('matches a pre-existing custom exercise by exact case-insensitive name (not just built-ins)', async () => {
    const custom = await exerciseRepository.create({
      name: 'Sled Push',
      exerciseType: 'short_distance_weight',
      primaryMuscleGroup: 'quadriceps',
    });

    const start = localDate(2026, 1, 3, 8, 15);
    const end = localDate(2026, 1, 3, 9, 0);
    mockFileText(
      buildCsvText([
        { title: 'Leg Day', startTime: start, endTime: end, exerciseTitle: 'sled push', setIndex: 0, weight: '40', distance: '20' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.matchedExerciseTitles).toEqual(['sled push']);
    expect(preview.unmatchedExercises).toEqual([]);

    const report = await service().confirm(preview);
    expect(report.autoCreatedExercises).toEqual([]);
    expect(report.touchedExerciseIds).toEqual([custom.id]);
  });

  it('re-checks the library fresh at confirm time — an exercise created in the preview-to-confirm gap is matched, not duplicated', async () => {
    const start = localDate(2026, 1, 3, 8, 15);
    const end = localDate(2026, 1, 3, 9, 0);
    mockFileText(
      buildCsvText([
        { title: 'Carry Day', startTime: start, endTime: end, exerciseTitle: 'Trap Bar Carry', setIndex: 0, weight: '60', distance: '15' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.unmatchedExercises).toHaveLength(1);

    // Simulate something else creating the exact same exercise name in the
    // narrow gap between preview and confirm (see `resolveAndCreateExercises`'s
    // own doc comment on why `confirm` re-checks fresh rather than trusting
    // `preview`'s snapshot).
    const racingExercise = await exerciseRepository.create({
      name: 'Trap Bar Carry',
      exerciseType: 'short_distance_weight',
      primaryMuscleGroup: 'quadriceps',
    });

    const report = await service().confirm(preview);

    expect(report.autoCreatedExercises).toEqual([]); // matched the racing row, not re-created
    expect(report.touchedExerciseIds).toEqual([racingExercise.id]);
    const rows = driver.queryAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM exercises WHERE name = 'Trap Bar Carry'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('matches by alias, not just the primary name', async () => {
    insertBuiltin('ohp', 'Barbell Shoulder Press', ['OHP']);
    const start = localDate(2026, 1, 3, 8, 15);
    const end = localDate(2026, 1, 3, 9, 0);
    mockFileText(
      buildCsvText([
        { title: 'Push Day', startTime: start, endTime: end, exerciseTitle: 'OHP', setIndex: 0, weight: '60', reps: '5' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    expect(preview.matchedExerciseTitles).toEqual(['OHP']);
    expect(preview.unmatchedExercises).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Bulk invalidation surface
  // -------------------------------------------------------------------------

  it('returns every distinct touched exercise id across all imported workouts, excluding duplicates\' exercises', async () => {
    insertBuiltin('bench-press', 'Bench Press');
    insertBuiltin('squat', 'Squat');
    const dupStart = localDate(2026, 1, 3, 8, 15);
    const dupEnd = localDate(2026, 1, 3, 9, 0);
    const now = Date.now();
    driver.execute(
      `INSERT INTO workouts (id, title, description, routine_id, state, start_time, end_time, duration_pause_offset_ms, created_at, updated_at, deleted_at)
       VALUES ('existing-w', 'Dup Day', NULL, NULL, 'completed', ?, ?, 0, ?, ?, NULL)`,
      [dupStart, dupEnd, now, now],
    );

    const newStart = localDate(2026, 1, 4, 8, 15);
    const newEnd = localDate(2026, 1, 4, 9, 0);
    mockFileText(
      buildCsvText([
        { title: 'Dup Day', startTime: dupStart, endTime: dupEnd, exerciseTitle: 'Squat', setIndex: 0, weight: '80', reps: '5' },
        { title: 'New Day', startTime: newStart, endTime: newEnd, exerciseTitle: 'Bench Press', setIndex: 0, weight: '80', reps: '5' },
      ]),
    );

    const preview = await service().preview(FILE_URI);
    if ('error' in preview) throw new Error('expected a valid preview');
    const report = await service().confirm(preview);

    expect(report.touchedExerciseIds).toEqual(['bench-press']); // not 'squat' — its only workout was a duplicate
  });

  // -------------------------------------------------------------------------
  // Whole-file header error
  // -------------------------------------------------------------------------

  it('returns a whole-file error from preview when the header is unrecognizable', async () => {
    mockFileText('not,a,valid,hevy,header\n1,2,3,4,5\n');
    const preview: HevyImportPreview | { error: string } = await service().preview(FILE_URI);
    expect('error' in preview).toBe(true);
  });
});
