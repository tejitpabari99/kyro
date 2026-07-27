/**
 * `/import/hevy` route (M5-07, 05 §7.2/06 §3: "route") — the Hevy CSV
 * import flow, registered as a `fullScreenModal` in `app/_layout.tsx` (same
 * presentation as `routine/new`/`workout/active`/`workout/[id]/edit`, 04
 * §2.1's own "cross-tab flows live outside `(tabs)`, presented as a modal"
 * convention). Thin wiring shim, same `app/routine/new.tsx`/`app/exercise/
 * new.tsx` split: constructs the real `SqliteDriver`-backed repositories +
 * `HevyImportService`, renders `HevyImportScreen`.
 *
 * `devFixtureImportEnabled={__DEV__}` (M5-10) — `HevyImportScreen`'s own
 * mocked-picker bypass, see that component's header. Passing `__DEV__`
 * straight through (rather than a hardcoded `true`) means this is the one
 * and only place that decides "is the bypass live," and it can never be
 * live in a production/TestFlight build regardless of what a future edit
 * here does — the component's own `__DEV__ &&` re-check is the second,
 * belt-and-suspenders guard.
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

  return <HevyImportScreen importService={importService} devFixtureImportEnabled={__DEV__} />;
}
