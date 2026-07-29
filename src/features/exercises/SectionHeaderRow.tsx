/**
 * `SectionHeaderRow` (M1-07) — the sticky section header row (`Recent`, or
 * a bare letter like `A`) rendered inline in `FlashList`'s `data` array; the
 * screen passes each header row's index to `stickyHeaderIndices` so RN's
 * `ScrollView` sticky-header behavior (which `FlashList` inherits, 03 §2:
 * "sticky letter headers") pins it while its section scrolls underneath.
 */
import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/ui/theme-provider';

export const SECTION_HEADER_HEIGHT = 32;

export interface SectionHeaderRowProps {
  label: string;
}

export function SectionHeaderRow({ label }: SectionHeaderRowProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      style={{
        height: SECTION_HEADER_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: spacing['4'],
        backgroundColor: colors.bg.base,
      }}
    >
      <Text
        style={[
          typography.footnote,
          { color: colors.text.secondary, fontWeight: '600', letterSpacing: 0.5 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
