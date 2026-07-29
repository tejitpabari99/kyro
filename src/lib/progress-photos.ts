/**
 * Progress-photo file storage (M5-03, 05 §8) — path helpers plus the
 * `expo-file-system`-only operations: the real `MeasurementRepositoryDeps
 * .deletePhotoFile` implementation, and the two disk-inspection helpers
 * (`listProgressPhotoFileNames`/`progressPhotoFileExists`) the M5-03
 * boot-time orphan sweep (`src/features/measurements/photo-orphan-sweep.ts`)
 * uses.
 *
 * **Why the picker/re-encode half lives in a separate file
 * (`progress-photo-capture.ts`), not here:** `app/_layout.tsx` imports this
 * file directly (unconditionally, at module scope) to wire the orphan
 * sweep's boot step — and `app/_layout.tsx` itself is transitively
 * `require`d by *any* RNTL test that renders the app root or the full
 * `expo-router` route tree (`expo-router/testing-library`'s `renderRouter`,
 * used by several `app/**` route tests that have nothing to do with
 * measurements/photos at all). A plain top-level `import * as ImageManipulator
 * from 'expo-image-manipulator'`/`'expo-image-picker'` (found empirically,
 * while wiring the boot step, to have **no** jest-expo built-in automock —
 * unlike `expo-file-system/legacy`, which jest-expo mocks out of the box)
 * would then throw `Cannot find native module 'ExpoImageManipulator'` in
 * every one of those unrelated tests, none of which have any reason to
 * `jest.mock('expo-image-manipulator', ...)` themselves. Keeping this file
 * limited to `expo-file-system/legacy` only (already safely auto-mocked)
 * means `app/_layout.tsx`'s import stays safe for every existing test that
 * transitively loads it; `progress-photo-capture.ts`'s own two functions
 * (`pickProgressPhoto`/`saveProgressPhotoFile`, the ones that actually need
 * `expo-image-manipulator`/`expo-image-picker`) are reached only from
 * `PhotoGalleryScreen.tsx` and the three `app/(tabs)/profile/measures/
 * photos/**` route files — none of which `app/_layout.tsx` imports, and
 * whose own tests already mock those two packages explicitly (same
 * `files.test.ts` convention).
 *
 * ## Storage shape (05 §8 / 05 §3.4)
 *
 * `${documentDirectory}photos/progress/{id}.jpg` — flat (no per-date
 * subfolder: `progress_photos.date` is queryable in SQLite already, so the
 * filesystem doesn't need to mirror that grouping). `progress_photos.id` is
 * "also the file basename" (05 §3.4's own DDL comment) — unlike
 * `saveExercisePhoto`, which mints its own uuid internally,
 * `progress-photo-capture.ts`'s `saveProgressPhotoFile` takes `id` as a
 * parameter and never generates one itself, so that invariant holds by
 * construction (see `MeasurementRepositoryDeps.savePhotoFile`'s doc comment
 * in `../data/measurements/types.ts` for the full "why `id` is a parameter"
 * rationale — found in that type's own review).
 *
 * Deliberately a **separate file** from `src/lib/files.ts`, same "one file
 * per feature's file lifecycle" split that file's own header already
 * establishes (`sentry.ts`/`sound.ts`/`kv-store.expo.ts` precedent).
 * `PROGRESS_PHOTOS_ROOT` is **redeclared** here (a one-line duplicate of
 * `files.ts`'s own exported constant of the same name/value) rather than
 * imported — importing anything from `files.ts` would evaluate that file's
 * own plain top-level `expo-image-manipulator`/`expo-image-picker` imports
 * too, reintroducing the exact `app/_layout.tsx` breakage this file's own
 * split exists to avoid (see the section above). Both constants are
 * independently tested against the literal `'photos/progress'` string
 * (`files.test.ts` and this file's own test), so a future edit to one
 * without the other would be caught immediately.
 *
 * ## Why a plain top-level `expo-file-system/legacy` import is safe here
 *
 * Unlike `expo-image-manipulator`/`expo-image-picker` (see above),
 * `expo-file-system/legacy` degrades safely under Jest even when unmocked —
 * confirmed empirically (the `app/**` route tests that transitively load
 * this file via `app/_layout.tsx` never mock it and never failed on it;
 * only the other two packages did). `__tests__/progress-photos.test.ts`
 * still mocks it explicitly anyway, for the same "deterministic, assert
 * exact call args" reasons `files.test.ts` mocks its own natives, not
 * because leaving it real would crash.
 */
import * as FileSystem from 'expo-file-system/legacy';

/**
 * `${documentDirectory}` root for progress photos (05 §8:
 * `photos/progress/{uuid}.jpg`) — `files.ts` reserves this exact same
 * string as its own exported `PROGRESS_PHOTOS_ROOT` constant, but this file
 * deliberately does **not** import it from there: `files.ts` has its own
 * plain top-level `expo-image-manipulator`/`expo-image-picker` imports (for
 * its *own* exercise-photo functions), and importing anything from that
 * file — even just one string constant — evaluates those imports too,
 * defeating the entire point of this file being the safe,
 * `app/_layout.tsx`-importable half of the progress-photo seam (see the
 * header above). A one-line duplicated constant is a far smaller cost than
 * that coupling.
 */
