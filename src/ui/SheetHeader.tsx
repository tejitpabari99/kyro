/**
 * `SheetHeader` — PRD A (`sheet-header-foundation`) §4.2: a shared, centered-
 * by-default header row usable both inside `Sheet` bodies and — since it has
 * no dependency on `Sheet` itself — inside plain full-screen routes, so a
 * Sheet <-> route conversion never requires re-deriving header layout.
 *
 * Layout algorithm (§4.2, the literal reading of the user's own words rather
 * than a mirrored-equal-slot-width trick):
 *   title textAlign  = (left == null && right == null) ? 'center' : 'left'
 *   title marginLeft  = left  != null ? spacing['2'] : 0
 *   title marginRight = right != null ? spacing['2'] : 0
 * `left`/`right` zones only render when the respective prop is given — no
 * reserved minimum width when absent, so a one-sided header doesn't
 * mathematically re-center the title around a phantom empty slot.
 */
import React from 'react';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './theme-provider';

export type SheetHeaderSlot =
  | { kind: 'back'; onPress: () => void; accessibilityLabel?: string; testID?: string }
  | {
      kind: 'label';
      label: string;
      onPress: () => void;
      /** Text color. Defaults to `'accent'`. */
      tone?: 'default' | 'accent' | 'danger';
      disabled?: boolean;
      testID?: string;
    }
  | { kind: 'custom'; content: React.ReactNode };

export interface SheetHeaderProps {
  title: string;
  left?: SheetHeaderSlot;
  right?: SheetHeaderSlot;
  /**
   * Adds `insets.top` clearance above the row. Pass `true` only when this
   * header sits at the very top of an edge-to-edge, full-height
   * presentation (a `Sheet` at `detent="full"`, or a plain full-screen
   * route with `headerShown:false`). Leave `false` (default) for
   * `detent="half"` sheets — they don't start at the physical screen top,
   * `Sheet.tsx`'s own `spacing['2']` grabber clearance is enough.
   */
  safeTop?: boolean;
  testID?: string;
}

function SlotContent({
  slot,
  fallbackTestID,
}: {
  slot: SheetHeaderSlot;
  fallbackTestID: string | undefined;
}): React.JSX.Element {
  const { colors, typography } = useTheme();

  if (slot.kind === 'custom') {
    return <>{slot.content}</>;
  }

  const testID = slot.testID ?? fallbackTestID;

  if (slot.kind === 'back') {
    return (
      <Pressable
        testID={testID}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={slot.accessibilityLabel ?? 'Back'}
        onPress={slot.onPress}
      >
        <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
      </Pressable>
    );
  }

  // slot.kind === 'label'
  const tone = slot.tone ?? 'accent';
  const toneColor =
    tone === 'accent'
      ? colors.accent.text
      : tone === 'danger'
        ? colors.semantic.danger
        : colors.text.primary;

  return (
    <Pressable
      testID={testID}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={slot.label}
      accessibilityState={{ disabled: slot.disabled }}
      disabled={slot.disabled}
      onPress={slot.onPress}
    >
      <Text
        style={[typography.body, { fontWeight: '600' as const, color: toneColor }]}
        numberOfLines={1}
      >
        {slot.label}
      </Text>
    </Pressable>
  );
}

export function SheetHeader({
  title,
  left,
  right,
  safeTop = false,
  testID,
}: SheetHeaderProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const hasLeft = left != null;
  const hasRight = right != null;

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingHorizontal: spacing['4'],
        paddingBottom: spacing['2'],
        paddingTop: safeTop ? insets.top + spacing['3'] : spacing['2'],
      }}
    >
      {hasLeft ? (
        <SlotContent slot={left} fallbackTestID={testID ? `${testID}-left` : undefined} />
      ) : null}
      <Text
        testID={testID ? `${testID}-title` : undefined}
        numberOfLines={1}
        style={[
          typography.headline,
          {
            color: colors.text.primary,
            flex: 1,
            textAlign: !hasLeft && !hasRight ? 'center' : 'left',
            marginLeft: hasLeft ? spacing['2'] : 0,
            marginRight: hasRight ? spacing['2'] : 0,
          },
        ]}
      >
        {title}
      </Text>
      {hasRight ? (
        <SlotContent slot={right} fallbackTestID={testID ? `${testID}-right` : undefined} />
      ) : null}
    </View>
  );
}
