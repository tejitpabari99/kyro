/**
 * `StatColumn` / `StatTile` — 07 §5: label (footnote, secondary) over value
 * (statLarge/Small). `StatColumn` is the bare label-over-value stack used
 * inline in meta rows (e.g. Duration / Volume / Sets in the logger header).
 * `StatTile` wraps the same stack in a `bg.surface` card (radius md,
 * padding 16) for dashboard grids and the finish screen, with an optional
 * leading icon.
 */
import React from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export type StatValueSize = 'large' | 'small';

export interface StatColumnProps {
  label: string;
  value: string;
  /** Maps to `typography.statLarge`/`statSmall`. Defaults to `'small'`. */
  size?: StatValueSize;
  align?: 'left' | 'center';
  /** Overrides the value color (e.g. `colors.accent.text` for a live duration). */
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StatColumn({
  label,
  value,
  size = 'small',
  align = 'left',
  valueColor,
  style,
  testID,
}: StatColumnProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  // `statLarge`/`statSmall` carry a readonly `fontVariant` tuple (tokens.ts
  // header) — copy into a mutable array to satisfy RN's `TextStyle`.
  const statStyle = size === 'large' ? typography.statLarge : typography.statSmall;
  const valueStyle: TextStyle = { ...statStyle, fontVariant: [...statStyle.fontVariant] };

  return (
    <View
      testID={testID}
      style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}
    >
      <Text style={[typography.footnote, { color: colors.text.secondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          valueStyle,
          { color: valueColor ?? colors.text.primary, marginTop: spacing['0.5'] },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export interface StatTileProps extends StatColumnProps {
  /** Leading icon element, e.g. a `lucide-react-native` glyph. */
  icon?: React.ReactNode;
}

export function StatTile({
  icon,
  style,
  testID,
  ...columnProps
}: StatTileProps): React.JSX.Element {
  const { colors, radii, layout, spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.bg.surface,
          borderRadius: radii.md,
          padding: layout.cardPadding,
          alignItems: columnProps.align === 'center' ? 'center' : 'flex-start',
        },
        style,
      ]}
    >
      {icon != null ? <View style={{ marginBottom: spacing['1'] }}>{icon}</View> : null}
      <StatColumn {...columnProps} />
    </View>
  );
}
