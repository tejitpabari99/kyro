/**
 * `EditWorkoutMetaSheet` tests (M4-05 acceptance gate) — mirrors
 * `DurationEditSheet.test.tsx`'s own shape (both files solve a related but
 * distinct problem, see this file's own header for why they're not the same
 * component): smoke render both themes, seeding from `startTime`/`endTime`/
 * `durationPauseOffsetMs`, Save computing both `nextStartTime` and
 * `nextEndTime` together, re-seeding on the closed->open visible transition
 * (and *not* re-seeding across an unrelated re-render while already open),
 * and invalid/empty numeric input falling back to safe defaults.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import { EditWorkoutMetaSheet } from '../EditWorkoutMetaSheet';

function baseProps(overrides: Partial<React.ComponentProps<typeof EditWorkoutMetaSheet>> = {}) {
  const startTime = new Date(2024, 2, 15, 9, 0, 0, 0).getTime();
  return {
    visible: true,
    onDismiss: jest.fn(),
    startTime,
    endTime: startTime + 65 * 60_000, // 1h 5m later
    durationPauseOffsetMs: 0,
    onSave: jest.fn(),
    testID: 'meta-sheet',
    ...overrides,
  };
}

describe('EditWorkoutMetaSheet — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('meta-sheet')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <EditWorkoutMetaSheet {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('meta-sheet')).toBeTruthy();
  });
});

describe('EditWorkoutMetaSheet — seeding', () => {
  it('seeds date/time fields from startTime and duration fields from endTime - startTime - pauseOffset', async () => {
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps()} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('meta-sheet-year').props.value).toBe('2024');
    expect(screen.getByTestId('meta-sheet-month').props.value).toBe('03');
    expect(screen.getByTestId('meta-sheet-day').props.value).toBe('15');
    expect(screen.getByTestId('meta-sheet-hour').props.value).toBe('09');
    expect(screen.getByTestId('meta-sheet-minute').props.value).toBe('00');
    expect(screen.getByTestId('meta-sheet-hours').props.value).toBe('1');
    expect(screen.getByTestId('meta-sheet-minutes').props.value).toBe('5');
    expect(screen.getByTestId('meta-sheet-seconds').props.value).toBe('0');
  });

  it('subtracts a nonzero durationPauseOffsetMs from the seeded duration', async () => {
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ durationPauseOffsetMs: 60_000 })} />
      </ThemeProvider>,
    );

    // 65 min total minus a 1 min pause offset = 64 min.
    expect(screen.getByTestId('meta-sheet-minutes').props.value).toBe('4');
    expect(screen.getByTestId('meta-sheet-hours').props.value).toBe('1');
  });

  it('falls back to startTime for a null endTime', async () => {
    const startTime = new Date(2024, 2, 15, 9, 0, 0, 0).getTime();
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ startTime, endTime: null })} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('meta-sheet-hours').props.value).toBe('0');
    expect(screen.getByTestId('meta-sheet-minutes').props.value).toBe('0');
    expect(screen.getByTestId('meta-sheet-seconds').props.value).toBe('0');
  });
});

describe('EditWorkoutMetaSheet — Save', () => {
  it('computes nextStartTime from the edited date/time fields and nextEndTime from the edited duration', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ onSave })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('meta-sheet-year'), '2024');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-month'), '04');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-day'), '20');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-hour'), '14');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-minute'), '30');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-hours'), '0');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-minutes'), '45');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-seconds'), '0');
    await fireEvent.press(screen.getByTestId('meta-sheet-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [nextStartTime, nextEndTime] = onSave.mock.calls[0]!;
    const startDate = new Date(nextStartTime);
    expect(startDate.getFullYear()).toBe(2024);
    expect(startDate.getMonth()).toBe(3); // April, 0-based
    expect(startDate.getDate()).toBe(20);
    expect(startDate.getHours()).toBe(14);
    expect(startDate.getMinutes()).toBe(30);
    expect(nextEndTime - nextStartTime).toBe(45 * 60_000);
  });

  it('clamps an out-of-range month/day/hour/minute rather than producing an invalid date', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ onSave })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('meta-sheet-month'), '13');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-hour'), '99');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-minute'), '99');
    await fireEvent.press(screen.getByTestId('meta-sheet-save'));

    const [nextStartTime] = onSave.mock.calls[0]!;
    const startDate = new Date(nextStartTime);
    expect(startDate.getMonth()).toBe(11); // clamped to December (month 12 -> index 11)
    expect(startDate.getHours()).toBe(23);
    expect(startDate.getMinutes()).toBe(59);
  });

  it('falls back to the original startTime\'s year when the year field is cleared', async () => {
    const onSave = jest.fn();
    const startTime = new Date(2024, 2, 15, 9, 0, 0, 0).getTime();
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ onSave, startTime })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('meta-sheet-year'), '');
    await fireEvent.press(screen.getByTestId('meta-sheet-save'));

    const [nextStartTime] = onSave.mock.calls[0]!;
    expect(new Date(nextStartTime).getFullYear()).toBe(2024);
  });

  it('falls back to 0 duration when the duration fields are cleared', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ onSave })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('meta-sheet-hours'), '');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-minutes'), '');
    await fireEvent.changeText(screen.getByTestId('meta-sheet-seconds'), '');
    await fireEvent.press(screen.getByTestId('meta-sheet-save'));

    const [nextStartTime, nextEndTime] = onSave.mock.calls[0]!;
    expect(nextEndTime).toBe(nextStartTime);
  });
});

describe('EditWorkoutMetaSheet — re-seeding on visible transition', () => {
  it('re-seeds every field from fresh props when transitioning closed -> open', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ visible: false })} />
      </ThemeProvider>,
    );

    const nextStart = new Date(2025, 5, 1, 6, 0, 0, 0).getTime();
    await rerender(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet
          {...baseProps({ visible: true, startTime: nextStart, endTime: nextStart + 30 * 60_000 })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('meta-sheet-year').props.value).toBe('2025');
    expect(screen.getByTestId('meta-sheet-month').props.value).toBe('06');
    expect(screen.getByTestId('meta-sheet-day').props.value).toBe('01');
    expect(screen.getByTestId('meta-sheet-hour').props.value).toBe('06');
    expect(screen.getByTestId('meta-sheet-minutes').props.value).toBe('30');
  });

  it('does not re-seed while remaining open across an unrelated re-render', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ visible: true })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('meta-sheet-year'), '1999');

    await rerender(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet
          {...baseProps({ visible: true, startTime: new Date(2030, 0, 1).getTime() })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('meta-sheet-year').props.value).toBe('1999');
  });

  it('transitions open -> closed without throwing (sheet unmounts its content)', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ visible: true })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('meta-sheet-year')).toBeTruthy();

    await rerender(
      <ThemeProvider preference="dark">
        <EditWorkoutMetaSheet {...baseProps({ visible: false })} />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('meta-sheet-year')).toBeNull();
  });
});
