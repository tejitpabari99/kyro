/**
 * History → Calendar route (M4-06) — the target `HistoryListScreen.tsx`'s
 * Calendar icon already navigates to (`router.push('/history/calendar')`,
 * wired in M4-03). Sits alongside `index.tsx`/`[id].tsx` under this same
 * `app/(tabs)/history/` directory (that folder's own `_layout.tsx` already
 * wraps every route here in one `ErrorBoundary` via `<Slot />`) for the
 * same reason `[id].tsx`'s own header gives: avoiding a second, colliding
 * "history" route root. Wires the real `WorkoutRepositoryImpl` into
 * `src/features/calendar/CalendarScreen.tsx`, which holds all of this
 * screen's actual logic/layout — the established "feature component owns
 * data + layout, route file only wires real deps" split
 * (`HistoryScreen`/M2-14, `ActiveWorkoutScreen`/M2-05).
 */
import React, { useMemo } from 'react';

import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { CalendarScreen } from '@/features/calendar/CalendarScreen';

export default function HistoryCalendarRoute(): React.JSX.Element {
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);

  return <CalendarScreen workoutRepository={workoutRepository} />;
}
