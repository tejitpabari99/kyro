/**
 * `RoutineRepositoryImpl` routine CRUD integration tests (M3-01 acceptance
 * gate) — real `better-sqlite3` against the migrated schema. Covers
 * `create`/`get`/`getFull`/`update`/`moveToFolder`/`reorderRoutines`/
 * `duplicate`/`delete`, the reps-XOR-range repo-boundary check, and
 * position-contiguity after reorder/move/delete.
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import {
  RepsXorRangeViolationError,
  RoutineFolderNotFoundError,
  RoutineNotFoundError,
  RoutineReorderMismatchError,
} from '../errors';
import { RoutineRepositoryImpl } from '../routine-repository';

function insertExercise(driver: SqliteDriver, id: string): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, id, now, now],
  );
  return id;
}

describe('RoutineRepositoryImpl — routine CRUD (M3-01 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: RoutineRepositoryImpl;
  let benchId: string;
  let squatId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new RoutineRepositoryImpl(driver);
    benchId = insertExercise(driver, 'bench-press');
    squatId = insertExercise(driver, 'back-squat');
  });

  afterEach(() => {
    driver.close();
  });

  // -------------------------------------------------------------------
  // create / get / getFull
  // -------------------------------------------------------------------
  describe('create', () => {
    it('creates an empty routine in My Routines by default', async () => {
      const routine = await repo.create({ title: 'Push Day' });

      expect(routine.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(routine.title).toBe('Push Day');
      expect(routine.notes).toBeNull();
      expect(routine.folderId).toBeNull();
      expect(routine.position).toBe(0);
      expect(routine.exercises).toEqual([]);
    });

    it('creates a routine with exercises, fixed-reps sets, and a rep-range set', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        notes: 'Focus on form',
        exercises: [
          {
            exerciseId: benchId,
            restSeconds: 90,
            sets: [
              { reps: 8, weightKg: 60 },
              { repRangeStart: 6, repRangeEnd: 8, weightKg: 60 },
            ],
          },
        ],
      });

      expect(routine.notes).toBe('Focus on form');
      expect(routine.exercises).toHaveLength(1);
      const [exercise] = routine.exercises;
      expect(exercise!.exerciseId).toBe(benchId);
      expect(exercise!.restSeconds).toBe(90);
      expect(exercise!.sets).toHaveLength(2);
      expect(exercise!.sets[0]).toMatchObject({ reps: 8, repRangeStart: null, repRangeEnd: null });
      expect(exercise!.sets[1]).toMatchObject({ reps: null, repRangeStart: 6, repRangeEnd: 8 });
    });

    it('creates a routine inside a folder, appended at that folder\'s end', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      await repo.create({ title: 'First', folderId: folder.id });
      const second = await repo.create({ title: 'Second', folderId: folder.id });

      expect(second.position).toBe(1);
    });

    it('throws on an empty title', async () => {
      await expect(repo.create({ title: '   ' })).rejects.toThrow(/required/i);
    });

    it('throws RoutineFolderNotFoundError for an unknown folderId', async () => {
      await expect(repo.create({ title: 'X', folderId: 999 })).rejects.toBeInstanceOf(
        RoutineFolderNotFoundError,
      );
    });

    it('throws RepsXorRangeViolationError when a set sets both reps and a rep range', async () => {
      await expect(
        repo.create({
          title: 'Bad Set',
          exercises: [
            {
              exerciseId: benchId,
              sets: [{ reps: 8, repRangeStart: 6, repRangeEnd: 8 }],
            },
          ],
        }),
      ).rejects.toBeInstanceOf(RepsXorRangeViolationError);

      // Nothing should have been written — validated before the transaction.
      expect(await repo.list()).toEqual([]);
    });
  });

  describe('get / getFull', () => {
    it('returns null for an unknown id', async () => {
      expect(await repo.get('nope')).toBeNull();
      expect(await repo.getFull('nope')).toBeNull();
    });

    it('getFull hydrates exercises and sets in position order', async () => {
      const created = await repo.create({
        title: 'Leg Day',
        exercises: [
          { exerciseId: squatId, sets: [{ reps: 5 }, { reps: 5 }] },
        ],
      });

      const full = await repo.getFull(created.id);
      expect(full!.exercises[0]!.sets.map((s) => s.position)).toEqual([0, 1]);
    });
  });

  // -------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------
  describe('update', () => {
    it('patches title/notes only, leaving exercises untouched when omitted', async () => {
      const routine = await repo.create({
        title: 'Original',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8 }] }],
      });

      const updated = await repo.update(routine.id, { title: 'Renamed', notes: 'New note' });

      expect(updated.title).toBe('Renamed');
      expect(updated.notes).toBe('New note');
      expect(updated.exercises).toHaveLength(1);
      expect(updated.exercises[0]!.sets).toHaveLength(1);
    });

    it('clears notes with an explicit null', async () => {
      const routine = await repo.create({ title: 'X', notes: 'Has a note' });
      const updated = await repo.update(routine.id, { notes: null });
      expect(updated.notes).toBeNull();
    });

    it('replaces the entire exercise/set structure when exercises is supplied', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8 }, { reps: 8 }] }],
      });

      const updated = await repo.update(routine.id, {
        exercises: [{ exerciseId: squatId, sets: [{ reps: 5 }] }],
      });

      expect(updated.exercises).toHaveLength(1);
      expect(updated.exercises[0]!.exerciseId).toBe(squatId);
      expect(updated.exercises[0]!.sets).toHaveLength(1);
    });

    it('replaces with an empty array, clearing every exercise', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8 }] }],
      });

      const updated = await repo.update(routine.id, { exercises: [] });
      expect(updated.exercises).toEqual([]);
    });

    it('throws RoutineNotFoundError for an unknown id', async () => {
      await expect(repo.update('nope', { title: 'X' })).rejects.toBeInstanceOf(
        RoutineNotFoundError,
      );
    });

    it('throws on an empty replacement title', async () => {
      const routine = await repo.create({ title: 'Original' });
      await expect(repo.update(routine.id, { title: '   ' })).rejects.toThrow(/required/i);
    });

    it('throws RepsXorRangeViolationError for a replacement set violating the XOR', async () => {
      const routine = await repo.create({ title: 'X' });
      await expect(
        repo.update(routine.id, {
          exercises: [
            { exerciseId: benchId, sets: [{ repRangeStart: 6, repRangeEnd: 8, reps: 7 }] },
          ],
        }),
      ).rejects.toBeInstanceOf(RepsXorRangeViolationError);
    });
  });

  // -------------------------------------------------------------------
  // moveToFolder
  // -------------------------------------------------------------------
  describe('moveToFolder', () => {
    it('moves a routine to a folder, appended at its end, and renumbers the source scope', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const a = await repo.create({ title: 'A' });
      const b = await repo.create({ title: 'B' });

      const moved = await repo.moveToFolder(a.id, folder.id);
      expect(moved.folderId).toBe(folder.id);
      expect(moved.position).toBe(0);

      const remainingInMyRoutines = await repo.list({ folderId: null });
      expect(remainingInMyRoutines.map((r) => r.id)).toEqual([b.id]);
      expect(remainingInMyRoutines[0]!.position).toBe(0);
    });

    it('moves a routine back to My Routines (folderId: null)', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const routine = await repo.create({ title: 'A', folderId: folder.id });

      const moved = await repo.moveToFolder(routine.id, null);
      expect(moved.folderId).toBeNull();
    });

    it('is a no-op when already in the target folder', async () => {
      const routine = await repo.create({ title: 'A' });
      const result = await repo.moveToFolder(routine.id, null);
      expect(result.id).toBe(routine.id);
      expect(result.position).toBe(0);
    });

    it('throws RoutineNotFoundError for an unknown routine id', async () => {
      await expect(repo.moveToFolder('nope', null)).rejects.toBeInstanceOf(RoutineNotFoundError);
    });

    it('throws RoutineFolderNotFoundError for an unknown folder id', async () => {
      const routine = await repo.create({ title: 'A' });
      await expect(repo.moveToFolder(routine.id, 999)).rejects.toBeInstanceOf(
        RoutineFolderNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------
  // reorderRoutines
  // -------------------------------------------------------------------
  describe('reorderRoutines', () => {
    it('reorders routines within My Routines, keeping positions contiguous', async () => {
      const a = await repo.create({ title: 'A' });
      const b = await repo.create({ title: 'B' });
      const c = await repo.create({ title: 'C' });

      await repo.reorderRoutines(null, [c.id, a.id, b.id]);

      const listed = await repo.list({ folderId: null });
      expect(listed.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
      expect(listed.map((r) => r.position)).toEqual([0, 1, 2]);
    });

    it('reorders routines within a folder', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const a = await repo.create({ title: 'A', folderId: folder.id });
      const b = await repo.create({ title: 'B', folderId: folder.id });

      await repo.reorderRoutines(folder.id, [b.id, a.id]);

      const listed = await repo.list({ folderId: folder.id });
      expect(listed.map((r) => r.id)).toEqual([b.id, a.id]);
    });

    it('throws RoutineReorderMismatchError for a list missing a member', async () => {
      const a = await repo.create({ title: 'A' });
      await repo.create({ title: 'B' });

      await expect(repo.reorderRoutines(null, [a.id])).rejects.toBeInstanceOf(
        RoutineReorderMismatchError,
      );
    });

    it('throws RoutineReorderMismatchError for a list with a foreign id (from another folder)', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const a = await repo.create({ title: 'A' });
      const foreign = await repo.create({ title: 'Foreign', folderId: folder.id });

      await expect(repo.reorderRoutines(null, [a.id, foreign.id])).rejects.toBeInstanceOf(
        RoutineReorderMismatchError,
      );
    });

    it('throws RoutineFolderNotFoundError for an unknown folder id', async () => {
      await expect(repo.reorderRoutines(999, [])).rejects.toBeInstanceOf(
        RoutineFolderNotFoundError,
      );
    });

    it('throws RoutineReorderMismatchError for a non-null folder id with a missing member (message names the folder, not "My Routines")', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      await repo.create({ title: 'A', folderId: folder.id });
      await repo.create({ title: 'B', folderId: folder.id });

      await expect(repo.reorderRoutines(folder.id, [])).rejects.toMatchObject({
        message: expect.stringContaining(`"${folder.id}"`),
      });
    });
  });

  // -------------------------------------------------------------------
  // duplicate
  // -------------------------------------------------------------------
  describe('duplicate', () => {
    it('deep-copies exercises, sets, and superset grouping with fresh ids', async () => {
      const original = await repo.create({
        title: 'Push Day',
        notes: 'Original note',
        exercises: [
          {
            exerciseId: benchId,
            supersetId: 0,
            restSeconds: 60,
            sets: [{ reps: 8, weightKg: 60 }, { repRangeStart: 6, repRangeEnd: 8 }],
          },
          {
            exerciseId: squatId,
            supersetId: 0,
            sets: [{ reps: 5 }],
          },
        ],
      });

      const copy = await repo.duplicate(original.id);

      expect(copy.id).not.toBe(original.id);
      expect(copy.title).toBe('Push Day copy');
      expect(copy.notes).toBe('Original note');
      expect(copy.folderId).toBe(original.folderId);
      expect(copy.exercises).toHaveLength(2);

      copy.exercises.forEach((exercise, i) => {
        const originalExercise = original.exercises[i]!;
        expect(exercise.id).not.toBe(originalExercise.id);
        expect(exercise.exerciseId).toBe(originalExercise.exerciseId);
        expect(exercise.supersetId).toBe(originalExercise.supersetId);
        expect(exercise.restSeconds).toBe(originalExercise.restSeconds);
        expect(exercise.sets).toHaveLength(originalExercise.sets.length);
        exercise.sets.forEach((set, j) => {
          const originalSet = originalExercise.sets[j]!;
          expect(set.id).not.toBe(originalSet.id);
          expect(set.reps).toBe(originalSet.reps);
          expect(set.repRangeStart).toBe(originalSet.repRangeStart);
          expect(set.repRangeEnd).toBe(originalSet.repRangeEnd);
          expect(set.weightKg).toBe(originalSet.weightKg);
        });
      });

      // Original is untouched.
      const originalReread = await repo.getFull(original.id);
      expect(originalReread!.exercises).toHaveLength(2);
    });

    it('appends the duplicate at the end of the same folder scope', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const a = await repo.create({ title: 'A', folderId: folder.id });
      await repo.create({ title: 'B', folderId: folder.id });

      const copy = await repo.duplicate(a.id);
      expect(copy.folderId).toBe(folder.id);
      expect(copy.position).toBe(2);
    });

    it('throws RoutineNotFoundError for an unknown id', async () => {
      await expect(repo.duplicate('nope')).rejects.toBeInstanceOf(RoutineNotFoundError);
    });
  });

  // -------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------
  describe('delete', () => {
    it('hard-deletes the routine and cascades its exercises/sets', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8 }] }],
      });
      const exerciseRowId = routine.exercises[0]!.id;

      await repo.delete(routine.id);

      expect(await repo.get(routine.id)).toBeNull();
      expect(driver.queryAll(`SELECT * FROM routine_exercises WHERE id = ?`, [exerciseRowId])).toEqual(
        [],
      );
    });

    it('leaves a workout\'s routine_id as a soft reference (no FK) after the routine is deleted', async () => {
      const routine = await repo.create({ title: 'Push Day' });
      const now = Date.now();
      driver.execute(
        `INSERT INTO workouts (id, title, routine_id, state, start_time, created_at, updated_at)
         VALUES ('w1', 'Past Workout', ?, 'completed', ?, ?, ?)`,
        [routine.id, now, now, now],
      );

      await repo.delete(routine.id);

      const workoutRow = driver.queryAll<{ routine_id: string | null }>(
        `SELECT routine_id FROM workouts WHERE id = 'w1'`,
      )[0];
      expect(workoutRow!.routine_id).toBe(routine.id);
      expect(await repo.get(routine.id)).toBeNull();
    });

    it('renumbers remaining routines in the same scope contiguous after delete', async () => {
      const a = await repo.create({ title: 'A' });
      const b = await repo.create({ title: 'B' });
      const c = await repo.create({ title: 'C' });

      await repo.delete(b.id);

      const listed = await repo.list({ folderId: null });
      expect(listed.map((r) => r.id)).toEqual([a.id, c.id]);
      expect(listed.map((r) => r.position)).toEqual([0, 1]);
    });

    it('throws RoutineNotFoundError for an unknown id', async () => {
      await expect(repo.delete('nope')).rejects.toBeInstanceOf(RoutineNotFoundError);
    });
  });

  // -------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------
  describe('list', () => {
    it('lists My Routines last when no filter is given', async () => {
      const folder = await repo.createFolder({ title: 'Push' });
      const inFolder = await repo.create({ title: 'In Folder', folderId: folder.id });
      const myRoutine = await repo.create({ title: 'My Routine' });

      const all = await repo.list();
      expect(all.map((r) => r.id)).toEqual([inFolder.id, myRoutine.id]);
    });

    it('groups folders by their current position order, not by folder id/creation order (04 §1)', async () => {
      const a = await repo.createFolder({ title: 'A' });
      const b = await repo.createFolder({ title: 'B' });
      // a.id < b.id (creation order), but reorder so B is now first.
      await repo.reorderFolders([b.id, a.id]);

      const inA = await repo.create({ title: 'In A', folderId: a.id });
      const inB = await repo.create({ title: 'In B', folderId: b.id });

      const all = await repo.list();
      expect(all.map((r) => r.id)).toEqual([inB.id, inA.id]);
    });
  });
});
