/**
 * `MeasuresHomeScreen` (M5-02, 04 §6.1) — Profile → Measures home: all 17
 * `MeasurementFields` (`MEASUREMENT_FIELD_KEYS`, canonical order) as rows,
 * each showing latest value + delta vs the previous entry + a 90-day
 * `Sparkline` (`src/ui/charts/Sparkline.tsx`, M4-07 — reused verbatim, never
 * rebuilt). Tapping a row navigates to that field's detail
 * (`/profile/measures/[field]`, `MeasurementDetailScreen`); the `+` FAB
 * opens `LogEntrySheet` defaulted to today.
 *
 * ## Data flow
 *
 * One `repository.series(field, {})` (all-time, ascending, already-tested
 * "no zero-fill" shape, M5-01) per field via `useQueries`, each keyed
 * `['measurements', 'series', field]` — the exact same key
 * `MeasurementDetailScreen` uses for its own single-field series query, so
 * tapping a row into its detail screen reuses this already-warm cache
 * instead of re-fetching. `measures-home-model.ts`'s pure
 * `buildMeasureHomeRow` derives latest/previous/delta and the 90-day
 * sparkline slice from each field's all-time point array client-side (06
 * §8's "load once, derive in memory" tactic, the same shape
 * `ExerciseBrowseScreen.tsx`'s own header describes for its exercise list)
 * rather than firing a second ranged query per field.
 */
import React, { useState } from 'react';
import { ChevronLeft, Plus, TriangleAlert } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeasurementRepository } from '@/data/measurements/types';
import { MEASUREMENT_FIELD_KEYS } from '@/data/measurements/types';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Sparkline } from '@/ui/charts';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import { LogEntrySheet } from './LogEntrySheet';
import { buildMeasureHomeRow, type MeasureHomeRow } from './measures-home-model';
import {
  MEASUREMENT_FIELD_LABELS,
  formatReadOnlyValue,
  measurementUnitSuffix,
} from './measurement-units';

const SPARKLINE_WIDTH = 84;
const SPARKLINE_HEIGHT = 32;
const FAB_SIZE = 56;

export interface MeasuresHomeScreenProps {
  repository: MeasurementRepository;
  testID?: string;
}

function formatValueText(row: MeasureHomeRow, unit: Parameters<typeof formatReadOnlyValue>[2]): string {
  if (row.latest === null) return 'No entries yet';
  const displayValue = formatReadOnlyValue(row.field, row.latest.value, unit);
  return `${displayValue} ${measurementUnitSuffix(row.field, unit)}`;
}

function formatDeltaText(row: MeasureHomeRow, unit: Parameters<typeof formatReadOnlyValue>[2]): string | null {
  if (row.delta === null) return null;
  const sign = row.delta > 0 ? '+' : row.delta < 0 ? '-' : '';
  const magnitude = formatReadOnlyValue(row.field, Math.abs(row.delta), unit);
  return `${sign}${magnitude} ${measurementUnitSuffix(row.field, unit)}`;
}

export function MeasuresHomeScreen({
  repository,
  testID = 'measures-home-screen',
}: MeasuresHomeScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const bodyMeasurementUnit = useSettingsStore((state) => state.settings.body_measurement_unit);

  const [logEntryVisible, setLogEntryVisible] = useState(false);

  const seriesQueries = useQueries({
    queries: MEASUREMENT_FIELD_KEYS.map((field) => ({
      queryKey: ['measurements', 'series', field],
      queryFn: () => repository.series(field, {}),
    })),
  });

  const isLoading = seriesQueries.some((query) => query.isLoading);
  // A real repository failure on any one field's series query must render
  // as a distinct error state, not silently fall through to "No entries
  // yet" for every row — the same `isError` + `EmptyState` + `Retry`
  // pattern `HistoryListScreen.tsx`/`CalendarScreen.tsx`/
  // `StatisticsScreen.tsx` already establish (M4's own milestone-wide
  // review, found in M5 milestone-wide review for this screen too).
  const isError = seriesQueries.some((query) => query.isError);
  const rows: MeasureHomeRow[] = MEASUREMENT_FIELD_KEYS.map((field, index) =>
    buildMeasureHomeRow(field, seriesQueries[index]?.data ?? []),
  );
  const retryFailedQueries = (): void => {
    for (const query of seriesQueries) {
      if (query.isError) void query.refetch();
    }
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
          style={{ marginRight: spacing['3'] }}
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
        </Pressable>
        <Text style={[typography.title1, { color: colors.text.primary }]}>Measures</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : isError ? (
        <EmptyState
          testID={`${testID}-error`}
          icon={<TriangleAlert size={40} strokeWidth={1.75} color={colors.semantic.danger} />}
          title="Couldn't load measurements"
          caption="Something went wrong loading your measurements."
          cta={
            <Button
              label="Retry"
              variant="tonal"
              onPress={retryFailedQueries}
              testID={`${testID}-retry`}
            />
          }
        />
      ) : (
        <ScrollView testID={`${testID}-list`} contentContainerStyle={{ paddingBottom: spacing['12'] }}>
          {rows.map((row) => {
            const deltaText = formatDeltaText(row, bodyMeasurementUnit);
            return (
              <Pressable
                key={row.field}
                testID={`${testID}-row-${row.field}`}
                accessibilityRole="button"
                accessibilityLabel={`${MEASUREMENT_FIELD_LABELS[row.field]} detail`}
                onPress={() => router.push(`/profile/measures/${row.field}` as never)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing['4'],
                  paddingVertical: spacing['3'],
                  backgroundColor: pressed ? colors.bg.elevated : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.hairline,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { color: colors.text.primary }]}>
                    {MEASUREMENT_FIELD_LABELS[row.field]}
                  </Text>
                  <Text
                    testID={`${testID}-row-${row.field}-value`}
                    style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}
                  >
                    {formatValueText(row, bodyMeasurementUnit)}
                    {deltaText != null ? `  ${deltaText}` : ''}
                  </Text>
                </View>
                <Sparkline
                  testID={`${testID}-row-${row.field}-sparkline`}
                  data={row.sparklineData}
                  width={SPARKLINE_WIDTH}
                  height={SPARKLINE_HEIGHT}
                  emptyStateLabel="None"
                />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Pressable
        testID={`${testID}-fab`}
        accessibilityRole="button"
        accessibilityLabel="Log measurement"
        onPress={() => setLogEntryVisible(true)}
        style={{
          position: 'absolute',
          right: spacing['4'],
          bottom: insets.bottom + spacing['4'],
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          backgroundColor: colors.accent.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Plus size={26} strokeWidth={2} color={colors.accent.onAccent} />
      </Pressable>

      <LogEntrySheet
        testID={`${testID}-log-entry-sheet`}
        visible={logEntryVisible}
        onDismiss={() => setLogEntryVisible(false)}
        repository={repository}
        bodyMeasurementUnit={bodyMeasurementUnit}
      />
    </View>
  );
}
