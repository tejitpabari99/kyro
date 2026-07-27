/**
 * `MeasurementDetailScreen` tests (M5-02 acceptance gate) — real
 * `MeasurementRepositoryImpl` over an in-memory `better-sqlite3` driver (08
 * §5: never mock repositories). `expo-router`'s `router.back` and
 * `@/lib/progress-photo-capture`/`@/lib/progress-photos` (this screen mounts
 * `LogEntrySheet` for its edit flow, which reaches those native-touching
 * seams — post-merge reconciliation replaced the former feature-local
 * `../measurement-photo-files` with the real, shared implementation) are
 * mocked at their respective module boundaries, same postures established by
 * the other two screen test files in this suite.
 *
 * Covers: not-found branch for an invalid field param, sparse-data chart
 * rendering (no zero-fill — 04 §6 acceptance), reverse-chronological entry
 * list, edit (re-opens `LogEntrySheet` prefilled) and delete
 * (`clearField`, not a full-row delete) actions, the 3M/1Y/All range
 * toggle, and RNTL smoke both themes.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type {
  BodyMeasurement,
  MeasurementDateRange,
  MeasurementPoint,
  MeasurementRepository,
  ProgressPhoto,
} from '@/data/measurements/types';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { ThemeProvider } from '@/ui/theme-provider';

import { MeasurementDetailScreen } from '../MeasurementDetailScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: jest.fn(), push: jest.fn() },
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

async function renderScreen(
  repository: MeasurementRepository,
  field: string,
  theme: 'dark' | 'light' = 'dark',
) {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <MeasurementDetailScreen testID="detail" repository={repository} field={field} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('MeasurementDetailScreen', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(async () => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));
  });

  afterEach(() => driver.close());

  it('renders the not-found empty state for an invalid field param', async () => {
    await renderScreen(repository, 'not_a_real_field');
    expect(await screen.findByTestId('detail-not-found')).toBeTruthy();
  });

  it('renders the chart + empty entry list for a field with no data (dark)', async () => {
    await renderScreen(repository, 'weightKg', 'dark');
    expect(await screen.findByTestId('detail-chart')).toBeTruthy();
    expect(screen.getByTestId('detail-entries-empty')).toBeTruthy();
  });

  it('renders without throwing (light)', async () => {
    await renderScreen(repository, 'weightKg', 'light');
    expect(await screen.findByTestId('detail-chart')).toBeTruthy();
  });

  it('sparse data renders a reverse-chronological entry per logged date, with no synthetic gap-fill entries', async () => {
    await repository.upsert('2026-01-05', { weightKg: 85 });
    await repository.upsert('2026-07-20', { weightKg: 80 });

    await renderScreen(repository, 'weightKg');

    const entries = await screen.findAllByTestId(/^detail-entry-\d{4}-\d{2}-\d{2}$/);
    expect(entries).toHaveLength(2);
    // Reverse-chronological: the most recent date first.
    expect(entries[0]!.props.testID).toBe('detail-entry-2026-07-20');
    expect(entries[1]!.props.testID).toBe('detail-entry-2026-01-05');
  });

  it('back button navigates back', async () => {
    await renderScreen(repository, 'weightKg');
    await fireEvent.press(await screen.findByTestId('detail-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('the range toggle switches between 3M/1Y/All', async () => {
    await renderScreen(repository, 'weightKg');
    await screen.findByTestId('detail-chart');
    await fireEvent.press(screen.getByTestId('detail-range-1Y'));
    // No throw + the segment is now selected.
    expect(screen.getByTestId('detail-range-1Y').props.accessibilityState.selected).toBe(true);
  });

  it('Edit opens the log-entry sheet prefilled for that entry’s date', async () => {
    await repository.upsert('2026-07-20', { weightKg: 80, waistCm: 90 });
    await renderScreen(repository, 'weightKg');

    await fireEvent.press(await screen.findByTestId('detail-entry-2026-07-20-edit'));

    expect(await screen.findByText('Log Measurements')).toBeTruthy();
    // `MeasurementDetailScreen` renders `LogEntrySheet` with
    // `testID="detail-log-entry-sheet"` (this screen's own `testID` prop,
    // "detail", prefixed) — not a bare "sheet".
    await waitFor(() =>
      expect(screen.getByTestId('detail-log-entry-sheet-field-waistCm').props.value).toBe('90'),
    );
  });

  it('Delete clears just this field (clearField), not the whole row', async () => {
    await repository.upsert('2026-07-20', { weightKg: 80, waistCm: 90 });
    await renderScreen(repository, 'weightKg');

    await fireEvent.press(await screen.findByTestId('detail-entry-2026-07-20-delete'));

    const alertMock = Alert.alert as jest.Mock;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1] as [
      string,
      string,
      { text: string; onPress?: () => void }[],
    ];
    const confirmButton = lastCall[2].find((b) => b.text === 'Delete');
    confirmButton?.onPress?.();

    await waitFor(async () => {
      const rows = await repository.list({ start: '2026-07-20', end: '2026-07-20' });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.weightKg).toBeNull();
      expect(rows[0]!.waistCm).toBe(90);
    });
  });
});

// Regression (found in M5 milestone-wide review): a real `series()` failure
// previously rendered identically to "no entries yet" (no chart data, empty
// entry list) — the same bug class M4's own milestone-wide review found and
// fixed for `HistoryListScreen`/`CalendarScreen`/`StatisticsScreen`.
describe('MeasurementDetailScreen — series query error', () => {
  class FailingRepo implements MeasurementRepository {
    async upsert(): Promise<void> {
      throw new Error('unused');
    }
    async clearField(): Promise<void> {
      throw new Error('unused');
    }
    async list(_range?: MeasurementDateRange): Promise<BodyMeasurement[]> {
      return [];
    }
    async series(): Promise<MeasurementPoint[]> {
      throw new Error('database is locked');
    }
    async addPhoto(): Promise<ProgressPhoto> {
      throw new Error('unused');
    }
    async photos(_range?: MeasurementDateRange): Promise<ProgressPhoto[]> {
      return [];
    }
    async deletePhoto(): Promise<void> {
      throw new Error('unused');
    }
  }

  it('shows a distinct error state (not the empty-entries state) when the series query fails, with a working retry', async () => {
    const repository = new FailingRepo();
    await renderScreen(repository, 'weightKg');

    expect(await screen.findByTestId('detail-error')).toBeTruthy();
    expect(screen.queryByTestId('detail-entries-empty')).toBeNull();
    expect(screen.queryByTestId('detail-chart')).toBeNull();

    jest.spyOn(repository, 'series').mockResolvedValue([]);
    await fireEvent.press(screen.getByTestId('detail-retry'));

    expect(await screen.findByTestId('detail-chart')).toBeTruthy();
    expect(screen.queryByTestId('detail-error')).toBeNull();
  });
});
