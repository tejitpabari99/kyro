// Manual Jest mock for `src/lib/hevy-import-file` (08 §5 native-seam
// mocking pattern, same convention `src/lib/__mocks__/files.ts` already
// established). Activate in a test with `jest.mock('@/lib/hevy-import-file')`.
export const pickFile = jest.fn(async () => null);
export const readTextFile = jest.fn(async () => '');
