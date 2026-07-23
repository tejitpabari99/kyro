import { autoTitleForDate, autoTitleForHour } from '../auto-title';

describe('autoTitleForHour — 02 §1 exact boundaries', () => {
  it.each([
    [4, 'Morning Workout'],
    [8, 'Morning Workout'],
    [11, 'Morning Workout'],
    [12, 'Midday Workout'],
    [14, 'Midday Workout'],
    [16, 'Midday Workout'],
    [17, 'Evening Workout'],
    [19, 'Evening Workout'],
    [20, 'Evening Workout'],
    [21, 'Night Workout'],
    [23, 'Night Workout'],
    [0, 'Night Workout'],
    [3, 'Night Workout'],
  ])('hour %i -> %s', (hour, expected) => {
    expect(autoTitleForHour(hour)).toBe(expected);
  });
});

describe('autoTitleForDate', () => {
  it('reads the local hour off the given Date', () => {
    const morning = new Date(2026, 0, 1, 7, 30, 0);
    const night = new Date(2026, 0, 1, 23, 59, 0);
    expect(autoTitleForDate(morning)).toBe('Morning Workout');
    expect(autoTitleForDate(night)).toBe('Night Workout');
  });
});
