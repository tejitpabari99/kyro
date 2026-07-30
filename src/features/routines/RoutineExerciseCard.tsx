/**
 * `RoutineExerciseCard` (M3-04, 04 §2.1) — the routine editor's per-exercise
 * card: name header, note, rest-timer row, superset indicator, set table (in
 * target mode), `+ Add Set`, ⋯ menu. The routine-editor analogue of
 * `src/features/workout/ExerciseCard.tsx` — same visual/structural shape,
 * target mode instead of logging mode, `RoutineSetRow` instead of
 * `ConnectedSetRow`, `RoutineExerciseMenuSheet` instead of
 * `ExerciseCardMenuSheet` (that file's own header explains the one item it
 * omits and why).
 *
 * ## Where mutations are resolved (mirrors `ExerciseCard.tsx`'s own split)
 *
 * Every mutation that only needs *this* exercise's own draft slice (add/
 * remove/retype a set, toggle a rep range, edit the note/rest timer, leave
 * a superset) is resolved **locally** — this component calls the pure
 * `routine-draft.ts` mutators itself via the `mutate` prop
 * (`RoutineEditorScreen.tsx`'s own `setDraft` wrapped to also flip
 * `dirty`), the same way `ExerciseCard.handleRemoveFromSuperset` resolves
 * "Remove from Superset" locally against the store. Operations that need
 * the *whole* draft's exercise list (Reorder, Replace, Add to Superset,
 * Remove Exercise) bubble up to `RoutineEditorScreen` via plain callback
 * props — it owns the sheets those need (`ReorderExercisesSheet`,
 * `ExercisePickerSheet` in replace mode, `AddToSupersetSheet`).
 *
 * ## PREVIOUS (04 §2.1: "shows the exercise's last logged values as
 * reference, read-only, no tap action")
 *
 * Reuses the exact same domain engine the active logger does
 * (`computeCurrentRowBuckets`/`computePreviousValues`,
 * `domain/previous-values.ts`) fed by a `previousSets` query — a plain
 * function prop (`WorkoutRepository.previousSets`, passed through from the
 * route file) rather than `activeWorkoutStore.previousSets`, since this
 * screen has no active workout and that store requires `rehydrate()` to
 * have run (`activeWorkoutStore.ts`'s own `requireRepository` guard). The
 * routine being edited supplies its own id as the `same_routine` scope
 * (`routineId`, `null` for a brand-new routine — degrading to
 * `any_workout` automatically, the exact `ExerciseSetTableSection.tsx`
 * convention this mirrors verbatim).
 *
 * ## RPE is never shown here
 *
 * `RoutineSet` (`src/data/routines/types.ts`) has no `rpe` field — targets
 * don't carry an RPE. `columns` below always calls
 * `columnsForExerciseType(..., { rpeEnabled: false, ... })` regardless of
 * the user's live RPE-tracking setting, so the RPE column simply never
 * appears in a routine's set table, independent of that setting.
 */
import React, { useMemo, useState } from 'react';
import { Clock, Ellipsis } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import type { Exercise } from '@/data/exercises/types';
import type { PreviousSet, PreviousSetsQuery } from '@/data/workouts/types';
import { computeCurrentRowBuckets, computePreviousValues, type CurrentRowLike } from '@/domain/previous-values';
import { columnsForExerciseType } from '@/domain/set-table-columns';
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import type { SupersetVisual } from '@/domain/supersets';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Thumb } from '@/ui/Avatar';
import { SetTable } from '@/ui/SetTable';
import type { SetBadgeKind } from '@/ui/SetRow';
import { useTheme } from '@/ui/theme-provider';

import { InlineNoteField } from '../workout/InlineNoteField';
import { formatRestSeconds } from '../workout/rest-timer-format';
import { RestTimerSheet } from '../workout/RestTimerSheet';
import { RoutineExerciseMenuSheet } from './RoutineExerciseMenuSheet';
import { RoutineSetRow } from './RoutineSetRow';
import {
  addDraftSet,
  removeDraftExerciseFromSuperset,
  removeDraftSet,
  setDraftSetRepRange,
  setDraftSetReps,
  setDraftSetType,
  toggleExerciseRepRange,
  toggleSetRepRange,
  updateDraftExerciseNotes,
  updateDraftExerciseRestSeconds,
  updateDraftSetTarget,
  type DraftExercise,
  type DraftSet,
  type RoutineDraft,
} from './routine-draft';

