/**
 * `lib/csv-export-file.ts` tests (M5-06) — cache-directory URI construction
 * and the real `writeAsStringAsync` call, mocked at the `expo-file-system/
 * legacy` boundary (same convention `files.test.ts` established for
 * `documentDirectory`, applied here to `cacheDirectory`).
 */
import * as FileSystem from 'expo-file-system/legacy';

import { cacheFileUri, writeCacheTextFile } from '../csv-export-file';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

const mockFileSystem = FileSystem as unknown as {
  cacheDirectory: string | null;
  writeAsStringAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSystem.cacheDirectory = 'file:///mock-cache/';
  mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
});

describe('cacheFileUri', () => {
  it('joins cacheDirectory + file name with no double slash', () => {
    expect(cacheFileUri('kyro_workouts.csv')).toBe('file:///mock-cache/kyro_workouts.csv');
  });

  it('throws if cacheDirectory is unavailable (no native host)', () => {
    jest.resetModules();
    jest.doMock('expo-file-system/legacy', () => ({
      cacheDirectory: null,
      writeAsStringAsync: jest.fn(),
      EncodingType: { UTF8: 'utf8' },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isolated = require('../csv-export-file') as typeof import('../csv-export-file');
    expect(() => isolated.cacheFileUri('x.csv')).toThrow(/cacheDirectory/);
  });
});

describe('writeCacheTextFile', () => {
  it('writes UTF-8 text to the cache-directory URI and returns that URI', async () => {
    const uri = await writeCacheTextFile('kyro_workouts.csv', 'a,b\n1,2\n');

    expect(uri).toBe('file:///mock-cache/kyro_workouts.csv');
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///mock-cache/kyro_workouts.csv',
      'a,b\n1,2\n',
      { encoding: 'utf8' },
    );
  });
});
