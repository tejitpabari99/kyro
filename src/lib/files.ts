/**
 * File-picker / filesystem seam (06 §10) — the single mockable boundary
 * between app code and the native filesystem/media packages (08 §5: "...
 * file pickers ... via src/lib/ seams"). Custom-exercise photo storage
 * (M1-09, everything below): `05` §8's on-device convention —
 * `${documentDirectory}photos/exercises/{exerciseId}/{uuid}.jpg`, DB rows
 * store the **relative file name only** (never an absolute path — the
 * documents-dir container path changes across reinstalls/devices, 05 §8) —
 * plus the `expo-image-picker` library/camera pick and the
 * `expo-image-manipulator` square-crop re-encode 03 §5's create/edit form
 * needs.
 *
 * The Hevy CSV import document picker (`pickFile`/`readTextFile`, M5-07)
 * deliberately does **not** live here — see `lib/hevy-import-file.ts`'s own
 * header for why routing it through this file (which has two plain
 * top-level native imports with no jest-expo automock) would drag both into
 * every test that imports the import service, the same "split for
 * jest-mockability" reasoning `lib/csv-export-file.ts` (M5-06) already
 * established for CSV *export*'s own file-write half.
 *
 * `photos/progress/` (M5's progress-photo feature, 05 §8) is reserved here
 * as a bare constant (`PROGRESS_PHOTOS_ROOT`) only — no read/write helpers
 * for it exist yet, matching this task's explicit scope note ("reserve the
 * path convention for M5, just the constant/helper, not the progress-photo
 * feature itself").
 *
 * ## Why plain top-level imports of the native packages (not a deferred
 * `import()`, unlike `src/data/shared/uuid.ts`)
 *
 * `src/data/shared/uuid.ts` defers its `expo-crypto` import because that
 * module must also load cleanly under the fast **`node`** Jest project
 * (`src/data/**`, no native-module host mocked/present at all). This file
 * lives under `src/lib/**`, which `jest.config.js` only ever runs under the
 * **`ui`** (`jest-expo`) project — exactly where `src/lib/sentry.ts`
 * already sets the precedent of a plain top-level
 * `import * as Sentry from '@sentry/react-native'`, relying on the test
 * file's own `jest.mock('@sentry/react-native', ...)` to intercept it
 * before this module is ever evaluated. `files.test.ts` follows the same
 * pattern for `expo-file-system/legacy`, `expo-image-manipulator`, and
 * `expo-image-picker`.
 *
 * `expo-file-system/legacy` (not the bare `expo-file-system` entry point)
 * is used deliberately: SDK 56's default export is the newer
 * `File`/`Directory` object-oriented API; the **legacy** promise-based
 * function API (`documentDirectory`, `getInfoAsync`, `makeDirectoryAsync`,
 * `copyAsync`, `deleteAsync`) matches `05` §8's own `${documentDirectory}`
 * string-path framing far more directly, and — just as importantly for
 * testability — is a flat set of plain function/constant exports that a
 * `jest.mock` factory can trivially stub, rather than a class hierarchy
 * with instance methods and getters.
 *
 * ## Why the per-photo UUID isn't `src/data/shared/uuid.ts`'s `generateUuid`
 *
 * That module explicitly cannot be imported from here: `eslint.config.js`'s
 * `import/no-restricted-paths` forbids `src/lib` from importing
 * `src/data/**` (06 §2: "app/features depend on lib, never the reverse" —
 * and symmetrically, 05's data-layer zone forbids the reverse import too,
 * so neither direction can host a single shared copy without breaking a
 * lint gate). `generatePhotoFileUuid` below is therefore a small, deliberate
 * local copy of that module's exact "prefer `crypto.randomUUID`, else
 * `expo-crypto`" logic — see that file's header for the full rationale,
 * which applies unchanged here (a per-file id has the same
 * global-uniqueness need as a per-row id, once cloud sync (MC-03) lands).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// ---------------------------------------------------------------------------
// Custom exercise photo storage (M1-09, 05 §8)
// ---------------------------------------------------------------------------

/** `${documentDirectory}` root for custom-exercise photos (05 §8), relative form. */
export const EXERCISE_PHOTOS_ROOT = 'photos/exercises';

/**
 * `${documentDirectory}` root reserved for M5's progress-photo feature (05
 * §8: `photos/progress/{uuid}.jpg`) — constant only, per this task's scope;
 * no read/write helper is built against it yet.
 */
export const PROGRESS_PHOTOS_ROOT = 'photos/progress';

const EXERCISE_PHOTO_EXTENSION = '.jpg';
/**
 * Max post-crop side length for a stored exercise photo. `05` §8 only
 * specifies a figure for progress photos (2048 px/q80); exercise photos
 * have no doc-given number, so this reuses a conservative, detail-page-
 * appropriate size in the same spirit (small enough to keep the bundle-size
 * discipline `03` §6.5 cares about for the *bundled* dataset from bleeding
 * into user-generated content, generous enough for a full-width 16:9 header,
 * `ExerciseMedia`/M1-08).
 */
const EXERCISE_PHOTO_MAX_DIMENSION = 1024;
const EXERCISE_PHOTO_JPEG_QUALITY = 0.8;

