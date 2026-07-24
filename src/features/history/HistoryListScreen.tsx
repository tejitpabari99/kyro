/**
 * `HistoryListScreen` (M2-14) — minimal saved-workout list (09 M2 scope:
 * "minimal history to verify saves" — the real History tab with
 * search/calendar/filters/CSV is M4). One row per completed workout:
 * title, formatted date, and volume.
 *
 * **Volume is genuinely computed, never a placeholder** (02 §14's own
 * acceptance gate: "saved workout appears in minimal history with correct
 * volume") — `WorkoutRepository.listCompleted()` returns lightweight
 * `WorkoutSummary` rows with no exercises/sets attached (`05` §4's own
 * query-performance note: "History pagination: `idx_workouts_start` +
 * per-workout hydrate ... that batched hydrate is a later History-screen
 * concern, M4; M2's minimal-history caller, M2-14, can hydrate on demand via
 * `getFull` per row it actually renders"), so this screen hydrates each row
 * via `getFull` + an `ExerciseRepository.get` lookup per distinct exercise
 * (needed because `domain/volume.ts`'s formula is exercise-type-dependent)
 * and reduces to the same `totalVolumeKg`/`isStatsEligibleSet` numbers the
 * logger's own meta row already trusts (`ActiveWorkoutScreen.tsx`, 02 §2) —
 * unchecked sets never survive `finish()` (M2-01) so this is automatically
 * "checked sets only," with no extra filtering needed here.
 *
 * This is an N+1 query per page (`getFull` + exercise lookups per summary
 * row) — acceptable for M2's bounded "minimal history" scope; M4's real
 * History screen replaces this with a precomputed/paged query (`06` §8's
 * History row in the performance table).
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { History } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import type { ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
import { formatVolumeDisplay, totalVolumeKg, type VolumeSetInput } from '@/domain/volume';
import { useSettingsStore } from '@/features/settings/settings-store';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { useTheme } from '@/ui/theme-provider';

import { formatWorkoutDate } from './date-format';

export interface HistoryListScreenProps {
  workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getFull'>;
  exerciseRepository: Pick<ExerciseRepository, 'get'>;
  testID?: string;
}

interface HistoryListItem {
  summary: WorkoutSummary;
  volumeKg: number;
}

async function hydrateVolume(
  summary: WorkoutSummary,
  workoutRepository: Pick<WorkoutRepository, 'getFull'>,
  exerciseRepository: Pick<ExerciseRepository, 'get'>,
  warmupInStats: boolean,
): Promise<HistoryListItem | null> {
  const full = await workoutRepository.getFull(summary.id);
  if (!full) {
    return null;
  }

  const exerciseIds = Array.from(new Set(full.exercises.map((e) => e.exerciseId)));
  const exercises = await Promise.all(exerciseIds.map((id) => exerciseRepository.get(id)));
  const typeById = new Map(
    exercises
      .filter((exercise): exercise is NonNullable<typeof exercise> => exercise != null)
      .map((exercise) => [exercise.id, exercise.exerciseType]),
  );

  const volumeInputs: VolumeSetInput[] = full.exercises.flatMap((workoutExercise) => {
    const exerciseType = typeById.get(workoutExercise.exerciseId);
    if (!exerciseType) {
      // Exercise since deleted/unavailable — excluded from this row's
      // volume rather than throwing; a genuinely orphaned reference should
      // never happen (custom-exercise delete is reference-blocked, 03 §5)
      // but this keeps the list resilient rather than crashing a row.
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

  return { summary, volumeKg: totalVolumeKg(volumeInputs, warmupInStats) };
}

export function HistoryListScreen({
  workoutRepository,
  exerciseRepository,
  testID = 'history-list',
}: HistoryListScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);

  const query = useQuery({
    queryKey: ['history', 'list'],
    queryFn: async (): Promise<HistoryListItem[]> => {
      const summaries = await workoutRepository.listCompleted({ limit: 50 });
      const items = await Promise.all(
        summaries.map((summary) =>
          hydrateVolume(summary, workoutRepository, exerciseRepository, warmupInStats),
        ),
      );
      return items.filter((item): item is HistoryListItem => item != null);
    },
  });

  const items = query.data ?? [];

  const handleRowPress = (id: string): void => {
    router.push(`/history/${id}` as never);
  };

  if (!query.isLoading && items.length === 0) {
    return (
      <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
        <EmptyState
          icon={<History size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="No workouts logged yet"
          caption="Finished workouts will show up here."
        />
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <ScrollView testID={`${testID}-scroll`}>
        {items.map((item, index) => (
          <ListRow
            key={item.summary.id}
            testID={`${testID}-row-${item.summary.id}`}
            title={item.summary.title}
            subtitle={`${formatWorkoutDate(item.summary.startTime)} · ${Math.round(
              formatVolumeDisplay(item.volumeKg, weightUnit),
            )} ${weightUnit}`}
            chevron
            hideSeparator={index === items.length - 1}
            onPress={() => handleRowPress(item.summary.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
