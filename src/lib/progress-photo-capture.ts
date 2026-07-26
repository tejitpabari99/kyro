/**
 * Progress-photo capture pipeline (M5-03, 04 §6.2 / 05 §8) — camera/library
 * pick (`pickProgressPhoto`) and the re-encode-and-save step
 * (`saveProgressPhotoFile`, the real `MeasurementRepositoryDeps
 * .savePhotoFile` implementation). Split out of `progress-photos.ts`
 * specifically because these two functions are the only ones that need
 * `expo-image-manipulator`/`expo-image-picker` — see that file's header for
 * the full "why `app/_layout.tsx` must never transitively import those two
 * packages" rationale (no jest-expo automock for either, confirmed
 * empirically against `app/**` route tests that render the full route
 * tree). Only `PhotoGalleryScreen.tsx` and the `app/(tabs)/profile/measures/
 * photos/**` route files import from this module — never `app/_layout.tsx`.
 *
 * ## Re-encode: probe-then-resize (why two `manipulateAsync` calls)
 *
 * `MeasurementRepositoryDeps.savePhotoFile`'s fixed signature is
 * `(id, date, sourceUri) => Promise<string>` — only a URI, no width/height
 * (unlike `saveExercisePhoto`, which receives a `PickedExercisePhoto` with
 * both because `ExerciseFormScreen` still holds the picker result object at
 * its call site). By the time `MeasurementRepository.addPhoto(date,
 * sourceUri)` calls this hook, that shape has already been narrowed to a
 * bare string (05 §3.4's own interface), so this file has no dimensions to
 * work with up front. `manipulateAsync(uri, [], {...})` with an empty
 * action list still performs a real decode + re-encode (at the target
 * quality/format) and returns the resulting `{width, height}` — used here
 * purely as a cheap probe for "is either side over 2048px?" A second
 * `manipulateAsync` call with a `resize` action only runs when that probe
 * says the image actually needs downsizing, so a small-enough source image
 * (already under 2048px on both sides) only pays for one encode, not two.
 * `resize: {width}` *or* `resize: {height}` (never both) — `ActionResize`'s
 * own doc comment (`expo-image-manipulator`'s `ImageManipulator.types.ts`)
 * guarantees "if you specify only one value, the other is calculated
 * automatically to preserve image ratio", which is exactly "cap the longest
 * side at 2048px, keep aspect" without this file needing its own aspect-
 * ratio math (contrast `saveExercisePhoto`'s square crop, which does need
 * that math because it crops to a fixed 1:1 first).
 *
 * ## Why plain top-level native imports (not deferred)
 *
 * This file lives under `src/lib/**`, which `jest.config.js` only runs
 * under the `ui` project — `__tests__/progress-photo-capture.test.ts` mocks
 * `expo-file-system/legacy` / `expo-image-manipulator` / `expo-image-picker`
 * at the module boundary before this file is ever required, the same
 * pattern `files.test.ts` already established. Every real call site
 * (`PhotoGalleryScreen.tsx`, the photo route files) is also `src/features/**`
 * or `app/**`, never `app/_layout.tsx` — see this file's header.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { buildProgressPhotoFileName, ensureProgressPhotoDirExists } from './progress-photos';

/** Camera vs. library pick source — same two options `files.ts`'s `ExercisePhotoPickSource` names, declared independently here (see `pickProgressPhoto`'s doc comment on why this file keeps its own small copy rather than importing `files.ts`'s). */
export type ProgressPhotoPickSource = 'library' | 'camera';
/** The subset of `expo-image-picker`'s `ImagePickerAsset` this seam exposes upward — identical shape to `files.ts`'s `PickedExercisePhoto`, declared independently for the same reason. */
export interface PickedProgressPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Max post-resize side length for a stored progress photo (05 §8: "re-encoded <= 2048 px"). */
export const PROGRESS_PHOTO_MAX_DIMENSION = 2048;
/** JPEG re-encode quality (05 §8: "q80"). */
export const PROGRESS_PHOTO_JPEG_QUALITY = 0.8;

/**
 * Opens the photo library or camera (04 §6.2 / 05 §8), requesting the
 * matching permission first. Returns `null` on a denied permission or a
 * user cancel — same silent-no-op posture `pickExercisePhoto` (`files.ts`)
 * already established; a small deliberate duplicate of that function's body
 * rather than a shared call (that file's header already sets the precedent
 * for this — see `generatePhotoFileUuid`'s "why not shared" note — kept
 * consistent here so this file's native-touching functions don't reach into
 * `files.ts` for anything beyond the plain path constant).
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

  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * The real `MeasurementRepositoryDeps.savePhotoFile` implementation (M5-03)
 * — re-encodes `sourceUri` (<= 2048 px longest side, q80 JPEG per 05 §8) and
 * copies the result into `photos/progress/{id}.jpg`. `date` is accepted
 * (matching the deps signature, `../data/measurements/types.ts`) but
 * unused — the flat, per-id file layout (see file header) has no per-date
 * subfolder to place it in. Returns only the relative file name, never
 * `progressPhotoUri`'s absolute form (05 §8: "DB stores relative file names
 * only").
 */
export async function saveProgressPhotoFile(
  id: string,
  _date: string,
  sourceUri: string,
): Promise<string> {
  const dirUri = await ensureProgressPhotoDirExists();

  // Probe pass — see file header's "probe-then-resize" note. Already a real
  // re-encode at the target quality/format, so a source image that's
  // already small enough needs no second pass.
  const probe = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: PROGRESS_PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const longestSide = Math.max(probe.width, probe.height);
  const manipulated =
    longestSide > PROGRESS_PHOTO_MAX_DIMENSION
      ? await ImageManipulator.manipulateAsync(
          sourceUri,
          [
            {
              resize:
                probe.width >= probe.height
                  ? { width: PROGRESS_PHOTO_MAX_DIMENSION }
                  : { height: PROGRESS_PHOTO_MAX_DIMENSION },
            },
          ],
          { compress: PROGRESS_PHOTO_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
        )
      : probe;

  const fileName = buildProgressPhotoFileName(id);
  await FileSystem.copyAsync({ from: manipulated.uri, to: `${dirUri}${fileName}` });

  return fileName;
}
