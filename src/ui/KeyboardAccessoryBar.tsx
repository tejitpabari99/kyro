/**
 * `KeyboardAccessoryBar` (M2-08, 07 §5 component inventory) — the logger's
 * keyboard toolbar: a `Calculator` button on the left, shown only when the
 * caller says so (02 §4: "when a weight field is focused and plate
 * calculator is enabled" — both of those are feature-layer decisions,
 * `src/ui/**` may depend on tokens only, 06 §2, so this component just
 * renders whatever `showCalculator` it's handed), and `Next` on the right,
 * always present.
 *
 * Built on RN's own `InputAccessoryView` — mount **one** instance (this
 * component) per screen with a fixed `nativeID`, and every `TextInput` that
 * wants this toolbar passes the same string as its own
 * `inputAccessoryViewID` (RN's documented "toolbar shared by multiple
 * inputs" pattern; see `InputAccessoryView.js`'s own file header). iOS only
 * — `InputAccessoryView` itself already handles the non-iOS case (renders
 * `null` after one `console.warn`, RN's own internal `Platform.OS` branch,
 * not this file's — so this component makes no `Platform.OS` decision of
 * its own and doesn't trip the 06 §10 lint restriction).
 *
 * `onCalculatorPress` is the M2-15 seam this task's own brief calls for:
 * "leave the correct conditional hook/seam so M2-15 can wire in later" —
 * the plate calculator UI itself doesn't exist yet, so the caller
 * (`ActiveWorkoutScreen`) wires this to a no-op placeholder today, same
 * "labeled stub, not a crash or a silent omission" pattern this codebase
 * already uses for every other not-yet-built M2 feature (e.g.
 * `ExerciseCard`'s Add Warm-Up Sets item, M2-16).
 */
import React from 'react';
import { Calculator, ChevronRight } from 'lucide-react-native';
import { InputAccessoryView, Pressable, Text, View } from 'react-native';

import { useTheme } from './theme-provider';

export interface KeyboardAccessoryBarProps {
  /** The `nativeID` this bar registers under — pass the same string as every relevant `TextInput`'s own `inputAccessoryViewID` (`KEYBOARD_ACCESSORY_VIEW_ID`, `src/features/workout/keyboardFocusStore.ts`). */
  nativeID: string;
  /** 02 §4: "Calculator button on the left when a weight field is focused and plate calculator is enabled" — both conditions resolved by the caller. */
  showCalculator: boolean;
  onCalculatorPress: () => void;
  onNextPress: () => void;
  testID?: string;
}

export function KeyboardAccessoryBar({
  nativeID,
  showCalculator,
  onCalculatorPress,
  onNextPress,
  testID = 'keyboard-accessory-bar',
}: KeyboardAccessoryBarProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
          paddingHorizontal: spacing['3'],
          backgroundColor: colors.bg.elevated,
          borderTopWidth: 1,
          borderTopColor: colors.border.hairline,
        }}
      >
        {showCalculator ? (
          <Pressable
            testID={`${testID}-calculator`}
            accessibilityRole="button"
            accessibilityLabel="Plate calculator"
            onPress={onCalculatorPress}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing['2'] }}
          >
            <Calculator size={18} strokeWidth={1.75} color={colors.accent.text} />
          </Pressable>
        ) : (
          <View />
        )}

        <Pressable
          testID={`${testID}-next`}
          accessibilityRole="button"
          accessibilityLabel="Next field"
          onPress={onNextPress}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing['2'] }}
        >
          <Text style={[typography.headline, { color: colors.accent.text, marginRight: 2 }]}>
            Next
          </Text>
          <ChevronRight size={18} strokeWidth={2} color={colors.accent.text} />
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
