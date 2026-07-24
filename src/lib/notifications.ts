/**
 * Local-notification seam (06 §10) — rest-timer notifications (M2-10) go
 * through this module rather than importing `expo-notifications` directly,
 * so it stays the single mockable seam (08 §5: "RNTL tests mock only true
 * natives ... via `src/lib/` seams"). `restTimerStore`
 * (`src/features/workout/restTimerStore.ts`) is the only consumer today.
 *
 * 06 §6.2: "Start: compute `endsAt`, store, schedule local notification
 * (`expo-notifications`, time-interval trigger, sound per settings,
 * `interruptionLevel: timeSensitive`). Adjust ±15 s / skip / uncheck: cancel
 * by `notificationId`, reschedule if needed. ... Permissions requested
 * lazily on first timer start with rationale copy; denial → in-app-only
 * mode + inline warning (`02` §16.9)."
 *
 * Every test in `08` §4.10 mocks this module wholesale
 * (`jest.mock('@/lib/notifications')` → `src/lib/__mocks__/notifications.ts`)
 * — the real `expo-notifications` calls below are never exercised by those
 * tests, matching the "cannot be verified on a real device/simulator here"
 * constraint (`docs/plan/BLOCKERS.md`).
 *
 * ## Why `expo-notifications` is `require()`d lazily, inside a `try/catch`
 * `expo-notifications`'s package entry eagerly `requireNativeModule`s its
 * push-token binding **at module-evaluation time** (not lazily inside a
 * function body, unlike most Expo native wrappers) — confirmed empirically:
 * loading it throws `Cannot find native module 'ExpoPushTokenManager'`
 * under `jest-expo` (no native host registered, expected in this headless
 * environment — `docs/plan/BLOCKERS.md`). Two consequences shape this file:
 *  - The `require()` is **inside** each function (not a top-level
 *    `import`), so merely importing `src/lib/notifications.ts` — which
 *    happens unconditionally from `restTimerStore.ts`, in turn from
 *    `app/_layout.tsx` — never touches `expo-notifications` at all unless a
 *    function here actually runs. (A dynamic `import()` would defer the
 *    same way, but this Jest config's Babel transform doesn't lower dynamic
 *    `import()` to a `require()`-based interop under the `ui` project —
 *    confirmed empirically too, "invoked without --experimental-vm-modules"
 *    — so plain lazy `require()` is the form that actually works here *and*
 *    bundles identically under Metro on-device.)
 *  - The `require()` is wrapped in `try/catch` ({@link loadExpoNotifications})
 *    so a test that exercises the real check-flow success path *without*
 *    mocking this module (reaching this code for real, e.g. because it
 *    doesn't care about rest timers at all) degrades gracefully to "module
 *    unavailable" — treated identically to a denied OS permission
 *    (in-app-only mode, 02 §16.9) — rather than throwing. This is
 *    deliberately the same fallback a genuinely broken/unlinked native
 *    module would need on a real device too, not a test-only shim.
 */
/** Copy the (future, M2-11) permission-rationale UI shows before the lazy first-start request (02 §16.9). Exported so that surface doesn't have to duplicate the wording. */
export const REST_TIMER_NOTIFICATION_RATIONALE =
  'Allow notifications so Kyro can remind you when your rest timer ends, even if you leave the app. You can still use the in-app timer if you say no.';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Deliberately **not** imported from `@/data/settings/settings-schema` —
 * 06 §2's dependency rule ("`src/lib` must not depend on domain/data/ui/
 * features/app — app/features depend on lib, never the reverse") forbids
 * it, enforced by this repo's `import/no-restricted-paths` ESLint rule.
 * These are a structural (literal-for-literal) copy of that schema's
 * `SoundChoice`/`VolumeLevel` — TS's structural typing means callers who
 * already have a real `Settings['sounds']` value (features/workout's
 * `restTimerStore.ts`) can pass it straight through with no cast needed, as
 * long as the two literal sets stay in sync (05 §3.5 is the source of
 * truth; this file just mirrors it for this one call boundary).
 */
export type SoundChoice = 'default' | 'bell' | 'beep' | 'none';
export type VolumeLevel = 'off' | 'low' | 'normal' | 'high';

export interface ScheduleRestNotificationOptions {
  /** Seconds from now the notification should fire (time-interval trigger, 06 §6.2). */
  secondsFromNow: number;
  title: string;
  body: string;
  /** Settings → Sounds' timer sound choice; `'none'` (or `volume === 'off'`) schedules a silent notification. */
  soundChoice?: SoundChoice;
  volume?: VolumeLevel;
}

/** See file header — `null` means "unavailable," handled by every call site as equivalent to a denied/no-op outcome. */
function loadExpoNotifications(): typeof import('expo-notifications') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load, see file header.
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Lazily check/request OS notification permission. Callers request at most
 * once per app session (`restTimerStore`'s "lazy... on first timer start"
 * gate) — this function itself just reflects whatever the OS returns for a
 * single check-then-request pass, so it is safe to call more than once
 * (a second call when already `granted`/`denied` just re-reads status
 * without re-prompting the user, since the OS itself only ever prompts
 * once).
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const Notifications = loadExpoNotifications();
  if (!Notifications) {
    return 'denied';
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') {
    return 'granted';
  }
  const requested = await Notifications.requestPermissionsAsync();
  if (requested.status === 'granted') {
    return 'granted';
  }
  return requested.status === 'denied' ? 'denied' : 'undetermined';
}

/** `sound` per Settings → Sounds (02 §7): `'off'` volume or `'none'` choice → silent (`false`); otherwise the default system sound. Custom `bell`/`beep` OS-level assets aren't bundled in this app config yet (M2-11 scope is the *in-app* chime library, `src/lib/sound.ts` — a separate, unrelated asset set) — documented simplification, not a silent gap: every non-`'off'`/`'none'` combination still gets *a* sound, just always the platform default rather than a per-choice custom asset. */
function resolveSound(soundChoice?: SoundChoice, volume?: VolumeLevel): boolean {
  if (volume === 'off' || soundChoice === 'none') {
    return false;
  }
  return true;
}

/**
 * Schedule a local notification, returning its id (for later cancellation
 * via {@link cancelNotification}). `interruptionLevel: 'timeSensitive'`
 * (06 §6.2) — iOS delivers it even in Focus modes that would otherwise
 * suppress a plain notification, appropriate for "your rest is over."
 * Callers only reach this after {@link requestNotificationPermission}
 * resolved `'granted'`, so the module being unavailable here would be an
 * inconsistent-state bug, not a normal path — still handled defensively
 * (throws a clear error) rather than silently returning a fake id.
 */
export async function scheduleRestNotification(
  options: ScheduleRestNotificationOptions,
): Promise<string> {
  const Notifications = loadExpoNotifications();
  if (!Notifications) {
    throw new Error('scheduleRestNotification: expo-notifications native module unavailable.');
  }
  return Notifications.scheduleNotificationAsync({
    content: {
      title: options.title,
      body: options.body,
      sound: resolveSound(options.soundChoice, options.volume),
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(options.secondsFromNow)),
    },
  });
}

/** Cancel a previously scheduled notification by id — no-op (resolves) if it already fired, was already cancelled, or the native module is unavailable (see file header — same graceful-degradation posture as {@link requestNotificationPermission}). */
export async function cancelNotification(id: string): Promise<void> {
  const Notifications = loadExpoNotifications();
  if (!Notifications) {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(id);
}
