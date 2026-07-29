/**
 * `RoutineRepositoryImpl` folders integration tests (M3-01 acceptance gate)
 * — real `better-sqlite3` against the migrated schema, same pattern
 * `workout-repository.lifecycle.test.ts` (M2-01) established: one
 * `describe` per method, happy path + the task's named edge cases (folder
 * delete both paths, positions contiguous after reorder/delete).
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import {
  FolderReorderMismatchError,
  RoutineFolderNotFoundError,
} from '../errors';
import { RoutineRepositoryImpl } from '../routine-repository';

describe('RoutineRepositoryImpl — folders (M3-01 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: RoutineRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new RoutineRepositoryImpl(driver);
  });

  afterEach(() => {
    driver.close();
  });

  describe('listFolders / createFolder', () => {
    it('starts empty', async () => {
      expect(await repo.listFolders()).toEqual([]);
    });

    it('creates folders with contiguous appended positions and collapsed=false by default', async () => {
      const push = await repo.createFolder({ title: 'Push' });
      const pull = await repo.createFolder({ title: 'Pull' });

      expect(push.id).toEqual(expect.any(Number));
      expect(push.position).toBe(0);
      expect(push.collapsed).toBe(false);
      expect(pull.position).toBe(1);

      const listed = await repo.listFolders();
      expect(listed.map((f) => f.title)).toEqual(['Push', 'Pull']);
    });

    it('throws on an empty/whitespace title', async () => {
      await expect(repo.createFolder({ title: '   ' })).rejects.toThrow(/required/i);
    });
  });

  describe('renameFolder', () => {
    it('renames and bumps updatedAt', async () => {
      const folder = await repo.createFolder({ title: 'Original' });
      const renamed = await repo.renameFolder(folder.id, 'Renamed');

      expect(renamed.title).toBe('Renamed');
      expect(renamed.updatedAt).toBeGreaterThanOrEqual(folder.updatedAt);
    });

    it('throws RoutineFolderNotFoundError for an unknown id', async () => {
      await expect(repo.renameFolder(999, 'x')).rejects.toBeInstanceOf(
        RoutineFolderNotFoundError,
      );
    });

    it('throws on an empty title', async () => {
      const folder = await repo.createFolder({ title: 'Original' });
      await expect(repo.renameFolder(folder.id, '  ')).rejects.toThrow(/required/i);
    });
  });

  describe('setFolderCollapsed', () => {
    it('persists collapsed state', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      expect(folder.collapsed).toBe(false);

      const collapsed = await repo.setFolderCollapsed(folder.id, true);
      expect(collapsed.collapsed).toBe(true);

      const reopened = await repo.setFolderCollapsed(folder.id, false);
      expect(reopened.collapsed).toBe(false);
    });

    it('throws RoutineFolderNotFoundError for an unknown id', async () => {
      await expect(repo.setFolderCollapsed(999, true)).rejects.toBeInstanceOf(
        RoutineFolderNotFoundError,
      );
    });
  });

  describe('reorderFolders', () => {
    it('reorders folders and keeps positions contiguous 0-based', async () => {
      const a = await repo.createFolder({ title: 'A' });
      const b = await repo.createFolder({ title: 'B' });
      const c = await repo.createFolder({ title: 'C' });

      await repo.reorderFolders([c.id, a.id, b.id]);

      const listed = await repo.listFolders();
      expect(listed.map((f) => f.id)).toEqual([c.id, a.id, b.id]);
      expect(listed.map((f) => f.position)).toEqual([0, 1, 2]);
    });

    it('throws FolderReorderMismatchError for a list missing a folder', async () => {
      const a = await repo.createFolder({ title: 'A' });
      await repo.createFolder({ title: 'B' });

      await expect(repo.reorderFolders([a.id])).rejects.toBeInstanceOf(
        FolderReorderMismatchError,
      );
    });

    it('throws FolderReorderMismatchError for a list with a foreign id', async () => {
      const a = await repo.createFolder({ title: 'A' });

      await expect(repo.reorderFolders([a.id, 999])).rejects.toBeInstanceOf(
        FolderReorderMismatchError,
      );
    });
  });

  describe('deleteFolder', () => {
    it('mode "cascade" deletes the folder and every routine inside it (with exercises/sets)', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const kept = await repo.create({ title: 'Keep Me', folderId: null });
      const doomed = await repo.create({ title: 'Doomed', folderId: folder.id });

      await repo.deleteFolder(folder.id, { mode: 'cascade' });

      expect(await repo.listFolders()).toEqual([]);
      expect(await repo.get(doomed.id)).toBeNull();
      expect(await repo.get(kept.id)).not.toBeNull();
      expect(
        driver.queryAll(`SELECT * FROM routine_exercises WHERE routine_id = ?`, [doomed.id]),
      ).toEqual([]);
    });

    it('mode "moveToMyRoutines" moves the folder\'s routines to My Routines, appended after existing ones, then deletes the folder', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const existingMyRoutine = await repo.create({ title: 'Already Home', folderId: null });
      const first = await repo.create({ title: 'First', folderId: folder.id });
      const second = await repo.create({ title: 'Second', folderId: folder.id });

      await repo.deleteFolder(folder.id, { mode: 'moveToMyRoutines' });

      expect(await repo.listFolders()).toEqual([]);
      const myRoutines = await repo.list({ folderId: null });
      expect(myRoutines.map((r) => r.id)).toEqual([existingMyRoutine.id, first.id, second.id]);
      expect(myRoutines.map((r) => r.position)).toEqual([0, 1, 2]);
    });

    it('renumbers remaining folders contiguous after delete', async () => {
      const a = await repo.createFolder({ title: 'A' });
      const b = await repo.createFolder({ title: 'B' });
      const c = await repo.createFolder({ title: 'C' });

      await repo.deleteFolder(b.id, { mode: 'cascade' });

      const listed = await repo.listFolders();
      expect(listed.map((f) => f.id)).toEqual([a.id, c.id]);
      expect(listed.map((f) => f.position)).toEqual([0, 1]);
    });

    it('throws RoutineFolderNotFoundError for an unknown id', async () => {
      await expect(repo.deleteFolder(999, { mode: 'cascade' })).rejects.toBeInstanceOf(
        RoutineFolderNotFoundError,
      );
    });
  });
});
