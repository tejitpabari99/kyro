/**
 * `EmptyState` — 07 §5: icon + title + caption + CTA slot. Used across
 * every list's empty state (07 §10: one encouraging line + one CTA, no
 * lorem fluff).
 */
import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface EmptyStateProps {
  /** Icon element, e.g. a `lucide-react-native` glyph sized/colored by the caller. */
  icon: React.ReactNode;
  title: string;
  caption?: string;
  /** CTA slot — typically a `<Button variant="tonal">`. */
  cta?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function EmptyState({
  icon,
  title,
  caption,
  cta,
  style,
  testID,
}: EmptyStateProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing['6'],
          paddingVertical: spacing['8'],
        },
        style,
      ]}
    >
      <View style={{ marginBottom: spacing['4'] }}>{icon}</View>
      <Text style={[typography.headline, { color: colors.text.primary, textAlign: 'center' }]}>
        {title}
      </Text>
      {caption != null ? (
        <Text
          style={[
            typography.subhead,
            {
              color: colors.text.secondary,
              textAlign: 'center',
              marginTop: spacing['1'],
            },
          ]}
        >
          {caption}
        </Text>
      ) : null}
      {cta != null ? <View style={{ marginTop: spacing['5'] }}>{cta}</View> : null}
    </View>
  );
}
