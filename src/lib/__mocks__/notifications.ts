// Manual Jest mock for `src/lib/notifications` (08 §5 native-seam mocking
// pattern). Activate in a test with `jest.mock('@/lib/notifications')`.
// `requestNotificationPermission` defaults to `'granted'` — tests that
// exercise the denial path override it with `mockResolvedValueOnce('denied')`
// (or reassign the whole mock) per-test.
export const REST_TIMER_NOTIFICATION_RATIONALE =
  'Allow notifications so Kyro can remind you when your rest timer ends, even if you leave the app. You can still use the in-app timer if you say no.';
export const requestNotificationPermission = jest.fn(async () => 'granted' as const);
export const scheduleRestNotification = jest.fn(async () => 'mock-notification-id');
export const cancelNotification = jest.fn(async () => undefined);
// M5-09: monthly backup reminder — see `../notifications.ts`'s own header.
export const BACKUP_REMINDER_NOTIFICATION_ID = 'kyro-backup-reminder';
export const scheduleMonthlyBackupReminder = jest.fn(async () => 'kyro-backup-reminder');
export const cancelBackupReminder = jest.fn(async () => undefined);
