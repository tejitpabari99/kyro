/**
 * `calendar-month-model.ts` tests (M4-06) — grid shape/padding, workout
 * count/today flags, first-day-of-week header labels, and streak label
 * formatting.
 */
import { buildMonthGrid, formatMonthLabel, formatStreakLabel, weekdayLabels } from '../calendar-month-model';

function d(y: number, m: number, day: number): Date {
  return new Date(y, m - 1, day);
}

describe('buildMonthGrid', () => {
  it('every week is exactly 7 days, and every day of the target month is present exactly once', () => {
    // July 2026 has 31 days.
    const weeks = buildMonthGrid(2026, 6, 'monday', [], d(2026, 7, 1));
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
    const inMonthDates = weeks.flat().filter((cell) => cell.inCurrentMonth);
    expect(inMonthDates).toHaveLength(31);
    expect(new Set(inMonthDates.map((c) => c.date)).size).toBe(31);
  });

  it('pads leading/trailing days from adjacent months with inCurrentMonth: false', () => {
    // July 2026: 1st is a Wednesday. monday-start grid should lead with
    // Jun 29/30 (Mon/Tue) before Jul 1 (Wed).
    const weeks = buildMonthGrid(2026, 6, 'monday', [], d(2026, 7, 1));
    const firstWeek = weeks[0]!;
    expect(firstWeek[0]).toMatchObject({ date: '2026-06-29', inCurrentMonth: false });
    expect(firstWeek[1]).toMatchObject({ date: '2026-06-30', inCurrentMonth: false });
    expect(firstWeek[2]).toMatchObject({ date: '2026-07-01', inCurrentMonth: true, dayOfMonth: 1 });
  });

  it('re-buckets leading/trailing days differently per first-day-of-week setting', () => {
    // July 1 2026 is a Wednesday.
    const mondayGrid = buildMonthGrid(2026, 6, 'monday', [], d(2026, 7, 1));
    const sundayGrid = buildMonthGrid(2026, 6, 'sunday', [], d(2026, 7, 1));
    // monday-start: first row starts Jun 29 (Mon).
    expect(mondayGrid[0]![0]!.date).toBe('2026-06-29');
    // sunday-start: first row starts Jun 28 (Sun).
    expect(sundayGrid[0]![0]!.date).toBe('2026-06-28');
  });

  it('marks the cell matching `today` with isToday: true, and only that one', () => {
    const weeks = buildMonthGrid(2026, 6, 'monday', [], d(2026, 7, 15));
    const todayCells = weeks.flat().filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]!.date).toBe('2026-07-15');
  });

  it('fills workoutCount from the provided WorkoutDateCount rows, defaulting missing days to 0', () => {
    const weeks = buildMonthGrid(
      2026,
      6,
      'monday',
      [
        { date: '2026-07-10', count: 1 },
        { date: '2026-07-15', count: 3 },
      ],
      d(2026, 7, 1),
    );
    const byDate = new Map(weeks.flat().map((c) => [c.date, c.workoutCount]));
    expect(byDate.get('2026-07-10')).toBe(1);
    expect(byDate.get('2026-07-15')).toBe(3);
    expect(byDate.get('2026-07-01')).toBe(0);
  });
});

describe('weekdayLabels', () => {
  it('monday-start begins with Mon', () => {
    expect(weekdayLabels('monday')[0]).toMatch(/mon/i);
  });

  it('sunday-start begins with Sun', () => {
    expect(weekdayLabels('sunday')[0]).toMatch(/sun/i);
  });

  it('saturday-start begins with Sat', () => {
    expect(weekdayLabels('saturday')[0]).toMatch(/sat/i);
  });

  it('always returns exactly 7 labels', () => {
    expect(weekdayLabels('monday')).toHaveLength(7);
  });
});

describe('formatMonthLabel', () => {
  it('formats as "Month YYYY"', () => {
    expect(formatMonthLabel(2026, 6)).toMatch(/July/);
    expect(formatMonthLabel(2026, 6)).toMatch(/2026/);
  });
});

describe('formatStreakLabel', () => {
  it('renders the fire emoji + count for N >= 1', () => {
    expect(formatStreakLabel(1)).toBe('🔥 1-week streak');
    expect(formatStreakLabel(12)).toBe('🔥 12-week streak');
  });

  it('renders a neutral caption for 0', () => {
    expect(formatStreakLabel(0)).toBe('No active streak yet');
  });
});
