/**
 * `/import/hevy` route (M5-07, 05 §7.2/06 §3: "route") — the Hevy CSV
 * import flow, registered as a `fullScreenModal` in `app/_layout.tsx` (same
 * presentation as `routine/new`/`workout/active`/`workout/[id]/edit`, 04
 * §2.1's own "cross-tab flows live outside `(tabs)`, presented as a modal"
 * convention). Thin wiring shim, same `app/routine/new.tsx`/`app/exercise/
 * new.tsx` split: constructs the real `SqliteDriver`-backed repositories +
 * `HevyImportService`, renders `HevyImportScreen`.
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { createHevyImportService } from '@/features/data-transfer/hevy-import-service';
import { HevyImportScreen } from '@/features/data-transfer/HevyImportScreen';

export default function ImportHevyRoute(): React.JSX.Element {
  const importService = useMemo(() => {
    const driver = getAppDriver();
    return createHevyImportService({
      driver,
      exerciseRepository: new ExerciseRepositoryImpl(driver),
    });
  }, []);

  return <HevyImportScreen importService={importService} />;
}
