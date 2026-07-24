/**
 * `ExerciseCard` (M2-09) — 02 §3's full exercise-card chrome wrapping
 * `ExerciseSetTableSection` (M2-06, the set table itself, reused unchanged):
 * 40 pt thumb, accent name (tap → read-only detail sheet), note row (URLs
 * tappable), rest-timer row, `+ Add Set`, and the ⋯ menu's card-local items
 * (Add a Note, Rest Timer — both fully self-contained here) plus bubbled
 * callbacks for the cross-card operations a single card can't resolve on
 * its own (Reorder/Replace/Add to Superset/Remove — all need the *whole*
 * workout's exercise list, which only `ActiveWorkoutScreen` has).
 *
 * "Remove from Superset" is the one ⋯ item resolved **locally** despite
 * being a superset operation — it calls `activeWorkoutStore
 * .removeFromSuperset(workoutExerciseId)` directly (no bubbling needed):
 * that store action (M2-12, 02 §8) already has the whole workout via `get()`
 * to decide "group of 1 auto-dissolves" for the group's remaining member,
 * so this card only needs to name which row is leaving.
 *
 * Add Warm-Up Sets (M2-16, 02 §12) is the other card-local ⋯ item: it opens
 * `AddWarmUpSetsSheet`, which owns its own working-weight pre-fill/
 * calculation/insert — this component only wires the sheet's `visible`
 * state and hands it this card's own `workoutExerciseId`/`exercise
 * .equipment`/unit + previous-values context.
 *
 * ## Superset visual (M2-12, 02 §8 / 07 §2.5)
 *
 * `supersetVisual` (`{label, color} | null`) replaces M2-09's own stub prop
 * (a bare `isGrouped: boolean` that only ever rendered a generic "Superset"
 * label in the accent color) — `ActiveWorkoutScreen` now computes every
 * grouped exercise's actual label/color once per render via
 * `domain/supersets.ts`'s `supersetVisualsByExerciseId` (first-appearance
 * order among the *whole workout's* grouped exercises, 6-color palette
 * cycling) and hands this card only its own entry. `isGrouped` (still the
 * name `ExerciseCardMenuSheet` expects, for its Add/Remove item swap) is
 * simply `supersetVisual != null` — no separate boolean prop needed.
 */
import React, { useState } from 'react';
import { Clock, Ellipsis } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { RoutineFull } from '@/data/routines/types';
import type { DistanceUnit, PreviousValuesMode, WeightUnit } from '@/domain/enums';
import type { SupersetVisual } from '@/domain/supersets';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Thumb } from '@/ui/Avatar';
import { useTheme } from '@/ui/theme-provider';

import { AddWarmUpSetsSheet } from './AddWarmUpSetsSheet';
import { ExerciseCardMenuSheet } from './ExerciseCardMenuSheet';
import { ExerciseDetailSheet } from './ExerciseDetailSheet';
import { ExerciseSetTableSection } from './ExerciseSetTableSection';
import { NoteEditSheet } from './NoteEditSheet';
import { NoteText } from './NoteText';
import { formatRestSeconds, type RestSeconds } from './rest-timer-format';
import { RestTimerSheet } from './RestTimerSheet';
import { useActiveWorkoutStore } from './activeWorkoutStore';

export interface ExerciseCardProps {
  workoutExerciseId: string;
  /** `workoutExercise.position` — threaded through to `ExerciseSetTableSection`/`ConnectedSetRow` for M2-08's Next-traversal order key. */
  exercisePosition: number;
  exercise: Exercise;
  exerciseRepository: ExerciseRepository;
  notes: string | null;
  restSeconds: RestSeconds;
  /** `null` when ungrouped; this card's own group label/color when it is (M2-12, see file header). */
  supersetVisual: SupersetVisual | null;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  rpeEnabled: boolean;
  previousValuesMode: PreviousValuesMode;
  routineId: string | null;
  /** M3-05: threaded straight through to `ExerciseSetTableSection` — see that file's own doc comment. */
  exerciseOccurrenceIndex?: number;
  /** M3-05: threaded straight through to `ExerciseSetTableSection` — see that file's own doc comment. */
  getRoutineFull?: (routineId: string) => Promise<RoutineFull | null>;
  onReorderPress: () => void;
  onReplacePress: (workoutExerciseId: string) => void;
  onAddToSupersetPress: (workoutExerciseId: string) => void;
  onRemove: (workoutExerciseId: string, exerciseName: string) => void;
  /** M2-12: fired after a set in *this* exercise is successfully checked (never on uncheck) — `ActiveWorkoutScreen` uses this to drive Smart Superset Scrolling. Omitted entirely by nothing today; always passed by the real screen, optional only so direct-render unit tests don't have to stub it. */
  onSetChecked?: () => void;
  testID?: string;
}

