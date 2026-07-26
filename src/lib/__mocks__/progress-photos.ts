// Manual Jest mock for `src/lib/progress-photos` (08 §5 native-seam mocking
// pattern, same as `__mocks__/files.ts`). Activate with
// `jest.mock('@/lib/progress-photos')`. Picker/re-encode functions
// (`pickProgressPhoto`/`saveProgressPhotoFile`) live in the sibling
// `progress-photo-capture` module/mock, not here — see `../progress-photos
// .ts`'s header for why the two are split.
export const buildProgressPhotoFileName = jest.fn((id: string) => `${id}.jpg`);
export const progressPhotoDirUri = jest.fn(() => 'file:///mock-documents/photos/progress/');
export const progressPhotoUri = jest.fn(
  (fileName: string) => `file:///mock-documents/photos/progress/${fileName}`,
);
export const ensureProgressPhotoDirExists = jest.fn(
  async () => 'file:///mock-documents/photos/progress/',
);
export const deleteProgressPhotoFile = jest.fn(async () => undefined);
export const listProgressPhotoFileNames = jest.fn(async () => [] as string[]);
export const progressPhotoFileExists = jest.fn(async () => true);
