/**
 * `/backup/restore` route (M5-09, 05 §9/06 §3) — the Restore-from-backup
 * flow, registered as a `fullScreenModal` in `app/_layout.tsx` (same
 * presentation as `import/hevy` and every other cross-tab flow — 04 §2.1's
 * "cross-tab flows live outside `(tabs)`, presented as a modal" convention).
 * Thin wiring shim, same `app/import/hevy.tsx` split: constructs the real
 * `SqliteDriver`-backed `BackupService` (wiring `src/lib/progress-photos.ts`'s
 * and `src/lib/backup-file.ts`'s real `expo-file-system`-backed functions in
 * as `BackupServiceDeps` — the exact same "route file wires real deps, the
 * data-layer class/factory itself takes injectable ones" convention
 * `PhotosGalleryRoute`'s own header names for `MeasurementRepositoryImpl`)
 * plus a `MeasurementRepositoryImpl` for the post-restore orphan sweep, and
 * renders `BackupRestoreScreen`.
 */
import React, { useMemo } from 'react';

import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { BackupRestoreScreen } from '@/features/data-transfer/BackupRestoreScreen';
import { createBackupService } from '@/features/data-transfer/backup-service';
import { readBackupZipFile, writeCacheBackupZip } from '@/lib/backup-file';
import { readProgressPhotoFileBase64, writeProgressPhotoFileBase64, listProgressPhotoFileNames } from '@/lib/progress-photos';

export default function BackupRestoreRoute(): React.JSX.Element {
  const driver = useMemo(() => getAppDriver(), []);
  const backupService = useMemo(
    () =>
      createBackupService({
        driver,
        listPhotoFileNames: listProgressPhotoFileNames,
        readPhotoFileBase64: readProgressPhotoFileBase64,
        writePhotoFileBase64: writeProgressPhotoFileBase64,
        writeCacheZipFile: writeCacheBackupZip,
        readFileBase64: readBackupZipFile,
      }),
    [driver],
  );
  const measurementRepository = useMemo(() => new MeasurementRepositoryImpl(driver), [driver]);

  return (
    <BackupRestoreScreen backupService={backupService} measurementRepository={measurementRepository} />
  );
}
