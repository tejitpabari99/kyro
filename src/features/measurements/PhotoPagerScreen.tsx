/**
 * `PhotoPagerScreen` (M5-03, 04 §6.2) — "tap -> full-screen pager with date
 * + that date's weight overlay" and "delete with confirm". One photo per
 * page, swipeable horizontally.
 *
 * **Pager mechanism:** same dual-input convention `WheelPicker` (M2-09)
 * already established for this codebase's "swipeable" primitives — a
 * `snapToInterval`/`pagingEnabled` horizontal `ScrollView` handles the real
 * swipe gesture (`onMomentumScrollEnd` resolves the settled page from
 * `contentOffset.x`), while `ChevronLeft`/`ChevronRight` buttons commit the
 * same index change directly (both for accessibility — a momentum-scroll
 * gesture isn't performable via VoiceOver/RNTL `fireEvent.press` — and so
 * this component's paging logic is exercised without needing a full native
 * gesture simulation in tests, exactly `WheelPicker.tsx`'s own header
 * rationale).
 *
 * **Weight overlay:** `MeasurementRepository.list()` (04 §6.2: "that date's
 * weight overlay") is queried once and indexed by date; a page whose date
 * has no `body_measurements` row (or a null `weightKg`) simply omits the
 * overlay's weight line rather than showing a placeholder value.
 *
 * **Missing-file placeholder (05 §8's orphan-sweep UI half — see
 * `photo-orphan-sweep.ts`'s header):** `expo-image`'s `onError` flips that
 * one photo id into `failedIds`, swapping its `Image` for a themed
 * placeholder instead of crashing or showing a broken-image icon — the
 * exact "rows without files -> placeholder" outcome 05 §8 asks for, at the
 * point the UI actually discovers the file is unreadable (the boot-time
 * sweep already logged the warning; this is what a user sees if they
 * happen to open that specific photo before the next relaunch clears it).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeasurementRepository } from '@/data/measurements/types';
import { progressPhotoUri } from '@/lib/progress-photos';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useTheme } from '@/ui/theme-provider';

import { formatMeasurementDateLabel, formatMeasurementValue } from './measurement-photo-format';

export interface PhotoPagerScreenProps {
  repository: MeasurementRepository;
  /** The photo to open the pager centered on (e.g. the tapped gallery thumbnail's id). */
  initialPhotoId: string;
  testID?: string;
}

