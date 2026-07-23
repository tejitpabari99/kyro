/**
 * `lib/files` unit tests (M1-09 acceptance gate) — the real implementation
 * under test, with `expo-file-system/legacy`/`expo-image-manipulator`/
 * `expo-image-picker` mocked at the module boundary (same pattern
 * `sentry.test.ts`, M0-11, already established for a `src/lib/**` seam that
 * needs a plain top-level native import — see `files.ts`'s own header for
 * why that's safe here). Two halves:
 *
 *  - Pure path/name construction (`buildExercisePhotoFileName`,
 *    `exercisePhotoRelativeDir`, `exercisePhotoDirUri`, `exercisePhotoUri`)
 *    — asserted thoroughly, since this is the logic that guarantees "DB
 *    stores relative file names only" (05 §8) actually holds: every
 *    "stored" value below is asserted to be a bare file name with no
 *    `file://`/directory prefix.
 *  - The native-touching async functions (`pickExercisePhoto`,
 *    `saveExercisePhoto`, `deleteExercisePhoto`, `deleteExercisePhotos`) —
 *    asserted against fully mocked native calls (no real filesystem/image
 *    processing/picker ever touched, matching this task's own
 *    no-simulator-available constraint).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  EXERCISE_PHOTOS_ROOT,
  PROGRESS_PHOTOS_ROOT,
  buildExercisePhotoFileName,
  deleteExercisePhoto,
  deleteExercisePhotos,
  exercisePhotoDirUri,
  exercisePhotoRelativeDir,
  exercisePhotoUri,
  pickExercisePhoto,
  saveExercisePhoto,
} from '../files';

// `jest.mock` factories are hoisted above every import in this file by
// `babel-plugin-jest-hoist` (Jest's standard behavior) regardless of their
// source-order position — placed after the imports here purely so
// `import/first` doesn't flag them, with no change in actual hoisted
// behavior.
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const MOCK_DOCUMENT_DIRECTORY = 'file:///mock-documents/';

const mockFileSystem = FileSystem as unknown as {
  documentDirectory: string | null;
  getInfoAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  copyAsync: jest.Mock;
  deleteAsync: jest.Mock;
};
const mockManipulator = ImageManipulator as unknown as { manipulateAsync: jest.Mock };
const mockPicker = ImagePicker as unknown as {
  requestCameraPermissionsAsync: jest.Mock;
  requestMediaLibraryPermissionsAsync: jest.Mock;
  launchCameraAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSystem.documentDirectory = MOCK_DOCUMENT_DIRECTORY;
});

describe('path/name construction (pure, 05 §8)', () => {
  it('builds a "<uuid>.jpg" file name', () => {
    expect(buildExercisePhotoFileName('abc-123')).toBe('abc-123.jpg');
  });

  it('builds the exercise photo dir relative to documentDirectory, never absolute', () => {
    expect(exercisePhotoRelativeDir('ex-1')).toBe('photos/exercises/ex-1');
    expect(exercisePhotoRelativeDir('ex-1')).not.toContain('file://');
  });

  it('EXERCISE_PHOTOS_ROOT / PROGRESS_PHOTOS_ROOT match 05 §8\'s conventions', () => {
    expect(EXERCISE_PHOTOS_ROOT).toBe('photos/exercises');
    expect(PROGRESS_PHOTOS_ROOT).toBe('photos/progress');
  });

  it('joins documentDirectory + relative dir with a trailing slash', () => {
    expect(exercisePhotoDirUri('ex-1')).toBe(
      'file:///mock-documents/photos/exercises/ex-1/',
    );
  });

  it('joins the full absolute URI for one stored file name', () => {
    expect(exercisePhotoUri('ex-1', 'abc.jpg')).toBe(
      'file:///mock-documents/photos/exercises/ex-1/abc.jpg',
    );
  });

  it('throws if documentDirectory is unavailable (no native host)', () => {
    // `jest.resetModules()` + `jest.doMock` (not `jest.isolateModules`,
    // which — confirmed empirically — still resolved the file-scope
    // `jest.mock('expo-file-system/legacy', ...)` factory registered above
    // instead of a `doMock` override registered inside its callback) so
    // this one case's `documentDirectory: null` mock can't leak into (or be
    // shadowed by) the shared `FileSystem` mock every other test in this
    // file mutates via `beforeEach`. Safe to do mid-file: this clears the
    // module *registry* (cached instances), not the already-bound function
    // references every other `describe` block's top-level `import` closed
    // over — those keep working against their own, already-instantiated
    // copy of `../files` regardless of what a later `require` resolves to.
    jest.resetModules();
    jest.doMock('expo-file-system/legacy', () => ({
      documentDirectory: null,
      getInfoAsync: jest.fn(),
      makeDirectoryAsync: jest.fn(),
      copyAsync: jest.fn(),
      deleteAsync: jest.fn(),
    }));
    // Plain `require` (not `requireActual`) — this needs the just-registered
    // `doMock` override to actually apply; `requireActual` would bypass all
    // mocking, including this one.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isolated = require('../files') as typeof import('../files');
    expect(() => isolated.exercisePhotoDirUri('ex-1')).toThrow(/documentDirectory/);
  });
});

describe('saveExercisePhoto', () => {
  beforeEach(() => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
    mockFileSystem.copyAsync.mockResolvedValue(undefined);
    mockManipulator.manipulateAsync.mockResolvedValue({
      uri: 'file:///cache/manipulated-tmp.jpg',
      width: 500,
      height: 500,
    });
  });

  it('creates the exercise photo directory when it does not yet exist', async () => {
    await saveExercisePhoto('ex-1', { uri: 'file:///picked.jpg', width: 500, height: 500 });

    expect(mockFileSystem.getInfoAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/exercises/ex-1/',
    );
    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/exercises/ex-1/',
      { intermediates: true },
    );
  });

  it('does not recreate the directory when it already exists', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    await saveExercisePhoto('ex-1', { uri: 'file:///picked.jpg', width: 500, height: 500 });

    expect(mockFileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  });

  it('center-crops a landscape image to a square using the shorter (height) side', async () => {
    await saveExercisePhoto('ex-1', { uri: 'file:///picked.jpg', width: 800, height: 400 });

    expect(mockManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///picked.jpg',
      expect.arrayContaining([{ crop: { originX: 200, originY: 0, width: 400, height: 400 } }]),
      expect.objectContaining({ format: 'jpeg' }),
    );
  });

  it('center-crops a portrait image to a square using the shorter (width) side', async () => {
    await saveExercisePhoto('ex-1', { uri: 'file:///picked.jpg', width: 400, height: 800 });

    expect(mockManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///picked.jpg',
      expect.arrayContaining([{ crop: { originX: 0, originY: 200, width: 400, height: 400 } }]),
      expect.anything(),
    );
  });

  it('does not add a resize action when the cropped square is already under the max dimension', async () => {
    await saveExercisePhoto('ex-1', { uri: 'file:///picked.jpg', width: 500, height: 500 });

    const actions = mockManipulator.manipulateAsync.mock.calls[0][1];
    expect(actions).toHaveLength(1);
    expect(actions[0]).not.toHaveProperty('resize');
  });

  it('adds a resize action down to the max dimension when the cropped square exceeds it', async () => {
    await saveExercisePhoto('ex-1', { uri: 'file:///picked.jpg', width: 3000, height: 3000 });

    const actions = mockManipulator.manipulateAsync.mock.calls[0][1];
    expect(actions).toEqual(
      expect.arrayContaining([{ resize: { width: 1024, height: 1024 } }]),
    );
  });

  it('copies the manipulated result into the exercise photo dir and returns only the relative file name', async () => {
    const fileName = await saveExercisePhoto('ex-1', {
      uri: 'file:///picked.jpg',
      width: 500,
      height: 500,
    });

    expect(fileName).toMatch(/^[0-9a-f-]+\.jpg$/i);
    expect(fileName).not.toContain('/');
    expect(fileName).not.toContain('file://');

    expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/manipulated-tmp.jpg',
      to: `file:///mock-documents/photos/exercises/ex-1/${fileName}`,
    });
  });
});

describe('deleteExercisePhoto / deleteExercisePhotos', () => {
  it('deletes one stored file idempotently', async () => {
    await deleteExercisePhoto('ex-1', 'abc.jpg');

    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/exercises/ex-1/abc.jpg',
      { idempotent: true },
    );
  });

  it('deletes the whole exercise photo directory idempotently', async () => {
    await deleteExercisePhotos('ex-1');

    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/exercises/ex-1/',
      { idempotent: true },
    );
  });
});

describe('pickExercisePhoto', () => {
  it('returns null and never opens the library when media-library permission is denied', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await pickExercisePhoto('library');

    expect(result).toBeNull();
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('returns null and never opens the camera when camera permission is denied', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await pickExercisePhoto('camera');

    expect(result).toBeNull();
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('returns null when the user cancels the library picker', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickExercisePhoto('library')).toBeNull();
  });

  it('returns the picked asset shape from the library', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 1200, height: 900 }],
    });

    const result = await pickExercisePhoto('library');

    expect(result).toEqual({ uri: 'file:///picked.jpg', width: 1200, height: 900 });
    expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'] }),
    );
  });

  it('returns the picked asset shape from the camera', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera.jpg', width: 1000, height: 1000 }],
    });

    const result = await pickExercisePhoto('camera');

    expect(result).toEqual({ uri: 'file:///camera.jpg', width: 1000, height: 1000 });
    expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'] }),
    );
  });
});
