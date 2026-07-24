/**
 * "Warm-up Calculator" settings screen (M2-16, 02 §12/§13 item 4) — the
 * `warmup_calc` settings key's own editor: formula rows (percent + reps,
 * add/remove/edit), a `Reset to Default` action (restores `SETTINGS_DEFAULTS
 * .warmup_calc`, 05 §3.5/00 P8), and the plate/dumbbell rounding increments.
 * `AddWarmUpSetsSheet` (`src/features/workout/`) is the consumer of
 * whatever this screen writes — this file only edits `warmup_calc`, it
 * never runs the formula itself.
 *
 * `app/(tabs)/profile/settings/index.tsx`'s own header notes the full
 * Settings surface (grouped Units/General/Workouts/... screens, 04 §7) is
 * M5-04's scope; M2-17 (dependent on this task) is what actually links a
 * "Warm-up Calculator" row from a future Settings → Workouts list into this
 * route. Until then this screen is reachable directly by route
 * (`/profile/settings/warmup-calculator`) — same standalone-route shape
 * M2-16's task text asks for ("a 'Warm-up Calculator' settings screen").
 *
 * ## Local draft + best-effort commit (why not fully store-controlled)
 *
 * Every numeric field keeps its own **text** buffer in local state (not
 * derived from the store on each render) so clearing a field to retype a
 * value doesn't immediately snap back to the last-committed number — the
 * same problem `NumericInput`'s own doc comment describes for the set
 * table's cells, solved there via `onBlur`-commit; solved here via
 * **write-through on every keystroke, but only once the *whole* form
 * parses validly** ({@link tryCommit}): an in-progress edit (e.g. an
 * emptied field, or a `-` mid-typing a negative-looking string the
 * sanitizer already blocks) simply doesn't write through yet, but never
 * loses what's on screen. Add/remove-row and Reset always produce a fully
 * valid draft, so those commit immediately.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { SETTINGS_DEFAULTS, type WarmupCalcSet } from '@/data/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { NumericInput, sanitizeNumericInput } from '@/ui/NumericInput';
import { useTheme } from '@/ui/theme-provider';

interface RowDraft {
  percentText: string;
  repsText: string;
}

function rowDraftsFromSets(sets: readonly WarmupCalcSet[]): RowDraft[] {
  return sets.map((s) => ({ percentText: String(s.percent), repsText: String(s.reps) }));
}

/** `null` when any row (or either increment) doesn't yet parse to a valid value — the caller skips the store write-through in that case. */
function parseRows(rows: readonly RowDraft[]): WarmupCalcSet[] | null {
  const parsed: WarmupCalcSet[] = [];
  for (const row of rows) {
    // `Number('')` is `0`, not `NaN` — an emptied field must be rejected
    // explicitly, or clearing a field to retype it would transiently
    // "successfully" commit a stray `0`/`percent: 0` row.
    if (row.percentText.trim() === '' || row.repsText.trim() === '') {
      return null;
    }
    const percent = Number(row.percentText);
    const reps = Number(row.repsText);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return null;
    }
    if (!Number.isInteger(reps) || reps <= 0) {
      return null;
    }
    parsed.push({ percent, reps });
  }
  return parsed;
}

