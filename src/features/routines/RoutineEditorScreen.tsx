/**
 * `RoutineEditorScreen` (M3-04, 04 §2.1) — the full-screen modal routine
 * editor, shared by `app/routine/new.tsx` (`mode="create"`) and
 * `app/routine/[id]/edit.tsx` (`mode="edit"`) — the exact "feature
 * component owns data + layout, route file only wires real deps" split
 * `ExerciseFormScreen.tsx` (M1-09) established for the identical
 * create/edit-via-`mode`-prop shape, and the one `RoutinesHubScreen.tsx`'s
 * own header names as this task's destination for its `/routine/new`/
 * `/routine/[id]/edit` navigation seams.
 *
 * ## Cancel/title/Save (04 §2.1, verbatim: "Cancel left (confirm if dirty),
 * title field, Save right (disabled until title non-empty and ≥ 1
 * exercise… exception: zero-exercise routines are allowed but warned)")
 *
 * Save is disabled by title alone — the "≥ 1 exercise" clause is
 * immediately walked back by the doc's own next sentence ("zero-exercise
 * routines are allowed but warned"), so the *button* only gates on title
 * (matching `ExerciseFormScreen`'s own name-required gate), and tapping
 * Save with zero exercises instead shows a confirm `Alert.alert` ("This
 * routine has no exercises...") before actually saving — this repo's
 * established "warn but allow" shape (`Alert.alert` with a Cancel + a
 * proceeding action), same pattern `RoutinesHubScreen.tsx`'s folder-delete
 * dialog and discard-workout confirm already use.
 *
 * ## Dirty tracking — a flag, not a diff
 *
 * `dirty` is a plain `useState(false)`, flipped `true` by `mutate` (every
 * draft-touching call from `RoutineExerciseCard`/this screen's own title
 * field/exercise-picker/superset/reorder handlers) and by the title
 * `TextInput`'s `onChangeText`. See `routine-draft.ts`'s own header for why
 * this is a flag rather than a structural diff against the original draft.
 * Hydrating from an existing routine (edit mode, `existingQuery.data`) sets
 * `draft` directly via `setDraft`, never through `mutate` — so loading an
 * existing routine never marks the screen dirty on its own.
 *
 * ## State management choice (why plain `useState`, not a store)
 *
 * The whole `RoutineDraft` lives in this screen's own React state, exactly
 * the shape `ExerciseFormScreen.tsx`'s `FormState` already establishes for
 * "a single-screen form with Cancel-if-dirty + Save" in this codebase — no
 * new Zustand store. This is a deliberate departure from the active
 * logger's `activeWorkoutStore` architecture (`ConnectedSetRow.tsx`'s
 * header explains that store's own reasons: cross-component subscription
 * for a *live, ongoing* session with a rest timer/keyboard-focus registry/
 * background persistence that must survive navigation away and back). None
 * of that applies here: the editor is a single, self-contained modal
 * screen with no cross-screen consumer, no background timers, and no
 * requirement to survive app backgrounding mid-edit (04 §2.1 gives it none
 * of §5.4/§9's active-workout durability guarantees) — a store would add
 * an extra layer of indirection (subscriptions, selectors, a rehydrate
 * step) to solve a problem (state shared across independently-rendering
 * components/screens) this screen doesn't have. `RoutineExerciseCard`/
 * `RoutineSetRow` still get referentially-stable `columns`/`previousResult`
 * props via the same structural-signature `useMemo` pattern
 * `ExerciseSetTableSection.tsx` uses, so per-row typing isolation is
 * preserved even without a store backing it.
 *
 * ## `previousSets` — a plain function prop, not `activeWorkoutStore`
 *
 * See `RoutineExerciseCard.tsx`'s own header for why: this screen has no
 * active workout, so it can't reach `activeWorkoutStore.previousSets`
 * (that store requires `rehydrate()` to have already run). The route files
 * construct a real `WorkoutRepositoryImpl` purely to hand this screen its
 * `previousSets` method, unbound from the rest of that repository's
 * surface — this screen never mutates a workout.
 *
 * ## Deliberate scope decisions (documented, not oversights)
 *
 *  - **No exercise-name-tap-to-detail sheet.** The active logger's
 *    `ExerciseCard` opens a read-only `ExerciseDetailSheet` on a name tap;
 *    04 §2.1's own text never asks for this in the editor, and it isn't
 *    part of the acceptance gate — omitted to keep this already-large
 *    task's surface area honest rather than silently growing it.
 *  - **Remove Exercise has no confirm/undo-snackbar.** 02 §3's "no confirm;
 *    snackbar with Undo" is the *logger's* documented behavior for removing
 *    a mid-workout exercise (`ExerciseCardMenuSheet.tsx`'s header); 04 §2.1
 *    never re-specifies this for the editor, and building a whole
 *    undo/snackbar subsystem for this task's already-large scope wasn't
 *    warranted — removal here is immediate (the outer Cancel/dirty-confirm
 *    is still the safety net for an accidental removal, same as any other
 *    edit).
 *  - **The `ExercisePickerSheet`'s own ⓘ info-icon `ExerciseDetailSheet`
 *    doesn't get a `workoutRepository` (M4-09).** That prop is optional
 *    specifically for this reason — the History/Charts tabs just fall back
 *    to their empty states here rather than this screen threading a new
 *    `WorkoutRepositoryImpl` dependency in purely to serve a picker's info
 *    button. Consistent with the "no exercise-name-tap-to-detail sheet"
 *    decision above (this editor already scopes exercise-detail access down
 *    on purpose), and the acceptance text this feature exists for
 *    ("detail-as-sheet mid-workout doesn't disturb active workout") doesn't
 *    apply here at all — a routine editor has no active workout to disturb.
 *  - **On successful save, this screen always calls `router.back()`** —
 *    for both create and edit — rather than navigating to a routine-detail
 *    screen, because no such screen exists yet in this milestone (the same
 *    "don't fabricate a fake destination" posture that led `RoutinesHubScreen
 *    .tsx` to push to a not-yet-built `/routine/[id]/start` route before
 *    M3-05 landed real routine-starting — see that file's own header for how
 *    it now works). The hub's own `['routines']`-prefixed queries are
 *    invalidated first, so the list/preview the user lands back on already
 *    reflects the save.
 */
