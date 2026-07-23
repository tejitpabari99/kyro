// Manual Jest mock for `src/lib/haptics` (08 §5 native-seam mocking
// pattern). Activate in a test with `jest.mock('@/lib/haptics')`.
export const triggerImpact = jest.fn();
export const triggerNotificationFeedback = jest.fn();
