/**
 * `AddWarmUpSetsSheet` (M2-16) — 02 §12's "Add Warm-Up Sets" flow: exercise
 * ⋯ menu -> this sheet -> a working-weight field, pre-filled from the
 * exercise's first `normal` set's own value, or (when that's empty) the
 * same PREVIOUS reference `ExerciseSetTableSection` shows for that row ->
 * `Generate` runs `domain/warmup-calc.ts`'s pure `warmupSets` and inserts
 * the resulting `warmup`-type rows above the exercise's existing sets via
 * `activeWorkoutStore.addWarmUpSets` (M2-16's own store action, "write,
 * then reflect", `insertWarmupSets` repo mutator).
 *
 * ## Unit handling
 *
 * The field displays and accepts the working weight in the user's current
 * `weightUnit` — canonical storage is always kg (`weight_kg` columns), so
 * this component is the one boundary that converts: reads the first
 * normal set's canonical `weightKg` (or the previous-session canonical
 * value) into display units for the pre-fill, then converts the
 * *generated rows'* display-unit weights back to kg before calling
 * `addWarmUpSets`. `domain/warmup-calc.ts`'s `warmupSets` itself never
 * touches kg/lb (see that file's header) — `resolveWarmupRounding` is what
 * resolves the settings' canonical-kg increments/bar-weight into this
 * component's display unit before the math runs.
 *
 * ## Bar weight source
 *
 * `settings.plate_calc.bars` (05 §3.5, M0-10, already shipped regardless
 * of whether M2-15's plate-calculator *feature* is built yet) is the only
 * place a "Barbell" weight is configured — this sheet reads its `Barbell`
 * entry (falling back to the first configured bar, then a literal 20 kg)
 * as the floor for barbell exercises. `equipment !== 'barbell'` skips the
 * floor entirely (dumbbell/machine/etc., 08 §4.3's "dumbbell increment
 * path").
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import type { Equipment, PreviousValuesMode, WeightUnit } from '@/domain/enums';
import { kgToLb, lbToKg } from '@/domain/units';
import { resolveWarmupRounding, warmupSets } from '@/domain/warmup-calc';
import { useSettingsStore } from '@/features/settings/settings-store';
import { Button } from '@/ui/Button';
import { NumericInput, sanitizeNumericInput } from '@/ui/NumericInput';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

import { selectWorkoutExercise } from './activeWorkoutStore';
import { useWorkoutStore } from './workoutStoreContext';

export interface AddWarmUpSetsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  workoutExerciseId: string;
  exerciseId: string;
  equipment: Equipment;
  weightUnit: WeightUnit;
  previousValuesMode: PreviousValuesMode;
  routineId: string | null;
  /** M4-05: see `ExerciseSetTableSection`'s own doc comment on the identical prop. */
  previousSetsExcludeWorkoutId?: string;
  testID?: string;
}

function weightSuffix(unit: WeightUnit): string {
  return unit === 'kg' ? 'kg' : 'lb';
}

/** Canonical-kg -> display-unit, matching `domain/previous-values.ts`'s own kg/lb split (no display rounding here — the field is editable, a rounded pre-fill would silently discard precision the user never gets to see). */
function toDisplay(weightKg: number, unit: WeightUnit): number {
  return unit === 'kg' ? weightKg : (kgToLb(weightKg) as number);
}

/** Display-unit -> canonical kg, the inverse of {@link toDisplay} — used both to convert a typed working weight isn't needed (math runs in display units, see file header) and to convert the *generated rows'* weights back to kg for storage. */
function toCanonicalKg(weightDisplay: number, unit: WeightUnit): number {
  return unit === 'kg' ? weightDisplay : (lbToKg(weightDisplay) as number);
}

