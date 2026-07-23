/**
 * `ActiveWorkoutScreen` (M2-05) — 02 §2's active-workout screen anatomy,
 * everything except the set table itself (M2-06, already built —
 * `ExerciseSetTableSection` is reused directly per exercise card below).
 *
 * Rendered by the `workout/active` fullScreenModal route (06 §3); this
 * file holds all the real logic/layout, following the established
 * "feature component owns data + layout, route file only wires real deps"
 * split (`ExerciseDetailScreen`/M1-08, `ExerciseSetTableSection`/M2-06).
 *
 * ## Empty-start auto-title (02 §1 / this task's own instruction: "Auto-title
 * by time of day on screen mount when starting empty")
 *
 * The one-active-workout gate (02 §1's Resume/Discard-and-start action
 * sheet) is resolved **before** navigation, at the tab entry point
 * (`app/(tabs)/workout/index.tsx`) — by the time this screen mounts, the
 * store's `workout` is either the resumed active workout, or genuinely
 * `null`. In the latter case, this screen's own mount effect is what
 * actually creates the empty workout (auto-titled by `domain/auto-title.ts`)
 * — the tab button's `router.push` is a plain, instant navigation, so
 * "empty start opens the logger in < 500 ms" holds even though the DB
 * write itself happens after the modal has already started presenting.
 *
 * ## Retro-log mode (02 §1, §2 — "the logger honors the mode now")
 *
 * No retro-log entry point exists yet (Calendar/History are later
 * milestones) — `retro`/`retroStartTime` are optional props a future
 * M4-05 entry point will pass via the route's query params (see
 * `app/workout/active.tsx`). When `retro` is true, the stopwatch must
 * render **paused at 0**, not ticking (02 §1: "start_time = chosen date
 * 12:00 and the duration stopwatch paused at 0").
 *
 * **Why `retroStartTimeResolved` is a lazy `useState`, not read fresh on
 * every render:** `useWorkoutStopwatch`'s own `initiallyPaused` seeds its
 * frozen `pausedAt` to whatever `startTime` prop it received on *its own*
 * first render — which happens on *this* component's first render, i.e.
 * before `workout` exists (the mount effect below hasn't resolved yet).
 * If that first-render `startTime` were a fresh `Date.now()`-ish fallback
 * distinct from the value the mount effect later persists as the real
 * `workout.startTime`, the frozen elapsed would settle on a stale nonzero
 * (or clamped-to-0-by-luck) number instead of an honest `0`. Resolving
 * `retro`'s start time exactly once, synchronously, in the same render
 * that first calls `useWorkoutStopwatch` — and having the mount effect
 * below persist that identical value — guarantees `pausedAt === startTime`
 * once `workout` loads, so the frozen formula (`pausedAt - startTime -
 * offset`, `useWorkoutStopwatch`'s own header) evaluates to exactly `0`
 * regardless of how long the async `startEmpty` write takes to resolve.
 *
 * **`startRequested`'s guard must latch on the *decision*, not on "we
 * actually called `startEmpty`"** (bug found and fixed while writing this
 * task's own test suite — worth documenting so it isn't reintroduced): the
 * mount effect below makes a one-time go/no-go call the first time
 * `loaded` is true — "is there already a workout (the resume path) or not
 * (the empty-start path)?" — and `startRequested.current` must flip to
 * `true` on *either* branch, not only the branch that calls `startEmpty`.
 * Marking it only inside the "no workout yet" branch left a resumed
 * screen instance's guard permanently `false`; if that workout was later
 * discarded (`workout` -> `null`) while this same screen instance was
 * still mounted (e.g. `router.back()` racing/no-op, as it does under a
 * mocked `router` in tests, or a slow navigation), the effect's
 * dependency array sees `workout` change and re-runs, and with the guard
 * never having latched, it would auto-start a brand-new empty workout
 * immediately after the user just discarded one.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { autoTitleForDate } from '@/domain/auto-title';
import { formatDuration } from '@/domain/units';
import {
  formatVolumeDisplay,
  isStatsEligibleSet,
  totalVolumeKg,
  type VolumeSetInput,
} from '@/domain/volume';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { DurationEditSheet } from './DurationEditSheet';
import { ExerciseSetTableSection } from './ExerciseSetTableSection';
import { selectActiveWorkout, useActiveWorkoutStore } from './activeWorkoutStore';
import { useWorkoutStopwatch } from './useWorkoutStopwatch';

export interface ActiveWorkoutScreenProps {
  /** Real `ExerciseRepositoryImpl` (or a fake in tests) — used only to look up each workout exercise's `Exercise` row (name, type, columns) for its card. */
  exerciseRepository: ExerciseRepository;
  /** Retro-log mode (02 §1) — see file header. Defaults `false` (the only entry point that exists today, "Start Empty Workout"). */
  retro?: boolean;
  /** Retro-log's chosen day (epoch ms); defaults to today at 12:00 local, matching 02 §1's "chosen date 12:00" when the future entry point doesn't override it. */
  retroStartTime?: number;
  testID?: string;
}

