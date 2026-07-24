/**
 * `DurationTimerSheet` tests (M2-08, 02 §4: "start counts up from 0; stop
 * writes the elapsed whole seconds"). Fake timers drive the 1 s display
 * tick; the committed value is asserted directly against `onCommit`, not
 * scraped from the display text, matching the file's own header note that
 * the committed value is independently recomputed from `Date.now()` at
 * Stop time rather than trusted off the last rendered tick.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import { DurationTimerSheet } from '../DurationTimerSheet';

async function renderSheet(overrides: Partial<React.ComponentProps<typeof DurationTimerSheet>> = {}) {
  const props: React.ComponentProps<typeof DurationTimerSheet> = {
    visible: true,
    onDismiss: jest.fn(),
    onCommit: jest.fn(),
    testID: 'sheet',
    ...overrides,
  };
  const result = await render(
    <ThemeProvider preference="dark">
      <DurationTimerSheet {...props} />
    </ThemeProvider>,
  );
  return { props, ...result };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('DurationTimerSheet — smoke render (both themes)', () => {
  it('renders in dark theme, showing Start and 0:00', async () => {
    await render(
      <ThemeProvider preference="dark">
        <DurationTimerSheet visible onDismiss={jest.fn()} onCommit={jest.fn()} testID="sheet" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-start')).toBeTruthy();
    expect(screen.getByTestId('sheet-elapsed')).toHaveTextContent('0:00');
  });

  it('renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <DurationTimerSheet visible onDismiss={jest.fn()} onCommit={jest.fn()} testID="sheet" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet')).toBeTruthy();
  });
});

describe('DurationTimerSheet — start/stop (02 §4)', () => {
  it('Start swaps to a Stop button and the display ticks up once per second', async () => {
    jest.useFakeTimers();
    await renderSheet();

    await act(async () => {
      fireEvent.press(screen.getByTestId('sheet-start'));
    });
    expect(screen.queryByTestId('sheet-stop')).toBeTruthy();
    expect(screen.getByTestId('sheet-elapsed')).toHaveTextContent('0:00');

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('sheet-elapsed')).toHaveTextContent('0:03');
  });

  it('Stop commits the elapsed whole seconds and dismisses', async () => {
    jest.useFakeTimers();
    const onCommit = jest.fn();
    const onDismiss = jest.fn();
    await renderSheet({ onCommit, onDismiss });

    await act(async () => {
      fireEvent.press(screen.getByTestId('sheet-start'));
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('sheet-stop'));
    });

    expect(onCommit).toHaveBeenCalledWith(5);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('re-opening the sheet after a prior run resets to the not-running state at 0:00', async () => {
    jest.useFakeTimers();
    const { rerender } = await renderSheet({ visible: true });

    await act(async () => {
      fireEvent.press(screen.getByTestId('sheet-start'));
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await act(async () => {
      await rerender(
        <ThemeProvider preference="dark">
          <DurationTimerSheet visible={false} onDismiss={jest.fn()} onCommit={jest.fn()} testID="sheet" />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      await rerender(
        <ThemeProvider preference="dark">
          <DurationTimerSheet visible onDismiss={jest.fn()} onCommit={jest.fn()} testID="sheet" />
        </ThemeProvider>,
      );
    });

    expect(screen.getByTestId('sheet-elapsed')).toHaveTextContent('0:00');
    expect(screen.queryByTestId('sheet-start')).toBeTruthy();
  });

  it('Stop is a no-op if somehow pressed while not running (defensive — the button is never rendered in that state)', async () => {
    const onCommit = jest.fn();
    await renderSheet({ onCommit });
    // Never pressed Start — only sheet-start is on screen, sheet-stop shouldn't exist.
    expect(screen.queryByTestId('sheet-stop')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
