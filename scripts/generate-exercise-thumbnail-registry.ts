/**
 * `scripts/generate-exercise-thumbnail-registry.ts` (M1-07) — one-off/re-run-
 * on-dataset-change generator for
 * `src/features/exercises/exercise-thumbnail-registry.generated.ts`.
 *
 * Why this exists: Metro (the RN/Expo bundler) has no `require.context`
 * equivalent — every `require(...)` call it bundles must have a statically
 * analyzable string literal path. The exercise browse screen (M1-07) needs a
 * 44 pt thumbnail per built-in exercise, keyed at runtime by the exercise's
 * `id` (a value only known at render time, not at bundle time), so a single
 * `require(\`../../assets/exercises/${id}/thumb.jpg\`)` is not legal Metro
 * usage. The standard resolution — used here — is a generated module
 * containing one static `require(...)` per known id, built from
 * `assets/exercise-db.json` (M1-04's already-reviewed build output; this
 * script only *reads* that file, never touches the M1-04/M1-05 pipeline
 * itself).
 *
 * Scoped to `thumb.jpg` only (128 px, ~4 KB avg, 06 §8 perf tactics: small
 * assets for list rows) — not the full 600 px `0.jpg`/`1.jpg` pair, which
 * the exercise detail screen (M1-08) will resolve differently (dynamic
 * `Image.resolveAssetSource`-style path is unnecessary there too, but that's
 * M1-08's concern, not this one's).
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
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  'src/features/exercises/exercise-thumbnail-registry.generated.ts',
);

interface MappedExerciseRecordShape {
  id: string;
  images: string[];
}

interface Dataset {
  version: string;
  exercises: MappedExerciseRecordShape[];
}

function main(): void {
  const dataset: Dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf-8'));
  const idsWithImages = dataset.exercises
    .filter((exercise) => exercise.images.length > 0)
    .map((exercise) => exercise.id)
    .sort((a, b) => a.localeCompare(b));

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

  for (const id of idsWithImages) {
    const key = JSON.stringify(id);
    const requirePath = `../../../assets/exercises/${id}/thumb.jpg`;
    lines.push(`  ${key}: require(${JSON.stringify(requirePath)}),`);
  }

  lines.push('};', '');

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf-8');
  console.log(
    `Wrote ${OUTPUT_PATH} (${idsWithImages.length} thumbnail entries, dataset version ${dataset.version}).`,
  );
}

main();
