/**
 * `ExerciseSummaryTab` (M4-09, AD-5): composes `ExerciseChartsTab` and
 * `ExerciseRecordsTab` into a single scroll — the fullscreen exercise detail
 * summary shows the chart (with its own below-chart metric chip row), a
 * "RECORDS" section label, then the records content, all inside one
 * `ScrollView`. Neither child owns its own scroll container itself
 * (`ExerciseChartsTab`'s root is a plain `View`; `ExerciseRecordsTab`'s root
 * `View` has no `flex: 1`), so nesting them here does not create a
 * double-scroll situation.
 */
import React from 'react';
import { ScrollView, Text } from 'react-native';

import type { Exercise } from '@/data/exercises/types';
import type { ExerciseHistorySet } from '@/data/workouts/types';
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import type { RecordsSnapshot } from '@/domain/records';
import { useTheme } from '@/ui/theme-provider';

import { ExerciseChartsTab } from './ExerciseChartsTab';
import { ExerciseRecordsTab } from './ExerciseRecordsTab';

export interface ExerciseSummaryTabProps {
  historicalSets: readonly ExerciseHistorySet[];
  exercise: Pick<Exercise, 'exerciseType'>;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  warmupInStats: boolean;
  snapshot: RecordsSnapshot;
  testID?: string;
}

export function ExerciseSummaryTab({
  historicalSets,
  exercise,
  weightUnit,
  distanceUnit,
  warmupInStats,
  snapshot,
  testID = 'exercise-summary-tab',
}: ExerciseSummaryTabProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  return (
    <ScrollView testID={testID} contentContainerStyle={{ padding: spacing['4'] }}>
      <ExerciseChartsTab
        testID={`${testID}-chart`}
        historicalSets={historicalSets}
        exercise={exercise}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
        warmupInStats={warmupInStats}
      />
      <Text
        style={[
          typography.footnote,
          { color: colors.text.tertiary, marginTop: spacing['5'], marginBottom: spacing['2'] },
        ]}
      >
        RECORDS
      </Text>
      <ExerciseRecordsTab
        testID={`${testID}-records`}
        snapshot={snapshot}
        historicalSets={historicalSets}
        exerciseType={exercise.exerciseType}
        weightUnit={weightUnit}
      />
    </ScrollView>
  );
}
