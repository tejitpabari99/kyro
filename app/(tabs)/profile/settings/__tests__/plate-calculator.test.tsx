/**
 * "Plate Calculator" settings screen tests (M2-15) — same fixture
 * convention as `warmup-calculator.test.tsx` (M2-16): a fresh in-memory
 * `settingsStore` instance, mocked in place of the app-wide singleton the
 * screen imports directly.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import PlateCalculatorScreen from '../plate-calculator';

jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

describe('Plate Calculator settings screen (M2-15, 02 §11/§13)', () => {
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

  it('renders the default bars and plate inventory, disabled by default', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('settings-plate-calc-enabled').props.value).toBe(false);
    expect(screen.getByTestId('settings-plate-calc-bar-0-name').props.value).toBe('Barbell');
    expect(screen.getByTestId('settings-plate-calc-bar-0-weight').props.value).toBe('20');
    expect(screen.getByTestId('settings-plate-calc-bar-1-name').props.value).toBe('EZ Bar');
    expect(screen.getByTestId('settings-plate-calc-bar-1-weight').props.value).toBe('7.5');
    expect(screen.getByTestId('settings-plate-calc-bar-2-name').props.value).toBe('Short Bar');
    expect(screen.getByTestId('settings-plate-calc-bar-2-weight').props.value).toBe('10');

    expect(screen.getByTestId('settings-plate-calc-plate-0-weight').props.value).toBe('25');
    expect(screen.queryByTestId('settings-plate-calc-plate-0-count')).toBeNull(); // unlimited
    expect(screen.getByTestId('settings-plate-calc-plate-6-weight').props.value).toBe('1.25');
  });

  it('toggling Enabled writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent(screen.getByTestId('settings-plate-calc-enabled'), 'valueChange', true);
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.enabled).toBe(true);
  });

  it('editing a bar weight writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-bar-0-weight'), '22.5');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.bars[0]).toEqual({ name: 'Barbell', weight_kg: 22.5 });
  });

  it('editing a bar name writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-bar-0-name'), 'Power Bar');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.bars[0]).toEqual({ name: 'Power Bar', weight_kg: 20 });
  });

  it('an empty bar name does not write through', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-bar-0-name'), '');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.bars[0]!.name).toBe('Barbell');
  });

  it('+ Add Bar appends a new bar and writes through immediately', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-add-bar'));
    });

    expect(screen.getByTestId('settings-plate-calc-bar-3-name')).toBeTruthy();
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.bars).toHaveLength(4);
  });

  it('removing a bar writes through and the remaining bars re-index', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-bar-0-remove'));
    });

    expect(screen.getByTestId('settings-plate-calc-bar-0-name').props.value).toBe('EZ Bar');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.bars.map((b) => b.name)).toEqual(['EZ Bar', 'Short Bar']);
  });

  it('editing a plate weight writes through to the repository', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-plate-0-weight'), '27.5');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.plates[0]).toEqual({ weight_kg: 27.5, count: null });
  });

  it('toggling unlimited off reveals a count field defaulting to 2, which writes through', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-plate-0-toggle-unlimited'));
    });

    expect(screen.getByTestId('settings-plate-calc-plate-0-count').props.value).toBe('2');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.plates[0]).toEqual({ weight_kg: 25, count: 2 });

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-plate-0-count'), '4');
    });
    const updated = await repository.get();
    expect(updated.plate_calc.plates[0]).toEqual({ weight_kg: 25, count: 4 });

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-plate-0-toggle-unlimited'));
    });
    expect(screen.queryByTestId('settings-plate-calc-plate-0-count')).toBeNull();
    const backToUnlimited = await repository.get();
    expect(backToUnlimited.plate_calc.plates[0]).toEqual({ weight_kg: 25, count: null });
  });

  it('an empty (non-unlimited) count does not write through', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-plate-0-toggle-unlimited'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-plate-0-count'), '');
    });

    expect(screen.getByTestId('settings-plate-calc-plate-0-count').props.value).toBe('');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    // Last-valid state (count: 2, from the toggle) is still persisted.
    expect(settings.plate_calc.plates[0]).toEqual({ weight_kg: 25, count: 2 });
  });

  it('+ Add Plate appends a new (unlimited) custom plate and writes through', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-add-plate'));
    });

    expect(screen.getByTestId('settings-plate-calc-plate-7-weight')).toBeTruthy();
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.plates).toHaveLength(8);
    expect(settings.plate_calc.plates[7]).toEqual({ weight_kg: 5, count: null });
  });

  it('removing a plate writes through and the remaining plates re-index', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-plate-0-remove'));
    });

    expect(screen.getByTestId('settings-plate-calc-plate-0-weight').props.value).toBe('20');
    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.plates).toHaveLength(6);
  });

  it('Reset to Default restores the shipped bars/plates after edits, without touching Enabled', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent(screen.getByTestId('settings-plate-calc-enabled'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-bar-0-remove'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-plate-0-remove'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-plate-calc-reset'));
    });

    expect(screen.getByTestId('settings-plate-calc-bar-0-name').props.value).toBe('Barbell');
    expect(screen.getByTestId('settings-plate-calc-plate-0-weight').props.value).toBe('25');
    // Enabled is left exactly as the user set it — reset scope is
    // deliberately bars/plates only (see the screen's own file header).
    expect(screen.getByTestId('settings-plate-calc-enabled').props.value).toBe(true);

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.bars).toEqual([
      { name: 'Barbell', weight_kg: 20 },
      { name: 'EZ Bar', weight_kg: 7.5 },
      { name: 'Short Bar', weight_kg: 10 },
    ]);
    expect(settings.plate_calc.plates).toHaveLength(7);
    expect(settings.plate_calc.enabled).toBe(true);
  });

  it('a non-positive plate weight does not write through', async () => {
    await render(
      <ThemeProvider>
        <PlateCalculatorScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('settings-plate-calc-plate-0-weight'), '0');
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.plate_calc.plates[0]!.weight_kg).toBe(25);
  });
});
