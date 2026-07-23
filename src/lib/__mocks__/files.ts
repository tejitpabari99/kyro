// Manual Jest mock for `src/lib/files` (08 §5 native-seam mocking pattern).
// Activate in a test with `jest.mock('@/lib/files')`.
export const pickFile = jest.fn(async () => null);
export const writeFile = jest.fn(async () => undefined);
