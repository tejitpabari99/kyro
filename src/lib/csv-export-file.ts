/**
 * CSV export file writing (M5-06, 05 §7.1) — the `expo-file-system`-only
 * half of the CSV-export seam: writes an already-encoded CSV string (from
 * `domain/csv-codec.ts`'s `encodeWorkoutsCsv`, glued together by
 * `features/data-transfer/csv-service.ts`) to the **cache** directory and
 * returns its absolute `file://` URI for `lib/share-file.ts`'s
 * `Sharing.shareAsync` to consume. Cache, not documents (`files.ts`/
 * `progress-photos.ts`'s own root for *persistent* user content) — an export
 * is a disposable, regeneratable-on-demand artifact the OS is free to reclaim
 * under storage pressure, exactly what `expo-file-system`'s own
 * `cacheDirectory` doc describes it for.
 *
 * Deliberately its **own** file rather than filling in `files.ts`'s existing
 * `writeFile` stub in place: that file has a plain top-level
 * `expo-image-manipulator`/`expo-image-picker` import for its own
 * exercise-photo functions, and neither package has a jest-expo built-in
 * automock (confirmed by that file's own header). `CsvService` is imported
 * by `SettingsScreen`/`HistoryDetailScreen` at module scope, so pulling in
 * `files.ts` from there would drag those two unmocked native imports into
 * every existing test of those two screens. `expo-file-system/legacy` alone
 * is safe — `progress-photos.ts` already established the identical split for
 * the identical reason (see that file's header); this file mirrors it.
 *
 * `cacheDirectory`/`EncodingType` are read/referenced only **inside** the
 * exported functions below, never at module scope — jest-expo's own built-in
 * `expo-file-system/legacy` automock (`jest-expo/src/preset/setup.js`)
 * stubs the function exports but not `cacheDirectory`/`EncodingType`
 * themselves, so any test that transitively imports this module without
 * ever calling `writeCacheTextFile` stays completely unaffected; a test that
 * *does* exercise the export flow re-mocks the module with its own
 * `cacheDirectory`/`EncodingType`, same convention `files.test.ts` already
 * established for `documentDirectory`.
 */
import * as FileSystem from 'expo-file-system/legacy';

function requireCacheDirectory(): string {
  const root = FileSystem.cacheDirectory;
  if (!root) {
    throw new Error(
      'expo-file-system reported no cacheDirectory — no native filesystem host present.',
    );
  }
  return root;
}

/** Absolute `file://` URI for a cache-directory file name — never includes `cacheDirectory`'s own prefix twice, never an already-absolute input. */
export function cacheFileUri(fileName: string): string {
  return `${requireCacheDirectory()}${fileName}`;
}

/**
 * Writes `contents` (UTF-8 text) to `fileName` under the cache directory,
 * returning its absolute URI. Overwrites any existing file of the same name
 * — every CSV export call re-derives its content deterministically from the
 * current DB state, so overwrite-in-place is correct (no stale-export
 * accumulation in the cache directory across repeated exports).
 */
export async function writeCacheTextFile(fileName: string, contents: string): Promise<string> {
  const uri = cacheFileUri(fileName);
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return uri;
}
