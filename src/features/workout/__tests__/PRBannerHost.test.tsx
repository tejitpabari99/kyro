/**
 * `PRBannerHost` tests (M4-10) — proves the `prBannerStore` <-> `ui/PRBanner`
 * wiring in isolation from the full `ActiveWorkoutScreen`/`ConnectedSetRow`
 * check flow (that integration is `ActiveWorkoutScreen.pr-banner.test.tsx`'s
 * job).
 */
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import { PRBannerHost } from '../PRBannerHost';
import { usePRBannerStore } from '../prBannerStore';

beforeEach(() => {
  usePRBannerStore.getState().dismiss();
});

describe('PRBannerHost', () => {
  it('renders nothing while prBannerStore.message is null', async () => {
    await render(
      <ThemeProvider preference="dark">
        <PRBannerHost testID="host" />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('host')).toBeNull();
  });

  it('defaults testID to "pr-banner-host" when the caller omits it', async () => {
    await render(
      <ThemeProvider preference="dark">
        <PRBannerHost />
      </ThemeProvider>,
    );
    await act(async () => {
      usePRBannerStore.getState().show('Heaviest Weight PR — 102.5 kg');
    });
    expect(screen.getByTestId('pr-banner-host')).toBeTruthy();
  });

  it('renders the banner with the store message once show() is called, and clears it on dismiss', async () => {
    await render(
      <ThemeProvider preference="dark">
        <PRBannerHost testID="host" />
      </ThemeProvider>,
    );

    await act(async () => {
      usePRBannerStore.getState().show('Heaviest Weight PR — 102.5 kg');
    });

    expect(screen.getByTestId('host')).toBeTruthy();
    expect(screen.getByText('Heaviest Weight PR — 102.5 kg')).toBeTruthy();

    await act(async () => {
      usePRBannerStore.getState().dismiss();
    });

    expect(screen.queryByTestId('host')).toBeNull();
  });

  it('wires PRBanner\'s own onDismiss through to prBannerStore.dismiss() (its 3s auto-dismiss clears the store, not just the local prop)', async () => {
    jest.useFakeTimers();
    try {
      await render(
        <ThemeProvider preference="dark">
          <PRBannerHost testID="host" />
        </ThemeProvider>,
      );

      await act(async () => {
        usePRBannerStore.getState().show('Heaviest Weight PR — 102.5 kg');
      });
      expect(screen.getByTestId('host')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(usePRBannerStore.getState().message).toBeNull();
      expect(screen.queryByTestId('host')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