import React, { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { RoutineRepository } from '@/data/routines/types';
import type { PreviousSet, PreviousSetsQuery } from '@/data/workouts/types';
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import { computeSupersetGroups, type SupersetMemberInput } from '@/domain/supersets';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme-provider';

import { AddToSupersetSheet, type SupersetCandidate } from '../workout/AddToSupersetSheet';
import { ExercisePickerSheet, type ExercisePickerMode } from '../workout/ExercisePickerSheet';
import { ReorderExercisesSheet } from '../workout/ReorderExercisesSheet';
import { RoutineExerciseCard } from './RoutineExerciseCard';
import {
  addExercisesToDraft,
  createEmptyDraft,
  draftFromRoutineFull,
  draftToNewRoutineInput,
  draftToUpdateRoutineInput,
  groupDraftSuperset,
  removeExerciseFromDraft,
  reorderDraftExercises,
  replaceExerciseInDraft,
  type RoutineDraft,
} from './routine-draft';

export interface RoutineEditorScreenProps {
  routineRepository: RoutineRepository;
  exerciseRepository: ExerciseRepository;
  previousSets: (exerciseId: string, opts?: PreviousSetsQuery) => Promise<PreviousSet[]>;
  mode: 'create' | 'edit';
  /** Required when `mode === 'edit'`. */
  routineId?: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultRestSeconds: number | null;
  testID?: string;
}

export function RoutineEditorScreen({
  routineRepository,
  exerciseRepository,
  previousSets,
  mode,
  routineId,
  weightUnit,
  distanceUnit,
  defaultRestSeconds,
  testID = 'routine-editor-screen',
}: RoutineEditorScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const existingQuery = useQuery({
    queryKey: ['routines', 'full', routineId],
    queryFn: () => routineRepository.getFull(routineId as string),
    enabled: mode === 'edit' && routineId != null,
  });
  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'routine-editor-all'],
    queryFn: () => exerciseRepository.list(),
  });

  const [draft, setDraft] = useState<RoutineDraft>(() => createEmptyDraft());
  const [dirty, setDirty] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Mid-render hydration from the loaded routine (edit mode) — same pattern
  // `ExerciseFormScreen.tsx` uses, see this file's header. Never marks the
  // screen dirty (writes `draft` directly, not through `mutate`).
  if (mode === 'edit' && existingQuery.data != null && hydratedId !== existingQuery.data.id) {
    setHydratedId(existingQuery.data.id);
    setDraft(draftFromRoutineFull(existingQuery.data));
  }

  const exerciseById = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const exercise of exercisesQuery.data ?? []) {
      map.set(exercise.id, exercise);
    }
    return map;
  }, [exercisesQuery.data]);

  const supersetGroups = useMemo(
    () =>
      computeSupersetGroups(
        draft.exercises.map(
          (exercise, index): SupersetMemberInput => ({
            id: exercise.id,
            position: index,
            supersetId: exercise.supersetId,
          }),
        ),
      ),
    [draft.exercises],
  );

  const mutate = (fn: (current: RoutineDraft) => RoutineDraft): void => {
    setDraft((current) => fn(current));
    setDirty(true);
  };

  const handleTitleChange = (text: string): void => {
    setDraft((current) => ({ ...current, title: text }));
    setDirty(true);
  };

  const canSave = draft.title.trim().length > 0;

  const handleCancel = (): void => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this routine will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const performSave = async (): Promise<void> => {
    setSaving(true);
    try {
      if (mode === 'create') {
        await routineRepository.create(draftToNewRoutineInput(draft));
      } else {
        await routineRepository.update(routineId as string, draftToUpdateRoutineInput(draft));
      }
      await queryClient.invalidateQueries({ queryKey: ['routines'] });
      router.back();
    } catch {
      Alert.alert('Something went wrong', 'This routine could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePress = (): void => {
    if (!canSave) {
      return;
    }
    if (draft.exercises.length === 0) {
      Alert.alert(
        'Empty Routine',
        'This routine has no exercises. Save it anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: () => void performSave() },
        ],
      );
      return;
    }
    void performSave();
  };

  // -- Exercise picker (add / replace) — one sheet instance, same
  // `pickerMode`/`replaceTargetId` convention `ActiveWorkoutScreen.tsx`
  // established. ---------------------------------------------------------
  const [addPickerVisible, setAddPickerVisible] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const pickerVisible = addPickerVisible || replaceTargetId != null;
  const pickerMode: ExercisePickerMode = replaceTargetId != null ? 'replace' : 'add';

  const handleAddExercisePress = (): void => setAddPickerVisible(true);
  const handlePickerDismiss = (): void => {
    setAddPickerVisible(false);
    setReplaceTargetId(null);
  };
  const handlePickerAdd = (exerciseIds: string[], superset: boolean): void => {
    mutate((current) => addExercisesToDraft(current, exerciseIds, { superset, defaultRestSeconds }));
  };
  const handleReplacePress = (draftExerciseId: string): void => {
    setAddPickerVisible(false);
    setReplaceTargetId(draftExerciseId);
  };
  const handlePickerReplace = (exerciseId: string): void => {
    if (!replaceTargetId) {
      return;
    }
    mutate((current) => replaceExerciseInDraft(current, replaceTargetId, exerciseId));
  };

  // -- Reorder ------------------------------------------------------------
  const [reorderVisible, setReorderVisible] = useState(false);
  const handleReorderSave = (orderedIds: string[]): void => {
    mutate((current) => reorderDraftExercises(current, orderedIds));
  };

  // -- Superset -------------------------------------------------------
  const [supersetTargetId, setSupersetTargetId] = useState<string | null>(null);
  const handleAddToSupersetConfirm = (selectedIds: string[]): void => {
    if (!supersetTargetId) {
      return;
    }
    mutate((current) => groupDraftSuperset(current, supersetTargetId, selectedIds));
    setSupersetTargetId(null);
  };
  const supersetCandidates: SupersetCandidate[] = draft.exercises
    .filter((exercise) => exercise.id !== supersetTargetId)
    .map((exercise, index) => ({
      id: exercise.id,
      name: exerciseById.get(exercise.exerciseId)?.name ?? '…',
      position: index,
    }));

  const handleRemoveExercise = (draftExerciseId: string): void => {
    mutate((current) => removeExerciseFromDraft(current, draftExerciseId));
  };

  const isLoading =
    (mode === 'edit' && existingQuery.isLoading) || exercisesQuery.isLoading;

  if (isLoading) {
    return (
      <View testID={testID} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing['4'],
          // BUGFIX-01: fullScreenModal presentation covers the status bar
          // too — see `ActiveWorkoutScreen.tsx`'s identical fix /
          // `app/_layout.tsx`'s header.
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Button testID={`${testID}-cancel`} label="Cancel" variant="ghost" size="sm" onPress={handleCancel} />
        <Text style={[typography.headline, { color: colors.text.primary }]}>
          {mode === 'create' ? 'New Routine' : 'Edit Routine'}
        </Text>
        <Button
          testID={`${testID}-save`}
          label="Save"
          variant="ghost"
          size="sm"
          disabled={!canSave}
          loading={saving}
          onPress={handleSavePress}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing['4'] }}>
        <TextInput
          testID={`${testID}-title-input`}
          value={draft.title}
          onChangeText={handleTitleChange}
          placeholder="Routine title"
          placeholderTextColor={colors.text.tertiary}
          style={[
            typography.title2,
            {
              minHeight: 44,
              color: colors.text.primary,
              marginBottom: spacing['5'],
            },
          ]}
        />

        {draft.exercises.map((draftExercise) => {
          const exercise = exerciseById.get(draftExercise.exerciseId);
          if (!exercise) {
            return null;
          }
          const visual = supersetGroups.get(draftExercise.supersetId ?? -1) ?? null;
          return (
            <View key={draftExercise.id} style={{ marginBottom: spacing['4'] }}>
              <RoutineExerciseCard
                // Keyed by `exerciseId` (the stable library exercise id),
                // not `draftExercise.id` (a freshly minted, per-session
                // random local id for a new exercise) — deterministic
                // enough for tests to target directly (`RoutineEditorScreen
                // .test.tsx`) without reaching into generated ids; the same
                // exercise added twice would collide, an accepted edge case
                // (testID uniqueness only, no functional impact — `key`
                // above is still the real per-row React identity).
                testID={`${testID}-card-${draftExercise.exerciseId}`}
                draftExercise={draftExercise}
                exercise={exercise}
                weightUnit={weightUnit}
                distanceUnit={distanceUnit}
                supersetVisual={
                  draftExercise.supersetId != null && visual
                    ? { label: visual.label, color: visual.color }
                    : null
                }
                previousSets={previousSets}
                routineId={mode === 'edit' ? (routineId ?? null) : null}
                mutate={mutate}
                onReorderPress={() => setReorderVisible(true)}
                onReplacePress={handleReplacePress}
                onAddToSupersetPress={setSupersetTargetId}
                onRemove={handleRemoveExercise}
              />
            </View>
          );
        })}

        <Button
          testID={`${testID}-add-exercise`}
          label="+ Add Exercise"
          variant="tonal"
          size="lg"
          onPress={handleAddExercisePress}
        />
      </ScrollView>

      <ExercisePickerSheet
        testID={`${testID}-exercise-picker`}
        visible={pickerVisible}
        onDismiss={handlePickerDismiss}
        repository={exerciseRepository}
        mode={pickerMode}
        onAdd={handlePickerAdd}
        onReplace={handlePickerReplace}
      />

      <ReorderExercisesSheet
        testID={`${testID}-reorder-sheet`}
        visible={reorderVisible}
        onDismiss={() => setReorderVisible(false)}
        exercises={draft.exercises.map((exercise) => ({
          id: exercise.id,
          name: exerciseById.get(exercise.exerciseId)?.name ?? '…',
        }))}
        onSave={handleReorderSave}
      />

      <AddToSupersetSheet
        testID={`${testID}-add-to-superset-sheet`}
        visible={supersetTargetId != null}
        onDismiss={() => setSupersetTargetId(null)}
        candidates={supersetCandidates}
        onConfirm={handleAddToSupersetConfirm}
      />
    </View>
  );
}
