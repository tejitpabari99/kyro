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
 * measurements/types.ts`) are wired here to the real, minimal (no re-encode)
 * `expo-file-system`-backed implementations in `src/features/measurements/
 * measurement-photo-files.ts` — see that file's own header for why a real
 * (if simple) implementation was wired now rather than left at the
 * identity/no-op defaults: `addPhoto`/`deletePhoto` are this task's
 * (M5-02's) own explicit scope, and the default deps would make an attached
 * photo silently vanish on relaunch (the picker's cache URI doesn't
 * survive), which isn't an acceptable "self-contained and simple" photo
 * feature. M5-03 (progress-photo gallery/compare/orphan-sweep) layers the
 * documented 2048 px/q80 re-encode step on top of the same two functions
 * without this construction site needing to change.
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
import {
  deleteProgressPhotoFile,
  saveProgressPhotoFile,
} from '@/features/measurements/measurement-photo-files';

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
