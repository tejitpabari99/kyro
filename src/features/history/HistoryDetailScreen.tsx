/**
 * `HistoryDetailScreen` (M2-14) — read-only workout detail: title, date,
 * stats row (Duration · Volume · Sets), and each exercise's set table
 * rendered via `ui/SetRow`'s `readOnly` mode (07 §5 / this task's own "How":
 * "read-only detail reusing SetTable in read-only mode"). Every set shown
 * here already has `is_completed = 1` — `finish()` (M2-01) deletes every
 * unchecked row at save time — so 02 §14's "unchecked sets are absent from
 * ... history" acceptance criterion is satisfied purely by reusing the
 * repository's own already-tested finish invariant; no filtering happens
 * in this screen.
 *
 * Deliberately does **not** reuse `ConnectedSetRow`/`ExerciseSetTableSection`
 * (both wired to the *active* `activeWorkoutStore`, per this task's own
 * scoping note — "build a new lightweight connector/mapping that reads
 * directly from the already-hydrated static `WorkoutFull`
 * /`WorkoutExerciseFull`"). PREVIOUS is always rendered `—` here — a
 * finished workout has no "current session in progress" for PREVIOUS to be
 * relative to, and the task's own read-only `SetRow` contract already
 * skips PREVIOUS-tap autofill entirely in this mode.
 *
 * ## M3-07 additions — ⋯ menu (Save as Routine / Repeat Workout), routine
 * name / "(deleted routine)" (02 §1/§15, 04 §2.2, 05 §3.3)
 *
 * M2-14's own header called this screen's ⋯ menu "minimal" (the full
 * Edit-Workout/Export-CSV/Delete version is M4-04's scope, per that task's
 * own text in `docs/plan/tasks/M4-tasks.md`) — this task adds the two
 * entry points 02 §15/04 §2.2 name for the *history* side specifically:
 *
 * - **Save as Routine** — `routineRepository.createFromWorkout(workoutId)`
 *   (already built + tested by M3-01), then navigates to
 *   `/routine/{newRoutineId}/edit` so the user can confirm/rename before
 *   it's "really" saved (M3-04's routine editor, reused rather than
 *   building a second confirm UI).
 * - **Repeat Workout** — same one-active-workout Resume/Discard-and-start
 *   gate every other start entry point uses (`RoutinesHubScreen.tsx`'s
 *   `handleStartRoutine`/`handleStartEmptyPress`, copied verbatim here
 *   rather than factored into a shared hook — this repo's existing
 *   convention is each screen owns its own copy, see that file's own
 *   header), then `router.push('/workout/active?repeatWorkoutId=...')` —
 *   `ActiveWorkoutScreen`'s new M3-07 mount-effect branch
 *   (`WorkoutRepositoryImpl.startFromWorkout`) does the rest.
 *
 * Reuses `RoutineActionsSheet` (`src/features/routines/RoutineActionsSheet.tsx`)
 * for the ⋯ menu itself — that component's own header already frames it as
 * "one small generic list-of-actions component rather than two near-
 * duplicate sheets" (M3-02, originally for the folder/routine menus); this
 * is a third, cross-feature reuse of the exact same generic shape rather
 * than a new near-identical sheet.
 *
 * **Routine name / "(deleted routine)":** `workout.routineId` (set only for
 * a routine-started workout, never for "Repeat Workout" — see
 * `workout-repository.ts`'s M3-07 header) is resolved via
 * `routineRepository.get(routineId)`; a subtitle line shows "From
 * {routine.title}" when it resolves, or "(deleted routine)" (04 §2.2/05
 * §3.3's exact display string — `RoutineRepository.delete`'s own doc
 * comment names this literal text) when it resolves to `null` — proving
 * 05 §3.3's soft-reference invariant (deleting a routine never touches past
 * workouts) actually renders correctly, not just that `routine_id` survives
 * at the DB layer (already covered by M3-01's own repo-level test).
 *
 * ## M4-04 additions — trophy badges, notes, Edit Workout, Delete (04 §3.1/§5.4; 02 §15; 07 §6)
 *
 * This task upgrades M2-14's "minimal" ⋯ menu (its own header explicitly
 * deferred "the full Edit-Workout/Export-CSV/Delete version" to this task's
 * own text in `docs/plan/tasks/M4-tasks.md`) to the full spec:
 *
 * - **Trophy badges** — for each distinct exercise this workout touches,
 *   `getRecordsService().getSnapshot(exerciseId).awards` (the exact same
 *   `RecordsService`/`domain/records.ts` engine `HistoryWorkoutCard`'s "🏆 N
 *   PRs" count and the live PR banner already read, 04 §5.4's own "verified
 *   against the same engine" acceptance line) gives every (set, record-type)
 *   award ever earned for that exercise; filtering to `award.workoutId ===
 *   workoutId && award.setId === set.id` per row is this workout's own
 *   per-set trophy list. A non-empty list is joined into one already-
 *   formatted display string (`formatRecordTypeLabel`/`formatRecordAwardValue`
 *   /`recordAwardValue`, all reused unchanged from `features/workout/
 *   records-provider.ts` — the exact same formatters the Save sheet's
 *   "Records earned" rows and the live PR banner already use, so a set's
 *   trophy label reads identically everywhere it appears) and handed to
 *   `SetRow`'s new `trophyLabel`/`onTrophyPress` props (see that file's own
 *   "Trophy badge" header section) — tapping the glyph shows the label via
 *   `Alert.alert` (this task's "record-type label on tap").
 * - **Notes** — `workoutExercise.notes`, rendered read-only via the same
 *   `NoteText` component `ExerciseCard.tsx`'s live logger card uses (URLs
 *   stay tappable; no edit affordance here, this screen is read-only).
 * - **Edit Workout** — navigates to `/workout/${workoutId}/edit`, the M4-05
 *   edit-modal route (built in parallel, on a different branch, not yet
 *   present on this one — same "wire the intended route now, the screen
 *   lands later" seam `HistoryListScreen.tsx`'s M4-06 Calendar button and
 *   M1-07's `ExerciseBrowseScreen.tsx` already established for a not-yet-
 *   built sibling task's route).
 * - **Export CSV (single workout)** — 04 §3.1 names it, but M4-04's own task
 *   text is explicit: "arrives M5-06 — hide until then." Deliberately
 *   omitted from the ⋯ menu entirely (no feature flag needed — the item
 *   simply doesn't exist yet, exactly like `HistoryListScreen.tsx`'s Export
 *   entry point doesn't exist until M5-06 lands there either).
 * - **Delete** — confirm (`Alert.alert`, same "Delete {noun}?" / "Delete
 *   \"{title}\"? This can't be undone." copy `RoutinesHubScreen.tsx`'s own
 *   `handleDeleteRoutinePress` already established) → `workoutRepository
 *   .softDelete(workoutId)` (already built, M2/M3 — `05` §3.2's soft-delete
 *   convention) → `invalidateAfterWorkoutMutation(queryClient,
 *   exerciseIds)` (the same central M4-02 helper `ActiveWorkoutScreen.tsx`'s
 *   finish flow already calls — invalidates `['records', exerciseId]` per
 *   affected exercise plus the broad `['history']`/`['stats']`/`['calendar']`
 *   prefixes every list/calendar/records surface reads through, satisfying
 *   02 §15's "PRs/stats/streaks recompute" and 04 §3's "deleting a workout
 *   updates list/calendar/streak immediately") → `router.back()` (this
 *   screen no longer has anything to show once its own workout is gone).
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ellipsis, History } from 'lucide-react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ExerciseRepository } from '@/data/exercises/types';
import type { RoutineRepository } from '@/data/routines/types';
import type { WorkoutRepository } from '@/data/workouts/types';
import type { SetType, WeightUnit } from '@/domain/enums';
import { computeCurrentRowBuckets, type CurrentRowLike } from '@/domain/previous-values';
import { recordAwardValue, type HistoricalSet, type RecordAward } from '@/domain/records';
import { formatCellValue } from '@/domain/set-cell-values';
import { columnsForExerciseType } from '@/domain/set-table-columns';
import { formatDuration } from '@/domain/units';
import {
  formatVolumeDisplay,
  isStatsEligibleSet,
  totalVolumeKg,
  type VolumeSetInput,
} from '@/domain/volume';
import { useSettingsStore } from '@/features/settings/settings-store';
import { getRecordsService, invalidateAfterWorkoutMutation } from '@/features/stats/records-service';
import { selectActiveWorkout, useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { NoteText } from '@/features/workout/NoteText';
import { formatRecordAwardValue, formatRecordTypeLabel } from '@/features/workout/records-provider';
import { useRestTimerStore } from '@/features/workout/restTimerStore';
import { RoutineActionsSheet } from '@/features/routines/RoutineActionsSheet';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { SetRow, type SetBadgeKind } from '@/ui/SetRow';
import { SetTable } from '@/ui/SetTable';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { formatWorkoutDate } from './date-format';

export interface HistoryDetailScreenProps {
  /** M4-04: `softDelete` for the ⋯ menu's Delete item. */
  workoutRepository: Pick<WorkoutRepository, 'getFull' | 'softDelete'>;
  exerciseRepository: Pick<ExerciseRepository, 'get'>;
  /** M3-07: `createFromWorkout` for "Save as Routine," `get` to resolve the routine-name/"(deleted routine)" subtitle. */
  routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'>;
  workoutId: string;
  testID?: string;
}

