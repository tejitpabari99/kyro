// Manual Jest mock for `src/lib/haptics` (08 §5 native-seam mocking
// pattern). Activate in a test with `jest.mock('@/lib/haptics')`.
export const tickCheck = jest.fn();
export const warnInvalid = jest.fn();
export const successPR = jest.fn();
export const timerComplete = jest.fn();
export const selection = jest.fn();
export const destructiveConfirm = jest.fn();
export const dragReorder = jest.fn();
