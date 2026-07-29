/**
 * Progress photo compare route (M5-03, 04 §6.2) — matches
 * `PhotoGalleryScreen.handleComparePress`'s navigation exactly:
 * `router.push({pathname: '/profile/measures/photos/compare', params: {a, b}})`.
 * No photo-file deps wired — this screen only reads (`photos()`/`list()`),
 * never calls `addPhoto`/`deletePhoto`.
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { PhotoCompareScreen } from '@/features/measurements/PhotoCompareScreen';

export default function PhotoCompareRoute(): React.JSX.Element {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const repository = useMemo(() => new MeasurementRepositoryImpl(getAppDriver()), []);

  return <PhotoCompareScreen repository={repository} photoAId={a} photoBId={b} />;
}
