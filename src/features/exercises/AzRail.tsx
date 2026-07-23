/**
 * `AzRail` (M1-07) — 03 §2's "right-edge A–Z index rail": a fixed vertical
 * column of all 26 letters. Tapping a letter that has a section in the
 * current (filtered) list calls `onSelectLetter`, which the screen wires to
 * `FlashListRef.scrollToIndex` (that imperative call is the seam under
 * test — RNTL can't verify the resulting *visual* scroll position without a
 * simulator, same documented carve-out as every other "no simulator here"
 * acceptance note in this codebase). Letters with no section in the current
 * data are rendered dimmed and disabled (a real no-op tap target — no
 * silent scroll-to-nothing).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/ui/theme-provider';

import { AZ_RAIL_LETTERS } from './exercise-list-model';

export interface AzRailProps {
  /** Letters that currently have a section to jump to (`Object.keys` of `BuiltExerciseRows.sectionIndex`, minus `'Recent'`). */
  availableLetters: ReadonlySet<string>;
  onSelectLetter: (letter: string) => void;
  testID?: string;
}

export function AzRail({
  availableLetters,
  onSelectLetter,
  testID,
}: AzRailProps): React.JSX.Element {
  const { colors, typography } = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="adjustable"
      style={{
        position: 'absolute',
        right: 2,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {AZ_RAIL_LETTERS.map((letter) => {
        const available = availableLetters.has(letter);
        return (
          <Pressable
            key={letter}
            testID={testID ? `${testID}-letter-${letter}` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${letter}`}
            accessibilityState={{ disabled: !available }}
            disabled={!available}
            hitSlop={{ left: 8, right: 8 }}
            onPress={() => onSelectLetter(letter)}
          >
            <Text
              style={[
                typography.caption,
                {
                  fontSize: 10,
                  lineHeight: 12,
                  fontWeight: '600',
                  color: available ? colors.accent.text : colors.text.tertiary,
                  opacity: available ? 1 : 0.4,
                },
              ]}
            >
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
