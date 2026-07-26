/**
 * `PhotoGalleryScreen` (M5-03, 04 §6.2) — "Photos" surface within Measures:
 * grid by date, tap -> full-screen pager; select two -> Compare; `+` ->
 * camera/library attach (05 §8's capture/storage pipeline, wired through
 * `MeasurementRepository.addPhoto` the same way the eventual M5-02
 * log-entry sheet's own "photo attach section" will — both are ordinary
 * `addPhoto(date, sourceUri)` callers, per `05` §3.4's FK-creates-the-row
 * shape).
 *
 * **Route boundary (avoiding the parallel M5-02 task's files):** this
 * screen and its sibling `PhotoPagerScreen`/`PhotoCompareScreen` are wired
 * from `app/(tabs)/profile/measures/photos/**`, a path M5-02's own Measures
 * home/log-entry/detail-chart screens (`app/(tabs)/profile/measures/
 * index.tsx` / `[field].tsx`) never touch — see this task's own execution
 * log entry for the full collision-avoidance note.
 *
 * **Grouping:** `repository.photos()` already returns rows ordered `date`
 * then `createdAt` ascending (`MeasurementRepositoryImpl`'s own doc
 * comment) — grouped here into one section per date, newest date first (a
 * progress-photo gallery reads naturally most-recent-first, the opposite of
 * the repository's own storage-order default).
 *
 * **Selection / Compare (04 §6.2: "select two photos -> side-by-side"):** a
 * "Select" header toggle arms selection mode; tapping a thumbnail while
 * armed toggles it into/out of a max-2 selection instead of navigating to
 * the pager. Once exactly 2 are selected, a floating "Compare" bar appears;
 * pressing it navigates to `/profile/measures/photos/compare` with both
 * ids as params.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Image as ImageIcon, Images, Plus } from 'lucide-react-native';
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
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeasurementRepository, ProgressPhoto } from '@/data/measurements/types';
import { localDateKey } from '@/domain/streaks';
import { pickProgressPhoto } from '@/lib/progress-photo-capture';
import { progressPhotoUri } from '@/lib/progress-photos';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import { formatMeasurementDateLabel } from './measurement-photo-format';

export const PHOTO_GRID_COLUMNS = 3;
const MAX_COMPARE_SELECTION = 2;

export interface PhotoGalleryScreenProps {
  repository: MeasurementRepository;
  testID?: string;
}

interface PhotoDateSection {
  date: string;
  photos: ProgressPhoto[];
}

function groupPhotosByDateDescending(photos: ProgressPhoto[]): PhotoDateSection[] {
  const byDate = new Map<string, ProgressPhoto[]>();
  for (const photo of photos) {
    const bucket = byDate.get(photo.date);
    if (bucket) {
      bucket.push(photo);
    } else {
      byDate.set(photo.date, [photo]);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, datePhotos]) => ({ date, photos: datePhotos }));
}

export function PhotoGalleryScreen({
  repository,
  testID = 'photo-gallery-screen',
}: PhotoGalleryScreenProps): React.JSX.Element {
  const { colors, spacing, typography, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ['measurements', 'photos'],
    queryFn: () => repository.photos(),
  });

  const addPhotoMutation = useMutation({
    mutationFn: (sourceUri: string) => repository.addPhoto(localDateKey(Date.now()), sourceUri),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
    onError: () => {
      Alert.alert('Something went wrong', 'This photo could not be saved. Please try again.');
    },
  });

  const sections = useMemo(
    () => groupPhotosByDateDescending(query.data ?? []),
    [query.data],
  );

  const gridPadding = spacing['4'];
  const gridGap = spacing['1'];
  const thumbSize = (width - gridPadding * 2 - gridGap * (PHOTO_GRID_COLUMNS - 1)) / PHOTO_GRID_COLUMNS;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds([]);
  }, []);

  const handleAddPress = useCallback(() => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            const picked = await pickProgressPhoto('camera');
            if (picked) {
              addPhotoMutation.mutate(picked.uri);
            }
          })();
        },
      },
      {
        text: 'Library',
        onPress: () => {
          void (async () => {
            const picked = await pickProgressPhoto('library');
            if (picked) {
              addPhotoMutation.mutate(picked.uri);
            }
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [addPhotoMutation]);

  const handleThumbnailPress = useCallback(
    (photo: ProgressPhoto) => {
      if (selectMode) {
        setSelectedIds((current) => {
          if (current.includes(photo.id)) {
            return current.filter((id) => id !== photo.id);
          }
          if (current.length >= MAX_COMPARE_SELECTION) {
            return current;
          }
          return [...current, photo.id];
        });
        return;
      }
      router.push(`/profile/measures/photos/${photo.id}` as never);
    },
    [selectMode],
  );

  const handleComparePress = useCallback(() => {
    if (selectedIds.length !== MAX_COMPARE_SELECTION) return;
    const [a, b] = selectedIds;
    router.push({
      pathname: '/profile/measures/photos/compare' as never,
      params: { a, b },
    });
    exitSelectMode();
  }, [selectedIds, exitSelectMode]);

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing['4'],
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Text style={[typography.title1, { color: colors.text.primary }]}>Photos</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['3'] }}>
          <Pressable
            testID={`${testID}-select-toggle`}
            accessibilityRole="button"
            accessibilityLabel={selectMode ? 'Cancel selection' : 'Select photos to compare'}
            hitSlop={8}
            onPress={selectMode ? exitSelectMode : () => setSelectMode(true)}
          >
            <Text style={[typography.footnote, { color: colors.accent.text, fontWeight: '600' }]}>
              {selectMode ? 'Cancel' : 'Select'}
            </Text>
          </Pressable>
          {!selectMode ? (
            <Pressable
              testID={`${testID}-add-button`}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              hitSlop={8}
              onPress={handleAddPress}
            >
              <Plus size={24} strokeWidth={1.75} color={colors.accent.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : query.isError ? (
        <EmptyState
          testID={`${testID}-error`}
          icon={<ImageIcon size={40} strokeWidth={1.75} color={colors.semantic.danger} />}
          title="Couldn't load photos"
          caption="Something went wrong loading your progress photos."
          cta={
            <Button label="Retry" variant="tonal" onPress={() => void query.refetch()} testID={`${testID}-retry`} />
          }
        />
      ) : sections.length === 0 ? (
        <EmptyState
          testID={`${testID}-empty`}
          icon={<Images size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="No progress photos yet"
          caption="Attach a photo from the camera or your library to start tracking visually."
          cta={<Button label="Add Photo" variant="tonal" onPress={handleAddPress} testID={`${testID}-empty-add`} />}
        />
      ) : (
        <ScrollView testID={`${testID}-scroll`} contentContainerStyle={{ paddingBottom: spacing['8'] }}>
          {sections.map((section) => (
            <View key={section.date} style={{ marginBottom: spacing['4'] }}>
              <Text
                style={[
                  typography.subhead,
                  { color: colors.text.secondary, paddingHorizontal: gridPadding, marginBottom: spacing['2'] },
                ]}
              >
                {formatMeasurementDateLabel(section.date)}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: gridPadding,
                  gap: gridGap,
                }}
              >
                {section.photos.map((photo) => {
                  const isSelected = selectedIds.includes(photo.id);
                  return (
                    <Pressable
                      key={photo.id}
                      testID={`${testID}-thumb-${photo.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Photo from ${formatMeasurementDateLabel(photo.date)}`}
                      onPress={() => handleThumbnailPress(photo)}
                      style={{
                        width: thumbSize,
                        height: thumbSize,
                        borderRadius: radii.sm,
                        overflow: 'hidden',
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: colors.accent.primary,
                      }}
                    >
                      <Image
                        testID={`${testID}-thumb-image-${photo.id}`}
                        source={{ uri: progressPhotoUri(photo.fileName) }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      {isSelected ? (
                        <View
                          testID={`${testID}-thumb-selected-${photo.id}`}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            backgroundColor: colors.accent.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: colors.accent.onAccent, fontSize: 12, fontWeight: '700' }}>
                            {selectedIds.indexOf(photo.id) + 1}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {selectMode && selectedIds.length === MAX_COMPARE_SELECTION ? (
        <View
          style={{
            position: 'absolute',
            left: spacing['4'],
            right: spacing['4'],
            bottom: insets.bottom + spacing['4'],
          }}
        >
          <Button
            testID={`${testID}-compare-button`}
            label="Compare"
            variant="primary"
            size="lg"
            onPress={handleComparePress}
          />
        </View>
      ) : null}
    </View>
  );
}
