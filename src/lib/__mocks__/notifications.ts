// Manual Jest mock for `src/lib/notifications` (08 §5 native-seam mocking
// pattern). Activate in a test with `jest.mock('@/lib/notifications')`.
export const scheduleRestNotification = jest.fn(async () => 'mock-notification-id');
export const cancelNotification = jest.fn(async () => undefined);
