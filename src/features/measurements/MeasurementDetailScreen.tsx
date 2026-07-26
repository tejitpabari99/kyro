/**
 * `MeasurementDetailScreen` (M5-02, 04 §6.1) — one measurement field's
 * detail: `LineChart` (`src/ui/charts/LineChart.tsx`, M4-07 — reused
 * verbatim) with a 3M/1Y/All `SegmentedControl` range toggle, mirroring
 * `ExerciseChartsTab.tsx`'s (M4-09) exact established range-toggle + chart
 * shape rather than inventing a new one — including reusing
 * `domain/exercise-charts.ts`'s `CHART_RANGE_VALUES`/`chartRangeStartMs`
 * directly (generic day-window math, not actually exercise-specific,
 * despite the file's name) instead of re-deriving the same "3M/1Y/All ->
 * epoch-ms lower bound" formula a second time. Below the chart: a reverse-
 * chronological entry list, each row editable (re-opens `LogEntrySheet`
 * prefilled for that date) and deletable (`MeasurementRepository
 * .clearField(date, field)` — per 04 §6.1, *not* a full-row delete; an
 * empty row with no photos is pruned automatically by the repository,
 * M5-01).
 *
 * Charts only ever plot `series()`'s already-gap-correct points (M5-01: "no
 * zero-fill... gaps preserved as genuine gaps") — this screen adds no
 * interpolation of its own.
 */
import React, { useState } from 'react';
import { ChevronLeft, LineChart as LineChartIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeasurementRepository } from '@/data/measurements/types';
import { MEASUREMENT_FIELD_KEYS } from '@/data/measurements/types';
import { CHART_RANGE_VALUES, chartRangeStartMs, type ChartRange } from '@/domain/exercise-charts';
import { parseLocalDateKey } from '@/domain/streaks';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { LineChart, type ChartPoint } from '@/ui/charts';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useTheme } from '@/ui/theme-provider';

import { LogEntrySheet } from './LogEntrySheet';
import { MEASUREMENT_FIELD_LABELS, formatReadOnlyValue, measurementUnitSuffix, type MeasurementFieldKey } from './measurement-units';

const CHART_HEIGHT = 220;
const RANGE_OPTIONS = CHART_RANGE_VALUES.map((value) => ({ value, label: value }));

export interface MeasurementDetailScreenProps {
  repository: MeasurementRepository;
  /** Route param — validated against `MEASUREMENT_FIELD_KEYS` here (not the thin route file), same "screen owns validation" split `ExerciseDetailScreen.tsx`'s not-found branch already establishes. */
  field: string;
  testID?: string;
}

function isMeasurementFieldKey(value: string): value is MeasurementFieldKey {
  return (MEASUREMENT_FIELD_KEYS as readonly string[]).includes(value);
}

