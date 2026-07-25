/**
 * `formatRelativeWorkoutDate` tests (M4-03, 04 §3.1: "Yesterday", "Tue, 15
 * Jul"). `formatWorkoutDate` (M2-14, unchanged) already has coverage via
 * `HistoryDetailScreen.test.tsx`'s rendered-date assertions — not
 * duplicated here.
 */
import { formatRelativeWorkoutDate } from '../date-format';

const NOW = new Date(2026, 6, 15, 18, 0, 0); // Wed 15 Jul 2026, 18:00 local

describe('formatRelativeWorkoutDate', () => {
  it('"Today" for the same calendar day, regardless of time-of-day', () => {
    const earlyToday = new Date(2026, 6, 15, 6, 0, 0).getTime();
    expect(formatRelativeWorkoutDate(earlyToday, NOW)).toBe('Today');
  });

  it('"Yesterday" for the previous calendar day', () => {
    const yesterday = new Date(2026, 6, 14, 23, 0, 0).getTime();
    expect(formatRelativeWorkoutDate(yesterday, NOW)).toBe('Yesterday');
  });

  it('"{weekday}, {day} {month}" for anything older than yesterday, same year — no year suffix', () => {
    const lastWeek = new Date(2026, 6, 8, 9, 0, 0).getTime(); // Wed 8 Jul 2026
    expect(formatRelativeWorkoutDate(lastWeek, NOW)).toBe('Wed, 8 Jul');
  });

  it('a date in a different calendar year appends the year', () => {
    const lastYear = new Date(2025, 6, 15, 9, 0, 0).getTime();
    expect(formatRelativeWorkoutDate(lastYear, NOW)).toBe('Tue, 15 Jul 2025');
  });

  it('a date crossing midnight is compared by calendar day, not a raw 24h delta', () => {
    // 15 Jul 00:30 is "today" relative to a NOW of 15 Jul 18:00, even though
    // it's less than 24h before NOW would suggest a naive hours-diff works
    // by coincidence here — the real case this guards is the reverse: a
    // workout at 23:30 two calendar days ago must read "Yesterday", not
    // "Today", despite being < 24h before NOW's 18:00.
    const lateTwoDaysAgo = new Date(2026, 6, 13, 23, 30, 0).getTime();
    expect(formatRelativeWorkoutDate(lateTwoDaysAgo, NOW)).not.toBe('Today');
    expect(formatRelativeWorkoutDate(lateTwoDaysAgo, NOW)).not.toBe('Yesterday');
  });
});
