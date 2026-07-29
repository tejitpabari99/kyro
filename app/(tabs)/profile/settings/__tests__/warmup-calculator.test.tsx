/**
 * "Warm-up Calculator" settings screen tests (M2-16) — same fixture
 * convention as `index.test.tsx` (M0-10): a fresh in-memory `settingsStore`
 * instance, mocked in place of the app-wide singleton the screen imports
 * directly.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import WarmupCalculatorScreen from '../warmup-calculator';

jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

describe('Warm-up Calculator settings screen (M2-16, 02 §12/§13)', () => {
  let driver: SqliteDriver;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));
  });

  afterEach(() => {
    driver.close();
  });

  it('renders the default formula rows and increments', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('settings-warmup-calc-row-0-percent').props.value).toBe('0');
    expect(screen.getByTestId('settings-warmup-calc-row-0-reps').props.value).toBe('10');
    expect(screen.getByTestId('settings-warmup-calc-row-1-percent').props.value).toBe('40');
    expect(screen.getByTestId('settings-warmup-calc-row-1-reps').props.value).toBe('8');
    expect(screen.getByTestId('settings-warmup-calc-row-2-percent').props.value).toBe('60');
    expect(screen.getByTestId('settings-warmup-calc-row-2-reps').props.value).toBe('5');
    expect(screen.getByTestId('settings-warmup-calc-row-3-percent').props.value).toBe('80');
    expect(screen.getByTestId('settings-warmup-calc-row-3-reps').props.value).toBe('3');
    expect(screen.getByTestId('settings-warmup-calc-plate-increment').props.value).toBe('2.5');
    expect(screen.getByTestId('settings-warmup-calc-dumbbell-increment').props.value).toBe('2');
  });

  it('editing a row percent writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-warmup-calc-row-1-percent'), '45');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.sets[1]).toEqual({ percent: 45, reps: 8 });
  });

  it('editing reps writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-warmup-calc-row-2-reps'), '6');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.sets[2]).toEqual({ percent: 60, reps: 6 });
  });

  it('clearing a field does not write through, but keeps the field visually empty', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-warmup-calc-row-1-percent'), '');
    });

    expect(screen.getByTestId('settings-warmup-calc-row-1-percent').props.value).toBe('');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    // Last-valid state (the shipped default) is still persisted — the
    // in-progress edit simply hasn't committed yet.
    expect(settings.warmup_calc.sets[1]).toEqual({ percent: 40, reps: 8 });
  });

  it('+ Add Row appends a new row and writes through immediately', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-warmup-calc-add-row'));
    });

    expect(screen.getByTestId('settings-warmup-calc-row-4-percent')).toBeTruthy();
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.sets).toHaveLength(5);
  });

  it('removing a row writes through and the remaining rows re-index', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-warmup-calc-row-0-remove'));
    });

    expect(screen.queryByTestId('settings-warmup-calc-row-3-percent')).toBeNull();
    expect(screen.getByTestId('settings-warmup-calc-row-0-percent').props.value).toBe('40');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.sets).toEqual([
      { percent: 40, reps: 8 },
      { percent: 60, reps: 5 },
      { percent: 80, reps: 3 },
    ]);
  });

  it('Reset to Default restores the shipped default after edits', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-warmup-calc-plate-increment'), '5');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-warmup-calc-row-0-remove'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-warmup-calc-reset'));
    });

    expect(screen.getByTestId('settings-warmup-calc-row-0-percent').props.value).toBe('0');
    expect(screen.getByTestId('settings-warmup-calc-plate-increment').props.value).toBe('2.5');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.sets).toEqual([
      { percent: 0, reps: 10 },
      { percent: 40, reps: 8 },
      { percent: 60, reps: 5 },
      { percent: 80, reps: 3 },
    ]);
    expect(settings.warmup_calc.plate_increment_kg).toBe(2.5);
  });

  it('editing the dumbbell increment writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-warmup-calc-dumbbell-increment'), '2.5');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.dumbbell_increment_kg).toBe(2.5);
  });

  it('a non-positive increment does not write through', async () => {
    await render(
      <ThemeProvider>
        <WarmupCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-warmup-calc-plate-increment'), '0');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.warmup_calc.plate_increment_kg).toBe(2.5);
  });
});
