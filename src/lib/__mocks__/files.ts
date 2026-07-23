// Manual Jest mock for `src/lib/files` (08 §5 native-seam mocking pattern).
// Activate in a test with `jest.mock('@/lib/files')`.
//
// Deliberately does NOT `jest.requireActual('../files')` for the pure
// path/name helpers — the real module's top-level imports
// (`expo-file-system/legacy`/`expo-image-manipulator`/`expo-image-picker`)
// would still be evaluated by that `require` (all of a module's imports run
// at require-time regardless of which export a caller actually wants),
// which throws in any test that mocks `@/lib/files` wholesale without *also*
// separately mocking those three native packages. The two constants and one
// join function below are small, stable enough to duplicate here directly
// instead — every other function that actually touches a native
// call is a plain `jest.fn()` stub.
export const EXERCISE_PHOTOS_ROOT = 'photos/exercises';
export const PROGRESS_PHOTOS_ROOT = 'photos/progress';

export const buildExercisePhotoFileName = jest.fn((uuid: string) => `${uuid}.jpg`);
export const exercisePhotoRelativeDir = jest.fn(
  (exerciseId: string) => `${EXERCISE_PHOTOS_ROOT}/${exerciseId}`,
);

export const pickFile = jest.fn(async () => null);
export const writeFile = jest.fn(async () => undefined);

export const exercisePhotoDirUri = jest.fn(
  (exerciseId: string) => `file:///mock-documents/photos/exercises/${exerciseId}/`,
);
export const exercisePhotoUri = jest.fn(
  (exerciseId: string, fileName: string) =>
    `file:///mock-documents/photos/exercises/${exerciseId}/${fileName}`,
);
export const pickExercisePhoto = jest.fn(async () => null);
export const saveExercisePhoto = jest.fn(async () => 'mock-uuid.jpg');
export const deleteExercisePhoto = jest.fn(async () => undefined);
export const deleteExercisePhotos = jest.fn(async () => undefined);
