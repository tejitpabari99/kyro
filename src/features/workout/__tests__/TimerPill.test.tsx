/**
 * `TimerPill`/`RestTimerPermissionNotice` behavioral tests (M2-11 acceptance
 * gate: "RNTL: pill renders countdown from store, ±15/skip dispatch; sheet
 * opens from pill.").
 *
 * Mirrors `GlobalWorkoutBar.test.tsx` (M2-13)'s own conventions: seeds
 * `useRestTimerStore`/`useSettingsStore` directly via `setState` (this
 * component only ever reads `restTimerStore`, dispatching through its
 * existing `adjust`/`skip`/`complete` actions — never a raw DB/repository
 * round trip), fake timers so `useRestTimerTicker`'s `setInterval` can be
 * driven deterministically, and every singleton reset in `afterEach` so no
 * state leaks into other test files sharing these same module-level stores.
 *
 * `@/lib/haptics`/`@/lib/sound` are mocked per 08 §5's native-seam
 * convention (both are true native seams — `expo-haptics`/`expo-audio` —
 * unavailable under Jest; see each module's own file header).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import React from 'react';
import { StyleSheet } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { SETTINGS_DEFAULTS } from '@/data/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { selection, timerComplete } from '@/lib/haptics';
import { playTimerChime } from '@/lib/sound';
import { ThemeProvider } from '@/ui/theme-provider';
import { colors } from '@/ui/tokens';

import { RestTimerPermissionNotice, TimerPill } from '../TimerPill';
import { useRestTimerStore } from '../restTimerStore';

jest.mock('@/lib/haptics');
jest.mock('@/lib/sound');
// M2-11 review fix: `RestTimerPermissionNotice`'s "Open Settings" action —
// `expo-linking` is a true native seam, mocked per 08 §5's convention
// (same shape `NoteText.test.tsx` already uses for this exact module).
jest.mock('expo-linking', () => ({
  openSettings: jest.fn(() => Promise.resolve()),
}));
// `adjust`/`skip`/`complete` (restTimerStore, exercised here through the
// pill's own dispatch) call through to `@/lib/notifications` — a true
// native seam (`expo-notifications`), mocked per 08 §5's convention. Left
// unmocked, its real "module unavailable" catch path leaves a dangling
// async chain that was observed (while writing this suite) to corrupt a
// *later* test's own render in this same file — the identical class of
// bug `ActiveWorkoutScreen.test.tsx`/`GlobalWorkoutBar.test.tsx`'s own
// headers document for bare `act()` calls, traced here to this specific
// unmocked seam instead.
jest.mock('@/lib/notifications');

function renderPill() {
  return render(
    <ThemeProvider preference="dark">
      <TimerPill testID="pill" />
    </ThemeProvider>,
  );
}

function renderNotice() {
  return render(
    <ThemeProvider preference="dark">
      <RestTimerPermissionNotice testID="notice" />
    </ThemeProvider>,
  );
}

function seedTimer(remainingMs: number, overrides: Partial<{ setId: string }> = {}) {
  const now = Date.now();
  useRestTimerStore.setState({
    timer: {
      endsAt: now + remainingMs,
      exerciseId: 'ex1',
      setId: overrides.setId ?? 'set1',
      notificationId: null,
    },
  });
  return now;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  useRestTimerStore.setState({ timer: null, permissionDeniedNoticePending: false });
  useSettingsStore.setState({ settings: SETTINGS_DEFAULTS });
});

describe('TimerPill (M2-11)', () => {
  it('renders nothing when no timer is running', async () => {
    const result = await renderPill();
    expect(result.toJSON()).toBeNull();
  });

  it('renders the countdown from the store', async () => {
    seedTimer(90_000);
    await renderPill();
    expect(screen.getByTestId('pill-remaining')).toHaveTextContent('1:30');
  });

  it('ticks the countdown downward', async () => {
    seedTimer(10_000);
    await renderPill();
    expect(screen.getByTestId('pill-remaining')).toHaveTextContent('0:10');

    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.getByTestId('pill-remaining')).toHaveTextContent('0:06');
  });

  it('-15s dispatches restTimerStore.adjust(-15) and fires the selection haptic', async () => {
    seedTimer(60_000);
    await renderPill();

    await fireEvent.press(screen.getByTestId('pill-minus15'));

    expect(selection).toHaveBeenCalledTimes(1);
    const remaining = useRestTimerStore.getState().timer!.endsAt - Date.now();
    expect(Math.round(remaining / 1000)).toBe(45);
  });

  it('+15s dispatches restTimerStore.adjust(+15) and fires the selection haptic', async () => {
    seedTimer(60_000);
    await renderPill();

    await fireEvent.press(screen.getByTestId('pill-plus15'));

    expect(selection).toHaveBeenCalledTimes(1);
    const remaining = useRestTimerStore.getState().timer!.endsAt - Date.now();
    expect(Math.round(remaining / 1000)).toBe(75);
  });

  it('Skip dispatches restTimerStore.skip() and fires the selection haptic', async () => {
    seedTimer(60_000);
    await renderPill();

    await fireEvent.press(screen.getByTestId('pill-skip'));

    expect(selection).toHaveBeenCalledTimes(1);
    expect(useRestTimerStore.getState().timer).toBeNull();
  });

  it('tapping the pill opens the full-screen sheet, which shows the same controls', async () => {
    seedTimer(45_000);
    await renderPill();

    expect(screen.queryByTestId('pill-sheet-content')).toBeNull();

    await fireEvent.press(screen.getByTestId('pill-open'));

    expect(await screen.findByTestId('pill-sheet-remaining')).toHaveTextContent('0:45');
    expect(screen.getByTestId('pill-sheet-minus15')).toBeTruthy();
    expect(screen.getByTestId('pill-sheet-skip')).toBeTruthy();
    expect(screen.getByTestId('pill-sheet-plus15')).toBeTruthy();
  });

  it('the sheet dismisses via its own scrim (Sheet.tsx convention)', async () => {
    seedTimer(45_000);
    await renderPill();

    await fireEvent.press(screen.getByTestId('pill-open'));
    expect(await screen.findByTestId('pill-sheet-remaining')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('pill-sheet-scrim'));
    expect(screen.queryByTestId('pill-sheet-remaining')).toBeNull();
  });

  it('sheet controls (+15s) dispatch the same store action as the pill controls', async () => {
    seedTimer(60_000);
    await renderPill();
    await fireEvent.press(screen.getByTestId('pill-open'));
    await screen.findByTestId('pill-sheet-remaining');

    await fireEvent.press(screen.getByTestId('pill-sheet-plus15'));
    const remaining = useRestTimerStore.getState().timer!.endsAt - Date.now();
    expect(Math.round(remaining / 1000)).toBe(75);
  });

  it('natural foreground completion: calls complete(), fires timerComplete haptic + playTimerChime with the live sounds setting, and the pill collapses', async () => {
    useSettingsStore.setState({
      settings: {
        ...SETTINGS_DEFAULTS,
        sounds: { ...SETTINGS_DEFAULTS.sounds, timer_sound: 'bell', timer_volume: 'high' },
      },
    });
    seedTimer(4_000);
    await renderPill();
    expect(screen.getByTestId('pill-remaining')).toHaveTextContent('0:04');

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(timerComplete).toHaveBeenCalledTimes(1);
    expect(playTimerChime).toHaveBeenCalledWith('bell', 'high');
    expect(screen.queryByTestId('pill')).toBeNull();
  });

  it('does not fire the completion chime/haptic more than once for the same timer', async () => {
    seedTimer(2_000);
    await renderPill();

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });

    expect(timerComplete).toHaveBeenCalledTimes(1);
    expect(playTimerChime).toHaveBeenCalledTimes(1);
  });

  it('a brand-new timer (different setId) after a previous one completes gets its own fresh full ring, not a stale sheet-open flag', async () => {
    seedTimer(2_000, { setId: 'set1' });
    await renderPill();
    await fireEvent.press(screen.getByTestId('pill-open'));
    await screen.findByTestId('pill-sheet-remaining');

    await act(async () => {
      jest.advanceTimersByTime(2_500);
    });
    expect(useRestTimerStore.getState().timer).toBeNull();

    await act(async () => {
      seedTimer(30_000, { setId: 'set2' });
    });

    // The new timer's own pill renders again, with its own countdown — and
    // critically, its sheet is NOT already open (no stale `sheetVisible`
    // carried over from the previous, now-completed timer instance).
    expect(await screen.findByTestId('pill-remaining')).toHaveTextContent('0:30');
    expect(screen.queryByTestId('pill-sheet-remaining')).toBeNull();
  });

  // M2-18 (08 §6 flow 7): the dev-only debug hook Maestro's semi-manual
  // notification-scheduling flow reads — see `TimerPill.tsx`'s own file
  // header for why this mirrors `notificationId` rather than reaching into
  // `expo-notifications` directly.
  describe('debug notification-id hook (M2-18, __DEV__ only)', () => {
    it('shows the store timer.notificationId when set', async () => {
      const now = Date.now();
      useRestTimerStore.setState({
        timer: { endsAt: now + 60_000, exerciseId: 'ex1', setId: 'set1', notificationId: 'notif-abc123' },
      });
      await renderPill();
      expect(screen.getByTestId('pill-debug-notification-id')).toHaveTextContent('notif-abc123');
    });

    it('shows "none" when the timer has no notificationId (permission denied/module unavailable)', async () => {
      seedTimer(60_000); // seedTimer's own fixture always sets notificationId: null
      await renderPill();
      expect(screen.getByTestId('pill-debug-notification-id')).toHaveTextContent('none');
    });

    it('is not rendered when __DEV__ is false', async () => {
      const original = __DEV__;
      // @ts-expect-error — `__DEV__` is a read-only ambient global in its type declaration, same override pattern `app/(tabs)/profile/__tests__/index.test.tsx` already uses for this exact guard.
      __DEV__ = false;
      try {
        seedTimer(60_000);
        await renderPill();
        expect(screen.queryByTestId('pill-debug-notification-id')).toBeNull();
      } finally {
        // @ts-expect-error — see above.
        __DEV__ = original;
      }
    });
  });
});

describe('TimerPill — bottom panel redesign (PRD J)', () => {
  it('panel is edge-to-edge and its bottom padding includes the live safe-area inset', async () => {
    seedTimer(60_000);
    await render(
      <SafeAreaInsetsContext.Provider value={{ top: 0, right: 0, bottom: 34, left: 0 }}>
        <ThemeProvider preference="dark">
          <TimerPill testID="pill" />
        </ThemeProvider>
      </SafeAreaInsetsContext.Provider>,
    );
    const flatStyle = StyleSheet.flatten(screen.getByTestId('pill').props.style);
    expect(flatStyle.left).toBe(0);
    expect(flatStyle.right).toBe(0);
    expect(flatStyle.bottom).toBe(0);
    expect(flatStyle.paddingBottom).toBe(34);
  });

  it('renders the panel controls in Hevy order: -15, +15, Skip', async () => {
    seedTimer(60_000);
    await renderPill();
    const orderedIds = screen
      .getAllByRole('button')
      .map((el) => el.props.testID)
      .filter((id): id is string => typeof id === 'string' && !id.includes('sheet'));
    expect(orderedIds.indexOf('pill-minus15')).toBeLessThan(orderedIds.indexOf('pill-plus15'));
    expect(orderedIds.indexOf('pill-plus15')).toBeLessThan(orderedIds.indexOf('pill-skip'));
  });

  it.each(['dark', 'light'] as const)(
    'Skip is filled with semantic.info / text semantic.onInfo in %s theme',
    async (theme) => {
      seedTimer(60_000);
      await render(
        <ThemeProvider preference={theme}>
          <TimerPill testID="pill" />
        </ThemeProvider>,
      );
      const skip = screen.getByTestId('pill-skip');
      expect(StyleSheet.flatten(skip.props.style).backgroundColor).toBe(
        colors[theme].semantic.info,
      );
      const skipLabel = within(skip).getByText('Skip');
      expect(StyleSheet.flatten(skipLabel.props.style).color).toBe(
        colors[theme].semantic.onInfo,
      );
    },
  );

  // Open Questions #3: the spec's literal mechanics asserted on
  // `StyleSheet.flatten(pill.props.style).transform` directly, on the
  // assumption that a settled Reanimated animation gets synced back onto the
  // host component's own `style` prop. Running this under this repo's actual
  // `react-native-reanimated` 4.x Jest fallback shows that sync path
  // (`AnimatedComponent`'s `FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS`
  // branch) never fires under Jest — it depends on
  // `PropsRegistryGarbageCollector` registering a *real* native view tag,
  // which the JS/web fallback never produces (always `-1`), so `props.style`
  // itself never picks up the resolved `transform`. Reanimated's own
  // `jestUtils` module ships `getAnimatedStyle(component)` for exactly this
  // — it reads the same `jestAnimatedStyle`/`jestInlineStyle` bookkeeping
  // props the fallback *does* populate on every `AnimatedComponent` instance
  // under Jest, merged the same way the package's own `toHaveAnimatedStyle`
  // matcher does internally. Swapped in below in place of
  // `StyleSheet.flatten(...).props.style` for the animated `transform`
  // check; the 300ms timer advances (comfortably past the real 250ms
  // `withTiming` duration) and the reset-then-settle behavioral assertions
  // are otherwise unchanged from the spec.
  it('a new timer (different setId) re-triggers the entrance animation while the panel stays visible', async () => {
    seedTimer(10_000, { setId: 'set1' });
    await renderPill();
    await act(async () => {
      jest.advanceTimersByTime(300); // let the first entrance settle past 250ms
    });
    expect(getAnimatedStyle(screen.getByTestId('pill')).transform).toEqual([
      { translateY: 0 },
    ]);

    await act(async () => {
      seedTimer(30_000, { setId: 'set2' });
    });
    expect(getAnimatedStyle(screen.getByTestId('pill')).transform).toEqual([
      { translateY: 220 },
    ]);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(getAnimatedStyle(screen.getByTestId('pill')).transform).toEqual([
      { translateY: 0 },
    ]);
  });
});

describe('RestTimerPermissionNotice (M2-11, 02 §16.9)', () => {
  it('renders nothing when no permission-denied notice is pending', async () => {
    const result = await renderNotice();
    expect(result.toJSON()).toBeNull();
  });

  it('renders the warning when pending, and dismissing clears the store flag', async () => {
    useRestTimerStore.setState({ permissionDeniedNoticePending: true });
    await renderNotice();

    expect(screen.getByTestId('notice')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    expect(useRestTimerStore.getState().permissionDeniedNoticePending).toBe(false);
  });

  // M2-11 review fix: 02 §16.9's literal text is "one-time inline warning
  // on first timer start **with link to iOS Settings**" — the initial
  // landing rendered only the message, with no way to act on it. Verifies
  // the "Open Settings" action both opens Settings and dismisses the
  // notice (Snackbar's own `handleAction`: `onAction` then `onDismiss`).
  it('"Open Settings" action opens Settings and dismisses the notice', async () => {
    useRestTimerStore.setState({ permissionDeniedNoticePending: true });
    await renderNotice();

    await fireEvent.press(screen.getByText('Open Settings'));

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(useRestTimerStore.getState().permissionDeniedNoticePending).toBe(false);
  });
});
