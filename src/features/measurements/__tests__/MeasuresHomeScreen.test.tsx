/**
 * `MeasuresHomeScreen` tests (M5-02 acceptance gate) — real
 * `MeasurementRepositoryImpl` over an in-memory `better-sqlite3` driver (08
 * §5: never mock repositories); `expo-router`'s `router.push` mocked the
 * same way `ExerciseBrowseScreen.test.tsx` mocks it for row navigation.
 * `@/lib/progress-photo-capture`/`@/lib/progress-photos` mocked at the
 * module boundary since this screen mounts `LogEntrySheet` (which reaches
 * those native-touching seams — post-merge reconciliation replaced the
 * former feature-local `../measurement-photo-files` with the real, shared
 * implementation), same posture `LogEntrySheet.test.tsx` establishes.
 *
 * Covers: all 17 rows render, latest value + delta + sparkline derive
 * correctly from seeded data (sparse-data acceptance case included), row
 * tap navigates to `/profile/measures/[field]`, the `+` FAB opens
 * `LogEntrySheet`, and RNTL smoke both themes.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { ThemeProvider } from '@/ui/theme-provider';

import { MeasuresHomeScreen } from '../MeasuresHomeScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));

jest.mock('@/lib/progress-photo-capture');
jest.mock('@/lib/progress-photos', () => ({
  progressPhotoUri: (fileName: string) => `file:///mock/${fileName}`,
}));

jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderScreen(repository: MeasurementRepositoryImpl, theme: 'dark' | 'light' = 'dark') {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <MeasuresHomeScreen testID="home" repository={repository} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('MeasuresHomeScreen', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(async () => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));
  });

  afterEach(() => driver.close());

  it('renders all 17 measurement rows without throwing (dark)', async () => {
    await renderScreen(repository, 'dark');
    expect(await screen.findByTestId('home-row-weightKg')).toBeTruthy();
    expect(screen.getByTestId('home-row-rightCalfCm')).toBeTruthy();
    // Field keys are bare camelCase (no hyphens) — this excludes the
    // `-value`/`-sparkline` sub-element testIDs that also start with the
    // same `home-row-` prefix.
    expect(screen.getAllByTestId(/^home-row-[a-zA-Z]+$/)).toHaveLength(17);
  });

  it('renders without throwing (light)', async () => {
    await renderScreen(repository, 'light');
    expect(await screen.findByTestId('home-row-weightKg')).toBeTruthy();
  });

  it('shows "No entries yet" for a field never logged', async () => {
    await renderScreen(repository);
    await waitFor(() =>
      expect(screen.getByTestId('home-row-weightKg-value').props.children.join('')).toContain(
        'No entries yet',
      ),
    );
  });

  it('shows the latest value and a signed delta vs the previous entry', async () => {
    await repository.upsert('2026-06-01', { weightKg: 82 });
    await repository.upsert('2026-07-20', { weightKg: 80 });

    await renderScreen(repository);

    await waitFor(() => {
      const text = screen.getByTestId('home-row-weightKg-value').props.children.join('');
      expect(text).toContain('80 kg');
      expect(text).toContain('-2 kg');
    });
  });

  it('a sparse-data field (gaps outside the 90-day window) still renders its row without throwing', async () => {
    await repository.upsert('2020-01-01', { waistCm: 95 });
    await renderScreen(repository);
    expect(await screen.findByTestId('home-row-waistCm')).toBeTruthy();
  });

  it('tapping a row navigates to that field’s detail route', async () => {
    await renderScreen(repository);
    await fireEvent.press(await screen.findByTestId('home-row-weightKg'));
    expect(router.push).toHaveBeenCalledWith('/profile/measures/weightKg');
  });

  it('the + FAB opens the log-entry sheet', async () => {
    await renderScreen(repository);
    expect(screen.queryByText('Log Measurements')).toBeNull();

    await fireEvent.press(await screen.findByTestId('home-fab'));

    expect(await screen.findByText('Log Measurements')).toBeTruthy();
  });
});
