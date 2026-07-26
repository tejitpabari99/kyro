/**
 * Progress-photo file seam (M5-02) — wires `MeasurementRepositoryDeps`'
 * `savePhotoFile`/`deletePhotoFile` hooks (`src/data/measurements/types.ts`)
 * to the real `expo-file-system` filesystem, plus the `expo-image-picker`
 * camera/library capture step the log-entry sheet's photo-attach section
 * needs (05 §8: `photos/progress/{uuid}.jpg`, DB stores relative file names
 * only).
 *
 * ## Why this lives here, not `src/lib/files.ts`
 *
 * `files.ts` already reserves `PROGRESS_PHOTOS_ROOT` as a bare path
 * constant with an explicit "no read/write helpers yet — M5" note in its
 * own header. M5-03 (progress-photo gallery/compare/orphan-sweep, the next
 * task in this milestone) is the one that owns the *real* photo-processing
 * pipeline 05 §8 asks for (re-encode <= 2048 px q80 via
 * `expo-image-manipulator`). This task's own instructions are explicit that
 * its photo-attach section should stay "self-contained and simple" — a
 * plain copy, no re-encode — so rather than half-implement that pipeline
 * inside `files.ts` now and have M5-03 rework it, this minimal, un-re-encoded
 * copy lives in its own feature-local file. M5-03 can freely replace/extend
 * just this one file (or fold its logic into `files.ts` alongside the
 * re-encode step) without touching the repository-construction call site in
 * `app/(tabs)/profile/measures/*.tsx` at all — the exact "swap the dep, not
 * the call site" seam `MeasurementRepositoryDeps`'s own doc comment
 * describes. No square-crop here either (unlike `saveExercisePhoto`) — a
 * progress photo is a full-frame body photo; cropping it square would be
 * actively wrong.
 *
 * `src/features/**` has no import restriction against native Expo packages
 * (`eslint.config.js`'s `import/no-restricted-paths` only forbids
 * `src/features` importing `./app` — see that config's own zones), so this
 * file imports `expo-file-system/legacy`/`expo-image-picker` directly, the
 * same "plain top-level native import, mocked at the module boundary in
 * tests" posture `files.ts`'s own header documents for the equivalent
 * `src/lib/**` seam.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { PROGRESS_PHOTOS_ROOT } from '@/lib/files';

export type ProgressPhotoPickSource = 'library' | 'camera';

/** The subset of `expo-image-picker`'s picked asset this seam exposes upward. */
export interface PickedProgressPhoto {
  uri: string;
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

/** `${documentDirectory}photos/progress/`, trailing slash included. */
function progressPhotosDirUri(): string {
  return `${requireDocumentDirectory()}${PROGRESS_PHOTOS_ROOT}/`;
}

/**
 * Absolute `file://` URI for one stored progress photo — `fileName` is
 * exactly `ProgressPhoto.fileName` (05 §8's relative-name rule), never an
 * absolute path. Used by `LogEntrySheet`'s thumbnail row to render already-
 * saved photos.
 */
export function progressPhotoUri(fileName: string): string {
  return `${progressPhotosDirUri()}${fileName}`;
}

async function ensureProgressPhotosDirExists(): Promise<string> {
  const dirUri = progressPhotosDirUri();
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
  return dirUri;
}

/**
 * Opens the photo library or camera, requesting the matching permission
 * first. Returns `null` on a denied permission or a user cancel — both are
 * ordinary, silent no-ops (same posture `pickExercisePhoto`, `src/lib/
 * files.ts`, already establishes), never a thrown error.
 */
export async function pickProgressPhoto(
  source: ProgressPhotoPickSource,
): Promise<PickedProgressPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const launch =
    source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
  const result = await launch({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return { uri: result.assets[0]!.uri };
}

/**
 * `MeasurementRepositoryDeps.savePhotoFile` — copies the picked `sourceUri`
 * into `photos/progress/{id}.jpg` and returns the relative file name (`id`
 * is also the file basename, `progress_photos.id`'s own DDL comment, 05
 * §3.4). No re-encode/resize (see file header) — M5-03 layers the
 * documented 2048 px/q80 step on top. `date` is unused (the file layout is
 * flat by id, not nested by date) — kept in the signature only to satisfy
 * `MeasurementRepositoryDeps.savePhotoFile`'s shape.
 */
export async function saveProgressPhotoFile(
  id: string,
  _date: string,
  sourceUri: string,
): Promise<string> {
  const dirUri = await ensureProgressPhotosDirExists();
  const fileName = `${id}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: `${dirUri}${fileName}` });
  return fileName;
}

/**
 * `MeasurementRepositoryDeps.deletePhotoFile` — idempotent (a missing file
 * is not an error, same posture `deleteExercisePhoto` establishes).
 */
export async function deleteProgressPhotoFile(fileName: string): Promise<void> {
  await FileSystem.deleteAsync(progressPhotoUri(fileName), { idempotent: true });
}
