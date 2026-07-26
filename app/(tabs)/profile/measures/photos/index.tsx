/**
 * Progress photos gallery route (M5-03, 04 §6.2) — "Photos" surface within
 * Measures. Deliberately under `measures/photos/**`, not
 * `measures/index.tsx`/`measures/[field].tsx` (the parallel M5-02 task's
 * own Measures home/log-entry/detail-chart files, a separate worktree off
 * the same base) — see `docs/plan/EXECUTION-LOG.md`'s M5-03 entry for the
 * full collision-avoidance note.
 *
 * Constructs `MeasurementRepositoryImpl` with the **real**
 * `expo-file-system`-backed photo-file deps (`src/lib/progress-photos.ts`/
 * `src/lib/progress-photo-capture.ts`, this task's own scope — replacing
 * `measurement-repository.ts`'s identity/no-op defaults) — same "route
 * constructs the repository, passes it down as a prop" pattern
 * `ExerciseRepositoryImpl` usage in `app/(tabs)/exercises/index.tsx`/
 * `app/exercise/[id].tsx` already establishes. `PhotoPagerScreen`/
 * `compare.tsx` each construct their own instance the same way (per-route
 * repository construction is this codebase's established convention, not a
 * shared singleton) — this is the only one of the three routes that wires
 * `savePhotoFile` (the only one with an "Add Photo" affordance that calls
 * `repository.addPhoto`) — expected to coexist with whatever instance
 * M5-02's own Measures screens construct for their log-entry sheet's
 * photo-attach section.
 */
import React, { useMemo } from 'react';

import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { PhotoGalleryScreen } from '@/features/measurements/PhotoGalleryScreen';
import { saveProgressPhotoFile } from '@/lib/progress-photo-capture';
import { deleteProgressPhotoFile } from '@/lib/progress-photos';

export default function PhotosGalleryRoute(): React.JSX.Element {
  const repository = useMemo(
    () =>
      new MeasurementRepositoryImpl(getAppDriver(), {
        savePhotoFile: saveProgressPhotoFile,
        deletePhotoFile: deleteProgressPhotoFile,
      }),
    [],
  );

  return <PhotoGalleryScreen repository={repository} />;
}