function formatEntryDateLabel(dateKey: string): string {
  return parseLocalDateKey(dateKey).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatXLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MeasurementDetailScreen({
  repository,
  field,
  testID = 'measurement-detail-screen',
}: MeasurementDetailScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const bodyMeasurementUnit = useSettingsStore((state) => state.settings.body_measurement_unit);

  const [range, setRange] = useState<ChartRange>('3M');
  const [editDate, setEditDate] = useState<string | null>(null);

  // `field` is a route param (plain `string`, not yet known to be a real
  // `MeasurementFieldKey`) — resolved once here so every hook below can be
  // called unconditionally regardless of whether it's valid (React's Rules
  // of Hooks: an early "not found" return may never precede a hook call).
  // The not-found branch is rendered only in this function's final JSX,
  // same "validate, then render conditionally at the very end" shape
  // `ExerciseDetailScreen.tsx`'s own `query.isError || exercise == null`
  // branch already establishes for its analogous bad-id case.
  const resolvedField = isMeasurementFieldKey(field) ? field : null;
  const queryField = resolvedField ?? MEASUREMENT_FIELD_KEYS[0];

  const seriesQuery = useQuery({
    queryKey: ['measurements', 'series', queryField],
    queryFn: () => repository.series(queryField, {}),
    enabled: resolvedField != null,
  });

  const points = resolvedField != null ? (seriesQuery.data ?? []) : [];

  const clearFieldMutation = useMutation({
    mutationFn: (date: string) => repository.clearField(date, queryField),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
  });

  if (resolvedField == null) {
    return (
      <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
        <EmptyState
          testID={`${testID}-not-found`}
          icon={<LineChartIcon size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="Measurement not found"
          caption="This measurement type doesn't exist."
        />
      </View>
    );
  }

  const label = MEASUREMENT_FIELD_LABELS[resolvedField];
  const unitSuffix = measurementUnitSuffix(resolvedField, bodyMeasurementUnit);

  const rangeStart = chartRangeStartMs(range);
  const rangedPoints = rangeStart === null ? points : points.filter((point) => parseLocalDateKey(point.date).getTime() >= rangeStart);

  const chartData: ChartPoint[] = rangedPoints.map((point) => ({
    x: parseLocalDateKey(point.date).getTime(),
    y: formatReadOnlyValue(resolvedField, point.value, bodyMeasurementUnit),
  }));

  // Reverse-chronological — `series()` returns ascending (M5-01).
  const entriesDescending = [...points].reverse();

  const handleDelete = (date: string): void => {
    Alert.alert('Delete Entry?', `Remove the ${label} value logged on ${formatEntryDateLabel(date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => clearFieldMutation.mutate(date) },
    ]);
  };

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing['4'],
          // BUGFIX-01: `insets.top` clears the status bar/notch — see
          // `app/_layout.tsx`'s header.
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Pressable
          testID={`${testID}-back`}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
        </Pressable>
        <Text style={[typography.title2, { color: colors.text.primary, marginLeft: spacing['2'] }]}>{label}</Text>
      </View>

      {seriesQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : (
        <ScrollView testID={`${testID}-scroll`} contentContainerStyle={{ padding: spacing['4'] }}>
          <LineChart
            testID={`${testID}-chart`}
            data={chartData}
            height={CHART_HEIGHT}
            title={label}
            headerRight={
              <SegmentedControl
                testID={`${testID}-range`}
                options={RANGE_OPTIONS}
                value={range}
                onChange={setRange}
              />
            }
            formatXLabel={formatXLabel}
            formatYLabel={(y) => String(Math.round(y * 10) / 10)}
            formatTooltipValue={(point) => `${Math.round((point.y ?? 0) * 10) / 10} ${unitSuffix}`}
            formatTooltipDate={(point) => formatXLabel(point.x)}
            emptyStateLabel="No entries yet"
          />

          <View style={{ marginTop: spacing['5'] }}>
            <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: spacing['2'] }]}>
              ENTRIES
            </Text>
            {entriesDescending.length === 0 ? (
              <EmptyState
                testID={`${testID}-entries-empty`}
                icon={<LineChartIcon size={32} strokeWidth={1.75} color={colors.text.tertiary} />}
                title="No entries yet"
                caption={`Log ${label.toLowerCase()} to see entries here.`}
              />
            ) : (
              entriesDescending.map((point) => {
                const displayValue = formatReadOnlyValue(resolvedField, point.value, bodyMeasurementUnit);
                return (
                  <View
                    key={point.date}
                    testID={`${testID}-entry-${point.date}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: spacing['3'],
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border.hairline,
                    }}
                  >
                    <View>
                      <Text style={[typography.body, { color: colors.text.primary }]}>
                        {formatEntryDateLabel(point.date)}
                      </Text>
                      <Text
                        style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}
                      >
                        {displayValue} {unitSuffix}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing['2'] }}>
                      <Button
                        label="Edit"
                        variant="ghost"
                        size="sm"
                        testID={`${testID}-entry-${point.date}-edit`}
                        onPress={() => setEditDate(point.date)}
                      />
                      <Button
                        label="Delete"
                        variant="destructive"
                        size="sm"
                        testID={`${testID}-entry-${point.date}-delete`}
                        onPress={() => handleDelete(point.date)}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      <LogEntrySheet
        testID={`${testID}-log-entry-sheet`}
        visible={editDate != null}
        onDismiss={() => setEditDate(null)}
        repository={repository}
        bodyMeasurementUnit={bodyMeasurementUnit}
        initialDate={editDate ?? undefined}
      />
    </View>
  );
}
