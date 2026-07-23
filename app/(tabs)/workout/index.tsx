/**
 * Workout tab placeholder (M0-08) — routines hub (06 §3). Real screen
 * (routine list, Start Routine, quick-start) lands in later milestones.
 */
import React from 'react';
import { Dumbbell } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

export default function WorkoutScreen(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <EmptyState
        icon={<Dumbbell size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
        title="No active routines yet"
        caption="Your routines and Start Workout button will live here."
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
