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
 * being a superset operation — 02 §8: "group of 1 auto-dissolves" needs no
 * sibling context to *leave* a group, only `updateExercise({supersetId:
 * null})` on this card's own row (M2-12 owns the follow-up dissolution
 * bookkeeping for the group's remaining member, out of this task's scope).
 *
 * Add Warm-Up Sets is a stub per this task's own scoping note (M2-16 lands
 * the real calculator) — the menu item is present and wired to a no-op
 * placeholder alert rather than crashing or being silently omitted.
 */
import React, { useState } from 'react';
import { Clock, Ellipsis } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { DistanceUnit, PreviousValuesMode, WeightUnit } from '@/domain/enums';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Thumb } from '@/ui/Avatar';
import { useTheme } from '@/ui/theme-provider';

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
  isGrouped: boolean;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  rpeEnabled: boolean;
  previousValuesMode: PreviousValuesMode;
  routineId: string | null;
  onReorderPress: () => void;
  onReplacePress: (workoutExerciseId: string) => void;
  onAddToSupersetPress: (workoutExerciseId: string) => void;
  onRemove: (workoutExerciseId: string, exerciseName: string) => void;
  testID?: string;
}

export function ExerciseCard({
  workoutExerciseId,
  exercisePosition,
  exercise,
  exerciseRepository,
  notes,
  restSeconds,
  isGrouped,
  weightUnit,
  distanceUnit,
  rpeEnabled,
  previousValuesMode,
  routineId,
  onReorderPress,
  onReplacePress,
  onAddToSupersetPress,
  onRemove,
  testID = 'exercise-card',
}: ExerciseCardProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const [menuVisible, setMenuVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [noteSheetVisible, setNoteSheetVisible] = useState(false);
  const [restTimerSheetVisible, setRestTimerSheetVisible] = useState(false);

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
    void useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { supersetId: null });
  };

  const handleAddWarmUpSets = (): void => {
    // Stub — the real formula engine + insert flow is M2-16 (02 §12); this
    // task only has to leave a clean, non-crashing call site (task brief:
    // "coordinate by making the menu item a no-op TODO if the store action
    // doesn't exist yet").
    Alert.alert('Add Warm-Up Sets', 'The warm-up calculator arrives in M2-16.');
  };

  return (
    <Card testID={testID}>
      {isGrouped ? (
        <View
          testID={`${testID}-superset-indicator`}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}
        >
          <View
            style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: colors.accent.primary, marginRight: spacing['2'] }}
          />
          <Text style={[typography.caption, { color: colors.accent.text, fontWeight: '600' }]}>
            Superset
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
    </Card>
  );
}
