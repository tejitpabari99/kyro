/**
 * `useRestTimerTicker` tests (M2-10) — mirrors `useWorkoutStopwatch.test.ts`'s
 * pattern: fake timers, asserting the 250 ms tick cadence and that it is
 * genuinely inert (no interval registered at all) while `active` is false.
 */
import { act, renderHook } from '@testing-library/react-native';

import { useRestTimerTicker } from '../useRestTimerTicker';

describe('useRestTimerTicker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ticks every 250ms while active', async () => {
    const { result } = await renderHook(({ active }: { active: boolean }) => useRestTimerTicker(active), {
      initialProps: { active: true },
    });
    const first = result.current;

    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBeGreaterThan(first);

    const second = result.current;
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBeGreaterThan(second);
  });

  it('does not tick while inactive — `now` never moves regardless of elapsed time', async () => {
    const { result } = await renderHook(({ active }: { active: boolean }) => useRestTimerTicker(active), {
      initialProps: { active: false },
    });
    const first = result.current;

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(first);
  });

  it('starts ticking once flipped from inactive to active, and stops again once flipped back', async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useRestTimerTicker(active), {
      initialProps: { active: false },
    });

    await act(async () => {
      rerender({ active: true });
    });

    const whileActive = result.current;
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBeGreaterThan(whileActive);

    await act(async () => {
      rerender({ active: false });
    });
    const afterDeactivate = result.current;
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    // Once deactivated again, further elapsed time must not move `now`.
    expect(result.current).toBe(afterDeactivate);
  });
});
