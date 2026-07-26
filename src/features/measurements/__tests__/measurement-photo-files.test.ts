/**
 * `measurement-photo-files.ts` unit tests (M5-02 acceptance gate) — mirrors
 * `src/lib/files.test.ts`'s own convention for the equivalent
 * exercise-photo seam: `expo-file-system/legacy`/`expo-image-picker` mocked
 * at the module boundary (no real filesystem/picker ever touched, no
 * on-device/simulator available in this environment — see this task's
 * EXECUTION-LOG.md row for the "verified vs not" note). `expo-image-manipulator`
 * is mocked too even though this file never calls it directly — it imports
 * `PROGRESS_PHOTOS_ROOT` from `@/lib/files`, whose own top-level
 * `import * as ImageManipulator from 'expo-image-manipulator'` would
 * otherwise reach the real native module and fail to load under Jest.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import {
  deleteProgressPhotoFile,
  pickProgressPhoto,
  progressPhotoUri,
  saveProgressPhotoFile,
} from '../measurement-photo-files';

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

describe('progressPhotoUri', () => {
  it('builds an absolute file:// URI under photos/progress/, relative to documentDirectory', () => {
    expect(progressPhotoUri('abc-123.jpg')).toBe(
      `${MOCK_DOCUMENT_DIRECTORY}photos/progress/abc-123.jpg`,
    );
  });
});

describe('pickProgressPhoto', () => {
  it('returns null (silent no-op) when camera permission is denied', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    const result = await pickProgressPhoto('camera');
    expect(result).toBeNull();
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('returns null when the library picker is cancelled', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    const result = await pickProgressPhoto('library');
    expect(result).toBeNull();
  });

  it('returns the picked asset uri on a successful camera capture', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/photo.jpg', width: 100, height: 100 }],
    });
    const result = await pickProgressPhoto('camera');
    expect(result).toEqual({ uri: 'file:///cache/photo.jpg' });
  });

  it('returns the picked asset uri on a successful library pick', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/library.jpg', width: 50, height: 50 }],
    });
    const result = await pickProgressPhoto('library');
    expect(result).toEqual({ uri: 'file:///cache/library.jpg' });
  });
});

describe('saveProgressPhotoFile (MeasurementRepositoryDeps.savePhotoFile)', () => {
  it('creates photos/progress/ if missing, copies the source uri to "<id>.jpg", and returns the relative file name', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });

    const fileName = await saveProgressPhotoFile('photo-id-1', '2026-07-20', 'file:///cache/pick.jpg');

    expect(fileName).toBe('photo-id-1.jpg');
    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      `${MOCK_DOCUMENT_DIRECTORY}photos/progress/`,
      { intermediates: true },
    );
    expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/pick.jpg',
      to: `${MOCK_DOCUMENT_DIRECTORY}photos/progress/photo-id-1.jpg`,
    });
  });

  it('does not recreate the directory when it already exists', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    await saveProgressPhotoFile('photo-id-2', '2026-07-20', 'file:///cache/pick.jpg');

    expect(mockFileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  });
});

describe('deleteProgressPhotoFile (MeasurementRepositoryDeps.deletePhotoFile)', () => {
  it('deletes the file idempotently by its absolute uri', async () => {
    await deleteProgressPhotoFile('photo-id-1.jpg');

    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
      `${MOCK_DOCUMENT_DIRECTORY}photos/progress/photo-id-1.jpg`,
      { idempotent: true },
    );
  });
});
