/**
 * `ProgressRing` (M2-11) — 07 §5 component inventory: "timer full-screen"
 * primitive; also used at a smaller size by `TimerPill`'s own compact face.
 * A circular countdown ring built on `react-native-svg` (already a listed
 * dependency, unused until now — no chart primitive exists yet either, this
 * is the first consumer).
 *
 * `progress` is a plain 0..1 fraction of "how full the ring is" — this
 * component has no opinion on what it represents (a rest timer's own
 * remaining/total math lives entirely at the call site, `TimerPill.tsx`);
 * values outside `[0, 1]` are clamped rather than trusted, so a caller's
 * transient math glitch (e.g. a `total` of 0 for one tick) can never render
 * a nonsensical arc.
 *
 * The ring drains clockwise from 12 o'clock as `progress` falls toward 0
 * (`strokeDashoffset` grows), matching the familiar
 * countdown-timer convention (Apple's own Clock app, Hevy's rest timer).
 * `children` renders centered over the ring (the countdown text) via
 * `StyleSheet.absoluteFill` + centered flex — never affects the SVG's own
 * layout box.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from './theme-provider';

export interface ProgressRingProps {
  /** 0 (empty) to 1 (full) — clamped. */
  progress: number;
  /** Outer diameter, pt. Defaults to 64 (compact/pill usage). */
  size?: number;
  /** Ring stroke width, pt. Defaults to 6. */
  strokeWidth?: number;
  /** Defaults to `colors.accent.primary`. */
  color?: string;
  /** Defaults to `colors.bg.elevated`. */
  trackColor?: string;
  children?: React.ReactNode;
  testID?: string;
}

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color,
  trackColor,
  children,
  testID = 'progress-ring',
}: ProgressRingProps): React.JSX.Element {
  const { colors } = useTheme();

  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const radius = Math.max(0, (size - strokeWidth) / 2);
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <View testID={testID} style={{ width: size, height: size }}>
      <Svg width={size} height={size} testID={`${testID}-svg`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor ?? colors.bg.elevated}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          testID={`${testID}-fill`}
          cx={center}
          cy={center}
          r={radius}
          stroke={color ?? colors.accent.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          // Starts the arc at 12 o'clock instead of svg's default 3 o'clock.
          rotation={-90}
          originX={center}
          originY={center}
        />
      </Svg>
      {children != null ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
