/**
 * `restTimerStore` (M2-10) — 06 §4 item 3: "`{endsAt, exerciseId, setId,
 * notificationId} | null`; derived remaining-time via a 250 ms ticker hook
 * active only while a timer surface is visible. Persisted inside the active
 * workout row (timer state column-free: stored in `settings`-style kv
 * `active_timer` key via kv-store) so relaunch restores it."
 *
 * Mirrors `settingsStore.ts`/`activeWorkoutStore.ts`'s "factory +
 * app-singleton" shape: `createRestTimerStore()` builds an independent
 * instance (tests want isolation — no persisted-timer bleed between cases)
 * and `useRestTimerStore` below is the one the real app imports.
 *
 * ## Start rules (02 §7, this task's own "How")
 * Checking a set starts that exercise's timer unless: the exercise's own
 * rest-timer setting is Off (`restSeconds` null or `<= 0`), or the very
 * next row (same exercise, next index) is a `dropset` ("no rest within a
 * drop"). Superset members still start timers — no extra rule needed here,
 * supersets don't change the two conditions above (02 §7's own
 * clarification: "suppression applies only to the immediate-next-row-dropset
 * rule"). {@link shouldStartRestTimer} is the pure decision function; the
 * actual start-or-not call happens at the check-flow call site
 * (`ConnectedSetRow.tsx`), which has the row data this store doesn't.
 *
 * ## Only one timer at a time
 * `start()` always cancels whatever timer is currently running (its pending
 * notification, if any) before scheduling the new one — "starting a new one
 * replaces the old" (02 §7).
 *
 * ## ±15 s clamps (08 §4.10 resolution, restated in this task's "How")
 * `adjust(+15)` is unbounded (no cap). `adjust(-15)` floors remaining at 0:
 * if the adjustment would take `endsAt` to or past "now," the timer
 * finishes outright (cleared + notification cancelled) rather than holding
 * a zero-or-negative `endsAt`.
 *
 * ## Notification body / reschedule cache (read before touching `adjust`)
 * The public `timer` field intentionally matches the spec's literal shape
 * (`{endsAt, exerciseId, setId, notificationId}`) — no room for the
 * exercise name / set number the notification body text
 * ("Rest over — set N of {exercise}") needs to *reschedule* on ±15s, nor
 * for the `soundChoice`/`volume` prefs the original `start()` call
 * resolved. Those four extra fields live in a private `meta` closure
 * variable instead (mirrors `activeWorkoutStore`'s "repository kept in a
 * closure" pattern), and travel through the kv-store persistence envelope
 * (a superset of `RestTimer`, see {@link PersistedRestTimer}) so a
 * post-relaunch `adjust()` can still reschedule correctly (same sound
 * prefs included, not just the body text) instead of silently degrading to
 * in-app-only for the rest of that session.
 *
 * ## Permission flow (02 §16.9)
 * Requested lazily on the *first ever* `start()` call in the store's
 * lifetime (`hasRequestedPermission` closure flag — never re-prompted after
 * that, matching "one-time"). Denial sets `permissionDeniedNoticePending`
 * (the one-time inline-warning trigger — M2-11 renders the actual
 * banner/snackbar and calls {@link dismissPermissionDeniedNotice}) and every
 * subsequent `start()`/`adjust()` in that session simply skips scheduling
 * (in-app-only mode) — the timer itself still runs.
 */
import { create } from 'zustand';

import type { SoundChoice, VolumeLevel } from '@/data/settings/settings-schema';
import type { SetType } from '@/domain/enums';
import type { KvStore } from '@/lib/kv-store';
import { logger } from '@/lib/logger';
import {
  cancelNotification,
  requestNotificationPermission,
  scheduleRestNotification,
} from '@/lib/notifications';
import { recordBreadcrumb } from '@/lib/sentry';

/** 06 §4's literal store shape. */
export interface RestTimer {
  endsAt: number;
  exerciseId: string;
  setId: string;
  notificationId: string | null;
}

/** The kv-store envelope — `RestTimer` plus the reschedule metadata the persisted `timer` field itself doesn't carry (see file header). `soundChoice`/`volume` are optional so a pre-existing persisted entry (written before this field existed) still parses — a post-relaunch reschedule for such an entry just falls back to `scheduleRestNotification`'s own defaults, same as any other never-recorded preference. */
interface PersistedRestTimer extends RestTimer {
  exerciseName: string;
  setNumber: number;
  soundChoice?: SoundChoice;
  volume?: VolumeLevel;
}

