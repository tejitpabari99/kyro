/**
 * `SearchBar` — 07 §5: `bg.elevated`, radius `sm`. Used in library/picker
 * search fields. Leading `Search` glyph, optional trailing clear (`X`)
 * button shown once there is text to clear.
 */
import React from 'react';
import { Search, X } from 'lucide-react-native';
import { Pressable, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_SIZE = 20;
const ICON_STROKE_WIDTH = 1.75;
const MIN_HEIGHT = 44;

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onClear,
  autoFocus,
  style,
  testID,
}: SearchBarProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const handleClear = (): void => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: MIN_HEIGHT,
          backgroundColor: colors.bg.elevated,
          borderRadius: radii.sm,
          paddingHorizontal: spacing['3'],
        },
        style,
      ]}
    >
      <Search size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.tertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={[
          typography.body,
          {
            flex: 1,
            color: colors.text.primary,
            marginLeft: spacing['2'],
            paddingVertical: 0,
          },
        ]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={handleClear}
          hitSlop={12}
        >
          <X size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.tertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}
