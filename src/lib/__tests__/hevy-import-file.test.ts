/**
 * `lib/hevy-import-file.ts` unit tests (M5-07) — `pickFile`/`readTextFile`
 * against fully mocked `expo-document-picker`/`expo-file-system/legacy`.
 * Split into its own test file for the same reason the module itself is
 * split from `files.test.ts` — see that module's header.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { pickFile, readTextFile } from '../hevy-import-file';

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

// `expo-document-picker` is *lazily* `require()`d inside `pickFile` itself
// (never a top-level import — see `hevy-import-file.ts`'s own header for
// why: it throws `Cannot find native module 'ExpoDocumentPicker'` at
// module-evaluation time). `jest.mock` still intercepts it correctly
// regardless of `require` vs. `import` — same convention `share-file.test.ts`
// already established for `expo-sharing`'s identical lazy-require shape.
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

const mockFileSystem = FileSystem as unknown as { readAsStringAsync: jest.Mock };

/**
 * Fetches the *current* `expo-document-picker` mock fresh on every call,
 * rather than a single `require(...)` captured once at file-top — `pickFile`
 * itself lazily `require()`s this module on every invocation (by design),
 * and this file's own "unavailable" test calls `jest.resetModules()`, which
 * invalidates any already-captured `require('expo-document-picker')`
 * reference. Re-requiring fresh here keeps this file's own mock in sync
 * with whatever `pickFile` actually sees regardless of test order.
 */
function getMockDocumentPicker(): { getDocumentAsync: jest.Mock } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- matches the module's own lazy require.
  return require('expo-document-picker') as { getDocumentAsync: jest.Mock };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickFile', () => {
  it('returns the picked file uri/name on a successful pick', async () => {
    const mockDocumentPicker = getMockDocumentPicker();
    mockDocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/hevy_export.csv', name: 'hevy_export.csv' }],
    });

    const result = await pickFile();

    expect(result).toEqual({ uri: 'file:///cache/hevy_export.csv', name: 'hevy_export.csv' });
    expect(mockDocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ copyToCacheDirectory: true, multiple: false }),
    );
  });

  it('returns null when the user cancels the picker', async () => {
    getMockDocumentPicker().getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickFile()).toBeNull();
  });

  it('returns null when canceled:false but assets is somehow empty (defensive)', async () => {
    getMockDocumentPicker().getDocumentAsync.mockResolvedValue({ canceled: false, assets: [] });

    expect(await pickFile()).toBeNull();
  });

  it('passes a custom type option through when given', async () => {
    const mockDocumentPicker = getMockDocumentPicker();
    mockDocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

    await pickFile({ type: 'text/csv' });

    expect(mockDocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text/csv' }),
    );
  });

  it('returns null (not throw) when the document picker native module is unavailable', async () => {
    jest.resetModules();
    jest.doMock('expo-document-picker', () => {
      throw new Error("Cannot find native module 'ExpoDocumentPicker'");
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isolated = require('../hevy-import-file') as typeof import('../hevy-import-file');
    await expect(isolated.pickFile()).resolves.toBeNull();
  });
});

describe('readTextFile', () => {
  it('reads a file uri as UTF-8 text', async () => {
    mockFileSystem.readAsStringAsync.mockResolvedValue('"title","reps"\n"Bench Press","5"\n');

    const text = await readTextFile('file:///cache/hevy_export.csv');

    expect(text).toBe('"title","reps"\n"Bench Press","5"\n');
    expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/hevy_export.csv',
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });
});
