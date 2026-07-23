/**
 * `scripts/build-exercise-db.ts` (M1-04) — 03 §6.4's build-time import
 * pipeline, run via `npm run build:exercises` (`tsx scripts/build-exercise-db.ts`).
 *
 * This is the thin, disk/`sharp`-touching orchestrator around the pure
 * mapping logic in `src/domain/exercise-mapping.ts` (unit-tested there
 * against the real vendored dataset, no IO). This script's own job is only:
 *
 *   1. Read `data/free-exercise-db/exercises.json` + `data/curation/overrides.json`.
 *   2. Call `buildExerciseDataset` (applies overrides, maps fields, 03 §6.3).
 *   3. Validate — every enum legal, primary muscle present (hard errors,
 *      `assertValidDataset` throws -> this script exits non-zero); image
 *      files exist on disk (warning only, this script's own fs check).
 *   4. Process every source image with `sharp`: resize to max 600px wide
 *      (never upscale), auto-orient + strip metadata, re-encode JPEG q75,
 *      plus one 128px `thumb.jpg` per exercise (from its first image) ->
 *      `assets/exercises/{id}/{0,1}.jpg` + `assets/exercises/{id}/thumb.jpg`.
 *   5. Emit `assets/exercise-db.json` (mapped records + a sha256 checksum/
 *      version constant) and `data/curation/curation-report.md` (warnings).
 *
 * Determinism (08 §4.7's "deterministic output hash" case): `exercise-db.json`
 * contains no timestamps and its records are id-sorted with stable key order
 * (both guaranteed by `exercise-mapping.ts`), so running this script twice
 * from the same inputs produces a byte-identical file and an identical
 * `version` hash — verified manually as part of this task's acceptance gate
 * (see `docs/plan/EXECUTION-LOG.md`'s M1-04 entry for the two recorded
 * hashes) rather than as a Jest test, since a real run does the full
 * ~1750-image `sharp` pass each time (deliberately slow, real work — not
 * something to double up on in the fast unit-test loop).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import sharp from 'sharp';

import { parseCurationOverrides } from '../src/domain/curation';
import {
  assertValidDataset,
  buildExerciseDataset,
  computeDatasetHash,
  type SourceExerciseRecord,
} from '../src/domain/exercise-mapping';

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_JSON_PATH = path.join(REPO_ROOT, 'data/free-exercise-db/exercises.json');
const SOURCE_IMAGES_DIR = path.join(REPO_ROOT, 'data/free-exercise-db/images');
const OVERRIDES_PATH = path.join(REPO_ROOT, 'data/curation/overrides.json');
const OUTPUT_JSON_PATH = path.join(REPO_ROOT, 'assets/exercise-db.json');
const OUTPUT_IMAGES_DIR = path.join(REPO_ROOT, 'assets/exercises');
const CURATION_REPORT_PATH = path.join(REPO_ROOT, 'data/curation/curation-report.md');

/** Pinned upstream commit, `data/free-exercise-db/VENDORED.md` — static, not read at build time. */
const SOURCE_COMMIT = 'b0eed061e1c832b3ed815fbaa4b45b3cdc14df49';

