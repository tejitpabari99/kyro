/**
 * `Card` tests (M0-06 acceptance gate): RNTL smoke render in both themes.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { Card } from '../Card';
import { ThemeProvider } from '../theme-provider';
import { colors, radii, layout } from '../tokens';

describe('Card — smoke render (both themes)', () => {
  it('renders children and dark-theme surface tokens', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Card testID="card">
          <Text>Routine card body</Text>
        </Card>
      </ThemeProvider>,
    );

    expect(screen.getByText('Routine card body')).toBeTruthy();
    const card = screen.getByTestId('card');
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style)
      : card.props.style;
    expect(flatStyle.backgroundColor).toBe(colors.dark.bg.surface);
    expect(flatStyle.borderRadius).toBe(radii.md);
    expect(flatStyle.padding).toBe(layout.cardPadding);
  });

  it('renders children and light-theme surface tokens', async () => {
    await render(
      <ThemeProvider preference="light">
        <Card testID="card">
          <Text>Routine card body</Text>
        </Card>
      </ThemeProvider>,
    );

    expect(screen.getByText('Routine card body')).toBeTruthy();
    const card = screen.getByTestId('card');
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style)
      : card.props.style;
    expect(flatStyle.backgroundColor).toBe(colors.light.bg.surface);
  });
});
