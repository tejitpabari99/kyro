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
 */
import React from 'react';
import { TextInput, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export type NumericInputMode = 'decimal' | 'integer';

export interface NumericInputProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Fires on blur (focus loss) — the set-table's cells commit their local, uncommitted typed value to the store on this event rather than on every keystroke (06 §5.3/§8: "input state local-first, committed on blur/check/next"). Optional; omit for call sites (measurements, calculators) that don't need a commit boundary. */
  onBlur?: () => void;
  mode?: NumericInputMode;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
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

export function NumericInput({
  value,
  onChangeText,
  onBlur,
  mode = 'decimal',
  placeholder,
  autoFocus,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
}: NumericInputProps): React.JSX.Element {
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
      testID={testID}
      value={value}
      onChangeText={handleChangeText}
      onBlur={onBlur}
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
}
