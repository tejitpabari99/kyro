/**
 * `resolveExerciseThumbnailSource` (M1-07) — 03 §2's row thumbnail: "44 pt
 * thumbnail (first image, or a colored circle with the exercise's initial as
 * placeholder)". Returns an `expo-image`-compatible `source` for the
 * bundled built-in thumbnail when one exists, or `undefined` when the
 * caller should fall back to `Avatar`/`Thumb`'s initial-letter placeholder
 * (`src/ui/Avatar.tsx`) — the exact contract that component already exposes
 * (`source?: ... | null`, omitted -> fallback).
 *
 * Built-ins (`isCustom: false`): every one of the 873 bundled exercises has
 * a `thumb.jpg` (M1-04's build pipeline, `assets/exercises/{id}/thumb.jpg`,
 * 128 px). Metro has no `require.context`/dynamic-path `require(...)`
 * equivalent, so a row keyed by a runtime `id` can't `require()` its image
 * directly — `./exercise-thumbnail-registry.generated.ts`
 * (`scripts/generate-exercise-thumbnail-registry.ts`) is the static-require
 * manifest that works around that, one `require(...)` per known id. This
 * function is the only thing that reads that registry.
 *
 * Customs (`isCustom: true`): `03 §5`/`05 §8`'s on-device file-storage
 * convention (`documentDirectory` roots under `photos/exercises/{id}/`,
 * `Exercise.images[]` holding only the bare relative file name —
 * `saveExercisePhoto`'s return value, `M1-09`'s `src/lib/files.ts`) resolves
 * via `exercisePhotoUri(exercise.id, exercise.images[0])`, the same helper
 * `exercise-media-source.ts` (M1-08, fixed in the M1-12 catch-up review —
 * see that file's header) and `ExerciseFormScreen`'s own image preview use
 * for this exact join. A custom with an empty `images[]` still falls through
 * to the initial-letter placeholder (03 §2's acceptance criterion:
 * "Placeholder thumbnails render for exercises without images") — this
 * function has no thumbnail-specific asset (only a full-size photo is ever
 * stored), so the row thumbnail is the same file `expo-image` just renders
 * smaller, not a separate 128px derivative like a built-in's `thumb.jpg`.
 */
import { exercisePhotoUri } from '@/lib/files';

import { BUILTIN_THUMBNAILS } from './exercise-thumbnail-registry.generated';

/** The subset of `Exercise` (`@/data/exercises/types`) this resolver needs. */
export interface ThumbnailableExercise {
  id: string;
  isCustom: boolean;
  images: readonly string[];
}

export function resolveExerciseThumbnailSource(
  exercise: ThumbnailableExercise,
): number | string | undefined {
  if (exercise.images.length === 0) {
    return undefined;
  }
  if (exercise.isCustom) {
    return exercisePhotoUri(exercise.id, exercise.images[0]);
  }
  return BUILTIN_THUMBNAILS[exercise.id];
}
