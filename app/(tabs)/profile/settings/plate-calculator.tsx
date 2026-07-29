/**
 * "Plate Calculator" settings screen (M2-15, 02 §11/§13 item 7) — the
 * `plate_calc` settings key's own editor: an Enabled toggle (gates the
 * accessory-bar Calculator button, `ActiveWorkoutScreen.tsx`), the bar
 * list (name + weight, add/remove), the "Available Equipment" plate
 * inventory (weight + count, `null` count = unlimited, add/remove), and
 * `Reset to Default`. `PlateCalculatorSheet` (`src/features/workout/`) is
 * the consumer of whatever this screen writes — this file only edits
 * `plate_calc`, it never runs the solver itself. Same standalone-route
 * shape (reachable directly by route today; M2-17 links a Settings row to
 * it) and local-draft-then-write-through-once-valid pattern
 * `warmup-calculator.tsx` (M2-16) already established for the sibling
 * calculator settings screen — see that file's own header for the full
 * rationale (not repeated here).
 *
 * ## `Reset to Default` scope (a deliberate choice, unlike `warmup_calc`)
 *
 * `warmup_calc` has no `enabled` flag of its own (a separate top-level
 * `Settings` key gates it) — `plate_calc` bundles `enabled` inside the
 * *same* object this screen edits (05 §3.5:
 * `{enabled, bars, plates}`), and `SETTINGS_DEFAULTS.plate_calc.enabled`
 * is `false` (05 §11: "off by default"). Resetting the *whole* object the
 * way `warmup-calculator.tsx` does would silently flip a user's actively-
 * enabled calculator back off while they're mid-edit of their own
 * equipment list — clearly not the intent of an "Available Equipment"
 * reset action. `Reset to Default` here therefore restores only `bars`/
 * `plates`, leaving `enabled` exactly as the user left it.
 *
 * ## "Unlimited" plate counts
 *
 * `plates[].count === null` is 05 §3.5's own "unlimited" sentinel (05
 * §11's "×∞" default inventory) — each plate row keeps a local `unlimited`
 * boolean draft flag alongside its count text; toggling it off seeds a
 * sensible starting count (`2`, i.e. one pair) rather than leaving the
 * field blank (an emptied-but-*not*-unlimited count is invalid input, same
 * "empty must not silently commit a stray value" rule `warmup-
 * calculator.tsx`'s own `parseIncrement`/`Number('')` note documents).
 */
