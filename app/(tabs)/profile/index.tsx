/**
 * Profile tab placeholder (M0-08) — statistics, measures, settings hub
 * (06 §3). Real screen lands in later milestones.
 *
 * Dev-only "Design Gallery" row: the *only* in-app link to `app/dev/
 * gallery.tsx`, rendered exclusively when `__DEV__` — production/TestFlight
 * builds show no way to reach it (M0-08's dev-gallery access guard).
 */
import React from 'react';
import { FlaskConical, User } from 'lucide-react-native';
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
      {__DEV__ ? (
        <View style={styles.devSection}>
          <ListRow
            testID="dev-gallery-link"
            title="Design Gallery (DEV)"
            subtitle="Every src/ui primitive, both themes"
            leading={<FlaskConical size={20} strokeWidth={1.75} color={colors.text.secondary} />}
            chevron
            hideSeparator
            onPress={() => router.push('/dev/gallery')}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devSection: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
});
