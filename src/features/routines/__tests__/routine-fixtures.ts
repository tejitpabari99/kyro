/**
 * Shared `RoutinesHubScreen` test fixtures (M3-02) — small builder
 * functions plus an in-memory `FakeRoutineRepository` that implements the
 * full `RoutineRepository` interface (so it satisfies the type, matching
 * `exercise-fixtures.ts`'s `FakeExerciseRepository` convention, M1-07)
 * while only genuinely implementing the subset of methods
 * `RoutinesHubScreen` actually calls: `listFolders`/`list`/`getFull`/
 * `createFolder`/`renameFolder`/`setFolderCollapsed`/`deleteFolder`/
 * `reorderFolders`/`duplicate`/`moveToFolder`/`reorderRoutines` (M3-03)/
 * `delete`. The rest throw — same "unused by <screen>" convention
 * `FakeExerciseRepository` uses — so a test that accidentally exercises an
 * unwired path fails loudly instead of silently no-opping.
 */
import type {
  DeleteFolderOptions,
  RoutineFolder,
  RoutineFull,
  RoutineListFilter,
  RoutineRepository,
  RoutineSummary,
} from '@/data/routines/types';

export function fixtureFolder(
  overrides: Partial<RoutineFolder> & Pick<RoutineFolder, 'id' | 'title'>,
): RoutineFolder {
  return {
    position: 0,
    collapsed: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export function fixtureRoutine(
  overrides: Partial<RoutineSummary> & Pick<RoutineSummary, 'id' | 'title'>,
): RoutineSummary {
  return {
    notes: null,
    folderId: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export function fixtureRoutineFull(
  overrides: Partial<RoutineFull> & Pick<RoutineFull, 'id' | 'title'>,
): RoutineFull {
  return {
    notes: null,
    folderId: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    exercises: [],
    ...overrides,
  };
}

export class FakeRoutineRepository implements RoutineRepository {
  folders: RoutineFolder[];
  routines: RoutineSummary[];
  fulls: Map<string, RoutineFull>;

  constructor(init: { folders?: RoutineFolder[]; routines?: RoutineSummary[]; fulls?: RoutineFull[] }) {
    this.folders = init.folders ?? [];
    this.routines = init.routines ?? [];
    this.fulls = new Map((init.fulls ?? []).map((full) => [full.id, full]));
  }

  async listFolders(): Promise<RoutineFolder[]> {
    return [...this.folders].sort((a, b) => a.position - b.position);
  }

  async createFolder({ title }: { title: string }): Promise<RoutineFolder> {
    const nextId = this.folders.reduce((max, f) => Math.max(max, f.id), 0) + 1;
    const folder = fixtureFolder({ id: nextId, title, position: this.folders.length });
    this.folders.push(folder);
    return folder;
  }

  async renameFolder(id: number, title: string): Promise<RoutineFolder> {
    if (!this.folders.some((f) => f.id === id)) throw new Error(`Routine folder "${id}" was not found.`);
    // Immutable replace (new object), not an in-place field mutation — a
    // real SQLite-backed read always returns a freshly-mapped object, and
    // mutating a shared reference in place here would silently defeat
    // TanStack Query's structural-sharing diff on the next refetch (the
    // "same object reference back" case reads as "no change," so the
    // observer never re-notifies/re-renders) — this bit a first draft of
    // `RoutinesHubScreen.test.tsx`'s collapse-persistence case.
    this.folders = this.folders.map((f) => (f.id === id ? { ...f, title } : f));
    return this.folders.find((f) => f.id === id)!;
  }

  async setFolderCollapsed(id: number, collapsed: boolean): Promise<RoutineFolder> {
    if (!this.folders.some((f) => f.id === id)) throw new Error(`Routine folder "${id}" was not found.`);
    // Immutable replace — see `renameFolder`'s comment above.
    this.folders = this.folders.map((f) => (f.id === id ? { ...f, collapsed } : f));
    return this.folders.find((f) => f.id === id)!;
  }

  async deleteFolder(id: number, options: DeleteFolderOptions): Promise<void> {
    if (options.mode === 'cascade') {
      this.routines = this.routines.filter((routine) => routine.folderId !== id);
    } else {
      this.routines = this.routines.map((routine) =>
        routine.folderId === id ? { ...routine, folderId: null } : routine,
      );
    }
    this.folders = this.folders.filter((folder) => folder.id !== id);
  }

  async reorderFolders(orderedFolderIds: number[]): Promise<void> {
    const position = new Map(orderedFolderIds.map((id, index) => [id, index]));
    this.folders = this.folders.map((folder) =>
      position.has(folder.id) ? { ...folder, position: position.get(folder.id)! } : folder,
    );
  }

  async list(filter: RoutineListFilter = {}): Promise<RoutineSummary[]> {
    if (filter.folderId !== undefined) {
      return this.routines.filter((routine) => routine.folderId === filter.folderId);
    }
    const folderPosition = new Map(this.folders.map((f) => [f.id, f.position]));
    return [...this.routines].sort((a, b) => {
      const aKey = a.folderId === null ? Number.MAX_SAFE_INTEGER : (folderPosition.get(a.folderId) ?? 0);
      const bKey = b.folderId === null ? Number.MAX_SAFE_INTEGER : (folderPosition.get(b.folderId) ?? 0);
      if (aKey !== bKey) return aKey - bKey;
      return a.position - b.position;
    });
  }

  async get(id: string): Promise<RoutineSummary | null> {
    return this.routines.find((routine) => routine.id === id) ?? null;
  }

  async getFull(id: string): Promise<RoutineFull | null> {
    return this.fulls.get(id) ?? null;
  }

  async create(): Promise<RoutineFull> {
    throw new Error('FakeRoutineRepository.create is not implemented — unused by RoutinesHubScreen.');
  }

  async update(): Promise<RoutineFull> {
    throw new Error('FakeRoutineRepository.update is not implemented — unused by RoutinesHubScreen.');
  }

  async moveToFolder(id: string, folderId: number | null): Promise<RoutineFull> {
    if (!this.routines.some((r) => r.id === id)) throw new Error(`Routine "${id}" was not found.`);
    // Immutable replace — see `renameFolder`'s comment above.
    this.routines = this.routines.map((r) => (r.id === id ? { ...r, folderId } : r));
    const routine = this.routines.find((r) => r.id === id)!;
    const full = this.fulls.get(id);
    const updatedFull = full ? { ...full, folderId } : fixtureRoutineFull({ ...routine });
    this.fulls.set(id, updatedFull);
    return updatedFull;
  }

  async reorderRoutines(folderId: number | null, orderedRoutineIds: string[]): Promise<void> {
    // M3-03: real implementation now that `RoutinesHubScreen`'s reorder mode
    // actually calls this. Same lenient "map positions for the ids given,
    // leave everything else untouched" shape as `reorderFolders` above
    // (rather than the real repository's strict-permutation validation,
    // `RoutineReorderMismatchError`) — this fake exists to drive
    // `RoutinesHubScreen`'s screen-level tests, not to re-prove M3-01's own
    // repository-boundary validation, which already has its own integration
    // test coverage.
    const position = new Map(orderedRoutineIds.map((id, index) => [id, index]));
    this.routines = this.routines.map((routine) =>
      routine.folderId === folderId && position.has(routine.id)
        ? { ...routine, position: position.get(routine.id)! }
        : routine,
    );
  }

  async duplicate(id: string): Promise<RoutineFull> {
    const routine = this.routines.find((r) => r.id === id);
    if (!routine) throw new Error(`Routine "${id}" was not found.`);
    const copy = fixtureRoutine({ ...routine, id: `${id}-copy`, title: `${routine.title} copy` });
    this.routines.push(copy);
    const originalFull = this.fulls.get(id);
    const copyFull = fixtureRoutineFull({
      ...(originalFull ?? fixtureRoutineFull({ ...routine })),
      id: copy.id,
      title: copy.title,
    });
    this.fulls.set(copy.id, copyFull);
    return copyFull;
  }

  async delete(id: string): Promise<void> {
    this.routines = this.routines.filter((routine) => routine.id !== id);
    this.fulls.delete(id);
  }

  async createFromWorkout(): Promise<RoutineFull> {
    throw new Error(
      'FakeRoutineRepository.createFromWorkout is not implemented — unused by RoutinesHubScreen.',
    );
  }

  async updateFromWorkout(): Promise<RoutineFull> {
    throw new Error(
      'FakeRoutineRepository.updateFromWorkout is not implemented — unused by RoutinesHubScreen.',
    );
  }
}
