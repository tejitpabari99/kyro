/**
 * History tab placeholder (M0-08) — workout history list/calendar (06 §3).
 * Real screen lands in later milestones.
 */
import React from 'react';
import { History } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

export default function HistoryScreen(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <EmptyState
        icon={<History size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
        title="No workouts logged yet"
        caption="Finished workouts will show up here."
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
