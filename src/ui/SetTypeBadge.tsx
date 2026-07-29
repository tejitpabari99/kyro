/**
 * `SetTypeBadge` (M2-06) — 07 §2.4: the SET-column glyph. A `normal` set
 * shows its working-set number as a plain `text.secondary` numeral (07
 * §2.4: "normal = text.secondary numeral"); `warmup`/`dropset`/`failure`
 * show a 24 pt circle (`bg.elevated` fill) with a colored semibold letter —
 * `W` `warning`, `D` `info`, `F` `danger` — via `setTypeBadgeColors`
 * (`src/ui/tokens.ts`, already implements 07 §2.4's color mapping).
 *
 * `kind` is a local, ui-layer-only union (`'normal' | 'warmup' | 'dropset' |
 * 'failure'`) — structurally identical to `src/domain/enums.ts`'s
 * `SetType`, but **not imported from there**: `src/ui/**` may depend only on
 * its own tokens (06 §2 dependency rule, lint-enforced), never
 * `src/domain`. Callers in `src/features/workout/` own the
 * `SetType -> SetBadgeKind` mapping (trivial — the string values are
 * identical) when wiring this component to real set data.
 *
 * Tappable (07 §4: 44 pt hit target despite the 24 pt visual badge / the
 * numeral's own smaller glyph) — `onPress` opens the set-type menu sheet
 * (feature-layer concern, not this component's).
 */
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export type SetBadgeKind = 'normal' | 'warmup' | 'dropset' | 'failure';

export interface SetTypeBadgeProps {
  kind: SetBadgeKind;
  /** The working-set number (1-based) to display for `kind='normal'`. Ignored for the other three kinds (they show their letter, not a number) — `null` renders nothing (e.g. a not-yet-numbered placeholder row). */
  workingIndex?: number | null;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const BADGE_SIZE = 24;
const MIN_HIT_TARGET = 44;

const BADGE_LETTERS: Record<Exclude<SetBadgeKind, 'normal'>, string> = {
  warmup: 'W',
  dropset: 'D',
  failure: 'F',
};

export function SetTypeBadge({
  kind,
  workingIndex,
  onPress,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
}: SetTypeBadgeProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  // `typography.setValue.fontVariant` is a readonly tuple — copy into a
  // mutable array to satisfy RN's `TextStyle` (same pattern
  // `NumericInput`/`StatColumn` already use).
  const setValueStyle = {
    ...typography.setValue,
    fontVariant: [...typography.setValue.fontVariant],
  };

  const badgeColors = {
    warmup: colors.semantic.warning,
    dropset: colors.semantic.info,
    failure: colors.semantic.danger,
    normal: colors.text.secondary,
  };

  const content =
    kind === 'normal' ? (
      <Text
        testID={testID ? `${testID}-number` : undefined}
        style={[setValueStyle, { color: badgeColors.normal }]}
      >
        {workingIndex ?? ''}
      </Text>
    ) : (
      <View
        testID={testID ? `${testID}-circle` : undefined}
        style={{
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: BADGE_SIZE / 2,
          backgroundColor: colors.bg.elevated,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.footnote, { fontWeight: '600', color: badgeColors[kind] }]}>
          {BADGE_LETTERS[kind]}
        </Text>
      </View>
    );

  const hitSlopVertical = Math.max(0, (MIN_HIT_TARGET - BADGE_SIZE) / 2);

  if (!onPress) {
    return (
      <View testID={testID} style={style}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (kind === 'normal' ? `Set ${workingIndex ?? ''}` : `${kind} set`)
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{
        top: hitSlopVertical,
        bottom: hitSlopVertical,
        left: spacing['2'],
        right: spacing['2'],
      }}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
    >
      {content}
    </Pressable>
  );
}
