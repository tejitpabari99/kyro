/**
 * Workout tab placeholder (M0-08, extended M2-05) — routines hub (06 §3).
 * The real routines hub UI (routine list, Start Routine, quick-start)
 * lands in M3-02; this task only adds the one functional entry point 02
 * §1 requires today: "Workout tab → `Start Empty Workout` (full-width
 * primary button): creates an active workout with no exercises,
 * `start_time = now`, auto title by time of day."
 *
 * The actual `startEmpty` call + auto-title happen inside
 * `ActiveWorkoutScreen`'s own mount effect (M2-05) once navigation lands
 * on `/workout/active` — this screen's only job is the **one-active-workout
 * gate** (02 §1): if a workout is already active, tapping the button must
 * show the Resume / Discard-and-start (destructive, second confirm) /
 * Cancel action sheet instead of silently overwriting it. `Alert.alert`
 * with a button array is this codebase's established action-sheet/confirm
 * pattern (no dedicated `ActionSheet` primitive exists yet — see
 * `ExerciseDetailScreen.tsx`'s delete/archive-offer flow, M1-10, for the
 * same shape).
 */
import React from 'react';
import { Dumbbell } from 'lucide-react-native';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { selectActiveWorkout, useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

function navigateToLogger(): void {
  router.push('/workout/active' as never);
}

export default function WorkoutScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const activeWorkout = useActiveWorkoutStore(selectActiveWorkout);

  const confirmDiscardAndStartNew = (): void => {
    Alert.alert('Discard workout?', 'All entered data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void useActiveWorkoutStore
            .getState()
            .discard()
            .then(() => navigateToLogger());
        },
      },
    ]);
  };

  const handleStartEmptyPress = (): void => {
    if (!activeWorkout) {
      navigateToLogger();
      return;
    }
    // 02 §1: "Attempting to start a workout while one is active shows an
    // action sheet: Resume current workout / Discard current and start new
    // (destructive, second confirm) / Cancel."
    Alert.alert('Workout in Progress', `"${activeWorkout.title}" is still active.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resume', onPress: navigateToLogger },
      { text: 'Discard & Start New', style: 'destructive', onPress: confirmDiscardAndStartNew },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <EmptyState
        icon={<Dumbbell size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
        title="No active routines yet"
        caption="Your routines will live here. Start an empty workout to begin logging."
        cta={
          <Button
            testID="start-empty-workout"
            label="Start Empty Workout"
            variant="primary"
            size="lg"
            onPress={handleStartEmptyPress}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