const ACTIVE_TIMER_KV_KEY = 'active_timer';

export interface StartRestTimerParams {
  exerciseId: string;
  setId: string;
  /** The exercise's own rest-timer duration (already resolved by the caller — this store doesn't know about workout-exercise rows). */
  durationSeconds: number;
  /** For the notification body, "Rest over — set N of {exercise}". */
  exerciseName: string;
  setNumber: number;
  /** Settings → `rest_notifications_enabled` — user-level "don't schedule OS notifications at all" toggle, independent of OS permission. */
  notificationsEnabled: boolean;
  soundChoice?: SoundChoice;
  volume?: VolumeLevel;
  /** Testing seam — defaults to `Date.now()`. */
  now?: number;
}

export interface RestTimerStoreState {
  timer: RestTimer | null;
  /** One-time inline-warning trigger (02 §16.9) — true once a lazy permission request has come back denied; M2-11's UI reads this and calls {@link RestTimerStoreState.dismissPermissionDeniedNotice} once shown. */
  permissionDeniedNoticePending: boolean;
  /** Start rules already evaluated by the caller (`shouldStartRestTimer` + the next-row-dropset check) — this always starts a timer, replacing any running one. */
  start(params: StartRestTimerParams): Promise<void>;
  /** ±15 s (02 §7) — positive `deltaSeconds` extends (unbounded), negative shortens (floors remaining at 0, finishing the timer). No-op if no timer is running. */
  adjust(deltaSeconds: number, now?: number): Promise<void>;
  /** Skip: cancels the pending notification and clears the timer outright. No-op if no timer is running. */
  skip(): Promise<void>;
  /** Uncheck's own-timer-only cancel (02 §4/§7): cancels only if the running timer belongs to `setId`; leaves any other timer (or no timer) untouched. */
  cancelForSet(setId: string): Promise<void>;
  /** Foreground natural-completion hook point for M2-11's visible timer surface (06 §6.2: "Foreground completion: in-app chime + haptic, and the scheduled notification is cancelled just-in-time") — call once a mounted timer surface observes `remaining <= 0`. Defensively cancels the notification (in case local `now` reached zero microseconds before the OS trigger) and clears state; safe/no-op if already cleared. */
  complete(): Promise<void>;
  /** Cold-start restore (06 §4.3/§5.1): hydrates `timer` from `kv`'s persisted `active_timer` entry and remembers `kv` for subsequent write-through persistence. Past-`endsAt` entries are dropped silently (never re-scheduled — the original OS-level schedule, if any, already fired or was cancelled; re-scheduling here would duplicate it). */
  restore(kv: KvStore, now?: number): Promise<void>;
  dismissPermissionDeniedNotice(): void;
}

/** 06 §6.2's literal notification body format. */
function notificationBody(setNumber: number, exerciseName: string): string {
  return `Rest over — set ${setNumber} of ${exerciseName}`;
}

/**
 * Pure start-rule decision (02 §7 / this task's "How"): `restSeconds` null
 * or `<= 0` means the exercise's rest timer is set to Off; `nextSetType`
 * is the *next row's* type within the same exercise (or `null` when the
 * checked row is the exercise's last row — never suppresses, 02 §7: "the
 * checked set is the exercise's last row ... suppression applies only to
 * the immediate-next-row-dropset rule"). Exported for direct unit coverage
 * and reuse at the check-flow call site.
 */
export function shouldStartRestTimer(params: {
  restSeconds: number | null;
  nextSetType: SetType | null;
}): boolean {
  // `!params.restSeconds` also defensively covers a caller accidentally
  // passing `undefined` (not a valid `restSeconds` per the type, but falls
  // back to "Off" rather than "start a timer" if it ever happens) in
  // addition to the documented `null`/`0` Off cases.
  if (!params.restSeconds) {
    return false;
  }
  if (params.nextSetType === 'dropset') {
    return false;
  }
  return true;
}

