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
 *
 * ## Routine-start mode (M3-05, 02 §1)
 *
 * `routineId` is the third (after resume and empty-start) mount-effect
 * branch: when set and no active workout exists on mount, the effect calls
 * `startFromRoutine(routineId)` instead of `startEmpty`. Mutually exclusive
 * with `retro` in practice (`RoutinesHubScreen`'s "Start Routine" never
 * passes `retro=1`) — this screen doesn't need to reject the combination
 * explicitly since the mount effect's `if (routineId) { ...; return; }`
 * branch always short-circuits before the retro/empty-start branch runs, so
 * a theoretical `retro=1&routineId=...` simply behaves as a plain
 * routine-start (no retro pause-at-0 stopwatch) — `startFromRoutine`'s own
 * repo signature has no `startTime` param to honor retro with anyway (02
 * §1 never describes a retro-routine variant; "Repeat Workout" from History,
 * a distinct future entry point, is the retro-shaped one). Same
 * `startRequested` single-latch discipline applies: the ref flips to `true`
 * on *every* branch (resume, routine-start, empty-start), never only one,
 * per the bug this header already documents above.
 *
 * `getRoutineFull` (an unbound `RoutineRepository.getFull`) is separate from
 * `routineId`-the-start-trigger — it's needed on *every* render of a
 * routine-started workout (including a resumed one, mount-effect branch
 * never re-runs) so each `ExerciseCard`/`ExerciseSetTableSection` can
 * resolve routine-target placeholders (02 §6/04 §2.3) via
 * `workout.routineId`, not just at the moment of starting.
 *
 * **Occurrence matching (review fix, no longer this screen's job):** the
 * original M3-05 landing computed each workout exercise's "which routine
 * occurrence do I match" here, live, from `workout.exercises`'s *current*
 * position order on every render — correct right after `startFromRoutine`
 * (positions mirror the routine 1:1) but silently wrong after
 * `reorderExercises` changed the workout's position order for a routine
 * with a duplicated exercise (the two instances' matched targets could swap).
 * That per-render computation is gone; each workout exercise now carries its
 * own fixed `routineOccurrenceIndex` (pinned once at creation time by
 * `WorkoutRepositoryImpl.startFromRoutine`, immune to later reordering) and
 * `ExerciseSetTableSection` reads it directly off the store — see that
 * file's header and `workout-repository.ts`'s `startFromRoutine` header for
 * the full writeup.
 *
 * ## Repeat-workout mode (M3-07, 02 §1)
 *
 * `repeatWorkoutId` is a fourth mount-effect branch, checked right after
 * `routineId` (routine-start always wins if a caller somehow set both —
 * never happens in practice, `HistoryDetailScreen`'s "Repeat Workout" only
 * ever sets `repeatWorkoutId`): when set and no active workout exists on
 * mount, calls `startFromWorkout(repeatWorkoutId)` instead of `startEmpty`/
 * `startFromRoutine`. Unlike the routine-start branch, this one needs no
 * `getRoutineFull`-style live-resolution prop — `WorkoutRepositoryImpl
 * .startFromWorkout` sets the new workout's `routineId` to `null`, which
 * makes `ExerciseSetTableSection`'s existing PREVIOUS lookup (any_workout
 * mode, since there's no routine to restrict to) resolve the source
 * workout's own achieved values automatically — see that repository
 * method's own header for the full "why no new plumbing" writeup. Same
 * `startRequested` single-latch discipline as every other branch.
 *
 * ## Update-routine prompt (M3-06, 02 §14 step 4 / §14.4, 04 §2.4)
 *
 * `handleSaveWorkout`'s own inline comment (below) has the full writeup —
 * summary here: once `finish()` succeeds, if the workout came from a
 * routine that still exists, `computeRoutineDiff` (`@/domain/routine-diff`)
 * decides whether anything material changed; if so, an `Alert.alert` offers
 * "Keep original" (no-op) / "Update routine" (calls the new
 * `updateRoutineFromWorkout` prop, `RoutineRepository.updateFromWorkout`
 * unbound — the exact same "unbound function prop" convention
 * `getRoutineFull` above already established) before either path continues
 * into the existing skip-timer/invalidate/navigate tail.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { RoutineFull } from '@/data/routines/types';
import type { FinishMeta } from '@/data/workouts/types';
import { autoTitleForDate } from '@/domain/auto-title';
import { computeRoutineDiff } from '@/domain/routine-diff';
import { resolveSupersetScrollTarget, supersetVisualsByExerciseId } from '@/domain/supersets';
import { formatDuration } from '@/domain/units';
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
import { KeyboardAccessoryBar } from '@/ui/KeyboardAccessoryBar';
import { Snackbar } from '@/ui/Snackbar';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { AddToSupersetSheet } from './AddToSupersetSheet';
import { DurationEditSheet } from './DurationEditSheet';
import { ExerciseCard } from './ExerciseCard';
import { ExercisePickerSheet, type ExercisePickerMode } from './ExercisePickerSheet';
import { KeepAwakeGate } from './KeepAwakeGate';
import { KEYBOARD_ACCESSORY_VIEW_ID, useKeyboardFocusStore } from './keyboardFocusStore';
import { PlateCalculatorSheet } from './PlateCalculatorSheet';
import { ReorderExercisesSheet } from './ReorderExercisesSheet';
import { useRestTimerStore } from './restTimerStore';
import { SaveWorkoutSheet } from './SaveWorkoutSheet';
import { RestTimerPermissionNotice, TimerPill } from './TimerPill';
import { selectActiveWorkout, useActiveWorkoutStore } from './activeWorkoutStore';
import { useLoggerVisibilityStore } from './loggerVisibilityStore';
import { useWorkoutStopwatch } from './useWorkoutStopwatch';

export interface ActiveWorkoutScreenProps {
  /** Real `ExerciseRepositoryImpl` (or a fake in tests) — used only to look up each workout exercise's `Exercise` row (name, type, columns) for its card. */
  exerciseRepository: ExerciseRepository;
  /** Retro-log mode (02 §1) — see file header. Defaults `false` (the only entry point that exists today, "Start Empty Workout"). */
  retro?: boolean;
  /** Retro-log's chosen day (epoch ms); defaults to today at 12:00 local, matching 02 §1's "chosen date 12:00" when the future entry point doesn't override it. */
  retroStartTime?: number;
  /** M3-05 (02 §1): when set and no active workout exists on mount, starts a workout from this routine instead of an empty one — see file header, "Routine-start mode". */
  routineId?: string;
  /** M3-07 ("Repeat Workout", 02 §1): when set and no active workout exists on mount, starts a workout from this past workout instead of an empty one — see file header, "Repeat-workout mode". Mutually exclusive with `routineId` in practice (`HistoryDetailScreen`'s "Repeat Workout" never sets both); the mount effect checks `routineId` first, so a theoretical combination would just behave as a routine-start. */
  repeatWorkoutId?: string;
  /** M3-05: `RoutineRepository.getFull`, unbound — threaded down to every `ExerciseCard`/`ExerciseSetTableSection` for routine-target resolution (see file header). Not only for the routine-start path — also needed to resolve targets on a *resumed* routine-started workout. */
  getRoutineFull?: (routineId: string) => Promise<RoutineFull | null>;
  /** M3-06 (02 §14 step 4 / 04 §2.4): `RoutineRepository.updateFromWorkout`, unbound — called from `handleSaveWorkout`'s finish flow when the user picks "Update routine" on the material-change prompt (see file header, "Update-routine prompt (M3-06)"). */
  updateRoutineFromWorkout?: (routineId: string, workoutId: string) => Promise<RoutineFull>;
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

/** M2-13: swipe-down-past-this-many-pt-on-release minimizes the logger — matches `Sheet.tsx`'s own `DRAG_DISMISS_THRESHOLD` (M0-07, 07 §8 consistency). */
const HEADER_SWIPE_MINIMIZE_THRESHOLD = 120;

export function ActiveWorkoutScreen({
  exerciseRepository,
  retro = false,
  retroStartTime,
  routineId,
  repeatWorkoutId,
  getRoutineFull,
  updateRoutineFromWorkout,
  testID = 'active-workout',
}: ActiveWorkoutScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const queryClient = useQueryClient();

  const workout = useActiveWorkoutStore(selectActiveWorkout);
  const loaded = useActiveWorkoutStore((state) => state.loaded);
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const previousValuesMode = useSettingsStore((state) => state.settings.previous_values_mode);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);
  const plateCalcEnabled = useSettingsStore((state) => state.settings.plate_calc.enabled);
  // M2-13 (06 §6.3): "`useKeepAwake()` mounted in the logger screen only,
  // gated by the setting" — read live (same "settings read at call time"
  // convention every other per-workout setting on this screen already uses)
  // so toggling it mid-workout (M2-17's future settings screen) takes effect
  // immediately, not just on next mount. See `KeepAwakeGate.tsx`'s own header
  // for how "gated" + "released on minimize" are both satisfied by
  // conditionally mounting that tiny wrapper component.
  const keepAwakeEnabled = useSettingsStore((state) => state.settings.keep_awake);

  // M2-08: the Calculator button in the shared `KeyboardAccessoryBar` shows
  // only "when a weight field is focused and plate calculator is enabled"
  // (02 §4) — the weight-focused half lives in `keyboardFocusStore`
  // (subscribed here so this screen re-renders when it flips), the setting
  // half is `plateCalcEnabled` above.
  const focusedIsWeight = useKeyboardFocusStore((state) => state.focusedIsWeight);

  // M2-13 (06 §3): `loggerVisibilityStore.visible` is what `GlobalWorkoutBar`
  // reads to decide "logger currently on screen or not" — tied directly to
  // this component's own React mount lifecycle (not to any individual
  // dismiss call site) so every way of leaving this screen (chevron tap,
  // swipe-down, `router.back()` from the Discard confirm, or any future
  // path) flips it back correctly for free, with nothing to remember to
  // wire at each call site. Runs before `workout` even loads (the `!workout`
  // loading branch below still counts as "the logger is on screen").
  useEffect(() => {
    useLoggerVisibilityStore.getState().setVisible(true);
    return () => useLoggerVisibilityStore.getState().setVisible(false);
  }, []);

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
    if (routineId) {
      // Routine-start path (M3-05, 02 §1) — see file header.
      void useActiveWorkoutStore.getState().startFromRoutine(routineId);
      return;
    }
    if (repeatWorkoutId) {
      // Repeat-workout path (M3-07, 02 §1) — see file header,
      // "Repeat-workout mode." Live stopwatch from now, same as a plain
      // empty/routine start — not the retro-paused-at-0 shape (02 §1 draws
      // "Repeat Workout" and "Log past workout" as two distinct entry
      // points; only the latter is retro).
      void useActiveWorkoutStore.getState().startFromWorkout(repeatWorkoutId);
      return;
    }
    const startTime = retro ? retroStartTimeResolved! : Date.now();
    void useActiveWorkoutStore.getState().startEmpty({
      title: autoTitleForDate(new Date(startTime)),
      startTime,
    });
  }, [loaded, workout, retro, retroStartTimeResolved, routineId, repeatWorkoutId]);

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
    // The actual "is this exercise grouped, which member's next" decision
    // is `domain/supersets.ts`'s `resolveSupersetScrollTarget` — fully
    // covered by that file's own domain-layer test suite; this handler is
    // just the RN glue (offset lookup + the imperative `scrollTo` call).
    const targetId = resolveSupersetScrollTarget(current.exercises, workoutExerciseId);
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

  // --- M2-14: finish flow (02 §14) ---
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);

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

  // M2-13 (02 §10): "swipe-down on the header also minimizes" — same effect
  // as the chevron button, recognized only on release past a deliberate
  // distance (mirrors `Sheet.tsx`'s own `Gesture.Pan()` + `runOnJS` shape,
  // M0-07, and reuses its exact `DRAG_DISMISS_THRESHOLD` value for a
  // consistent app-wide "how far is a deliberate swipe" feel, 07 §8) so an
  // incidental small drag on the header doesn't accidentally minimize. No
  // visual drag-follow transform is needed here — 02 §10 only asks for the
  // swipe to *trigger* minimize, not to visually track the finger the way a
  // bottom sheet does. Calls `router.back` directly (not the `handleMinimize`
  // closure above) since it's a stable reference — avoids the gesture object
  // needing to be rebuilt (or referencing a stale closure) every render.
  const headerSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .onEnd((e) => {
          if (e.translationY > HEADER_SWIPE_MINIMIZE_THRESHOLD) {
            runOnJS(router.back)();
          }
        }),
    [],
  );

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

  // M2-14 (02 §14 step 1): "Tap Finish. If any unchecked set rows exist ->
  // alert ... [Cancel / Finish anyway]." Step 5: "Empty finish (zero checked
  // sets) -> offer Discard instead of save" — checked here *first* (an
  // empty-start workout with zero exercises, or one where nothing was ever
  // checked, has zero checked sets regardless of how many unchecked rows
  // exist) so the two alerts never both fire for the same tap.
  const handleFinishPress = (): void => {
    if (!workout) {
      return;
    }
    const allSets = workout.exercises.flatMap((workoutExercise) => workoutExercise.sets);
    const uncheckedCount = allSets.filter((s) => !s.isCompleted).length;
    const checkedCount = allSets.length - uncheckedCount;

    if (checkedCount === 0) {
      Alert.alert(
        'Nothing to save',
        'No sets were completed. Discard this workout instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: performDiscard },
        ],
      );
      return;
    }

    if (uncheckedCount > 0) {
      Alert.alert(
        'Uncompleted sets',
        `${uncheckedCount} sets are not marked complete and will be discarded.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Finish anyway', onPress: () => setSaveSheetVisible(true) },
        ],
      );
      return;
    }

    setSaveSheetVisible(true);
  };

  // M2-14 (02 §14 step 3): repo `finish` (already-tested M2-01/store action)
  // -> cancel any pending rest-timer notification (mirrors `skip()`'s own
  // "cancel + clear" contract, `restTimerStore.ts` — safe/no-op if no timer
  // is running) -> Update-routine prompt (M3-06, 02 §14 step 4, see below)
  // -> invalidate the minimal-history list query (M2-14's own History tab)
  // -> close the sheet -> navigate to the new detail route. Both the
  // "Keep original" and "Update routine" prompt branches funnel back into
  // this same close+navigate tail via `finishSave` below — nothing about
  // that existing sequence is reordered or skipped by the prompt.
  //
  // M3-06 (02 §14.4 / 04 §2.4): only runs when the workout was started from
  // a routine (`finished.routineId`) and that routine still exists
  // (`getRoutineFull` resolves non-null — a deleted routine, 04 §2.2, is
  // silently skipped, matching "not re-asked" reasoning below). The diff
  // (`computeRoutineDiff`, `@/domain/routine-diff`) is pure and takes the
  // finished `WorkoutFull`/fetched `RoutineFull` shapes directly — both are
  // already structurally compatible with `FinishedWorkoutLike`/
  // `SourceRoutineLike` (same "Like"-interface convention every other
  // domain module here uses), no mapping needed. "Not re-asked for this
  // workout": this whole block runs at most once per `handleSaveWorkout`
  // call, itself only reachable once per finished workout — `finish()`
  // already flipped the store's `workout` to `null` by the time this code
  // runs (successfully or not), and a successful `finish()` immediately
  // navigates away below, so there is no retry path that could re-trigger
  // this prompt for the same workout id; no persisted "already asked" flag
  // is needed.
  const handleSaveWorkout = async (meta: FinishMeta): Promise<void> => {
    const finished = await useActiveWorkoutStore.getState().finish(meta);
    if (!finished) {
      // Store surfaced a DataError (rolled back, workout restored) — leave
      // the sheet open so the user can retry, matching every other
      // repo-failure posture on this screen (06 §9).
      return;
    }
    await useRestTimerStore.getState().skip();

    const finishSave = async (): Promise<void> => {
      // M4-02 (06 §4.4): central helper — invalidates `['records',
      // exerciseId]` for every exercise this workout touched, plus the
      // broad `['history']`/`['stats']`/`['calendar']` keys `finishSave`
      // used to invalidate by hand (still includes `['history']`, so the
      // existing "invalidates history" assertions keep passing unchanged).
      const exerciseIds = finished.exercises.map((exercise) => exercise.exerciseId);
      await invalidateAfterWorkoutMutation(queryClient, exerciseIds);
      setSaveSheetVisible(false);
      router.replace(`/history/${finished.id}` as never);
    };

    // The workout itself already finished successfully above (`finish()`
    // committed the transaction) — nothing in this best-effort "offer to
    // update the source routine" block may be allowed to strand the user on
    // a stale screen for an already-completed workout. Both repo calls below
    // (`getRoutineFull`, `updateRoutineFromWorkout`) are wrapped so any
    // failure (a transient driver error, or a routine deleted out from under
    // this exact window) degrades to silently skipping the prompt/write-back
    // for this run and still falling through to `finishSave()`, the same
    // "graceful degradation, never an unhandled rejection" posture
    // `restTimerStore.ts`'s own notification-scheduling failures use.
    const routineId = finished.routineId;
    if (routineId && getRoutineFull) {
      try {
        const routine = await getRoutineFull(routineId);
        if (routine) {
          const diff = computeRoutineDiff({ exercises: finished.exercises }, { exercises: routine.exercises });
          if (diff.material) {
            Alert.alert(
              'Update routine?',
              `Your workout differs from ${routine.title}.`,
              [
                { text: 'Keep original', style: 'cancel', onPress: () => void finishSave() },
                {
                  text: 'Update routine',
                  onPress: () => {
                    void (async () => {
                      try {
                        if (updateRoutineFromWorkout) {
                          await updateRoutineFromWorkout(routineId, finished.id);
                          await queryClient.invalidateQueries({ queryKey: ['routines'] });
                        }
                      } catch (error) {
                        captureError(error);
                      }
                      await finishSave();
                    })();
                  },
                },
              ],
            );
            return;
          }
        }
      } catch (error) {
        captureError(error);
      }
    }

    await finishSave();
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
    // Cancel a running rest timer belonging to any set inside the exercise
    // being removed — same "no stray scheduled notification for a set that
    // no longer exists" contract discard/finish already honor (M2-19 §3.3
    // found this exact gap for `ConnectedSetRow`'s own delete/remove
    // handlers; this is the sibling exercise-level call site). `cancelForSet`
    // is a no-op for every set id that isn't the currently-running timer's
    // own `setId`, so it's safe to call for every set here without first
    // reading the store's current timer.
    const removedExercise = useActiveWorkoutStore
      .getState()
      .workout?.exercises.find((exercise) => exercise.id === workoutExerciseId);
    for (const removedSet of removedExercise?.sets ?? []) {
      void useRestTimerStore.getState().cancelForSet(removedSet.id);
    }
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

  // Shared by the footer's own "Discard Workout" confirm and M2-14's
  // empty-finish "Discard" alert (02 §14 step 5) — both are already their
  // own single confirm dialog, so neither needs a second confirmation on
  // top of this.
  //
  // M2-19 exit-gate fix: also cancels any pending rest-timer notification,
  // mirroring `handleSaveWorkout`'s own "finish -> skip()" contract above.
  // Found during this pass's re-check of the notification-cancellation path
  // (08 §7's backgrounding drill / M2-14's own acceptance gate only ever
  // named "post-finish", but the same stray-notification risk applies
  // identically here): discarding a workout with a running rest timer
  // previously left that timer's notification scheduled — it would fire
  // later, referencing a set/exercise from a workout that no longer exists.
  // `restTimerStore.skip()` is a safe no-op when no timer is running.
  const performDiscard = (): void => {
    void useActiveWorkoutStore
      .getState()
      .discard()
      .then(async () => {
        await useRestTimerStore.getState().skip();
        router.back();
      });
  };

  const handleDiscardPress = (): void => {
    Alert.alert('Discard workout?', 'All entered data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: performDiscard,
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
      {/* Header — chevron-down minimize, tappable inline-edit title, Finish accent pill (02 §2). M2-13: also wrapped in `GestureDetector` so a swipe-down anywhere on this row minimizes too (02 §10) — `activeOffsetY(10)` keeps ordinary taps on the chevron/title/Finish button from being swallowed by the pan recognizer. */}
      <GestureDetector gesture={headerSwipeGesture}>
        <View
          testID={`${testID}-header`}
          style={[styles.header, { paddingHorizontal: spacing['4'], paddingTop: spacing['3'] }]}
        >
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
      </GestureDetector>

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
                getRoutineFull={getRoutineFull}
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

      <SaveWorkoutSheet
        testID={`${testID}-save-sheet`}
        visible={saveSheetVisible}
        onDismiss={() => setSaveSheetVisible(false)}
        workoutId={workout.id}
        initialTitle={workout.title}
        initialDescription={workout.description}
        startTime={workout.startTime}
        elapsedMs={stopwatch.elapsedMs}
        volumeLabel={`${Math.round(displayVolume)} ${weightUnit}`}
        setsCount={checkedSetsCount}
        onSave={(meta) => void handleSaveWorkout(meta)}
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

      {/* M2-13 (06 §6.3): conditionally mounted, not conditionally hooked — see `KeepAwakeGate.tsx`'s own header for why. Unmounting this screen (any minimize path) tears this down for free. */}
      {keepAwakeEnabled ? <KeepAwakeGate /> : null}

      {/* M2-11 (02 §7 / 07 §5): the logger's own inline rest-timer chrome — renders `null` internally whenever no timer is running. Mounted unconditionally (like `KeepAwakeGate` above) so unmounting this whole screen (any minimize path) tears its ticking/completion effects down for free. */}
      <TimerPill testID={`${testID}-timer-pill`} />

      {/* M2-11 (02 §16.9): one-time notification-permission-denied inline warning — independent of whether a timer is running right now (see that component's own header for why it isn't nested inside `TimerPill`). */}
      <RestTimerPermissionNotice testID={`${testID}-timer-permission-notice`} />
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
