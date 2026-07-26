// Manual Jest mock for `src/lib/progress-photo-capture` (08 §5 native-seam
// mocking pattern, same as `__mocks__/files.ts`/`__mocks__/progress-photos.ts`).
// Activate with `jest.mock('@/lib/progress-photo-capture')`.
export const PROGRESS_PHOTO_MAX_DIMENSION = 2048;
export const PROGRESS_PHOTO_JPEG_QUALITY = 0.8;

export const pickProgressPhoto = jest.fn(async () => null);
export const saveProgressPhotoFile = jest.fn(async (id: string) => `${id}.jpg`);
