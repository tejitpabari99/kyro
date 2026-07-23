/**
 * `Snackbar` tests (M0-07 acceptance gate): RNTL smoke render both themes,
 * plus Undo-action and 5 s auto-dismiss behavior.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { Snackbar } from '../Snackbar';
import { ThemeProvider } from '../theme-provider';

describe('Snackbar — smoke render (both themes)', () => {
  it('renders the message and Undo action in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible message="Exercise removed" onAction={() => {}} onDismiss={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Exercise removed')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('renders the message and Undo action in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <Snackbar visible message="Exercise removed" onAction={() => {}} onDismiss={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Exercise removed')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('renders nothing when not visible', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible={false} message="Exercise removed" onDismiss={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Exercise removed')).toBeNull();
  });
});

describe('Snackbar — Undo behavior', () => {
  it('calls onAction and onDismiss when Undo is pressed', async () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible message="Exercise removed" onAction={onAction} onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Undo'));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when onAction is not provided', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible message="Exercise removed" onDismiss={() => {}} />
      </ThemeProvider>,
    );

    expect(screen.queryByText('Undo')).toBeNull();
  });
});

describe('Snackbar — auto-dismiss', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onDismiss after 5s by default', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible message="Exercise removed" onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    expect(onDismiss).not.toHaveBeenCalled();

    jest.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss before a custom durationMs elapses', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible message="Exercise removed" onDismiss={onDismiss} durationMs={2000} />
      </ThemeProvider>,
    );

    jest.advanceTimersByTime(1999);
    expect(onDismiss).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not fire the auto-dismiss timer when not visible', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Snackbar visible={false} message="Exercise removed" onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    jest.advanceTimersByTime(10000);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
