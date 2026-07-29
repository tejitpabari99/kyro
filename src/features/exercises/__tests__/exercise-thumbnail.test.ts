/**
 * `resolveExerciseThumbnailSource` tests (M1-12 catch-up review — no
 * dedicated unit test existed before this file; the function was only
 * exercised indirectly through `ExerciseBrowseScreen.test.tsx`'s rendering
 * of `ExerciseRow`, and every fixture used there for a custom exercise had
 * an empty `images[]`, so the "custom with a real photo" branch was never
 * actually covered — which is exactly how the bug below shipped unnoticed).
 *
 * Regression: this function used to unconditionally `return undefined` for
 * *any* custom exercise, regardless of `images[]` — a stale carry-over from
 * before `M1-09` landed the real on-device photo-storage seam (the file's
 * own header comment even said "once M1-09 lands a real file-URI
 * convention, this is the one function that needs updating to resolve it,"
 * but nobody came back to do so). Net effect: a custom exercise with a
 * user-added photo would still show the initial-letter placeholder in the
 * Exercises browse-tab row, never its actual photo. Fixed to resolve via
 * `exercisePhotoUri`, the same helper `exercise-media-source.ts`'s custom
 * branch (also fixed in this review pass) and `ExerciseFormScreen`'s image
 * preview already use for this exact bare-relative-name -> absolute-URI join.
 */
import { resolveExerciseThumbnailSource, type ThumbnailableExercise } from '../exercise-thumbnail';
import { BUILTIN_THUMBNAILS } from '../exercise-thumbnail-registry.generated';

jest.mock('@/lib/files');

const REAL_BUILTIN_ID = 'Barbell_Bench_Press_-_Medium_Grip';

describe('resolveExerciseThumbnailSource', () => {
  it('resolves a real built-in id through the generated thumbnail registry', () => {
    const exercise: ThumbnailableExercise = {
      id: REAL_BUILTIN_ID,
      isCustom: false,
      images: ['exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg'],
    };
    expect(resolveExerciseThumbnailSource(exercise)).toBe(BUILTIN_THUMBNAILS[REAL_BUILTIN_ID]);
  });

  it('returns undefined for a built-in with no images', () => {
    const exercise: ThumbnailableExercise = { id: REAL_BUILTIN_ID, isCustom: false, images: [] };
    expect(resolveExerciseThumbnailSource(exercise)).toBeUndefined();
  });

  it('resolves a custom exercise with a real photo via exercisePhotoUri (the fixed bug)', () => {
    const exercise: ThumbnailableExercise = {
      id: 'custom-1',
      isCustom: true,
      images: ['abc.jpg'],
    };
    expect(resolveExerciseThumbnailSource(exercise)).toBe(
      'file:///mock-documents/photos/exercises/custom-1/abc.jpg',
    );
  });

  it('only ever resolves images[0] for a custom with more than one photo', () => {
    const exercise: ThumbnailableExercise = {
      id: 'custom-2',
      isCustom: true,
      images: ['first.jpg', 'second.jpg'],
    };
    expect(resolveExerciseThumbnailSource(exercise)).toBe(
      'file:///mock-documents/photos/exercises/custom-2/first.jpg',
    );
  });

  it('returns undefined for a custom exercise with no images, falling back to the initial-letter placeholder', () => {
    const exercise: ThumbnailableExercise = { id: 'custom-3', isCustom: true, images: [] };
    expect(resolveExerciseThumbnailSource(exercise)).toBeUndefined();
  });
});
