/**
 * `lib/notifications` unit tests (M2-10 acceptance gate) — the real
 * implementation under test, with `expo-notifications` mocked at the module
 * boundary (same pattern `files.test.ts`, M1-09, already established for a
 * `src/lib/**` seam that needs a native import). This is deliberately
 * *separate* from `restTimerStore.test.ts` (which mocks this whole module
 * via `src/lib/__mocks__/notifications.ts`, per 08 §5's "mock only true
 * natives via `src/lib/` seams" convention) — this file is what actually
 * exercises `notifications.ts`'s own logic (sound resolution, permission
 * status mapping, trigger-seconds rounding, and the "native module
 * unavailable" graceful-degradation path `notifications.ts`'s file header
 * documents).
 */
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import {
  cancelNotification,
  requestNotificationPermission,
  scheduleRestNotification,
} from '../notifications';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

describe('lib/notifications (M2-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestNotificationPermission', () => {
    it('returns "granted" without requesting again when already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });

      const result = await requestNotificationPermission();

      expect(result).toBe('granted');
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('requests when not already granted, and returns "granted" if the user allows', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });

      const result = await requestNotificationPermission();

      expect(result).toBe('granted');
      expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns "denied" when the user declines', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

      expect(await requestNotificationPermission()).toBe('denied');
    });

    it('returns "undetermined" for any other status (e.g. iOS provisional edge cases)', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'provisional' });

      expect(await requestNotificationPermission()).toBe('undetermined');
    });
  });

  describe('scheduleRestNotification', () => {
    it('schedules a time-interval trigger with interruptionLevel timeSensitive and the given title/body', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-1');

      const id = await scheduleRestNotification({
        secondsFromNow: 90,
        title: 'Rest timer',
        body: 'Rest over — set 1 of Bench Press',
      });

      expect(id).toBe('notif-1');
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: expect.objectContaining({
          title: 'Rest timer',
          body: 'Rest over — set 1 of Bench Press',
          interruptionLevel: 'timeSensitive',
          sound: true,
        }),
        trigger: {
          type: SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 90,
        },
      });
    });

    it('rounds fractional seconds and floors at 1 (never schedules a 0-or-negative-second trigger)', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-2');

      await scheduleRestNotification({ secondsFromNow: 0.2, title: 't', body: 'b' });

      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: { type: 'timeInterval', seconds: 1 } }),
      );
    });

    it('sound: off when volume is "off"', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-3');
      await scheduleRestNotification({
        secondsFromNow: 30,
        title: 't',
        body: 'b',
        soundChoice: 'default',
        volume: 'off',
      });
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.objectContaining({ sound: false }) }),
      );
    });

    it('sound: off when soundChoice is "none", regardless of volume', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-4');
      await scheduleRestNotification({
        secondsFromNow: 30,
        title: 't',
        body: 'b',
        soundChoice: 'none',
        volume: 'high',
      });
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.objectContaining({ sound: false }) }),
      );
    });

    it('sound: on for any non-off/non-none combination', async () => {
      mockScheduleNotificationAsync.mockResolvedValue('notif-5');
      await scheduleRestNotification({
        secondsFromNow: 30,
        title: 't',
        body: 'b',
        soundChoice: 'bell',
        volume: 'low',
      });
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.objectContaining({ sound: true }) }),
      );
    });
  });

  describe('cancelNotification', () => {
    it('delegates to cancelScheduledNotificationAsync with the given id', async () => {
      mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
      await cancelNotification('notif-1');
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Native-module-unavailable graceful degradation (see `notifications.ts`'s
// file header) — a *separate* describe block using `jest.doMock` +
// `jest.resetModules()` so this file can also cover the "expo-notifications
// itself throws on require()" path without disturbing the happy-path mock
// above (Jest evaluates one static `jest.mock` factory per module per file;
// this dynamic variant is how a single file exercises both).
// ---------------------------------------------------------------------------
describe('lib/notifications — native module unavailable (headless/Jest environment)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-notifications', () => {
      throw new Error("Cannot find native module 'ExpoPushTokenManager'");
    });
  });

  afterEach(() => {
    jest.dontMock('expo-notifications');
  });

  it('requestNotificationPermission degrades to "denied" instead of throwing', async () => {
    // Plain `require()`, not a dynamic `import()` — this Jest/Babel config
    // doesn't transform `import()` (confirmed empirically elsewhere in this
    // task, see `notifications.ts`'s own file header), so `require()` after
    // `jest.resetModules()` is the form that actually re-evaluates the
    // module fresh against the new `jest.doMock` factory above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../notifications') as typeof import('../notifications');
    await expect(mod.requestNotificationPermission()).resolves.toBe('denied');
  });

  it('cancelNotification resolves as a no-op instead of throwing', async () => {
    // Plain `require()`, not a dynamic `import()` — this Jest/Babel config
    // doesn't transform `import()` (confirmed empirically elsewhere in this
    // task, see `notifications.ts`'s own file header), so `require()` after
    // `jest.resetModules()` is the form that actually re-evaluates the
    // module fresh against the new `jest.doMock` factory above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../notifications') as typeof import('../notifications');
    await expect(mod.cancelNotification('some-id')).resolves.toBeUndefined();
  });

  it('scheduleRestNotification throws a clear error (never reached in practice — callers only schedule after permission resolved granted)', async () => {
    // Plain `require()`, not a dynamic `import()` — this Jest/Babel config
    // doesn't transform `import()` (confirmed empirically elsewhere in this
    // task, see `notifications.ts`'s own file header), so `require()` after
    // `jest.resetModules()` is the form that actually re-evaluates the
    // module fresh against the new `jest.doMock` factory above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../notifications') as typeof import('../notifications');
    await expect(
      mod.scheduleRestNotification({ secondsFromNow: 30, title: 't', body: 'b' }),
    ).rejects.toThrow('expo-notifications native module unavailable');
  });
});
