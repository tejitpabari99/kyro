/**
 * `/profile/measures` route (M5-02) — 04 §6.1's Measures home. Wires the
 * real, on-device `MeasurementRepositoryImpl` into
 * `src/features/measurements/MeasuresHomeScreen.tsx`, same thin-route
 * pattern every other feature route in this codebase uses (compare
 * `app/(tabs)/exercises/index.tsx`'s identical shape for
 * `ExerciseRepositoryImpl`).
 *
 * ## Photo-file deps
 *
 * `MeasurementRepositoryDeps.savePhotoFile`/`deletePhotoFile` (`src/data/
 * measurements/types.ts`) are wired here to the real, re-encoding (<=2048px
 * q80 JPEG) `expo-file-system`-backed implementations in
 * `src/lib/progress-photo-capture.ts`/`src/lib/progress-photos.ts` — the
 * same functions M5-03's gallery/pager/compare routes construct their own
 * repository instances with (`app/(tabs)/profile/measures/photos/*.tsx`).
 * This route originally wired a separate, non-re-encoding
 * `measurement-photo-files.ts` (a deliberate M5-02-scoped placeholder); a
 * post-merge reconciliation pass deleted that file and switched this
 * construction site to the real implementation, since leaving both in place
 * would have meant a photo attached via this sheet was stored full-
 * resolution/unprocessed while every other surface in the app assumes a
 * re-encoded jpg. Left at the identity/no-op defaults instead would mean an
 * attached photo silently vanishes after the picker's cache URI is
 * reclaimed — not acceptable either.
 *
 * Reachable only via a direct URL/deep-link for now — the Profile tab's own
 * "Measures" shortcut card is M5-04's job (`docs/plan/tasks/M5-tasks.md`);
 * this task deliberately leaves `app/(tabs)/profile/index.tsx` untouched to
 * avoid a merge conflict with that parallel task.
 */
import React, { useMemo } from 'react';

import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { MeasuresHomeScreen } from '@/features/measurements/MeasuresHomeScreen';
import { saveProgressPhotoFile } from '@/lib/progress-photo-capture';
import { deleteProgressPhotoFile } from '@/lib/progress-photos';

export default function MeasuresRoute(): React.JSX.Element {
  const repository = useMemo(
    () =>
      new MeasurementRepositoryImpl(getAppDriver(), {
        savePhotoFile: saveProgressPhotoFile,
        deletePhotoFile: deleteProgressPhotoFile,
      }),
    [],
  );

  return <MeasuresHomeScreen repository={repository} />;
}
