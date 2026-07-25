/**
 * `domain/streaks.ts` tests (M4-06 acceptance gate, 08 §4.8): consecutive
 * weeks, first-day-of-week variants, current-week grace, gap breaks,
 * midnight-crossing.
 */
import {
  computeWeekStreak,
  localDateKey,
  parseLocalDateKey,
  startOfWeek,
  type WorkoutDateCount,
} from '../streaks';

function d(y: number, m: number, day: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, day, h, min);
}

function dc(date: string, count = 1): WorkoutDateCount {
  return { date, count };
}

describe('localDateKey / parseLocalDateKey', () => {
  it('formats a local Y-M-D key with zero padding', () => {
    expect(localDateKey(d(2026, 1, 5).getTime())).toBe('2026-01-05');
    expect(localDateKey(d(2026, 11, 23).getTime())).toBe('2026-11-23');
  });

  it('parseLocalDateKey round-trips to the same local midnight', () => {
    const key = '2026-07-04';
    const parsed = parseLocalDateKey(key);
    expect(localDateKey(parsed.getTime())).toBe(key);
    expect(parsed.getHours()).toBe(0);
  });

  it('midnight-crossing: a 23:50 start_time buckets to its own start date, not the next day (02 §16.3)', () => {
    const lateNight = d(2026, 7, 10, 23, 50);
    expect(localDateKey(lateNight.getTime())).toBe('2026-07-10');
  });
});

describe('startOfWeek — first-day-of-week variants', () => {
  // 2026-07-08 is a Wednesday.
  const wednesday = d(2026, 7, 8);

  it('monday: buckets back to Monday 2026-07-06', () => {
    expect(localDateKey(startOfWeek(wednesday, 'monday').getTime())).toBe('2026-07-06');
  });

  it('sunday: buckets back to Sunday 2026-07-05', () => {
    expect(localDateKey(startOfWeek(wednesday, 'sunday').getTime())).toBe('2026-07-05');
  });

  it('saturday: buckets back to Saturday 2026-07-04', () => {
    expect(localDateKey(startOfWeek(wednesday, 'saturday').getTime())).toBe('2026-07-04');
  });

  it('a date that already IS the configured first day maps to itself', () => {
    const monday = d(2026, 7, 6);
    expect(localDateKey(startOfWeek(monday, 'monday').getTime())).toBe('2026-07-06');
  });
});

describe('computeWeekStreak — consecutive weeks', () => {
  it('counts N consecutive already-ended weeks with a workout, ending at "now" in a later, also-covered week', () => {
    // Weeks (Monday-start): current week (2026-07-06..12, "now" = Wed Jul 8)
    // has a workout; the two prior weeks also do; the week before that does
    // not — streak should be 3.
    const now = d(2026, 7, 8, 10, 0);
    const dates: WorkoutDateCount[] = [
      dc('2026-07-08'), // current week
      dc('2026-06-29'), // prior week (Jun 29 - Jul 5)
      dc('2026-06-22'), // week before that (Jun 22-28)
      // 2026-06-15 week (Jun 15-21) deliberately has no workout — the wall.
    ];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(3);
  });

  it('a single isolated week with a workout, all others empty, is a streak of 1', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-08')];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(1);
  });

  it('no workouts ever logged: streak is 0', () => {
    const now = d(2026, 7, 8);
    expect(computeWeekStreak([], { firstDayOfWeek: 'monday', now })).toBe(0);
  });

  it('multiple workouts within the same week only count as one bucket', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-06', 2), dc('2026-07-08', 1)];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(1);
  });
});

