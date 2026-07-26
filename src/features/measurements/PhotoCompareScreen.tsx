/**
 * `PhotoCompareScreen` (M5-03, 04 §6.2) — "select two photos -> side-by-side
 * view with both dates + weight/other-measurement deltas between them."
 *
 * Both photo ids are resolved against the same `repository.photos()` /
 * `repository.list()` queries `PhotoGalleryScreen`/`PhotoPagerScreen` already
 * use (same query keys — `['measurements','photos']` / `['measurements',
 * 'list']` — so this screen's own mount doesn't force a second network/DB
 * round trip when navigated to right after the gallery already loaded them,
 * TanStack Query's normal cache-sharing behavior).
 *
 * **Delta rows:** one row per of the 17 fields (`MEASUREMENT_FIELD_KEYS`
 * canonical order) where **either** date has a non-null value — a field
 * with a value on only one side still gets a row (showing "—" on the empty
 * side, no delta), since that's still useful comparison information ("you
 * only started tracking this at the later date"); a field with no value on
 * *either* side is omitted entirely rather than padding the list with 17
 * all-dash rows.
 */
import React, { useMemo } from 'react';
import { ImageOff } from 'lucide-react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BodyMeasurement, MeasurementRepository } from '@/data/measurements/types';
import { MEASUREMENT_FIELD_KEYS } from '@/data/measurements/types';
import { useSettingsStore } from '@/features/settings/settings-store';
import { progressPhotoUri } from '@/lib/progress-photos';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import {
  MEASUREMENT_FIELD_LABELS,
  formatMeasurementDateLabel,
  formatMeasurementDelta,
  formatMeasurementValue,
} from './measurement-photo-format';

export interface PhotoCompareScreenProps {
  repository: MeasurementRepository;
  photoAId: string;
  photoBId: string;
  testID?: string;
}

export function PhotoCompareScreen({
  repository,
  photoAId,
  photoBId,
  testID = 'photo-compare-screen',
}: PhotoCompareScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const bodyMeasurementUnit = useSettingsStore((state) => state.settings.body_measurement_unit);

  const photosQuery = useQuery({
    queryKey: ['measurements', 'photos'],
    queryFn: () => repository.photos(),
  });
  const measurementsQuery = useQuery({
    queryKey: ['measurements', 'list'],
    queryFn: () => repository.list(),
  });

  const photoA = photosQuery.data?.find((photo) => photo.id === photoAId);
  const photoB = photosQuery.data?.find((photo) => photo.id === photoBId);

  const measurementByDate = useMemo(() => {
    const map = new Map<string, BodyMeasurement>();
    for (const row of measurementsQuery.data ?? []) {
      map.set(row.date, row);
    }
    return map;
  }, [measurementsQuery.data]);

  if (photosQuery.isLoading || measurementsQuery.isLoading) {
    return (
      <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  if (!photoA || !photoB) {
    return (
      <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
        <EmptyState
          testID={`${testID}-missing`}
          icon={<ImageOff size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="Photo no longer available"
          caption="One of the selected photos may have been deleted."
        />
      </View>
    );
  }

  const measurementA = measurementByDate.get(photoA.date);
  const measurementB = measurementByDate.get(photoB.date);

  const deltaRows = MEASUREMENT_FIELD_KEYS.map((field) => {
    const before = measurementA?.[field] ?? null;
    const after = measurementB?.[field] ?? null;
    if (before === null && after === null) return null;
    return {
      field,
      label: MEASUREMENT_FIELD_LABELS[field],
      beforeDisplay: formatMeasurementValue(field, before, bodyMeasurementUnit) ?? '—',
      afterDisplay: formatMeasurementValue(field, after, bodyMeasurementUnit) ?? '—',
      delta: formatMeasurementDelta(field, before, after, bodyMeasurementUnit),
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing['4'],
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Text
          testID={`${testID}-close`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={[typography.body, { color: colors.accent.text }]}
        >
          Close
        </Text>
        <Text style={[typography.title1, { color: colors.text.primary, marginLeft: spacing['3'] }]}>Compare</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: spacing['4'], gap: spacing['2'] }}>
        {[
          { photo: photoA, testSuffix: 'a' },
          { photo: photoB, testSuffix: 'b' },
        ].map(({ photo, testSuffix }) => (
          <View key={photo.id} style={{ flex: 1, alignItems: 'center' }}>
            <Image
              testID={`${testID}-image-${testSuffix}`}
              source={{ uri: progressPhotoUri(photo.fileName) }}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 8 }}
              contentFit="cover"
            />
            <Text
              testID={`${testID}-date-${testSuffix}`}
              style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['2'] }]}
            >
              {formatMeasurementDateLabel(photo.date)}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ padding: spacing['4'] }}>
        {deltaRows.length === 0 ? (
          <Text
            testID={`${testID}-no-data`}
            style={[typography.subhead, { color: colors.text.tertiary, textAlign: 'center' }]}
          >
            Neither date has any measurement values logged.
          </Text>
        ) : (
          <Card>
            {deltaRows.map((row, rowIndex) => (
              <View
                key={row.field}
                testID={`${testID}-row-${row.field}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: spacing['2'],
                  borderTopWidth: rowIndex === 0 ? 0 : 1,
                  borderTopColor: colors.border.hairline,
                }}
              >
                <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>{row.label}</Text>
                <Text style={[typography.subhead, { color: colors.text.secondary }]}>
                  {row.beforeDisplay} → {row.afterDisplay}
                </Text>
                {row.delta ? (
                  <Text
                    testID={`${testID}-delta-${row.field}`}
                    style={[
                      typography.footnote,
                      { color: colors.accent.text, fontWeight: '600', marginLeft: spacing['2'], minWidth: 56, textAlign: 'right' },
                    ]}
                  >
                    {row.delta}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}
