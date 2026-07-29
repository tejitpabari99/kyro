/**
 * `ButtonRow` tests — PRD A §7-mandated cases: (a) N `Button` children each
 * receive `flex:1` in their rendered style, (b) `gap` prop passes through to
 * the row container, (c) non-`Button` children (defensive) pass through
 * unmodified rather than throwing.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '../Button';
import { ButtonRow } from '../ButtonRow';
import { ThemeProvider } from '../theme-provider';
import { spacing } from '../tokens';

// `StyleSheet.flatten` (rather than a shallow `Object.assign(...)` spread)
// because `ButtonRow` nests the caller's own `style` array one level deeper
// (`[callerStyle, { flex: 1 }]`) inside `Button`'s own `[styles.base, {...}, style]`
// array — a shallow spread would merge the nested array's numeric indices
// instead of its style properties.
function flatten(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

describe('ButtonRow — layout', () => {
  it('gives each of 2 Button children flex:1', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ButtonRow>
          <Button testID="row-cancel" label="Cancel" variant="tonal" onPress={() => {}} />
          <Button testID="row-save" label="Save" onPress={() => {}} />
        </ButtonRow>
      </ThemeProvider>,
    );

    const cancel = flatten(screen.getByTestId('row-cancel').props.style);
    const save = flatten(screen.getByTestId('row-save').props.style);
    expect(cancel.flex).toBe(1);
    expect(save.flex).toBe(1);
  });

  it('gives each of 3 Button children flex:1 (arity-agnostic)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ButtonRow>
          <Button testID="row-a" label="A" onPress={() => {}} />
          <Button testID="row-b" label="B" onPress={() => {}} />
          <Button testID="row-c" label="C" onPress={() => {}} />
        </ButtonRow>
      </ThemeProvider>,
    );

    expect(flatten(screen.getByTestId('row-a').props.style).flex).toBe(1);
    expect(flatten(screen.getByTestId('row-b').props.style).flex).toBe(1);
    expect(flatten(screen.getByTestId('row-c').props.style).flex).toBe(1);
  });

  it('defaults the row container gap to spacing[3]', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ButtonRow testID="row">
          <Button label="Cancel" onPress={() => {}} />
          <Button label="Save" onPress={() => {}} />
        </ButtonRow>
      </ThemeProvider>,
    );

    const row = flatten(screen.getByTestId('row').props.style);
    expect(row.flexDirection).toBe('row');
    expect(row.gap).toBe(spacing['3']);
  });

  it('passes a custom gap prop through to the row container', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ButtonRow testID="row" gap={20}>
          <Button label="Cancel" onPress={() => {}} />
          <Button label="Save" onPress={() => {}} />
        </ButtonRow>
      </ThemeProvider>,
    );

    const row = flatten(screen.getByTestId('row').props.style);
    expect(row.gap).toBe(20);
  });

  it('passes non-Button children through unmodified rather than throwing', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ButtonRow testID="row">
          <Text>Not a button</Text>
          <Button testID="row-save" label="Save" onPress={() => {}} />
        </ButtonRow>
      </ThemeProvider>,
    );

    expect(screen.getByText('Not a button')).toBeTruthy();
    expect(flatten(screen.getByTestId('row-save').props.style).flex).toBe(1);
  });
});
