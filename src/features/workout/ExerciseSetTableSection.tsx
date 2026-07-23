/**
 * `ExerciseSetTableSection` (M2-06) — the per-exercise wiring: computes the
 * column layout (`domain/set-table-columns.ts`), fetches PREVIOUS reference
 * data (`activeWorkoutStore.previousSets`), maps everything into
 * `ui/SetTable` + one `ConnectedSetRow` per set, and warns (02 §16.7,
 * console-level — "just a console/log warn... don't overbuild") past 50
 * sets. This is the piece M2-09's future exercise card wraps with
 * thumbnail/notes/rest-timer/⋯-menu chrome; today `ActiveWorkoutScreen`
 * renders it directly under a minimal exercise-name heading.
 *
 * ## Memoization (06 §8 — read before touching `useMemo` deps)
 *
 * `columns`/`workingIndices`/`previousResults` are recomputed only when the
 * exercise's own **structural signature** changes (`sets.map(s =>
 * \`${s.id}:${s.setType}\`).join('|')`) — *not* on every value/reps/weight
 * edit, which would otherwise hand every `ConnectedSetRow` a brand-new
 * `previousResult`/`workingIndex` object on every keystroke in *any* row of
 * this exercise, defeating the per-row memoization `ConnectedSetRow`/
 * `SetRow` rely on. Typing in one row changes that row's own `WorkoutSet`
 * object (which `ConnectedSetRow` subscribes to directly), never the
 * signature string, so this component's own re-render (unavoidable — it
 * subscribes to the whole `WorkoutExerciseFull` to get the sets list) still
 * hands out the *same* `columns`/`workingIndices`/`previousResults`
 * references to every sibling row, and `React.memo` skips them.
 */
import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Exercise } from '@/data/exercises/types';
import { computeCurrentRowBuckets, computePreviousValues, type CurrentRowLike } from '@/domain/previous-values';
import { columnsForExerciseType } from '@/domain/set-table-columns';
import type { DistanceUnit, PreviousValuesMode, WeightUnit } from '@/domain/enums';
import { SetTable } from '@/ui/SetTable';
import type { SetBadgeKind } from '@/ui/SetRow';

import { ConnectedSetRow } from './ConnectedSetRow';
import { selectWorkoutExercise, useActiveWorkoutStore } from './activeWorkoutStore';

/** 02 §16.7: "warn > 50 sets/exercise." */
const MANY_SETS_WARNING_THRESHOLD = 50;

export interface ExerciseSetTableSectionProps {
  workoutExerciseId: string;
  exercise: Exercise;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  rpeEnabled: boolean;
  previousValuesMode: PreviousValuesMode;
  /** The active workout's own `routine_id` (null for empty-start workouts — same_routine then degrades to any_workout automatically, 02 §6, by simply not restricting the query). */
  routineId: string | null;
  testID?: string;
}

function badgeKindFor(setType: CurrentRowLike['setType']): SetBadgeKind {
  return setType;
}

export function ExerciseSetTableSection({
  workoutExerciseId,
  exercise,
  weightUnit,
  distanceUnit,
  rpeEnabled,
  previousValuesMode,
  routineId,
  testID,
}: ExerciseSetTableSectionProps): React.JSX.Element | null {
  const workoutExercise = useActiveWorkoutStore(selectWorkoutExercise(workoutExerciseId));

  const units = useMemo(() => ({ weightUnit, distanceUnit }), [weightUnit, distanceUnit]);

  const columns = useMemo(
    () =>
      columnsForExerciseType(exercise.exerciseType, {
        usesCustomMetric: exercise.usesCustomMetric,
        rpeEnabled,
        weightUnit,
        distanceUnit,
      }),
    [exercise.exerciseType, exercise.usesCustomMetric, rpeEnabled, weightUnit, distanceUnit],
  );

  const rowSignature = useMemo(
    () => (workoutExercise ? workoutExercise.sets.map((s) => `${s.id}:${s.setType}`).join('|') : ''),
    [workoutExercise],
  );

  const previousSetsQuery = useQuery({
    queryKey: [
      'workout',
      'previousSets',
      exercise.id,
      previousValuesMode,
      previousValuesMode === 'same_routine' ? routineId : null,
    ],
    queryFn: () =>
      useActiveWorkoutStore
        .getState()
        .previousSets(
          exercise.id,
          previousValuesMode === 'same_routine' && routineId ? { routineId } : undefined,
        ),
  });

  const currentRows: CurrentRowLike[] = useMemo(
    () =>
      workoutExercise
        ? workoutExercise.sets.map((s) => ({ id: s.id, setType: s.setType, routineTarget: null }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the structural signature, not the sets array reference (see file header).
    [rowSignature],
  );

  const buckets = useMemo(
    () => computeCurrentRowBuckets(currentRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSignature],
  );

  const previousResults = useMemo(
    () =>
      computePreviousValues(exercise.exerciseType, currentRows, previousSetsQuery.data ?? [], units),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowSignature (not currentRows' own reference) plus the query data/units are the real deps.
    [rowSignature, previousSetsQuery.data, units, exercise.exerciseType],
  );

  useEffect(() => {
    if (workoutExercise && workoutExercise.sets.length > MANY_SETS_WARNING_THRESHOLD) {
      // 02 §16.7: "just a console/log warn... don't overbuild."
      console.warn(
        `Exercise "${exercise.name}" has ${workoutExercise.sets.length} sets (> ${MANY_SETS_WARNING_THRESHOLD}) — consider splitting it up.`,
      );
    }
  }, [exercise.name, workoutExercise]);

  if (!workoutExercise) {
    return null;
  }

  return (
    <SetTable testID={testID} columns={columns}>
      {workoutExercise.sets.map((set, index) => {
        const bucket = buckets[index]!;
        return (
          <ConnectedSetRow
            key={set.id}
            testID={testID ? `${testID}-row-${index}` : undefined}
            setId={set.id}
            columns={columns}
            badgeKind={badgeKindFor(set.setType)}
            workingIndex={bucket.isWarmup ? null : bucket.bucketIndex + 1}
            previousResult={previousResults[index]!}
            units={units}
          />
        );
      })}
    </SetTable>
  );
}
