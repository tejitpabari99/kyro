/**
 * `PRBanner` tests (M4-10 acceptance gate) — RNTL smoke render both themes,
 * a11y attributes (07 §9: "PR banner is announced politely"), and the 3 s
 * auto-dismiss behavior (mirrors `Snackbar.test.tsx`'s own fake-timer
 * pattern), plus the "a new message restarts the countdown" case this
 * file's own header documents as the one deliberate divergence from
 * `Snackbar`.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { PRBanner } from '../PRBanner';
import { ThemeProvider } from '../theme-provider';

describe('PRBanner — smoke render (both themes)', () => {
  it('renders the message in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <PRBanner visible message="Heaviest Weight PR — 102.5 kg" onDismiss={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Heaviest Weight PR — 102.5 kg')).toBeTruthy();
  });

  it('renders the message in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <PRBanner visible message="Heaviest Weight PR — 102.5 kg" onDismiss={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Heaviest Weight PR — 102.5 kg')).toBeTruthy();
  });

  it('renders nothing when not visible', async () => {
    await render(
      <ThemeProvider preference="dark">
        <PRBanner visible={false} message="Heaviest Weight PR — 102.5 kg" onDismiss={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Heaviest Weight PR — 102.5 kg')).toBeNull();
  });
});

describe('PRBanner — a11y (07 §9: "announced politely")', () => {
  it('exposes an alert role and a polite live region', async () => {
    await render(
      <ThemeProvider preference="dark">
        <PRBanner testID="pr-banner" visible message="Heaviest Weight PR — 102.5 kg" onDismiss={() => {}} />
      </ThemeProvider>,
    );
    const banner = screen.getByTestId('pr-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
  });
});

describe('PRBanner — auto-dismiss (04 §5.5/07 §5: "3 s")', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onDismiss after 3s by default', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <PRBanner visible message="Heaviest Weight PR — 102.5 kg" onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    expect(onDismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2999);
    expect(onDismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss before a custom durationMs elapses', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <PRBanner visible message="Best Estimated 1RM PR — 118.4 kg" onDismiss={onDismiss} durationMs={1000} />
      </ThemeProvider>,
    );

    jest.advanceTimersByTime(999);
    expect(onDismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not fire the auto-dismiss timer when not visible', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <PRBanner visible={false} message="Heaviest Weight PR — 102.5 kg" onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    jest.advanceTimersByTime(10000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('restarts the countdown when the message changes while still visible (rapid back-to-back PRs)', async () => {
    const onDismiss = jest.fn();
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <PRBanner visible message="Heaviest Weight PR — 100 kg" onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    jest.advanceTimersByTime(2000);
    expect(onDismiss).not.toHaveBeenCalled();

    await rerender(
      <ThemeProvider preference="dark">
        <PRBanner visible message="Best Set Volume PR — 600 kg" onDismiss={onDismiss} />
      </ThemeProvider>,
    );

    // If the timer hadn't restarted, only 1000ms would remain from the
    // first message's own 3s window and this would already have fired.
    jest.advanceTimersByTime(2000);
    expect(onDismiss).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
