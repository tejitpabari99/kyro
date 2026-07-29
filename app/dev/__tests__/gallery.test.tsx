/**
 * Dev gallery smoke test (M0-08 acceptance gate): "gallery shows every
 * primitive and toggles theme."
 *
 * Renders `DevGalleryScreen` directly (not through `renderRouter`) inside
 * a `ThemeProvider`, same pattern every other `src/ui/__tests__/*.test.tsx`
 * file already uses — the screen only depends on `useTheme()`, not on
 * expo-router, so there is no need to boot the full route tree here.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import DevGalleryScreen from '../gallery';
import { ThemeProvider } from '@/ui/theme-provider';

describe('DevGalleryScreen — renders every primitive, both themes', () => {
  it('renders every primitive section in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <DevGalleryScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('dev-gallery-screen')).toBeTruthy();
    for (const section of [
      'Theme',
      'Button',
      'Card',
      'ListRow',
      'Chip',
      'SearchBar',
      'EmptyState',
      'Sheet',
      'SegmentedControl',
      'NumericInput',
      'Snackbar',
      'StatColumn / StatTile',
      'Avatar / Thumb',
    ]) {
      expect(screen.getByTestId(`gallery-section-${section}`)).toBeTruthy();
    }
  });

  it('renders every primitive section in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <DevGalleryScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('dev-gallery-screen')).toBeTruthy();
    expect(screen.getByTestId('gallery-section-Button')).toBeTruthy();
  });

  it('toggling the theme control changes rendered styles app-wide', async () => {
    await render(
      <ThemeProvider>
        <DevGalleryScreen />
      </ThemeProvider>,
    );

    const flatStyle = (): Record<string, unknown> => {
      const style = screen.getByTestId('dev-gallery-screen').props.style;
      return Array.isArray(style) ? Object.assign({}, ...style) : style;
    };

    await fireEvent.press(screen.getByTestId('gallery-theme-toggle-light'));
    const styleAfterLight = flatStyle();

    await fireEvent.press(screen.getByTestId('gallery-theme-toggle-dark'));
    const styleAfterDark = flatStyle();

    // Light and dark backgrounds are different tokens (07 §2) — flipping
    // the segmented control should visibly change the resolved background.
    expect(styleAfterLight.backgroundColor).not.toBe(styleAfterDark.backgroundColor);
  });
});
