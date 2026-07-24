/**
 * `RoutineDraft` (M3-04, 04 §2.1/§3.3) — the routine editor's own in-memory
 * shape plus every pure mutation/conversion function
 * `RoutineEditorScreen.tsx` calls. Modeled deliberately close to
 * `RoutineFull`/`RoutineExerciseFull`/`RoutineSet` (`src/data/routines/
 * types.ts`) rather than reusing those types verbatim, for the same reason
 * `ConnectedSetRow.tsx`'s header gives for not sharing `ui/SetRow`'s column
 * type with `domain/set-table-columns.ts`'s: the editor's draft needs
 * fields those repository types don't carry (a per-set `rangeMode` UI flag,
 * §"Rep-range toggle" below) and every id here is a **local, client-minted**
 * string — stable for React `key`s and for addressing a specific
 * exercise/set within the draft during an edit session — not yet a real
 * `routine_exercises`/`routine_sets` row id for newly-added exercises/sets
 * (those only exist once `RoutineRepository.create`/`update` actually
 * persists them and mints its own uuids, `routine-repository.ts`'s own
 * header). Existing rows (edit mode) keep their real ids as their draft id
 * — `draftToNewRoutineExercises` below never needs to tell "was this row
 * pre-existing" apart, since `RoutineRepository.update`'s own `exercises`
 * field is documented as replace-all-or-omit (`types.ts`'s header): every
 * save always resends the *whole* structure, pre-existing ids and all, and
 * the repository always reinserts fresh rows regardless. There is
 * deliberately no separate "is this exercise/set new" bookkeeping anywhere
 * in this module for that same reason.
 *
 * ## Rep-range toggle (04 §2.1) — why `rangeMode` is a flag, not a derived value
 *
 * "REPS cell accepts a single value ... tapping the REPS column header (or
 * long-press the cell) toggles rep range mode for that set." A user can
 * toggle range mode *before* typing anything (an empty range is still a
 * valid, if incomplete, draft state) — so "is this row in range mode" can't
 * be derived purely from "are `repRangeStart`/`repRangeEnd` non-null," it
 * needs its own boolean. `toggleSetRepRange`/`toggleExerciseRepRange`
 * (bulk, the REPS *header* tap — see `ui/SetTable.tsx`'s header for why a
 * table-wide header maps to a bulk toggle rather than one ambiguous "that
 * set") both **clear the other representation** on toggle (range → single:
 * drop `repRangeStart`/`repRangeEnd`, keep `reps` at whatever it already
 * was — never invented from the range; single → range: drop `reps`) so a
 * set can never carry both at once, matching `routine_sets_reps_xor_range_
 * check` (05 §3.3) — `draftToNewRoutineSets` below still defensively nulls
 * one side when `rangeMode` and stored fields ever disagree (belt-and-
 * braces, not load-bearing given the toggle functions' own invariant).
 *
 * ## Dirty tracking (04 §2.1: "Cancel ... confirm if dirty")
 *
 * Deliberately **not** a deep-equality diff against the original draft —
 * `isDraftDirty` here doesn't exist; `RoutineEditorScreen.tsx` instead
 * tracks a plain `dirty` boolean flipped `true` by every mutating handler
 * (the same "hasUnsavedChanges flag, not a structural diff" shape most
 * native form UIs use) because a structural diff would have to reason about
 * UI-only noise (`rangeMode` toggled twice back to its original value, a
 * set added then immediately removed) that a flag-based approach sidesteps
 * entirely — simpler and unambiguous for this screen's purposes, at the
 * cost of not detecting a "toggled back to identical" edit as clean again
 * (an accepted, explicitly-chosen simplification, not an oversight).
 */
import type {
  NewRoutineExerciseInput,
  NewRoutineInput,
  NewRoutineSetInput,
  RoutineFull,
  UpdateRoutineInput,
} from '@/data/routines/types';
import type { SetType } from '@/domain/enums';

export interface DraftSet {
  /** Local draft id — a real `routine_sets` uuid when hydrated from an existing routine (edit mode), a freshly minted local id when added in this session (`generateDraftId`). Never sent to the repository (`draftToNewRoutineSets` drops it). */
  id: string;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  repRangeStart: number | null;
  repRangeEnd: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
  /** UI-only — see file header's "Rep-range toggle" section. Never persisted. */
  rangeMode: boolean;
}

