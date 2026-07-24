/**
 * `restTimerStore` tests (M2-10 acceptance gate, 08 §4.10) — fake timers +
 * a mocked `expo-notifications` module (via `@/lib/notifications`'s manual
 * mock, `src/lib/__mocks__/notifications.ts`). Every named case from 08
 * §4.10 / this task's own "How":
 *
 *  - endsAt math across background gaps
 *  - ±15 s clamps: min floors remaining at 0 (finishes), max unbounded
 *  - skip clears notification id
 *  - next-set-same-exercise-dropset suppression (`shouldStartRestTimer`)
 *  - uncheck cancels only its own timer (`cancelForSet`)
 *  - notification scheduling calls match `endsAt` after each adjustment
 *  - kill/relaunch within window restores remaining
 *  - after `endsAt` -> no timer, no duplicate notification
 *
 * `@sentry/react-native` is mocked wholesale for the same reason
 * `activeWorkoutStore.test.ts` documents: `restTimerStore.ts` imports
 * `@/lib/sentry`, and the real SDK registers a leaking `setInterval` at
 * module-load time otherwise.
 */
import { createMemoryKvStore } from '@/lib/kv-store';
import {
  cancelNotification,
  requestNotificationPermission,
  scheduleRestNotification,
} from '@/lib/notifications';

import { createRestTimerStore, shouldStartRestTimer, type StartRestTimerParams } from '../restTimerStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('@/lib/notifications');

const mockRequestPermission = requestNotificationPermission as jest.MockedFunction<
  typeof requestNotificationPermission
>;
const mockSchedule = scheduleRestNotification as jest.MockedFunction<typeof scheduleRestNotification>;
const mockCancel = cancelNotification as jest.MockedFunction<typeof cancelNotification>;

/** Every `StartRestTimerParams` field pre-filled with a sane default — individual tests override only what they care about. */
function startParams(overrides: Partial<StartRestTimerParams> = {}): StartRestTimerParams {
  return {
    exerciseId: 'exercise-1',
    setId: 'set-1',
    durationSeconds: 90,
    exerciseName: 'Bench Press',
    setNumber: 1,
    notificationsEnabled: true,
    soundChoice: 'default',
    volume: 'normal',
    ...overrides,
  };
}