export function ExerciseCard({
  workoutExerciseId,
  exercisePosition,
  exercise,
  exerciseRepository,
  notes,
  restSeconds,
  supersetVisual,
  weightUnit,
  distanceUnit,
  rpeEnabled,
  previousValuesMode,
  routineId,
  exerciseOccurrenceIndex,
  getRoutineFull,
  onReorderPress,
  onReplacePress,
  onAddToSupersetPress,
  onRemove,
  onSetChecked,
  testID = 'exercise-card',
}: ExerciseCardProps): React.JSX.Element {
  const isGrouped = supersetVisual != null;
  const { colors, typography, spacing } = useTheme();

  const [menuVisible, setMenuVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [noteSheetVisible, setNoteSheetVisible] = useState(false);
  const [restTimerSheetVisible, setRestTimerSheetVisible] = useState(false);
  const [warmUpSheetVisible, setWarmUpSheetVisible] = useState(false);

  const handleAddSet = (): void => {
    void useActiveWorkoutStore.getState().addSet(workoutExerciseId);
  };

  const handleSaveNote = (nextNote: string | null): void => {
    void useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { notes: nextNote });
  };

  const handleSaveRestSeconds = (nextRestSeconds: RestSeconds): void => {
    void useActiveWorkoutStore
      .getState()
      .updateExercise(workoutExerciseId, { restSeconds: nextRestSeconds });
  };

  const handleRemoveFromSuperset = (): void => {
    void useActiveWorkoutStore.getState().removeFromSuperset(workoutExerciseId);
  };

  const handleAddWarmUpSets = (): void => {
    setWarmUpSheetVisible(true);
  };

  return (
    <Card testID={testID}>
      {supersetVisual ? (
        <View
          testID={`${testID}-superset-indicator`}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}
        >
          {/* 07 §2.5: "3 pt card edge bar" in the group's own cycled palette color. */}
          <View
            style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: supersetVisual.color, marginRight: spacing['2'] }}
          />
          <Text style={[typography.caption, { color: supersetVisual.color, fontWeight: '600' }]}>
            Superset {supersetVisual.label}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['3'] }}>
        <Thumb name={exercise.name} size={40} style={{ marginRight: spacing['3'] }} />
        <Pressable
          testID={`${testID}-name`}
          accessibilityRole="button"
          accessibilityLabel={`${exercise.name} details`}
          onPress={() => setDetailVisible(true)}
          style={{ flex: 1 }}
        >
          <Text style={[typography.headline, { color: colors.accent.text }]} numberOfLines={1}>
            {exercise.name}
          </Text>
        </Pressable>
        <Pressable
          testID={`${testID}-menu-button`}
          accessibilityRole="button"
          accessibilityLabel="Exercise options"
          hitSlop={8}
          onPress={() => setMenuVisible(true)}
        >
          <Ellipsis size={22} strokeWidth={1.75} color={colors.text.secondary} />
        </Pressable>
      </View>

      {notes != null && notes.length > 0 ? (
        <Pressable
          testID={`${testID}-note-row`}
          accessibilityRole="button"
          accessibilityLabel="Edit note"
          onPress={() => setNoteSheetVisible(true)}
          style={{ marginBottom: spacing['3'] }}
        >
          <NoteText testID={`${testID}-note-text`} text={notes} />
        </Pressable>
      ) : null}

      <Pressable
        testID={`${testID}-rest-timer-row`}
        accessibilityRole="button"
        accessibilityLabel="Edit rest timer"
        onPress={() => setRestTimerSheetVisible(true)}
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['3'] }}
      >
        <Clock size={16} strokeWidth={1.75} color={colors.text.tertiary} />
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginLeft: spacing['1'] }]}
        >
          Rest Timer: {formatRestSeconds(restSeconds)}
        </Text>
      </Pressable>

      <ExerciseSetTableSection
        testID={`${testID}-table`}
        workoutExerciseId={workoutExerciseId}
        exercisePosition={exercisePosition}
        exercise={exercise}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
        rpeEnabled={rpeEnabled}
        previousValuesMode={previousValuesMode}
        routineId={routineId}
        exerciseOccurrenceIndex={exerciseOccurrenceIndex}
        getRoutineFull={getRoutineFull}
        onSetChecked={onSetChecked}
      />

      <Button
        testID={`${testID}-add-set`}
        label="+ Add Set"
        variant="ghost"
        size="sm"
        onPress={handleAddSet}
        style={{ marginTop: spacing['2'], alignSelf: 'flex-start' }}
      />

      <ExerciseCardMenuSheet
        testID={`${testID}-menu`}
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        isGrouped={isGrouped}
        onReorder={onReorderPress}
        onReplace={() => onReplacePress(workoutExerciseId)}
        onAddToSuperset={() => onAddToSupersetPress(workoutExerciseId)}
        onRemoveFromSuperset={handleRemoveFromSuperset}
        onAddWarmUpSets={handleAddWarmUpSets}
        onAddNote={() => setNoteSheetVisible(true)}
        onRestTimer={() => setRestTimerSheetVisible(true)}
        onRemoveExercise={() => onRemove(workoutExerciseId, exercise.name)}
      />

      <ExerciseDetailSheet
        testID={`${testID}-detail-sheet`}
        visible={detailVisible}
        onDismiss={() => setDetailVisible(false)}
        repository={exerciseRepository}
        exerciseId={exercise.id}
      />

      <NoteEditSheet
        testID={`${testID}-note-sheet`}
        visible={noteSheetVisible}
        onDismiss={() => setNoteSheetVisible(false)}
        initialValue={notes ?? ''}
        onSave={handleSaveNote}
      />

      <RestTimerSheet
        testID={`${testID}-rest-timer-sheet`}
        visible={restTimerSheetVisible}
        onDismiss={() => setRestTimerSheetVisible(false)}
        value={restSeconds}
        onChange={handleSaveRestSeconds}
      />

      <AddWarmUpSetsSheet
        testID={`${testID}-warmup-sheet`}
        visible={warmUpSheetVisible}
        onDismiss={() => setWarmUpSheetVisible(false)}
        workoutExerciseId={workoutExerciseId}
        exerciseId={exercise.id}
        equipment={exercise.equipment}
        weightUnit={weightUnit}
        previousValuesMode={previousValuesMode}
        routineId={routineId}
      />
    </Card>
  );
}