export interface DraftExercise {
  /** Local draft id — see {@link DraftSet.id}'s doc comment for the same "real id vs. freshly minted" split. */
  id: string;
  exerciseId: string;
  supersetId: number | null;
  notes: string | null;
  restSeconds: number | null;
  sets: DraftSet[];
}

export interface RoutineDraft {
  title: string;
  notes: string | null;
  folderId: number | null;
  exercises: DraftExercise[];
}

/** Client-side id for a draft row — unique enough within one editor session (React `key`/lookup addressing only, never persisted or compared across sessions), not a replacement for `generateUuid` (`data/shared/uuid.ts`), which is async and only ever needed at the actual repository-write boundary. */
export function generateDraftId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A freshly added set's defaults — `normal` type, single-value mode, every value empty. Mirrors the active logger's own "a newly added set starts blank" convention (`WorkoutRepository.addSet`). */
export function emptyDraftSet(): DraftSet {
  return {
    id: generateDraftId('set'),
    setType: 'normal',
    weightKg: null,
    reps: null,
    repRangeStart: null,
    repRangeEnd: null,
    distanceMeters: null,
    durationSeconds: null,
    customMetric: null,
    rangeMode: false,
  };
}

export function createEmptyDraft(): RoutineDraft {
  return { title: '', notes: null, folderId: null, exercises: [] };
}

/** Hydrate an editor draft from an existing routine (edit mode) — every id carried over verbatim (see file header). */
export function draftFromRoutineFull(full: RoutineFull): RoutineDraft {
  return {
    title: full.title,
    notes: full.notes,
    folderId: full.folderId,
    exercises: full.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      supersetId: exercise.supersetId,
      notes: exercise.notes,
      restSeconds: exercise.restSeconds,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        setType: set.setType,
        weightKg: set.weightKg,
        reps: set.reps,
        repRangeStart: set.repRangeStart,
        repRangeEnd: set.repRangeEnd,
        distanceMeters: set.distanceMeters,
        durationSeconds: set.durationSeconds,
        customMetric: set.customMetric,
        rangeMode: set.repRangeStart !== null || set.repRangeEnd !== null,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Exercise-level mutations
// ---------------------------------------------------------------------------

/**
 * Add one or more exercises (`ExercisePickerSheet`'s `mode="add"` result,
 * M2-09) — each starts with one blank set. When `superset` is true and more
 * than one exercise was picked, group the *newly added* exercises together
 * (never with pre-existing ones) at the lowest involved position — the
 * exact `ActiveWorkoutScreen.handlePickerAdd` convention (02 §8),
 * reimplemented here since positions in the draft are plain array indices
 * rather than a `position` column round-tripped through a repository.
 */
export function addExercisesToDraft(
  draft: RoutineDraft,
  exerciseIds: string[],
  options: { superset: boolean; defaultRestSeconds: number | null },
): RoutineDraft {
  const startIndex = draft.exercises.length;
  const added: DraftExercise[] = exerciseIds.map((exerciseId) => ({
    id: generateDraftId('exercise'),
    exerciseId,
    supersetId: null,
    notes: null,
    restSeconds: options.defaultRestSeconds,
    sets: [emptyDraftSet()],
  }));

  if (options.superset && added.length > 1) {
    const groupId = startIndex;
    added.forEach((exercise) => {
      exercise.supersetId = groupId;
    });
  }

  return { ...draft, exercises: [...draft.exercises, ...added] };
}

export function removeExerciseFromDraft(draft: RoutineDraft, draftExerciseId: string): RoutineDraft {
  return { ...draft, exercises: draft.exercises.filter((exercise) => exercise.id !== draftExerciseId) };
}

export function replaceExerciseInDraft(
  draft: RoutineDraft,
  draftExerciseId: string,
  newExerciseId: string,
): RoutineDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === draftExerciseId ? { ...exercise, exerciseId: newExerciseId } : exercise,
    ),
  };
}

