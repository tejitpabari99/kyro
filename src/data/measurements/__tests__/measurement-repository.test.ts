/**
 * `MeasurementRepositoryImpl` integration tests (M5-01 acceptance gate) —
 * run fully in Node via `better-sqlite3` against the real migrated schema
 * (05 §10 / 08 §5 parity: same migration SQL the device applies), same
 * pattern `settings-repository.test.ts`/`workout-repository.*.test.ts`
 * established: one `describe` per method group, happy path + the task's
 * own named acceptance cases (M5-tasks.md's M5-01 test gate, 04 §6
 * acceptance criteria).
 *
 * Photo-file lifecycle (`addPhoto`/`deletePhoto`) is exercised against a
 * **real temp-directory filesystem** via injected `MeasurementRepositoryDeps`
 * — `fakeFileDeps` below uses plain Node `fs`/`os.tmpdir` (available in the
 * `node` Jest project this file runs under, `jest.config.js`) to actually
 * write/delete files, so "add creates file+row, delete removes both" is a
 * genuine end-to-end assertion (file exists on disk, then doesn't) rather
 * than a mocked call-count check. The repository itself never imports
 * `fs`/`expo-file-system` — see `measurement-repository.ts`'s header and
 * `./types.ts`'s `MeasurementRepositoryDeps` doc comment for why (06 §2
 * dependency rule).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { ProgressPhotoNotFoundError } from '../errors';
import { MeasurementRepositoryImpl } from '../measurement-repository';
import type { MeasurementRepositoryDeps } from '../types';

/** Real (temp-dir-backed) file save/delete deps — see file header. Returns `{deps, dir, listFiles}` so tests can assert real on-disk state. */
function fakeFileDeps(): {
  deps: Required<MeasurementRepositoryDeps>;
  dir: string;
  listFiles: () => string[];
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kyro-progress-photos-'));
  const deps: Required<MeasurementRepositoryDeps> = {
    savePhotoFile: async (_date, sourceUri) => {
      const fileName = `${sourceUri}.jpg`;
      fs.writeFileSync(path.join(dir, fileName), 'fake-jpeg-bytes');
      return fileName;
    },
    deletePhotoFile: async (fileName) => {
      const filePath = path.join(dir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    },
  };
  return { deps, dir, listFiles: () => fs.readdirSync(dir) };
}

describe('MeasurementRepositoryImpl (better-sqlite3 integration, M5-01)', () => {
  let driver: SqliteDriver;
  let repo: MeasurementRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new MeasurementRepositoryImpl(driver);
  });

  afterEach(() => {
    driver.close();
  });

  // -------------------------------------------------------------------
  // upsert — merge semantics (04 §6 acceptance: named case)
  // -------------------------------------------------------------------
  describe('upsert', () => {
    it('creates a new row with only the provided fields set', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80, waistCm: 90 });

      const [row] = await repo.list();
      expect(row).toBeDefined();
      expect(row!.date).toBe('2026-01-01');
      expect(row!.weightKg).toBe(80);
      expect(row!.waistCm).toBe(90);
      expect(row!.chestCm).toBeNull();
      expect(row!.createdAt).toEqual(row!.updatedAt);
    });

    it('[named acceptance case] a second same-date save merges — a weight-only second save keeps the first save\'s waist value', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80, waistCm: 90 });
      await repo.upsert('2026-01-01', { weightKg: 81 });

      const [row] = await repo.list();
      expect(row!.weightKg).toBe(81);
      expect(row!.waistCm).toBe(90); // untouched by the second save
    });

    it('treats an explicit null field in the input as "leave untouched", not "clear"', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80, waistCm: 90 });
      await repo.upsert('2026-01-01', { weightKg: 81, waistCm: null });

      const [row] = await repo.list();
      expect(row!.weightKg).toBe(81);
      expect(row!.waistCm).toBe(90);
    });

    it('bumps updated_at but not created_at on a merge save', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80 });
      const [first] = await repo.list();

      await new Promise((resolve) => setTimeout(resolve, 2));
      await repo.upsert('2026-01-01', { waistCm: 90 });
      const [second] = await repo.list();

      expect(second!.createdAt).toBe(first!.createdAt);
      expect(second!.updatedAt).toBeGreaterThan(first!.createdAt);
    });

    it('is a no-op that creates no row when every provided field is absent/null', async () => {
      await repo.upsert('2026-01-01', {});
      await repo.upsert('2026-01-02', { weightKg: null });

      expect(await repo.list()).toEqual([]);
    });

    it('merges independently across different dates', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80 });
      await repo.upsert('2026-01-02', { weightKg: 82 });

      const rows = await repo.list();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.date)).toEqual(['2026-01-01', '2026-01-02']);
    });
  });

  // -------------------------------------------------------------------
  // clearField
  // -------------------------------------------------------------------
  describe('clearField', () => {
    it('[named acceptance case] clears just the named field, leaving other fields on the same row intact', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80, waistCm: 90, chestCm: 100 });

      await repo.clearField('2026-01-01', 'waistCm');

      const [row] = await repo.list();
      expect(row!.waistCm).toBeNull();
      expect(row!.weightKg).toBe(80);
      expect(row!.chestCm).toBe(100);
    });

    it('is an idempotent no-op when the date has no row at all', async () => {
      await expect(repo.clearField('2026-01-01', 'weightKg')).resolves.toBeUndefined();
      expect(await repo.list()).toEqual([]);
    });

    it('[named acceptance case] clearing the last remaining field (no photos) removes the row entirely', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80 });

      await repo.clearField('2026-01-01', 'weightKg');

      expect(await repo.list()).toEqual([]);
    });

    it('does NOT remove the row when fields are all null but a photo still exists', async () => {
      const { deps } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      await photoRepo.upsert('2026-01-01', { weightKg: 80 });
      await photoRepo.addPhoto('2026-01-01', 'src-1');

      await photoRepo.clearField('2026-01-01', 'weightKg');

      const rows = await photoRepo.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.weightKg).toBeNull();
      expect(await photoRepo.photos()).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------
  describe('list', () => {
    beforeEach(async () => {
      await repo.upsert('2026-01-01', { weightKg: 80 });
      await repo.upsert('2026-02-01', { weightKg: 81 });
      await repo.upsert('2026-03-01', { weightKg: 82 });
    });

    it('returns every row, sorted by date ascending, with no range', async () => {
      const rows = await repo.list();
      expect(rows.map((r) => r.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    });

    it('applies inclusive start/end bounds', async () => {
      const rows = await repo.list({ start: '2026-01-15', end: '2026-02-01' });
      expect(rows.map((r) => r.date)).toEqual(['2026-02-01']);
    });

    it('an inclusive bound exactly matching a stored date includes that date', async () => {
      const rows = await repo.list({ start: '2026-01-01', end: '2026-01-01' });
      expect(rows.map((r) => r.date)).toEqual(['2026-01-01']);
    });
  });

  // -------------------------------------------------------------------
  // series — sparse-data gap preservation (04 §6 acceptance: named case)
  // -------------------------------------------------------------------
  describe('series', () => {
    it('[named acceptance case] returns only dates where the field is set — gaps are preserved, not interpolated/zero-filled', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80 });
      // 2026-01-02: no entry at all for this date.
      await repo.upsert('2026-01-03', { waistCm: 90 }); // weightKg absent on this date
      await repo.upsert('2026-01-04', { weightKg: 79 });

      const points = await repo.series('weightKg', {});

      expect(points).toEqual([
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-04', value: 79 },
      ]);
    });

    it('respects the date range bounds (inclusive)', async () => {
      await repo.upsert('2026-01-01', { weightKg: 80 });
      await repo.upsert('2026-01-05', { weightKg: 79 });
      await repo.upsert('2026-01-10', { weightKg: 78 });

      const points = await repo.series('weightKg', { start: '2026-01-02', end: '2026-01-10' });

      expect(points).toEqual([
        { date: '2026-01-05', value: 79 },
        { date: '2026-01-10', value: 78 },
      ]);
    });

    it('returns an empty array when the field was never logged in range', async () => {
      await repo.upsert('2026-01-01', { waistCm: 90 });
      expect(await repo.series('weightKg', {})).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // Photo file lifecycle (addPhoto / photos / deletePhoto)
  // -------------------------------------------------------------------
  describe('photo file lifecycle', () => {
    it('[named acceptance case] addPhoto creates the measurement row (if absent) + the file + the DB row', async () => {
      const { deps, listFiles } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);

      expect(await photoRepo.list()).toEqual([]);

      const photo = await photoRepo.addPhoto('2026-01-01', 'picked-source');

      expect(photo.date).toBe('2026-01-01');
      expect(photo.fileName).toBe('picked-source.jpg');
      expect(photo.id).toMatch(/^[0-9a-f-]{36}$/i);

      // Row auto-created as an all-null "photo only" entry (FK requirement).
      const [row] = await photoRepo.list();
      expect(row!.date).toBe('2026-01-01');
      expect(row!.weightKg).toBeNull();

      // Real file was written to disk.
      expect(listFiles()).toEqual(['picked-source.jpg']);

      const photos = await photoRepo.photos();
      expect(photos).toEqual([photo]);
    });

    it('addPhoto does not duplicate the measurement row when one already exists for that date', async () => {
      const { deps } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      await photoRepo.upsert('2026-01-01', { weightKg: 80 });

      await photoRepo.addPhoto('2026-01-01', 'src');

      const rows = await photoRepo.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.weightKg).toBe(80);
    });

    it('a date can have multiple photos', async () => {
      const { deps } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);

      await photoRepo.addPhoto('2026-01-01', 'src-1');
      await photoRepo.addPhoto('2026-01-01', 'src-2');

      expect(await photoRepo.photos()).toHaveLength(2);
    });

    it('photos(range) filters by date with inclusive bounds, ordered by date then createdAt', async () => {
      const { deps } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      await photoRepo.addPhoto('2026-01-01', 'src-1');
      await photoRepo.addPhoto('2026-02-01', 'src-2');
      await photoRepo.addPhoto('2026-03-01', 'src-3');

      const photos = await photoRepo.photos({ start: '2026-01-15', end: '2026-02-15' });

      expect(photos.map((p) => p.date)).toEqual(['2026-02-01']);
    });

    it('[named acceptance case] deletePhoto removes both the DB row and the underlying file', async () => {
      const { deps, listFiles } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      await photoRepo.upsert('2026-01-01', { weightKg: 80 }); // keep the row alive independent of the photo
      const photo = await photoRepo.addPhoto('2026-01-01', 'src-1');
      expect(listFiles()).toEqual(['src-1.jpg']);

      await photoRepo.deletePhoto(photo.id);

      expect(await photoRepo.photos()).toEqual([]);
      expect(listFiles()).toEqual([]);
      // The measurement row itself survives — it still has weightKg set.
      const rows = await photoRepo.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.weightKg).toBe(80);
    });

    it('[named acceptance case] deleting the last photo on a date with no fields set removes the row entirely', async () => {
      const { deps, listFiles } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      const photo = await photoRepo.addPhoto('2026-01-01', 'src-1'); // photo-only row, no fields

      await photoRepo.deletePhoto(photo.id);

      expect(await photoRepo.list()).toEqual([]);
      expect(listFiles()).toEqual([]);
    });

    it('deleting one of several photos on a date keeps the row and the remaining photo', async () => {
      const { deps, listFiles } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      const first = await photoRepo.addPhoto('2026-01-01', 'src-1');
      await photoRepo.addPhoto('2026-01-01', 'src-2');

      await photoRepo.deletePhoto(first.id);

      const photos = await photoRepo.photos();
      expect(photos).toHaveLength(1);
      expect(photos[0]!.fileName).toBe('src-2.jpg');
      expect(listFiles()).toEqual(['src-2.jpg']);
      expect(await photoRepo.list()).toHaveLength(1);
    });

    it('deletePhoto throws ProgressPhotoNotFoundError for an unknown id', async () => {
      await expect(repo.deletePhoto('does-not-exist')).rejects.toBeInstanceOf(
        ProgressPhotoNotFoundError,
      );
    });

    it('deletePhoto is safe even when deletePhotoFile is called on an already-missing file (idempotent deps)', async () => {
      const { deps } = fakeFileDeps();
      const photoRepo = new MeasurementRepositoryImpl(driver, deps);
      const photo = await photoRepo.addPhoto('2026-01-01', 'src-1');

      // Simulate the file already having vanished (orphan-sweep territory,
      // M5-03) before the DB-level delete runs — deletePhotoFile's own
      // fake implementation is written to be idempotent (file header).
      await deps.deletePhotoFile(photo.fileName);

      await expect(photoRepo.deletePhoto(photo.id)).resolves.toBeUndefined();
      expect(await photoRepo.photos()).toEqual([]);
    });

    it('default deps (no file wiring) still round-trip DB rows — savePhotoFile passthrough, deletePhotoFile no-op', async () => {
      const photo = await repo.addPhoto('2026-01-01', 'already-a-relative/name.jpg');
      expect(photo.fileName).toBe('already-a-relative/name.jpg');

      await expect(repo.deletePhoto(photo.id)).resolves.toBeUndefined();
      expect(await repo.photos()).toEqual([]);
    });
  });
});
