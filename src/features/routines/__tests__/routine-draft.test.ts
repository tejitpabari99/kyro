/**
 * `routine-draft.ts` pure unit tests (M3-04) — every mutator/converter,
 * independent of any rendered UI. RNTL behavioral coverage (range-toggle
 * interaction, dirty-cancel, save-disabled, zero-exercise warn) lives in
 * `RoutineEditorScreen.test.tsx`; the repository-level "save round-trips
 * through getFull, including a mixed ranged/single-value save" acceptance
 * case lives there too (real `RoutineRepositoryImpl`).
 */
import type { RoutineFull } from '@/data/routines/types';

import {
  addExercisesToDraft,
  createEmptyDraft,
  draftFromRoutineFull,
  draftToNewRoutineInput,
  draftToUpdateRoutineInput,
  emptyDraftSet,
  groupDraftSuperset,
  reorderDraftExercises,
  removeDraftExerciseFromSuperset,
  removeExerciseFromDraft,
  replaceExerciseInDraft,
  setDraftSetRepRange,
  setDraftSetReps,
  setDraftSetType,
  toggleExerciseRepRange,
  toggleSetRepRange,
  updateDraftExerciseNotes,
  updateDraftExerciseRestSeconds,
  updateDraftSetTarget,
  type RoutineDraft,
} from '../routine-draft';

function draftWithOneExercise(): RoutineDraft {
  return addExercisesToDraft(createEmptyDraft(), ['bench'], { superset: false, defaultRestSeconds: 90 });
}

describe('createEmptyDraft / emptyDraftSet', () => {
  it('starts with an empty title, no notes/folder, no exercises', () => {
    expect(createEmptyDraft()).toEqual({ title: '', notes: null, folderId: null, exercises: [] });
  });

  it('a fresh set is a blank normal set, not in range mode', () => {
    const set = emptyDraftSet();
    expect(set.setType).toBe('normal');
    expect(set.rangeMode).toBe(false);
    expect(set.reps).toBeNull();
    expect(set.repRangeStart).toBeNull();
    expect(set.repRangeEnd).toBeNull();
  });

  it('mints a unique id per call', () => {
    const a = emptyDraftSet();
    const b = emptyDraftSet();
    expect(a.id).not.toBe(b.id);
  });
});

describe('addExercisesToDraft', () => {
  it('appends one exercise per id, each with one blank set', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat'], {
      superset: false,
      defaultRestSeconds: 60,
    });
    expect(draft.exercises).toHaveLength(2);
    expect(draft.exercises[0]!.exerciseId).toBe('bench');
    expect(draft.exercises[0]!.sets).toHaveLength(1);
    expect(draft.exercises[0]!.restSeconds).toBe(60);
    expect(draft.exercises[0]!.supersetId).toBeNull();
  });

  it('groups newly added exercises together under the lowest position when superset=true and >1 picked', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat', 'row'], {
      superset: true,
      defaultRestSeconds: null,
    });
    expect(draft.exercises.map((e) => e.supersetId)).toEqual([0, 0, 0]);
  });

  it('does not group when superset=true but only one exercise was picked', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench'], { superset: true, defaultRestSeconds: null });
    expect(draft.exercises[0]!.supersetId).toBeNull();
  });

  it('never groups newly added exercises with pre-existing ones', () => {
    let draft = addExercisesToDraft(createEmptyDraft(), ['bench'], { superset: false, defaultRestSeconds: null });
    draft = addExercisesToDraft(draft, ['squat', 'row'], { superset: true, defaultRestSeconds: null });
    expect(draft.exercises[0]!.supersetId).toBeNull(); // bench, pre-existing
    expect(draft.exercises[1]!.supersetId).toBe(1); // squat — lowest index among [squat, row] is 1
    expect(draft.exercises[2]!.supersetId).toBe(1);
  });
});