const MAX_WIDTH = 600;
const THUMB_WIDTH = 128;
const JPEG_QUALITY = 75;
/** Bounded concurrency for the ~1750 `sharp` operations (image resize is CPU-bound). */
const IMAGE_CONCURRENCY = 8;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function next(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

async function processImage(srcPath: string, destPath: string, width: number): Promise<void> {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await sharp(srcPath)
    .rotate() // auto-orient from EXIF before the metadata is stripped below
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    // sharp's output already omits EXIF/ICC/IPTC metadata unless `.withMetadata()`
    // is called (it isn't here) — this call is a no-op affirming that intent
    // explicitly rather than relying on silent default behavior.
    .toFile(destPath);
}

interface ImageWarning {
  id: string;
  message: string;
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  // ---- 1. Load inputs -------------------------------------------------
  const sourceRecords: SourceExerciseRecord[] = JSON.parse(
    fs.readFileSync(SOURCE_JSON_PATH, 'utf-8'),
  );
  const curation = parseCurationOverrides(JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')));

  console.log(`Loaded ${sourceRecords.length} source records + curation overrides.`);

  // ---- 2-3. Map fields + apply overrides, then hard-validate ----------
  const { records, warnings: mappingWarnings } = buildExerciseDataset(sourceRecords, curation);
  assertValidDataset(records); // throws -> non-zero exit, per 03 §6.4 step 3

  const excludedCount = sourceRecords.length - records.length;
  console.log(
    `Mapped ${records.length} exercises (${excludedCount} excluded by overrides), ` +
      `${mappingWarnings.length} mapping warning(s).`,
  );

  // ---- 3b. Image-file-exists check (warning only, needs fs — kept out of
  //          the pure domain module) --------------------------------------
  const imageWarnings: ImageWarning[] = [];
  const sourceById = new Map(sourceRecords.map((r) => [r.id, r]));
  for (const record of records) {
    const source = sourceById.get(record.id);
    if (!source) continue;
    for (const relImagePath of source.images) {
      const absPath = path.join(SOURCE_IMAGES_DIR, relImagePath);
      if (!fs.existsSync(absPath)) {
        imageWarnings.push({ id: record.id, message: `missing source image file: ${relImagePath}` });
      }
    }
  }
  console.log(`Image-file-exists check: ${imageWarnings.length} warning(s).`);

  // ---- 4. Image processing (sharp) ------------------------------------
  fs.mkdirSync(OUTPUT_IMAGES_DIR, { recursive: true });

  let processedImages = 0;
  let processedThumbs = 0;
  const processingErrors: string[] = [];

  await runWithConcurrency(records, IMAGE_CONCURRENCY, async (record) => {
    const source = sourceById.get(record.id);
    if (!source || source.images.length === 0) return;

    for (let index = 0; index < source.images.length; index++) {
      const relImagePath = source.images[index];
      const srcPath = path.join(SOURCE_IMAGES_DIR, relImagePath);
      if (!fs.existsSync(srcPath)) continue; // already warned above
      const destPath = path.join(OUTPUT_IMAGES_DIR, record.id, `${index}.jpg`);
      try {
        await processImage(srcPath, destPath, MAX_WIDTH);
        processedImages++;
      } catch (err) {
        processingErrors.push(`${record.id}/${index}.jpg: ${(err as Error).message}`);
      }
    }

    // One 128px thumb.jpg per exercise, derived from its first image.
    const firstImagePath = path.join(SOURCE_IMAGES_DIR, source.images[0]);
    if (fs.existsSync(firstImagePath)) {
      const thumbDest = path.join(OUTPUT_IMAGES_DIR, record.id, 'thumb.jpg');
      try {
        await processImage(firstImagePath, thumbDest, THUMB_WIDTH);
        processedThumbs++;
      } catch (err) {
        processingErrors.push(`${record.id}/thumb.jpg: ${(err as Error).message}`);
      }
    }
  });

  console.log(
    `Processed ${processedImages} images + ${processedThumbs} thumbnails ` +
      `(${processingErrors.length} processing error(s)).`,
  );
  if (processingErrors.length > 0) {
    throw new Error(`Image processing failed for:\n${processingErrors.join('\n')}`);
  }

  // ---- 5. Emit assets/exercise-db.json ---------------------------------
  const version = computeDatasetHash(records);
  const output = {
    version,
    sourceCommit: SOURCE_COMMIT,
    exerciseCount: records.length,
    exercises: records,
  };
  // 2-space indent, stable key order (object literal above + records'
  // already-stable key order from exercise-mapping.ts) -> deterministic bytes.
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${OUTPUT_JSON_PATH} (version ${version}).`);

  // ---- 5b. curation-report.md ------------------------------------------
  const reportLines: string[] = [
    '# Curation report',
    '',
    `Generated by \`scripts/build-exercise-db.ts\` (M1-04). Source: ` +
      `${sourceRecords.length} vendored records, ${records.length} mapped ` +
      `(${excludedCount} excluded by \`data/curation/overrides.json\`).`,
    '',
    `Dataset version (sha256 of mapped output): \`${version}\``,
    '',
    '## Hard errors',
    '',
    'None — `assertValidDataset` did not throw (every enum value legal, every ' +
      'record has a primary muscle group).',
    '',
    `## Missing-instructions warnings (${mappingWarnings.length})`,
    '',
    mappingWarnings.length > 0
      ? mappingWarnings.map((w) => `- ${w}`).join('\n')
      : '_None._',
    '',
    `## Missing-source-image-file warnings (${imageWarnings.length})`,
    '',
    imageWarnings.length > 0
      ? imageWarnings.map((w) => `- ${w.id}: ${w.message}`).join('\n')
      : '_None._',
    '',
    '## Next steps (M1-11 curation pass)',
    '',
    'Triage each warning above via `data/curation/overrides.json`: add ' +
      '`instructions`-bearing overrides or accept as-is for missing-instructions ' +
      'entries; investigate/re-vendor for missing-image entries. This file is ' +
      'regenerated on every build — hand edits here do not persist.',
    '',
  ];
  fs.writeFileSync(CURATION_REPORT_PATH, reportLines.join('\n'), 'utf-8');
  console.log(`Wrote ${CURATION_REPORT_PATH}.`);

  // ---- Size summary -----------------------------------------------------
  const jsonSize = fs.statSync(OUTPUT_JSON_PATH).size;
  const imagesSize = dirSizeBytes(OUTPUT_IMAGES_DIR);
  const totalMb = (jsonSize + imagesSize) / (1024 * 1024);
  console.log(
    `Output size: exercise-db.json ${(jsonSize / 1024).toFixed(1)} KB + ` +
      `assets/exercises/ ${(imagesSize / (1024 * 1024)).toFixed(1)} MB = ` +
      `${totalMb.toFixed(1)} MB total.`,
  );

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${elapsedSec}s.`);
}

function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

main().catch((err) => {
  console.error('\nbuild:exercises FAILED');
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
