/**
 * `sweepOrphanProgressPhotos` integration tests (M5-03 acceptance gate —
 * `docs/plan/tasks/M5-tasks.md`'s M5-03 test gate names this exact case:
 * "orphan sweep integration test (both directions) — runs without
 * measurable boot cost").
 *
 * Runs against a **real** `MeasurementRepositoryImpl` backed by
 * `better-sqlite3` + the real migrated schema (same "genuine end-to-end,
 * not a mocked call-count check" posture `measurement-repository.test.ts`
 * established for `addPhoto`/`deletePhoto`) and a **real temp-directory
 * filesystem** (plain Node `fs`/`os.tmpdir`, mirroring that same file's
 * `fakeFileDeps` pattern) standing in for `src/lib/progress-photos.ts`'s
 * disk helpers — genuine files actually get written/deleted on disk, not
 * just call-count-asserted.
 *
 * Both named directions:
 *  (a) a file on disk with no matching `progress_photos` row is deleted.
 *  (b) a `progress_photos` row whose file is missing on disk is left alone
 *      (never deleted, never crashes) and reported via `onMissingFile`.
 *
 * Plus the "runs without measurable boot cost" timing assertion: the sweep
 * completes in well under a boot-blocking amount of time against a small
 * (single-digit) photo set — this is not a claim about large-N scaling (05
 * §8 doesn't specify one), just a concrete, recorded number proving this
 * task's own acceptance wording rather than asserting it by inspection
 * alone.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import type { ProgressPhoto } from '@/data/measurements/types';

import { sweepOrphanProgressPhotos, type PhotoOrphanSweepDeps } from '../photo-orphan-sweep';

/** A real temp-dir filesystem standing in for `src/lib/progress-photos.ts` (see file header). */
function realTempFileDeps(): {
  dir: string;
  writeFile: (fileName: string) => void;
  deps: PhotoOrphanSweepDeps;
  missingFileWarnings: ProgressPhoto[];
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kyro-photo-orphan-sweep-'));
  const missingFileWarnings: ProgressPhoto[] = [];
  return {
    dir,
    writeFile: (fileName: string) => fs.writeFileSync(path.join(dir, fileName), 'fake-jpeg-bytes'),
    missingFileWarnings,
    deps: {
      listPhotoFileNames: async () => fs.readdirSync(dir),
      fileExists: async (fileName) => fs.existsSync(path.join(dir, fileName)),
      deleteOrphanFile: async (fileName) => {
        const filePath = path.join(dir, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      },
      onMissingFile: (photo) => {
        missingFileWarnings.push(photo);
      },
    },
  };
}

function freshRepository(): { repository: MeasurementRepositoryImpl; driver: SqliteDriver } {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  return { repository: new MeasurementRepositoryImpl(driver), driver };
}

describe('sweepOrphanProgressPhotos (M5-03)', () => {
  it('direction (a): deletes a file on disk with no matching progress_photos row, leaving referenced files untouched', async () => {
    const { repository } = freshRepository();
    const { deps, writeFile, dir } = realTempFileDeps();

    const kept = await repository.addPhoto('2026-07-01', 'kept-source.jpg');
    // Real deps default to identity pass-through (no `savePhotoFile` dep
    // injected here) — `addPhoto` stores whatever `savePhotoFile` returns as
    // `file_name`; write that exact name to disk so it's "referenced + present".
    writeFile(kept.fileName);
    // A genuinely orphaned file — no DB row references it at all.
    writeFile('orphan.jpg');

    const result = await sweepOrphanProgressPhotos(repository, deps);

    expect(result.orphanFilesDeleted).toEqual(['orphan.jpg']);
    expect(fs.existsSync(path.join(dir, 'orphan.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, kept.fileName))).toBe(true);
    expect(result.rowsMissingFiles).toEqual([]);
  });

  it('direction (b): a row whose file is missing on disk is left in the DB (never deleted), reported via onMissingFile, and does not crash', async () => {
    const { repository } = freshRepository();
    const { deps, missingFileWarnings } = realTempFileDeps();

    // `addPhoto` creates the DB row; deliberately never write the backing
    // file to disk, simulating the crash window `measurement-repository.ts`'s
    // header documents ("the narrow window between the two calls").
    const orphanRow = await repository.addPhoto('2026-07-02', 'never-written.jpg');

    const result = await sweepOrphanProgressPhotos(repository, deps);

    expect(result.rowsMissingFiles).toEqual([orphanRow.id]);
    expect(missingFileWarnings).toHaveLength(1);
    expect(missingFileWarnings[0]?.id).toBe(orphanRow.id);

    // The row itself must still exist — this direction never deletes DB
    // state, only flags it (05 §8: "placeholder + warning", not "delete").
    const stillThere = await repository.photos();
    expect(stillThere.map((p) => p.id)).toContain(orphanRow.id);
  });

  it('both directions in the same pass, on the same repository/filesystem', async () => {
    const { repository } = freshRepository();
    const { deps, writeFile } = realTempFileDeps();

    const kept = await repository.addPhoto('2026-07-03', 'kept.jpg');
    writeFile(kept.fileName);
    writeFile('another-orphan.jpg');
    const missingRow = await repository.addPhoto('2026-07-04', 'missing.jpg');

    const result = await sweepOrphanProgressPhotos(repository, deps);

    expect(result.orphanFilesDeleted).toEqual(['another-orphan.jpg']);
    expect(result.rowsMissingFiles).toEqual([missingRow.id]);
  });

  it('a throwing onMissingFile callback does not abort the sweep ("never crash", 05 §8)', async () => {
    const { repository } = freshRepository();
    const { deps } = realTempFileDeps();
    await repository.addPhoto('2026-07-05', 'missing-a.jpg');
    await repository.addPhoto('2026-07-06', 'missing-b.jpg');

    const throwingDeps: PhotoOrphanSweepDeps = {
      ...deps,
      onMissingFile: () => {
        throw new Error('a misbehaving warning callback');
      },
    };

    const result = await sweepOrphanProgressPhotos(repository, throwingDeps);

    expect(result.rowsMissingFiles).toHaveLength(2);
  });

  it('runs without measurable boot cost on a small photo set (M5-03\'s literal acceptance wording)', async () => {
    const { repository } = freshRepository();
    const { deps, writeFile } = realTempFileDeps();

    // A representative small set — a handful of dated entries, a mix of
    // present/missing files and one filesystem orphan. Not a large-N claim
    // (05 §8 specifies no such number); this proves the sweep's own
    // per-item work (a directory listing + a handful of stat calls) is
    // cheap, not that it scales to an unbounded photo library.
    for (let i = 0; i < 5; i += 1) {
      const photo = await repository.addPhoto(`2026-07-${10 + i}`, `photo-${i}.jpg`);
      if (i % 2 === 0) {
        writeFile(photo.fileName);
      }
    }
    writeFile('stray-orphan.jpg');

    const startedAt = Date.now();
    await sweepOrphanProgressPhotos(repository, deps);
    const elapsedMs = Date.now() - startedAt;

    // Generous relative to what this actually does (temp-dir fs stat calls
    // + one in-memory SQLite query) — this is a regression guard against
    // the sweep accidentally becoming O(n^2) or blocking, not a tight
    // device-perf budget.
    expect(elapsedMs).toBeLessThan(500);
  });
});