export function reorderDraftExercises(draft: RoutineDraft, orderedDraftExerciseIds: string[]): RoutineDraft {
  const byId = new Map(draft.exercises.map((exercise) => [exercise.id, exercise]));
  const reordered = orderedDraftExerciseIds
    .map((id) => byId.get(id))
    .filter((exercise): exercise is DraftExercise => exercise != null);
  // Defensive: any draft exercise missing from the supplied order (should
  // never happen — `ReorderExercisesSheet` always hands back a permutation
  // of what it was given) is appended at the end rather than silently
  // dropped.
  const missing = draft.exercises.filter((exercise) => !orderedDraftExerciseIds.includes(exercise.id));
  return { ...draft, exercises: [...reordered, ...missing] };
}

export function updateDraftExerciseNotes(
  draft: RoutineDraft,
  draftExerciseId: string,
  notes: string | null,
): RoutineDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === draftExerciseId ? { ...exercise, notes } : exercise,
    ),
  };
}

export function updateDraftExerciseRestSeconds(
  draft: RoutineDraft,
  draftExerciseId: string,
  restSeconds: number | null,
): RoutineDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === draftExerciseId ? { ...exercise, restSeconds } : exercise,
    ),
  };
}

/** 02 §8 / `AddToSupersetSheet`'s own contract: group `draftExerciseId` + `memberIds` under the lowest involved position among them. */
export function groupDraftSuperset(
  draft: RoutineDraft,
  draftExerciseId: string,
  memberDraftExerciseIds: string[],
): RoutineDraft {
  const allIds = [draftExerciseId, ...memberDraftExerciseIds];
  const positions = draft.exercises
    .map((exercise, index) => ({ id: exercise.id, index }))
    .filter((entry) => allIds.includes(entry.id));
  if (positions.length === 0) {
    return draft;
  }
  const groupId = Math.min(...positions.map((entry) => entry.index));
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      allIds.includes(exercise.id) ? { ...exercise, supersetId: groupId } : exercise,
    ),
  };
}

/** M2-12's "group of 1 auto-dissolves" rule, reimplemented for the draft (02 §8). */
export function removeDraftExerciseFromSuperset(draft: RoutineDraft, draftExerciseId: string): RoutineDraft {
  const target = draft.exercises.find((exercise) => exercise.id === draftExerciseId);
  if (!target || target.supersetId === null) {
    return draft;
  }
  const groupId = target.supersetId;
  const remainingMembers = draft.exercises.filter(
    (exercise) => exercise.supersetId === groupId && exercise.id !== draftExerciseId,
  );
  const dissolve = remainingMembers.length === 1;
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) => {
      if (exercise.id === draftExerciseId) {
        return { ...exercise, supersetId: null };
      }
      if (dissolve && exercise.id === remainingMembers[0]!.id) {
        return { ...exercise, supersetId: null };
      }
      return exercise;
    }),
  };
}

// ---------------------------------------------------------------------------
// Set-level mutations
// ---------------------------------------------------------------------------

function mapExerciseSets(
  draft: RoutineDraft,
  draftExerciseId: string,
  mapSets: (sets: DraftSet[]) => DraftSet[],
): RoutineDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === draftExerciseId ? { ...exercise, sets: mapSets(exercise.sets) } : exercise,
    ),
  };
}

export function addDraftSet(draft: RoutineDraft, draftExerciseId: string): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) => [...sets, emptyDraftSet()]);
}

export function removeDraftSet(draft: RoutineDraft, draftExerciseId: string, draftSetId: string): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) => sets.filter((set) => set.id !== draftSetId));
}

export function setDraftSetType(
  draft: RoutineDraft,
  draftExerciseId: string,
  draftSetId: string,
  setType: SetType,
): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) =>
    sets.map((set) => (set.id === draftSetId ? { ...set, setType } : set)),
  );
}

/** Patch a set's non-rep target fields (weight/distance/duration/custom) — never `reps`/`repRangeStart`/`repRangeEnd`, which go through {@link setDraftSetReps}/the range toggles below so the XOR invariant only ever lives in one place. */
export function updateDraftSetTarget(
  draft: RoutineDraft,
  draftExerciseId: string,
  draftSetId: string,
  patch: Partial<Pick<DraftSet, 'weightKg' | 'distanceMeters' | 'durationSeconds' | 'customMetric'>>,
): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) =>
    sets.map((set) => (set.id === draftSetId ? { ...set, ...patch } : set)),
  );
}

