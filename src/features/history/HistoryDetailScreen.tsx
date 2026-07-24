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
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { History } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import type { ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutRepository } from '@/data/workouts/types';
import type { SetType } from '@/domain/enums';
import { computeCurrentRowBuckets, type CurrentRowLike } from '@/domain/previous-values';
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
import { EmptyState } from '@/ui/EmptyState';
import { SetRow, type SetBadgeKind } from '@/ui/SetRow';
import { SetTable } from '@/ui/SetTable';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { formatWorkoutDate } from './date-format';

export interface HistoryDetailScreenProps {
  workoutRepository: Pick<WorkoutRepository, 'getFull'>;
  exerciseRepository: Pick<ExerciseRepository, 'get'>;
  workoutId: string;
  testID?: string;
}

function badgeKindFor(setType: SetType): SetBadgeKind {
  return setType;
}

export function HistoryDetailScreen({
  workoutRepository,
  exerciseRepository,
  workoutId,
  testID = 'history-detail',
}: HistoryDetailScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);

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

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <ScrollView contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}>
        <View>
          <Text style={[typography.title2, { color: colors.text.primary }]}>{workout.title}</Text>
          <Text style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}>
            {formatWorkoutDate(workout.startTime)}
          </Text>
          {workout.description ? (
            <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing['2'] }]}>
              {workout.description}
            </Text>
          ) : null}
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

          return (
            <View key={workoutExercise.id}>
              <Text
                style={[typography.headline, { color: colors.accent.text, marginBottom: spacing['2'] }]}
              >
                {exercise.name}
              </Text>
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
                    />
                  );
                })}
              </SetTable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
