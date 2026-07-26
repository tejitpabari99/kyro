/**
 * `NumericInput` — 07 §5: boxed `bg.elevated`, radius sm, `setValue`
 * typography, placeholder `text.tertiary`, select-all-on-focus. Used for
 * set cells (weight/reps), measurements, and calculators.
 *
 * `mode="integer"` filters to digits only (reps, plate counts); `mode
 * ="decimal"` filters to digits plus at most one `.` (weight, distance).
 * Filtering happens on every `onChangeText` call via `sanitizeNumericInput`
 * (exported so the filtering logic itself is directly unit-testable without
 * rendering) rather than restricting the keyboard alone, since pasted text
 * and platform IME input can still produce non-numeric characters.
 *
 * Select-all-on-focus uses RN's built-in `selectTextOnFocus` — the same
 * "highlight the whole value so the next keystroke replaces it" affordance
 * as a native iOS numeric field — rather than a manual `setSelection` call,
 * since the platform already implements this exact behavior.
 *
 * `ref`-forwarded (M2-08) so callers can drive focus imperatively — the
 * set table's `Next` traversal (`src/features/workout/keyboardFocusStore
 * .ts`) needs to call `.focus()` on the next field directly rather than
 * through any state-driven re-render, exactly so the keyboard never
 * dismisses between fields (06 §8). `onFocus`/`inputAccessoryViewID` are
 * the other two M2-08 additions: `onFocus` lets the set table track which
 * field currently has focus (drives the accessory bar's contextual
 * Calculator button); `inputAccessoryViewID` is what actually attaches a
 * shared `KeyboardAccessoryBar` to this field. Both optional — omitted by
 * every non-logger call site (measurements, calculators), which get no
 * accessory bar and don't need focus tracking.
 */
import React from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from './theme-provider';

export type NumericInputMode = 'decimal' | 'integer';

export interface NumericInputProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Fires on blur (focus loss) — the set-table's cells commit their local, uncommitted typed value to the store on this event rather than on every keystroke (06 §5.3/§8: "input state local-first, committed on blur/check/next"). Optional; omit for call sites (measurements, calculators) that don't need a commit boundary. */
  onBlur?: () => void;
  /** Fires on focus (M2-08) — the set table's `Next` traversal / Calculator-button visibility gate reads this to track which field is currently focused. */
  onFocus?: () => void;
  /** Shared `nativeID` of a mounted `KeyboardAccessoryBar` (M2-08, 07 §5) — omit for call sites that don't want an accessory bar. */
  inputAccessoryViewID?: string;
  mode?: NumericInputMode;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /**
   * `TextStyle`, not `ViewStyle` — this ultimately lands on the underlying
   * `TextInput`'s own `style` prop (below), which requires `TextStyle`.
   * Previously typed as `StyleProp<ViewStyle>`, which is a real type error
   * (`ViewStyle` is not assignable to `TextStyle`) that `tsc` only surfaces
   * once `expo-env.d.ts`/`.expo/types` exist — i.e. after the CI pipeline's
   * own later `expo-doctor`/`expo export` steps have run at least once in a
   * given checkout, which pulls in `expo/types`'s `react-native-web.d.ts`
   * ambient shim (adds a loose `userSelect: string` to `ViewStyle`, which
   * conflicts with `TextStyle`'s own, stricter, pre-existing `userSelect`
   * literal-union). A *second* `pnpm run ci` run in the same checkout would
   * therefore fail at the typecheck step — found and fixed in the M4
   * milestone-wide review (`EXECUTION-LOG.md`'s `M4 | reviewed` row) by
   * re-running the gate twice from the same sandbox, the same "don't just
   * trust one green run" discipline that review's own mechanics required.
   */
  style?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const MIN_HIT_TARGET = 44;

/** Filters raw input text down to what `mode` allows. Exported for direct unit testing. */
export function sanitizeNumericInput(text: string, mode: NumericInputMode): string {
  if (mode === 'integer') {
    return text.replace(/[^0-9]/g, '');
  }
  const digitsAndDots = text.replace(/[^0-9.]/g, '');
  const firstDot = digitsAndDots.indexOf('.');
  if (firstDot === -1) {
    return digitsAndDots;
  }
  // Keep the first '.', strip any further ones from the remainder.
  return (
    digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, '')
  );
}

export const NumericInput = React.forwardRef<TextInput, NumericInputProps>(function NumericInput(
  {
    value,
    onChangeText,
    onBlur,
    onFocus,
    inputAccessoryViewID,
    mode = 'decimal',
    placeholder,
    autoFocus,
    disabled = false,
    style,
    testID,
    accessibilityLabel,
  }: NumericInputProps,
  ref,
): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const handleChangeText = (text: string): void => {
    onChangeText(sanitizeNumericInput(text, mode));
  };

  // `typography.setValue.fontVariant` is a readonly tuple (tokens.ts keeps it
  // `readonly` for traceability, see that file's header); RN's `TextStyle`
  // wants a mutable `FontVariant[]`, so this copies it into one.
  const setValueStyle: TextStyle = {
    ...typography.setValue,
    fontVariant: [...typography.setValue.fontVariant],
  };

  return (
    <TextInput
      ref={ref}
      testID={testID}
      value={value}
      onChangeText={handleChangeText}
      onBlur={onBlur}
      onFocus={onFocus}
      inputAccessoryViewID={inputAccessoryViewID}
      placeholder={placeholder}
      placeholderTextColor={colors.text.tertiary}
      keyboardType={mode === 'integer' ? 'number-pad' : 'decimal-pad'}
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      selectTextOnFocus
      autoFocus={autoFocus}
      editable={!disabled}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      accessibilityState={{ disabled }}
      style={[
        setValueStyle,
        {
          minHeight: MIN_HIT_TARGET,
          minWidth: MIN_HIT_TARGET,
          backgroundColor: colors.bg.elevated,
          borderRadius: radii.sm,
          color: colors.text.primary,
          paddingHorizontal: spacing['3'],
          paddingVertical: 0,
          textAlign: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    />
  );
});