describe('restTimerStore (M2-10, 08 §4.10)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRequestPermission.mockReset().mockResolvedValue('granted');
    mockSchedule.mockReset();
    mockCancel.mockReset().mockResolvedValue(undefined);
    let nextId = 0;
    mockSchedule.mockImplementation(async () => `notif-${++nextId}`);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------
  // endsAt math across background gaps
  // ---------------------------------------------------------------------
  describe('endsAt math across background gaps', () => {
    it('endsAt = now + duration at start, independent of any later wall-clock jump', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;

      await store.getState().start(startParams({ durationSeconds: 90, now: t0 }));

      expect(store.getState().timer?.endsAt).toBe(t0 + 90_000);

      // "Background gap": the app is backgrounded and time passes with no
      // ticks at all (no interval firing) — endsAt is an absolute
      // timestamp, so remaining computed *after* the gap is exactly
      // `endsAt - laterNow`, never drifted by however long the gap was.
      const afterGap = t0 + 61_000; // 61s elapsed while "backgrounded"
      const remaining = Math.max(0, store.getState().timer!.endsAt - afterGap);
      expect(remaining).toBe(29_000);
    });

    it('a long background gap past endsAt yields zero remaining (finished), computed the same way', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 30, now: t0 }));

      const afterGap = t0 + 120_000; // way past endsAt
      const remaining = Math.max(0, store.getState().timer!.endsAt - afterGap);
      expect(remaining).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // ±15s clamps
  // ---------------------------------------------------------------------
  describe('±15s clamps (min floors remaining at 0 / finishes, max unbounded)', () => {
    it('+15s is unbounded — repeated extends keep pushing endsAt out with no cap', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 30, now: t0 }));
      const initialEndsAt = store.getState().timer!.endsAt;

      for (let i = 1; i <= 20; i++) {
        await store.getState().adjust(15, t0);
      }

      // 20 * 15s = 300s added, no clamp anywhere along the way.
      expect(store.getState().timer!.endsAt).toBe(initialEndsAt + 20 * 15_000);
      expect(store.getState().timer).not.toBeNull();
    });

    it('-15s shortens normally when remaining stays above zero', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 90, now: t0 }));
      const initialEndsAt = store.getState().timer!.endsAt;

      await store.getState().adjust(-15, t0);

      expect(store.getState().timer!.endsAt).toBe(initialEndsAt - 15_000);
      expect(store.getState().timer).not.toBeNull();
    });

    it('-15s that would take remaining to/below zero finishes the timer outright (floors at 0)', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      // 10s remaining — a -15s adjustment would go negative.
      await store.getState().start(startParams({ durationSeconds: 10, now: t0 }));
      expect(store.getState().timer).not.toBeNull();

      await store.getState().adjust(-15, t0);

      expect(store.getState().timer).toBeNull();
    });

    it('-15s exactly at the boundary (remaining === 15s) also finishes (floor is inclusive of 0)', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 15, now: t0 }));

      await store.getState().adjust(-15, t0);

      expect(store.getState().timer).toBeNull();
    });

    it('adjust() is a no-op when no timer is running', async () => {
      const store = createRestTimerStore();
      await store.getState().adjust(15, 1_000_000);
      expect(store.getState().timer).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // skip clears notification id
  // ---------------------------------------------------------------------
  describe('skip', () => {
    it('cancels the pending notification and clears the timer (notification id gone)', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ now: t0 }));
      const notificationId = store.getState().timer!.notificationId!;
      expect(notificationId).toBeTruthy();

      await store.getState().skip();

      expect(mockCancel).toHaveBeenCalledWith(notificationId);
      expect(store.getState().timer).toBeNull();
    });

    it('skip() is a no-op when no timer is running', async () => {
      const store = createRestTimerStore();
      await store.getState().skip();
      expect(mockCancel).not.toHaveBeenCalled();
      expect(store.getState().timer).toBeNull();
    });

    it('skip() with no scheduled notification (permission denied) still clears the timer without calling cancel', async () => {
      mockRequestPermission.mockResolvedValue('denied');
      const store = createRestTimerStore();
      await store.getState().start(startParams({ now: 1_000_000 }));
      expect(store.getState().timer!.notificationId).toBeNull();

      await store.getState().skip();

      expect(mockCancel).not.toHaveBeenCalled();
      expect(store.getState().timer).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // next-set-same-exercise-dropset suppression
  // ---------------------------------------------------------------------
  describe('shouldStartRestTimer — start rules (02 §7)', () => {
    it('starts when restSeconds is set and the next row is not a dropset', () => {
      expect(shouldStartRestTimer({ restSeconds: 90, nextSetType: 'normal' })).toBe(true);
    });

    it('starts when this is the exercise\'s last row (no next row at all)', () => {
      expect(shouldStartRestTimer({ restSeconds: 90, nextSetType: null })).toBe(true);
    });

    it('suppresses when the timer setting is Off (restSeconds null)', () => {
      expect(shouldStartRestTimer({ restSeconds: null, nextSetType: 'normal' })).toBe(false);
    });

    it('suppresses when restSeconds is 0 (defensive — the wheel picker never produces this, but Off must never start a timer)', () => {
      expect(shouldStartRestTimer({ restSeconds: 0, nextSetType: 'normal' })).toBe(false);
    });

    it('suppresses when the next row (same exercise, next index) is a dropset', () => {
      expect(shouldStartRestTimer({ restSeconds: 90, nextSetType: 'dropset' })).toBe(false);
    });

    it('does not suppress for warmup/failure next rows — only dropset suppresses', () => {
      expect(shouldStartRestTimer({ restSeconds: 90, nextSetType: 'warmup' })).toBe(true);
      expect(shouldStartRestTimer({ restSeconds: 90, nextSetType: 'failure' })).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // uncheck cancels only its own timer
  // ---------------------------------------------------------------------
  describe('cancelForSet — uncheck cancels only its own timer', () => {
    it('cancels the running timer when it belongs to the given setId', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ setId: 'set-A', now: t0 }));
      const notificationId = store.getState().timer!.notificationId!;

      await store.getState().cancelForSet('set-A');

      expect(mockCancel).toHaveBeenCalledWith(notificationId);
      expect(store.getState().timer).toBeNull();
    });

    it('leaves a running timer untouched when the given setId does not own it', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ setId: 'set-A', now: t0 }));
      mockCancel.mockClear();

      await store.getState().cancelForSet('set-B');

      expect(mockCancel).not.toHaveBeenCalled();
      expect(store.getState().timer).not.toBeNull();
      expect(store.getState().timer!.setId).toBe('set-A');
    });

    it('is a no-op when no timer is running', async () => {
      const store = createRestTimerStore();
      await store.getState().cancelForSet('set-A');
      expect(mockCancel).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Only one timer at a time
  // ---------------------------------------------------------------------
  describe('only one timer at a time', () => {
    it('starting a new timer cancels and replaces whatever was running', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ setId: 'set-A', exerciseId: 'ex-A', now: t0 }));
      const firstNotificationId = store.getState().timer!.notificationId!;

      await store.getState().start(startParams({ setId: 'set-B', exerciseId: 'ex-B', now: t0 + 5_000 }));

      expect(mockCancel).toHaveBeenCalledWith(firstNotificationId);
      expect(store.getState().timer!.setId).toBe('set-B');
      expect(store.getState().timer!.exerciseId).toBe('ex-B');
    });
  });

  // ---------------------------------------------------------------------
  // Notification scheduling calls match endsAt after each adjustment
  // ---------------------------------------------------------------------
  describe('notification scheduling calls match endsAt after each adjustment', () => {
    it('start schedules with secondsFromNow matching the initial endsAt', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 90, now: t0 }));

      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ secondsFromNow: 90 }),
      );
    });

    it('+15s cancels the old notification and reschedules with the new endsAt-derived seconds', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 90, now: t0 }));
      const firstId = store.getState().timer!.notificationId!;
      mockSchedule.mockClear();

      await store.getState().adjust(15, t0);

      expect(mockCancel).toHaveBeenCalledWith(firstId);
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      const endsAt = store.getState().timer!.endsAt;
      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ secondsFromNow: Math.round((endsAt - t0) / 1000) }),
      );
      expect(endsAt - t0).toBe(105_000);
    });

    it('multiple +15s adjustments each reschedule against the freshly computed endsAt', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 30, now: t0 }));

      await store.getState().adjust(15, t0 + 1_000); // "1s later" — still well inside the window
      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ secondsFromNow: Math.round((store.getState().timer!.endsAt - (t0 + 1_000)) / 1000) }),
      );

      await store.getState().adjust(15, t0 + 2_000);
      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ secondsFromNow: Math.round((store.getState().timer!.endsAt - (t0 + 2_000)) / 1000) }),
      );

      expect(mockSchedule).toHaveBeenCalledTimes(3); // start + 2 adjusts
    });

    it('the reschedule notification body still names the original exercise/set (M2-10 meta cache)', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(
        startParams({ exerciseName: 'Squat', setNumber: 2, durationSeconds: 60, now: t0 }),
      );
      mockSchedule.mockClear();

      await store.getState().adjust(15, t0);

      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: expect.stringContaining('set 2 of Squat') }),
      );
    });

    // Review regression (M2-09/M2-10 review, item 1): `adjust()` used to
    // reschedule via `scheduleRestNotification` without passing
    // `soundChoice`/`volume` at all, because the closure-level `meta`
    // cache only ever carried `exerciseName`/`setNumber` — so a muted
    // timer sound was silently lost (defaulted to audible) on every ±15s
    // adjustment. `meta` must also carry the sound prefs `start()` itself
    // resolved, and every reschedule call must pass them through.
    it('adjust() reschedules with the same soundChoice/volume the timer was started with', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(
        startParams({ soundChoice: 'bell', volume: 'low', durationSeconds: 90, now: t0 }),
      );
      mockSchedule.mockClear();

      await store.getState().adjust(15, t0);

      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ soundChoice: 'bell', volume: 'low' }),
      );
    });

    it('adjust() reschedules muted (volume: "off") the same way the initial start was muted — the mute preference must survive an adjust', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(
        startParams({ soundChoice: 'none', volume: 'off', durationSeconds: 90, now: t0 }),
      );
      mockSchedule.mockClear();

      await store.getState().adjust(15, t0);

      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ soundChoice: 'none', volume: 'off' }),
      );
    });

    it('multiple successive adjustments each keep rescheduling with the original sound prefs, not just the first', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(
        startParams({ soundChoice: 'beep', volume: 'high', durationSeconds: 90, now: t0 }),
      );

      await store.getState().adjust(15, t0);
      await store.getState().adjust(-15, t0);
      await store.getState().adjust(15, t0);

      expect(mockSchedule).toHaveBeenCalledTimes(4); // start + 3 adjusts
      for (const call of mockSchedule.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({ soundChoice: 'beep', volume: 'high' }),
        );
      }
    });

    it('sound prefs also survive a restore() (kill/relaunch) so a post-relaunch adjust() still reschedules muted correctly', async () => {
      const kv = createMemoryKvStore();
      const liveStore = createRestTimerStore();
      const t0 = 1_000_000;
      await liveStore.getState().restore(kv, t0);
      await liveStore.getState().start(
        startParams({ soundChoice: 'none', volume: 'off', durationSeconds: 90, now: t0 }),
      );

      const relaunchedStore = createRestTimerStore();
      const relaunchNow = t0 + 10_000;
      await relaunchedStore.getState().restore(kv, relaunchNow);
      mockSchedule.mockClear();

      await relaunchedStore.getState().adjust(15, relaunchNow);

      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ soundChoice: 'none', volume: 'off' }),
      );
    });
  });

  // ---------------------------------------------------------------------
  // Review regression (M2-09/M2-10 review, item 2): `scheduleRestNotification`
  // can throw (native module unavailable — see `src/lib/notifications.ts`'s
  // own header). `start()`'s only real call site (`ConnectedSetRow.tsx`) is
  // fire-and-forget with no `.catch()`, so a throw here must never reject
  // `start()`'s own promise — it must degrade to in-app-only (notificationId
  // null), same posture as a denied OS permission.
  // ---------------------------------------------------------------------
  describe('start() gracefully degrades if scheduleRestNotification throws', () => {
    it('start() still resolves with a timer (notificationId null) instead of rejecting when scheduling throws', async () => {
      mockSchedule.mockRejectedValueOnce(
        new Error('scheduleRestNotification: expo-notifications native module unavailable.'),
      );
      const store = createRestTimerStore();

      await expect(
        store.getState().start(startParams({ now: 1_000_000 })),
      ).resolves.toBeUndefined();

      expect(store.getState().timer).not.toBeNull();
      expect(store.getState().timer!.notificationId).toBeNull();
    });

    it('the in-app timer still runs normally after a scheduling failure — endsAt/exerciseId/setId are all still set', async () => {
      mockSchedule.mockRejectedValueOnce(new Error('native module unavailable'));
      const store = createRestTimerStore();
      const t0 = 1_000_000;

      await store.getState().start(
        startParams({ exerciseId: 'ex-1', setId: 'set-1', durationSeconds: 60, now: t0 }),
      );

      expect(store.getState().timer).toEqual({
        endsAt: t0 + 60_000,
        exerciseId: 'ex-1',
        setId: 'set-1',
        notificationId: null,
      });
    });

    it('a subsequent adjust() after a scheduling failure does not try to reschedule (no live notification to reschedule)', async () => {
      mockSchedule.mockRejectedValueOnce(new Error('native module unavailable'));
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ durationSeconds: 90, now: t0 }));
      mockSchedule.mockClear();

      await store.getState().adjust(15, t0);

      expect(mockSchedule).not.toHaveBeenCalled();
      expect(store.getState().timer!.notificationId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Review regression (M2-09/M2-10 review, item 3): `complete()` had zero
  // test coverage. It's the public hook point M2-11's rest-timer UI will
  // call on foreground natural completion — these tests cover its actual
  // current behavior (mirrors `skip()`: cancel any pending notification,
  // clear the timer, clear persistence) without changing it.
  // ---------------------------------------------------------------------
  describe('complete() — foreground natural-completion hook (M2-11 call point)', () => {
    it('cancels the pending notification and clears the timer', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ now: t0 }));
      const notificationId = store.getState().timer!.notificationId!;
      expect(notificationId).toBeTruthy();

      await store.getState().complete();

      expect(mockCancel).toHaveBeenCalledWith(notificationId);
      expect(store.getState().timer).toBeNull();
    });

    it('complete() is a no-op when no timer is running (never throws, never calls cancel)', async () => {
      const store = createRestTimerStore();

      await expect(store.getState().complete()).resolves.toBeUndefined();

      expect(mockCancel).not.toHaveBeenCalled();
      expect(store.getState().timer).toBeNull();
    });

    it('complete() with no scheduled notification (permission denied / in-app-only) still clears the timer without calling cancel', async () => {
      mockRequestPermission.mockResolvedValue('denied');
      const store = createRestTimerStore();
      await store.getState().start(startParams({ now: 1_000_000 }));
      expect(store.getState().timer!.notificationId).toBeNull();

      await store.getState().complete();

      expect(mockCancel).not.toHaveBeenCalled();
      expect(store.getState().timer).toBeNull();
    });

    it('clears kv-store persistence too, so a relaunch after a natural completion restores no timer', async () => {
      const kv = createMemoryKvStore();
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().restore(kv, t0);
      await store.getState().start(startParams({ now: t0 }));
      expect(await kv.getItem('active_timer')).not.toBeNull();

      await store.getState().complete();

      expect(await kv.getItem('active_timer')).toBeNull();
    });

    it('complete() called twice in a row is safe — the second call is a no-op', async () => {
      const store = createRestTimerStore();
      await store.getState().start(startParams({ now: 1_000_000 }));

      await store.getState().complete();
      mockCancel.mockClear();
      await store.getState().complete();

      expect(mockCancel).not.toHaveBeenCalled();
      expect(store.getState().timer).toBeNull();
    });

    it('calling adjust()/skip()/cancelForSet() after complete() are all safe no-ops (state fully cleared)', async () => {
      const store = createRestTimerStore();
      await store.getState().start(startParams({ setId: 'set-1', now: 1_000_000 }));

      await store.getState().complete();

      await expect(store.getState().adjust(15, 1_000_000)).resolves.toBeUndefined();
      await expect(store.getState().skip()).resolves.toBeUndefined();
      await expect(store.getState().cancelForSet('set-1')).resolves.toBeUndefined();
      expect(store.getState().timer).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Kill/relaunch within window restores remaining; after endsAt -> none
  // ---------------------------------------------------------------------
  describe('restore() — kill/relaunch persistence (06 §4.3, 02 §16.1 edge case #1)', () => {
    it('restores the exact timer within the window, without re-scheduling (no duplicate notification)', async () => {
      const kv = createMemoryKvStore();
      const liveStore = createRestTimerStore();
      const t0 = 1_000_000;
      await liveStore.getState().restore(kv, t0); // bind persistence
      await liveStore.getState().start(startParams({ durationSeconds: 90, now: t0 }));
      const persistedEndsAt = liveStore.getState().timer!.endsAt;
      const persistedNotificationId = liveStore.getState().timer!.notificationId;
      mockSchedule.mockClear();

      // "Kill": drop the store, build a brand-new one bound to the same kv.
      const relaunchedStore = createRestTimerStore();
      const relaunchNow = t0 + 40_000; // still within the 90s window
      await relaunchedStore.getState().restore(kv, relaunchNow);

      expect(relaunchedStore.getState().timer).toEqual({
        endsAt: persistedEndsAt,
        exerciseId: 'exercise-1',
        setId: 'set-1',
        notificationId: persistedNotificationId,
      });
      // No re-scheduling on restore — the original OS-level schedule (if
      // any) survives a kill on its own (02 §16.1 edge case #1).
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('a relaunch after endsAt restores no timer and never re-schedules (no duplicate notification)', async () => {
      const kv = createMemoryKvStore();
      const liveStore = createRestTimerStore();
      const t0 = 1_000_000;
      await liveStore.getState().restore(kv, t0);
      await liveStore.getState().start(startParams({ durationSeconds: 30, now: t0 }));
      mockSchedule.mockClear();

      const relaunchedStore = createRestTimerStore();
      const relaunchNow = t0 + 31_000; // 1s past endsAt
      await relaunchedStore.getState().restore(kv, relaunchNow);

      expect(relaunchedStore.getState().timer).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
      // The stale kv entry is cleaned up too — a *third* relaunch shouldn't
      // find anything either.
      expect(await kv.getItem('active_timer')).toBeNull();
    });

    it('a relaunch with no persisted entry at all restores no timer', async () => {
      const kv = createMemoryKvStore();
      const store = createRestTimerStore();
      await store.getState().restore(kv, 1_000_000);
      expect(store.getState().timer).toBeNull();
    });

    it('a relaunch with a corrupt persisted entry restores no timer and clears the bad entry', async () => {
      const kv = createMemoryKvStore();
      await kv.setItem('active_timer', 'not valid json{{{');
      const store = createRestTimerStore();

      await store.getState().restore(kv, 1_000_000);

      expect(store.getState().timer).toBeNull();
      expect(await kv.getItem('active_timer')).toBeNull();
    });

    it('after restore, a later ±15s adjustment still reschedules correctly (meta survives relaunch)', async () => {
      const kv = createMemoryKvStore();
      const liveStore = createRestTimerStore();
      const t0 = 1_000_000;
      await liveStore.getState().restore(kv, t0);
      await liveStore.getState().start(
        startParams({ exerciseName: 'Deadlift', setNumber: 3, durationSeconds: 90, now: t0 }),
      );

      const relaunchedStore = createRestTimerStore();
      const relaunchNow = t0 + 10_000;
      await relaunchedStore.getState().restore(kv, relaunchNow);
      mockSchedule.mockClear();

      await relaunchedStore.getState().adjust(15, relaunchNow);

      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockSchedule).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: expect.stringContaining('set 3 of Deadlift') }),
      );
    });
  });

  // ---------------------------------------------------------------------
  // Permission flow (02 §16.9) — lazy request, one-time denial warning
  // ---------------------------------------------------------------------
  describe('permission flow (02 §16.9)', () => {
    it('requests permission lazily on the first start only — never again in the same session', async () => {
      const store = createRestTimerStore();
      const t0 = 1_000_000;
      await store.getState().start(startParams({ now: t0 }));
      await store.getState().skip();
      await store.getState().start(startParams({ now: t0 + 1_000 }));

      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    it('denial sets the one-time inline-warning flag and runs in-app-only (no notification scheduled)', async () => {
      mockRequestPermission.mockResolvedValue('denied');
      const store = createRestTimerStore();

      await store.getState().start(startParams({ now: 1_000_000 }));

      expect(store.getState().timer!.notificationId).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(store.getState().permissionDeniedNoticePending).toBe(true);
    });

    it('dismissPermissionDeniedNotice clears the flag', async () => {
      mockRequestPermission.mockResolvedValue('denied');
      const store = createRestTimerStore();
      await store.getState().start(startParams({ now: 1_000_000 }));
      expect(store.getState().permissionDeniedNoticePending).toBe(true);

      store.getState().dismissPermissionDeniedNotice();

      expect(store.getState().permissionDeniedNoticePending).toBe(false);
    });

    it('notificationsEnabled: false skips scheduling without requesting permission or flagging denial', async () => {
      const store = createRestTimerStore();

      await store.getState().start(startParams({ notificationsEnabled: false, now: 1_000_000 }));

      expect(mockRequestPermission).not.toHaveBeenCalled();
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(store.getState().timer!.notificationId).toBeNull();
      expect(store.getState().permissionDeniedNoticePending).toBe(false);
    });

    // Review regression (M2-09/M2-10 review): `adjust()` used to gate its
    // reschedule decision on the closure-level `permissionGranted` cache
    // rather than on whether *this* timer actually had a live notification
    // — so once permission had been granted once in a session, a later
    // timer started with `notificationsEnabled: false` would still get a
    // fresh OS notification scheduled the moment the user tapped +15s,
    // silently ignoring the setting for that timer. `adjust()` must gate on
    // `current.notificationId` instead.
    it('adjust() after a notificationsEnabled:false start does not schedule a notification, even if permission was granted earlier this session', async () => {
      const store = createRestTimerStore();

      // First timer this session: notifications enabled + permission
      // granted — caches `permissionGranted = true` for the store's
      // lifetime.
      await store.getState().start(startParams({ notificationsEnabled: true, now: 1_000_000 }));
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      await store.getState().skip();

      // Second timer: the user (or a per-timer settings read) explicitly
      // opted out of notifications for this one.
      mockSchedule.mockClear();
      await store.getState().start(startParams({ notificationsEnabled: false, now: 2_000_000 }));
      expect(store.getState().timer!.notificationId).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();

      // +15s must not schedule a notification for a timer that never had one.
      await store.getState().adjust(15, 2_000_000);
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(store.getState().timer!.notificationId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Store identity / independence
  // ---------------------------------------------------------------------
  it('createRestTimerStore() instances are independent — starting a timer on one does not affect another', async () => {
    const storeA = createRestTimerStore();
    const storeB = createRestTimerStore();

    await storeA.getState().start(startParams({ now: 1_000_000 }));

    expect(storeA.getState().timer).not.toBeNull();
    expect(storeB.getState().timer).toBeNull();
  });
});
