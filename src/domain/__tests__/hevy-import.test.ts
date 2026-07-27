/**
 * `domain/hevy-import.ts` unit tests (M5-07 acceptance gate, 08 §4.6) — the
 * pure parse/group/infer core. End-to-end DB-level acceptance cases
 * (duplicate-workout skip against a real DB, custom-exercise auto-create +
 * re-link, bulk invalidation) live in
 * `src/features/data-transfer/__tests__/hevy-import-service.test.ts`
 * instead, since those need a real `ExerciseRepository`/driver — this file
 * only ever feeds plain in-memory record arrays into this module's own
 * exported functions.
 */
import {
  aggregateExerciseMetricFlags,
  buildWorkoutDraft,
  groupHevyRows,
  inferExerciseType,
  parseHevyCsvRecords,
  parseHevyRow,
  resolveHevyHeader,
  snapRpe,
  type HevyCsvInputRecord,
  type HevyParsedRow,
} from '../hevy-import';

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

function csvDate(y: number, m: number, day: number, h: number, min: number): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${day} ${months[m - 1]} ${y}, ${pad(h)}:${pad(min)}`;
}

/** Builds a raw Hevy-style data row keyed by header name, filling any column not passed with `''`. */
function row(header: readonly string[], values: Record<string, string>): string[] {
  return header.map((name) => values[name] ?? '');
}

const kgHeaderResolution = resolveHevyHeader(KG_HEADER);
if ('error' in kgHeaderResolution) {
  throw new Error('test setup: KG_HEADER failed to resolve');
}

// ---------------------------------------------------------------------------
// resolveHevyHeader
// ---------------------------------------------------------------------------

describe('resolveHevyHeader', () => {
  it('resolves a kg/km header to metric units', () => {
    const result = resolveHevyHeader(KG_HEADER);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.units).toEqual({ weightUnit: 'kg', distanceUnit: 'km' });
  });

  it('resolves an lbs/miles header to imperial units', () => {
    const result = resolveHevyHeader(LBS_HEADER);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.units).toEqual({ weightUnit: 'lbs', distanceUnit: 'miles' });
  });

  it('is case-insensitive and trims whitespace on header names', () => {
    const messyHeader = KG_HEADER.map((h) => ` ${h.toUpperCase()} `);
    const result = resolveHevyHeader(messyHeader);
    expect('error' in result).toBe(false);
  });

  it('tolerates a reordered header (looks up by name, not position)', () => {
    const reordered = [...KG_HEADER].reverse();
    const result = resolveHevyHeader(reordered);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.columns.title).toBe(reordered.indexOf('title'));
  });

  it('errors when a required base column is missing', () => {
    const missingTitle = KG_HEADER.filter((h) => h !== 'title');
    const result = resolveHevyHeader(missingTitle);
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('title');
  });

  it('errors when neither weight column is present', () => {
    const noWeight = KG_HEADER.filter((h) => h !== 'weight_kg');
    const result = resolveHevyHeader(noWeight);
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toMatch(/weight/i);
  });

  it('errors when both weight columns are present (ambiguous)', () => {
    const bothWeight = [...KG_HEADER, 'weight_lbs'];
    const result = resolveHevyHeader(bothWeight);
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toMatch(/ambiguous/i);
  });

  it('errors when neither distance column is present', () => {
    const noDistance = KG_HEADER.filter((h) => h !== 'distance_km');
    const result = resolveHevyHeader(noDistance);
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toMatch(/distance/i);
  });

  it('errors when both distance columns are present (ambiguous)', () => {
    const bothDistance = [...KG_HEADER, 'distance_miles'];
    const result = resolveHevyHeader(bothDistance);
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toMatch(/ambiguous/i);
  });
});

// ---------------------------------------------------------------------------
// parseHevyRow
// ---------------------------------------------------------------------------

describe('parseHevyRow', () => {
  const baseValues: Record<string, string> = {
    title: 'Push Day',
    start_time: csvDate(2026, 1, 3, 8, 15),
    end_time: csvDate(2026, 1, 3, 9, 5),
    description: 'Felt strong',
    exercise_title: 'Bench Press',
    superset_id: '',
    exercise_notes: '',
    set_index: '0',
    set_type: 'normal',
    weight_kg: '100',
    reps: '5',
    distance_km: '',
    duration_seconds: '',
    rpe: '8',
  };

  it('parses a well-formed row', () => {
    const result = parseHevyRow(row(KG_HEADER, baseValues), kgHeaderResolution, 2);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row).toEqual<HevyParsedRow>({
      line: 2,
      title: 'Push Day',
      startTime: localDate(2026, 1, 3, 8, 15),
      endTime: localDate(2026, 1, 3, 9, 5),
      description: 'Felt strong',
      exerciseTitle: 'Bench Press',
      supersetId: null,
      exerciseNotes: null,
      setIndex: 0,
      setType: 'normal',
      weightKg: 100,
      reps: 5,
      distanceMeters: null,
      durationSeconds: null,
      rpe: 8,
    });
    expect(result.warnings).toEqual([]);
  });

  it('errors with the given line number when title is missing', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, title: '' }), kgHeaderResolution, 42);
    expect(result).toEqual({ error: { line: 42, reason: expect.stringContaining('title') } });
  });

  it('errors when start_time is missing', () => {
    const result = parseHevyRow(
      row(KG_HEADER, { ...baseValues, start_time: '' }),
      kgHeaderResolution,
      7,
    );
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error.line).toBe(7);
    expect(result.error.reason).toMatch(/start_time/);
  });

  it('errors when start_time is unparseable garbage', () => {
    const result = parseHevyRow(
      row(KG_HEADER, { ...baseValues, start_time: 'not a date' }),
      kgHeaderResolution,
      7,
    );
    expect('error' in result).toBe(true);
  });

  it('errors when end_time is missing', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, end_time: '' }), kgHeaderResolution, 8);
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error.reason).toMatch(/end_time/);
  });

  it('errors when exercise_title is missing', () => {
    const result = parseHevyRow(
      row(KG_HEADER, { ...baseValues, exercise_title: '' }),
      kgHeaderResolution,
      9,
    );
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error.reason).toMatch(/exercise_title/);
  });

  it('accepts ISO 8601 for start_time/end_time defensively', () => {
    const result = parseHevyRow(
      row(KG_HEADER, {
        ...baseValues,
        start_time: '2026-01-03T08:15:00.000Z',
        end_time: '2026-01-03T09:05:00.000Z',
      }),
      kgHeaderResolution,
      2,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.startTime).toBe(new Date('2026-01-03T08:15:00.000Z').getTime());
  });

  it('maps every known set_type 1:1 with no warning', () => {
    for (const setType of ['normal', 'warmup', 'failure', 'dropset']) {
      const result = parseHevyRow(row(KG_HEADER, { ...baseValues, set_type: setType }), kgHeaderResolution, 2);
      expect('error' in result).toBe(false);
      if ('error' in result) continue;
      expect(result.row.setType).toBe(setType);
      expect(result.warnings).toEqual([]);
    }
  });

  it('defaults an empty set_type to normal with no warning', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, set_type: '' }), kgHeaderResolution, 2);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.setType).toBe('normal');
    expect(result.warnings).toEqual([]);
  });

  it('defaults an unknown set_type to normal WITH a warning', () => {
    const result = parseHevyRow(
      row(KG_HEADER, { ...baseValues, set_type: 'superset' }),
      kgHeaderResolution,
      13,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.setType).toBe('normal');
    expect(result.warnings).toEqual([{ line: 13, message: expect.stringContaining('superset') }]);
  });

  it('keeps an in-enum RPE unchanged with no warning', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, rpe: '7.5' }), kgHeaderResolution, 2);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.rpe).toBe(7.5);
    expect(result.warnings).toEqual([]);
  });

  it('snaps an out-of-enum RPE to the nearest valid value WITH a warning', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, rpe: '9.2' }), kgHeaderResolution, 5);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.rpe).toBe(9);
    expect(result.warnings).toEqual([{ line: 5, message: expect.stringContaining('9.2') }]);
  });

  it('leaves an empty RPE as null with no warning', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, rpe: '' }), kgHeaderResolution, 2);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.rpe).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('silently nulls a garbled (non-fatal) numeric field rather than erroring the row', () => {
    const result = parseHevyRow(row(KG_HEADER, { ...baseValues, weight_kg: 'garbage' }), kgHeaderResolution, 2);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.weightKg).toBeNull();
  });

  it('converts imperial weight_lbs to canonical kg', () => {
    const lbsHeaderResolution = resolveHevyHeader(LBS_HEADER);
    if ('error' in lbsHeaderResolution) throw new Error('setup failed');
    const result = parseHevyRow(
      row(LBS_HEADER, { ...baseValues, weight_lbs: '225', distance_miles: '' }),
      lbsHeaderResolution,
      2,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    // 225 lb -> kg, full precision (no display rounding at parse time).
    expect(result.row.weightKg).toBeCloseTo(225 / 2.2046226218, 8);
  });

  it('converts imperial distance_miles to canonical meters', () => {
    const lbsHeaderResolution = resolveHevyHeader(LBS_HEADER);
    if ('error' in lbsHeaderResolution) throw new Error('setup failed');
    const result = parseHevyRow(
      row(LBS_HEADER, { ...baseValues, weight_lbs: '', distance_miles: '3.1' }),
      lbsHeaderResolution,
      2,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.distanceMeters).toBeCloseTo(3.1 * 1609.344, 6);
  });

  it('parses a non-empty exercise_notes value through', () => {
    const result = parseHevyRow(
      row(KG_HEADER, { ...baseValues, exercise_notes: 'Slow eccentric' }),
      kgHeaderResolution,
      2,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.row.exerciseNotes).toBe('Slow eccentric');
  });

  it('parses superset_id as an integer, empty as null', () => {
    const withSuperset = parseHevyRow(
      row(KG_HEADER, { ...baseValues, superset_id: '1' }),
      kgHeaderResolution,
      2,
    );
    expect('error' in withSuperset).toBe(false);
    if (!('error' in withSuperset)) expect(withSuperset.row.supersetId).toBe(1);

    const withoutSuperset = parseHevyRow(row(KG_HEADER, baseValues), kgHeaderResolution, 2);
    expect('error' in withoutSuperset).toBe(false);
    if (!('error' in withoutSuperset)) expect(withoutSuperset.row.supersetId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// snapRpe
// ---------------------------------------------------------------------------

describe('snapRpe', () => {
  it('snaps up and down to the closest valid value', () => {
    expect(snapRpe(6.2)).toBe(6);
    expect(snapRpe(9.9)).toBe(10);
    expect(snapRpe(8.3)).toBe(8.5);
  });

  it('breaks an exact tie toward the lower value', () => {
    // 6.5 is equidistant from 6 and 7.
    expect(snapRpe(6.5)).toBe(6);
  });

  it('leaves an exact valid value unchanged', () => {
    expect(snapRpe(9.5)).toBe(9.5);
  });
});

// ---------------------------------------------------------------------------
// groupHevyRows
// ---------------------------------------------------------------------------

function parsedRow(overrides: Partial<HevyParsedRow>): HevyParsedRow {
  return {
    line: 2,
    title: 'Push Day',
    startTime: localDate(2026, 1, 3, 8, 15),
    endTime: localDate(2026, 1, 3, 9, 5),
    description: null,
    exerciseTitle: 'Bench Press',
    supersetId: null,
    exerciseNotes: null,
    setIndex: 0,
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    distanceMeters: null,
    durationSeconds: null,
    rpe: null,
    ...overrides,
  };
}

describe('groupHevyRows', () => {
  it('groups rows sharing (title, start_time) into one group, preserving row order', () => {
    const rowA = parsedRow({ exerciseTitle: 'Bench Press', setIndex: 0 });
    const rowB = parsedRow({ exerciseTitle: 'Bench Press', setIndex: 1 });
    const rowC = parsedRow({
      title: 'Cardio',
      startTime: localDate(2026, 1, 3, 18, 30),
      endTime: localDate(2026, 1, 3, 19, 0),
      exerciseTitle: 'Treadmill Run',
    });

    const { groups } = groupHevyRows([rowA, rowC, rowB]);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('Push Day');
    expect(groups[0].rows).toEqual([rowA, rowB]);
    expect(groups[1].title).toBe('Cardio');
    expect(groups[1].rows).toEqual([rowC]);
  });

  it('treats same title but different start_time as separate workouts', () => {
    const rowA = parsedRow({ startTime: localDate(2026, 1, 3, 8, 15) });
    const rowB = parsedRow({ startTime: localDate(2026, 1, 10, 8, 15) });
    const { groups } = groupHevyRows([rowA, rowB]);
    expect(groups).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildWorkoutDraft
// ---------------------------------------------------------------------------

describe('buildWorkoutDraft', () => {
  it('builds exercise occurrences with reindexed 0-based positions', () => {
    const rows = [
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: 0 }),
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: 1 }),
      parsedRow({ exerciseTitle: 'Squat', setIndex: 0 }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    expect('draft' in result).toBe(true);
    if (!('draft' in result)) return;
    expect(result.draft.exercises).toHaveLength(2);
    expect(result.draft.exercises[0]).toMatchObject({ position: 0, exerciseTitle: 'Bench Press' });
    expect(result.draft.exercises[0].sets.map((s) => s.position)).toEqual([0, 1]);
    expect(result.draft.exercises[1]).toMatchObject({ position: 1, exerciseTitle: 'Squat' });
  });

  it('re-sorts sets by the set_index hint even if rows arrive out of order', () => {
    const rows = [
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: 1, reps: 5 }),
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: 0, reps: 10 }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    if (!('draft' in result)) throw new Error('expected draft');
    expect(result.draft.exercises[0].sets.map((s) => s.reps)).toEqual([10, 5]);
  });

  it('sorts rows with a missing set_index hint after every row that has one, preserving relative order among themselves', () => {
    const rows = [
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: null, reps: 1 }),
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: 0, reps: 2 }),
      parsedRow({ exerciseTitle: 'Bench Press', setIndex: null, reps: 3 }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    if (!('draft' in result)) throw new Error('expected draft');
    expect(result.draft.exercises[0].sets.map((s) => s.reps)).toEqual([2, 1, 3]);
  });

  it('preserves superset_id per exercise occurrence (superset round-trip)', () => {
    const rows = [
      parsedRow({ exerciseTitle: 'Incline DB Press', supersetId: 1, setIndex: 0 }),
      parsedRow({ exerciseTitle: 'Cable Fly', supersetId: 1, setIndex: 0 }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    if (!('draft' in result)) throw new Error('expected draft');
    expect(result.draft.exercises[0].supersetId).toBe(1);
    expect(result.draft.exercises[1].supersetId).toBe(1);
  });

  it('creates two separate occurrences for the same exercise used twice non-consecutively', () => {
    const rows = [
      parsedRow({ exerciseTitle: 'Plank', setIndex: 0 }),
      parsedRow({ exerciseTitle: 'Squat', setIndex: 0 }),
      parsedRow({ exerciseTitle: 'Plank', setIndex: 0 }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    if (!('draft' in result)) throw new Error('expected draft');
    expect(result.draft.exercises).toHaveLength(3);
    expect(result.draft.exercises.map((e) => e.exerciseTitle)).toEqual(['Plank', 'Squat', 'Plank']);
  });

  it('skips the whole workout when end_time is inconsistent across its rows', () => {
    const rows = [
      parsedRow({ endTime: localDate(2026, 1, 3, 9, 5) }),
      parsedRow({ endTime: localDate(2026, 1, 3, 9, 10) }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    expect('skip' in result).toBe(true);
    if (!('skip' in result)) return;
    expect(result.skip.reason).toMatch(/end_time/);
  });

  it('skips the whole workout when description is inconsistent across its rows', () => {
    const rows = [parsedRow({ description: 'A' }), parsedRow({ description: 'B' })];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    expect('skip' in result).toBe(true);
    if (!('skip' in result)) return;
    expect(result.skip.reason).toMatch(/description/);
  });

  it('skips the whole workout when superset_id is inconsistent within one exercise occurrence', () => {
    const rows = [
      parsedRow({ exerciseTitle: 'Bench Press', supersetId: null, setIndex: 0 }),
      parsedRow({ exerciseTitle: 'Bench Press', supersetId: 1, setIndex: 1 }),
    ];
    const { groups } = groupHevyRows(rows);
    const result = buildWorkoutDraft(groups[0]);
    expect('skip' in result).toBe(true);
    if (!('skip' in result)) return;
    expect(result.skip.reason).toMatch(/superset_id/);
  });
});

// ---------------------------------------------------------------------------
// parseHevyCsvRecords (end to end over plain record arrays)
// ---------------------------------------------------------------------------

function records(rows: readonly Record<string, string>[], header: readonly string[] = KG_HEADER): HevyCsvInputRecord[] {
  return [
    { fields: [...header], line: 1 },
    ...rows.map((values, i): HevyCsvInputRecord => ({ fields: row(header, values), line: i + 2 })),
  ];
}

describe('parseHevyCsvRecords', () => {
  const validRow: Record<string, string> = {
    title: 'Push Day',
    start_time: csvDate(2026, 1, 3, 8, 15),
    end_time: csvDate(2026, 1, 3, 9, 5),
    description: '',
    exercise_title: 'Bench Press',
    superset_id: '',
    exercise_notes: '',
    set_index: '0',
    set_type: 'normal',
    weight_kg: '100',
    reps: '5',
    distance_km: '',
    duration_seconds: '',
    rpe: '',
  };

  it('errors on an empty file (no header row)', () => {
    const result = parseHevyCsvRecords([]);
    expect('error' in result).toBe(true);
  });

  it('propagates a header resolution error for the whole file', () => {
    const result = parseHevyCsvRecords([{ fields: ['not', 'a', 'valid', 'header'], line: 1 }]);
    expect('error' in result).toBe(true);
  });

  it('parses a header-only file (no data rows) to zero workouts, no errors', () => {
    const result = parseHevyCsvRecords(records([]));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.workouts).toEqual([]);
    expect(result.malformedRows).toEqual([]);
  });

  it('reports a malformed row with its correct line number, without dropping the whole file', () => {
    const goodRow = validRow;
    const badRow = { ...validRow, start_time: '' }; // fatally missing start_time
    const result = parseHevyCsvRecords(records([goodRow, badRow]));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.malformedRows).toEqual([{ line: 3, reason: expect.stringContaining('start_time') }]);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0].exercises[0].sets).toHaveLength(1);
  });

  it('aggregates set_type/RPE warnings with their line numbers across the file', () => {
    const rowWithBadSetType = { ...validRow, set_type: 'circuit' };
    const rowWithBadRpe = { ...validRow, rpe: '11' };
    const result = parseHevyCsvRecords(records([rowWithBadSetType, rowWithBadRpe]));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0].line).toBe(2);
    expect(result.warnings[1].line).toBe(3);
  });

  it('groups rows into workouts and reports skipped workouts separately from malformed rows', () => {
    const inconsistentA = { ...validRow, end_time: csvDate(2026, 1, 3, 9, 5) };
    const inconsistentB = { ...validRow, end_time: csvDate(2026, 1, 3, 9, 10) };
    const result = parseHevyCsvRecords(records([inconsistentA, inconsistentB]));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.workouts).toEqual([]);
    expect(result.skippedWorkouts).toHaveLength(1);
  });

  it('resolves imperial units end-to-end and converts stored values to canonical kg/m', () => {
    const imperialRow = {
      ...validRow,
      weight_lbs: '220',
      distance_miles: '',
    };
    delete (imperialRow as Record<string, string>).weight_kg;
    delete (imperialRow as Record<string, string>).distance_km;
    const result = parseHevyCsvRecords(records([imperialRow], LBS_HEADER));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.units).toEqual({ weightUnit: 'lbs', distanceUnit: 'miles' });
    expect(result.workouts[0].exercises[0].sets[0].weightKg).toBeCloseTo(220 / 2.2046226218, 8);
  });
});

// ---------------------------------------------------------------------------
// inferExerciseType / aggregateExerciseMetricFlags
// ---------------------------------------------------------------------------

describe('inferExerciseType', () => {
  it('infers weight_reps from weight+reps', () => {
    expect(
      inferExerciseType({ hasWeight: true, hasReps: true, hasDistance: false, hasDuration: false }),
    ).toEqual({ exerciseType: 'weight_reps', ambiguous: false });
  });

  it('infers reps_only from reps alone', () => {
    expect(
      inferExerciseType({ hasWeight: false, hasReps: true, hasDistance: false, hasDuration: false }),
    ).toEqual({ exerciseType: 'reps_only', ambiguous: false });
  });

  it('infers duration from duration alone', () => {
    expect(
      inferExerciseType({ hasWeight: false, hasReps: false, hasDistance: false, hasDuration: true }),
    ).toEqual({ exerciseType: 'duration', ambiguous: false });
  });

  it('infers weight_duration from weight+duration', () => {
    expect(
      inferExerciseType({ hasWeight: true, hasReps: false, hasDistance: false, hasDuration: true }),
    ).toEqual({ exerciseType: 'weight_duration', ambiguous: false });
  });

  it('infers distance_duration from distance+duration', () => {
    expect(
      inferExerciseType({ hasWeight: false, hasReps: false, hasDistance: true, hasDuration: true }),
    ).toEqual({ exerciseType: 'distance_duration', ambiguous: false });
  });

  it('infers short_distance_weight from weight+distance', () => {
    expect(
      inferExerciseType({ hasWeight: true, hasReps: false, hasDistance: true, hasDuration: false }),
    ).toEqual({ exerciseType: 'short_distance_weight', ambiguous: false });
  });

  it('falls back with ambiguous:true for a combination outside the 6-rule table (weight+reps takes priority)', () => {
    const result = inferExerciseType({
      hasWeight: true,
      hasReps: true,
      hasDistance: false,
      hasDuration: true,
    });
    expect(result.ambiguous).toBe(true);
    expect(result.exerciseType).toBe('weight_reps'); // weight+reps takes fallback priority
  });

  it('falls back to reps_only for reps combined with distance (no weight)', () => {
    const result = inferExerciseType({
      hasWeight: false,
      hasReps: true,
      hasDistance: true,
      hasDuration: false,
    });
    expect(result).toEqual({ exerciseType: 'reps_only', ambiguous: true });
  });

  it('falls back to weight_duration for weight+duration+distance (no reps)', () => {
    const result = inferExerciseType({
      hasWeight: true,
      hasReps: false,
      hasDistance: true,
      hasDuration: true,
    });
    expect(result).toEqual({ exerciseType: 'weight_duration', ambiguous: true });
  });

  it('falls back to weight_reps (last resort) for weight alone', () => {
    const result = inferExerciseType({
      hasWeight: true,
      hasReps: false,
      hasDistance: false,
      hasDuration: false,
    });
    expect(result).toEqual({ exerciseType: 'weight_reps', ambiguous: true });
  });

  it('falls back to weight_reps (last resort) for distance alone', () => {
    const result = inferExerciseType({
      hasWeight: false,
      hasReps: false,
      hasDistance: true,
      hasDuration: false,
    });
    expect(result).toEqual({ exerciseType: 'weight_reps', ambiguous: true });
  });

  it('falls back to weight_reps for a totally empty flag set (nothing populated)', () => {
    const result = inferExerciseType({
      hasWeight: false,
      hasReps: false,
      hasDistance: false,
      hasDuration: false,
    });
    expect(result).toEqual({ exerciseType: 'weight_reps', ambiguous: true });
  });
});

describe('aggregateExerciseMetricFlags', () => {
  it('aggregates across every occurrence of the exercise title in the file', () => {
    const workouts = [
      {
        title: 'A',
        description: null,
        startTime: 1,
        endTime: 2,
        exercises: [
          {
            position: 0,
            exerciseTitle: 'Farmer Carry',
            supersetId: null,
            notes: null,
            sets: [
              {
                position: 0,
                setType: 'normal' as const,
                weightKg: 20,
                reps: null,
                distanceMeters: null,
                durationSeconds: null,
                rpe: null,
              },
            ],
          },
        ],
      },
      {
        title: 'B',
        description: null,
        startTime: 3,
        endTime: 4,
        exercises: [
          {
            position: 0,
            exerciseTitle: 'Farmer Carry',
            supersetId: null,
            notes: null,
            sets: [
              {
                position: 0,
                setType: 'normal' as const,
                weightKg: null,
                reps: 12,
                distanceMeters: 30,
                durationSeconds: 45,
                rpe: null,
              },
            ],
          },
        ],
      },
    ];

    const flags = aggregateExerciseMetricFlags(workouts, 'Farmer Carry');
    expect(flags).toEqual({ hasWeight: true, hasReps: true, hasDistance: true, hasDuration: true });
  });

  it('ignores occurrences of a different exercise title', () => {
    const workouts = [
      {
        title: 'A',
        description: null,
        startTime: 1,
        endTime: 2,
        exercises: [
          {
            position: 0,
            exerciseTitle: 'Other Exercise',
            supersetId: null,
            notes: null,
            sets: [
              {
                position: 0,
                setType: 'normal' as const,
                weightKg: 100,
                reps: 5,
                distanceMeters: null,
                durationSeconds: null,
                rpe: null,
              },
            ],
          },
        ],
      },
    ];
    const flags = aggregateExerciseMetricFlags(workouts, 'Farmer Carry');
    expect(flags).toEqual({ hasWeight: false, hasReps: false, hasDistance: false, hasDuration: false });
  });
});
