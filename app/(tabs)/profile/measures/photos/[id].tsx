/**
 * Progress photo full-screen pager route (M5-03, 04 §6.2) — matches
 * `PhotoGalleryScreen.handleThumbnailPress`'s navigation exactly:
 * `router.push(\`/profile/measures/photos/${photo.id}\`)`, a plain string
 * path (same convention `app/exercise/[id].tsx`'s own header documents for
 * `ExerciseBrowseScreen`'s row press). Only wires `deletePhotoFile` (this
 * screen's own delete-photo action) — `savePhotoFile` is left at its
 * identity-pass-through default since this screen never calls
 * `repository.addPhoto`, so there's nothing to wire it to.
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { PhotoPagerScreen } from '@/features/measurements/PhotoPagerScreen';
import { deleteProgressPhotoFile } from '@/lib/progress-photos';

export default function PhotoPagerRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repository = useMemo(
    () =>
      new MeasurementRepositoryImpl(getAppDriver(), {
        deletePhotoFile: deleteProgressPhotoFile,
      }),
    [],
  );

  return <PhotoPagerScreen repository={repository} initialPhotoId={id} />;
}