/** "Chosen date 12:00" (02 §1) fallback — today at noon local time. */
function defaultRetroStartTime(): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

export function ActiveWorkoutScreen({
  exerciseRepository,
  retro = false,
  retroStartTime,
  testID = 'active-workout',
}: ActiveWorkoutScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const workout = useActiveWorkoutStore(selectActiveWorkout);
  const loaded = useActiveWorkoutStore((state) => state.loaded);
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const previousValuesMode = useSettingsStore((state) => state.settings.previous_values_mode);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);

  // Resolved exactly once (see file header) — the single source of truth
  // both the stopwatch's initial freeze point and the mount effect's
  // `startEmpty` call read from, so they can never drift apart.
  const [retroStartTimeResolved] = useState<number | null>(() =>
    retro ? (retroStartTime ?? defaultRetroStartTime()) : null,
  );
  // Stable placeholder for `useWorkoutStopwatch`'s `startTime` prop during
  // the brief window before `workout` exists — never rendered (the `!workout`
  // branch below shows the loading state instead), so its exact value is
  // inert; captured once via a lazy initializer (not a bare `Date.now()`
  // call in the render body) to satisfy the React Compiler's purity rule
  // (impure calls aren't allowed directly in a component's render phase).
  const [mountTimeFallback] = useState(() => Date.now());

  const startRequested = useRef(false);
  useEffect(() => {
    if (!loaded || startRequested.current) {
      return;
    }
    // Latch immediately — this is a one-time go/no-go decision, not a
    // "did startEmpty actually run" flag (see file header).
    startRequested.current = true;
    if (workout) {
      // Resume path (02 §1) — a workout is already active, nothing to start.
      return;
    }
    const startTime = retro ? retroStartTimeResolved! : Date.now();
    void useActiveWorkoutStore.getState().startEmpty({
      title: autoTitleForDate(new Date(startTime)),
      startTime,
    });
  }, [loaded, workout, retro, retroStartTimeResolved]);

  const exerciseIds = useMemo(
    () => (workout ? Array.from(new Set(workout.exercises.map((e) => e.exerciseId))) : []),
    [workout],
  );
  const exercisesQuery = useQuery({
    queryKey: ['workout', 'active', 'exercise-lookup', exerciseIds.join(',')],
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

  const stopwatch = useWorkoutStopwatch({
    startTime: workout?.startTime ?? retroStartTimeResolved ?? mountTimeFallback,
    durationPauseOffsetMs: workout?.durationPauseOffsetMs ?? 0,
    initiallyPaused: retro,
  });

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [durationSheetVisible, setDurationSheetVisible] = useState(false);

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

  const handleMinimize = (): void => {
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
      void useActiveWorkoutStore.getState().updateMeta({ title: next });
    }
  };

  const handleFinishPress = (): void => {
    // Full finish flow (unchecked-sets alert, save sheet, records section)
    // is M2-14's job — this stub proves Finish is reachable/wired now
    // without building that flow here.
    Alert.alert('Finish Workout', 'The finish flow arrives in M2-14.');
  };

  const handleAddExercisePress = (): void => {
    // Exercise picker + card ⋯ operations are M2-09's job.
    Alert.alert('Add Exercise', 'The exercise picker arrives in M2-09.');
  };

  const handleSettingsPress = (): void => {
    // The workout-settings subset screen is M2-17's job.
    Alert.alert('Workout Settings', 'Workout settings arrive in M2-17.');
  };

  const handleDiscardPress = (): void => {
    Alert.alert('Discard workout?', 'All entered data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void useActiveWorkoutStore
            .getState()
            .discard()
            .then(() => router.back());
        },
      },
    ]);
  };

  const handleSaveStartTime = (nextStartTimeMs: number): void => {
    void useActiveWorkoutStore.getState().updateMeta({ startTime: nextStartTimeMs });
  };

  const handleSaveDuration = (totalSeconds: number): void => {
    if (!workout) {
      return;
    }
    // 06 §6.1: `now - start_time - pause_offset`; a manual duration override
    // solves for the `start_time` that makes that formula equal the typed
    // total, per `useWorkoutStopwatch`'s own file header.
    const nextStartTime = Date.now() - totalSeconds * 1000 - workout.durationPauseOffsetMs;
    void useActiveWorkoutStore.getState().updateMeta({ startTime: nextStartTime });
  };

  const handlePause = (): void => {
    stopwatch.pause();
  };

  const handleResume = (): void => {
    const nextOffset = stopwatch.resume();
    void useActiveWorkoutStore.getState().updateMeta({ durationPauseOffsetMs: nextOffset });
  };

  if (!workout) {
    return (
      <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
        <Text
          style={[
            typography.body,
            { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['8'] },
          ]}
        >
          Starting workout…
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
      {/* Header — chevron-down minimize, tappable inline-edit title, Finish accent pill (02 §2). */}
      <View style={[styles.header, { paddingHorizontal: spacing['4'], paddingTop: spacing['3'] }]}>
        <Pressable
          testID={`${testID}-minimize`}
          accessibilityRole="button"
          accessibilityLabel="Minimize"
          onPress={handleMinimize}
          hitSlop={8}
        >
          <ChevronDown size={24} strokeWidth={1.75} color={colors.text.primary} />
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
          testID={`${testID}-finish`}
          label="Finish"
          variant="primary"
          size="sm"
          onPress={handleFinishPress}
        />
      </View>

      {/* Meta row — Duration (live, accent), Volume, Sets (02 §2). */}
      <View
        style={[styles.metaRow, { paddingHorizontal: spacing['4'], paddingVertical: spacing['3'] }]}
      >
        <Pressable
          testID={`${testID}-duration`}
          onPress={() => setDurationSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Edit duration"
        >
          <StatColumn
            label="Duration"
            value={formatDuration(Math.floor(stopwatch.elapsedMs / 1000)) ?? '0:00'}
            valueColor={colors.accent.text}
          />
        </Pressable>
        <StatColumn
          testID={`${testID}-volume`}
          label="Volume"
          value={`${Math.round(displayVolume)} ${weightUnit}`}
        />
        <StatColumn testID={`${testID}-sets`} label="Sets" value={String(checkedSetsCount)} />
      </View>

      {/* Body — exercise cards, in workout order (02 §3; card chrome beyond the set table itself is M2-09's job). */}
      <ScrollView
        testID={`${testID}-body`}
        style={styles.body}
        contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}
      >
        {workout.exercises.map((workoutExercise) => {
          const exercise = exercisesQuery.data?.get(workoutExercise.exerciseId);
          if (!exercise) {
            return null;
          }
          return (
            <Card key={workoutExercise.id} testID={`${testID}-exercise-${workoutExercise.id}`}>
              <Text
                style={[
                  typography.headline,
                  { color: colors.accent.text, marginBottom: spacing['2'] },
                ]}
              >
                {exercise.name}
              </Text>
              <ExerciseSetTableSection
                testID={`${testID}-exercise-${workoutExercise.id}-table`}
                workoutExerciseId={workoutExercise.id}
                exercise={exercise}
                weightUnit={weightUnit}
                distanceUnit={distanceUnit}
                rpeEnabled={rpeEnabled}
                previousValuesMode={previousValuesMode}
                routineId={workout.routineId}
              />
            </Card>
          );
        })}
      </ScrollView>

      {/* Footer — + Add Exercise (primary, stub for M2-09), Settings (tonal, stub for M2-17), Discard Workout (destructive, confirm) (02 §2). */}
      <View style={[styles.footer, { padding: spacing['4'], gap: spacing['2'] }]}>
        <Button
          testID={`${testID}-add-exercise`}
          label="+ Add Exercise"
          variant="primary"
          size="lg"
          onPress={handleAddExercisePress}
        />
        <Button
          testID={`${testID}-settings`}
          label="Settings"
          variant="tonal"
          size="md"
          onPress={handleSettingsPress}
        />
        <Button
          testID={`${testID}-discard`}
          label="Discard Workout"
          variant="destructive"
          size="md"
          onPress={handleDiscardPress}
        />
      </View>

      <DurationEditSheet
        testID={`${testID}-duration-sheet`}
        visible={durationSheetVisible}
        onDismiss={() => setDurationSheetVisible(false)}
        startTime={workout.startTime}
        elapsedMs={stopwatch.elapsedMs}
        isPaused={stopwatch.isPaused}
        onSaveStartTime={handleSaveStartTime}
        onSaveDuration={handleSaveDuration}
        onPause={handlePause}
        onResume={handleResume}
      />
    </View>
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
