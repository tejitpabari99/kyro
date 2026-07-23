/**
 * Manual Jest mock for `expo-image` (M0-07, `Avatar`/`Thumb`).
 *
 * `expo-image`'s real `Image` component renders through
 * `requireNativeViewManager`, which throws under Jest — no
 * simulator/device, so no native view manager is registered (jest-expo's
 * auto-mock lookup only covers `requireNativeModule`-style native modules
 * with a shipped `mocks/<Name>.js`, which `expo-image` doesn't have; see
 * `node_modules/jest-expo/src/preset/setup.js`'s `attemptLookup`). Jest
 * automatically picks up a manual mock placed at `<rootDir>/__mocks__/
 * <packageName>` for node_modules packages (no `jest.mock()` call needed),
 * so this file stands in for the whole package in every test: a small RN
 * `Image` wrapper that behaves the same for the props `Avatar` sets
 * (`source`, `style`, `contentFit`, `accessible`, `accessibilityLabel`,
 * `testID`) without touching native code.
 */
import React from 'react';
import { Image as RNImage, type ImageProps as RNImageProps } from 'react-native';

export type ImageSource = { uri?: string; width?: number; height?: number } | string | number;
export type ImageStyle = RNImageProps['style'] extends infer S ? S : never;

export interface ImageProps extends Omit<RNImageProps, 'source' | 'style'> {
  source?: ImageSource | ImageSource[] | null;
  style?: ImageStyle;
  contentFit?: string;
}

export function Image({ source, contentFit: _contentFit, ...rest }: ImageProps): React.JSX.Element {
  const rnSource =
    typeof source === 'string'
      ? { uri: source }
      : ((source ?? { uri: '' }) as RNImageProps['source']);
  return <RNImage source={rnSource} {...rest} />;
}

export const ImageBackground = Image;

export function useImage(): null {
  return null;
}