/** Builds the stored file name for a newly-saved exercise photo — always `<uuid>.jpg` (05 §8's own example format). */
export function buildExercisePhotoFileName(uuid: string): string {
  return `${uuid}${EXERCISE_PHOTO_EXTENSION}`;
}

/**
 * The directory holding one exercise's photos, **relative to
 * `documentDirectory`** — never includes the `documentDirectory` prefix
 * itself (that join only happens in `exercisePhotoDirUri`/`exercisePhotoUri`
 * below, the two functions that actually need a real native root). Pure,
 * synchronous, no native import touched — directly unit-testable without
 * any mock.
 */
export function exercisePhotoRelativeDir(exerciseId: string): string {
  return `${EXERCISE_PHOTOS_ROOT}/${exerciseId}`;
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

/** Absolute `file://` URI of the directory holding one exercise's photos, trailing slash included. */
export function exercisePhotoDirUri(exerciseId: string): string {
  return `${requireDocumentDirectory()}${exercisePhotoRelativeDir(exerciseId)}/`;
}

/**
 * Absolute `file://` URI for one stored exercise photo — the shape
 * `ExerciseMedia`/`resolveExerciseThumbnailSource` (M1-08/M1-07) need to
 * actually render a custom exercise's image; `fileName` is exactly what
 * `Exercise.images[]` stores (05 §8's relative-name rule), never an
 * absolute path.
 */
export function exercisePhotoUri(exerciseId: string, fileName: string): string {
  return `${exercisePhotoDirUri(exerciseId)}${fileName}`;
}

async function ensureExercisePhotoDirExists(exerciseId: string): Promise<string> {
  const dirUri = exercisePhotoDirUri(exerciseId);
  const info = await FileSystem.getInfoAsync(dirUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }
  return dirUri;
}

/** See "Why the per-photo UUID isn't `src/data/shared/uuid.ts`'s `generateUuid`" above. */
async function generatePhotoFileUuid(): Promise<string> {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof globalCrypto?.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  const ExpoCrypto = await import('expo-crypto');
  return ExpoCrypto.randomUUID();
}

export type ExercisePhotoPickSource = 'library' | 'camera';

/** The subset of `expo-image-picker`'s `ImagePickerAsset` this seam exposes upward — just enough for `saveExercisePhoto`'s square-crop math. */
export interface PickedExercisePhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Opens the photo library or camera (03 §5: "Image (optional): photo
 * library / camera"), requesting the matching permission first. Returns
 * `null` on a denied permission or a user cancel — both are ordinary,
 * silent no-ops from the form's point of view (no error to surface), never
 * a thrown error.
 */
export async function pickExercisePhoto(
  source: ExercisePhotoPickSource,
): Promise<PickedExercisePhoto | null> {
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

  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Square-crops (centered) + re-encodes `image` via `expo-image-manipulator`
 * and copies the result into `photos/exercises/{exerciseId}/` under a fresh
 * UUID file name (05 §8). Returns **only the relative file name** — the
 * exact value callers must pass to `ExerciseRepository.create`/`update`'s
 * `images` field, never `exercisePhotoUri`'s absolute form (05 §8: "DB
 * stores relative file names only").
 */
export async function saveExercisePhoto(
  exerciseId: string,
  image: PickedExercisePhoto,
): Promise<string> {
  const dirUri = await ensureExercisePhotoDirExists(exerciseId);

  const side = Math.min(image.width, image.height);
  const originX = Math.floor((image.width - side) / 2);
  const originY = Math.floor((image.height - side) / 2);

  const actions: ImageManipulator.Action[] = [
    { crop: { originX, originY, width: side, height: side } },
  ];
  if (side > EXERCISE_PHOTO_MAX_DIMENSION) {
    actions.push({
      resize: { width: EXERCISE_PHOTO_MAX_DIMENSION, height: EXERCISE_PHOTO_MAX_DIMENSION },
    });
  }

  const manipulated = await ImageManipulator.manipulateAsync(image.uri, actions, {
    compress: EXERCISE_PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const fileName = buildExercisePhotoFileName(await generatePhotoFileUuid());
  await FileSystem.copyAsync({ from: manipulated.uri, to: `${dirUri}${fileName}` });

  return fileName;
}

/** Deletes one stored exercise photo. Idempotent — a missing file is not an error (mirrors `03` §5's delete/archive posture: never throw on an already-gone side effect). */
export async function deleteExercisePhoto(exerciseId: string, fileName: string): Promise<void> {
  await FileSystem.deleteAsync(exercisePhotoUri(exerciseId, fileName), { idempotent: true });
}

/**
 * Deletes an exercise's entire photo directory — called alongside a hard
 * `ExerciseRepository.delete` (03 §5: zero-reference delete removes image
 * files too; `05` §8 frames file-deletion as "the repository's
 * responsibility," but `src/data/**` may not import `src/lib/**` at all,
 * 06 §2's dependency rule — so the orchestration necessarily happens one
 * layer up, at the feature/route call site that already legally reaches
 * both `ExerciseRepository` and this seam, `ExerciseDetailScreen`, M1-10).
 * Idempotent — a custom exercise that never had a photo has no directory to
 * remove, which is not an error.
 */
export async function deleteExercisePhotos(exerciseId: string): Promise<void> {
  await FileSystem.deleteAsync(exercisePhotoDirUri(exerciseId), { idempotent: true });
}