export function PhotoPagerScreen({
  repository,
  initialPhotoId,
  testID = 'photo-pager-screen',
}: PhotoPagerScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const bodyMeasurementUnit = useSettingsStore((state) => state.settings.body_measurement_unit);

  const photosQuery = useQuery({
    queryKey: ['measurements', 'photos'],
    queryFn: () => repository.photos(),
  });
  const measurementsQuery = useQuery({
    queryKey: ['measurements', 'list'],
    queryFn: () => repository.list(),
  });

  const photos = photosQuery.data ?? [];
  const weightByDate = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of measurementsQuery.data ?? []) {
      map.set(row.date, row.weightKg);
    }
    return map;
  }, [measurementsQuery.data]);

  const [index, setIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  // `photos` only resolves once `photosQuery` finishes loading (empty `[]`
  // on the first render) — a plain `useState(initialIndex)` would lock in
  // index `0` forever, computed against that still-empty array, and never
  // re-resolve once the real data arrives (`useState`'s initializer only
  // runs on mount). This is a genuine "synchronize with an external system"
  // effect (imperative `scrollTo` needs `scrollRef` to already be mounted),
  // unlike the mid-render state-adjustment pattern `ExerciseMedia.tsx` uses
  // for its own reset-on-prop-change case — gated by a ref (not state) so it
  // fires exactly once, the first time `photos` is non-empty.
  const hasResolvedInitialIndex = useRef(false);
  useEffect(() => {
    if (hasResolvedInitialIndex.current || photos.length === 0) {
      return;
    }
    hasResolvedInitialIndex.current = true;
    const resolved = Math.max(
      0,
      photos.findIndex((photo) => photo.id === initialPhotoId),
    );
    setIndex(resolved);
    scrollRef.current?.scrollTo({ x: resolved * width, animated: false });
    // Depends on `photosQuery.data` rather than the derived `photos` array
    // (a fresh `[]` reference every render while loading, which would
    // re-run this effect on every unrelated render) — `photos` inside this
    // effect body always reflects the same value `photosQuery.data ?? []`
    // would at this point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosQuery.data, initialPhotoId, width]);

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => repository.deletePhoto(photoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
    onError: () => {
      Alert.alert('Something went wrong', 'This photo could not be deleted. Please try again.');
    },
  });

  const commit = useCallback(
    (nextIndex: number, animated: boolean) => {
      const clamped = Math.min(photos.length - 1, Math.max(0, nextIndex));
      setIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * width, animated });
    },
    [photos.length, width],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const rawIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      commit(rawIndex, true);
    },
    [commit, width],
  );

  const currentPhoto = photos[index];

  const handleDeletePress = useCallback((): void => {
    if (!currentPhoto) return;
    Alert.alert('Delete Photo?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMutation.mutate(currentPhoto.id, {
            onSuccess: () => {
              if (photos.length <= 1) {
                router.back();
              }
            },
          });
        },
      },
    ]);
  }, [currentPhoto, deleteMutation, photos.length]);

  if (photosQuery.isLoading || measurementsQuery.isLoading) {
    return (
      <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView
        ref={scrollRef}
        testID={`${testID}-scroll`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {photos.map((photo) => {
          const failed = failedIds.has(photo.id);
          return (
            <View key={photo.id} style={{ width, height: '100%' }}>
              {failed ? (
                <View
                  testID={`${testID}-placeholder-${photo.id}`}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.elevated }}
                >
                  <ImageOff size={48} strokeWidth={1.5} color={colors.text.tertiary} />
                  <Text style={[typography.subhead, { color: colors.text.tertiary, marginTop: spacing['2'] }]}>
                    Photo unavailable
                  </Text>
                </View>
              ) : (
                <Image
                  testID={`${testID}-image-${photo.id}`}
                  source={{ uri: progressPhotoUri(photo.fileName) }}
                  style={{ flex: 1 }}
                  contentFit="contain"
                  onError={() => setFailedIds((current) => new Set(current).add(photo.id))}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing['3'],
          left: spacing['4'],
          right: spacing['4'],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          testID={`${testID}-back`}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => router.back()}
        >
          <ChevronLeft size={28} strokeWidth={2} color={colors.text.primary} />
        </Pressable>
        <Pressable
          testID={`${testID}-delete`}
          accessibilityRole="button"
          accessibilityLabel="Delete photo"
          hitSlop={8}
          onPress={handleDeletePress}
        >
          <Trash2 size={22} strokeWidth={1.75} color={colors.semantic.danger} />
        </Pressable>
      </View>

      {currentPhoto ? (
        <View
          style={{
            position: 'absolute',
            left: spacing['4'],
            right: spacing['4'],
            bottom: insets.bottom + spacing['4'],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            testID={`${testID}-prev`}
            accessibilityRole="button"
            accessibilityLabel="Previous photo"
            hitSlop={8}
            disabled={index === 0}
            onPress={() => commit(index - 1, true)}
          >
            <ChevronLeft size={24} strokeWidth={1.75} color={index === 0 ? colors.text.tertiary : colors.text.primary} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text testID={`${testID}-date`} style={[typography.headline, { color: colors.text.primary }]}>
              {formatMeasurementDateLabel(currentPhoto.date)}
            </Text>
            {(() => {
              const weightLabel = formatMeasurementValue(
                'weightKg',
                weightByDate.get(currentPhoto.date) ?? null,
                bodyMeasurementUnit,
              );
              return weightLabel ? (
                <Text testID={`${testID}-weight`} style={[typography.subhead, { color: colors.text.secondary }]}>
                  {weightLabel}
                </Text>
              ) : null;
            })()}
          </View>
          <Pressable
            testID={`${testID}-next`}
            accessibilityRole="button"
            accessibilityLabel="Next photo"
            hitSlop={8}
            disabled={index === photos.length - 1}
            onPress={() => commit(index + 1, true)}
          >
            <ChevronRight
              size={24}
              strokeWidth={1.75}
              color={index === photos.length - 1 ? colors.text.tertiary : colors.text.primary}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
