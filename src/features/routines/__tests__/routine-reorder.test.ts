/**
 * `routine-reorder.ts` unit tests (M3-03) — the pure position-math half of
 * drag-reorder mode, fully testable without RNTL or a real gesture (see
 * `RoutinesHubScreen.test.tsx`'s own M3-03 section for the RNTL-reachable
 * half: reorder-mode toggle + repository-call wiring given a simulated
 * drop).
 */
import { fixtureFolder, fixtureRoutine } from './routine-fixtures';
import { computeFolderReorderIds, computeRoutineReorderPlan } from '../routine-reorder';
import type { RoutineDragData } from '../routine-reorder';

describe('computeRoutineReorderPlan — same-folder reorder', () => {
  const routines = [
    fixtureRoutine({ id: 'a', title: 'A', folderId: 1, position: 0 }),
    fixtureRoutine({ id: 'b', title: 'B', folderId: 1, position: 1 }),
    fixtureRoutine({ id: 'c', title: 'C', folderId: 1, position: 2 }),
  ];

  it('moves a routine before another routine within the same folder', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'c', folderId: 1 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 1,
      beforeRoutineId: 'a',
    });

    expect(plan).toEqual({ crossFolder: false, targetFolderId: 1, orderedIds: ['c', 'a', 'b'] });
  });

  it('appends at the end when beforeRoutineId is null (dropped on the folder header)', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'a', folderId: 1 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 1,
      beforeRoutineId: null,
    });

    expect(plan).toEqual({ crossFolder: false, targetFolderId: 1, orderedIds: ['b', 'c', 'a'] });
  });

  it('is a no-op (orderedIds: null) when dropped back at its own position', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'b', folderId: 1 };
    // Dropping "before c" when b is already immediately before c changes nothing.
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 1,
      beforeRoutineId: 'c',
    });

    expect(plan.orderedIds).toBeNull();
  });

  it('treats a self-referential beforeRoutineId as "not found" and appends at the end', () => {
    // `beforeRoutineId` equal to the dragged routine's own id is not a case
    // this function needs to special-case as a no-op: `FolderSection.tsx`'s
    // `Droppable.onDrop` never calls through with a routine dropped on its
    // own row in the first place (`data.routineId !== routine.id` guard) —
    // so if this ever *does* happen, it's already an unexpected id, and
    // falling into the same "id not present in scope" append-at-end path
    // documented above is the correct total behavior, not a crash.
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'b', folderId: 1 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 1,
      beforeRoutineId: 'b',
    });

    expect(plan.orderedIds).toEqual(['a', 'c', 'b']);
  });

  it('appends when beforeRoutineId references an id not present in the target scope', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'a', folderId: 1 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 1,
      beforeRoutineId: 'does-not-exist',
    });

    expect(plan.orderedIds).toEqual(['b', 'c', 'a']);
  });
});

describe('computeRoutineReorderPlan — cross-folder move', () => {
  const routines = [
    fixtureRoutine({ id: 'a', title: 'A', folderId: 1, position: 0 }),
    fixtureRoutine({ id: 'b', title: 'B', folderId: 1, position: 1 }),
    fixtureRoutine({ id: 'x', title: 'X', folderId: 2, position: 0 }),
    fixtureRoutine({ id: 'y', title: 'Y', folderId: 2, position: 1 }),
  ];

  it('flags crossFolder and inserts before a target routine in the destination folder', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'a', folderId: 1 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 2,
      beforeRoutineId: 'y',
    });

    expect(plan).toEqual({ crossFolder: true, targetFolderId: 2, orderedIds: ['x', 'a', 'y'] });
  });

  it('flags crossFolder and appends at the end when dropped on the destination folder header', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'a', folderId: 1 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: 2,
      beforeRoutineId: null,
    });

    expect(plan).toEqual({ crossFolder: true, targetFolderId: 2, orderedIds: ['x', 'y', 'a'] });
  });

  it('moving into My Routines uses targetFolderId: null', () => {
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'x', folderId: 2 };
    const plan = computeRoutineReorderPlan(routines, dragged, {
      targetFolderId: null,
      beforeRoutineId: null,
    });

    expect(plan).toEqual({ crossFolder: true, targetFolderId: null, orderedIds: ['x'] });
  });

  it('always reports a change for a cross-folder move even into an otherwise-identical position', () => {
    // Same folderId numerically different from source is enough to force
    // crossFolder: true and a non-null plan, regardless of the computed
    // order — a cross-folder move must never be treated as a no-op even if
    // the destination scope happens to end up single-item.
    const soloRoutines = [fixtureRoutine({ id: 'only', title: 'Only', folderId: 1, position: 0 })];
    const dragged: RoutineDragData = { kind: 'routine', routineId: 'a', folderId: 1 };
    const plan = computeRoutineReorderPlan(soloRoutines, dragged, {
      targetFolderId: 2,
      beforeRoutineId: null,
    });

    expect(plan.crossFolder).toBe(true);
    expect(plan.orderedIds).not.toBeNull();
  });
});

describe('computeFolderReorderIds', () => {
  const folders = [
    fixtureFolder({ id: 1, title: 'A', position: 0 }),
    fixtureFolder({ id: 2, title: 'B', position: 1 }),
    fixtureFolder({ id: 3, title: 'C', position: 2 }),
  ];

  it('moves a folder before another folder', () => {
    expect(computeFolderReorderIds(folders, 3, 1)).toEqual([3, 1, 2]);
  });

  it('appends at the end when beforeFolderId is null', () => {
    expect(computeFolderReorderIds(folders, 1, null)).toEqual([2, 3, 1]);
  });

  it('returns null (no-op) when dropped back at its own position', () => {
    expect(computeFolderReorderIds(folders, 2, 3)).toBeNull();
  });

  it('treats a self-referential beforeFolderId as "not found" and appends at the end', () => {
    // Same "guarded upstream, must still be total" reasoning as
    // `computeRoutineReorderPlan`'s equivalent case above —
    // `FolderSection.tsx` never calls through with a folder dropped on its
    // own header (`data.folderId !== folder.id` guard).
    expect(computeFolderReorderIds(folders, 2, 2)).toEqual([1, 3, 2]);
  });
});