/** Single-value REPS write (`rangeMode` already false for this row) — 04 §2.1: "single value stores reps." */
export function setDraftSetReps(
  draft: RoutineDraft,
  draftExerciseId: string,
  draftSetId: string,
  reps: number | null,
): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) =>
    sets.map((set) => (set.id === draftSetId ? { ...set, reps } : set)),
  );
}

/** Range-mode `from`/`to` write (`rangeMode` already true for this row). */
export function setDraftSetRepRange(
  draft: RoutineDraft,
  draftExerciseId: string,
  draftSetId: string,
  bound: 'start' | 'end',
  value: number | null,
): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) =>
    sets.map((set) =>
      set.id === draftSetId
        ? { ...set, [bound === 'start' ? 'repRangeStart' : 'repRangeEnd']: value }
        : set,
    ),
  );
}

/** Long-press-the-cell toggle (single row) — see file header's "Rep-range toggle" section for why the *other* representation is cleared, not preserved. */
export function toggleSetRepRange(draft: RoutineDraft, draftExerciseId: string, draftSetId: string): RoutineDraft {
  return mapExerciseSets(draft, draftExerciseId, (sets) =>
    sets.map((set) => {
      if (set.id !== draftSetId) {
        return set;
      }
      return set.rangeMode
        ? { ...set, rangeMode: false, repRangeStart: null, repRangeEnd: null }
        : { ...set, rangeMode: true, reps: null };
    }),
  );
}

/** Tap-the-REPS-header bulk toggle (whole exercise) — `ui/SetTable.tsx`'s own header explains why a table-wide header maps to "every set in this exercise," not one ambiguous row. Toggles every set in the exercise to the **opposite of the first set's current mode** (so a mixed-mode exercise — reachable only via per-row long-press — converges to one mode in a single tap, same "make it uniform" intent a bulk toggle implies). */
export function toggleExerciseRepRange(draft: RoutineDraft, draftExerciseId: string): RoutineDraft {
  const exercise = draft.exercises.find((e) => e.id === draftExerciseId);
  if (!exercise || exercise.sets.length === 0) {
    return draft;
  }
  const nextRangeMode = !exercise.sets[0]!.rangeMode;
  return mapExerciseSets(draft, draftExerciseId, (sets) =>
    sets.map((set) =>
      nextRangeMode
        ? { ...set, rangeMode: true, reps: null }
        : { ...set, rangeMode: false, repRangeStart: null, repRangeEnd: null },
    ),
  );
}

// ---------------------------------------------------------------------------
// Draft -> repository input conversion (04 §2.1 Save)
// ---------------------------------------------------------------------------

function draftSetToInput(set: DraftSet): NewRoutineSetInput {
  // Defensive XOR guard (file header: "belt-and-braces, not load-bearing")
  // — the toggle functions above already guarantee a set never carries both
  // representations, but `assertRepsXorRange` (`routine-repository.ts`)
  // would throw a hard error rather than silently drop one side, so this
  // mirrors `rangeMode` one more time right at the save boundary.
  const hasRange = set.repRangeStart !== null || set.repRangeEnd !== null;
  return {
    setType: set.setType,
    weightKg: set.weightKg,
    reps: hasRange ? null : set.reps,
    repRangeStart: hasRange ? set.repRangeStart : null,
    repRangeEnd: hasRange ? set.repRangeEnd : null,
    distanceMeters: set.distanceMeters,
    durationSeconds: set.durationSeconds,
    customMetric: set.customMetric,
  };
}

function draftExerciseToInput(exercise: DraftExercise): NewRoutineExerciseInput {
  return {
    exerciseId: exercise.exerciseId,
    supersetId: exercise.supersetId,
    notes: exercise.notes,
    restSeconds: exercise.restSeconds,
    sets: exercise.sets.map(draftSetToInput),
  };
}

export function draftToNewRoutineInput(draft: RoutineDraft): NewRoutineInput {
  return {
    title: draft.title.trim(),
    notes: draft.notes,
    folderId: draft.folderId,
    exercises: draft.exercises.map(draftExerciseToInput),
  };
}

export function draftToUpdateRoutineInput(draft: RoutineDraft): UpdateRoutineInput {
  return {
    title: draft.title.trim(),
    notes: draft.notes,
    exercises: draft.exercises.map(draftExerciseToInput),
  };
}
