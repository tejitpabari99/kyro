/**
 * `resolveExerciseMediaSources` tests (M1-08 acceptance gate) — 03 §4's
 * priority-order fallback tiers, against real data wherever possible:
 * `BUILTIN_IMAGES` is the real generated registry built from the actual
 * vendored `assets/exercise-db.json` (873 real records, every one with 2
 * real images per M1-04's build run), not a mock.
 *
 * Regression (M1-12 catch-up review): the custom-exercise cases below now
 * pass **bare relative file names** as `images[]` entries — the real shape
 * `Exercise.images[]` actually holds for a custom (05 §8: DB stores relative
 * names only, `saveExercisePhoto`'s real return value) — instead of an
 * already-resolved `file://` URI. The previous version of this test file
 * stubbed `images[]` with a pre-resolved URI, which silently matched
 * `resolveImageSources`'s old (buggy) "use `images[]` as-is for customs"
 * behavior instead of catching that it never actually joined the bare name
 * with `documentDirectory` — meaning a real custom exercise's photo would
 * have rendered `expo-image` with an unloadable bare-filename `source` on a
 * real device. `@/lib/files` is mocked via the repo's existing manual mock
 * seam (`src/lib/__mocks__/files.ts`, M1-09) so `exercisePhotoUri`'s
 * resolution is exercised for real, not hand-simulated in this file.
 */
import { BUILTIN_IMAGES } from '../exercise-image-registry.generated';
import { resolveExerciseMediaSources, type MediaSourceExercise } from '../exercise-media-source';

jest.mock('@/lib/files');

const REAL_BUILTIN_ID = 'Barbell_Bench_Press_-_Medium_Grip';

function builtin(overrides: Partial<MediaSourceExercise> = {}): MediaSourceExercise {
  return {
    id: REAL_BUILTIN_ID,
    isCustom: false,
    images: [],
    animationUri: null,
    ...overrides,
  };
}

describe('resolveExerciseMediaSources — priority order (03 §4)', () => {
  it('animationUri wins over everything else, even when the built-in has real images', () => {
    const result = resolveExerciseMediaSources(
      builtin({ animationUri: 'https://example.com/future.gif' }),
    );
    expect(result).toEqual({ tier: 'animated', sources: ['https://example.com/future.gif'] });
  });

  it('a real built-in with 2 real images resolves to the crossfade tier with both registry sources', () => {
    const expected = BUILTIN_IMAGES[REAL_BUILTIN_ID];
    expect(expected).toHaveLength(2);

    const result = resolveExerciseMediaSources(builtin());

    expect(result.tier).toBe('crossfade');
    expect(result.sources).toEqual([expected[0], expected[1]]);
  });

  it('a built-in id with no registry entry (no images) falls to the placeholder tier', () => {
    const result = resolveExerciseMediaSources(builtin({ id: 'not-a-real-exercise-id' }));
    expect(result).toEqual({ tier: 'placeholder', sources: [] });
  });

  it('a custom exercise with 1 user-style image resolves to the static tier, joined into an absolute URI via exercisePhotoUri', () => {
    // 'abc.jpg' — the bare relative file name `Exercise.images[]` actually
    // stores (05 §8), not a pre-resolved URI (see file-header regression note).
    const result = resolveExerciseMediaSources({
      id: 'custom-1',
      isCustom: true,
      images: ['abc.jpg'],
      animationUri: null,
    });
    expect(result).toEqual({
      tier: 'static',
      sources: ['file:///mock-documents/photos/exercises/custom-1/abc.jpg'],
    });
  });

  it('a custom exercise with 2 user-style images resolves to the crossfade tier, both joined via exercisePhotoUri', () => {
    const result = resolveExerciseMediaSources({
      id: 'custom-2',
      isCustom: true,
      images: ['a.jpg', 'b.jpg'],
      animationUri: null,
    });
    expect(result).toEqual({
      tier: 'crossfade',
      sources: [
        'file:///mock-documents/photos/exercises/custom-2/a.jpg',
        'file:///mock-documents/photos/exercises/custom-2/b.jpg',
      ],
    });
  });

  it('a custom exercise with 0 images resolves to the placeholder tier', () => {
    const result = resolveExerciseMediaSources({
      id: 'custom-3',
      isCustom: true,
      images: [],
      animationUri: null,
    });
    expect(result).toEqual({ tier: 'placeholder', sources: [] });
  });

  it('only ever uses images[0] and images[1] even if more than 2 are present', () => {
    const result = resolveExerciseMediaSources({
      id: 'custom-4',
      isCustom: true,
      images: ['a.jpg', 'b.jpg', 'c.jpg'],
      animationUri: null,
    });
    expect(result.sources).toEqual([
      'file:///mock-documents/photos/exercises/custom-4/a.jpg',
      'file:///mock-documents/photos/exercises/custom-4/b.jpg',
    ]);
  });
});
