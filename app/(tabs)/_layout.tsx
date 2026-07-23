/**
 * Tab bar layout (M0-08) — 06 §3 tab structure (workout | history |
 * exercises | profile + `GlobalWorkoutBar` overlay) and 07 §6/§4 tab-bar
 * spec: `bg.surface` with a subtle top hairline; active = accent icon +
 * label; inactive `text.tertiary`; no center FAB (Start lives in the
 * Workout tab). Icons per 07 §4: Workout `dumbbell`, History `history`,
 * Exercises `book-open`, Profile `user`, 24 pt / 1.75 pt stroke.
 */
import React from 'react';
import { BookOpen, Dumbbell, History, User } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';

import { GlobalWorkoutBar } from '@/features/workout/GlobalWorkoutBar';
import { useTheme } from '@/ui/theme-provider';

const TAB_ICON_SIZE = 24;
const TAB_ICON_STROKE_WIDTH = 1.75;

export default function TabsLayout(): React.JSX.Element {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent.primary,
          tabBarInactiveTintColor: colors.text.tertiary,
          tabBarLabelStyle: { fontSize: typography.caption.fontSize, fontWeight: '600' },
          tabBarStyle: {
            backgroundColor: colors.bg.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border.hairline,
          },
        }}
      >
        <Tabs.Screen
          name="workout"
          options={{
            title: 'Workout',
            tabBarIcon: ({ color }) => (
              <Dumbbell size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color }) => (
              <History size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="exercises"
          options={{
            title: 'Exercises',
            tabBarIcon: ({ color }) => (
              <BookOpen size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <User size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} color={color} />
            ),
          }}
        />
      </Tabs>

      {/*
       * `GlobalWorkoutBar` overlay slot (06 §3: "rendered in the tabs
       * layout, above the tab bar"). Reserved seam only — the component is
       * a no-op (`return null`) until M2-13 wires it to `activeWorkoutStore`.
       * Rendered as a sibling after `<Tabs>` so its future absolutely-
       * positioned mini-player can sit above the tab bar without this
       * layout needing to change again.
       */}
      <GlobalWorkoutBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
