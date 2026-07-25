/**
 * `CalendarMonth` tests (M4-06 acceptance gate) — smoke render both themes,
 * chevron paging, day-tap callback, and the dot/badge/today visual state
 * driven purely by props (`Sheet.test.tsx`'s own precedent: native
 * `Gesture.Pan` drag sequences are left to manual/QA verification, not
 * simulated in RNTL — see `CalendarMonth.tsx`'s own file header). Every
 * render call is `await`ed (`Sheet.test.tsx`'s own convention) — with a
 * full 7-wide `GestureDetector`-wrapped grid, `render()`'s internal `act()`
 * flush is asynchronous, so an un-awaited `render()` leaves RNTL's `screen`
 * singleton unset for the very next synchronous assertion.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CalendarMonth, type CalendarMonthDayCell } from '../CalendarMonth';
import { ThemeProvider } from '../theme-provider';
import type { ThemeName } from '../tokens';

function makeWeek(dates: (Partial<CalendarMonthDayCell> & { date: string })[]): CalendarMonthDayCell[] {
  return dates.map((overrides) => ({
    dayOfMonth: Number(overrides.date.slice(-2)),
    inCurrentMonth: true,
    isToday: false,
    workoutCount: 0,
    accessibilityLabel: `label ${overrides.date}`,
    ...overrides,
  })) as CalendarMonthDayCell[];
}

function makeWeeks(): CalendarMonthDayCell[][] {
  return [
    makeWeek([
      { date: '2026-07-01' },
      { date: '2026-07-02' },
      { date: '2026-07-03' },
      { date: '2026-07-04' },
      { date: '2026-07-05' },
      { date: '2026-07-06' },
      { date: '2026-07-07' },
    ]),
    makeWeek([
      { date: '2026-07-08' },
      { date: '2026-07-09' },
      { date: '2026-07-10', workoutCount: 1 },
      { date: '2026-07-11' },
      { date: '2026-07-12', workoutCount: 3 },
      { date: '2026-07-13' },
      { date: '2026-07-14', isToday: true },
    ]),
  ];
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function renderCalendar(theme: ThemeName = 'dark') {
  const onPrevMonth = jest.fn();
  const onNextMonth = jest.fn();
  const onDayPress = jest.fn();
  await render(
    <ThemeProvider preference={theme}>
      <CalendarMonth
        testID="calendar-month"
        monthLabel="July 2026"
        weekdayLabels={WEEKDAY_LABELS}
        weeks={makeWeeks()}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onDayPress={onDayPress}
      />
    </ThemeProvider>,
  );
  return { onPrevMonth, onNextMonth, onDayPress };
}

describe('CalendarMonth — smoke render (both themes)', () => {
  it.each(['dark', 'light'] as const)('renders the month label and weekday headers (%s theme)', async (theme) => {
    await renderCalendar(theme);
    expect(screen.getByText('July 2026')).toBeTruthy();
    expect(screen.getByText('MON')).toBeTruthy();
    expect(screen.getByTestId('calendar-month-day-2026-07-14')).toBeTruthy();
  });
});

describe('CalendarMonth — paging', () => {
  it('pressing the left chevron calls onPrevMonth', async () => {
    const { onPrevMonth } = await renderCalendar();
    fireEvent.press(screen.getByTestId('calendar-month-prev-month'));
    expect(onPrevMonth).toHaveBeenCalledTimes(1);
  });

  it('pressing the right chevron calls onNextMonth', async () => {
    const { onNextMonth } = await renderCalendar();
    fireEvent.press(screen.getByTestId('calendar-month-next-month'));
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });
});

describe('CalendarMonth — day interaction', () => {
  it('tapping a day cell calls onDayPress with that cell', async () => {
    const { onDayPress } = await renderCalendar();
    fireEvent.press(screen.getByTestId('calendar-month-day-2026-07-10'));
    expect(onDayPress).toHaveBeenCalledTimes(1);
    expect(onDayPress.mock.calls[0]![0]).toMatchObject({ date: '2026-07-10', workoutCount: 1 });
  });

  it('exposes an accessibility label per day cell (07 §9: date + workout count)', async () => {
    await renderCalendar();
    expect(screen.getByLabelText('label 2026-07-10')).toBeTruthy();
  });

  it('shows a ×N badge only for multi-workout days', async () => {
    await renderCalendar();
    expect(screen.getByTestId('calendar-month-badge-2026-07-12')).toBeTruthy();
    expect(screen.queryByTestId('calendar-month-badge-2026-07-10')).toBeNull();
    expect(screen.getByText('×3')).toBeTruthy();
  });
});
