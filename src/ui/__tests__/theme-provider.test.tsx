/**
 * ThemeProvider RNTL tests (M0-05 acceptance gate): theme switch re-renders
 * consumers. Runs in the `ui` Jest project (jest-expo + RNTL).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import * as ReactNative from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { colors } from '../tokens';
import { ThemeProvider, useTheme, type ThemePreference } from '../theme-provider';

// Patch the already-initialized `react-native` module's `useColorScheme`
// export in place (rather than `jest.mock('react-native', factory)`, which
// re-requires the module fresh and breaks jest-expo's native module
// registry setup) so system-preference resolution is deterministic per test.
const mockedUseColorScheme = jest.spyOn(ReactNative, 'useColorScheme');

/**
 * `useColorScheme`'s type as resolved in this project excludes `null`, but
 * the real native implementation can return it (that's exactly the
 * "OS scheme unavailable" case `ThemeProvider` falls back on) — cast at
 * this single seam rather than widening the mock's inferred type everywhere.
 */
function mockSystemColorScheme(value: 'light' | 'dark' | null): void {
  mockedUseColorScheme.mockReturnValue(value as ReturnType<typeof ReactNative.useColorScheme>);
}

function TokenConsumer() {
  const { themeName, colors: themeColors } = useTheme();
  return (
    <View testID="consumer" style={{ backgroundColor: themeColors.bg.base }}>
      <Text testID="theme-name">{themeName}</Text>
    </View>
  );
}

function UncontrolledConsumer() {
  const { themeName, preference, setPreference } = useTheme();
  return (
    <View>
      <Text testID="theme-name">{themeName}</Text>
      <Text testID="preference">{preference}</Text>
      <Pressable accessibilityRole="button" onPress={() => setPreference('dark')}>
        <Text>Switch to dark</Text>
      </Pressable>
    </View>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    mockSystemColorScheme(null);
  });

  it('resolves the controlled "light" preference and exposes light tokens', async () => {
    await render(
      <ThemeProvider preference="light">
        <TokenConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').props.children).toBe('light');
    expect(screen.getByTestId('consumer').props.style.backgroundColor).toBe(colors.light.bg.base);
  });

  it('resolves the controlled "dark" preference and exposes dark tokens', async () => {
    await render(
      <ThemeProvider preference="dark">
        <TokenConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').props.children).toBe('dark');
    expect(screen.getByTestId('consumer').props.style.backgroundColor).toBe(colors.dark.bg.base);
  });

  it('re-renders consumers with new resolved tokens when the preference prop changes', async () => {
    function Wrapper({ preference }: { preference: ThemePreference }) {
      return (
        <ThemeProvider preference={preference}>
          <TokenConsumer />
        </ThemeProvider>
      );
    }

    const view = await render(<Wrapper preference="light" />);
    expect(screen.getByTestId('consumer').props.style.backgroundColor).toBe(colors.light.bg.base);

    await view.rerender(<Wrapper preference="dark" />);
    expect(screen.getByTestId('theme-name').props.children).toBe('dark');
    expect(screen.getByTestId('consumer').props.style.backgroundColor).toBe(colors.dark.bg.base);
  });

  it('throws a clear error when useTheme is called outside a ThemeProvider', async () => {
    function Orphan() {
      useTheme();
      return null;
    }

    // Suppress React's expected console.error for the thrown-during-render case.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    let caught: unknown;
    try {
      await render(<Orphan />);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('useTheme() must be called within a <ThemeProvider>.');
    consoleError.mockRestore();
  });

  it('resolves "system" preference to the OS light scheme via useColorScheme', async () => {
    mockSystemColorScheme('light');
    await render(
      <ThemeProvider preference="system">
        <TokenConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-name').props.children).toBe('light');
  });

  it('resolves "system" preference to the OS dark scheme via useColorScheme', async () => {
    mockSystemColorScheme('dark');
    await render(
      <ThemeProvider preference="system">
        <TokenConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-name').props.children).toBe('dark');
  });

  it('falls back to dark (07 §1 dark-first) when the OS scheme is unavailable', async () => {
    mockSystemColorScheme(null);
    await render(
      <ThemeProvider preference="system">
        <TokenConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-name').props.children).toBe('dark');
  });

  it('defaults to uncontrolled local-state "system" preference when no preference prop is passed', async () => {
    mockSystemColorScheme('light');
    await render(
      <ThemeProvider>
        <UncontrolledConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('preference').props.children).toBe('system');
    expect(screen.getByTestId('theme-name').props.children).toBe('light');
  });

  it('updates local state and calls onPreferenceChange when uncontrolled setPreference is invoked', async () => {
    const onPreferenceChange = jest.fn();
    mockSystemColorScheme('light');
    await render(
      <ThemeProvider onPreferenceChange={onPreferenceChange}>
        <UncontrolledConsumer />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPreferenceChange).toHaveBeenCalledWith('dark');
    expect(await screen.findByTestId('theme-name')).toHaveTextContent('dark');
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });

  it('calls onPreferenceChange but does not change resolved theme when controlled', async () => {
    const onPreferenceChange = jest.fn();
    await render(
      <ThemeProvider preference="light" onPreferenceChange={onPreferenceChange}>
        <UncontrolledConsumer />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPreferenceChange).toHaveBeenCalledWith('dark');
    // Controlled: the provider ignores its own local state, so the resolved
    // theme stays driven by the `preference` prop (still "light") until the
    // parent re-renders with a new prop value.
    expect(screen.getByTestId('theme-name').props.children).toBe('light');
  });
});
