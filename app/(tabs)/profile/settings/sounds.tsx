/**
 * "Sounds" settings screen (M2-17, 02 §7/§13 item 1) — the nested `sounds`
 * settings key's own editor: which sound plays on rest-timer completion
 * (`timer_sound`: default/bell/beep/none) and three independent volume
 * levels (off/low/normal/high) for the timer chime, the per-set check
 * sound, and general notifications. Playback itself (`src/lib/sound.ts`,
 * M2-11, already wired at the call sites that actually play these cues)
 * is out of scope here — this screen only edits the `sounds` object, same
 * "settings screen writes, feature consumer reads" split
 * `plate-calculator.tsx`/`warmup-calculator.tsx` already establish for
 * their own settings keys.
 *
 * Read via a single reactive `sounds` selector (not four separate ones) so
 * every write-through — done as one whole-object `setSetting('sounds', …)`
 * call per change, matching `SoundsSettings`'s flat shape — re-renders all
 * four controls together; no local draft state is needed since every
 * option here is a closed enum (no free-text parsing/validation like the
 * calculator screens' numeric fields).
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SoundChoice, VolumeLevel } from '@/data/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useTheme } from '@/ui/theme-provider';

const SOUND_OPTIONS: readonly { value: SoundChoice; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'bell', label: 'Bell' },
  { value: 'beep', label: 'Beep' },
  { value: 'none', label: 'None' },
];

const VOLUME_OPTIONS: readonly { value: VolumeLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

export default function SoundsScreen(): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const sounds = useSettingsStore((state) => state.settings.sounds);

  const handleSoundChange = (timer_sound: SoundChoice): void => {
    void useSettingsStore.getState().setSetting('sounds', { ...sounds, timer_sound });
  };
  const handleTimerVolumeChange = (timer_volume: VolumeLevel): void => {
    void useSettingsStore.getState().setSetting('sounds', { ...sounds, timer_volume });
  };
  const handleSetCheckVolumeChange = (set_check_volume: VolumeLevel): void => {
    void useSettingsStore.getState().setSetting('sounds', { ...sounds, set_check_volume });
  };
  const handleNotificationVolumeChange = (notification_volume: VolumeLevel): void => {
    void useSettingsStore.getState().setSetting('sounds', { ...sounds, notification_volume });
  };

  return (
    <ScrollView
      testID="settings-sounds-screen"
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={{
        padding: spacing['4'],
        // BUGFIX-01: `insets.top` clears the status bar/notch — see
        // `app/_layout.tsx`'s header.
        paddingTop: insets.top + spacing['4'],
      }}
    >
      <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
        Sounds
      </Text>

      <View style={{ marginBottom: spacing['5'] }}>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}
        >
          TIMER SOUND
        </Text>
        <SegmentedControl
          testID="settings-sounds-timer-sound"
          options={SOUND_OPTIONS}
          value={sounds.timer_sound}
          onChange={handleSoundChange}
        />
      </View>

      <View style={{ marginBottom: spacing['5'] }}>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}
        >
          TIMER VOLUME
        </Text>
        <SegmentedControl
          testID="settings-sounds-timer-volume"
          options={VOLUME_OPTIONS}
          value={sounds.timer_volume}
          onChange={handleTimerVolumeChange}
        />
      </View>

      <View style={{ marginBottom: spacing['5'] }}>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}
        >
          SET CHECK VOLUME
        </Text>
        <SegmentedControl
          testID="settings-sounds-set-check-volume"
          options={VOLUME_OPTIONS}
          value={sounds.set_check_volume}
          onChange={handleSetCheckVolumeChange}
        />
      </View>

      <View>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}
        >
          NOTIFICATION VOLUME
        </Text>
        <SegmentedControl
          testID="settings-sounds-notification-volume"
          options={VOLUME_OPTIONS}
          value={sounds.notification_volume}
          onChange={handleNotificationVolumeChange}
        />
      </View>
    </ScrollView>
  );
}