import React, { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';

import { SETTINGS_DEFAULTS, type PlateCalcBar, type PlateCalcPlate } from '@/data/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { NumericInput, sanitizeNumericInput } from '@/ui/NumericInput';
import { useTheme } from '@/ui/theme-provider';

interface BarDraft {
  nameText: string;
  weightText: string;
}

interface PlateDraft {
  weightText: string;
  countText: string;
  unlimited: boolean;
}

function barDraftsFromBars(bars: readonly PlateCalcBar[]): BarDraft[] {
  return bars.map((b) => ({ nameText: b.name, weightText: String(b.weight_kg) }));
}

function plateDraftsFromPlates(plates: readonly PlateCalcPlate[]): PlateDraft[] {
  return plates.map((p) => ({
    weightText: String(p.weight_kg),
    countText: p.count === null ? '' : String(p.count),
    unlimited: p.count === null,
  }));
}

/** `null` when any bar row doesn't yet parse to a valid `{name, weight_kg}` — the caller skips the store write-through in that case. */
function parseBars(rows: readonly BarDraft[]): PlateCalcBar[] | null {
  const parsed: PlateCalcBar[] = [];
  for (const row of rows) {
    const name = row.nameText.trim();
    if (name === '' || row.weightText.trim() === '') {
      return null;
    }
    const weight_kg = Number(row.weightText);
    if (!Number.isFinite(weight_kg) || weight_kg <= 0) {
      return null;
    }
    parsed.push({ name, weight_kg });
  }
  return parsed;
}

/** `null` when any plate row doesn't yet parse to a valid `{weight_kg, count}` — see {@link parseBars}'s own note. */
function parsePlates(rows: readonly PlateDraft[]): PlateCalcPlate[] | null {
  const parsed: PlateCalcPlate[] = [];
  for (const row of rows) {
    if (row.weightText.trim() === '') {
      return null;
    }
    const weight_kg = Number(row.weightText);
    if (!Number.isFinite(weight_kg) || weight_kg <= 0) {
      return null;
    }
    if (row.unlimited) {
      parsed.push({ weight_kg, count: null });
      continue;
    }
    if (row.countText.trim() === '') {
      return null;
    }
    const count = Number(row.countText);
    if (!Number.isInteger(count) || count < 0) {
      return null;
    }
    parsed.push({ weight_kg, count });
  }
  return parsed;
}

const DEFAULT_NEW_BAR: BarDraft = { nameText: 'New Bar', weightText: '20' };
const DEFAULT_NEW_PLATE: PlateDraft = { weightText: '5', countText: '', unlimited: true };

export default function PlateCalculatorScreen(): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();
  const insets = useSafeAreaInsets();

  const [enabled, setEnabled] = useState(() => useSettingsStore.getState().settings.plate_calc.enabled);
  const [bars, setBars] = useState<BarDraft[]>(() =>
    barDraftsFromBars(useSettingsStore.getState().settings.plate_calc.bars),
  );
  const [plates, setPlates] = useState<PlateDraft[]>(() =>
    plateDraftsFromPlates(useSettingsStore.getState().settings.plate_calc.plates),
  );

  const tryCommit = (
    nextEnabled: boolean,
    nextBars: readonly BarDraft[],
    nextPlates: readonly PlateDraft[],
  ): void => {
    const parsedBars = parseBars(nextBars);
    const parsedPlates = parsePlates(nextPlates);
    if (parsedBars === null || parsedPlates === null) {
      return;
    }
    void useSettingsStore.getState().setSetting('plate_calc', {
      enabled: nextEnabled,
      bars: parsedBars,
      plates: parsedPlates,
    });
  };

  const handleToggleEnabled = (value: boolean): void => {
    setEnabled(value);
    tryCommit(value, bars, plates);
  };

  const handleBarNameChange = (index: number, text: string): void => {
    const nextBars = bars.map((b, i) => (i === index ? { ...b, nameText: text } : b));
    setBars(nextBars);
    tryCommit(enabled, nextBars, plates);
  };

  const handleBarWeightChange = (index: number, text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'decimal');
    const nextBars = bars.map((b, i) => (i === index ? { ...b, weightText: sanitized } : b));
    setBars(nextBars);
    tryCommit(enabled, nextBars, plates);
  };

  const handleRemoveBar = (index: number): void => {
    const nextBars = bars.filter((_, i) => i !== index);
    setBars(nextBars);
    tryCommit(enabled, nextBars, plates);
  };

  const handleAddBar = (): void => {
    const nextBars = [...bars, DEFAULT_NEW_BAR];
    setBars(nextBars);
    tryCommit(enabled, nextBars, plates);
  };

  const handlePlateWeightChange = (index: number, text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'decimal');
    const nextPlates = plates.map((p, i) => (i === index ? { ...p, weightText: sanitized } : p));
    setPlates(nextPlates);
    tryCommit(enabled, bars, nextPlates);
  };

  const handlePlateCountChange = (index: number, text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'integer');
    const nextPlates = plates.map((p, i) => (i === index ? { ...p, countText: sanitized } : p));
    setPlates(nextPlates);
    tryCommit(enabled, bars, nextPlates);
  };

  const handleToggleUnlimited = (index: number): void => {
    const nextPlates = plates.map((p, i) =>
      i === index
        ? { ...p, unlimited: !p.unlimited, countText: p.unlimited ? '2' : p.countText }
        : p,
    );
    setPlates(nextPlates);
    tryCommit(enabled, bars, nextPlates);
  };

  const handleRemovePlate = (index: number): void => {
    const nextPlates = plates.filter((_, i) => i !== index);
    setPlates(nextPlates);
    tryCommit(enabled, bars, nextPlates);
  };

  const handleAddPlate = (): void => {
    const nextPlates = [...plates, DEFAULT_NEW_PLATE];
    setPlates(nextPlates);
    tryCommit(enabled, bars, nextPlates);
  };

  const handleReset = (): void => {
    const defaults = SETTINGS_DEFAULTS.plate_calc;
    const nextBars = barDraftsFromBars(defaults.bars);
    const nextPlates = plateDraftsFromPlates(defaults.plates);
    setBars(nextBars);
    setPlates(nextPlates);
    // `enabled` is deliberately left untouched — see file header.
    tryCommit(enabled, nextBars, nextPlates);
  };

  return (
    <View testID="settings-plate-calc-screen" style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          padding: spacing['4'],
          // BUGFIX-01: `insets.top` clears the status bar/notch — see
          // `app/_layout.tsx`'s header.
          paddingTop: insets.top + spacing['4'],
        }}
      >
        <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['2'] }]}>
          Plate Calculator
        </Text>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['4'] }]}
        >
          Shows a Calculator button on the keyboard toolbar whenever a weight field is focused.
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['5'],
          }}
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>Enabled</Text>
          <Switch
            testID="settings-plate-calc-enabled"
            value={enabled}
            onValueChange={handleToggleEnabled}
          />
        </View>

        <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
          BARS
        </Text>
        {bars.map((bar, index) => (
          <View
            key={index}
            testID={`settings-plate-calc-bar-${index}`}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}
          >
            <NumericInput
              testID={`settings-plate-calc-bar-${index}-weight`}
              value={bar.weightText}
              onChangeText={(text) => handleBarWeightChange(index, text)}
              mode="decimal"
              accessibilityLabel={`Bar ${index + 1} weight in kilograms`}
              style={{ marginRight: spacing['2'], minWidth: 64 }}
            />
            <TextInput
              testID={`settings-plate-calc-bar-${index}-name`}
              value={bar.nameText}
              onChangeText={(text) => handleBarNameChange(index, text)}
              placeholder="Bar name"
              placeholderTextColor={colors.text.tertiary}
              accessibilityLabel={`Bar ${index + 1} name`}
              style={[
                typography.body,
                {
                  flex: 1,
                  color: colors.text.primary,
                  backgroundColor: colors.bg.elevated,
                  borderRadius: radii.sm,
                  paddingHorizontal: spacing['3'],
                  paddingVertical: spacing['2'],
                  marginRight: spacing['2'],
                },
              ]}
            />
            <Pressable
              testID={`settings-plate-calc-bar-${index}-remove`}
              accessibilityRole="button"
              accessibilityLabel={`Remove bar ${index + 1}`}
              hitSlop={8}
              onPress={() => handleRemoveBar(index)}
              style={{ marginLeft: 'auto', padding: spacing['1'] }}
            >
              <Trash2 size={18} strokeWidth={1.75} color={colors.semantic.danger} />
            </Pressable>
          </View>
        ))}
        <Button
          testID="settings-plate-calc-add-bar"
          label="+ Add Bar"
          variant="ghost"
          size="sm"
          onPress={handleAddBar}
          style={{ alignSelf: 'flex-start', marginBottom: spacing['5'] }}
        />

        <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
          AVAILABLE EQUIPMENT (KG)
        </Text>
        {plates.map((plate, index) => (
          <View
            key={index}
            testID={`settings-plate-calc-plate-${index}`}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}
          >
            <NumericInput
              testID={`settings-plate-calc-plate-${index}-weight`}
              value={plate.weightText}
              onChangeText={(text) => handlePlateWeightChange(index, text)}
              mode="decimal"
              accessibilityLabel={`Plate ${index + 1} weight in kilograms`}
              style={{ marginRight: spacing['2'], minWidth: 64 }}
            />
            {plate.unlimited ? (
              <Text
                style={[typography.footnote, { color: colors.text.secondary, marginRight: spacing['2'] }]}
              >
                unlimited
              </Text>
            ) : (
              <NumericInput
                testID={`settings-plate-calc-plate-${index}-count`}
                value={plate.countText}
                onChangeText={(text) => handlePlateCountChange(index, text)}
                mode="integer"
                accessibilityLabel={`Plate ${index + 1} count`}
                style={{ marginRight: spacing['2'], minWidth: 56 }}
              />
            )}
            <Pressable
              testID={`settings-plate-calc-plate-${index}-toggle-unlimited`}
              accessibilityRole="button"
              accessibilityLabel={`Toggle unlimited count for plate ${index + 1}`}
              hitSlop={8}
              onPress={() => handleToggleUnlimited(index)}
              style={{
                paddingHorizontal: spacing['2'],
                paddingVertical: spacing['1'],
                borderRadius: radii.sm,
                backgroundColor: plate.unlimited ? colors.accent.primary : colors.bg.elevated,
                marginRight: spacing['2'],
              }}
            >
              <Text
                style={[
                  typography.footnote,
                  { color: plate.unlimited ? colors.accent.onAccent : colors.text.primary },
                ]}
              >
                ∞
              </Text>
            </Pressable>
            <Pressable
              testID={`settings-plate-calc-plate-${index}-remove`}
              accessibilityRole="button"
              accessibilityLabel={`Remove plate ${index + 1}`}
              hitSlop={8}
              onPress={() => handleRemovePlate(index)}
              style={{ marginLeft: 'auto', padding: spacing['1'] }}
            >
              <Trash2 size={18} strokeWidth={1.75} color={colors.semantic.danger} />
            </Pressable>
          </View>
        ))}
        <Button
          testID="settings-plate-calc-add-plate"
          label="+ Add Plate"
          variant="ghost"
          size="sm"
          onPress={handleAddPlate}
          style={{ alignSelf: 'flex-start', marginTop: spacing['1'], marginBottom: spacing['5'] }}
        />

        <Button
          testID="settings-plate-calc-reset"
          label="Reset to Default"
          variant="tonal"
          size="sm"
          onPress={handleReset}
        />
      </View>
    </View>
  );
}
