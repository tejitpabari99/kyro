/**
 * `lib/backup-file.ts` tests (M5-09) — cache-directory URI construction and
 * the real `writeAsStringAsync`/`readAsStringAsync` calls, mocked at the
 * `expo-file-system/legacy` boundary (same convention `csv-export-file.test.ts`
 * established, base64-flavored here instead of UTF-8).
 */
import * as FileSystem from 'expo-file-system/legacy';

import { cacheBackupFileUri, readBackupZipFile, writeCacheBackupZip } from '../backup-file';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

const mockFileSystem = FileSystem as unknown as {
  cacheDirectory: string | null;
  writeAsStringAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSystem.cacheDirectory = 'file:///mock-cache/';
  mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
  mockFileSystem.readAsStringAsync.mockResolvedValue('base64-zip-contents');
});

describe('cacheBackupFileUri', () => {
  it('joins cacheDirectory + file name with no double slash', () => {
    expect(cacheBackupFileUri('kyro_backup_2026-07-26.zip')).toBe(
      'file:///mock-cache/kyro_backup_2026-07-26.zip',
    );
  });

  it('throws if cacheDirectory is unavailable (no native host)', () => {
    jest.resetModules();
    jest.doMock('expo-file-system/legacy', () => ({
      cacheDirectory: null,
      writeAsStringAsync: jest.fn(),
      readAsStringAsync: jest.fn(),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isolated = require('../backup-file') as typeof import('../backup-file');
    expect(() => isolated.cacheBackupFileUri('x.zip')).toThrow(/cacheDirectory/);
  });
});

describe('writeCacheBackupZip', () => {
  it('writes base64 contents to the cache-directory URI, base64-encoded, and returns that URI', async () => {
    const uri = await writeCacheBackupZip('kyro_backup_2026-07-26.zip', 'QUJD');

    expect(uri).toBe('file:///mock-cache/kyro_backup_2026-07-26.zip');
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-cache/kyro_backup_2026-07-26.zip',
      'QUJD',
      { encoding: 'base64' },
    );
  });
});

describe('readBackupZipFile', () => {
  it('reads the given URI as base64 text, regardless of directory root', async () => {
    const text = await readBackupZipFile('file:///picked/somewhere/backup.zip');

    expect(text).toBe('base64-zip-contents');
    expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'file:///picked/somewhere/backup.zip',
      { encoding: 'base64' },
    );
  });
});
