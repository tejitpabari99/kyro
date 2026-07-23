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
 * relative names stored in `images[]`) is `M1-09`'s scope (`src/lib/files.ts`
 * is still a stub, `M1-06`'s header note) — no custom exercise can have a
 * non-empty `images[]` yet, so this always returns `undefined` for customs
 * today, correctly falling through to the initial-letter placeholder (03
 * §2's acceptance criterion: "Placeholder thumbnails render for exercises
 * without images"). Once M1-09 lands a real file-URI convention, this is
 * the one function that needs updating to resolve it — everything else in
 * this feature (row, list) already treats the return value opaquely.
 */
import { BUILTIN_THUMBNAILS } from './exercise-thumbnail-registry.generated';

/** The subset of `Exercise` (`@/data/exercises/types`) this resolver needs. */
export interface ThumbnailableExercise {
  id: string;
  isCustom: boolean;
  images: readonly string[];
}

export function resolveExerciseThumbnailSource(
  exercise: ThumbnailableExercise,
): number | undefined {
  if (exercise.images.length === 0) {
    return undefined;
  }
  if (exercise.isCustom) {
    // See file header — no on-device file-URI convention exists yet (M1-09).
    return undefined;
  }
  return BUILTIN_THUMBNAILS[exercise.id];
}