describe('removeExerciseFromDraft / replaceExerciseInDraft / reorderDraftExercises', () => {
  it('removes the matching exercise only', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat'], {
      superset: false,
      defaultRestSeconds: null,
    });
    const id = draft.exercises[0]!.id;
    const next = removeExerciseFromDraft(draft, id);
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0]!.exerciseId).toBe('squat');
  });

  // M3 milestone-wide review finding: removing an entire grouped exercise
  // (not just "Remove from Superset") must also auto-dissolve a group left
  // with one surviving member (02 §8) — see `removeExerciseFromDraft`'s own
  // doc comment for why this matters more here than on the active-workout
  // side (no later `finish()` pass to clean it up before it's persisted).
  it('removing a grouped exercise auto-dissolves a group left with one surviving member', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat'], {
      superset: true,
      defaultRestSeconds: null,
    });
    const [bench, squat] = draft.exercises.map((e) => e.id) as [string, string];
    const next = removeExerciseFromDraft(draft, bench);
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises.find((e) => e.id === squat)!.supersetId).toBeNull();
  });

  it('removing one member of a 3+ group leaves the remaining members grouped', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat', 'row'], {
      superset: true,
      defaultRestSeconds: null,
    });
    const [bench, squat, row] = draft.exercises.map((e) => e.id) as [string, string, string];
    const next = removeExerciseFromDraft(draft, bench);
    expect(next.exercises).toHaveLength(2);
    expect(next.exercises.find((e) => e.id === squat)!.supersetId).toBe(0);
    expect(next.exercises.find((e) => e.id === row)!.supersetId).toBe(0);
  });

  it('removing an ungrouped exercise never touches other exercises supersetId', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat'], {
      superset: true,
      defaultRestSeconds: null,
    });
    let withExtra = addExercisesToDraft(draft, ['row'], { superset: false, defaultRestSeconds: null });
    const rowId = withExtra.exercises[2]!.id;
    withExtra = removeExerciseFromDraft(withExtra, rowId);
    expect(withExtra.exercises).toHaveLength(2);
    expect(withExtra.exercises.map((e) => e.supersetId)).toEqual([0, 0]);
  });

  it('replaces exerciseId in place, keeping the same draft id/sets', () => {
    const draft = draftWithOneExercise();
    const id = draft.exercises[0]!.id;
    const next = replaceExerciseInDraft(draft, id, 'squat');
    expect(next.exercises[0]!.id).toBe(id);
    expect(next.exercises[0]!.exerciseId).toBe('squat');
    expect(next.exercises[0]!.sets).toBe(draft.exercises[0]!.sets);
  });

  it('reorders exercises per the given id order', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat', 'row'], {
      superset: false,
      defaultRestSeconds: null,
    });
    const [a, b, c] = draft.exercises.map((e) => e.id) as [string, string, string];
    const next = reorderDraftExercises(draft, [c, a, b]);
    expect(next.exercises.map((e) => e.exerciseId)).toEqual(['row', 'bench', 'squat']);
  });
});

describe('superset grouping', () => {
  it('groupDraftSuperset assigns the lowest involved index to every member', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat', 'row'], {
      superset: false,
      defaultRestSeconds: null,
    });
    const [bench, squat, row] = draft.exercises.map((e) => e.id) as [string, string, string];
    const next = groupDraftSuperset(draft, row, [bench, squat]);
    expect(next.exercises.map((e) => e.supersetId)).toEqual([0, 0, 0]);
  });

  it('removeDraftExerciseFromSuperset clears the leaving exercise and auto-dissolves a group of 1', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat'], {
      superset: true,
      defaultRestSeconds: null,
    });
    const [bench, squat] = draft.exercises.map((e) => e.id) as [string, string];
    const next = removeDraftExerciseFromSuperset(draft, bench);
    expect(next.exercises.find((e) => e.id === bench)!.supersetId).toBeNull();
    expect(next.exercises.find((e) => e.id === squat)!.supersetId).toBeNull();
  });

  it('removeDraftExerciseFromSuperset leaves a 3+ group intact for the remaining members', () => {
    const draft = addExercisesToDraft(createEmptyDraft(), ['bench', 'squat', 'row'], {
      superset: true,
      defaultRestSeconds: null,
    });
    const [bench, squat, row] = draft.exercises.map((e) => e.id) as [string, string, string];
    const next = removeDraftExerciseFromSuperset(draft, bench);
    expect(next.exercises.find((e) => e.id === bench)!.supersetId).toBeNull();
    expect(next.exercises.find((e) => e.id === squat)!.supersetId).toBe(0);
    expect(next.exercises.find((e) => e.id === row)!.supersetId).toBe(0);
  });

  it('is a no-op when the exercise is not grouped', () => {
    const draft = draftWithOneExercise();
    const id = draft.exercises[0]!.id;
    expect(removeDraftExerciseFromSuperset(draft, id)).toBe(draft);
  });
});

