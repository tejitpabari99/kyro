/**
 * Manual Jest mock for `expo-glass-effect` (M0-08, expo-router's
 * native-stack).
 *
 * `expo-router`'s `createNativeStackNavigator` (used by the root `<Stack>`,
 * and transitively by `<Tabs>`) imports `expo-glass-effect` unconditionally
 * to support iOS 26 Liquid Glass styling. `GlassView`/`GlassContainer`
 * render through `requireNativeViewManager`, which throws synchronously at
 * module-eval time under Jest (no simulator/device, so no native view
 * manager is registered) — the same class of problem `__mocks__/expo-
 * image.tsx` (M0-07) documents for `expo-image`. Jest automatically picks
 * up a manual mock at `<rootDir>/__mocks__/<packageName>` for node_modules
 * packages (no `jest.mock()` call needed), so this stands in for the whole
 * package: plain `View` passthroughs for the two components, and `false`
 * for both availability checks (correct for every non-iOS-26 environment,
 * which includes every Jest run).
 */
import React from 'react';
import { View, type ViewProps } from 'react-native';

export function GlassView({ children, ...rest }: ViewProps): React.JSX.Element {
  return <View {...rest}>{children}</View>;
}

export function GlassContainer({ children, ...rest }: ViewProps): React.JSX.Element {
  return <View {...rest}>{children}</View>;
}

export function isLiquidGlassAvailable(): boolean {
  return false;
}

export function isGlassEffectAPIAvailable(): boolean {
  return false;
}
