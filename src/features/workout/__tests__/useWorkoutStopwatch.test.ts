/**
 * `useWorkoutStopwatch` tests (M2-05) — the 1 s ticking behavior, pause
 * freezing elapsed, resume persisting the accumulated offset (returned for
 * the caller to `updateMeta`), and the retro-log "paused at 0" seed.
 *
 * Every state-mutating step (`jest.advanceTimersByTime`, `pause()`,
 * `resume()`) runs inside `await act(async () => { ... })` — React 19's
 * `act` schedules the resulting update as a microtask even for a
 * synchronous callback body, so a bare synchronous `act(() => {...})` here
 * logs "act(async () => ...) without await" and leaves `result.current`
 * stale for the *next* assertion (confirmed by reproducing it while writing
 * this suite) — awaiting every one avoids that class of flake entirely.
 */
import { act, renderHook } from '@testing-library/react-native';

import { useWorkoutStopwatch } from '../useWorkoutStopwatch';

describe('useWorkoutStopwatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('elapsedMs starts at ~0 and ticks up every second while running', async () => {
    const startTime = Date.now();
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 0 }),
    );

    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.isPaused).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.elapsedMs).toBe(3000);
  });

  it('subtracts durationPauseOffsetMs from elapsed', async () => {
    const startTime = Date.now() - 10_000; // 10s ago
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 4000 }),
    );
    expect(result.current.elapsedMs).toBe(6000);
  });

  it('pause() freezes elapsed — further ticks do not move it', async () => {
    const startTime = Date.now() - 5000;
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 0 }),
    );
    expect(result.current.elapsedMs).toBe(5000);

    await act(async () => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);
    const frozen = result.current.elapsedMs;

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.elapsedMs).toBe(frozen);
  });

  it('resume() returns the accumulated offset and un-freezes ticking', async () => {
    const startTime = Date.now() - 5000;
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 0 }),
    );

    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000); // paused for 2s
    });

    let nextOffset = -1;
    await act(async () => {
      nextOffset = result.current.resume();
    });
    // ~2000ms paused duration accumulated into the offset.
    expect(nextOffset).toBeGreaterThanOrEqual(1900);
    expect(nextOffset).toBeLessThanOrEqual(2100);
    expect(result.current.isPaused).toBe(false);

    const elapsedRightAfterResume = result.current.elapsedMs;
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.elapsedMs).toBeGreaterThan(elapsedRightAfterResume);
  });

  it('resume() while already running is a no-op that returns the current offset', async () => {
    const startTime = Date.now();
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 1234 }),
    );
    let returned = -1;
    await act(async () => {
      returned = result.current.resume();
    });
    expect(returned).toBe(1234);
    expect(result.current.isPaused).toBe(false);
  });

  it('retro mode (initiallyPaused) starts frozen at elapsed 0', async () => {
    const startTime = Date.now() - 999_999; // "chosen date" far in the past
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 0, initiallyPaused: true }),
    );
    expect(result.current.isPaused).toBe(true);
    expect(result.current.elapsedMs).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.elapsedMs).toBe(0);
  });

  it('calling pause() twice keeps the first freeze point', async () => {
    const startTime = Date.now() - 1000;
    const { result } = await renderHook(() =>
      useWorkoutStopwatch({ startTime, durationPauseOffsetMs: 0 }),
    );
    await act(async () => {
      result.current.pause();
    });
    const first = result.current.elapsedMs;
    await act(async () => {
      jest.advanceTimersByTime(500);
      result.current.pause();
    });
    expect(result.current.elapsedMs).toBe(first);
  });
});
