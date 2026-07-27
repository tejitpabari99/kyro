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
 *
 * ## M3-05 routine-target wiring
 *
 * See this file's `routineSetToTarget`/`formatRepRangeLabel` helpers and the
 * `routineTargetsByBucketKey` memo below for the full matching scheme
 * (exercise-occurrence order, then the same warm-up/working bucket keying
 * `computeCurrentRowBuckets`/`previous-values.ts` already use for history
 * matches) — `docs/plan/EXECUTION-LOG.md`'s M3-05 entry has the full design
 * writeup (fetch-once-per-screen via TanStack Query cache sharing, narrow
 * `getRoutineFull` function prop rather than the whole `RoutineRepository`).
 *
 * **Occurrence index (review fix, `workoutExercise.routineOccurrenceIndex`):**
 * read directly off the `workoutExercise` this component already selects
 * from the store — **not** a prop computed by `ActiveWorkoutScreen` from
 * live position order, which the original M3-05 landing used and which
 * broke for a duplicated exercise once `reorderExercises` flipped the two
 * instances' relative order (each one then matched the *other's* routine
 * target — no crash, no error, just silently wrong data). `WorkoutRepositoryImpl
 * .startFromRoutine` now pins this value onto the row once, at creation
 * time, from the source routine's own (reorder-immune) exercise order —
 * see that method's file header for the full writeup. `null` means "this
 * row never came from a routine occurrence" (added via `+ Add Exercise`,
 * or `replaceExercise`d since) and must never resolve a routine target,
 * regardless of whether `exercise.id` happens to also appear in the routine.
 */
import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Exercise } from '@/data/exercises/types';
import type { RoutineFull, RoutineSet } from '@/data/routines/types';
import {
  computeCurrentRowBuckets,
  computePreviousValues,
  type CurrentRowLike,
  type RoutineTargetLike,
} from '@/domain/previous-values';
import { columnsForExerciseType } from '@/domain/set-table-columns';
import type { DistanceUnit, PreviousValuesMode, WeightUnit } from '@/domain/enums';
import { SetTable } from '@/ui/SetTable';
import type { SetBadgeKind } from '@/ui/SetRow';

import { ConnectedSetRow } from './ConnectedSetRow';
import { selectWorkoutExercise } from './activeWorkoutStore';
import { useWorkoutStore } from './workoutStoreContext';

/** 02 §16.7: "warn > 50 sets/exercise." */
const MANY_SETS_WARNING_THRESHOLD = 50;

export interface ExerciseSetTableSectionProps {
  workoutExerciseId: string;
  /** `workoutExercise.position` — threaded through to `ConnectedSetRow` for M2-08's Next-traversal order key (see `keyboardFocusStore.ts`'s header). */
  exercisePosition: number;
  exercise: Exercise;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  rpeEnabled: boolean;
  previousValuesMode: PreviousValuesMode;
  /** The active workout's own `routine_id` (null for empty-start workouts — same_routine then degrades to any_workout automatically, 02 §6, by simply not restricting the query). */
  routineId: string | null;
  /**
   * M3-05: `RoutineRepository.getFull`, unbound — a narrow function prop
   * (not the whole `RoutineRepository`) mirroring the convention
   * `RoutineExerciseCard.tsx`'s own `previousSets` prop already established.
   * Optional: omitted (or `routineId` null) means "never resolve routine
   * targets," so every row simply keeps `routineTarget: null` — identical
   * to pre-M3-05 behavior, and how every non-routine (empty-start) workout
   * still renders today.
   */
  getRoutineFull?: (routineId: string) => Promise<RoutineFull | null>;
  /**
   * M4-05 (02 §15, `PreviousSetsQuery.beforeWorkoutId`'s own doc comment in
   * `@/data/workouts/types`): the workout currently being **edited** — when
   * set, restricts the PREVIOUS lookup to completed workouts strictly
   * at-or-before this one's own `start_time` and excludes this workout's own
   * id, so editing a past workout never shows PREVIOUS values sourced from
   * itself or from anything chronologically after it. `undefined` (the live
   * logger's own default) means no restriction — the pre-M4-05 behavior,
   * unchanged.
   */
  previousSetsExcludeWorkoutId?: string;
  /** M2-12: threaded straight through to every `ConnectedSetRow` — fired after that row's own set is successfully checked (never uncheck), for `ActiveWorkoutScreen`'s Smart Superset Scrolling hook. */
  onSetChecked?: () => void;
  testID?: string;
}

function badgeKindFor(setType: CurrentRowLike['setType']): SetBadgeKind {
  return setType;
}

/** "6-8" combined rep-range label (04 §2.3) — `null` unless both bounds are set (mirrors the reps-XOR-range exclusivity `routine_sets` itself enforces, 05 §3.3). No existing helper formats this combined form — `RoutineSetRow.tsx` only renders the two bound cells separately. */
function formatRepRangeLabel(start: number | null, end: number | null): string | null {
  return start !== null && end !== null ? `${start}-${end}` : null;
}

function routineSetToTarget(routineSet: RoutineSet): RoutineTargetLike {
  return {
    weightKg: routineSet.weightKg,
    reps: routineSet.reps,
    repRangeLabel: formatRepRangeLabel(routineSet.repRangeStart, routineSet.repRangeEnd),
    distanceMeters: routineSet.distanceMeters,
    durationSeconds: routineSet.durationSeconds,
    customMetric: routineSet.customMetric,
  };
}