export interface RoutineExerciseCardProps {
  draftExercise: DraftExercise;
  exercise: Exercise;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  supersetVisual: SupersetVisual | null;
  previousSets: (exerciseId: string, opts?: PreviousSetsQuery) => Promise<PreviousSet[]>;
  /** The routine currently being edited (`null` for create-mode/a not-yet-saved routine) — `same_routine`'s scope key, same convention `ExerciseSetTableSection`'s own `routineId` prop documents. */
  routineId: string | null;
  mutate: (fn: (draft: RoutineDraft) => RoutineDraft) => void;
  onReorderPress: () => void;
  onReplacePress: (draftExerciseId: string) => void;
  onAddToSupersetPress: (draftExerciseId: string) => void;
  onRemove: (draftExerciseId: string, exerciseName: string) => void;
  testID?: string;
}

function badgeKindFor(setType: DraftSet['setType']): SetBadgeKind {
  return setType;
}

export function RoutineExerciseCard({
  draftExercise,
  exercise,
  weightUnit,
  distanceUnit,
  supersetVisual,
  previousSets,
  routineId,
  mutate,
  onReorderPress,
  onReplacePress,
  onAddToSupersetPress,
  onRemove,
  testID = 'routine-exercise-card',
}: RoutineExerciseCardProps): React.JSX.Element {
  const isGrouped = supersetVisual != null;
  const { colors, typography, spacing } = useTheme();

  const [menuVisible, setMenuVisible] = useState(false);
  const [restTimerSheetVisible, setRestTimerSheetVisible] = useState(false);

  const units = useMemo(() => ({ weightUnit, distanceUnit }), [weightUnit, distanceUnit]);

  // RPE is force-disabled — see file header's "RPE is never shown here".
  const columns = useMemo(
    () =>
      columnsForExerciseType(exercise.exerciseType, {
        usesCustomMetric: exercise.usesCustomMetric,
        rpeEnabled: false,
        weightUnit,
        distanceUnit,
      }),
    [exercise.exerciseType, exercise.usesCustomMetric, weightUnit, distanceUnit],
  );

  const rowSignature = useMemo(
    () => draftExercise.sets.map((s) => `${s.id}:${s.setType}`).join('|'),
    [draftExercise.sets],
  );

  const currentRows: CurrentRowLike[] = useMemo(
    () => draftExercise.sets.map((s) => ({ id: s.id, setType: s.setType, routineTarget: null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the structural signature, not the sets array reference (mirrors ExerciseSetTableSection.tsx).
    [rowSignature],
  );

  const buckets = useMemo(
    () => computeCurrentRowBuckets(currentRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSignature],
  );

  const previousSetsQuery = useQuery({
    queryKey: ['routine-editor', 'previousSets', exercise.id, routineId],
    queryFn: () => previousSets(exercise.id, routineId ? { routineId } : undefined),
  });

  const previousResults = useMemo(
    () => computePreviousValues(exercise.exerciseType, currentRows, previousSetsQuery.data ?? [], units),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowSignature (not currentRows' own reference) plus the query data/units are the real deps.
    [rowSignature, previousSetsQuery.data, units, exercise.exerciseType],
  );

  const handleAddSet = (): void => mutate((draft) => addDraftSet(draft, draftExercise.id));
  const handleRemoveSet = (setId: string): void =>
    mutate((draft) => removeDraftSet(draft, draftExercise.id, setId));
  const handleSetType = (setId: string, setType: DraftSet['setType']): void =>
    mutate((draft) => setDraftSetType(draft, draftExercise.id, setId, setType));
  const handleUpdateTarget = (
    setId: string,
    patch: Partial<Pick<DraftSet, 'weightKg' | 'distanceMeters' | 'durationSeconds' | 'customMetric'>>,
  ): void => mutate((draft) => updateDraftSetTarget(draft, draftExercise.id, setId, patch));
  const handleSetReps = (setId: string, reps: number | null): void =>
    mutate((draft) => setDraftSetReps(draft, draftExercise.id, setId, reps));
  const handleSetRepRange = (setId: string, bound: 'start' | 'end', value: number | null): void =>
    mutate((draft) => setDraftSetRepRange(draft, draftExercise.id, setId, bound, value));
  const handleToggleSetRepRange = (setId: string): void =>
    mutate((draft) => toggleSetRepRange(draft, draftExercise.id, setId));
  const handleToggleExerciseRepRange = (): void =>
    mutate((draft) => toggleExerciseRepRange(draft, draftExercise.id));
  const handleSaveNote = (nextNote: string | null): void =>
    mutate((draft) => updateDraftExerciseNotes(draft, draftExercise.id, nextNote));
  const handleSaveRestSeconds = (nextRestSeconds: number | null): void =>
    mutate((draft) => updateDraftExerciseRestSeconds(draft, draftExercise.id, nextRestSeconds));
  const handleRemoveFromSuperset = (): void =>
    mutate((draft) => removeDraftExerciseFromSuperset(draft, draftExercise.id));

  return (
    <Card testID={testID}>
      {supersetVisual ? (
        <View
          testID={`${testID}-superset-indicator`}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}
        >
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
        <Text style={[typography.headline, { color: colors.text.primary, flex: 1 }]} numberOfLines={1}>
          {exercise.name}
        </Text>
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

      <InlineNoteField testID={`${testID}-note`} value={draftExercise.notes} onSave={handleSaveNote} />

      <Pressable
        testID={`${testID}-rest-timer-row`}
        accessibilityRole="button"
        accessibilityLabel="Edit rest timer"
        onPress={() => setRestTimerSheetVisible(true)}
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['3'] }}
      >
        <Clock size={16} strokeWidth={1.75} color={colors.text.tertiary} />
        <Text style={[typography.footnote, { color: colors.text.secondary, marginLeft: spacing['1'] }]}>
          Rest Timer: {formatRestSeconds(draftExercise.restSeconds)}
        </Text>
      </Pressable>

      <SetTable
        testID={`${testID}-table`}
        columns={columns}
        targetMode
        onColumnHeaderPress={() => handleToggleExerciseRepRange()}
      >
        {draftExercise.sets.map((set, index) => {
          const bucket = buckets[index]!;
          return (
            <RoutineSetRow
              key={set.id}
              testID={`${testID}-table-row-${index}`}
              set={set}
              columns={columns}
              badgeKind={badgeKindFor(set.setType)}
              workingIndex={bucket.isWarmup ? null : bucket.bucketIndex + 1}
              previousResult={previousResults[index]!}
              units={units}
              onSetType={(type) => handleSetType(set.id, type)}
              onUpdateTarget={(patch) => handleUpdateTarget(set.id, patch)}
              onSetReps={(reps) => handleSetReps(set.id, reps)}
              onSetRepRange={(bound, value) => handleSetRepRange(set.id, bound, value)}
              onToggleRepRange={() => handleToggleSetRepRange(set.id)}
              onDelete={() => handleRemoveSet(set.id)}
            />
          );
        })}
      </SetTable>

      <Button
        testID={`${testID}-add-set`}
        label="+ Add Set"
        variant="ghost"
        size="sm"
        onPress={handleAddSet}
        style={{ marginTop: spacing['2'], alignSelf: 'flex-start' }}
      />

      <RoutineExerciseMenuSheet
        testID={`${testID}-menu`}
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        isGrouped={isGrouped}
        onReorder={onReorderPress}
        onReplace={() => onReplacePress(draftExercise.id)}
        onAddToSuperset={() => onAddToSupersetPress(draftExercise.id)}
        onRemoveFromSuperset={handleRemoveFromSuperset}
        onRestTimer={() => setRestTimerSheetVisible(true)}
        onRemoveExercise={() => onRemove(draftExercise.id, exercise.name)}
      />

      <RestTimerSheet
        testID={`${testID}-rest-timer-sheet`}
        visible={restTimerSheetVisible}
        onDismiss={() => setRestTimerSheetVisible(false)}
        value={draftExercise.restSeconds}
        onChange={handleSaveRestSeconds}
      />
    </Card>
  );
}
