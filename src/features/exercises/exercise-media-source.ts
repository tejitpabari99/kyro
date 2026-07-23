/**
 * `resolveExerciseMediaSources` (M1-08) — the priority-order resolution half
 * of the media-slot contract (03 §4): `exercise.animationUri` (future,
 * always `null` today) -> `images[0..1]` crossfade -> `images[0]` static ->
 * placeholder. Split out of `ExerciseMedia.tsx` itself so the
 * source-selection logic (which asset each tier actually points at) is
 * separately unit-testable from the component's render/interval behavior.
 *
 * **Built-ins vs. customs — why this can't be one lookup:** built-in
 * `images[]` entries are `assets/exercise-db.json` asset-key strings
 * (`"exercises/{id}/0.jpg"`), not directly usable as an `expo-image`
 * `source` — Metro has no `require.context`/dynamic-path `require(...)`, so
 * resolving one by a runtime `id` needs the generated static-require
 * manifest (`./exercise-image-registry.generated.ts`, same workaround
 * `exercise-thumbnail.ts` already uses for the smaller `thumb.jpg`).
 * Customs are the opposite: `05 §8`'s on-device file-storage convention
 * stores images as user files (a real, directly-usable URI once `M1-09`'s
 * `lib/files.ts` lands the actual write/join-with-`documentDirectory` path)
 * — there is no bundled-asset/Metro problem for that case at all, so a
 * custom's `images[]` entries are used as-is, whatever shape the caller
 * already resolved them to (a `file://` URI once M1-09 exists; today always
 * `[]`, per `exercise-thumbnail.ts`'s header note that no custom exercise
 * can have a non-empty `images[]` yet).
 */
import { BUILTIN_IMAGES } from './exercise-image-registry.generated';

/** The subset of `Exercise` (`@/data/exercises/types`) `ExerciseMedia` needs to resolve a source. */
export interface MediaSourceExercise {
  id: string;
  isCustom: boolean;
  images: readonly string[];
  /** Reserved for a future GIF milestone (03 §4) — always `null` until then. */
  animationUri: string | null;
}

export type ExerciseMediaTier = 'animated' | 'crossfade' | 'static' | 'placeholder';

export interface ResolvedExerciseMedia {
  tier: ExerciseMediaTier;
  /**
   * `expo-image`-compatible `source` values, in `images[]` order.
   * - `animated`: exactly one entry (the animation/GIF URI).
   * - `crossfade`: exactly two entries (`images[0]`, `images[1]`).
   * - `static`: exactly one entry (`images[0]`).
   * - `placeholder`: empty.
   */
  sources: readonly (number | string)[];
}

/** Built-in `images[]` entries resolved through the static-require manifest; customs used as-is (see file header). */
function resolveImageSources(exercise: MediaSourceExercise): readonly (number | string)[] {
  if (exercise.isCustom) {
    return exercise.images;
  }
  return BUILTIN_IMAGES[exercise.id] ?? [];
}

/** Resolves the media-slot contract's priority tier for one exercise (03 §4). */
export function resolveExerciseMediaSources(exercise: MediaSourceExercise): ResolvedExerciseMedia {
  if (exercise.animationUri != null) {
    return { tier: 'animated', sources: [exercise.animationUri] };
  }

  const images = resolveImageSources(exercise);

  if (images.length >= 2) {
    return { tier: 'crossfade', sources: [images[0], images[1]] };
  }
  if (images.length === 1) {
    return { tier: 'static', sources: [images[0]] };
  }
  return { tier: 'placeholder', sources: [] };
}
