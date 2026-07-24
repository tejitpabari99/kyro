// Manual Jest mock for `src/lib/sound` (08 §5 native-seam mocking pattern).
// Activate in a test with `jest.mock('@/lib/sound')`.
export const preloadChimes = jest.fn();
export const playTimerChime = jest.fn().mockResolvedValue(undefined);
export const playSetCheckChime = jest.fn().mockResolvedValue(undefined);
