/**
 * `ExerciseDetailSheet` (M2-09) — 02 §3's card-name tap target: "exercise
 * name in accent color (tap → exercise detail sheet, read-only)." Wraps the
 * real `ExerciseDetailScreen` (M1-08) in a `Sheet` with `showBackButton=false`
 * — exactly the seam that screen's own file header calls out as
 * forward-compat for "a later mid-workout sheet wrapper (M2)" — rather than
 * building a second, parallel detail view. Read-only with respect to the
 * *active workout*: nothing here touches `activeWorkoutStore` or the
 * workout-exercise row: it's the exact same exercise-library detail screen
 * used from Browse, just presented as a sheet. Its own Edit/Delete/Duplicate
 * ⋯ menu (customs only) still works — those mutate the exercise-library
 * row, not the workout, so they don't "disturb the active workout" per this
 * task's own scoping note.
 *
 * Also reused by `ExercisePickerSheet`'s ⓘ info-icon affordance (03 §2:
 * "info button (ⓘ) on the row opens detail without selecting") — one
 * component, two call sites, per this codebase's "assembled from the shared
 * inventory" convention.
 */
import React from 'react';

import type { ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutRepository } from '@/data/workouts/types';
import { Sheet } from '@/ui/Sheet';

import { ExerciseDetailScreen } from '@/features/exercises/ExerciseDetailScreen';

export interface ExerciseDetailSheetProps {
  visible: boolean;
  onDismiss: () => void;
  repository: ExerciseRepository;
  /**
   * M4-09 addition — threaded straight through to
   * `ExerciseDetailScreen.workoutRepository` (see that prop's own doc
   * comment for the optional-and-why). Read-only (`exerciseHistory` is a
   * plain `SELECT`) — supplying it here can never mutate the active
   * workout this sheet is opened on top of.
   */
  workoutRepository?: Pick<WorkoutRepository, 'exerciseHistory'>;
  /** `null` while no exercise is targeted — the sheet stays closed either way (`visible && exerciseId != null`). */
  exerciseId: string | null;
  testID?: string;
}

export function ExerciseDetailSheet({
  visible,
  onDismiss,
  repository,
  workoutRepository,
  exerciseId,
  testID = 'exercise-detail-sheet',
}: ExerciseDetailSheetProps): React.JSX.Element {
  return (
    <Sheet
      visible={visible && exerciseId != null}
      onDismiss={onDismiss}
      detent="full"
      testID={testID}
    >
      {exerciseId != null ? (
        <ExerciseDetailScreen
          testID={`${testID}-content`}
          repository={repository}
          workoutRepository={workoutRepository}
          exerciseId={exerciseId}
          showBackButton={false}
        />
      ) : null}
    </Sheet>
  );
}
