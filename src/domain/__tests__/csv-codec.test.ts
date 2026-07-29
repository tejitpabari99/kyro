/**
 * `domain/csv-codec.ts` tests (M5-05 acceptance gate, 08 §4.6's named CSV
 * codec cases): golden-file export (kg AND lbs variants, headers switch),
 * quote/comma/newline escaping, date formatting (single-digit days,
 * local-time-not-UTC), row selection/ordering (completed-only, start_time
 * -> exercise position -> set position), and `custom_metric` never leaking
 * into the output (structurally impossible — see `csv-codec.ts`'s own
 * header — so not re-tested here as a runtime case).
 *
 * Golden fixtures live in `../__fixtures__/csv-codec/export-{kg,lbs}.csv` —
 * generated from this file's own `buildFixtureWorkouts()` dataset by running
 * the real `encodeWorkoutsCsv` once, hand-verified against the exact kg->lb
 * (`* 2.2046226218`) and m->mi (`/ 1609.344`) conversion formulas (05 §5)
 * for every non-trivial value before being committed (see this task's own
 * execution notes) — not merely "whatever the code already produces."
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWorkoutsCsv, formatCsvDateTime, type CsvExportWorkout } from '../csv-codec';

function localDate(y: number, m: number, day: number, h = 0, min = 0): number {
  return new Date(y, m - 1, day, h, min).getTime();
}

function readFixture(name: string): string {
  return readFileSync(join(__dirname, '../__fixtures__/csv-codec', name), 'utf8');
}

// ---------------------------------------------------------------------------
// Golden-file dataset — see this file's header for how the committed
// fixtures were derived from this exact function's output.
// ---------------------------------------------------------------------------

function buildFixtureWorkouts(): CsvExportWorkout[] {
  return [
    {
      title: 'Push Day',
      description: 'Felt strong today',
      state: 'completed',
      startTime: localDate(2026, 1, 3, 8, 15),
      endTime: localDate(2026, 1, 3, 9, 5),
      exercises: [
        {
          position: 0,
          exerciseTitle: 'Bench Press',
          supersetId: null,
          notes: null,
          sets: [
            {
              position: 0,
              setType: 'warmup',
              weightKg: 40,
              reps: 10,
              distanceMeters: null,
              durationSeconds: null,
              rpe: null,
            },
            {
              position: 1,
              setType: 'normal',
              weightKg: 100,
              reps: 5,
              distanceMeters: null,
              durationSeconds: null,
              rpe: 8,
            },
            {
              position: 2,
              setType: 'normal',
              weightKg: 102.5,
              reps: 5,
              distanceMeters: null,
              durationSeconds: null,
              rpe: 8.5,
            },
            {
              position: 3,
              setType: 'failure',
              weightKg: 105,
              reps: 3,
              distanceMeters: null,
              durationSeconds: null,
              rpe: 9.5,
            },
          ],
        },
        {
          position: 1,
          exerciseTitle: 'Incline Dumbbell Press',
          supersetId: 1,
          notes: 'Slow eccentric',
          sets: [
            {
              position: 0,
              setType: 'normal',
              weightKg: 30,
              reps: 10,
              distanceMeters: null,
              durationSeconds: null,
              rpe: null,
            },
            {
              position: 1,
              setType: 'dropset',
              weightKg: 22.5,
              reps: 12,
              distanceMeters: null,
              durationSeconds: null,
              rpe: null,
            },
          ],
        },
        {
          position: 2,
          exerciseTitle: 'Cable Fly',
          supersetId: 1,
          notes: null,
          sets: [
            {
              position: 0,
              setType: 'normal',
              weightKg: 15,
              reps: 15,
              distanceMeters: null,
              durationSeconds: null,
              rpe: 7,
            },
          ],
        },
      ],
    },
    {
      title: 'Cardio',
      description: null,
      state: 'completed',
      startTime: localDate(2026, 1, 3, 18, 30),
      endTime: localDate(2026, 1, 3, 19, 0),
      exercises: [
        {
          position: 0,
          exerciseTitle: 'Treadmill Run',
          supersetId: null,
          notes: null,
          sets: [
            {
              position: 0,
              setType: 'normal',
              weightKg: null,
              reps: null,
              distanceMeters: 5000,
              durationSeconds: 1800,
              rpe: null,
            },
          ],
        },
      ],
    },
    // Active (in-progress) workout — must be excluded entirely from every
    // variant's output (05 §7.1: "completed workouts only"). Its startTime
    // is deliberately *later* than both completed workouts above, so if the
    // filter were broken this row would sort last and be easy to spot.
    {
      title: 'In Progress',
      description: null,
      state: 'active',
      startTime: localDate(2026, 1, 3, 20, 0),
      endTime: null,
      exercises: [
        {
          position: 0,
          exerciseTitle: 'Should Not Appear',
          supersetId: null,
          notes: null,
          sets: [
            {
              position: 0,
              setType: 'normal',
              weightKg: 50,
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
}

// ---------------------------------------------------------------------------
// Golden-file tests
// ---------------------------------------------------------------------------

describe('encodeWorkoutsCsv — golden file', () => {
  it('matches the committed kg/km golden fixture byte-for-byte', () => {
    const csv = encodeWorkoutsCsv(buildFixtureWorkouts(), { weightUnit: 'kg', distanceUnit: 'km' });
    expect(csv).toBe(readFixture('export-kg.csv'));
  });

  it('matches the committed lbs/miles golden fixture byte-for-byte (header switch + converted values)', () => {
    const csv = encodeWorkoutsCsv(buildFixtureWorkouts(), {
      weightUnit: 'lbs',
      distanceUnit: 'miles',
    });
    expect(csv).toBe(readFixture('export-lbs.csv'));
  });

  it('the kg and lbs golden fixtures actually differ (sanity check the fixtures are not accidentally identical)', () => {
    expect(readFixture('export-kg.csv')).not.toBe(readFixture('export-lbs.csv'));
  });
});

// ---------------------------------------------------------------------------
// Row selection & ordering
// ---------------------------------------------------------------------------

describe('encodeWorkoutsCsv — selection & ordering', () => {
  it('excludes active (non-completed) workouts entirely', () => {
    const csv = encodeWorkoutsCsv(buildFixtureWorkouts(), { weightUnit: 'kg', distanceUnit: 'km' });
    expect(csv).not.toContain('In Progress');
    expect(csv).not.toContain('Should Not Appear');
  });

  it('re-sorts out-of-order input by start_time -> exercise position -> set position rather than trusting input order', () => {
    const workouts = buildFixtureWorkouts().filter((w) => w.state === 'completed');
    // Reverse workout order, reverse exercise order within the first
    // workout, and reverse set order within its first exercise — the
    // output must still land in the canonical order regardless.
    const shuffled: CsvExportWorkout[] = [
      workouts[1],
      {
        ...workouts[0],
        exercises: [...workouts[0].exercises]
          .reverse()
          .map((ex) => (ex.position === 0 ? { ...ex, sets: [...ex.sets].reverse() } : ex)),
      },
    ];

    const orderedCsv = encodeWorkoutsCsv(workouts, { weightUnit: 'kg', distanceUnit: 'km' });
    const shuffledCsv = encodeWorkoutsCsv(shuffled, { weightUnit: 'kg', distanceUnit: 'km' });

    expect(shuffledCsv).toBe(orderedCsv);
  });

  it('set_index is a 0-based, re-derived index — not the raw (possibly gapped) position value', () => {
    const workouts: CsvExportWorkout[] = [
      {
        title: 'Gap Test',
        description: null,
        state: 'completed',
        startTime: localDate(2026, 2, 1, 10, 0),
        endTime: localDate(2026, 2, 1, 10, 30),
        exercises: [
          {
            position: 0,
            exerciseTitle: 'Squat',
            supersetId: null,
            notes: null,
            sets: [
              // Raw positions have a gap (0, 5) — output set_index must
              // still be contiguous 0-based (0, 1).
              {
                position: 5,
                setType: 'normal',
                weightKg: 60,
                reps: 5,
                distanceMeters: null,
                durationSeconds: null,
                rpe: null,
              },
              {
                position: 0,
                setType: 'normal',
                weightKg: 55,
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

    const csv = encodeWorkoutsCsv(workouts, { weightUnit: 'kg', distanceUnit: 'km' });
    const dataRows = csv.trim().split('\n').slice(1);
    expect(dataRows).toHaveLength(2);
    // position 0 (weight 55) sorts first -> set_index "0"; position 5
    // (weight 60) sorts second -> set_index "1".
    expect(dataRows[0]).toContain('"0","normal","55"');
    expect(dataRows[1]).toContain('"1","normal","60"');
  });

  it('a workout with zero completed workouts in the input still renders a valid header-only document', () => {
    const csv = encodeWorkoutsCsv(
      [
        {
          title: 'Active Only',
          description: null,
          state: 'active',
          startTime: localDate(2026, 1, 1),
          endTime: null,
          exercises: [],
        },
      ],
      { weightUnit: 'kg', distanceUnit: 'km' },
    );
    expect(csv).toBe(
      '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\n',
    );
  });

  it('a completed workout with a null endTime renders an empty end_time field, not a formatted "null"', () => {
    const workouts: CsvExportWorkout[] = [
      {
        title: 'No End Time',
        description: null,
        state: 'completed',
        startTime: localDate(2026, 1, 5, 10, 0),
        endTime: null,
        exercises: [
          {
            position: 0,
            exerciseTitle: 'Plank',
            supersetId: null,
            notes: null,
            sets: [
              {
                position: 0,
                setType: 'normal',
                weightKg: null,
                reps: null,
                distanceMeters: null,
                durationSeconds: 60,
                rpe: null,
              },
            ],
          },
        ],
      },
    ];

    const csv = encodeWorkoutsCsv(workouts, { weightUnit: 'kg', distanceUnit: 'km' });
    expect(csv).toBe(
      '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\n' +
        '"No End Time","5 Jan 2026, 10:00","","","Plank","","","0","normal","","","","60",""\n',
    );
  });
});

// ---------------------------------------------------------------------------
// Quote / comma / newline escaping (08 §4.6)
// ---------------------------------------------------------------------------

describe('encodeWorkoutsCsv — RFC 4180 escaping', () => {
  function singleRowCsv(overrides: {
    title?: string;
    description?: string | null;
    exerciseTitle?: string;
    notes?: string | null;
  }): string {
    const workouts: CsvExportWorkout[] = [
      {
        title: overrides.title ?? 'Workout',
        description: overrides.description ?? null,
        state: 'completed',
        startTime: localDate(2026, 1, 1, 9, 0),
        endTime: localDate(2026, 1, 1, 9, 30),
        exercises: [
          {
            position: 0,
            exerciseTitle: overrides.exerciseTitle ?? 'Exercise',
            supersetId: null,
            notes: overrides.notes ?? null,
            sets: [
              {
                position: 0,
                setType: 'normal',
                weightKg: 10,
                reps: 1,
                distanceMeters: null,
                durationSeconds: null,
                rpe: null,
              },
            ],
          },
        ],
      },
    ];
    return encodeWorkoutsCsv(workouts, { weightUnit: 'kg', distanceUnit: 'km' });
  }

  it('a comma in the exercise title stays literal inside the quoted field', () => {
    const csv = singleRowCsv({ exerciseTitle: 'Squat, Barbell' });
    expect(csv).toContain('"Squat, Barbell"');
  });

  it('a double quote in the workout title is doubled', () => {
    const csv = singleRowCsv({ title: 'My "PR" Day' });
    expect(csv).toContain('"My ""PR"" Day"');
  });

  it('an embedded newline in the description stays literal inside the quoted field', () => {
    const csv = singleRowCsv({ description: 'Line one\nLine two' });
    expect(csv).toContain('"Line one\nLine two"');
  });

  it('comma + quote + newline together in one exercise note, all escaped correctly at once', () => {
    const csv = singleRowCsv({ notes: 'Felt "heavy", tough set\nnext time: deload' });
    expect(csv).toContain('"Felt ""heavy"", tough set\nnext time: deload"');
  });

  it('every field is quoted even when it contains none of comma/quote/newline', () => {
    const csv = singleRowCsv({});
    const header = csv.split('\n')[0];
    // Every one of the 14 columns is wrapped in quotes.
    expect(header.match(/"/g)).toHaveLength(28);
  });
});

// ---------------------------------------------------------------------------
// Date formatting (05 §7.1: `d MMM yyyy, HH:mm`, local time)
// ---------------------------------------------------------------------------

describe('formatCsvDateTime', () => {
  it("formats the spec's own worked example verbatim", () => {
    expect(formatCsvDateTime(localDate(2025, 3, 28, 17, 29))).toBe('28 Mar 2025, 17:29');
  });

  it('does not zero-pad a single-digit day', () => {
    expect(formatCsvDateTime(localDate(2026, 1, 3, 8, 15))).toBe('3 Jan 2026, 08:15');
  });

  it('zero-pads a single-digit hour/minute (HH:mm stays 2 digits)', () => {
    expect(formatCsvDateTime(localDate(2026, 1, 3, 8, 5))).toBe('3 Jan 2026, 08:05');
  });

  it('renders every month abbreviation correctly', () => {
    const expected = [
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
    expected.forEach((abbrev, monthIndex) => {
      expect(formatCsvDateTime(localDate(2026, monthIndex + 1, 15, 12, 0))).toBe(
        `15 ${abbrev} 2026, 12:00`,
      );
    });
  });

  it('a two-digit day stays unpadded (no leading behavior change above 9)', () => {
    expect(formatCsvDateTime(localDate(2025, 3, 28, 17, 29))).toBe('28 Mar 2025, 17:29');
  });

  // -------------------------------------------------------------------------
  // Local time, not UTC. The codebase has no established TZ-fixing harness
  // (grepped: no `process.env.TZ` usage anywhere in src/**) — `domain/
  // streaks.ts`'s own tests just construct `Date`s via the local-time
  // constructor and trust the environment's own timezone (this repo's CI/
  // dev machine runs in UTC — confirmed via `date`/`Intl.DateTimeFormat`).
  // A mid-test `process.env.TZ` reassignment was tried here first and does
  // *not* work under Jest: empirically (a standalone probe test, TZ set as
  // the very first line of the file before any other code runs), Jest's
  // runtime already resolves/caches the process's timezone via its own
  // internals before user test code executes, so a later
  // `process.env.TZ = 'America/New_York'` has no effect on `Date`'s local
  // getters within a Jest worker — unlike a bare `node -e` script (verified
  // separately), which *does* honor it when TZ is the literal first thing
  // set. Since there's no reliable in-test way to force a non-UTC timezone
  // under this repo's Jest setup, and since the environment IS UTC (so
  // local getters vs. UTC getters produce identical output here — no
  // behavioral difference to assert on), the only environment-independent
  // way to actually prove "local time getters, not UTC getters" is to spy
  // on `Date.prototype` directly and assert which accessor family
  // `formatCsvDateTime` calls.
  // -------------------------------------------------------------------------
  describe('local-time accessors, not UTC (spy-based — see comment above for why)', () => {
    it('calls the local getDate/getMonth/getFullYear/getHours/getMinutes family, never the getUTC* family', () => {
      const localSpies = [
        jest.spyOn(Date.prototype, 'getDate'),
        jest.spyOn(Date.prototype, 'getMonth'),
        jest.spyOn(Date.prototype, 'getFullYear'),
        jest.spyOn(Date.prototype, 'getHours'),
        jest.spyOn(Date.prototype, 'getMinutes'),
      ];
      const utcSpies = [
        jest.spyOn(Date.prototype, 'getUTCDate'),
        jest.spyOn(Date.prototype, 'getUTCMonth'),
        jest.spyOn(Date.prototype, 'getUTCFullYear'),
        jest.spyOn(Date.prototype, 'getUTCHours'),
        jest.spyOn(Date.prototype, 'getUTCMinutes'),
      ];

      formatCsvDateTime(localDate(2026, 1, 3, 8, 15));

      localSpies.forEach((spy) => expect(spy).toHaveBeenCalled());
      utcSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

      [...localSpies, ...utcSpies].forEach((spy) => spy.mockRestore());
    });
  });
});