describe('notes / rest seconds', () => {
  it('updateDraftExerciseNotes patches only the matching exercise', () => {
    const draft = draftWithOneExercise();
    const id = draft.exercises[0]!.id;
    const next = updateDraftExerciseNotes(draft, id, 'go slow');
    expect(next.exercises[0]!.notes).toBe('go slow');
  });

  it('updateDraftExerciseRestSeconds patches only the matching exercise', () => {
    const draft = draftWithOneExercise();
    const id = draft.exercises[0]!.id;
    const next = updateDraftExerciseRestSeconds(draft, id, 120);
    expect(next.exercises[0]!.restSeconds).toBe(120);
  });
});

describe('set mutations', () => {
  it('setDraftSetType patches the matching set only', () => {
    const draft = addExercisesToDraft(draftWithOneExercise(), ['squat'], {
      superset: false,
      defaultRestSeconds: null,
    });
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    const next = setDraftSetType(draft, exerciseId, setId, 'dropset');
    expect(next.exercises[0]!.sets[0]!.setType).toBe('dropset');
    // Sibling exercise's own sets untouched (same array reference).
    expect(next.exercises[1]!.sets).toBe(draft.exercises[1]!.sets);
  });

  it('updateDraftSetTarget patches weight/distance/duration/custom without touching reps/range', () => {
    const draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    const next = updateDraftSetTarget(draft, exerciseId, setId, { weightKg: 60 });
    expect(next.exercises[0]!.sets[0]!.weightKg).toBe(60);
    expect(next.exercises[0]!.sets[0]!.reps).toBeNull();
  });

  it('setDraftSetReps writes reps only', () => {
    const draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    const next = setDraftSetReps(draft, exerciseId, setId, 8);
    expect(next.exercises[0]!.sets[0]!.reps).toBe(8);
  });

  it('setDraftSetRepRange writes start/end independently', () => {
    const draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    let next = setDraftSetRepRange(draft, exerciseId, setId, 'start', 6);
    next = setDraftSetRepRange(next, exerciseId, setId, 'end', 8);
    expect(next.exercises[0]!.sets[0]!.repRangeStart).toBe(6);
    expect(next.exercises[0]!.sets[0]!.repRangeEnd).toBe(8);
  });
});

describe('rep-range toggles', () => {
  it('toggleSetRepRange (single -> range) clears reps and sets rangeMode', () => {
    const draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    const withReps = setDraftSetReps(draft, exerciseId, setId, 8);
    const toggled = toggleSetRepRange(withReps, exerciseId, setId);
    expect(toggled.exercises[0]!.sets[0]!.rangeMode).toBe(true);
    expect(toggled.exercises[0]!.sets[0]!.reps).toBeNull();
  });

  it('toggleSetRepRange (range -> single) clears repRangeStart/End and unsets rangeMode', () => {
    const draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    let ranged = toggleSetRepRange(draft, exerciseId, setId);
    ranged = setDraftSetRepRange(ranged, exerciseId, setId, 'start', 6);
    ranged = setDraftSetRepRange(ranged, exerciseId, setId, 'end', 8);
    const back = toggleSetRepRange(ranged, exerciseId, setId);
    expect(back.exercises[0]!.sets[0]!.rangeMode).toBe(false);
    expect(back.exercises[0]!.sets[0]!.repRangeStart).toBeNull();
    expect(back.exercises[0]!.sets[0]!.repRangeEnd).toBeNull();
  });

  it('toggleSetRepRange only touches the targeted set, not its siblings', () => {
    let draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    draft = { ...draft, exercises: [{ ...draft.exercises[0]!, sets: [emptyDraftSet(), emptyDraftSet()] }] };
    const [first, second] = draft.exercises[0]!.sets;
    const next = toggleSetRepRange(draft, exerciseId, first!.id);
    expect(next.exercises[0]!.sets[0]!.rangeMode).toBe(true);
    expect(next.exercises[0]!.sets[1]!.rangeMode).toBe(false);
    expect(next.exercises[0]!.sets[1]!).toBe(second);
  });

  it('toggleExerciseRepRange (header tap) flips every set to the opposite of the first set\'s mode', () => {
    let draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    draft = { ...draft, exercises: [{ ...draft.exercises[0]!, sets: [emptyDraftSet(), emptyDraftSet()] }] };
    const toggledOn = toggleExerciseRepRange(draft, exerciseId);
    expect(toggledOn.exercises[0]!.sets.every((s) => s.rangeMode)).toBe(true);

    const toggledOff = toggleExerciseRepRange(toggledOn, exerciseId);
    expect(toggledOff.exercises[0]!.sets.every((s) => !s.rangeMode)).toBe(true);
    expect(toggledOff.exercises[0]!.sets.every((s) => s.repRangeStart === null && s.repRangeEnd === null)).toBe(
      true,
    );
  });

  it('toggleExerciseRepRange is a no-op for an exercise with zero sets', () => {
    const draft: RoutineDraft = {
      title: '',
      notes: null,
      folderId: null,
      exercises: [{ id: 'e1', exerciseId: 'bench', supersetId: null, notes: null, restSeconds: null, sets: [] }],
    };
    expect(toggleExerciseRepRange(draft, 'e1')).toBe(draft);
  });
});

