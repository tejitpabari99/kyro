/**
 * `PlateCalculatorSheet` (M2-15, 02 §11) — the Calculator sheet the
 * `KeyboardAccessoryBar`'s Calculator button (M2-08's seam) opens: a target
 * weight (pre-filled from whichever weight field was focused when
 * Calculator was pressed), a bar selector (`settings.plate_calc.bars`), a
 * visual per-side plate diagram from `domain/plate-calc.ts`'s pure
 * `platesFor`, and a one-tap "Use this value" that writes the achieved
 * weight back into that same originating field.
 *
 * ## Write-back target: a captured field id, not "whatever's focused now"
 *
 * `targetFieldId` is a `keyboardFocusStore` field id (`${setId}:${columnKey}`)
 * the caller (`ActiveWorkoutScreen`) captures *once*, synchronously, the
 * moment Calculator is pressed — before this sheet's own target-weight
 * input can steal native focus and blur the originating field (which would
 * otherwise clear `focusedFieldId`, see `keyboardFocusStore.ts`'s own M2-15
 * header note). Every read (`getFieldValue`, the pre-fill) and write
 * (`writeFieldValue`, "Use this value") below addresses that captured id
 * directly.
 *
 * ## Math runs in canonical kg, converts only at the boundary
 *
 * `settings.plate_calc.bars[].weight_kg`/`plates[].weight_kg` are already
 * canonical kg (05 §3.5) — this sheet runs `platesFor` in that same
 * canonical unit (the plates' real physical weight) rather than converting
 * each plate to the display unit first, which would feed the greedy solver
 * slightly-imprecise, unround intermediate numbers for an lb-preferring
 * user (e.g. a real 20 kg plate becoming a `44.092452...`-lb "plate" to
 * fill against). The typed target (display unit) converts to kg once,
 * going in; the achieved total and every plate label convert to the
 * display unit only for rendering (`domain/units.ts`'s `kgToLb`/
 * `formatWeightLb`) — the exact "canonical math, display-only formatting"
 * split `domain/set-cell-values.ts` already uses everywhere else in the
 * logger.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { WeightUnit } from '@/domain/enums';
import { platesFor, type PlateSolution } from '@/domain/plate-calc';
import { formatWeightLb, lbToKg } from '@/domain/units';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { NumericInput, sanitizeNumericInput } from '@/ui/NumericInput';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

import { useKeyboardFocusStore } from './keyboardFocusStore';

export interface PlateCalculatorSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** `keyboardFocusStore` field id captured at the moment Calculator was pressed — see file header. Ignored while `visible` is false. */
  targetFieldId: string;
  weightUnit: WeightUnit;
  testID?: string;
}

function weightSuffix(unit: WeightUnit): string {
  return unit === 'kg' ? 'kg' : 'lb';
}

/** Display-unit -> canonical kg (inverse of the typed target). */
function toCanonicalKg(display: number, unit: WeightUnit): number {
  return unit === 'kg' ? display : (lbToKg(display) as number);
}

/** Display-rounded label for a kg weight (bar/plate labels, the achieved total) — `formatWeightLb` for lb, verbatim kg otherwise (05 §5). */
function displayLabel(kg: number, unit: WeightUnit): string {
  const value = unit === 'kg' ? kg : (formatWeightLb(kg) as number);
  return String(value);
}