/** One exercise's own full-history awards list, keyed by `exerciseId` — the M4-04 per-set trophy source, mirroring `history-list-model.ts`'s identically-shaped `awardsByExerciseId` map (M4-03's own precedent for folding `RecordsService` output into a screen). */
type AwardsByExerciseId = ReadonlyMap<string, readonly RecordAward[]>;

/** This workout's own (set, record-type) awards for one set, already-formatted for `SetRow`'s `trophyLabel` prop (`src/ui/**` may not import `domain/records.ts` itself, 06 §2) — `null` when the set holds no trophy. Multiple awards on one set join with a newline (`Alert.alert`'s message renders multi-line fine), matching `records-provider.ts`'s own `formatPRBannerMessage` precedent for "combine into one" without duplicating its banner-specific "PR — " phrasing here (this is a read-only historical label, not a live-beaten-record announcement). */
function trophyLabelForSet(
  setAwards: readonly RecordAward[],
  historicalSet: HistoricalSet,
  weightUnit: WeightUnit,
): string | null {
  if (setAwards.length === 0) {
    return null;
  }
  return setAwards
    .map(
      (award) =>
        `${formatRecordTypeLabel(award)} — ${formatRecordAwardValue(award, recordAwardValue(historicalSet, award), weightUnit)}`,
    )
    .join('\n');
}

