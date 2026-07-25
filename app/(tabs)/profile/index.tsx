/**
 * Profile tab placeholder (M0-08, +M0-10's Settings link, +M4-08's
 * Statistics link) — statistics, measures, settings hub (06 §3). Real
 * screen lands in later milestones; for now the functional rows are
 * Statistics (M4-08's dashboard, `profile/statistics`), Settings (M0-10's
 * minimal theme + weight-unit screen at `profile/settings/`), and Archived
 * Exercises (M1-10, 03 §5 / 04 §7's "Profile → Exercises → Archived"
 * shortcut).
 *
 * Dev-only "Design Gallery" row: the *only* in-app link to `app/dev/
 * gallery.tsx`, rendered exclusively when `__DEV__` — production/TestFlight
 * builds show no way to reach it (M0-08's dev-gallery access guard).
 */
import React from 'react';
import { ArchiveRestore, BarChart3, FlaskConical, Settings as SettingsIcon, User } from 'lucide-react-native';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { useTheme } from '@/ui/theme-provider';

export default function ProfileScreen(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <EmptyState
        icon={<User size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
        title="Profile coming soon"
        caption="Statistics, measurements, and settings will live here."
      />
      <View style={styles.bottomSection}>
        <ListRow
          testID="statistics-link"
          title="Statistics"
          subtitle="Workouts, volume, muscle distribution"
          leading={<BarChart3 size={20} strokeWidth={1.75} color={colors.text.secondary} />}
          chevron
          onPress={() => router.push('/profile/statistics')}
        />
        <ListRow
          testID="settings-link"
          title="Settings"
          subtitle="Theme, units"
          leading={<SettingsIcon size={20} strokeWidth={1.75} color={colors.text.secondary} />}
          chevron
          onPress={() => router.push('/profile/settings')}
        />
        <ListRow
          testID="archived-exercises-link"
          title="Archived Exercises"
          subtitle="Restore exercises you've archived"
          leading={<ArchiveRestore size={20} strokeWidth={1.75} color={colors.text.secondary} />}
          chevron
          hideSeparator={!__DEV__}
          onPress={() => router.push('/profile/exercises-archived')}
        />
        {__DEV__ ? (
          <ListRow
            testID="dev-gallery-link"
            title="Design Gallery (DEV)"
            subtitle="Every src/ui primitive, both themes"
            leading={<FlaskConical size={20} strokeWidth={1.75} color={colors.text.secondary} />}
            chevron
            hideSeparator
            onPress={() => router.push('/dev/gallery')}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
});