describe('draftFromRoutineFull', () => {
  it('hydrates rangeMode from whether repRangeStart/End are non-null', () => {
    const full: RoutineFull = {
      id: 'r1',
      title: 'Push Day',
      notes: 'note',
      folderId: null,
      position: 0,
      createdAt: 0,
      updatedAt: 0,
      exercises: [
        {
          id: 'e1',
          routineId: 'r1',
          exerciseId: 'bench',
          position: 0,
          supersetId: null,
          notes: null,
          restSeconds: 90,
          sets: [
            {
              id: 's1',
              position: 0,
              setType: 'normal',
              weightKg: 60,
              reps: 8,
              repRangeStart: null,
              repRangeEnd: null,
              distanceMeters: null,
              durationSeconds: null,
              customMetric: null,
            },
            {
              id: 's2',
              position: 1,
              setType: 'normal',
              weightKg: null,
              reps: null,
              repRangeStart: 6,
              repRangeEnd: 8,
              distanceMeters: null,
              durationSeconds: null,
              customMetric: null,
            },
          ],
        },
      ],
    };

    const draft = draftFromRoutineFull(full);
    expect(draft.title).toBe('Push Day');
    expect(draft.exercises[0]!.sets[0]!.rangeMode).toBe(false);
    expect(draft.exercises[0]!.sets[1]!.rangeMode).toBe(true);
    expect(draft.exercises[0]!.sets[1]!.reps).toBeNull();
  });
});

describe('draft -> repository input conversion', () => {
  it('draftToNewRoutineInput trims the title and preserves the XOR shape per set', () => {
    let draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    draft = { ...draft, title: '  Push Day  ' };
    draft = setDraftSetReps(draft, exerciseId, setId, 8);
    draft = updateDraftSetTarget(draft, exerciseId, setId, { weightKg: 60 });

    const input = draftToNewRoutineInput(draft);
    expect(input.title).toBe('Push Day');
    expect(input.exercises).toHaveLength(1);
    expect(input.exercises![0]!.sets[0]).toMatchObject({
      reps: 8,
      repRangeStart: null,
      repRangeEnd: null,
      weightKg: 60,
    });
  });

  it('a set toggled to range mode converts with reps null and both range bounds set', () => {
    let draft = draftWithOneExercise();
    const exerciseId = draft.exercises[0]!.id;
    const setId = draft.exercises[0]!.sets[0]!.id;
    draft = toggleSetRepRange(draft, exerciseId, setId);
    draft = setDraftSetRepRange(draft, exerciseId, setId, 'start', 6);
    draft = setDraftSetRepRange(draft, exerciseId, setId, 'end', 8);

    const input = draftToNewRoutineInput(draft);
    expect(input.exercises![0]!.sets[0]).toMatchObject({ reps: null, repRangeStart: 6, repRangeEnd: 8 });
  });

  it('draftToUpdateRoutineInput always includes exercises (replace-all), even when empty', () => {
    const draft = createEmptyDraft();
    const input = draftToUpdateRoutineInput({ ...draft, title: 'Empty' });
    expect(input.exercises).toEqual([]);
    expect(input.title).toBe('Empty');
  });
});
