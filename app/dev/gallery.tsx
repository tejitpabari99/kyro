/**
 * Dev design gallery (M0-08) — 06/07: a single screen rendering every
 * `src/ui/` primitive with a theme toggle, so both themes can be eyeballed
 * without walking through real feature screens. Dev-only: nothing outside
 * `__DEV__` links here (see `app/(tabs)/profile/index.tsx`'s guarded
 * "Design Gallery" row) — the route file itself still exists in the bundle
 * either way since Expo Router's file-based routing has no
 * conditional-existence mechanism, but that's harmless: it's unreachable
 * without a link and ships no user-facing content.
 *
 * Theme toggle: `useTheme()`'s `setPreference` — the app root's
 * `ThemeProvider` (app/_layout.tsx) is rendered uncontrolled (no
 * `preference`/`onPreferenceChange` passed, pre-M0-10 default per that
 * file's header), so calling `setPreference` here flips the *shared*
 * context value app-wide, live-updating every primitive below.
 */
import React, { useState } from 'react';
import { BookOpen, Dumbbell, History as HistoryIcon, Settings, User } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { Avatar, Thumb } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { NumericInput } from '@/ui/NumericInput';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Sheet } from '@/ui/Sheet';
import { Snackbar } from '@/ui/Snackbar';
import { StatColumn, StatTile } from '@/ui/StatColumn';
import { useTheme, type ThemePreference } from '@/ui/theme-provider';

const BUTTON_VARIANTS = ['primary', 'tonal', 'ghost', 'destructive'] as const;
const BUTTON_SIZES = ['lg', 'md', 'sm'] as const;

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing['8'] }} testID={`gallery-section-${title}`}>
      <Text style={[typography.title3, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function DevGalleryScreen(): React.JSX.Element {
  const { colors, spacing, preference, setPreference } = useTheme();

  const [searchValue, setSearchValue] = useState('');
  const [chipActive, setChipActive] = useState(false);
  const [numericValue, setNumericValue] = useState('');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [demoSegment, setDemoSegment] = useState<'one' | 'two' | 'three'>('one');

  return (
    <ScrollView
      testID="dev-gallery-screen"
      style={{ backgroundColor: colors.bg.base }}
      contentContainerStyle={{ padding: spacing['4'], paddingBottom: spacing['12'] }}
    >
      <Section title="Theme">
        <SegmentedControl
          testID="gallery-theme-toggle"
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
        />
      </Section>

      <Section title="Button">
        {BUTTON_VARIANTS.map((variant) => (
          <View
            key={variant}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing['2'],
              marginBottom: spacing['3'],
            }}
          >
            {BUTTON_SIZES.map((size) => (
              <Button
                key={`${variant}-${size}`}
                label={`${variant} ${size}`}
                variant={variant}
                size={size}
                onPress={() => {}}
              />
            ))}
          </View>
        ))}
        <Button label="destructive fill" variant="destructive" emphasis="fill" onPress={() => {}} />
      </Section>

      <Section title="Card">
        <Card>
          <Text style={{ color: colors.text.primary }}>Card content (bg.surface, radius md)</Text>
        </Card>
      </Section>

      <Section title="ListRow">
        <Card style={{ padding: 0 }}>
          <ListRow
            title="Bench Press"
            subtitle="Barbell — Chest"
            leading={<Dumbbell size={20} strokeWidth={1.75} color={colors.text.secondary} />}
            chevron
            onPress={() => {}}
          />
          <ListRow
            title="Settings"
            leading={<Settings size={20} strokeWidth={1.75} color={colors.text.secondary} />}
            trailing={<Text style={{ color: colors.text.secondary }}>kg</Text>}
            hideSeparator
            onPress={() => {}}
          />
        </Card>
      </Section>

      <Section title="Chip">
        <View style={{ flexDirection: 'row', gap: spacing['2'] }}>
          <Chip label="Chest" active={chipActive} onPress={() => setChipActive((v) => !v)} />
          <Chip label="Equipment" showCaret onPress={() => {}} />
        </View>
      </Section>

      <Section title="SearchBar">
        <SearchBar
          value={searchValue}
          onChangeText={setSearchValue}
          placeholder="Search exercises"
        />
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon={<HistoryIcon size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="No workouts yet"
          caption="Finished workouts will show up here."
          cta={<Button label="Start workout" variant="tonal" onPress={() => {}} />}
        />
      </Section>

      <Section title="Sheet">
        <Button label="Open sheet" variant="tonal" onPress={() => setSheetVisible(true)} />
        <Sheet
          testID="gallery-sheet"
          visible={sheetVisible}
          onDismiss={() => setSheetVisible(false)}
          detent="half"
        >
          <View style={{ padding: spacing['4'] }}>
            <Text style={[{ color: colors.text.primary }]}>
              Sheet content — drag down or tap the scrim to dismiss.
            </Text>
            <View style={{ marginTop: spacing['4'] }}>
              <Button label="Close" onPress={() => setSheetVisible(false)} />
            </View>
          </View>
        </Sheet>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl
          options={[
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
            { value: 'three', label: 'Three' },
          ]}
          value={demoSegment}
          onChange={setDemoSegment}
        />
      </Section>

      <Section title="NumericInput">
        <View style={{ flexDirection: 'row', gap: spacing['3'] }}>
          <NumericInput
            value={numericValue}
            onChangeText={setNumericValue}
            placeholder="0"
            mode="decimal"
          />
          <NumericInput value="" onChangeText={() => {}} placeholder="reps" mode="integer" />
        </View>
      </Section>

      <Section title="Snackbar">
        <Button label="Show snackbar" variant="tonal" onPress={() => setSnackbarVisible(true)} />
        <Snackbar
          testID="gallery-snackbar"
          visible={snackbarVisible}
          message="Exercise removed"
          actionLabel="Undo"
          onAction={() => {}}
          onDismiss={() => setSnackbarVisible(false)}
        />
      </Section>

      <Section title="StatColumn / StatTile">
        <View style={{ flexDirection: 'row', gap: spacing['4'], marginBottom: spacing['3'] }}>
          <StatColumn label="Duration" value="42:10" size="large" valueColor={colors.accent.text} />
          <StatColumn label="Volume" value="8,240 lb" size="small" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing['3'] }}>
          <StatTile
            label="Sets"
            value="24"
            size="large"
            icon={<BookOpen size={16} strokeWidth={1.75} color={colors.text.secondary} />}
          />
          <StatTile label="PRs" value="3" size="large" valueColor={colors.accent.text} />
        </View>
      </Section>

      <Section title="Avatar / Thumb">
        <View style={{ flexDirection: 'row', gap: spacing['4'], alignItems: 'center' }}>
          <Avatar name="Bench Press" />
          <Avatar name="Squat" shape="square" />
          <Thumb name="Deadlift" />
          <User size={24} strokeWidth={1.75} color={colors.text.tertiary} />
        </View>
      </Section>
    </ScrollView>
  );
}