describe('computeWeekStreak — first-day-of-week variants change the bucketing', () => {
  it('a Sunday workout counts as part of the "current" week under sunday-start but the prior week under monday-start', () => {
    // now = Wednesday 2026-07-08. Workout on Sunday 2026-07-05.
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-05')];

    // monday-start: 2026-07-05 (Sun) belongs to the week Jun 29 - Jul 5,
    // which is the week BEFORE the current (Jul 6-12) week — current week
    // itself is empty but still in progress (grace), so the streak walks
    // back to the prior week, finds the workout there, and stops (streak=1).
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(1);

    // sunday-start: 2026-07-05 (Sun) IS the start of the current week
    // (Jul 5-11) under this setting — the current week has the workout, so
    // it counts directly (streak=1) via the "has a workout" branch, not the
    // grace branch. Same numeric result, different code path — the actual
    // regression this case guards is bucket reassignment, verified via the
    // week-grid test below.
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'sunday', now })).toBe(1);
  });

  it('re-buckets: adding one more workout the same calendar week produces different streak lengths per first-day setting', () => {
    // now = Wednesday 2026-07-08 (Jul 8). Workouts on Sun Jul 5 and Wed Jul 8.
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-05'), dc('2026-07-08')];

    // sunday-start: both dates fall in the SAME week (Jul 5-11, current) —
    // one counted week, streak = 1 (no earlier weeks have data).
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'sunday', now })).toBe(1);

    // monday-start: Jul 5 is the prior week (Jun 29-Jul 5), Jul 8 is the
    // current week (Jul 6-12) — two distinct, consecutive counted weeks,
    // streak = 2.
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(2);
  });

  it('saturday-start bucketing', () => {
    // now = Wednesday 2026-07-08. Current saturday-start week is Jul 4-10.
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-08'), dc('2026-06-27')];
    // 2026-06-27 (Sat) starts the week Jun 27 - Jul 3, which is the week
    // immediately before the current (Jul 4-10) week — consecutive, streak = 2.
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'saturday', now })).toBe(2);
  });
});

describe('computeWeekStreak — current-week grace', () => {
  it('current week has no workout yet but is still in progress: does not break a prior streak', () => {
    const now = d(2026, 7, 8); // Wednesday — current week not over.
    const dates: WorkoutDateCount[] = [
      dc('2026-06-29'), // prior week (Jun 29 - Jul 5)
      dc('2026-06-22'), // week before that
    ];
    // Current week (Jul 6-12) has nothing — grace, skipped, not counted, not
    // broken. Walk continues into the prior week, which has a workout —
    // streak = 2 (the two already-elapsed weeks), current week omitted.
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(2);
  });

  it('current week empty AND the immediately-prior (already-ended) week is also empty: streak is 0, not merely "not broken"', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-06-22')]; // two weeks back, with a gap between.
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(0);
  });

  it('current week already has a workout: counts normally, no special grace needed', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-08'), dc('2026-06-29')];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(2);
  });
});

describe('computeWeekStreak — gap breaks', () => {
  it('a workoutless already-ended week stops the count even though older weeks have workouts', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [
      dc('2026-07-08'), // current week: counts
      // 2026-06-29 week: gap (no entry) — breaks here.
      dc('2026-06-22'), // older week, has a workout, but unreachable past the gap.
    ];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(1);
  });

  it('a gap several weeks back still only counts the unbroken tail nearest "now"', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [
      dc('2026-07-08'),
      dc('2026-06-29'),
      dc('2026-06-22'),
      // gap at 2026-06-15 week
      dc('2026-06-08'),
    ];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(3);
  });
});

describe('computeWeekStreak — midnight-crossing workouts count on start date (02 §16.3)', () => {
  it('a workout that starts at 23:50 and would end after midnight still buckets by its start date', () => {
    const now = d(2026, 7, 8, 10, 0);
    // The workout "started" the night of Jul 7 (23:50) — the repository
    // layer buckets by start_time's local day (`localDateKey`), so the
    // WorkoutDateCount row this domain function receives is dated 2026-07-07,
    // never 2026-07-08, regardless of when the workout actually finished.
    const dates: WorkoutDateCount[] = [dc('2026-07-07')];
    // 2026-07-07 (Tue) is in the same monday-start week as "now" (Jul 6-12) —
    // counts as the current week's workout.
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(1);
  });

  it('count <= 0 rows are ignored defensively', () => {
    const now = d(2026, 7, 8);
    const dates: WorkoutDateCount[] = [dc('2026-07-08', 0), dc('2026-06-29', 1)];
    expect(computeWeekStreak(dates, { firstDayOfWeek: 'monday', now })).toBe(1);
  });
});
