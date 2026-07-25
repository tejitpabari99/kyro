/**
 * `MuscleDistributionBars` (M4-08, 04 §4.1 item 3) — the "Muscle
 * distribution" card's own horizontal bar breakdown. None of the M4-07
 * chart wrappers (`src/ui/charts/*`) support a horizontal orientation
 * (`LineChart`/`BarChart`/`StackedBarChart` are all vertical-axis
 * `CartesianChart` wraps, `Sparkline` is axis-less) — a labeled horizontal
 * bar list is plain `View`/`Text` proportional-width rows instead of a
 * `victory-native` plot, deliberately kept out of `src/ui/charts/` since
 * it isn't a `victory-native` wrapper at all (mirrors `ChartEmptyState`'s
 * own "doesn't need a canvas" reasoning, one level up).
 *
 * Row order is whatever `entries` is already sorted in — this component
 * doesn't re-sort (`domain/stats-buckets.ts`'s `computeMuscleDistribution`
 * already returns descending-by-weight, the natural top-to-bottom read
 * order for a distribution bar list).
 */
import React from 'react';
import { Text, View } from 'react-native';

import { MUSCLE_GROUP_LABELS } from '@/domain/enums';
import type { MuscleWeight } from '@/domain/stats-buckets';

import { ChartEmptyState } from '@/ui/charts';
import { useTheme } from '@/ui/theme-provider';

export interface MuscleDistributionBarsProps {
  entries: readonly MuscleWeight[];
  testID?: string;
}

/** `weight` renders as a whole number when it lands on one (the common case for an all-primary-muscle-only history) or one decimal otherwise (a 0.5-weighted secondary contribution) — never more precision than the underlying primary(1)/secondary(0.5) grid can produce. */
function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
}

const ROW_HEIGHT = 28;

export function MuscleDistributionBars({
  entries,
  testID,
}: MuscleDistributionBarsProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  if (entries.length === 0) {
    return (
      <ChartEmptyState
        height={ROW_HEIGHT * 4}
        testID={testID ? `${testID}-empty` : undefined}
      />
    );
  }

  const maxWeight = entries.reduce((max, entry) => Math.max(max, entry.weight), 0) || 1;

  return (
    <View testID={testID}>
      {entries.map((entry) => {
        const widthPct = Math.max((entry.weight / maxWeight) * 100, 4);
        return (
          <View
            key={entry.muscleGroup}
            testID={testID ? `${testID}-row-${entry.muscleGroup}` : undefined}
            style={{ marginBottom: spacing['2'] }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: spacing['0.5'],
              }}
            >
              <Text style={[typography.footnote, { color: colors.text.secondary }]} numberOfLines={1}>
                {MUSCLE_GROUP_LABELS[entry.muscleGroup]}
              </Text>
              <Text style={[typography.footnote, { color: colors.text.primary, fontWeight: '600' }]}>
                {formatWeight(entry.weight)}
              </Text>
            </View>
            <View
              style={{
                height: 8,
                borderRadius: radii.sm,
                backgroundColor: colors.bg.elevated,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  borderRadius: radii.sm,
                  backgroundColor: colors.accent.primary,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