/** Build a fresh, independent rest-timer store — see file header for why this is a factory. */
export function createRestTimerStore() {
  let kvStore: KvStore | null = null;
  let hasRequestedPermission = false;
  let permissionGranted = false;
  // Reschedule metadata, kept alongside (never inside) the public `timer`
  // field — see file header. `soundChoice`/`volume` are captured at
  // `start()` time (the same values that call's own initial schedule used)
  // so every later reschedule (`adjust()`) passes the identical sound
  // prefs instead of silently falling back to `scheduleRestNotification`'s
  // defaults (M2-09/M2-10 review regression: a muted timer sound was lost
  // on ±15s adjust).
  let meta: {
    exerciseName: string;
    setNumber: number;
    soundChoice?: SoundChoice;
    volume?: VolumeLevel;
  } | null = null;

  const persist = (timer: RestTimer | null): void => {
    if (!kvStore) {
      return;
    }
    if (timer && meta) {
      const payload: PersistedRestTimer = {
        ...timer,
        exerciseName: meta.exerciseName,
        setNumber: meta.setNumber,
        soundChoice: meta.soundChoice,
        volume: meta.volume,
      };
      void kvStore.setItem(ACTIVE_TIMER_KV_KEY, JSON.stringify(payload)).catch(() => {});
    } else {
      void kvStore.removeItem(ACTIVE_TIMER_KV_KEY).catch(() => {});
    }
  };

  return create<RestTimerStoreState>((set, get) => ({
    timer: null,
    permissionDeniedNoticePending: false,

    async start({
      exerciseId,
      setId,
      durationSeconds,
      exerciseName,
      setNumber,
      notificationsEnabled,
      soundChoice,
      volume,
      now = Date.now(),
    }) {
      recordBreadcrumb('restTimer.start');

      // "Only one timer at a time; starting a new one replaces the old."
      const previous = get().timer;
      if (previous?.notificationId) {
        await cancelNotification(previous.notificationId).catch(() => {});
      }

      let shouldSchedule = notificationsEnabled;
      if (shouldSchedule && !hasRequestedPermission) {
        hasRequestedPermission = true;
        const status = await requestNotificationPermission();
        permissionGranted = status === 'granted';
      }
      shouldSchedule = shouldSchedule && permissionGranted;

      const endsAt = now + durationSeconds * 1000;
      meta = { exerciseName, setNumber, soundChoice, volume };

      let notificationId: string | null = null;
      if (shouldSchedule) {
        try {
          notificationId = await scheduleRestNotification({
            secondsFromNow: durationSeconds,
            title: 'Rest timer',
            body: notificationBody(setNumber, exerciseName),
            soundChoice,
            volume,
          });
        } catch (error) {
          // `scheduleRestNotification` throws if the native module is
          // unavailable at call time (see its own file header) — degrade
          // to in-app-only mode (matches the existing OS-permission-denial
          // posture) rather than letting this reject `start()`'s promise,
          // which the fire-and-forget `ConnectedSetRow.tsx` call site
          // never `.catch()`es.
          logger.warn(
            `restTimer.start: scheduleRestNotification failed (${
              error instanceof Error ? error.message : String(error)
            }) — falling back to in-app-only timer.`,
          );
          notificationId = null;
        }
      }

      const timer: RestTimer = { endsAt, exerciseId, setId, notificationId };
      set({
        timer,
        // Only the OS-permission-denial path shows the one-time warning —
        // `notificationsEnabled === false` is the user's own explicit
        // choice, nothing to warn about.
        permissionDeniedNoticePending:
          notificationsEnabled && !permissionGranted
            ? true
            : get().permissionDeniedNoticePending,
      });
      persist(timer);
    },

    async adjust(deltaSeconds, now = Date.now()) {
      const current = get().timer;
      if (!current) {
        return;
      }
      recordBreadcrumb('restTimer.adjust');

      const proposedEndsAt = current.endsAt + deltaSeconds * 1000;

      if (deltaSeconds < 0 && proposedEndsAt <= now) {
        // Min clamp: remaining floors at 0 — the timer finishes outright
        // rather than holding a zero/negative `endsAt`.
        if (current.notificationId) {
          await cancelNotification(current.notificationId).catch(() => {});
        }
        meta = null;
        set({ timer: null });
        persist(null);
        return;
      }

      if (current.notificationId) {
        await cancelNotification(current.notificationId).catch(() => {});
      }

      // Only reschedule if *this* timer already had a live notification —
      // gating on `current.notificationId` (not the closure-level
      // `permissionGranted` cache) is what actually ties this decision to
      // whether notifications were enabled+granted *for this timer*: a
      // timer started with `notificationsEnabled: false` (or before
      // permission was ever granted) has `notificationId === null` even
      // though `permissionGranted` may already be `true` from an earlier
      // timer this session — using `permissionGranted` alone here would
      // incorrectly schedule a fresh OS notification on a plain ±15s tap
      // for a timer the user explicitly opted out of notifications for.
      const hadNotification = current.notificationId !== null;
      let notificationId: string | null = null;
      if (hadNotification && meta) {
        const secondsFromNow = Math.max(1, Math.round((proposedEndsAt - now) / 1000));
        // Same `soundChoice`/`volume` `start()` captured for this timer —
        // without threading these through, a reschedule silently defaults
        // to `scheduleRestNotification`'s own (audible) fallback, losing
        // e.g. a muted preference on every ±15s adjustment (M2-09/M2-10
        // review regression).
        notificationId = await scheduleRestNotification({
          secondsFromNow,
          title: 'Rest timer',
          body: notificationBody(meta.setNumber, meta.exerciseName),
          soundChoice: meta.soundChoice,
          volume: meta.volume,
        });
      }

      const timer: RestTimer = { ...current, endsAt: proposedEndsAt, notificationId };
      set({ timer });
      persist(timer);
    },

    async skip() {
      const current = get().timer;
      if (!current) {
        return;
      }
      recordBreadcrumb('restTimer.skip');
      if (current.notificationId) {
        await cancelNotification(current.notificationId).catch(() => {});
      }
      meta = null;
      set({ timer: null });
      persist(null);
    },

    async cancelForSet(setId) {
      const current = get().timer;
      if (!current || current.setId !== setId) {
        return;
      }
      recordBreadcrumb('restTimer.cancelForSet');
      if (current.notificationId) {
        await cancelNotification(current.notificationId).catch(() => {});
      }
      meta = null;
      set({ timer: null });
      persist(null);
    },

    async complete() {
      const current = get().timer;
      if (!current) {
        return;
      }
      recordBreadcrumb('restTimer.complete');
      if (current.notificationId) {
        await cancelNotification(current.notificationId).catch(() => {});
      }
      meta = null;
      set({ timer: null });
      persist(null);
    },

    async restore(kv, now = Date.now()) {
      kvStore = kv;
      const raw = await kv.getItem(ACTIVE_TIMER_KV_KEY);
      if (!raw) {
        set({ timer: null });
        return;
      }

      let parsed: PersistedRestTimer;
      try {
        parsed = JSON.parse(raw) as PersistedRestTimer;
      } catch {
        await kv.removeItem(ACTIVE_TIMER_KV_KEY).catch(() => {});
        set({ timer: null });
        return;
      }

      if (parsed.endsAt <= now) {
        // 02 §16.1 edge case #1 / 08 §4.10: "after endsAt -> no timer, no
        // duplicate notification." The original OS-level schedule (if any)
        // already fired or was cancelled — never re-schedule here.
        await kv.removeItem(ACTIVE_TIMER_KV_KEY).catch(() => {});
        meta = null;
        set({ timer: null });
        return;
      }

      // Within window: restore local state (and the reschedule metadata)
      // so the UI shows correct remaining time and a later ±15s still
      // works. Deliberately does NOT call `scheduleRestNotification` again
      // — the original schedule from `start()`/`adjust()` survives a kill
      // (02 §16.1 edge case #1: "Notification still fires (scheduled with
      // OS)"); re-scheduling here would create a duplicate.
      //
      // Also restore the permission-cache flags: this is a *fresh*
      // `createRestTimerStore()` instance (a real relaunch, or a test
      // simulating one) that has never called `start()` and so has no
      // opinion yet on whether notifications are granted — without this, a
      // ±15s adjustment right after restore (before the user ever starts a
      // brand-new timer this session) would silently skip rescheduling.
      // The persisted `notificationId` already answers the question: a
      // non-null id means a notification *was* successfully scheduled at
      // start time (permission was granted then); `null` means it wasn't
      // (denied, or notifications disabled) — either way, no need to
      // re-request, the OS already answered once this "session" (from the
      // user's perspective, across the kill/relaunch).
      hasRequestedPermission = true;
      permissionGranted = parsed.notificationId !== null;
      meta = {
        exerciseName: parsed.exerciseName,
        setNumber: parsed.setNumber,
        soundChoice: parsed.soundChoice,
        volume: parsed.volume,
      };
      const timer: RestTimer = {
        endsAt: parsed.endsAt,
        exerciseId: parsed.exerciseId,
        setId: parsed.setId,
        notificationId: parsed.notificationId,
      };
      set({ timer });
    },

    dismissPermissionDeniedNotice() {
      set({ permissionDeniedNoticePending: false });
    },
  }));
}

/** The one rest-timer store used by the real app. */
export const useRestTimerStore = createRestTimerStore();
