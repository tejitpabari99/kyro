/**
 * Jest mock for `react-native-safe-area-context` (BUGFIX-01). Wired via
 * `jest.config.js`'s `ui` project `moduleNameMapper` (`^react-native-safe-
 * area-context$` -> this file) rather than the package's own shipped
 * `react-native-safe-area-context/jest/mock.tsx`: that file unconditionally
 * `import`s `@jest/globals`, which is a *devDependency* of that package
 * (its own `package.json` lists it under `devDependencies`, not
 * `dependencies`/`peerDependencies`) — under pnpm's strict node_modules
 * layout a package's `devDependencies` are never installed into its own
 * `node_modules` when it's installed as *this* repo's dependency (only real
 * `dependencies`/`peerDependencies` hoist that way), so requiring it throws
 * `Cannot find module '@jest/globals'`. Confirmed empirically: no
 * `node_modules/@jest/globals` exists at repo root or nested under that
 * package's own `.pnpm` entry.
 *
 * A fixed-value mock is required regardless of which file supplies it:
 * under Jest, no native module is linked (`NativeSafeAreaContext` resolves
 * `undefined`), so the real `SafeAreaProvider` implementation
 * (`src/SafeAreaContext.tsx`) would start `insets` at `null` and block
 * every descendant from rendering forever, waiting on a native
 * `onInsetsChange` event that can never fire under Jest. All-zero insets
 * (matching the package's own shipped mock's values) keep every existing
 * padding/layout assertion unchanged — `app/_layout.tsx`'s new `insets.top`
 * additions become a no-op at `top: 0`, and every RNTL query in this repo's
 * test suite (testID/text-based, never snapshot/pixel) is unaffected.
 */
import * as React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_FRAME: Rect = { x: 0, y: 0, width: 320, height: 640 };

export const SafeAreaInsetsContext = React.createContext<EdgeInsets>(ZERO_INSETS);
export const SafeAreaFrameContext = React.createContext<Rect>(DEFAULT_FRAME);

export interface SafeAreaProviderProps {
  children?: React.ReactNode;
  initialMetrics?: { insets?: EdgeInsets | null; frame?: Rect | null } | null;
  style?: StyleProp<ViewStyle>;
}

export function SafeAreaProvider({ children, style }: SafeAreaProviderProps): React.JSX.Element {
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}

export function useSafeAreaInsets(): EdgeInsets {
  return React.useContext(SafeAreaInsetsContext);
}

export function useSafeAreaFrame(): Rect {
  return React.useContext(SafeAreaFrameContext);
}

export interface SafeAreaViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  [key: string]: unknown;
}

export function SafeAreaView({ children, style, ...rest }: SafeAreaViewProps): React.JSX.Element {
  return (
    <View style={style} {...rest}>
      {children}
    </View>
  );
}

export const initialWindowMetrics: { insets: EdgeInsets; frame: Rect } = {
  insets: ZERO_INSETS,
  frame: DEFAULT_FRAME,
};

export const initialWindowSafeAreaInsets: EdgeInsets = ZERO_INSETS;
