/**
 * `CalendarScreen` (M4-06, 04 §3.2) — the History → Calendar screen:
 * `CalendarMonth` month pager, "🔥 N-week streak" header, and a day-tap
 * sheet listing that day's workouts (tap-through to detail) or a "Log past
 * workout" CTA on empty days. Reached via `HistoryListScreen`'s Calendar
 * icon (`router.push('/history/calendar')`, already wired in M4-03) — this
 * file is the screen that seam was left pointing at. No back button in the
 * header — same "rely on the native swipe-back gesture, no explicit
 * chevron" convention `HistoryDetailScreen.tsx` (M2-14) already established
 * for a plain pushed stack screen under this app's `headerShown: false`
 * root `<Stack>` (`app/_layout.tsx`).
 *
 * ## Data flow — two independently-cached queries, one shared local re-bucket
 *
 * - `['calendar', 'month', year, month]` — `workoutRepository.workoutDates`
 *   over a generously padded window (`month ± 7 days`, always wide enough
 *   to cover the rendered grid's leading/trailing days regardless of
 *   `first_day_of_week`, `calendar-month-model.ts`'s own header explains
 *   why this decouples the *query* from the setting). Re-bucketed into the
 *   actual 7-wide grid by `buildMonthGrid` inside a `useMemo` keyed on the
 *   live `first_day_of_week` setting — a setting change re-renders the grid
 *   instantly with zero extra invalidation plumbing (04 §3.2's "Streak
 *   respects first-day-of-week changes ... recomputes" acceptance line;
 *   this file's own task text: "make sure the calendar/streak recomputes
 *   reactively off Query invalidation like the rest of the app does" — the
 *   *data* layer already satisfies that via `invalidateAfterWorkoutMutation`
 *   below, and the *setting* layer via this reactive `useMemo`).
 * - `['calendar', 'streak']` — `workoutRepository.workoutDates()`,
 *   deliberately **unbounded** (no `range`): a streak can run arbitrarily
 *   far back in history, and there's no natural bound to pass short of
 *   "however far back the user has ever logged" — `WorkoutDatesRange`'s own
 *   doc comment reasons this is still one cheap indexed scan at this app's
 *   realistic personal-history scale. Independent of which month is
 *   currently paged in the grid above — the streak always reflects "now,"
 *   not the viewed month.
 *
 * Both keys share the `'calendar'` prefix `invalidateAfterWorkoutMutation`
 * (`records-service.ts`, already wired from every workout mutation that can
 * move history — finish/edit/delete) already invalidates broadly, so
 * finishing, editing, or deleting a workout anywhere in the app refetches
 * both queries and the grid/streak recompute on the next render — no new
 * invalidation call needed here (verified by this task's own test suite:
 * `CalendarScreen.test.tsx`'s "deleting a workout" case exercises exactly
 * this path via a real `QueryClient`).
 *
 * The day-sheet's own workout list (`['calendar', 'day', date]`,
 * `workoutRepository.workoutsForDate`) matches the same `'calendar'` prefix
 * too, for the same reason.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import type { WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
import { computeWeekStreak, parseLocalDateKey } from '@/domain/streaks';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { CalendarMonth, type CalendarMonthDayCell } from '@/ui/CalendarMonth';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

import { buildMonthGrid, formatMonthLabel, formatStreakLabel, weekdayLabels } from './calendar-month-model';

export interface CalendarScreenProps {
  workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'>;
  testID?: string;
}

interface ViewMonth {
  year: number;
  month: number;
}

function currentViewMonth(now: Date): ViewMonth {
  return { year: now.getFullYear(), month: now.getMonth() };
}

function shiftMonth({ year, month }: ViewMonth, delta: number): ViewMonth {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Padded fetch window for the month grid — see file header ("generously padded window"). */
function monthQueryRange({ year, month }: ViewMonth): { start: number; end: number } {
  const start = new Date(year, month, 1);
  start.setDate(start.getDate() - 7);
  const end = new Date(year, month + 1, 1);
  end.setDate(end.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}

function formatWorkoutTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Log past workout" retro entry point (02 §1's "chosen date 12:00" convention, `ActiveWorkoutScreen.tsx`'s own `defaultRetroStartTime`). */
function retroStartTimeForDate(date: string): number {
  const noon = parseLocalDateKey(date);
  noon.setHours(12, 0, 0, 0);
  return noon.getTime();
}

export function CalendarScreen({
  workoutRepository,
  testID = 'calendar-screen',
}: CalendarScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const firstDayOfWeek = useSettingsStore((state) => state.settings.first_day_of_week);

  const [viewMonth, setViewMonth] = useState<ViewMonth>(() => currentViewMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const range = useMemo(() => monthQueryRange(viewMonth), [viewMonth]);

  const monthQuery = useQuery({
    queryKey: ['calendar', 'month', viewMonth.year, viewMonth.month],
    queryFn: () => workoutRepository.workoutDates(range),
  });

  const streakQuery = useQuery({
    queryKey: ['calendar', 'streak'],
    queryFn: () => workoutRepository.workoutDates(),
  });

  const weeks = useMemo(
    () => buildMonthGrid(viewMonth.year, viewMonth.month, firstDayOfWeek, monthQuery.data ?? []),
    [viewMonth, firstDayOfWeek, monthQuery.data],
  );

  const streakWeeks = useMemo(
    () => computeWeekStreak(streakQuery.data ?? [], { firstDayOfWeek }),
    [streakQuery.data, firstDayOfWeek],
  );

  const dayWorkoutsQuery = useQuery({
    queryKey: ['calendar', 'day', selectedDate],
    queryFn: () => workoutRepository.workoutsForDate(selectedDate as string),
    enabled: selectedDate != null,
  });

  const handlePrevMonth = (): void => setViewMonth((current) => shiftMonth(current, -1));
  const handleNextMonth = (): void => setViewMonth((current) => shiftMonth(current, 1));

  const handleDayPress = (cell: CalendarMonthDayCell): void => {
    setSelectedDate(cell.date);
  };

  const handleDismissSheet = (): void => {
    setSelectedDate(null);
  };

  const handleWorkoutPress = (workoutId: string): void => {
    setSelectedDate(null);
    router.push(`/history/${workoutId}` as never);
  };

  const handleLogPastWorkout = (): void => {
    if (selectedDate == null) {
      return;
    }
    const startTime = retroStartTimeForDate(selectedDate);
    setSelectedDate(null);
    router.push(`/workout/active?retro=1&startTime=${startTime}` as never);
  };

  const dayWorkouts: WorkoutSummary[] = dayWorkoutsQuery.data ?? [];
  const isDayEmpty = selectedDate != null && !dayWorkoutsQuery.isLoading && dayWorkouts.length === 0;

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View style={{ paddingHorizontal: spacing['4'], paddingTop: spacing['4'] }}>
        <Text style={[typography.title2, { color: colors.text.primary }]}>Calendar</Text>
        <Text
          testID={`${testID}-streak`}
          style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}
        >
          {formatStreakLabel(streakWeeks)}
        </Text>
      </View>

      <CalendarMonth
        testID={`${testID}-month`}
        monthLabel={formatMonthLabel(viewMonth.year, viewMonth.month)}
        weekdayLabels={weekdayLabels(firstDayOfWeek)}
        weeks={weeks}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onDayPress={handleDayPress}
        style={{ paddingHorizontal: spacing['4'], marginTop: spacing['5'] }}
      />

      <Sheet
        testID={`${testID}-day-sheet`}
        visible={selectedDate != null}
        onDismiss={handleDismissSheet}
        detent="half"
      >
        <View style={{ padding: spacing['4'] }}>
          <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
            {selectedDate ?? ''}
          </Text>

          {dayWorkoutsQuery.isLoading ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : isDayEmpty ? (
            <View>
              <Text
                style={[
                  typography.subhead,
                  { color: colors.text.secondary, marginBottom: spacing['4'] },
                ]}
              >
                No workouts on this day.
              </Text>
              <Button
                testID={`${testID}-log-past-workout`}
                label="Log past workout"
                variant="tonal"
                onPress={handleLogPastWorkout}
              />
            </View>
          ) : (
            <View>
              {dayWorkouts.map((workout, index) => (
                <ListRow
                  key={workout.id}
                  testID={`${testID}-day-workout-${workout.id}`}
                  title={workout.title}
                  subtitle={formatWorkoutTime(workout.startTime)}
                  chevron
                  hideSeparator={index === dayWorkouts.length - 1}
                  onPress={() => handleWorkoutPress(workout.id)}
                />
              ))}
            </View>
          )}
        </View>
      </Sheet>
    </View>
  );
}
