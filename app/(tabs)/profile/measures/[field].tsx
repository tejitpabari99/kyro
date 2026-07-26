/**
 * `/profile/measures/[field]` route (M5-02) — one measurement field's
 * detail (04 §6.1). Wires the same real `MeasurementRepositoryImpl` +
 * progress-photo deps `./index.tsx` (Measures home) constructs — see that
 * file's own header for the photo-deps rationale — into
 * `src/features/measurements/MeasurementDetailScreen.tsx`. `field`
 * validation against `MEASUREMENT_FIELD_KEYS` happens inside that screen
 * component, not here (mirrors `app/exercise/[id].tsx`'s own "thin route,
 * screen owns the not-found branch" split).
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { MeasurementDetailScreen } from '@/features/measurements/MeasurementDetailScreen';
import {
  deleteProgressPhotoFile,
  saveProgressPhotoFile,
} from '@/features/measurements/measurement-photo-files';

export default function MeasurementDetailRoute(): React.JSX.Element {
  const { field } = useLocalSearchParams<{ field: string }>();
  const repository = useMemo(
    () =>
      new MeasurementRepositoryImpl(getAppDriver(), {
        savePhotoFile: saveProgressPhotoFile,
        deletePhotoFile: deleteProgressPhotoFile,
      }),
    [],
  );

  return <MeasurementDetailScreen repository={repository} field={field ?? ''} />;
}
