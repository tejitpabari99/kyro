/**
 * `GlobalWorkoutBar` (M2-13) — 06 §3: "`GlobalWorkoutBar` (rendered in the
 * tabs layout, above the tab bar) appears whenever `activeWorkout != null &&
 * !loggerVisible`, and re-presents the route on tap." 02 §10 / 07 §5's
 * literal content: "workout title + live elapsed time; when a rest timer
 * runs, remaining time replaces elapsed (accent-colored). Tap → re-expand."
 *
 * Rendered unconditionally by `app/(tabs)/_layout.tsx` (M0-08's reserved
 * seam) as a sibling *after* `<Tabs>`, positioned absolutely so it can float
 * above the tab bar without needing a slot inside the navigator itself.
 * `<Tabs>` (expo-router, wrapping React Navigation's bottom-tabs) doesn't
 * expose its own rendered tab-bar height to a sibling outside the navigator
 * tree — `useBottomTabBarHeight()` only resolves inside a screen actually
 * hosted by that navigator — so this file approximates it with
 * `TAB_BAR_HEIGHT_APPROX`, a flat constant already folding in a typical
 * home-indicator/bottom-safe-area allowance. A real per-device safe-area
 * inset (`react-native-safe-area-context`'s `useSafeAreaInsets`) would be
 * more precise, but nothing in this app is wrapped in a `SafeAreaProvider`
 * yet (confirmed by search — no screen anywhere uses that hook or
 * `SafeAreaView`), and adding that provider app-wide is a real infra change
 * outside this task's own scope; a documented flat approximation here is
 * the reasonable call rather than either crashing (the hook throws with no
 * provider ancestor) or silently wiring in a wider change unasked.
 *
 * **Two data sources, one visibility gate:**
 *  - `activeWorkoutStore` (`selectActiveWorkout`) — the workout itself
 *    (`null` when none active, e.g. finished/discarded or never started).
 *  - `loggerVisibilityStore` — `true` while `ActiveWorkoutScreen` is mounted
 *    (its own mount/unmount effect owns this flag; see that store's header).
 * `shouldShow = workout != null && !loggerVisible` is 06 §3's condition
 * verbatim.
 *
 * **Elapsed vs. remaining:** `useRestTimerStore`'s `timer` is global
 * (there is only ever one active workout, so any running timer necessarily
 * belongs to it — nothing here needs to cross-check `exerciseId` against
 * this workout's own exercises). When a timer is running, its remaining
 * time (accent-colored, per 02 §10) replaces the elapsed display outright,
 * matching the logger's own inline countdown affordance (M2-10/M2-11's
 * scope, not duplicated here — this bar never needs progress rings or
 * ±15s/Skip controls, just the readable countdown text 02 §10 asks for).
 *
 * **Ticking:** reuses `useRestTimerTicker` (M2-10, `active`-gated 250 ms
 * ticker) as the shared "now" driver for *both* the elapsed and remaining
 * math, rather than adding a third near-duplicate ticking hook alongside
 * `useWorkoutStopwatch`'s own internal 1 s one — 06 §6.1 only requires "a
 * 1 s interval hook," not literally a single shared implementation, and
 * 250 ms is strictly finer (never wrong, just more frequent) than the "~1 s
 * is fine" this task's own brief calls for. Gated on `shouldShow` so the
 * interval genuinely doesn't exist on every tab the rest of the time (same
 * "active only while a surface is visible" discipline that hook's own file
 * header describes). Elapsed math itself is `computeElapsedMs`
 * (`useWorkoutStopwatch.ts`) — the exact same formula the full logger's own
 * stopwatch uses, so the two surfaces can never diverge.
 *
 * **Pause state across minimize (documented judgment call):** the logger's
 * own `useWorkoutStopwatch` pause is ephemeral local UI state, never
 * persisted until `resume()` (that hook's own file header). Minimizing
 * unmounts `ActiveWorkoutScreen` outright, so a pause that is still active
 * at the moment of minimize is lost — this bar (and the logger, if
 * re-presented) simply resumes computing live elapsed from
 * `workout.startTime`/`workout.durationPauseOffsetMs` as if never paused.
 * This is a direct, structural extension of the exact gap
 * `useWorkoutStopwatch.ts`'s own header already calls out for a kill
 * ("a pause that is still active when the app is killed does not survive
 * relaunch as 'still paused'") — minimizing is the same kind of unmount, so
 * the same acceptance applies; not silently assumed, restated here.
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

import { formatDuration } from '@/domain/units';
import { useTheme } from '@/ui/theme-provider';

import { selectActiveWorkout, useActiveWorkoutStore } from './activeWorkoutStore';
import { useLoggerVisibilityStore } from './loggerVisibilityStore';
import { useRestTimerStore } from './restTimerStore';
import { useRestTimerTicker } from './useRestTimerTicker';
import { computeElapsedMs } from './useWorkoutStopwatch';

/** Approximate iOS tab-bar height, home-indicator allowance included — see file header. */
const TAB_BAR_HEIGHT_APPROX = 83;
const BAR_HEIGHT = 52;

export function GlobalWorkoutBar(): React.JSX.Element | null {
  const { colors, typography, spacing } = useTheme();

  const workout = useActiveWorkoutStore(selectActiveWorkout);
  const loggerVisible = useLoggerVisibilityStore((state) => state.visible);
  const timer = useRestTimerStore((state) => state.timer);

  const shouldShow = workout != null && !loggerVisible;
  const now = useRestTimerTicker(shouldShow);

  if (!shouldShow || !workout) {
    return null;
  }

  const remainingMs = timer ? Math.max(0, timer.endsAt - now) : null;
  const showingRemaining = remainingMs !== null;
  const displaySeconds = showingRemaining
    ? Math.ceil(remainingMs / 1000)
    : Math.floor(computeElapsedMs(workout.startTime, workout.durationPauseOffsetMs, now) / 1000);
  const displayText = formatDuration(displaySeconds) ?? '0:00';

  const handlePress = (): void => {
    // Same "enter the logger" navigation the Workout tab's own
    // `Start Empty Workout`/resume path uses (`app/(tabs)/workout/index.tsx`)
    // — a plain `router.push`, no gate needed here since a workout is
    // already known active (that's this bar's own visibility condition).
    router.push('/workout/active' as never);
  };

  return (
    <Pressable
      testID="global-workout-bar"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Resume workout: ${workout.title}`}
      style={[
        styles.bar,
        {
          bottom: TAB_BAR_HEIGHT_APPROX,
          height: BAR_HEIGHT,
          backgroundColor: colors.bg.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border.hairline,
          paddingHorizontal: spacing['4'],
        },
      ]}
    >
      <Text
        testID="global-workout-bar-title"
        style={[typography.subhead, { color: colors.text.primary, flex: 1 }]}
        numberOfLines={1}
      >
        {workout.title}
      </Text>
      <Text
        testID="global-workout-bar-time"
        style={[
          typography.subhead,
          styles.time,
          { color: showingRemaining ? colors.accent.text : colors.text.secondary },
        ]}
      >
        {displayText}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});
