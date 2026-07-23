/**
 * `scripts/generate-exercise-thumbnail-registry.ts` (M1-07, extended M1-08)
 * — one-off/re-run-on-dataset-change generator for two static `require(...)`
 * manifests: `src/features/exercises/exercise-thumbnail-registry.generated.ts`
 * (128 px `thumb.jpg`, browse-row use) and
 * `src/features/exercises/exercise-image-registry.generated.ts` (the full
 * 600 px `0.jpg`/`1.jpg` pair, exercise-detail `ExerciseMedia` use, M1-08).
 *
 * Why this exists: Metro (the RN/Expo bundler) has no `require.context`
 * equivalent — every `require(...)` call it bundles must have a statically
 * analyzable string literal path. Both consumers need an image keyed at
 * runtime by the exercise's `id` (a value only known at render time, not at
 * bundle time), so a single `require(\`../../assets/exercises/${id}/thumb.jpg\`)`
 * (or the `0.jpg`/`1.jpg` equivalent) is not legal Metro usage. The standard
 * resolution — used here — is a generated module containing one static
 * `require(...)` per known id, built from `assets/exercise-db.json` (M1-04's
 * already-reviewed build output; this script only *reads* that file, never
 * touches the M1-04/M1-05 pipeline itself).
 *
 * **M1-08 extension note:** the original M1-07 version of this script only
 * emitted the thumbnail registry (its own header said the full-image pair
 * "the exercise detail screen (M1-08) will resolve differently... but
 * that's M1-08's concern, not this one's" — written before it was clear the
 * cleanest resolution was to extend this same script rather than write a
 * second one). Both registries are built from one read of the same already-
 * validated dataset file, so generating them together here avoids a second
 * script re-parsing `assets/exercise-db.json` and re-deriving the same
 * sorted id list independently. Kept as two separate *output* files (not
 * merged into one) so a thumbnail-only consumer (`ExerciseRow`, M1-07)
 * doesn't pull in the ~15x-larger full-image require graph it never needs —
 * only `ExerciseMedia` (M1-08) imports the image registry.
 *
 * Every built-in in the real vendored dataset has exactly 2 images
 * (verified: `node -e` count over `assets/exercise-db.json` shows
 * `{'2': 873}`), but the image registry is still built generically off each
 * record's actual `images[]` array (not hardcoded to 2) so it degrades
 * correctly if a future curation pass or dataset bump ever ships a 0- or
 * 1-image record.
 *
 * Run via `npm run build:exercise-thumbnails` whenever
 * `assets/exercise-db.json`'s id set changes (new build, curation pass
 * additions/removals, M1-11) — re-running is idempotent (deterministic
 * output, id-sorted).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.join(__dirname, '..');
const DATASET_PATH = path.join(REPO_ROOT, 'assets/exercise-db.json');
const THUMBNAIL_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'src/features/exercises/exercise-thumbnail-registry.generated.ts',
);
const IMAGE_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'src/features/exercises/exercise-image-registry.generated.ts',
);

interface MappedExerciseRecordShape {
  id: string;
  /** Asset-key strings relative to `assets/`, e.g. `"exercises/{id}/0.jpg"` (03 §6.4 step 5). */
  images: string[];
}

interface Dataset {
  version: string;
  exercises: MappedExerciseRecordShape[];
}

function loadDataset(): Dataset {
  return JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
}

