import React from 'react';
import { InputAccessoryView, Keyboard, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme-provider';

export interface KeyboardDoneBarProps {
  /** Same `nativeID`/`inputAccessoryViewID` pairing convention as `KeyboardAccessoryBar` —
   * every free-text `TextInput` that wants a Done bar passes this same string as its own
   * `inputAccessoryViewID`. */
  nativeID: string;
  testID?: string;
}

export function KeyboardDoneBar({
  nativeID,
  testID = 'keyboard-done-bar',
}: KeyboardDoneBarProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          minHeight: 44,
          paddingHorizontal: spacing['3'],
          backgroundColor: colors.bg.elevated,
          borderTopWidth: 1,
          borderTopColor: colors.border.hairline,
        }}
      >
        <Pressable
          testID={`${testID}-done`}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
          style={{ paddingVertical: spacing['2'] }}
        >
          <Text style={[typography.headline, { color: colors.accent.text }]}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
