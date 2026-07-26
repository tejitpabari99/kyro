/**
 * `lib/progress-photo-capture` unit tests (M5-03 acceptance gate) — the real
 * implementation under test, with `expo-file-system/legacy` /
 * `expo-image-manipulator` / `expo-image-picker` mocked at the module
 * boundary, same pattern `files.test.ts` established for the analogous
 * exercise-photo seam. `../progress-photos` (the `ensureProgressPhotoDirExists`/
 * `buildProgressPhotoFileName` dependency) is mocked too, via its own manual
 * `__mocks__/progress-photos.ts` — this file only exercises the
 * picker/re-encode logic, not the path helpers (covered by
 * `progress-photos.test.ts`). Covers:
 *
 *  - `saveProgressPhotoFile`'s probe-then-resize re-encode (see that
 *    function's doc comment for the two-pass rationale): no second
 *    `manipulateAsync` call when the probe is already under the 2048 px cap;
 *    a `resize` action (width-only for landscape/square, height-only for
 *    portrait) when it isn't.
 *  - `pickProgressPhoto` permission/cancel/success paths.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { pickProgressPhoto, saveProgressPhotoFile } from '../progress-photo-capture';

jest.mock('../progress-photos');

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
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

const mockFileSystem = FileSystem as unknown as { copyAsync: jest.Mock };
const mockManipulator = ImageManipulator as unknown as { manipulateAsync: jest.Mock };
const mockPicker = ImagePicker as unknown as {
  requestCameraPermissionsAsync: jest.Mock;
  requestMediaLibraryPermissionsAsync: jest.Mock;
  launchCameraAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSystem.copyAsync.mockResolvedValue(undefined);
});

describe('saveProgressPhotoFile', () => {
  it('performs only one manipulateAsync pass when the probe is already under the 2048px cap', async () => {
    mockManipulator.manipulateAsync.mockResolvedValue({
      uri: 'file:///cache/probe.jpg',
      width: 1200,
      height: 900,
    });

    await saveProgressPhotoFile('photo-1', '2026-07-26', 'file:///picked.jpg');

    expect(mockManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
    expect(mockManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///picked.jpg',
      [],
      expect.objectContaining({ compress: 0.8, format: 'jpeg' }),
    );
  });

  it('adds a width-only resize action for a landscape/square image over the cap', async () => {
    mockManipulator.manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///cache/probe.jpg', width: 4000, height: 3000 })
      .mockResolvedValueOnce({ uri: 'file:///cache/resized.jpg', width: 2048, height: 1536 });

    await saveProgressPhotoFile('photo-1', '2026-07-26', 'file:///picked.jpg');

    expect(mockManipulator.manipulateAsync).toHaveBeenCalledTimes(2);
    expect(mockManipulator.manipulateAsync).toHaveBeenNthCalledWith(
      2,
      'file:///picked.jpg',
      [{ resize: { width: 2048 } }],
      expect.objectContaining({ compress: 0.8, format: 'jpeg' }),
    );
  });

  it('adds a height-only resize action for a portrait image over the cap', async () => {
    mockManipulator.manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///cache/probe.jpg', width: 3000, height: 4000 })
      .mockResolvedValueOnce({ uri: 'file:///cache/resized.jpg', width: 1536, height: 2048 });

    await saveProgressPhotoFile('photo-1', '2026-07-26', 'file:///picked.jpg');

    expect(mockManipulator.manipulateAsync).toHaveBeenNthCalledWith(
      2,
      'file:///picked.jpg',
      [{ resize: { height: 2048 } }],
      expect.anything(),
    );
  });

  it('copies the manipulated result to "<id>.jpg" (via the mocked dir helper) and returns only the relative file name', async () => {
    mockManipulator.manipulateAsync.mockResolvedValue({
      uri: 'file:///cache/probe.jpg',
      width: 500,
      height: 500,
    });

    const fileName = await saveProgressPhotoFile(
      'photo-uuid-9',
      '2026-07-26',
      'file:///picked.jpg',
    );

    expect(fileName).toBe('photo-uuid-9.jpg');
    expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/probe.jpg',
      to: 'file:///mock-documents/photos/progress/photo-uuid-9.jpg',
    });
  });
});

describe('pickProgressPhoto', () => {
  it('returns null and never opens the library when media-library permission is denied', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await pickProgressPhoto('library');

    expect(result).toBeNull();
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('returns null and never opens the camera when camera permission is denied', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    const result = await pickProgressPhoto('camera');

    expect(result).toBeNull();
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('returns null when the user cancels the library picker', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickProgressPhoto('library')).toBeNull();
  });

  it('returns the picked asset shape from the library', async () => {
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 1200, height: 900 }],
    });

    const result = await pickProgressPhoto('library');

    expect(result).toEqual({ uri: 'file:///picked.jpg', width: 1200, height: 900 });
  });

  it('returns the picked asset shape from the camera', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera.jpg', width: 1000, height: 1000 }],
    });

    const result = await pickProgressPhoto('camera');

    expect(result).toEqual({ uri: 'file:///camera.jpg', width: 1000, height: 1000 });
  });
});