function badgeKindFor(setType: SetType): SetBadgeKind {
  return setType;
}

export function HistoryDetailScreen({
  workoutRepository,
  exerciseRepository,
  routineRepository,
  workoutId,
  testID = 'history-detail',
}: HistoryDetailScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const activeWorkout = useActiveWorkoutStore(selectActiveWorkout);

  const workoutQuery = useQuery({
    queryKey: ['history', 'detail', workoutId],
    queryFn: () => workoutRepository.getFull(workoutId),
  });
  const workout = workoutQuery.data;

  const exerciseIds = React.useMemo(
    () => (workout ? Array.from(new Set(workout.exercises.map((e) => e.exerciseId))) : []),
    [workout],
  );
  const exercisesQuery = useQuery({
    queryKey: ['history', 'detail-exercises', exerciseIds.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(exerciseIds.map((id) => exerciseRepository.get(id)));
      const map = new Map<string, NonNullable<(typeof entries)[number]>>();
      for (const entry of entries) {
        if (entry) {
          map.set(entry.id, entry);
        }
      }
      return map;
    },
    enabled: exerciseIds.length > 0,
  });

  // M3-07 (04 §2.2/05 §3.3): "From {routine.title}" once resolved, or
  // "(deleted routine)" once `routineRepository.get` resolves `null` for a
  // non-null `workout.routineId` — proves the soft-reference invariant
  // actually renders, not just survives at the DB layer (M3-01's own repo
  // test already covers the latter).
  const routineId = workout?.routineId ?? null;
  const routineQuery = useQuery({
    queryKey: ['history', 'detail-routine', routineId],
    queryFn: () => routineRepository.get(routineId!),
    enabled: routineId != null,
  });

  // M4-04 (04 §5.4, 07 §6): one `RecordsService.getSnapshot(exerciseId).awards`
  // read per distinct exercise this workout touches — the same per-page
  // "distinct exercise -> awards" shape `HistoryListScreen.tsx`'s own
  // `fetchHistoryPage` already established for its "🏆 N PRs" count, reused
  // here at the single-workout scope for per-set trophy badges instead of a
  // per-workout count.
  const awardsQuery = useQuery({
    queryKey: ['history', 'detail-awards', exerciseIds.join(',')],
    queryFn: async (): Promise<AwardsByExerciseId> => {
      const entries = await Promise.all(
        exerciseIds.map(async (id): Promise<[string, readonly RecordAward[]]> => [
          id,
          (await getRecordsService().getSnapshot(id)).awards,
        ]),
      );
      return new Map(entries);
    },
    enabled: exerciseIds.length > 0,
  });

  const queryClient = useQueryClient();

  // -- ⋯ menu (02 §15/04 §2.2/§3.1) — Edit Workout / Repeat Workout / Save as Routine / Delete --
  const [menuVisible, setMenuVisible] = useState(false);

  const reportError = (message: string): void => {
    Alert.alert('Something went wrong', message);
  };

  // M4-04 — wires to the M4-05 edit route (`app/workout/[id]/edit.tsx`,
  // built in parallel on a different branch, not present on this one yet —
  // see file header). Nothing else here depends on that route existing.
  const handleEditWorkout = (): void => {
    setMenuVisible(false);
    router.push(`/workout/${workoutId}/edit` as never);
  };

  // M4-04 (02 §15): confirm -> soft delete -> recompute. `exerciseIds` (this
  // workout's own distinct exercise ids, already computed above for
  // `exercisesQuery`/`awardsQuery`) is exactly the set `invalidateAfterWorkoutMutation`
  // needs to invalidate every affected `['records', exerciseId]` cache plus
  // the broad `['history']`/`['stats']`/`['calendar']` prefixes (mirrors
  // `ActiveWorkoutScreen.tsx`'s own finish-flow call to the same helper).
  const performDelete = (): void => {
    workoutRepository
      .softDelete(workoutId)
      .then(() => invalidateAfterWorkoutMutation(queryClient, exerciseIds))
      .then(() => {
        router.back();
      })
      .catch(() => reportError('This workout could not be deleted. Please try again.'));
  };

  const handleDeletePress = (): void => {
    setMenuVisible(false);
    Alert.alert('Delete Workout?', `Delete "${workout?.title ?? 'this workout'}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const handleSaveAsRoutine = (): void => {
    setMenuVisible(false);
    routineRepository
      .createFromWorkout(workoutId)
      .then((routine) => {
        router.push(`/routine/${routine.id}/edit` as never);
      })
      .catch(() => reportError('This workout could not be saved as a routine. Please try again.'));
  };

  // Same one-active-workout Resume/Discard-and-start-new gate every other
  // start entry point implements (`RoutinesHubScreen.tsx`'s
  // `handleStartRoutine`/`confirmDiscardAndStartNew`, copied verbatim here
  // — see this file's own header for why this isn't factored into a shared
  // hook).
  const navigateToRepeat = (): void => {
    router.push(`/workout/active?repeatWorkoutId=${workoutId}` as never);
  };

  const confirmDiscardAndRepeat = (): void => {
    Alert.alert('Discard workout?', 'All entered data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void useActiveWorkoutStore
            .getState()
            .discard()
            .then(async () => {
              await useRestTimerStore.getState().skip();
              navigateToRepeat();
            });
        },
      },
    ]);
  };

  const handleRepeatWorkout = (): void => {
    setMenuVisible(false);
    if (!activeWorkout) {
      navigateToRepeat();
      return;
    }
    Alert.alert('Workout in Progress', `"${activeWorkout.title}" is still active.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resume', onPress: () => router.push('/workout/active' as never) },
      { text: 'Discard & Start New', style: 'destructive', onPress: confirmDiscardAndRepeat },
    ]);
  };

  if (!workoutQuery.isLoading && !workout) {
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

  if (!workout) {
    return (
      <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['8'] }]}>
          Loading…
        </Text>
      </View>
    );
  }

  const units = { weightUnit, distanceUnit };

  const volumeInputs: VolumeSetInput[] = workout.exercises.flatMap((workoutExercise) => {
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
  const volumeKg = totalVolumeKg(volumeInputs, warmupInStats);
  const displayVolume = formatVolumeDisplay(volumeKg, weightUnit);
  const setsCount = workout.exercises.reduce(
    (sum, workoutExercise) =>
      sum + workoutExercise.sets.filter((s) => isStatsEligibleSet(s, warmupInStats)).length,
    0,
  );
  const durationSeconds = workout.endTime
    ? Math.max(0, Math.floor((workout.endTime - workout.startTime - workout.durationPauseOffsetMs) / 1000))
    : 0;

  // "From {title}" once resolved, "(deleted routine)" once `routineId` is
  // set but `get` resolved `null` — `null` (nothing rendered) for a
  // routineless workout (empty-start or Repeat Workout, whose new workout
  // always has `routineId: null`, `workout-repository.ts`'s M3-07 header).
  const routineSubtitle =
    routineId == null
      ? null
      : routineQuery.data
        ? `From ${routineQuery.data.title}`
        : !routineQuery.isLoading
          ? '(deleted routine)'
          : null;

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing['4'],
          // BUGFIX-01: `insets.top` clears the status bar/notch — see
          // `app/_layout.tsx`'s header.
          paddingTop: insets.top + spacing['4'],
          gap: spacing['4'],
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.title2, { color: colors.text.primary }]}>{workout.title}</Text>
            <Text style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}>
              {formatWorkoutDate(workout.startTime)}
            </Text>
            {routineSubtitle ? (
              <Text
                testID={`${testID}-routine-subtitle`}
                style={[typography.footnote, { color: colors.text.tertiary, marginTop: spacing['1'] }]}
              >
                {routineSubtitle}
              </Text>
            ) : null}
            {workout.description ? (
              <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing['2'] }]}>
                {workout.description}
              </Text>
            ) : null}
          </View>
          <Pressable
            testID={`${testID}-menu-button`}
            accessibilityRole="button"
            accessibilityLabel="Workout actions"
            hitSlop={8}
            onPress={() => setMenuVisible(true)}
          >
            <Ellipsis size={22} strokeWidth={1.75} color={colors.text.primary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <StatColumn
            testID={`${testID}-stat-duration`}
            label="Duration"
            value={formatDuration(durationSeconds) ?? '0:00'}
          />
          <StatColumn
            testID={`${testID}-stat-volume`}
            label="Volume"
            value={`${Math.round(displayVolume)} ${weightUnit}`}
          />
          <StatColumn testID={`${testID}-stat-sets`} label="Sets" value={String(setsCount)} />
        </View>

        {workout.exercises.map((workoutExercise) => {
          const exercise = exercisesQuery.data?.get(workoutExercise.exerciseId);
          if (!exercise) {
            return null;
          }
          const columns = columnsForExerciseType(exercise.exerciseType, {
            usesCustomMetric: exercise.usesCustomMetric,
            rpeEnabled,
            weightUnit,
            distanceUnit,
          });
          const currentRows: CurrentRowLike[] = workoutExercise.sets.map((s) => ({
            id: s.id,
            setType: s.setType,
          }));
          const buckets = computeCurrentRowBuckets(currentRows);
          // M4-04 (04 §5.4): this exercise's own full-history awards, scoped
          // down to this workout's own sets per-row below — `undefined`
          // (awardsQuery not yet resolved, or this exercise genuinely has no
          // history) reads as "no trophies," never a loading-state crash.
          const exerciseAwards = awardsQuery.data?.get(workoutExercise.exerciseId) ?? [];

          return (
            <Card key={workoutExercise.id} testID={`${testID}-exercise-${workoutExercise.id}`}>
              <Text
                style={[typography.headline, { color: colors.accent.text, marginBottom: spacing['1'] }]}
              >
                {exercise.name}
              </Text>
              {workoutExercise.notes ? (
                <NoteText
                  testID={`${testID}-notes-${workoutExercise.id}`}
                  text={workoutExercise.notes}
                  style={{ marginBottom: spacing['2'] }}
                />
              ) : null}
              <SetTable testID={`${testID}-table-${workoutExercise.id}`} columns={columns}>
                {workoutExercise.sets.map((set, index) => {
                  const bucket = buckets[index]!;
                  const values: Record<string, string> = {};
                  for (const column of columns) {
                    const canonical =
                      column.key === 'weight'
                        ? set.weightKg
                        : column.key === 'reps'
                          ? set.reps
                          : column.key === 'distance'
                            ? set.distanceMeters
                            : column.key === 'duration'
                              ? set.durationSeconds
                              : column.key === 'custom'
                                ? set.customMetric
                                : set.rpe;
                    values[column.key] = formatCellValue(column.kind, canonical, units);
                  }

                  // M4-04 (04 §5.4/§5.2): this exact set's own trophy label,
                  // if any — filters the exercise's full-history awards down
                  // to (this workout, this set), formats via the same
                  // `records-provider.ts` helpers the Save sheet/live banner
                  // already use (see file header/`trophyLabelForSet`).
                  const historicalSet: HistoricalSet = {
                    setId: set.id,
                    workoutId,
                    workoutStartTime: workout.startTime,
                    setOrder: set.position,
                    exerciseType: exercise.exerciseType,
                    setType: set.setType,
                    isCompleted: set.isCompleted,
                    weightKg: set.weightKg,
                    reps: set.reps,
                    durationSeconds: set.durationSeconds,
                  };
                  const setAwards = exerciseAwards.filter(
                    (award) => award.workoutId === workoutId && award.setId === set.id,
                  );
                  const trophyLabel = trophyLabelForSet(setAwards, historicalSet, weightUnit);

                  return (
                    <SetRow
                      key={set.id}
                      testID={`${testID}-set-${set.id}`}
                      readOnly
                      columns={columns}
                      badgeKind={badgeKindFor(set.setType)}
                      workingIndex={bucket.isWarmup ? null : bucket.bucketIndex + 1}
                      values={values}
                      placeholders={{}}
                      previousLabel={null}
                      isCompleted={set.isCompleted}
                      trophyLabel={trophyLabel}
                      onTrophyPress={
                        trophyLabel ? () => Alert.alert('Personal Record', trophyLabel) : undefined
                      }
                    />
                  );
                })}
              </SetTable>
            </Card>
          );
        })}
      </ScrollView>

      <RoutineActionsSheet
        testID={`${testID}-actions-sheet`}
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        items={[
          { key: 'edit-workout', label: 'Edit Workout', onPress: handleEditWorkout },
          { key: 'repeat-workout', label: 'Repeat Workout', onPress: handleRepeatWorkout },
          { key: 'save-as-routine', label: 'Save as Routine', onPress: handleSaveAsRoutine },
          { key: 'delete', label: 'Delete', destructive: true, onPress: handleDeletePress },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