export function PlateCalculatorSheet({
  visible,
  onDismiss,
  targetFieldId,
  weightUnit,
  testID = 'plate-calculator-sheet',
}: PlateCalculatorSheetProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();
  const plateCalc = useSettingsStore((s) => s.settings.plate_calc);

  const bars = plateCalc.bars;

  function barbellIndexOrFirst(): number {
    const barbellIndex = bars.findIndex((b) => b.name === 'Barbell');
    return barbellIndex >= 0 ? barbellIndex : 0;
  }

  function prefillDraft(): string {
    const currentKg = useKeyboardFocusStore.getState().getFieldValue(targetFieldId);
    const displayValue =
      currentKg !== null ? (weightUnit === 'kg' ? currentKg : (formatWeightLb(currentKg) as number)) : null;
    return displayValue !== null ? String(displayValue) : '';
  }

  // Seeded once at mount (this component instance persists across
  // open/close — `ActiveWorkoutScreen` toggles its `visible` prop rather
  // than mounting/unmounting it, same shape `AddWarmUpSetsSheet.tsx`'s own
  // sheet uses) via a lazy initializer for the very first open, then
  // re-seeded on every subsequent visible-transition below.
  const [selectedBarIndex, setSelectedBarIndex] = useState(barbellIndexOrFirst);
  const [draft, setDraft] = useState(prefillDraft);

  // Re-seed the draft + bar selection every time the sheet transitions to
  // visible again (mirrors `AddWarmUpSetsSheet.tsx`'s own "derive from a
  // visible transition" pattern) — pre-fills from the captured field's
  // current canonical value, converted to display units.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(prefillDraft());
      setSelectedBarIndex(barbellIndexOrFirst());
    }
  }

  const selectedBar = bars[selectedBarIndex] ?? null;
  const parsedTarget = Number(draft);
  const isValid = draft.trim().length > 0 && Number.isFinite(parsedTarget) && parsedTarget >= 0;

  const targetKg = isValid ? toCanonicalKg(parsedTarget, weightUnit) : null;
  const result =
    targetKg !== null && selectedBar !== null
      ? platesFor(
          targetKg,
          selectedBar.weight_kg,
          plateCalc.plates.map((p) => ({ weight: p.weight_kg, count: p.count })),
        )
      : null;

  const handleUseValue = (solution: PlateSolution): void => {
    useKeyboardFocusStore.getState().writeFieldValue(targetFieldId, solution.achieved);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing['4'], paddingBottom: spacing['6'] }}>
        <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
          Plate Calculator
        </Text>

        <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
          TARGET WEIGHT ({weightSuffix(weightUnit)})
        </Text>
        <NumericInput
          testID={`${testID}-target-input`}
          value={draft}
          onChangeText={(text) => setDraft(sanitizeNumericInput(text, 'decimal'))}
          mode="decimal"
          placeholder="0"
          style={{ alignSelf: 'flex-start', minWidth: 120, borderRadius: radii.sm, marginBottom: spacing['4'] }}
        />

        <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
          BAR
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing['4'] }}>
          {bars.map((bar, index) => {
            const selected = index === selectedBarIndex;
            return (
              <Pressable
                key={bar.name}
                testID={`${testID}-bar-${index}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${bar.name}, ${displayLabel(bar.weight_kg, weightUnit)}${weightSuffix(weightUnit)}`}
                onPress={() => setSelectedBarIndex(index)}
                hitSlop={4}
                style={{
                  paddingHorizontal: spacing['3'],
                  paddingVertical: spacing['2'],
                  borderRadius: radii.pill,
                  marginRight: spacing['2'],
                  marginBottom: spacing['2'],
                  backgroundColor: selected ? colors.accent.primary : colors.bg.elevated,
                }}
              >
                <Text
                  style={[
                    typography.footnote,
                    { color: selected ? colors.accent.onAccent : colors.text.primary },
                  ]}
                >
                  {bar.name} · {displayLabel(bar.weight_kg, weightUnit)}
                  {weightSuffix(weightUnit)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {result !== null ? (
          <>
            <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
              PER SIDE
            </Text>
            <PlateDiagram
              testID={`${testID}-diagram`}
              perSide={result.perSide}
              weightUnit={weightUnit}
            />

            <Text
              testID={`${testID}-achieved`}
              style={[typography.title2, { color: colors.text.primary, marginTop: spacing['3'] }]}
            >
              {displayLabel(result.achieved, weightUnit)}
              {weightSuffix(weightUnit)}
            </Text>

            {result.exact ? (
              <Button
                testID={`${testID}-use-value`}
                label="Use this value"
                variant="primary"
                onPress={() => handleUseValue({ perSide: result.perSide, achieved: result.achieved })}
                style={{ marginTop: spacing['4'] }}
              />
            ) : (
              <>
                <Text
                  style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['2'] }]}
                >
                  Exact target isn&apos;t achievable with this equipment — nearest options:
                </Text>
                {result.lower !== null ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: spacing['3'],
                    }}
                  >
                    <Text style={[typography.body, { color: colors.text.primary }]}>
                      Lower: {displayLabel(result.lower.achieved, weightUnit)}
                      {weightSuffix(weightUnit)}
                    </Text>
                    <Button
                      testID={`${testID}-use-lower`}
                      label="Use this value"
                      variant="tonal"
                      size="sm"
                      onPress={() => handleUseValue(result.lower as PlateSolution)}
                    />
                  </View>
                ) : null}
                {result.upper !== null ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: spacing['2'],
                    }}
                  >
                    <Text style={[typography.body, { color: colors.text.primary }]}>
                      Upper: {displayLabel(result.upper.achieved, weightUnit)}
                      {weightSuffix(weightUnit)}
                    </Text>
                    <Button
                      testID={`${testID}-use-upper`}
                      label="Use this value"
                      variant="tonal"
                      size="sm"
                      onPress={() => handleUseValue(result.upper as PlateSolution)}
                    />
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

interface PlateDiagramProps {
  perSide: number[];
  weightUnit: WeightUnit;
  testID?: string;
}

const BAR_SEGMENT_WIDTH = 40;
const PLATE_BASE_HEIGHT = 28;
const PLATE_HEIGHT_PER_KG = 1.4;
const PLATE_MAX_HEIGHT = 96;

/**
 * A minimal, mirrored "plates stacked per side" visual (02 §11: "visual bar
 * diagram showing plates stacked per side") — a center bar segment flanked
 * by two mirrored stacks, each plate a labeled block whose height scales
 * (clamped) with its own weight so bigger plates visibly read as bigger.
 */
function PlateDiagram({ perSide, weightUnit, testID }: PlateDiagramProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const renderStack = (side: 'a' | 'b', order: number[]) => (
    <View style={{ flexDirection: side === 'a' ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
      {order.map((weight, index) => (
        <View
          key={`${side}-${index}`}
          testID={testID ? `${testID}-plate-${side}-${index}` : undefined}
          style={{
            width: 20,
            height: Math.min(PLATE_MAX_HEIGHT, PLATE_BASE_HEIGHT + weight * PLATE_HEIGHT_PER_KG),
            marginHorizontal: 1,
            borderRadius: 2,
            backgroundColor: colors.accent.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[typography.caption, { color: colors.accent.onAccent }]}>
            {displayLabel(weight, weightUnit)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: spacing['2'] }}
    >
      {renderStack('a', perSide)}
      <View
        style={{
          width: BAR_SEGMENT_WIDTH,
          height: 8,
          backgroundColor: colors.border.input,
          marginHorizontal: 2,
        }}
      />
      {renderStack('b', perSide)}
    </View>
  );
}
