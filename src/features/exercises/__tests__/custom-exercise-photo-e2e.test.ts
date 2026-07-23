/**
 * Custom-exercise photo, end-to-end (M1 milestone review) — the M1-12
 * catch-up review fixed `exercise-thumbnail.ts`/`exercise-media-source.ts`
 * to resolve a custom exercise's bare relative file name into a real
 * `file://` URI via `exercisePhotoUri` (see both files' headers), and both
 * fixes are unit-tested — but every one of those tests (this file's own
 * milestone-review author double-checked) mocks `@/lib/files` wholesale at
 * the module boundary. That proves each *seam* honors the bare-filename
 * contract in isolation; it does not prove the three real, un-mocked
 * implementations actually compose: `saveExercisePhoto` really does return
 * what `ExerciseRepository.create`/`update` really does store in `images[]`,
 * and `resolveExerciseThumbnailSource`/`resolveExerciseMediaSources` really
 * do turn that same stored value back into the same absolute URI
 * `exercisePhotoUri` itself produces.
 *
 * This test chains all of it for real, mocking only the one boundary that
 * has no choice but to be mocked in Jest (no on-device filesystem/camera
 * host exists here, `docs/plan/BLOCKERS.md`): `expo-file-system/legacy` +
 * `expo-image-manipulator` + `expo-image-picker`, exactly the native-module
 * trio `files.test.ts` (M1-09) already mocks this same way. Everything else
 * — `src/lib/files.ts`, `ExerciseRepositoryImpl` against a real (in-memory)
 * `better-sqlite3` driver, `resolveExerciseThumbnailSource`,
 * `resolveExerciseMediaSources` — is the real, un-mocked implementation.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { exercisePhotoUri, saveExercisePhoto } from '@/lib/files';

import { resolveExerciseMediaSources } from '../exercise-media-source';
import { resolveExerciseThumbnailSource } from '../exercise-thumbnail';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

// Not actually called on this path (no `pickExercisePhoto` call — the
// "picked" asset is supplied directly, this test isn't exercising the
// picker/permission half of `files.ts`) but `files.ts` imports the module
// at the top level, so it still needs a resolvable mock factory.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockFileSystem = FileSystem as unknown as {
  documentDirectory: string | null;
  getInfoAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  copyAsync: jest.Mock;
  deleteAsync: jest.Mock;
};
const mockManipulator = ImageManipulator as unknown as { manipulateAsync: jest.Mock };

describe('custom exercise photo — files.ts -> repository -> thumbnail/media-source, real end to end', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem.documentDirectory = 'file:///mock-documents/';
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });
    mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
    mockFileSystem.copyAsync.mockResolvedValue(undefined);
    mockManipulator.manipulateAsync.mockResolvedValue({
      uri: 'file:///cache/manipulated-tmp.jpg',
      width: 1024,
      height: 1024,
    });

    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('a bare file name saved via saveExercisePhoto, stored in the DB via the real repository, resolves back to the exact same real file:// URI in both the thumbnail and media-source resolvers', async () => {
    const repository = new ExerciseRepositoryImpl(driver);

    // 1. Create the row first (M1-09's own documented ordering, mirrored in
    // `ExerciseFormScreen`: row exists -> then the photo is written and
    // patched in) — a real repository.create against a real SQLite driver,
    // not a fake.
    const created = await repository.create({
      name: 'E2E Photo Curl',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'biceps',
    });

    // 2. Save the photo via the real `saveExercisePhoto` (only its native
    // dependencies are mocked) — this is the exact function
    // `ExerciseFormScreen`'s save path calls.
    const fileName = await saveExercisePhoto(created.id, {
      uri: 'file:///picked-from-library.jpg',
      width: 2000,
      height: 1500,
    });

    // It's a bare "<uuid>.jpg" name, never an absolute path or file:// URI —
    // 05 §8's storage contract, asserted directly against the real function's
    // real return value (not a mocked stand-in).
    expect(fileName).toMatch(/^[0-9a-f-]+\.jpg$/i);
    expect(fileName).not.toContain('file://');
    expect(fileName).not.toContain('/');

    // 3. Patch the row's `images[]` with that exact bare name via the real
    // repository — proves the DB round-trips the value unchanged (no
    // silent normalization/mangling in the write or the read-back).
    const updated = await repository.update(created.id, { images: [fileName] });
    expect(updated.images).toEqual([fileName]);

    const reloaded = await repository.get(created.id);
    expect(reloaded?.images).toEqual([fileName]);
    if (!reloaded) throw new Error('exercise not found after update');

    // 4. The expected absolute URI, per the real (un-mocked) join function
    // itself — this is what a correct implementation *must* produce.
    const expectedUri = exercisePhotoUri(reloaded.id, fileName);
    expect(expectedUri).toBe(`file:///mock-documents/photos/exercises/${reloaded.id}/${fileName}`);

    // 5. The two real consumers (browse-row thumbnail, detail-page media
    // slot) resolve the *same* real Exercise row to that *same* real URI —
    // the actual M1-12 regression path, proven end to end rather than at
    // each seam with a hand-matched mock.
    expect(resolveExerciseThumbnailSource(reloaded)).toBe(expectedUri);

    const media = resolveExerciseMediaSources({
      id: reloaded.id,
      isCustom: reloaded.isCustom,
      images: reloaded.images,
      animationUri: reloaded.animationUri,
    });
    expect(media).toEqual({ tier: 'static', sources: [expectedUri] });
  });

  it('two photos on the same custom exercise both resolve to real, distinct file:// URIs in the crossfade tier', async () => {
    const repository = new ExerciseRepositoryImpl(driver);
    const created = await repository.create({
      name: 'E2E Two-Photo Curl',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'triceps',
    });

    const first = await saveExercisePhoto(created.id, {
      uri: 'file:///first.jpg',
      width: 1000,
      height: 1000,
    });
    const second = await saveExercisePhoto(created.id, {
      uri: 'file:///second.jpg',
      width: 1000,
      height: 1000,
    });
    expect(first).not.toBe(second);

    const updated = await repository.update(created.id, { images: [first, second] });

    const media = resolveExerciseMediaSources({
      id: updated.id,
      isCustom: updated.isCustom,
      images: updated.images,
      animationUri: updated.animationUri,
    });
    expect(media).toEqual({
      tier: 'crossfade',
      sources: [exercisePhotoUri(updated.id, first), exercisePhotoUri(updated.id, second)],
    });
    // Sanity: the two resolved sources are themselves distinct real URIs,
    // not both accidentally resolving to the same file.
    expect(media.sources[0]).not.toBe(media.sources[1]);
  });
});
