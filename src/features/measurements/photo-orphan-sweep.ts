/**
 * `sweepOrphanProgressPhotos` (M5-03) — 05 §8's boot-time orphan sweep:
 * "files without DB rows -> delete; rows without files -> placeholder +
 * warning, never crash." Lives in `src/features/measurements/` (not
 * `src/data/**` or `src/lib/**`) because it is the one place both a
 * `MeasurementRepository` (data layer) and the on-disk file helpers
 * (`src/lib/progress-photos.ts`) are legally reachable together (06 §2's
 * dependency rule — `src/data` may not import `src/lib`, and vice versa;
 * `src/features` may import both). Wired into the boot sequence from
 * `app/_layout.tsx`, deferred past first frame (see that file's header) so
 * it never gates the DB-ready splash gate.
 *
 * Deliberately takes its filesystem access as three injected callbacks
 * (`listPhotoFileNames`/`fileExists`/`deleteOrphanFile`) rather than
 * importing `src/lib/progress-photos.ts` directly — same "keep the pure
 * orchestration logic trivially unit-testable without mocking
 * `expo-file-system`" reasoning `MeasurementRepositoryDeps` itself already
 * follows (`src/data/measurements/types.ts`'s header). `app/_layout.tsx`'s
 * real boot wiring passes the actual `progress-photos.ts` functions; tests
 * pass fakes (a real temp-dir filesystem in the integration test below, a
 * plain in-memory map in the fast unit tests).
 *
 * ## Two directions, one pass each — never mutates the "rows without
 * files" side
 *
 * (a) A file on disk with no matching `progress_photos.file_name` row is a
 *     genuine orphan (e.g. a crash between `saveProgressPhotoFile` writing
 *     the file and `addPhoto`'s SQL insert — `measurement-repository.ts`'s
 *     header documents this exact narrow window) — deleted outright, no
 *     confirmation needed (it was never reachable through the app UI in the
 *     first place, since nothing points at it).
 * (b) A `progress_photos` row whose file is missing on disk (e.g. the
 *     reverse crash window, or a manual filesystem tamper) is **never**
 *     deleted or otherwise mutated here — 05 §8 says "placeholder render +
 *     warning log", which is a UI-layer rendering concern
 *     (`PhotoGalleryScreen`/`PhotoPagerScreen` render a placeholder for any
 *     photo id this sweep flags) plus a Sentry breadcrumb/capture
 *     (`onMissingFile` below), not a repository write. Silently deleting a
 *     user's photo *row* just because the sweep ran while a sync/restore
 *     was mid-flight would be far worse than a placeholder.
 */
import type { MeasurementRepository, ProgressPhoto } from '@/data/measurements/types';

export interface PhotoOrphanSweepDeps {
  /** Every file name currently on disk under `photos/progress/` (`listProgressPhotoFileNames`, `src/lib/progress-photos.ts`). */
  listPhotoFileNames: () => Promise<string[]>;
  /** Whether `fileName` currently exists on disk (`progressPhotoFileExists`, `src/lib/progress-photos.ts`). */
  fileExists: (fileName: string) => Promise<boolean>;
  /** Deletes one orphan file by name — idempotent (`deleteProgressPhotoFile`, `src/lib/progress-photos.ts`). */
  deleteOrphanFile: (fileName: string) => Promise<void>;
  /** Called once per `progress_photos` row whose file is missing on disk — the "log a warning" half of 05 §8's rule. Never throws from here; a throwing callback still lets the sweep finish (see `runSafely` below). */
  onMissingFile?: (photo: ProgressPhoto) => void;
}

export interface PhotoOrphanSweepResult {
  /** File names deleted because no `progress_photos` row referenced them. */
  orphanFilesDeleted: string[];
  /** `progress_photos.id`s whose file was missing on disk — left in the DB; the UI's job to render a placeholder for these (05 §8). */
  rowsMissingFiles: string[];
}

function runSafely(fn: ((photo: ProgressPhoto) => void) | undefined, arg: ProgressPhoto): void {
  if (!fn) return;
  try {
    fn(arg);
  } catch {
    // A misbehaving warning callback must never abort the sweep itself —
    // this function's entire job is "never crash" (05 §8's own wording).
  }
}

/**
 * Runs both halves of the orphan sweep once. `repository.photos()` (no
 * range — the whole table, matching 05 §8's "runs on app start" scope) and
 * `deps.listPhotoFileNames()` are read concurrently since neither depends
 * on the other's result.
 */
export async function sweepOrphanProgressPhotos(
  repository: Pick<MeasurementRepository, 'photos'>,
  deps: PhotoOrphanSweepDeps,
): Promise<PhotoOrphanSweepResult> {
  const [fileNamesOnDisk, photos] = await Promise.all([
    deps.listPhotoFileNames(),
    repository.photos(),
  ]);

  const referencedFileNames = new Set(photos.map((photo) => photo.fileName));

  const orphanFilesDeleted: string[] = [];
  for (const fileName of fileNamesOnDisk) {
    if (referencedFileNames.has(fileName)) {
      continue;
    }
    await deps.deleteOrphanFile(fileName);
    orphanFilesDeleted.push(fileName);
  }

  const rowsMissingFiles: string[] = [];
  for (const photo of photos) {
    const exists = await deps.fileExists(photo.fileName);
    if (exists) {
      continue;
    }
    rowsMissingFiles.push(photo.id);
    runSafely(deps.onMissingFile, photo);
  }

  return { orphanFilesDeleted, rowsMissingFiles };
}
