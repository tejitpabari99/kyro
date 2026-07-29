/**
 * `useForegroundReconciliation` tests (M2-13, 06 §5.4).
 *
 * `reconcileExpiredRestTimerOnForeground` is tested directly against the
 * real `useRestTimerStore` singleton (seeded via `setState`, same technique
 * `GlobalWorkoutBar.test.tsx` uses) — no native mocking needed since
 * `restTimerStore.complete()` itself only calls `cancelNotification` when
 * the timer being cleared actually has a `notificationId`, and every case
 * below uses `notificationId: null`.
 *
 * `useForegroundReconciliation`'s own `AppState` wiring is covered
 * separately and lightly: `AppState.addEventListener` has no public way to
 * *simulate* a native state change under Jest (there is no native
 * `NativeAppState` module linked, and the real class exposes no `.emit()`
 * escape hatch) — so `AppState.addEventListener` itself is spied on to
 * capture the handler this hook registers, and that captured handler is
 * invoked directly, mirroring how this repo already tests other
 * subscribe/unsubscribe native-lifecycle glue by capturing the callback a
 * mocked API was handed rather than trying to simulate the real native
 * event pipeline.
 *
 * **Every `act()` call below is `await act(async () => {...})`, never a bare
 * sync `act(() => {...})`** — a bare one here was observed (while writing
 * this suite) to corrupt React's act-queue bookkeeping badly enough that a
 * *later* test's own `unmount()` silently stopped calling its effect's
 * cleanup at all (full-file run only; each test alone was fine) — the same
 * class of cross-test corruption `ActiveWorkoutScreen.test.tsx`'s own header
 * documents and fixes the identical way.
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import {
  reconcileExpiredRestTimerOnForeground,
  useForegroundReconciliation,
} from '../useForegroundReconciliation';
import { useRestTimerStore } from '../restTimerStore';

let capturedHandler: ((state: AppStateStatus) => void) | undefined;
const removeSpy = jest.fn();

beforeEach(() => {
  capturedHandler = undefined;
  removeSpy.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    capturedHandler = handler as (state: AppStateStatus) => void;
    return { remove: removeSpy } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  useRestTimerStore.setState({ timer: null, permissionDeniedNoticePending: false });
});

describe('reconcileExpiredRestTimerOnForeground (M2-13, 06 §5.4)', () => {
  it('silently completes a timer whose endsAt has already passed', () => {
    const now = Date.now();
    useRestTimerStore.setState({
      timer: { endsAt: now - 5_000, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    reconcileExpiredRestTimerOnForeground(now);

    expect(useRestTimerStore.getState().timer).toBeNull();
  });

  it('completes a timer whose endsAt is exactly now (boundary)', () => {
    const now = Date.now();
    useRestTimerStore.setState({
      timer: { endsAt: now, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    reconcileExpiredRestTimerOnForeground(now);

    expect(useRestTimerStore.getState().timer).toBeNull();
  });

  it('leaves a still-running timer untouched', () => {
    const now = Date.now();
    useRestTimerStore.setState({
      timer: { endsAt: now + 30_000, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    reconcileExpiredRestTimerOnForeground(now);

    expect(useRestTimerStore.getState().timer).not.toBeNull();
    expect(useRestTimerStore.getState().timer?.endsAt).toBe(now + 30_000);
  });

  it('is a no-op when no timer is running', () => {
    useRestTimerStore.setState({ timer: null });

    expect(() => reconcileExpiredRestTimerOnForeground()).not.toThrow();
    expect(useRestTimerStore.getState().timer).toBeNull();
  });
});

describe('useForegroundReconciliation (M2-13, 06 §5.4) — AppState wiring', () => {
  it('registers a "change" listener on mount', async () => {
    await renderHook(() => useForegroundReconciliation());
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(capturedHandler).toBeInstanceOf(Function);
  });

  it('reconciles an expired timer when the captured handler fires with "active"', async () => {
    const now = Date.now();
    useRestTimerStore.setState({
      timer: { endsAt: now - 1_000, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    await renderHook(() => useForegroundReconciliation());

    await act(async () => {
      capturedHandler?.('background');
      capturedHandler?.('active');
    });

    expect(useRestTimerStore.getState().timer).toBeNull();
  });

  it('does not reconcile on a transition to a non-active state', async () => {
    const now = Date.now();
    useRestTimerStore.setState({
      timer: { endsAt: now - 1_000, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    await renderHook(() => useForegroundReconciliation());

    await act(async () => {
      capturedHandler?.('background');
    });

    expect(useRestTimerStore.getState().timer).not.toBeNull();
  });

  it('unsubscribes (calls the subscription\'s own .remove()) on unmount', async () => {
    const { unmount } = await renderHook(() => useForegroundReconciliation());
    expect(removeSpy).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
