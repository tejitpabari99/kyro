/**
 * `lib/backup-file.ts` (M5-09, 05 §9) — the `expo-file-system`-only half of
 * the backup zip's file I/O: writing the finished zip archive to the cache
 * directory (mirrors `lib/csv-export-file.ts`'s `writeCacheTextFile`) and
 * reading an arbitrary picked file's bytes back as base64 (mirrors
 * `lib/hevy-import-file.ts`'s `readTextFile`, base64-flavored instead of
 * UTF-8 since a zip archive is binary). The progress-photo half of the same
 * "read/write raw file bytes" need lives in `lib/progress-photos.ts` instead
 * (`readProgressPhotoFileBase64`/`writeProgressPhotoFileBase64`, added by
 * this same task) — that file already owns every other progress-photo
 * on-disk operation (list/exists/delete), so the two new byte-level ones
 * join it rather than duplicating `photos/progress/` path construction here.
 *
 * Deliberately its own file rather than extending `csv-export-file.ts` or
 * `hevy-import-file.ts` in place — same "one native seam per feature, keep
 * an unmocked-under-Jest native import isolated to the smallest surface"
 * convention every other `lib/*-file.ts` module here already follows (see
 * `progress-photos.ts`'s header for the fullest statement of why this
 * matters: `app/_layout.tsx`'s boot wiring and several route-tree RNTL tests
 * transitively import a wide swath of `src/lib/**`, so a plain top-level
 * `expo-file-system/legacy` import — already established safe, unlike
 * `expo-sharing`/`expo-document-picker`/`expo-image-manipulator` — is the
 * only kind of native import this file may add at module scope).
 *
 * `EncodingType.Base64` (not `UTF8`) throughout: a zip archive is binary,
 * not text — `expo-file-system`'s own API has no raw-bytes read/write, only
 * a choice of string encodings for its string-in/string-out I/O, so base64
 * is the only lossless option (`lib/zip.ts`'s header, "Why base64-js",
 * explains the `Uint8Array` <-> base64 conversion this file's callers
 * — `features/data-transfer/backup-service.ts` — perform around these
 * functions).
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

/** Absolute `file://` URI for a cache-directory file name — same construction as `csv-export-file.ts`'s own `cacheFileUri` (not imported from there: that file's own header explains why cross-importing between these native-seam files isn't done, each stays a flat, independent function set). */
export function cacheBackupFileUri(fileName: string): string {
  return `${requireCacheDirectory()}${fileName}`;
}

/**
 * Writes `base64Contents` (a already-base64-encoded zip archive — see file
 * header) to `fileName` under the cache directory, returning its absolute
 * URI for `lib/share-file.ts`'s `shareFile` to consume. Overwrites any
 * existing file of the same name, same "every export re-derives its own
 * content deterministically, so overwrite-in-place is correct" reasoning
 * `writeCacheTextFile`'s own doc comment gives.
 */
export async function writeCacheBackupZip(fileName: string, base64Contents: string): Promise<string> {
  const uri = cacheBackupFileUri(fileName);
  await FileSystem.writeAsStringAsync(uri, base64Contents, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/**
 * Reads `fileUri` (typically a document-picker result's own `uri` — the
 * user-picked `kyro_backup_{date}.zip`) as base64 text. Deliberately makes
 * no assumption about which directory root `fileUri` lives under, same
 * `hevy-import-file.ts`'s `readTextFile` reasoning: a picked file's URI can
 * point anywhere the OS resolved it to, and `readAsStringAsync` itself
 * handles that resolution.
 */
export async function readBackupZipFile(fileUri: string): Promise<string> {
  return FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
}