function sortedIdsWithImages(dataset: Dataset): MappedExerciseRecordShape[] {
  return dataset.exercises
    .filter((exercise) => exercise.images.length > 0)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

function writeThumbnailRegistry(dataset: Dataset, records: MappedExerciseRecordShape[]): void {
  const lines: string[] = [
    '/**',
    ' * GENERATED FILE — do not hand-edit.',
    ' *',
    ' * Produced by `scripts/generate-exercise-thumbnail-registry.ts` (M1-07) from',
    ` * \`assets/exercise-db.json\` (dataset version ${dataset.version}). One static`,
    ' * `require(...)` per built-in exercise id that has at least one image — see',
    ' * the generator script\'s header for why this has to be static requires',
    ' * rather than a dynamic path (Metro has no `require.context`).',
    ' *',
    ' * Regenerate with `npm run build:exercise-thumbnails` after any change to',
    ' * `assets/exercise-db.json`\'s id set (new dataset build, curation pass).',
    ' */',
    '',
    '/** Built-in exercise id -> its bundled 128 px `thumb.jpg` asset module id. */',
    'export const BUILTIN_THUMBNAILS: Record<string, number> = {',
  ];

  for (const { id } of records) {
    const key = JSON.stringify(id);
    const requirePath = `../../../assets/exercises/${id}/thumb.jpg`;
    lines.push(`  ${key}: require(${JSON.stringify(requirePath)}),`);
  }

  lines.push('};', '');

  fs.writeFileSync(THUMBNAIL_OUTPUT_PATH, lines.join('\n'), 'utf-8');
  console.log(
    `Wrote ${THUMBNAIL_OUTPUT_PATH} (${records.length} thumbnail entries, dataset version ${dataset.version}).`,
  );
}

function writeImageRegistry(dataset: Dataset, records: MappedExerciseRecordShape[]): void {
  const lines: string[] = [
    '/**',
    ' * GENERATED FILE — do not hand-edit.',
    ' *',
    ' * Produced by `scripts/generate-exercise-thumbnail-registry.ts` (M1-08',
    ' * extension) from `assets/exercise-db.json` (dataset version',
    ` * ${dataset.version}). One static \`require(...)\` per built-in exercise's`,
    ' * full-size 600 px image(s) (`0.jpg`, and `1.jpg` when present) — same',
    ' * static-require-manifest workaround as the thumbnail registry (Metro has',
    ' * no `require.context`), used by `ExerciseMedia`',
    ' * (`src/features/exercises/ExerciseMedia.tsx`, M1-08) for the exercise',
    ' * detail page\'s crossfade/static media tiers. Not consumed by the browse',
    " * row thumbnail (`exercise-thumbnail.ts`) — that stays on the smaller",
    ' * `thumb.jpg`-only registry above.',
    ' *',
    ' * Regenerate with `npm run build:exercise-thumbnails` after any change to',
    ' * `assets/exercise-db.json`\'s id set (new dataset build, curation pass).',
    ' */',
    '',
    "/** Built-in exercise id -> its bundled full-size image asset module ids, in `images[]` order. */",
    'export const BUILTIN_IMAGES: Record<string, readonly number[]> = {',
  ];

  for (const { id, images } of records) {
    const key = JSON.stringify(id);
    const requireExprs = images.map((imageKey) => {
      // `imageKey` is `assets/exercise-db.json`'s asset-key string, e.g.
      // `"exercises/{id}/0.jpg"` — relative to `assets/`, so the require
      // path from this generated file (`src/features/exercises/`) is
      // `../../../assets/<imageKey>`.
      const requirePath = `../../../assets/${imageKey}`;
      return `require(${JSON.stringify(requirePath)})`;
    });
    lines.push(`  ${key}: [${requireExprs.join(', ')}],`);
  }

  lines.push('};', '');

  fs.writeFileSync(IMAGE_OUTPUT_PATH, lines.join('\n'), 'utf-8');
  const imageCount = records.reduce((sum, record) => sum + record.images.length, 0);
  console.log(
    `Wrote ${IMAGE_OUTPUT_PATH} (${records.length} exercises, ${imageCount} image entries, dataset version ${dataset.version}).`,
  );
}

function main(): void {
  const dataset = loadDataset();
  const records = sortedIdsWithImages(dataset);
  writeThumbnailRegistry(dataset, records);
  writeImageRegistry(dataset, records);
}

main();
