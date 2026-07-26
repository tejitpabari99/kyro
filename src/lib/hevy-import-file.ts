/**
 * Hevy CSV import file seam (M5-07, 05 §7.2) — document-picker + text-read,
 * split into its **own** file rather than living in `lib/files.ts` (where
 * this task's `pickFile` TODO stub originally sat) for the exact reason
 * `lib/csv-export-file.ts` (M5-06) split off `files.ts` in the first place:
 * `files.ts` has plain top-level `expo-image-manipulator`/`expo-image-picker`
 * imports (no jest-expo automock) for its own exercise-photo functions, so
 * merely importing *anything* from `files.ts` — even just `pickFile`, which
 * itself only lazily `require()`s `expo-document-picker` — evaluates those
 * two unrelated native modules at module-load time and throws under any test
 * that doesn't also mock them (confirmed the hard way: `hevy-import-
 * service.ts` originally imported `readTextFile` from `files.ts`, and its
 * own integration test — which has no reason to mock image-picker/
 * -manipulator — failed with `Cannot find native module
 * 'ExpoImageManipulator'`). This file's only top-level native import is
 * `expo-file-system/legacy`, the same "flat function exports, trivially
 * `jest.mock`-able" module `csv-export-file.ts`/`progress-photos.ts` already
 * established as safe to import bare.
 *
 * `pickFile` itself does **not** add a plain top-level `import * as
 * DocumentPicker from 'expo-document-picker'` — confirmed empirically
 * (`node_modules/.../expo-document-picker/build/ExpoDocumentPicker.js`:
 * `export default requireNativeModule('ExpoDocumentPicker')`, evaluated at
 * **module load time**, not inside a function) that it fails the exact same
 * way `lib/share-file.ts`'s own header documents for `expo-sharing`: loading
 * it eagerly would throw `Cannot find native module 'ExpoDocumentPicker'`
 * the instant *any* test transitively imports this file, not just a test
 * that actually calls `pickFile`. A deferred dynamic `import()` doesn't
 * lower to a working `require()` under this repo's `ui`-project Jest/Babel
 * config either (`share-file.ts`'s own header works this out in detail) —
 * `loadExpoDocumentPicker` below is the same plain-`require()`-inside-a-
 * try/catch shape as `share-file.ts`'s own `loadExpoSharing`, fourth
 * instance of the identical fix (after `notifications.ts`/`sound.ts`/
 * `share-file.ts`).
 */
import * as FileSystem from 'expo-file-system/legacy';

export interface PickedFile {
  uri: string;
  name: string;
}

/** See file header — `null` means "module unavailable" (no native host, e.g. under Jest), handled identically to a user-cancelled pick. */
function loadExpoDocumentPicker(): typeof import('expo-document-picker') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load, see file header.
    return require('expo-document-picker') as typeof import('expo-document-picker');
  } catch {
    return null;
  }
}

/**
 * Opens the system document picker (M5-07, 05 §7.2's Hevy CSV import entry
 * point) restricted to `options.type` (defaults to CSV/plain-text MIME
 * types — a Hevy export is a `.csv` file, but iOS's Files app UTI detection
 * for a `.csv` extension varies by source app, so both are accepted rather
 * than only the one canonical MIME type). `copyToCacheDirectory: true` (the
 * package's own default) so the picked file is immediately readable via
 * `expo-file-system` regardless of which provider (iCloud Drive, a Files
 * extension, ...) it came from. Returns `null` uniformly for "the user
 * cancelled the picker" **and** "the document picker module itself isn't
 * available" (no native host) — both are ordinary, silent no-ops from the
 * caller's point of view, mirroring `files.ts`'s own `pickExercisePhoto`
 * cancel/denied convention.
 */
export async function pickFile(options?: { type?: string | string[] }): Promise<PickedFile | null> {
  const DocumentPicker = loadExpoDocumentPicker();
  if (!DocumentPicker) {
    return null;
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: options?.type ?? ['text/csv', 'text/comma-separated-values', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name };
}

/**
 * Reads `uri` (typically a {@link pickFile} result's own `uri`) as UTF-8
 * text — the Hevy CSV import flow's own read half of `csv-export-file.ts`'s
 * `writeCacheTextFile` (`expo-file-system/legacy`, same `EncodingType.UTF8`
 * convention). Deliberately does not assume the file lives under any
 * particular directory root: a document-picker result's `uri` can point
 * anywhere the OS resolved it to (cache dir when `copyToCacheDirectory` is
 * true, or a security-scoped external URI otherwise) — `readAsStringAsync`
 * itself handles that resolution, this function just wraps the encoding
 * option consistently with the writer.
 */
export async function readTextFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
