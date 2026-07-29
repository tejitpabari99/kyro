/**
 * Profile → Statistics route (M4-08) — `app/(tabs)/profile/index.tsx`'s
 * "Statistics" row navigates here (`router.push('/profile/statistics')`).
 * Wires the real `WorkoutRepositoryImpl` into
 * `src/features/stats/StatisticsScreen.tsx`, which holds all of this
 * screen's actual data/layout — the established "feature component owns
 * data + layout, route file only wires real deps" split
 * (`HistoryCalendarRoute`/M4-06, `ActiveWorkoutScreen`/M2-05).
 */
import React, { useMemo } from 'react';

import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { StatisticsScreen } from '@/features/stats/StatisticsScreen';

export default function ProfileStatisticsRoute(): React.JSX.Element {
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);

  return <StatisticsScreen workoutRepository={workoutRepository} />;
}
