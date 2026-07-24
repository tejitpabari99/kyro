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
import { nextSupersetScrollTarget, supersetVisualsByExerciseId } from '@/domain/supersets';
import { formatDuration } from '@/domain/units';
import {
  formatVolumeDisplay,
  isStatsEligibleSet,
  totalVolumeKg,
  type VolumeSetInput,
} from '@/domain/volume';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { KeyboardAccessoryBar } from '@/ui/KeyboardAccessoryBar';
import { Snackbar } from '@/ui/Snackbar';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { AddToSupersetSheet } from './AddToSupersetSheet';
import { DurationEditSheet } from './DurationEditSheet';
import { ExerciseCard } from './ExerciseCard';
import { ExercisePickerSheet, type ExercisePickerMode } from './ExercisePickerSheet';
import { KEYBOARD_ACCESSORY_VIEW_ID, useKeyboardFocusStore } from './keyboardFocusStore';
import { PlateCalculatorSheet } from './PlateCalculatorSheet';
import { ReorderExercisesSheet } from './ReorderExercisesSheet';
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

/** M2-12: small top breathing room above a Smart-Superset-Scrolling target so its header isn't flush against the screen edge. */
const SUPERSET_SCROLL_TOP_PADDING = 12;

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
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);
  const plateCalcEnabled = useSettingsStore((state) => state.settings.plate_calc.enabled);

  // M2-08: the Calculator button in the shared `KeyboardAccessoryBar` shows
  // only "when a weight field is focused and plate calculator is enabled"
  // (02 §4) — the weight-focused half lives in `keyboardFocusStore`
  // (subscribed here so this screen re-renders when it flips), the setting
  // half is `plateCalcEnabled` above.
  const focusedIsWeight = useKeyboardFocusStore((state) => state.focusedIsWeight);

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

  // M2-12 (02 §8 / 07 §2.5): every grouped exercise's own label/color,
  // recomputed whenever the workout's exercise list changes identity —
  // `activeWorkoutStore`'s structural-sharing helpers (`withExercise`, see
  // that file's header) always hand back a *new* `exercises` array on any
  // exercise-level mutation (even ones unrelated to supersets), so this stays
  // cheap and correct without a narrower dependency to hand-maintain.
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

  // M2-12: Smart Superset Scrolling (02 §8, setting default-on,
  // `settings.smart_superset_scroll`) — `cardOffsetsRef` is populated by
  // each exercise card's own wrapping `onLayout` (below, in the render
  // body) with its y-offset *within the scroll content*, i.e. exactly what
  // `ScrollView.scrollTo({y})` expects; `scrollViewRef` is the imperative
  // handle that call goes through. Both are refs (not state) because
  // neither should ever trigger a re-render on their own — they're read
  // only reactively, from `handleSetChecked` below, in response to a real
  // user action (checking a set).
  const scrollViewRef = useRef<ScrollView>(null);
  const cardOffsetsRef = useRef<Record<string, number>>({});

  const handleCardLayout = (workoutExerciseId: string, y: number): void => {
    cardOffsetsRef.current[workoutExerciseId] = y;
  };

  // `ExerciseCard`'s own `onSetChecked` prop (bubbled from `ConnectedSetRow`
  // via `ExerciseSetTableSection`) fires unconditionally on every successful
  // check — this is the one place that turns "a set was checked" into "is
  // there anywhere to scroll." Reads `useActiveWorkoutStore.getState()`
  // rather than the `workout` selector value closed over by this render:
  // `setCompleted`'s own optimistic `set()` call has already applied by the
  // time `ConnectedSetRow`'s check handler calls `onChecked()` (same
  // same-tick-ordering guarantee that file's own header documents for
  // `updateSet`-then-`setCompleted`), so the store's *current* state already
  // reflects the just-checked set — reading the stale closed-over `workout`
  // here could evaluate "is this exercise's group now fully done" one check
  // behind.
  const handleSetChecked = (workoutExerciseId: string): void => {
    if (!useSettingsStore.getState().settings.smart_superset_scroll) {
      return;
    }
    const current = useActiveWorkoutStore.getState().workout;
    if (!current) {
      return;
    }
    const exercise = current.exercises.find((we) => we.id === workoutExerciseId);
    if (!exercise || exercise.supersetId == null) {
      return;
    }
    const members = current.exercises
      .filter((we) => we.supersetId === exercise.supersetId)
      .sort((a, b) => a.position - b.position);
    const memberIds = members.map((we) => we.id);
    const fullyCompletedIds = new Set(
      members
        .filter((we) => we.sets.length > 0 && we.sets.every((s) => s.isCompleted))
        .map((we) => we.id),
    );
    const targetId = nextSupersetScrollTarget(memberIds, fullyCompletedIds, workoutExerciseId);
    if (!targetId) {
      return;
    }
    const targetY = cardOffsetsRef.current[targetId];
    if (targetY == null) {
      return;
    }
    scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY - SUPERSET_SCROLL_TOP_PADDING), animated: true });
  };

  const stopwatch = useWorkoutStopwatch({
    startTime: workout?.startTime ?? retroStartTimeResolved ?? mountTimeFallback,
    durationPauseOffsetMs: workout?.durationPauseOffsetMs ?? 0,
    initiallyPaused: retro,
  });

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [durationSheetVisible, setDurationSheetVisible] = useState(false);

  // --- M2-09: exercise picker (add + replace share one sheet instance) ---
  const [addPickerVisible, setAddPickerVisible] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const pickerVisible = addPickerVisible || replaceTargetId != null;
  const pickerMode: ExercisePickerMode = replaceTargetId != null ? 'replace' : 'add';

  // --- M2-09: reorder sheet ---
  const [reorderVisible, setReorderVisible] = useState(false);

  // --- M2-09: add-to-superset sheet ---
  const [supersetTargetId, setSupersetTargetId] = useState<string | null>(null);

  // --- M2-09: remove-exercise pending state (id -> exercise name), each
  // entry drives its own `Snackbar` (5 s auto-dismiss finalizes the
  // removal; "Undo" clears the entry with nothing ever having touched the
  // store/DB — see `ExerciseCard`'s file header).
  //
  // Mirrored into a `ref` alongside the `useState` copy: `Snackbar`'s own
  // "Undo" path calls `onAction` (→ `handleUndoRemoval`) and `onDismiss`
  // (→ `handleFinalizeRemoval`) back-to-back, **synchronously, in the same
  // event** — React's `useState` setter does not apply a functional
  // updater's result synchronously (unlike Zustand's `set`, used everywhere
  // else in this file), so if `handleFinalizeRemoval` checked membership
  // against the `useState` value it would still see the *pre-Undo* snapshot
  // and finalize the removal anyway, right after the user just undid it.
  // The `ref` has no such delay — it is the single synchronous source of
  // truth every handler below reads and writes through
  // `updatePendingRemovals`; `pendingRemovals` (state) exists only to
  // trigger the re-render the `.map()` below needs. ---
  const pendingRemovalsRef = useRef<Record<string, string>>({});
  const [pendingRemovals, setPendingRemovals] = useState<Record<string, string>>({});
  const updatePendingRemovals = (
    updater: (current: Record<string, string>) => Record<string, string>,
  ): Record<string, string> => {
    const next = updater(pendingRemovalsRef.current);
    pendingRemovalsRef.current = next;
    setPendingRemovals(next);
    return next;
  };

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
    setAddPickerVisible(true);
  };

  const handleClosePicker = (): void => {
    setAddPickerVisible(false);
    setReplaceTargetId(null);
  };

  // 02 §3: "if the exercise has prior history, pre-create last session's row
  // count with previous values as placeholders; otherwise one empty normal
  // set" — `addExercises` (M2-02) already does that row-count seeding
  // internally per exercise, so this handler only needs to supply exercise
  // identity + this workout-local rest-timer default (02 §3: "Value
  // defaults from Settings → Default Rest Timer at the moment the exercise
  // is added"). The picker's Superset toggle groups every newly-added
  // exercise together under the lowest of their own new positions (02 §8 /
  // M2-12 stub, per this task's own scoping note).
  const handlePickerAdd = async (exerciseIds: string[], superset: boolean): Promise<void> => {
    const items = exerciseIds.map((exerciseId) => ({
      exerciseId,
      restSeconds: defaultRestSeconds,
    }));
    const added = await useActiveWorkoutStore.getState().addExercises(items);
    if (superset && added.length > 1) {
      const groupId = Math.min(...added.map((workoutExercise) => workoutExercise.position));
      await Promise.all(
        added.map((workoutExercise) =>
          useActiveWorkoutStore.getState().updateExercise(workoutExercise.id, { supersetId: groupId }),
        ),
      );
    }
  };

  const handlePickerReplace = (exerciseId: string): void => {
    if (!replaceTargetId) {
      return;
    }
    void useActiveWorkoutStore.getState().replaceExercise(replaceTargetId, exerciseId);
  };

  const handleReplacePress = (workoutExerciseId: string): void => {
    setAddPickerVisible(false);
    setReplaceTargetId(workoutExerciseId);
  };

  const handleReorderSave = (orderedIds: string[]): void => {
    void useActiveWorkoutStore.getState().reorderExercises(orderedIds);
  };

  const handleAddToSupersetPress = (workoutExerciseId: string): void => {
    setSupersetTargetId(workoutExerciseId);
  };

  // 02 §8: "confirm groups them under the lowest involved position" —
  // computed from the current, canonical `workout.exercises` positions of
  // every involved member (the card that opened the sheet + whatever was
  // checked in it), then applied via the same `updateExercise` action
  // M2-12's own eventual color/label assignment will keep using.
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
      void useActiveWorkoutStore.getState().updateExercise(member.id, { supersetId: groupId });
    }
    setSupersetTargetId(null);
  };

  const handleRemoveExercise = (workoutExerciseId: string, exerciseName: string): void => {
    updatePendingRemovals((current) => ({ ...current, [workoutExerciseId]: exerciseName }));
  };

  /** "Undo" — clears the pending-removal entry; nothing was ever written to the store/DB (`ExerciseCard`'s file header), so the card simply reappears with every value intact. */
  const handleUndoRemoval = (workoutExerciseId: string): void => {
    updatePendingRemovals((current) => {
      if (!(workoutExerciseId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[workoutExerciseId];
      return next;
    });
  };

  /**
   * The `Snackbar`'s 5 s auto-dismiss — finalizes the removal. Also the
   * `onDismiss` half of `Snackbar`'s own "Undo" path: its `handleAction`
   * calls `onAction` (→ `handleUndoRemoval`) then `onDismiss` (→ this)
   * **synchronously, back to back, in the same event** — so this reads
   * `pendingRemovalsRef.current` (always synchronously current) rather than
   * the `pendingRemovals` *state* value (which would still reflect the
   * pre-Undo snapshot at this point, React's `useState` setter not applying
   * a functional updater's result until the next render) — otherwise a tap
   * on "Undo" would still finalize the very removal it just undid.
   */
  const handleFinalizeRemoval = (workoutExerciseId: string): void => {
    if (!(workoutExerciseId in pendingRemovalsRef.current)) {
      return;
    }
    updatePendingRemovals((current) => {
      const next = { ...current };
      delete next[workoutExerciseId];
      return next;
    });
    void useActiveWorkoutStore.getState().removeExercise(workoutExerciseId);
  };

  // M2-15: the field id `keyboardFocusStore` reports focused *at the
  // moment Calculator is pressed* — captured into local state rather than
  // read live by the sheet, because the sheet's own editable target-weight
  // input will steal native focus the instant it renders, which would
  // otherwise clear `focusedFieldId` before "Use this value" ever gets a
  // chance to address the right field (see `keyboardFocusStore.ts`'s own
  // M2-15 header note and `PlateCalculatorSheet.tsx`'s). `null` both means
  // "sheet closed" and gates `visible` below.
  const [calculatorTargetFieldId, setCalculatorTargetFieldId] = useState<string | null>(null);

  const handleCalculatorPress = (): void => {
    const fieldId = useKeyboardFocusStore.getState().focusedFieldId;
    // `showCalculator` (below) only ever renders this button while a
    // weight field is genuinely focused, so `fieldId` is always non-null
    // here in practice — the guard is just defensive against a
    // theoretically-possible race, never reachable through the real UI.
    if (!fieldId) {
      return;
    }
    setCalculatorTargetFieldId(fieldId);
  };

  const handleCalculatorDismiss = (): void => {
    setCalculatorTargetFieldId(null);
  };

  const handleNextPress = (): void => {
    useKeyboardFocusStore.getState().focusNext();
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

      {/* Body — exercise cards, in workout order (02 §3). `keyboardShouldPersistTaps="handled"` (M2-08, 02 §4): tapping the ✓ check button (or anything else with its own `onPress`) while a set-table `NumericInput` is focused must commit and NOT dismiss the keyboard — RN's default `ScrollView` behavior ('never') swallows the very first tap outside the focused field purely to dismiss the keyboard, before it ever reaches a child `Pressable`; 'handled' lets any touchable that declares a responder (every `Pressable` in this tree does) receive the tap on the first press instead. */}
      <ScrollView
        testID={`${testID}-body`}
        ref={scrollViewRef}
        style={styles.body}
        contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}
        keyboardShouldPersistTaps="handled"
      >
        {workout.exercises.map((workoutExercise) => {
          if (workoutExercise.id in pendingRemovals) {
            // Hidden, not yet removed (see `handleRemoveExercise`'s file
            // header note) — nothing has touched the store/DB for this row.
            return null;
          }
          const exercise = exercisesQuery.data?.get(workoutExercise.exerciseId);
          if (!exercise) {
            return null;
          }
          return (
            // M2-12: this wrapper's only job is `onLayout` — its y-offset
            // (relative to the `ScrollView`'s own content, since it's a
            // direct content child) is exactly what `scrollTo({y})` needs
            // (`handleCardLayout`/`cardOffsetsRef` above), captured fresh on
            // every layout pass (set count changes, add/remove exercise,
            // etc. all reflow every card below them).
            <View
              key={workoutExercise.id}
              testID={`${testID}-exercise-${workoutExercise.id}-layout`}
              onLayout={(e) => handleCardLayout(workoutExercise.id, e.nativeEvent.layout.y)}
            >
              <ExerciseCard
                testID={`${testID}-exercise-${workoutExercise.id}`}
                workoutExerciseId={workoutExercise.id}
                exercisePosition={workoutExercise.position}
                exercise={exercise}
                exerciseRepository={exerciseRepository}
                notes={workoutExercise.notes}
                restSeconds={workoutExercise.restSeconds}
                supersetVisual={supersetVisuals.get(workoutExercise.id) ?? null}
                weightUnit={weightUnit}
                distanceUnit={distanceUnit}
                rpeEnabled={rpeEnabled}
                previousValuesMode={previousValuesMode}
                routineId={workout.routineId}
                onReorderPress={() => setReorderVisible(true)}
                onReplacePress={handleReplacePress}
                onAddToSupersetPress={handleAddToSupersetPress}
                onRemove={handleRemoveExercise}
                onSetChecked={() => handleSetChecked(workoutExercise.id)}
              />
            </View>
          );
        })}
      </ScrollView>

      {/* Remove-exercise Snackbars — one per pending removal (02 §3: "Remove Exercise ... Snackbar with Undo, 5 s"). */}
      {Object.entries(pendingRemovals).map(([workoutExerciseId, exerciseName]) => (
        <Snackbar
          key={workoutExerciseId}
          testID={`${testID}-remove-snackbar-${workoutExerciseId}`}
          visible
          message={`Removed "${exerciseName}"`}
          actionLabel="Undo"
          onAction={() => handleUndoRemoval(workoutExerciseId)}
          onDismiss={() => handleFinalizeRemoval(workoutExerciseId)}
          style={{ marginHorizontal: spacing['4'], marginBottom: spacing['2'] }}
        />
      ))}

      {/* Footer — + Add Exercise (primary), Settings (tonal, stub for M2-17), Discard Workout (destructive, confirm) (02 §2). */}
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

      <ExercisePickerSheet
        testID={`${testID}-exercise-picker`}
        visible={pickerVisible}
        onDismiss={handleClosePicker}
        repository={exerciseRepository}
        mode={pickerMode}
        onAdd={(exerciseIds, superset) => void handlePickerAdd(exerciseIds, superset)}
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

      {/* M2-08: one shared accessory bar for every set-table `NumericInput` in this screen (each passes `KEYBOARD_ACCESSORY_VIEW_ID` as its own `inputAccessoryViewID` — `ConnectedSetRow.tsx`). Calculator shows only when a weight field is focused (`focusedIsWeight`) and the plate-calculator setting is on (02 §4); `onCalculatorPress` captures the focused field id and opens `PlateCalculatorSheet` below (M2-15). */}
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
