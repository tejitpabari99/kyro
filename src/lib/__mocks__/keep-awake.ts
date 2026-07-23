// Manual Jest mock for `src/lib/keep-awake` (08 §5 native-seam mocking
// pattern). Activate in a test with `jest.mock('@/lib/keep-awake')`.
export const activateKeepAwake = jest.fn();
export const deactivateKeepAwake = jest.fn();
