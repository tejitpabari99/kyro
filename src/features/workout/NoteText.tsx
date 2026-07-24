/**
 * `NoteText` (M2-09) — 02 §3's card note row: "grey italic text ... URLs in
 * notes render as tappable links." Renders `domain/text-links.ts`'s pure
 * segmentation as nested `Text` nodes — RN's `Text` supports arbitrarily
 * nested `Text` children each with their own `onPress`, which is how a
 * single flowing paragraph can have some words tappable without breaking
 * line-wrap (a row of separate sibling `View`s would not wrap the same
 * way). Tapping a URL segment opens it via `expo-linking`'s `openURL`
 * (already a listed dependency, 06 §1's table) — errors are swallowed with
 * a console warning rather than surfacing a user-facing alert, matching how
 * launching an external app is generally best-effort in this codebase.
 */
import React from 'react';
import * as Linking from 'expo-linking';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { splitTextWithUrls } from '@/domain/text-links';

import { useTheme } from '@/ui/theme-provider';

export interface NoteTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

function openLink(url: string): void {
  Linking.openURL(url).catch((error: unknown) => {
    console.warn(`NoteText: failed to open link "${url}":`, error);
  });
}

export function NoteText({ text, style, testID }: NoteTextProps): React.JSX.Element {
  const { colors, typography } = useTheme();
  const segments = splitTextWithUrls(text);

  return (
    <Text
      testID={testID}
      style={[typography.subhead, { color: colors.text.secondary, fontStyle: 'italic' }, style]}
    >
      {segments.map((segment, index) =>
        segment.type === 'url' ? (
          <Text
            key={index}
            testID={testID ? `${testID}-link-${index}` : undefined}
            accessibilityRole="link"
            style={{ color: colors.accent.text, fontStyle: 'normal' }}
            onPress={() => openLink(segment.value)}
          >
            {segment.value}
          </Text>
        ) : (
          <Text key={index}>{segment.value}</Text>
        ),
      )}
    </Text>
  );
}
