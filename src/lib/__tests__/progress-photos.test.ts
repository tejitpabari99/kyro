/**
 * `lib/progress-photos` unit tests (M5-03 acceptance gate) — the real
 * implementation under test, with `expo-file-system/legacy` mocked at the
 * module boundary, same pattern `files.test.ts` established for the
 * analogous exercise-photo seam. This file only ever needs
 * `expo-file-system/legacy` (never `expo-image-manipulator`/
 * `expo-image-picker` — see `../progress-photos.ts`'s header for exactly why
 * those two must never be pulled in here, and `../progress-photo-capture
 * .test.ts` for their own tests). Covers:
 *
 *  - Pure path/name construction (`buildProgressPhotoFileName`,
 *    `progressPhotoDirUri`, `progressPhotoUri`) — every "stored" value
 *    asserted to be a bare relative file name, never `file://`-prefixed
 *    (05 §8: "DB stores relative file names only").
 *  - `ensureProgressPhotoDirExists` (create-if-missing, no-op if present).
 *  - `deleteProgressPhotoFile` (idempotent delete).
 *  - `listProgressPhotoFileNames`/`progressPhotoFileExists` — the two
 *    disk-inspection helpers the orphan sweep (`photo-orphan-sweep.ts`)
 *    depends on, including the "directory doesn't exist yet" -> `[]` case
 *    (a fresh install that never saved a photo must not throw).
 */
import * as FileSystem from 'expo-file-system/legacy';

import {
  buildProgressPhotoFileName,
  deleteProgressPhotoFile,
  ensureProgressPhotoDirExists,
  listProgressPhotoFileNames,
  progressPhotoDirUri,
  progressPhotoFileExists,
  progressPhotoUri,
} from '../progress-photos';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));

const MOCK_DOCUMENT_DIRECTORY = 'file:///mock-documents/';

const mockFileSystem = FileSystem as unknown as {
  documentDirectory: string | null;
  getInfoAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  copyAsync: jest.Mock;
  deleteAsync: jest.Mock;
  readDirectoryAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSystem.documentDirectory = MOCK_DOCUMENT_DIRECTORY;
});

describe('path/name construction (pure, 05 §8)', () => {
  it('builds a "<id>.jpg" file name', () => {
    expect(buildProgressPhotoFileName('photo-uuid-1')).toBe('photo-uuid-1.jpg');
  });

  it('joins documentDirectory + the progress photos root with a trailing slash', () => {
    expect(progressPhotoDirUri()).toBe('file:///mock-documents/photos/progress/');
  });

  it('joins the full absolute URI for one stored file name', () => {
    expect(progressPhotoUri('abc.jpg')).toBe('file:///mock-documents/photos/progress/abc.jpg');
  });

  it('throws if documentDirectory is unavailable (no native host)', () => {
    mockFileSystem.documentDirectory = null;
    expect(() => progressPhotoDirUri()).toThrow(/documentDirectory/);
  });
});

describe('ensureProgressPhotoDirExists', () => {
  it('creates the directory when it does not yet exist', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);

    const dirUri = await ensureProgressPhotoDirExists();

    expect(dirUri).toBe('file:///mock-documents/photos/progress/');
    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/progress/',
      { intermediates: true },
    );
  });

  it('does not recreate the directory when it already exists', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });

    await ensureProgressPhotoDirExists();

    expect(mockFileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  });
});

describe('deleteProgressPhotoFile', () => {
  it('deletes one stored file idempotently', async () => {
    await deleteProgressPhotoFile('abc.jpg');

    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/progress/abc.jpg',
      { idempotent: true },
    );
  });
});

describe('listProgressPhotoFileNames (orphan sweep helper)', () => {
  it('returns [] without throwing when the progress photos directory does not exist yet', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });

    const names = await listProgressPhotoFileNames();

    expect(names).toEqual([]);
    expect(mockFileSystem.readDirectoryAsync).not.toHaveBeenCalled();
  });

  it('lists every file name under the progress photos directory when it exists', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    mockFileSystem.readDirectoryAsync.mockResolvedValue(['a.jpg', 'b.jpg']);

    const names = await listProgressPhotoFileNames();

    expect(names).toEqual(['a.jpg', 'b.jpg']);
    expect(mockFileSystem.readDirectoryAsync).toHaveBeenCalledWith(
      'file:///mock-documents/photos/progress/',
    );
  });
});

describe('progressPhotoFileExists (orphan sweep helper)', () => {
  it('resolves true when the file exists', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    expect(await progressPhotoFileExists('abc.jpg')).toBe(true);
  });

  it('resolves false when the file is missing', async () => {
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    expect(await progressPhotoFileExists('missing.jpg')).toBe(false);
  });
});