export function ExerciseSetTableSection({
  workoutExerciseId,
  exercisePosition,
  exercise,
  weightUnit,
  distanceUnit,
  rpeEnabled,
  previousValuesMode,
  routineId,
  getRoutineFull,
  previousSetsExcludeWorkoutId,
  onSetChecked,
  testID,
}: ExerciseSetTableSectionProps): React.JSX.Element | null {
  // `useStore` (not `workoutStore`) — see `ConnectedSetRow.tsx`'s matching
  // comment: React Compiler / eslint's rules-of-hooks recognize hook calls
  // by the `use`-prefix naming convention, not by tracing that this value
  // came from `useWorkoutStore()`'s `useContext`. A non-`use`-prefixed name
  // here made the compiler treat `workoutStore(selector)` as an ordinary
  // memoizable call, silently varying this component's real hook count
  // across renders and producing an invalid-hook-call crash downstream.
  const useStore = useWorkoutStore();
  const workoutExercise = useStore(selectWorkoutExercise(workoutExerciseId));

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
      previousSetsExcludeWorkoutId ?? null,
    ],
    queryFn: () =>
      useStore.getState().previousSets(exercise.id, {
        ...(previousValuesMode === 'same_routine' && routineId ? { routineId } : undefined),
        ...(previousSetsExcludeWorkoutId ? { beforeWorkoutId: previousSetsExcludeWorkoutId } : undefined),
      }),
  });

  // M3-05: fetched once per screen for free via TanStack Query's own
  // cache-sharing (see file header) — every exercise card started from the
  // same routine reuses this one cache entry under the same key.
  const routineQuery = useQuery({
    queryKey: ['routine', 'full', routineId],
    queryFn: () => getRoutineFull!(routineId!),
    enabled: routineId != null && getRoutineFull != null,
  });

  // Buckets keyed off the sets' own `setType` sequence only (never
  // `routineTarget`, which is what this bucket map is used to resolve) —
  // computed ahead of `currentRows` so both `currentRows` (routineTarget
  // lookup) and the render body (`workingIndex`) can share it.
  const buckets = useMemo(
    () =>
      workoutExercise
        ? computeCurrentRowBuckets(workoutExercise.sets.map((s) => ({ id: s.id, setType: s.setType })))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the structural signature, not workoutExercise's own reference (see file header).
    [rowSignature],
  );

  // Review fix: the fixed occurrence index pinned onto this workout exercise
  // at `startFromRoutine` creation time (see file header) — `null` whenever
  // this row didn't come from a routine occurrence at all (added mid-workout,
  // or `replaceExercise`d since), in which case it must never resolve a
  // routine target below, regardless of whether `exercise.id` also happens
  // to appear in the routine.
  const routineOccurrenceIndex = workoutExercise?.routineOccurrenceIndex ?? null;

  // M3-05: the matched routine_exercise's own sets, bucketed the identical
  // way (see file header, "Bucket matching") — `null` whenever there is no
  // routine, no matching occurrence, or the routine query hasn't resolved
  // yet, in which case every row below simply falls back to
  // `routineTarget: null` (identical to pre-M3-05 behavior).
  const routineTargetsByBucketKey = useMemo(() => {
    const routine = routineQuery.data;
    if (!routine || routineOccurrenceIndex == null) {
      return null;
    }
    const matchingRoutineExercises = routine.exercises.filter((re) => re.exerciseId === exercise.id);
    const routineExercise = matchingRoutineExercises[routineOccurrenceIndex];
    if (!routineExercise) {
      return null;
    }
    const routineBuckets = computeCurrentRowBuckets(
      routineExercise.sets.map((s) => ({ id: s.id, setType: s.setType })),
    );
    const map = new Map<string, RoutineSet>();
    routineExercise.sets.forEach((routineSet, index) => {
      const bucket = routineBuckets[index]!;
      map.set(`${bucket.isWarmup}:${bucket.bucketIndex}`, routineSet);
    });
    return map;
  }, [routineQuery.data, exercise.id, routineOccurrenceIndex]);

  const currentRows: CurrentRowLike[] = useMemo(
    () =>
      workoutExercise
        ? workoutExercise.sets.map((s, index) => {
            const bucket = buckets[index]!;
            const routineSet = routineTargetsByBucketKey?.get(`${bucket.isWarmup}:${bucket.bucketIndex}`);
            return {
              id: s.id,
              setType: s.setType,
              routineTarget: routineSet ? routineSetToTarget(routineSet) : null,
            };
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the structural signature (not workoutExercise's own reference, which also changes on every plain value edit — see file header) plus the two derived maps that themselves only change when the structure/routine data actually does.
    [rowSignature, buckets, routineTargetsByBucketKey],
  );

  const previousResults = useMemo(
    () =>
      computePreviousValues(exercise.exerciseType, currentRows, previousSetsQuery.data ?? [], units),
    [currentRows, previousSetsQuery.data, units, exercise.exerciseType],
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
            exerciseType={exercise.exerciseType}
            exerciseId={exercise.id}
            exercisePosition={exercisePosition}
            exerciseName={exercise.name}
            restSeconds={workoutExercise.restSeconds}
            nextSetType={workoutExercise.sets[index + 1]?.setType ?? null}
            setNumber={index + 1}
            onChecked={onSetChecked}
          />
        );
      })}
    </SetTable>
  );
}
