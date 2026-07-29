/**
 * `history-list-model.ts` (M4-03, 04 §3.1 / `06` §8) — the History tab's
 * page-building logic: turns one page of `WorkoutSummary` rows plus their
 * batched-hydrated exercises (`WorkoutRepository.getExercisesForWorkouts`,
 * this task's own new repository method) into the `HistoryCardData[]`
 * `HistoryWorkoutCard` renders — volume (`domain/volume.ts`), duration
 * (`domain/units.ts`), the per-exercise "N × Name (Equipment) — best …"
 * line (`domain/history-summary.ts`), and the "🏆 N PRs" count (every
 * (set, record-type) award `RecordsService` reports for that workout,
 * summed across the workout's own distinct exercises — 04 §5.4's own
 * definition, not a re-derived live-check).
 *
 * Kept side-effect-free (no `@tanstack/react-query`/`getRecordsService()`
 * singleton reach-in here — the screen resolves each distinct exercise's
 * `RecordsComputation` and its exercise metadata first, then calls this
 * module with plain data) so the page-assembly rule itself is unit-testable
 * without mounting a query client or configuring the records singleton —
 * same "pure model, impure screen wires it" split
 * `exercise-list-model.ts`/`ExerciseBrowseScreen.tsx` already established.
 */
import type { Exercise } from '@/data/exercises/types';
import type { WorkoutExerciseFull, WorkoutSummary } from '@/data/workouts/types';
import { EQUIPMENT_LABELS, type DistanceUnit, type WeightUnit } from '@/domain/enums';
import { bestSetForExercise, formatBestSetSummary } from '@/domain/history-summary';
import type { RecordAward } from '@/domain/records';
import { formatDuration } from '@/domain/units';
import { formatVolumeDisplay, totalVolumeKg, type VolumeSetInput } from '@/domain/volume';

import type { HistoryCardData } from './HistoryWorkoutCard';
import { formatRelativeWorkoutDate } from './date-format';

export interface HistoryCardUnits {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

/** One exercise's own awards list, scoped down from a full `RecordsComputation` — all this module needs from `RecordsService.getSnapshot()`'s result. */
export type ExerciseAwards = readonly RecordAward[];

function exerciseSummaryLine(
  exercise: Exercise,
  workoutExercise: WorkoutExerciseFull,
  units: HistoryCardUnits,
): string {
  const count = workoutExercise.sets.length;
  const equipmentSuffix =
    exercise.equipment === 'none' ? '' : ` (${EQUIPMENT_LABELS[exercise.equipment]})`;
  const best = bestSetForExercise(exercise.exerciseType, workoutExercise.sets);
  const bestText = best ? formatBestSetSummary(exercise.exerciseType, best, units) : null;
  const bestSuffix = bestText ? ` — best ${bestText}` : '';
  return `${count} × ${exercise.name}${equipmentSuffix}${bestSuffix}`;
}

/**
 * Builds one card's data. `exerciseMap` covers every exercise this workout
 * references (built-in or custom, archived or not — 03 §5: archived
 * exercises still render in history); a `workoutExercise` whose
 * `exerciseId` isn't in the map (a genuinely orphaned reference, which
 * shouldn't happen — custom-exercise delete is reference-blocked, 03 §5) is
 * skipped for both volume and its own summary line rather than throwing,
 * the same defensive posture the old M2-14 screen already established.
 * `awardsByExerciseId` holds each distinct exercise's full awards list
 * (from `RecordsService.getSnapshot(exerciseId).awards`, already resolved
 * by the caller) — this function only filters by `summary.id` and counts.
 */
export function buildHistoryCard(
  summary: WorkoutSummary,
  workoutExercises: readonly WorkoutExerciseFull[],
  exerciseMap: ReadonlyMap<string, Exercise>,
  awardsByExerciseId: ReadonlyMap<string, ExerciseAwards>,
  units: HistoryCardUnits,
  warmupInStats: boolean,
): HistoryCardData {
  const volumeInputs: VolumeSetInput[] = workoutExercises.flatMap((workoutExercise) => {
    const exercise = exerciseMap.get(workoutExercise.exerciseId);
    if (!exercise) return [];
    return workoutExercise.sets.map((set) => ({
      exerciseType: exercise.exerciseType,
      setType: set.setType,
      weightKg: set.weightKg,
      reps: set.reps,
      isCompleted: set.isCompleted,
    }));
  });
  const volumeKg = totalVolumeKg(volumeInputs, warmupInStats);

  const distinctExerciseIds = Array.from(new Set(workoutExercises.map((we) => we.exerciseId)));
  const prCount = distinctExerciseIds.reduce((sum, exerciseId) => {
    const awards = awardsByExerciseId.get(exerciseId);
    if (!awards) return sum;
    return sum + awards.filter((award) => award.workoutId === summary.id).length;
  }, 0);

  const exerciseLines = workoutExercises
    .map((workoutExercise) => {
      const exercise = exerciseMap.get(workoutExercise.exerciseId);
      return exercise ? exerciseSummaryLine(exercise, workoutExercise, units) : null;
    })
    .filter((line): line is string => line != null);

  const durationSeconds =
    summary.endTime !== null
      ? Math.max(
          0,
          Math.floor((summary.endTime - summary.startTime - summary.durationPauseOffsetMs) / 1000),
        )
      : 0;

  return {
    workoutId: summary.id,
    title: summary.title,
    relativeDate: formatRelativeWorkoutDate(summary.startTime),
    durationLabel: formatDuration(durationSeconds) ?? '0:00',
    volumeLabel: `${Math.round(formatVolumeDisplay(volumeKg, units.weightUnit))} ${units.weightUnit}`,
    prCount,
    exerciseLines,
  };
}
