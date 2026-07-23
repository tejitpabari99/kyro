/**
 * Local-notification seam (06 §10) — rest-timer notifications (M2) will go
 * through this module rather than importing `expo-notifications` directly,
 * so it stays the single mockable seam (08 §5).
 *
 * Placeholder for M0-03: `expo-notifications` isn't installed yet (the
 * rest-timer feature that needs it lands in M2). Stub bodies exist so the
 * seam and its manual-mock pattern (`src/lib/__mocks__/notifications.ts`)
 * are ready for that task to fill in.
 */

export interface ScheduleRestNotificationOptions {
  /** Seconds from now the notification should fire. */
  secondsFromNow: number;
  title: string;
  body: string;
}

/**
 * Schedule a local notification, returning its id (for later cancellation).
 * TODO(M2): wire to `expo-notifications` `scheduleNotificationAsync`.
 */
export async function scheduleRestNotification(
  _options: ScheduleRestNotificationOptions,
): Promise<string> {
  throw new Error('scheduleRestNotification is not implemented yet — see M2 rest-timer tasks.');
}

/** TODO(M2): wire to `expo-notifications` `cancelScheduledNotificationAsync`. */
export async function cancelNotification(_id: string): Promise<void> {
  throw new Error('cancelNotification is not implemented yet — see M2 rest-timer tasks.');
}