export function AddWarmUpSetsSheet({
  visible,
  onDismiss,
  workoutExerciseId,
  exerciseId,
  equipment,
  weightUnit,
  previousValuesMode,
  routineId,
  previousSetsExcludeWorkoutId,
  testID = 'add-warmup-sets-sheet',
}: AddWarmUpSetsSheetProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  // `useStore` (not `workoutStore`) — see `ConnectedSetRow.tsx`'s matching
  // comment: the `use`-prefix naming convention is how both eslint's
  // rules-of-hooks and the React Compiler recognize a hook call; a
  // non-`use`-prefixed name here let the compiler treat `workoutStore
  // (selector)` as an ordinary memoizable call, silently varying this
  // component's real hook count across renders.
  const useStore = useWorkoutStore();
  const workoutExercise = useStore(selectWorkoutExercise(workoutExerciseId));
  const warmupCalc = useSettingsStore((s) => s.settings.warmup_calc);
  const plateCalc = useSettingsStore((s) => s.settings.plate_calc);

  // Only fetches while the sheet is open — same queryKey shape
  // `ExerciseSetTableSection` uses for its own PREVIOUS lookup, so an
  // already-warm cache is reused rather than re-fetched.
  const previousQuery = useQuery({
    queryKey: [
      'workout',
      'previousSets',
      exerciseId,
      previousValuesMode,
      previousValuesMode === 'same_routine' ? routineId : null,
      previousSetsExcludeWorkoutId ?? null,
    ],
    queryFn: () =>
      useStore.getState().previousSets(exerciseId, {
        ...(previousValuesMode === 'same_routine' && routineId ? { routineId } : undefined),
        ...(previousSetsExcludeWorkoutId ? { beforeWorkoutId: previousSetsExcludeWorkoutId } : undefined),
      }),
    enabled: visible,
  });

  const firstNormalSet = workoutExercise?.sets.find((s) => s.setType === 'normal') ?? null;
  const previousWorkingWeightKg =
    previousQuery.data?.find((p) => !p.isWarmup && p.bucketIndex === 0)?.weightKg ?? null;
  const prefillWeightKg = firstNormalSet?.weightKg ?? previousWorkingWeightKg;
  const prefillDisplay = prefillWeightKg !== null ? toDisplay(prefillWeightKg, weightUnit) : null;

  const [draft, setDraft] = useState(prefillDisplay !== null ? String(prefillDisplay) : '');
  // Re-seed the draft each time the sheet opens (mirrors `DurationEditSheet`'s
  // "derive from a visible transition" pattern) — including re-seeding
  // once the previous-values query resolves after the sheet is already
  // open (a fast local DB read, but not guaranteed synchronous with the
  // first render).
  const [wasVisible, setWasVisible] = useState(visible);
  const [seededPrefill, setSeededPrefill] = useState(prefillDisplay);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(prefillDisplay !== null ? String(prefillDisplay) : '');
      setSeededPrefill(prefillDisplay);
    }
  } else if (visible && prefillDisplay !== seededPrefill && draft === '') {
    // The previous-values query resolved after open, and the user hasn't
    // typed anything yet — seed it now instead of leaving the field blank.
    setDraft(prefillDisplay !== null ? String(prefillDisplay) : '');
    setSeededPrefill(prefillDisplay);
  }

  const parsedWeight = Number(draft);
  const isValid = draft.trim().length > 0 && Number.isFinite(parsedWeight) && parsedWeight >= 0;

  const handleGenerate = (): void => {
    // No `!isValid` guard here — the `Generate` button's own `disabled`
    // prop (below) already fully gates this from ever firing on an
    // invalid draft; RN's `Pressable` doesn't invoke `onPress` while
    // `disabled`, so a second internal check would be permanently dead
    // code (and untestable through the real component tree, 08 §5's own
    // convention this suite follows).
    const barbellWeightKg =
      plateCalc.bars.find((b) => b.name === 'Barbell')?.weight_kg ?? plateCalc.bars[0]?.weight_kg ?? 20;
    const rounding = resolveWarmupRounding(warmupCalc, {
      equipment,
      weightUnit,
      barbellWeightKg,
    });
    const rows = warmupSets(parsedWeight, warmupCalc.sets, rounding);
    void useStore.getState().addWarmUpSets(
      workoutExerciseId,
      rows.map((row) => ({
        setType: 'warmup' as const,
        weightKg: toCanonicalKg(row.weight, weightUnit),
        reps: row.reps,
      })),
    );
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <View style={{ paddingHorizontal: spacing['4'], flex: 1 }}>
        <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['2'] }]}>
          Add Warm-Up Sets
        </Text>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['3'] }]}
        >
          {warmupCalc.sets.length} warm-up set{warmupCalc.sets.length === 1 ? '' : 's'} will be added
          above your working sets.
        </Text>

        <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
          WORKING WEIGHT ({weightSuffix(weightUnit)})
        </Text>
        <NumericInput
          testID={`${testID}-working-weight`}
          value={draft}
          onChangeText={(text) => setDraft(sanitizeNumericInput(text, 'decimal'))}
          mode="decimal"
          placeholder="0"
          autoFocus
          style={{ alignSelf: 'flex-start', minWidth: 120, borderRadius: radii.sm }}
        />

        <Button
          testID={`${testID}-generate`}
          label="Generate"
          variant="primary"
          disabled={!isValid}
          onPress={handleGenerate}
          style={{ marginTop: spacing['4'] }}
        />
      </View>
    </Sheet>
  );
}
