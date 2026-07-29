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

describe('DurationEditSheet — re-seeding on visible transition', () => {
  it('re-seeds all fields from fresh startTime/elapsedMs when transitioning closed -> open', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ visible: false })} />
      </ThemeProvider>,
    );

    await rerender(
      <ThemeProvider preference="dark">
        <DurationEditSheet
          {...baseProps({
            visible: true,
            startTime: new Date(2026, 0, 1, 14, 45, 0).getTime(),
            elapsedMs: 3_725_000, // 1h 2m 5s
          })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('duration-sheet-hour').props.value).toBe('14');
    expect(screen.getByTestId('duration-sheet-minute').props.value).toBe('45');
    expect(screen.getByTestId('duration-sheet-hours').props.value).toBe('1');
    expect(screen.getByTestId('duration-sheet-minutes').props.value).toBe('2');
    expect(screen.getByTestId('duration-sheet-seconds').props.value).toBe('5');
  });

  it('does not re-seed while remaining open across an unrelated re-render', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ visible: true })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('duration-sheet-hour'), '20');

    // Re-render with visible still true and a *different* startTime — since
    // the sheet never transitioned closed->open, the user's in-progress
    // edit must survive (not get clobbered by the new startTime).
    await rerender(
      <ThemeProvider preference="dark">
        <DurationEditSheet
          {...baseProps({ visible: true, startTime: new Date(2026, 0, 1, 3, 0, 0).getTime() })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('duration-sheet-hour').props.value).toBe('20');
  });

  it('transitions open -> closed without throwing (sheet unmounts its content)', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ visible: true })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('duration-sheet-hour')).toBeTruthy();

    await rerender(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ visible: false })} />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('duration-sheet-hour')).toBeNull();
  });
});

describe('DurationEditSheet — invalid/empty numeric input falls back to 0', () => {
  it('saves start time as 00:00 when the hour/minute fields are cleared', async () => {
    const onSaveStartTime = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ onSaveStartTime })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('duration-sheet-hour'), '');
    await fireEvent.changeText(screen.getByTestId('duration-sheet-minute'), '');
    await fireEvent.press(screen.getByTestId('duration-sheet-save-start-time'));

    const saved = new Date(onSaveStartTime.mock.calls[0][0]);
    expect(saved.getHours()).toBe(0);
    expect(saved.getMinutes()).toBe(0);
  });

  it('saves duration as 0 total seconds when hours/minutes/seconds are cleared', async () => {
    const onSaveDuration = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <DurationEditSheet {...baseProps({ onSaveDuration })} />
      </ThemeProvider>,
    );

    await fireEvent.changeText(screen.getByTestId('duration-sheet-hours'), '');
    await fireEvent.changeText(screen.getByTestId('duration-sheet-minutes'), '');
    await fireEvent.changeText(screen.getByTestId('duration-sheet-seconds'), '');
    await fireEvent.press(screen.getByTestId('duration-sheet-save-duration'));

    expect(onSaveDuration).toHaveBeenCalledWith(0);
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
