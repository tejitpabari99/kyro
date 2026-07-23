/**
 * `DurationEditSheet` tests (M2-05 acceptance gate): smoke render both
 * themes, start-time save, duration save, and the pause/resume toggle.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { DurationEditSheet } from '../DurationEditSheet';
import { ThemeProvider } from '@/ui/theme-provider';

function baseProps(overrides: Partial<React.ComponentProps<typeof DurationEditSheet>> = {}) {
  return {
    visible: true,
    onDismiss: jest.fn(),
    startTime: new Date(2026, 0, 1, 9, 5, 0).getTime(),
    elapsedMs: 65_000, // 1:05
    isPaused: false,
    onSaveStartTime: jest.fn(),
    onSaveDuration: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    testID: 'duration-sheet',
    ...overrides,
  };
}

describe('DurationEditSheet — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('duration-sheet')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <DurationEditSheet {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('duration-sheet')).toBeTruthy();
  });
});

describe('DurationEditSheet — start time', () => {
  it('seeds hour/minute fields from startTime', async () => {
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('duration-sheet-hour').props.value).toBe('09');
    expect(screen.getByTestId('duration-sheet-minute').props.value).toBe('05');
  });

  it('saves an edited start time on the same calendar day', async () => {
    const onSaveStartTime = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ onSaveStartTime })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('duration-sheet-hour'), '14');
    await fireEvent.changeText(screen.getByTestId('duration-sheet-minute'), '30');
    await fireEvent.press(screen.getByTestId('duration-sheet-save-start-time'));

    expect(onSaveStartTime).toHaveBeenCalledTimes(1);
    const saved = new Date(onSaveStartTime.mock.calls[0][0]);
    expect(saved.getHours()).toBe(14);
    expect(saved.getMinutes()).toBe(30);
    expect(saved.getFullYear()).toBe(2026);
    expect(saved.getMonth()).toBe(0);
    expect(saved.getDate()).toBe(1);
  });
});

describe('DurationEditSheet — duration', () => {
  it('seeds hours/minutes/seconds from elapsedMs', async () => {
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ elapsedMs: 3_725_000 })} />
      </ThemeProvider>,
    );
    // 3725s = 1h 2m 5s
    expect(screen.getByTestId('duration-sheet-hours').props.value).toBe('1');
    expect(screen.getByTestId('duration-sheet-minutes').props.value).toBe('2');
    expect(screen.getByTestId('duration-sheet-seconds').props.value).toBe('5');
  });

  it('saves the edited duration as total seconds', async () => {
    const onSaveDuration = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ onSaveDuration })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('duration-sheet-hours'), '0');
    await fireEvent.changeText(screen.getByTestId('duration-sheet-minutes'), '5');
    await fireEvent.changeText(screen.getByTestId('duration-sheet-seconds'), '30');
    await fireEvent.press(screen.getByTestId('duration-sheet-save-duration'));

    expect(onSaveDuration).toHaveBeenCalledWith(330);
  });
});

describe('DurationEditSheet — pause/resume', () => {
  it('shows "Pause Workout" and calls onPause when running', async () => {
    const onPause = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ isPaused: false, onPause })} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Pause Workout')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('duration-sheet-pause-resume'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('shows "Resume Workout" and calls onResume when paused', async () => {
    const onResume = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ isPaused: true, onResume })} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Resume Workout')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('duration-sheet-pause-resume'));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