const PROGRESS_PHOTOS_ROOT = 'photos/progress';

const PROGRESS_PHOTO_EXTENSION = '.jpg';

/** Builds the stored file name for a progress photo — always `<id>.jpg`, `id` being `progress_photos.id` (05 §3.4: "id ... also the file basename"). */
export function buildProgressPhotoFileName(id: string): string {
  return `${id}${PROGRESS_PHOTO_EXTENSION}`;
}

function requireDocumentDirectory(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error(
      'expo-file-system reported no documentDirectory — no native filesystem host present.',
    );
  }
  return root;
}

/** Absolute `file://` URI of the directory holding every progress photo, trailing slash included. */
export function progressPhotoDirUri(): string {
  return `${requireDocumentDirectory()}${PROGRESS_PHOTOS_ROOT}/`;
}

/** Absolute `file://` URI for one stored progress photo — `fileName` is exactly `progress_photos.file_name` (05 §8's relative-name rule), never an absolute path. */
export function progressPhotoUri(fileName: string): string {
  return `${progressPhotoDirUri()}${fileName}`;
}

/**
 * Ensures `photos/progress/` exists, creating it (with intermediates) if
 * not. Exported (not just an internal helper) so `progress-photo-capture
 * .ts`'s `saveProgressPhotoFile` can reuse the exact same directory-ensure
 * logic rather than duplicating it — that file needs the *directory* to
 * exist before it copies a manipulated image into it, but has no reason to
 * re-derive `progressPhotoDirUri`'s own construction.
 */
export async function ensureProgressPhotoDirExists(): Promise<string> {
  const dirUri = progressPhotoDirUri();
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
  return dirUri;
}

/**
 * The real `MeasurementRepositoryDeps.deletePhotoFile` implementation
 * (M5-03). Idempotent — a missing file is not an error, same
 * `deleteExercisePhoto` posture (`files.ts`).
 */
export async function deleteProgressPhotoFile(fileName: string): Promise<void> {
  await FileSystem.deleteAsync(progressPhotoUri(fileName), { idempotent: true });
}

/**
 * Every file name currently on disk under `photos/progress/` — the "files
 * without rows" half of the M5-03 orphan sweep (05 §8). Returns `[]` (never
 * throws) when the directory doesn't exist yet, e.g. a fresh install that
 * has never saved a progress photo — `readDirectoryAsync` itself throws on
 * a missing directory, so this always checks existence first.
 */
export async function listProgressPhotoFileNames(): Promise<string[]> {
  const dirUri = progressPhotoDirUri();
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    return [];
  }
  return FileSystem.readDirectoryAsync(dirUri);
}

/**
 * Whether `fileName` currently exists under `photos/progress/` — the "rows
 * without files" half of the M5-03 orphan sweep (05 §8): a `progress_photos`
 * row whose file this resolves `false` for should render a placeholder +
 * log a warning, never crash.
 */
export async function progressPhotoFileExists(fileName: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(progressPhotoUri(fileName));
  return info.exists;
}

/**
 * Reads one progress-photo file's raw bytes as base64 — the M5-09 backup
 * export's own read half of the "zip up every `photos/progress/*.jpg`" step
 * (05 §9). `EncodingType.Base64`, not `UTF8`: a JPEG is binary, not text
 * (`lib/zip.ts`'s header, "Why base64-js", explains the round trip this
 * feeds into). Lives here rather than `lib/backup-file.ts` because every
 * other progress-photo on-disk operation (list/exists/delete) already lives
 * in this file — joining them keeps `photos/progress/` path construction in
 * one place instead of duplicating `progressPhotoUri` in a second file.
 */
export async function readProgressPhotoFileBase64(fileName: string): Promise<string> {
  return FileSystem.readAsStringAsync(progressPhotoUri(fileName), {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Writes `base64Contents` to `photos/progress/<fileName>`, creating the
 * directory first if needed (fresh install / first-ever restore) —
 * `BackupService.restore`'s own "copy every zip'd photo file back into
 * photos/progress/" step (05 §9). Overwrites any existing file of the same
 * name (a restore is a replace-all operation by design — 05 §9's "replace-
 * all with double confirm"). Returns nothing: unlike `saveProgressPhotoFile`
 * (`progress-photo-capture.ts`), the caller already knows `fileName` — it
 * came from the zip archive's own `progress_photos.file_name`-derived entry
 * path, not minted here.
 */
export async function writeProgressPhotoFileBase64(
  fileName: string,
  base64Contents: string,
): Promise<void> {
  await ensureProgressPhotoDirExists();
  await FileSystem.writeAsStringAsync(progressPhotoUri(fileName), base64Contents, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
