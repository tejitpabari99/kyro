/**
 * `ExerciseHistoryTab` (M4-09, 03 §3): "reverse-chron list of every
 * performance: workout title + date, then that workout's set lines (`1 ·
 * 80kg × 8 @9`, warm-ups with `W` badge). Tap → the full workout detail.
 * Infinite scroll, 20 per page."
 *
 * `historicalSets` (already-fetched, chronological-ascending
 * `WorkoutRepository.exerciseHistory(exerciseId)` result, `ExerciseDetailScreen`
 * owns the query — one fetch shared by History/Charts/Records tabs) is
 * folded into one "performance" card per distinct `workoutId` here (a
 * performance keeps that workout's own set order; a duplicated-exercise
 * -in-one-workout edge case simply concatenates both occurrences' sets in
 * traversal order, same as `setsForExercise`'s own `setOrder` contract) —
 * then reversed for reverse-chron display.
 *
 * "20 per page" is client-side reveal, not a second SQL page: the whole
 * history for **one** exercise is already in memory (the same fetch Charts
 * needs for its own full-range aggregate), so "infinite scroll" is just
 * growing how much of the already-fetched, already-grouped array is
 * rendered — `FlashList`'s `onEndReached` bumps `visibleCount` by
 * {@link PAGE_SIZE} exactly like `HistoryListScreen.tsx`'s own page size,
 * without a redundant round trip for data already sitting in the query
 * cache.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';

import type { Exercise } from '@/data/exercises/types';
import type { ExerciseHistorySet } from '@/data/workouts/types';
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import { formatRelativeWorkoutDate } from '@/features/history/date-format';
import { Card } from '@/ui/Card';
import { SetTypeBadge } from '@/ui/SetTypeBadge';
import { useTheme } from '@/ui/theme-provider';

import { formatHistorySetLine } from './exercise-history-format';

const PAGE_SIZE = 20;

interface Performance {
  workoutId: string;
  workoutTitle: string;
  workoutStartTime: number;
  sets: ExerciseHistorySet[];
}

/** Groups the (already chronological-ascending) flat `sets` array into one entry per distinct `workoutId`, preserving each workout's own set order — then reverses to reverse-chron (most recent performance first), matching 03 §3's own ordering. */
function groupIntoPerformances(sets: readonly ExerciseHistorySet[]): Performance[] {
  const byWorkout = new Map<string, Performance>();
  for (const set of sets) {
    const existing = byWorkout.get(set.workoutId);
    if (existing) {
      existing.sets.push(set);
    } else {
      byWorkout.set(set.workoutId, {
        workoutId: set.workoutId,
        workoutTitle: set.workoutTitle,
        workoutStartTime: set.workoutStartTime,
        sets: [set],
      });
    }
  }
  return Array.from(byWorkout.values()).reverse();
}

export interface ExerciseHistoryTabProps {
  historicalSets: readonly ExerciseHistorySet[];
  exercise: Pick<Exercise, 'exerciseType' | 'usesCustomMetric'>;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  rpeEnabled: boolean;
  testID?: string;
}

/** Pairs each set with its 1-based working-set number (warm-ups get `null`, `SetTypeBadge`'s own "no number, shows a letter instead" convention) — computed as a plain pre-pass, not a mutable counter inside the render/JSX map (the `react-hooks/immutability` lint rule this codebase enforces flags reassigning a `let` from within a render-time callback). */
function withWorkingIndices(
  sets: readonly ExerciseHistorySet[],
): { set: ExerciseHistorySet; workingIndex: number | null }[] {
  let index = 0;
  return sets.map((set) => {
    const isWarmup = set.setType === 'warmup';
    if (!isWarmup) {
      index += 1;
    }
    return { set, workingIndex: isWarmup ? null : index };
  });
}

function PerformanceCard({
  item,
  exercise,
  units,
  onPress,
  testID,
}: {
  item: Performance;
  exercise: Pick<Exercise, 'exerciseType' | 'usesCustomMetric'>;
  units: { weightUnit: WeightUnit; distanceUnit: DistanceUnit; rpeEnabled: boolean };
  onPress: (workoutId: string) => void;
  testID: string;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const rows = useMemo(() => withWorkingIndices(item.sets), [item.sets]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={item.workoutTitle}
      onPress={() => onPress(item.workoutId)}
      style={{ marginHorizontal: spacing['4'], marginBottom: spacing['3'] }}
    >
      <Card>
        <Text style={[typography.title2, { color: colors.text.primary }]} numberOfLines={1}>
          {item.workoutTitle}
        </Text>
        <Text style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}>
          {formatRelativeWorkoutDate(item.workoutStartTime)}
        </Text>
        <View style={{ marginTop: spacing['2'], gap: spacing['1'] }}>
          {rows.map(({ set, workingIndex }) => {
            const isWarmup = set.setType === 'warmup';
            const valueLine = formatHistorySetLine(set, exercise, units);
            return (
              <View key={set.setId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
                <SetTypeBadge
                  kind={isWarmup ? 'warmup' : 'normal'}
                  workingIndex={workingIndex}
                  testID={`${testID}-set-${set.setId}-badge`}
                />
                <Text style={[typography.subhead, { color: colors.text.secondary }]}>{valueLine}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Pressable>
  );
}

export function ExerciseHistoryTab({
  historicalSets,
  exercise,
  weightUnit,
  distanceUnit,
  rpeEnabled,
  testID = 'exercise-history-tab',
}: ExerciseHistoryTabProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const performances = useMemo(() => groupIntoPerformances(historicalSets), [historicalSets]);
  const visible = useMemo(() => performances.slice(0, visibleCount), [performances, visibleCount]);
  const units = useMemo(
    () => ({ weightUnit, distanceUnit, rpeEnabled }),
    [weightUnit, distanceUnit, rpeEnabled],
  );

  const handlePress = (workoutId: string): void => {
    router.push(`/history/${workoutId}` as never);
  };

  return (
    <FlashList
      testID={testID}
      data={visible}
      keyExtractor={(item) => item.workoutId}
      renderItem={({ item }: { item: Performance }) => (
        <PerformanceCard
          testID={`${testID}-card-${item.workoutId}`}
          item={item}
          exercise={exercise}
          units={units}
          onPress={handlePress}
        />
      )}
      onEndReached={() => {
        if (visibleCount < performances.length) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, performances.length));
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        visibleCount < performances.length ? (
          <View style={{ paddingVertical: spacing['4'] }}>
            <ActivityIndicator color={colors.accent.primary} />
          </View>
        ) : null
      }
    />
  );
}
