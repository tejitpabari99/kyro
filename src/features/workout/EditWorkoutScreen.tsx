/**
 * `EditWorkoutScreen` (M4-05, 02 §15 / 04 §5.6 / 08 §4.9) — the past-workout
 * editor: reopens the same set-editing chrome the live logger uses
 * (`ExerciseCard` -> `ExerciseSetTableSection` -> `ConnectedSetRow`, plus the
 * exercise-picker/reorder/superset/plate-calculator sheets) against an
 * already-`completed` workout, with three deliberate differences from the
 * live logger (02 §15's own "How"): **no stopwatch** (a static, editable
 * Duration stat instead of `useWorkoutStopwatch`'s live ticking), **no rest
 * timers** (no `TimerPill`, and `ConnectedSetRow`'s check-handler skips
 * starting one — see `workoutStoreContext.ts`'s `EditWorkoutModeContext`),
 * and **everything editable** (every set already arrives checked — a
 * `completed` workout's sets are *all* `is_completed = 1` by `finish()`'s own
 * invariant, 05 §3.2 — but nothing here prevents unchecking/editing/removing
 * any of them).
 *
 * ## Why a separate screen, not `ActiveWorkoutScreen` + an `editMode` prop
 *
 * `ActiveWorkoutScreen`'s mount effect, finish flow, stopwatch, and rest-
 * timer/PR-banner wiring are all built around "there is exactly one active
 * workout, and it's `useActiveWorkoutStore`'s own `getActive()`-bound
 * singleton" (02 §1's one-active-workout invariant). Editing a *past*
 * workout must never touch that singleton at all — 02 §15: "editing while
 * another workout is active is allowed... must not violate one-active
 * invariant" — so this screen constructs its **own**, independent store
 * instance via `createActiveWorkoutStore()` (a factory built for exactly
 * this — see that function's own file header) and loads it via the M4-05
 * `loadForEdit` action (`getFull(workoutId)`, no `getActive()` involved, no
 * `state==='active'` check anywhere in the mutators it then calls). Every
 * shared child component (`ExerciseCard`, `ExerciseSetTableSection`,
 * `ConnectedSetRow`, `AddWarmUpSetsSheet`) reads/writes *whichever* store
 * instance `WorkoutStoreContext` hands it (`workoutStoreContext.ts`) —
 * defaulting to the real singleton for the live logger, and to this screen's
 * own instance here, via the `<WorkoutStoreContext.Provider>` below.
 *
 * ## Write-through-immediately, then a wholesale `update()` at Save
 *
 * Every set/exercise mutation during the edit session (check/uncheck, value
 * edits, add/remove/reorder, notes, rest-timer duration, supersets) calls the
 * exact same `WorkoutRepositoryImpl` mutators the live logger already uses
 * (`updateSet`, `setCompleted`, `addSet`, `removeExercise`, …) — none of them
 * gate on workout `state`, so they already write straight through to SQLite
 * against this (`completed`) workout's real rows, exactly like 06 §5.3's
 * "every mutation writes through" philosophy the live logger follows. Tapping
 * **Save** (`handleSave` below) does one more thing on top of that: it
 * re-reads the current canonical draft, filters out any set left unchecked
 * (mirroring `finish()`'s own "unchecked rows are discarded" rule — a set
 * unchecked mid-edit means "this didn't happen", the same semantics as never
 * checking it during live logging), drops any exercise left with zero sets
 * and auto-dissolves any superset group left with one survivor (the
 * identical two follow-up passes `WorkoutRepositoryImpl.finish()` already
 * runs, applied here instead of there), then calls the new
 * `WorkoutRepository.update(id, full)` — a genuine full-content transactional
 * replace (08 §4.9: "replace-content update") — with that final snapshot.
 * `update()` always bumps `updated_at`; this handler then invalidates the
 * **union** of the exercise ids the workout touched *before* this edit
 * session started (`originalExerciseIdsRef`) and after (08 §4.9's own
 * wording: "the union of old+new exercise ids") via the shared
 * `invalidateAfterWorkoutMutation` helper (M4-02), so a raised weight moves
 * a trophy, a removed exercise's history shrinks correctly, and a newly
 * *added* exercise's own cache gets its first entry — all in one call.
 *
 * ## PREVIOUS values exclude this workout itself
 *
 * `previousSetsExcludeWorkoutId={workoutId}` is threaded down to every
 * `ExerciseCard` (-> `ExerciseSetTableSection`/`AddWarmUpSetsSheet`) — see
 * `PreviousSetsQuery.beforeWorkoutId`'s own doc comment
 * (`@/data/workouts/types`): PREVIOUS must never reference the workout being
 * edited itself, nor anything chronologically after it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, History } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { RoutineFull } from '@/data/routines/types';
import type { WorkoutRepository, WorkoutUpdateInput } from '@/data/workouts/types';
import { formatDuration } from '@/domain/units';
import { supersetVisualsByExerciseId } from '@/domain/supersets';
import {
  formatVolumeDisplay,
  isStatsEligibleSet,
  totalVolumeKg,
  type VolumeSetInput,
} from '@/domain/volume';
import { useSettingsStore } from '@/features/settings/settings-store';
import { invalidateAfterWorkoutMutation } from '@/features/stats/records-service';
import { captureError } from '@/lib/sentry';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { KeyboardAccessoryBar } from '@/ui/KeyboardAccessoryBar';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { AddToSupersetSheet } from './AddToSupersetSheet';
import { createActiveWorkoutStore, selectActiveWorkout } from './activeWorkoutStore';
import { EditWorkoutMetaSheet } from './EditWorkoutMetaSheet';
import { ExerciseCard } from './ExerciseCard';
import { ExercisePickerSheet, type ExercisePickerMode } from './ExercisePickerSheet';
import { KEYBOARD_ACCESSORY_VIEW_ID, useKeyboardFocusStore } from './keyboardFocusStore';
import { PlateCalculatorSheet } from './PlateCalculatorSheet';
import { PRBannerHost } from './PRBannerHost';
import { ReorderExercisesSheet } from './ReorderExercisesSheet';
import { EditWorkoutModeContext, WorkoutStoreContext } from './workoutStoreContext';

export interface EditWorkoutScreenProps {
  workoutId: string;
  workoutRepository: WorkoutRepository;
  exerciseRepository: ExerciseRepository;
  getRoutineFull?: (routineId: string) => Promise<RoutineFull | null>;
  testID?: string;
}

export function EditWorkoutScreen({
  workoutId,
  workoutRepository,
  exerciseRepository,
  getRoutineFull,
  testID = 'edit-workout',
}: EditWorkoutScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // See file header — one independent store instance per screen mount,
  // never the app-wide singleton. Named `useEditStore` (not `editStore`) so
  // both eslint's rules-of-hooks and the React Compiler
  // (`experiments.reactCompiler`, app.json) recognize `useEditStore(selector)`
  // below as a hook call by naming convention alone — see the matching
  // comment in `ConnectedSetRow.tsx` for the invalid-hook-call bug a
  // non-`use`-prefixed name here caused.
  const [useEditStore] = useState(() => createActiveWorkoutStore());
  const workout = useEditStore(selectActiveWorkout);
  const loaded = useEditStore((state) => state.loaded);
  const [notFound, setNotFound] = useState(false);

  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const previousValuesMode = useSettingsStore((state) => state.settings.previous_values_mode);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);
  const plateCalcEnabled = useSettingsStore((state) => state.settings.plate_calc.enabled);
  const focusedIsWeight = useKeyboardFocusStore((state) => state.focusedIsWeight);

  // The exercise ids this workout touched *before* any edit this session
  // makes — captured once, from `loadForEdit`'s own resolved value, so
  // `handleSave`'s union-invalidation is correct even if every exercise gets
  // removed/replaced during the session (08 §4.9: "union of old+new
  // exercise ids").
  const originalExerciseIdsRef = useRef<string[]>([]);
  const loadRequested = useRef(false);
  useEffect(() => {
    if (loadRequested.current) {
      return;
    }
    loadRequested.current = true;
    void useEditStore
      .getState()
      .loadForEdit(workoutRepository, workoutId)
      .then((loadedWorkout) => {
        if (!loadedWorkout) {
          setNotFound(true);
          return;
        }
        originalExerciseIdsRef.current = Array.from(
          new Set(loadedWorkout.exercises.map((e) => e.exerciseId)),
        );
      })
      .catch((error: unknown) => captureError(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount effect, mirrors ActiveWorkoutScreen's own startRequested-latch pattern.
  }, []);

  const exerciseIds = useMemo(
    () => (workout ? Array.from(new Set(workout.exercises.map((e) => e.exerciseId))) : []),
    [workout],
  );
  const exercisesQuery = useQuery({
    queryKey: ['workout', 'edit', 'exercise-lookup', exerciseIds.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(exerciseIds.map((id) => exerciseRepository.get(id)));
      const map = new Map<string, Exercise>();
      for (const entry of entries) {
        if (entry) {
          map.set(entry.id, entry);
        }
      }
      return map;
    },
    enabled: exerciseIds.length > 0,
  });

  const supersetVisuals = useMemo(
    () =>
      workout
        ? supersetVisualsByExerciseId(
            workout.exercises.map((workoutExercise) => ({
              id: workoutExercise.id,
              position: workoutExercise.position,
              supersetId: workoutExercise.supersetId,
            })),
          )
        : new Map(),
    [workout],
  );

  const volumeInputs: VolumeSetInput[] = useMemo(() => {
    if (!workout) {
      return [];
    }
    return workout.exercises.flatMap((workoutExercise) => {
      const exerciseType = exercisesQuery.data?.get(workoutExercise.exerciseId)?.exerciseType;
      if (!exerciseType) {
        return [];
      }
      return workoutExercise.sets.map((s) => ({
        exerciseType,
        setType: s.setType,
        weightKg: s.weightKg,
        reps: s.reps,
        isCompleted: s.isCompleted,
      }));
    });
  }, [workout, exercisesQuery.data]);

  const volumeKg = totalVolumeKg(volumeInputs, warmupInStats);
  const displayVolume = formatVolumeDisplay(volumeKg, weightUnit);
  const checkedSetsCount = workout
    ? workout.exercises.reduce(
        (sum, workoutExercise) =>
          sum + workoutExercise.sets.filter((s) => isStatsEligibleSet(s, warmupInStats)).length,
        0,
      )
    : 0;
  const durationSeconds = workout
    ? Math.max(
        0,
        Math.floor(
          ((workout.endTime ?? workout.startTime) - workout.startTime - workout.durationPauseOffsetMs) /
            1000,
        ),
      )
    : 0;

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [metaSheetVisible, setMetaSheetVisible] = useState(false);
  const [addPickerVisible, setAddPickerVisible] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const pickerVisible = addPickerVisible || replaceTargetId != null;
  const pickerMode: ExercisePickerMode = replaceTargetId != null ? 'replace' : 'add';
  const [reorderVisible, setReorderVisible] = useState(false);
  const [supersetTargetId, setSupersetTargetId] = useState<string | null>(null);
  const [calculatorTargetFieldId, setCalculatorTargetFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleBack = (): void => {
    router.back();
  };

  const handleTitlePress = (): void => {
    if (!workout) {
      return;
    }
    setTitleDraft(workout.title);
  };

  const commitTitle = (): void => {
    if (titleDraft === null || !workout) {
      return;
    }
    const next = titleDraft.trim();
    setTitleDraft(null);
    if (next.length > 0 && next !== workout.title) {
      void useEditStore.getState().updateMeta({ title: next });
    }
  };

  const handleSaveMeta = (nextStartTime: number, nextEndTime: number): void => {
    setMetaSheetVisible(false);
    void useEditStore.getState().updateMeta({ startTime: nextStartTime, endTime: nextEndTime });
  };

  const handleAddExercisePress = (): void => setAddPickerVisible(true);
  const handleClosePicker = (): void => {
    setAddPickerVisible(false);
    setReplaceTargetId(null);
  };
  const handlePickerAdd = async (ids: string[], superset: boolean): Promise<void> => {
    const items = ids.map((exerciseId) => ({ exerciseId, restSeconds: defaultRestSeconds }));
    const added = await useEditStore.getState().addExercises(items);
    if (superset && added.length > 1) {
      const groupId = Math.min(...added.map((workoutExercise) => workoutExercise.position));
      await Promise.all(
        added.map((workoutExercise) =>
          useEditStore.getState().updateExercise(workoutExercise.id, { supersetId: groupId }),
        ),
      );
    }
  };
  const handlePickerReplace = (exerciseId: string): void => {
    if (!replaceTargetId) {
      return;
    }
    void useEditStore.getState().replaceExercise(replaceTargetId, exerciseId);
  };
  const handleReplacePress = (workoutExerciseId: string): void => {
    setAddPickerVisible(false);
    setReplaceTargetId(workoutExerciseId);
  };
  const handleReorderSave = (orderedIds: string[]): void => {
    void useEditStore.getState().reorderExercises(orderedIds);
  };
  const handleAddToSupersetPress = (workoutExerciseId: string): void => {
    setSupersetTargetId(workoutExerciseId);
  };
  const handleAddToSupersetConfirm = (selectedIds: string[]): void => {
    if (!workout || !supersetTargetId) {
      return;
    }
    const memberIds = new Set([supersetTargetId, ...selectedIds]);
    const members = workout.exercises.filter((workoutExercise) => memberIds.has(workoutExercise.id));
    if (members.length === 0) {
      return;
    }
    const groupId = Math.min(...members.map((workoutExercise) => workoutExercise.position));
    for (const member of members) {
      void useEditStore.getState().updateExercise(member.id, { supersetId: groupId });
    }
    setSupersetTargetId(null);
  };
  const handleRemoveExercise = (workoutExerciseId: string): void => {
    void useEditStore.getState().removeExercise(workoutExerciseId);
  };

  const handleCalculatorPress = (): void => {
    const fieldId = useKeyboardFocusStore.getState().focusedFieldId;
    if (!fieldId) {
      return;
    }
    setCalculatorTargetFieldId(fieldId);
  };
  const handleCalculatorDismiss = (): void => setCalculatorTargetFieldId(null);
  const handleNextPress = (): void => useKeyboardFocusStore.getState().focusNext();

  /** See file header, "Write-through-immediately, then a wholesale `update()` at Save." */
  const handleSave = async (): Promise<void> => {
    const current = useEditStore.getState().workout;
    if (!current) {
      return;
    }
    setSaving(true);
    try {
      // Drop unchecked sets (mirrors `finish()`'s own rule), then any
      // exercise left with zero sets, then dissolve any superset group left
      // with exactly one surviving member — the same three follow-up passes
      // `WorkoutRepositoryImpl.finish()` runs, applied here at Save instead.
      const survivingExercises = current.exercises
        .map((workoutExercise) => ({
          ...workoutExercise,
          sets: workoutExercise.sets.filter((s) => s.isCompleted),
        }))
        .filter((workoutExercise) => workoutExercise.sets.length > 0);

      const groupSizes = new Map<number, number>();
      for (const workoutExercise of survivingExercises) {
        if (workoutExercise.supersetId !== null) {
          groupSizes.set(workoutExercise.supersetId, (groupSizes.get(workoutExercise.supersetId) ?? 0) + 1);
        }
      }

      const input: WorkoutUpdateInput = {
        title: current.title,
        description: current.description,
        startTime: current.startTime,
        endTime: current.endTime,
        durationPauseOffsetMs: current.durationPauseOffsetMs,
        exercises: survivingExercises.map((workoutExercise) => ({
          exerciseId: workoutExercise.exerciseId,
          supersetId:
            workoutExercise.supersetId !== null && (groupSizes.get(workoutExercise.supersetId) ?? 0) > 1
              ? workoutExercise.supersetId
              : null,
          notes: workoutExercise.notes,
          restSeconds: workoutExercise.restSeconds,
          sets: workoutExercise.sets.map((s) => ({
            setType: s.setType,
            weightKg: s.weightKg,
            reps: s.reps,
            distanceMeters: s.distanceMeters,
            durationSeconds: s.durationSeconds,
            rpe: s.rpe,
            customMetric: s.customMetric,
            isCompleted: true,
          })),
        })),
      };

      await workoutRepository.update(workoutId, input);

      const finalExerciseIds = Array.from(new Set(input.exercises.map((e) => e.exerciseId)));
      const unionExerciseIds = Array.from(
        new Set([...originalExerciseIdsRef.current, ...finalExerciseIds]),
      );
      await invalidateAfterWorkoutMutation(queryClient, unionExerciseIds);
      await queryClient.invalidateQueries({ queryKey: ['history', 'detail', workoutId] });

      router.replace(`/history/${workoutId}` as never);
    } catch (error) {
      captureError(error);
      Alert.alert('Something went wrong', 'This workout could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
        <EmptyState
          icon={<History size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="Workout not found"
          caption="This workout may have been deleted."
        />
      </View>
    );
  }

  if (!loaded || !workout) {
    return (
      <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
        <Text
          style={[
            typography.body,
            { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['8'] },
          ]}
        >
          Loading…
        </Text>
      </View>
    );
  }

  return (
    <WorkoutStoreContext.Provider value={useEditStore}>
      <EditWorkoutModeContext.Provider value={true}>
        <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
          <View
            testID={`${testID}-header`}
            style={[
              styles.header,
              {
                paddingHorizontal: spacing['4'],
                // BUGFIX-01: fullScreenModal presentation covers the status
                // bar too — see `ActiveWorkoutScreen.tsx`'s identical fix /
                // `app/_layout.tsx`'s header.
                paddingTop: insets.top + spacing['3'],
              },
            ]}
          >
            <Pressable
              testID={`${testID}-back`}
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={handleBack}
              hitSlop={8}
            >
              <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
            </Pressable>

            {titleDraft !== null ? (
              <TextInput
                testID={`${testID}-title-input`}
                value={titleDraft}
                onChangeText={setTitleDraft}
                onBlur={commitTitle}
                onSubmitEditing={commitTitle}
                autoFocus
                style={[
                  typography.headline,
                  { color: colors.text.primary, flex: 1, textAlign: 'center', padding: 0 },
                ]}
              />
            ) : (
              <Pressable
                testID={`${testID}-title`}
                onPress={handleTitlePress}
                style={styles.titlePressable}
                accessibilityRole="button"
                accessibilityLabel="Edit workout title"
              >
                <Text
                  style={[typography.headline, { color: colors.text.primary, textAlign: 'center' }]}
                  numberOfLines={1}
                >
                  {workout.title}
                </Text>
              </Pressable>
            )}

            <Button
              testID={`${testID}-save`}
              label="Save"
              variant="primary"
              size="sm"
              disabled={saving}
              onPress={() => void handleSave()}
            />
          </View>

          <View
            style={[styles.metaRow, { paddingHorizontal: spacing['4'], paddingVertical: spacing['3'] }]}
          >
            <Pressable
              testID={`${testID}-duration`}
              onPress={() => setMetaSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit date and duration"
            >
              <StatColumn label="Duration" value={formatDuration(durationSeconds) ?? '0:00'} />
            </Pressable>
            <StatColumn
              testID={`${testID}-volume`}
              label="Volume"
              value={`${Math.round(displayVolume)} ${weightUnit}`}
            />
            <StatColumn testID={`${testID}-sets`} label="Sets" value={String(checkedSetsCount)} />
          </View>

          <ScrollView
            testID={`${testID}-body`}
            style={styles.body}
            contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}
            keyboardShouldPersistTaps="handled"
          >
            {workout.exercises.map((workoutExercise) => {
              const exercise = exercisesQuery.data?.get(workoutExercise.exerciseId);
              if (!exercise) {
                return null;
              }
              return (
                <ExerciseCard
                  key={workoutExercise.id}
                  testID={`${testID}-exercise-${workoutExercise.id}`}
                  workoutExerciseId={workoutExercise.id}
                  exercisePosition={workoutExercise.position}
                  exercise={exercise}
                  exerciseRepository={exerciseRepository}
                  workoutRepository={workoutRepository}
                  notes={workoutExercise.notes}
                  restSeconds={workoutExercise.restSeconds}
                  supersetVisual={supersetVisuals.get(workoutExercise.id) ?? null}
                  weightUnit={weightUnit}
                  distanceUnit={distanceUnit}
                  rpeEnabled={rpeEnabled}
                  previousValuesMode={previousValuesMode}
                  routineId={workout.routineId}
                  getRoutineFull={getRoutineFull}
                  previousSetsExcludeWorkoutId={workoutId}
                  onReorderPress={() => setReorderVisible(true)}
                  onReplacePress={handleReplacePress}
                  onAddToSupersetPress={handleAddToSupersetPress}
                  onRemove={handleRemoveExercise}
                />
              );
            })}
          </ScrollView>

          <View style={[styles.footer, { padding: spacing['4'], gap: spacing['2'] }]}>
            <Button
              testID={`${testID}-add-exercise`}
              label="+ Add Exercise"
              variant="primary"
              size="lg"
              onPress={handleAddExercisePress}
            />
          </View>

          <EditWorkoutMetaSheet
            testID={`${testID}-meta-sheet`}
            visible={metaSheetVisible}
            onDismiss={() => setMetaSheetVisible(false)}
            startTime={workout.startTime}
            endTime={workout.endTime}
            durationPauseOffsetMs={workout.durationPauseOffsetMs}
            onSave={handleSaveMeta}
          />

          <ExercisePickerSheet
            testID={`${testID}-exercise-picker`}
            visible={pickerVisible}
            onDismiss={handleClosePicker}
            repository={exerciseRepository}
            workoutRepository={workoutRepository}
            mode={pickerMode}
            onAdd={(ids, superset) => void handlePickerAdd(ids, superset)}
            onReplace={handlePickerReplace}
          />

          <ReorderExercisesSheet
            testID={`${testID}-reorder-sheet`}
            visible={reorderVisible}
            onDismiss={() => setReorderVisible(false)}
            exercises={workout.exercises.map((workoutExercise) => ({
              id: workoutExercise.id,
              name: exercisesQuery.data?.get(workoutExercise.exerciseId)?.name ?? '…',
            }))}
            onSave={handleReorderSave}
          />

          <AddToSupersetSheet
            testID={`${testID}-add-to-superset-sheet`}
            visible={supersetTargetId != null}
            onDismiss={() => setSupersetTargetId(null)}
            candidates={workout.exercises
              .filter((workoutExercise) => workoutExercise.id !== supersetTargetId)
              .map((workoutExercise) => ({
                id: workoutExercise.id,
                name: exercisesQuery.data?.get(workoutExercise.exerciseId)?.name ?? '…',
                position: workoutExercise.position,
              }))}
            onConfirm={handleAddToSupersetConfirm}
          />

          <KeyboardAccessoryBar
            testID={`${testID}-keyboard-accessory-bar`}
            nativeID={KEYBOARD_ACCESSORY_VIEW_ID}
            showCalculator={focusedIsWeight && plateCalcEnabled}
            onCalculatorPress={handleCalculatorPress}
            onNextPress={handleNextPress}
          />

          <PlateCalculatorSheet
            testID={`${testID}-plate-calculator-sheet`}
            visible={calculatorTargetFieldId != null}
            onDismiss={handleCalculatorDismiss}
            targetFieldId={calculatorTargetFieldId ?? ''}
            weightUnit={weightUnit}
          />

          <PRBannerHost testID={`${testID}-pr-banner`} />
        </View>
      </EditWorkoutModeContext.Provider>
    </WorkoutStoreContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titlePressable: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  body: {
    flex: 1,
  },
  footer: {},
});
