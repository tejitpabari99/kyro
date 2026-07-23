/**
 * `Sheet` — 07 §5: bottom sheet with detents 0.5/0.9, grabber, scrim
 * (`semantic.overlay` token), keyboard-aware. Built on
 * `react-native-gesture-handler` + `react-native-reanimated` per 06 §1.
 *
 * Component-level, not a route (06 §3: "Sheets ... are component-level
 * bottom sheets on gesture-handler, not routes — they must coexist with the
 * keyboard and not disturb navigation state"). Callers own `visible` state
 * and pass an `onDismiss` — nothing here touches expo-router.
 *
 * Rendering strategy: the whole tree (including the RN `Modal` host) only
 * mounts while `visible` is true, so content is provably absent from the
 * tree when closed/dismissed (this is also what keeps the RNTL open/dismiss
 * test simple and synchronous — no `act()`-wrapped timers to unmount after
 * an exit animation). The entrance still animates in via Reanimated
 * (`translateY` 07 §8: 250 ms sheet timing); a drag past
 * `DRAG_DISMISS_THRESHOLD` calls `onDismiss` directly, and the *caller*
 * flipping `visible` to false is what removes it from the tree — the
 * pattern every other stateful primitive in `src/ui/` already uses
 * (compare `Snackbar`, also M0-07).
 */
import React, { useMemo } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './theme-provider';

/** 07 §5 detents: `half` = 50% of screen height, `full` = 90%. */
export type SheetDetent = 'half' | 'full';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  detent?: SheetDetent;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 07 §8: sheets animate in/out over 250 ms. */
const SHEET_ANIMATION_MS = 250;
const DETENT_HEIGHT_RATIO: Record<SheetDetent, number> = {
  half: 0.5,
  full: 0.9,
};
/** Downward drag past this many pt dismisses the sheet on release. */
const DRAG_DISMISS_THRESHOLD = 120;
const GRABBER_SIZE = { width: 36, height: 4 };

export function Sheet({
  visible,
  onDismiss,
  children,
  detent = 'half',
  style,
  testID,
}: SheetProps): React.JSX.Element | null {
  const { colors, radii, spacing } = useTheme();

  const windowHeight = Dimensions.get('window').height;
  const sheetHeight = windowHeight * DETENT_HEIGHT_RATIO[detent];

  // Mounted only while visible (see file header), so this always starts its
  // entrance animation from "off-screen" on mount.
  const translateY = useSharedValue(sheetHeight);
  React.useEffect(() => {
    translateY.value = withTiming(0, {
      duration: SHEET_ANIMATION_MS,
      easing: Easing.out(Easing.quad),
    });
    // Runs once per mount (component only mounts while `visible`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // react-hooks/immutability (React Compiler's purity check) flags every
  // `translateY.value = ...` write below: Reanimated's `useSharedValue`
  // returns a mutable ref-like object *by design* — that's how UI-thread
  // worklets stay off the JS thread — which is structurally what the rule
  // exists to catch for plain component state. This is Reanimated's
  // documented, standard usage pattern (not a bug here), so it's disabled
  // for this block rather than worked around.
  /* eslint-disable react-hooks/immutability */
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY > 0) {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (e.translationY > DRAG_DISMISS_THRESHOLD) {
            translateY.value = withTiming(sheetHeight, { duration: SHEET_ANIMATION_MS });
            runOnJS(onDismiss)();
          } else {
            translateY.value = withTiming(0, { duration: SHEET_ANIMATION_MS });
          }
        }),
    [onDismiss, sheetHeight, translateY],
  );
  /* eslint-enable react-hooks/immutability */

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss} testID={testID}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          testID={testID ? `${testID}-scrim` : undefined}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.semantic.overlay }]}
          onPress={onDismiss}
        />
        <KeyboardAvoidingView
          // `'padding'` unconditionally on both platforms: direct
          // `Platform.OS` branching is lint-restricted to src/lib/ (06 §10
          // portability guardrails), and 'padding' is an acceptable
          // cross-platform default here — the sheet is bottom-anchored, so
          // padding the container is exactly the adjustment the keyboard
          // needs on either OS.
          behavior="padding"
          style={styles.avoidingContainer}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View
              testID={testID ? `${testID}-content` : undefined}
              style={[
                styles.sheet,
                {
                  height: sheetHeight,
                  backgroundColor: colors.bg.surface,
                  borderTopLeftRadius: radii.lg,
                  borderTopRightRadius: radii.lg,
                  paddingTop: spacing['2'],
                },
                animatedStyle,
                style,
              ]}
            >
              <View
                accessible={false}
                style={[
                  styles.grabber,
                  { backgroundColor: colors.border.input, borderRadius: GRABBER_SIZE.height / 2 },
                ]}
              />
              <View style={styles.content}>{children}</View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoidingContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
  grabber: {
    alignSelf: 'center',
    width: GRABBER_SIZE.width,
    height: GRABBER_SIZE.height,
  },
  content: {
    flex: 1,
  },
});
