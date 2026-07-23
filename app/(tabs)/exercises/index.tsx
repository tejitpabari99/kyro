/**
 * Exercises tab placeholder (M0-08) — exercise library browse (06 §3). Real
 * screen (search, filters, FlashList of ~870 exercises) lands in M1/M2.
 */
import React from 'react';
import { BookOpen } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

export default function ExercisesScreen(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <EmptyState
        icon={<BookOpen size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
        title="Exercise library coming soon"
        caption="Search and browse exercises will live here."
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