function parseIncrement(text: string): number | null {
  if (text.trim() === '') {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const DEFAULT_NEW_ROW: RowDraft = { percentText: '50', repsText: '5' };

export default function WarmupCalculatorScreen(): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  // Lazy-seeded once from the store's current snapshot (settings are
  // already loaded by boot time every real call site reaches this screen,
  // same assumption `app/(tabs)/profile/settings/index.tsx` makes) — this
  // screen owns the draft from then on; see file header.
  const [rows, setRows] = useState<RowDraft[]>(() =>
    rowDraftsFromSets(useSettingsStore.getState().settings.warmup_calc.sets),
  );
  const [plateIncrementText, setPlateIncrementText] = useState(() =>
    String(useSettingsStore.getState().settings.warmup_calc.plate_increment_kg),
  );
  const [dumbbellIncrementText, setDumbbellIncrementText] = useState(() =>
    String(useSettingsStore.getState().settings.warmup_calc.dumbbell_increment_kg),
  );

  const tryCommit = (
    nextRows: readonly RowDraft[],
    nextPlateText: string,
    nextDumbbellText: string,
  ): void => {
    const sets = parseRows(nextRows);
    const plateIncrementKg = parseIncrement(nextPlateText);
    const dumbbellIncrementKg = parseIncrement(nextDumbbellText);
    if (sets === null || plateIncrementKg === null || dumbbellIncrementKg === null) {
      return;
    }
    void useSettingsStore.getState().setSetting('warmup_calc', {
      sets,
      plate_increment_kg: plateIncrementKg,
      dumbbell_increment_kg: dumbbellIncrementKg,
    });
  };

  const handlePercentChange = (index: number, text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'decimal');
    const nextRows = rows.map((row, i) => (i === index ? { ...row, percentText: sanitized } : row));
    setRows(nextRows);
    tryCommit(nextRows, plateIncrementText, dumbbellIncrementText);
  };

  const handleRepsChange = (index: number, text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'integer');
    const nextRows = rows.map((row, i) => (i === index ? { ...row, repsText: sanitized } : row));
    setRows(nextRows);
    tryCommit(nextRows, plateIncrementText, dumbbellIncrementText);
  };

  const handleRemoveRow = (index: number): void => {
    const nextRows = rows.filter((_, i) => i !== index);
    setRows(nextRows);
    tryCommit(nextRows, plateIncrementText, dumbbellIncrementText);
  };

  const handleAddRow = (): void => {
    const nextRows = [...rows, DEFAULT_NEW_ROW];
    setRows(nextRows);
    tryCommit(nextRows, plateIncrementText, dumbbellIncrementText);
  };

  const handleReset = (): void => {
    const defaults = SETTINGS_DEFAULTS.warmup_calc;
    const nextRows = rowDraftsFromSets(defaults.sets);
    const nextPlateText = String(defaults.plate_increment_kg);
    const nextDumbbellText = String(defaults.dumbbell_increment_kg);
    setRows(nextRows);
    setPlateIncrementText(nextPlateText);
    setDumbbellIncrementText(nextDumbbellText);
    tryCommit(nextRows, nextPlateText, nextDumbbellText);
  };

  const handlePlateIncrementChange = (text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'decimal');
    setPlateIncrementText(sanitized);
    tryCommit(rows, sanitized, dumbbellIncrementText);
  };

  const handleDumbbellIncrementChange = (text: string): void => {
    const sanitized = sanitizeNumericInput(text, 'decimal');
    setDumbbellIncrementText(sanitized);
    tryCommit(rows, plateIncrementText, sanitized);
  };

  return (
    <View
      testID="settings-warmup-calc-screen"
      style={{ flex: 1, backgroundColor: colors.bg.base, padding: spacing['4'] }}
    >
      <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['2'] }]}>
        Warm-up Calculator
      </Text>
      <Text
        style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['4'] }]}
      >
        Each row is a warm-up set: a percent of your working weight (0% = the empty bar) and a
        rep target.
      </Text>

      <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
        FORMULA
      </Text>
      {rows.map((row, index) => (
        <View
          key={index}
          testID={`settings-warmup-calc-row-${index}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing['2'],
          }}
        >
          <NumericInput
            testID={`settings-warmup-calc-row-${index}-percent`}
            value={row.percentText}
            onChangeText={(text) => handlePercentChange(index, text)}
            mode="decimal"
            accessibilityLabel={`Warm-up row ${index + 1} percent of working weight`}
            style={{ marginRight: spacing['2'], minWidth: 64 }}
          />
          <Text style={[typography.footnote, { color: colors.text.secondary, marginRight: spacing['2'] }]}>
            %  ×
          </Text>
          <NumericInput
            testID={`settings-warmup-calc-row-${index}-reps`}
            value={row.repsText}
            onChangeText={(text) => handleRepsChange(index, text)}
            mode="integer"
            accessibilityLabel={`Warm-up row ${index + 1} reps`}
            style={{ marginRight: spacing['2'], minWidth: 56 }}
          />
          <Text style={[typography.footnote, { color: colors.text.secondary, marginRight: spacing['2'] }]}>
            reps
          </Text>
          <Pressable
            testID={`settings-warmup-calc-row-${index}-remove`}
            accessibilityRole="button"
            accessibilityLabel={`Remove warm-up row ${index + 1}`}
            hitSlop={8}
            onPress={() => handleRemoveRow(index)}
            style={{ marginLeft: 'auto', padding: spacing['1'] }}
          >
            <Trash2 size={18} strokeWidth={1.75} color={colors.semantic.danger} />
          </Pressable>
        </View>
      ))}

      <Button
        testID="settings-warmup-calc-add-row"
        label="+ Add Row"
        variant="ghost"
        size="sm"
        onPress={handleAddRow}
        style={{ alignSelf: 'flex-start', marginTop: spacing['1'], marginBottom: spacing['3'] }}
      />

      <Button
        testID="settings-warmup-calc-reset"
        label="Reset to Default"
        variant="tonal"
        size="sm"
        onPress={handleReset}
        style={{ alignSelf: 'flex-start', marginBottom: spacing['6'] }}
      />

      <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
        ROUNDING INCREMENTS (KG)
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['2'] }}>
        <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>
          Plate-loaded (barbell)
        </Text>
        <NumericInput
          testID="settings-warmup-calc-plate-increment"
          value={plateIncrementText}
          onChangeText={handlePlateIncrementChange}
          mode="decimal"
          accessibilityLabel="Plate-loaded rounding increment in kilograms"
          style={{ minWidth: 64, borderRadius: radii.sm }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>Dumbbell</Text>
        <NumericInput
          testID="settings-warmup-calc-dumbbell-increment"
          value={dumbbellIncrementText}
          onChangeText={handleDumbbellIncrementChange}
          mode="decimal"
          accessibilityLabel="Dumbbell rounding increment in kilograms"
          style={{ minWidth: 64, borderRadius: radii.sm }}
        />
      </View>
    </View>
  );
}
