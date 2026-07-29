/**
 * `routine-hub-model.ts` unit tests (M3-02) — `buildFolderSections`'
 * grouping/ordering/My-Routines-visibility rules and
 * `buildExercisePreview`'s comma-join/empty/loading cases.
 */
import type { RoutineFolder, RoutineFull, RoutineSummary } from '@/data/routines/types';

import { buildExercisePreview, buildFolderSections } from '../routine-hub-model';

function folder(overrides: Partial<RoutineFolder> = {}): RoutineFolder {
  return {
    id: 1,
    title: 'Push/Pull/Legs',
    position: 0,
    collapsed: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function routine(overrides: Partial<RoutineSummary> = {}): RoutineSummary {
  return {
    id: 'r1',
    title: 'Push Day',
    notes: null,
    folderId: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('buildFolderSections', () => {
  it('returns no sections at all when there are zero folders and zero routines', () => {
    expect(buildFolderSections([], [])).toEqual([]);
  });

  it('groups routines under their real folder, and appends an explicit My Routines section last when folders exist (even if My Routines is empty)', () => {
    const f1 = folder({ id: 1, title: 'Push/Pull/Legs' });
    const f2 = folder({ id: 2, title: 'Upper/Lower', position: 1 });
    const r1 = routine({ id: 'r1', folderId: 1 });
    const r2 = routine({ id: 'r2', folderId: 2 });

    const sections = buildFolderSections([f1, f2], [r1, r2]);

    expect(sections).toEqual([
      { folder: f1, routines: [r1] },
      { folder: f2, routines: [r2] },
      { folder: null, routines: [] },
    ]);
  });

  it('appends a My Routines section with zero real folders, as long as at least one ungrouped routine exists', () => {
    const r1 = routine({ id: 'r1', folderId: null });

    const sections = buildFolderSections([], [r1]);

    expect(sections).toEqual([{ folder: null, routines: [r1] }]);
  });

  it('preserves input order within each folder scope (caller is expected to have already ordered by position)', () => {
    const f1 = folder({ id: 1 });
    const r1 = routine({ id: 'r1', folderId: 1, position: 0 });
    const r2 = routine({ id: 'r2', folderId: 1, position: 1 });

    const sections = buildFolderSections([f1], [r1, r2]);

    expect(sections[0]!.routines.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('buildExercisePreview', () => {
  const names = new Map([
    ['ex-1', 'Bench Press'],
    ['ex-2', 'Squat'],
  ]);

  function full(overrides: Partial<RoutineFull> = {}): RoutineFull {
    return {
      id: 'r1',
      title: 'Push Day',
      notes: null,
      folderId: null,
      position: 0,
      createdAt: 0,
      updatedAt: 0,
      exercises: [],
      ...overrides,
    };
  }

  it('returns an empty string while the preview has not loaded yet (undefined/null)', () => {
    expect(buildExercisePreview(undefined, names)).toBe('');
    expect(buildExercisePreview(null, names)).toBe('');
  });

  it('returns the "no exercises" copy for a genuinely empty routine', () => {
    expect(buildExercisePreview(full({ exercises: [] }), names)).toBe('No exercises yet');
  });

  it('comma-joins exercise names in order, via the id lookup', () => {
    const routineFull = full({
      exercises: [
        {
          id: 're-1',
          routineId: 'r1',
          exerciseId: 'ex-1',
          position: 0,
          supersetId: null,
          notes: null,
          restSeconds: null,
          sets: [],
        },
        {
          id: 're-2',
          routineId: 'r1',
          exerciseId: 'ex-2',
          position: 1,
          supersetId: null,
          notes: null,
          restSeconds: null,
          sets: [],
        },
      ],
    });

    expect(buildExercisePreview(routineFull, names)).toBe('Bench Press, Squat');
  });

  it('falls back to "Unknown exercise" for an id missing from the lookup', () => {
    const routineFull = full({
      exercises: [
        {
          id: 're-1',
          routineId: 'r1',
          exerciseId: 'ex-missing',
          position: 0,
          supersetId: null,
          notes: null,
          restSeconds: null,
          sets: [],
        },
      ],
    });

    expect(buildExercisePreview(routineFull, names)).toBe('Unknown exercise');
  });
});
