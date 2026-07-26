/**
 * `LogEntrySheet` tests (M5-02 acceptance gate) — real `MeasurementRepositoryImpl`
 * over an in-memory `better-sqlite3` driver (08 §5: never mock repositories),
 * same convention `AddWarmUpSetsSheet.test.tsx` already establishes for an
 * equivalent sheet. `../measurement-photo-files` (the one native-touching
 * seam this component reaches, `expo-file-system`/`expo-image-picker`
 * transitively) is mocked at the module boundary — same "mock the seam, not
 * the repository" posture `ExerciseDetailScreen.test.tsx` uses for `@/lib/files`.
 *
 * Covers 04 §6's named acceptance cases this task is responsible for:
 *  - imperial entry stores canonical kg/cm exactly and round-trips display;
 *  - same-date merge behavior surfaces correctly (the sheet doesn't fight
 *    the repository's own merge-upsert semantics);
 *  - RNTL smoke both themes.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { lbToKg } from '@/domain/units';
import { ThemeProvider } from '@/ui/theme-provider';

import { LogEntrySheet, resolveMeasurementDateKey, type LogEntrySheetProps } from '../LogEntrySheet';
import { pickProgressPhoto } from '../measurement-photo-files';

jest.mock('../measurement-photo-files', () => ({
  pickProgressPhoto: jest.fn(),
  progressPhotoUri: (fileName: string) => `file:///mock/${fileName}`,
}));

const mockPickProgressPhoto = pickProgressPhoto as jest.Mock;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderSheet(
  repository: MeasurementRepositoryImpl,
  overrides: Partial<LogEntrySheetProps> = {},
  theme: 'dark' | 'light' = 'dark',
) {
  const props: LogEntrySheetProps = {
    testID: 'sheet',
    visible: true,
    onDismiss: jest.fn(),
    repository,
    bodyMeasurementUnit: 'metric',
    ...overrides,
  };
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <LogEntrySheet {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('resolveMeasurementDateKey', () => {
  it('clamps out-of-range month/day and falls back to the fallback date on empty/invalid text', () => {
    expect(resolveMeasurementDateKey({ year: '2026', month: '13', day: '5' }, '2026-01-01')).toBe(
      '2026-12-05',
    );
    expect(resolveMeasurementDateKey({ year: '2026', month: '2', day: '31' }, '2026-01-01')).toBe(
      '2026-02-28',
    );
    expect(resolveMeasurementDateKey({ year: '', month: '', day: '' }, '2026-07-04')).toBe(
      '2026-07-04',
    );
  });
});

describe('LogEntrySheet — smoke render (both themes)', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('renders every field row + Save without throwing (dark)', async () => {
    await renderSheet(repository, {}, 'dark');
    expect(await screen.findByText('Log Measurements')).toBeTruthy();
    expect(screen.getByTestId('sheet-field-weightKg')).toBeTruthy();
    expect(screen.getByTestId('sheet-field-rightCalfCm')).toBeTruthy();
    expect(screen.getByTestId('sheet-save')).toBeTruthy();
  });

  it('renders without throwing (light)', async () => {
    await renderSheet(repository, {}, 'light');
    expect(await screen.findByText('Log Measurements')).toBeTruthy();
  });

  it('defaults the date to today when no initialDate is given', async () => {
    await renderSheet(repository);
    await screen.findByText('Log Measurements');
    // `seedDateFields` keeps the zero-padded "MM"/"DD" text verbatim from
    // the `'YYYY-MM-DD'` key — not renormalized to a bare "7"/"5".
    const expected = todayKey().split('-') as [string, string, string];
    expect(screen.getByTestId('sheet-date-year').props.value).toBe(expected[0]);
    expect(screen.getByTestId('sheet-date-month').props.value).toBe(expected[1]);
    expect(screen.getByTestId('sheet-date-day').props.value).toBe(expected[2]);
  });
});

describe('LogEntrySheet — save (metric)', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);
  });

  afterEach(() => driver.close());

  it('saves the typed fields as canonical kg/cm and dismisses on success', async () => {
    const onDismiss = jest.fn();
    await renderSheet(repository, {
      onDismiss,
      initialDate: '2026-07-20',
      bodyMeasurementUnit: 'metric',
    });
    await screen.findByText('Log Measurements');

    await fireEvent.changeText(screen.getByTestId('sheet-field-weightKg'), '80.5');
    await fireEvent.changeText(screen.getByTestId('sheet-field-waistCm'), '90');
    await fireEvent.press(screen.getByTestId('sheet-save'));

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    const rows = await repository.list({ start: '2026-07-20', end: '2026-07-20' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weightKg).toBe(80.5);
    expect(rows[0]!.waistCm).toBe(90);
  });

  it('a Save with every field blank is a no-op (never creates a row) but still dismisses', async () => {
    const onDismiss = jest.fn();
    await renderSheet(repository, { onDismiss, initialDate: '2026-07-21' });
    await screen.findByText('Log Measurements');

    await fireEvent.press(screen.getByTestId('sheet-save'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    const rows = await repository.list({ start: '2026-07-21', end: '2026-07-21' });
    expect(rows).toHaveLength(0);
  });
});

describe('LogEntrySheet — imperial round trip (04 §6 acceptance)', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);
  });

  afterEach(() => driver.close());

  it('a typed lb value stores the exact converted canonical kg, and re-opening shows the same lb value back', async () => {
    const onDismiss = jest.fn();
    const queryClient = newTestQueryClient();
    const tree = (visible: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <LogEntrySheet
            testID="sheet"
            visible={visible}
            onDismiss={onDismiss}
            repository={repository}
            bodyMeasurementUnit="imperial"
            initialDate="2026-07-22"
          />
        </ThemeProvider>
      </QueryClientProvider>
    );

    const { rerender } = await render(tree(true));
    await screen.findByText('Log Measurements');

    await fireEvent.changeText(screen.getByTestId('sheet-field-weightKg'), '180');
    await fireEvent.press(screen.getByTestId('sheet-save'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    const rows = await repository.list({ start: '2026-07-22', end: '2026-07-22' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weightKg).toBeCloseTo(lbToKg(180) as number, 10);
    // Not the bare typed number — a real unit conversion happened.
    expect(rows[0]!.weightKg).not.toBe(180);

    // Re-open (close, then open again) on the same date — round-trips back
    // to the exact typed display value.
    await rerender(tree(false));
    await rerender(tree(true));

    await waitFor(() => expect(screen.getByTestId('sheet-field-weightKg').props.value).toBe('180'));
  });
});

describe('LogEntrySheet — same-date merge behavior (04 §6 acceptance)', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);
  });

  afterEach(() => driver.close());

  it('prefills existing values for the date and a second save only adding a new field keeps the earlier ones intact', async () => {
    await repository.upsert('2026-07-23', { weightKg: 80, waistCm: 90 });

    const onDismiss = jest.fn();
    await renderSheet(repository, { onDismiss, initialDate: '2026-07-23' });
    await screen.findByText('Log Measurements');

    await waitFor(() => expect(screen.getByTestId('sheet-field-weightKg').props.value).toBe('80'));
    expect(screen.getByTestId('sheet-field-waistCm').props.value).toBe('90');

    await fireEvent.changeText(screen.getByTestId('sheet-field-leanMassKg'), '65');
    await fireEvent.press(screen.getByTestId('sheet-save'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    const rows = await repository.list({ start: '2026-07-23', end: '2026-07-23' });
    expect(rows[0]!.weightKg).toBe(80);
    expect(rows[0]!.waistCm).toBe(90);
    expect(rows[0]!.leanMassKg).toBe(65);
  });
});

describe('LogEntrySheet — photo attach (self-contained, plain thumbnail + remove)', () => {
  let driver: SqliteDriver;
  let repository: MeasurementRepositoryImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new MeasurementRepositoryImpl(driver);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => driver.close());

  it('adds a photo via the repository when the picker resolves, and it appears as a thumbnail', async () => {
    mockPickProgressPhoto.mockResolvedValue({ uri: 'file:///cache/picked.jpg' });
    await renderSheet(repository, { initialDate: '2026-07-24' });
    await screen.findByText('Log Measurements');

    await fireEvent.press(screen.getByTestId('sheet-pick-camera'));

    await waitFor(async () => {
      const photos = await repository.photos({ start: '2026-07-24', end: '2026-07-24' });
      expect(photos).toHaveLength(1);
    });
  });

  it('does nothing when the picker returns null (denied/cancelled)', async () => {
    mockPickProgressPhoto.mockResolvedValue(null);
    await renderSheet(repository, { initialDate: '2026-07-25' });
    await screen.findByText('Log Measurements');

    await fireEvent.press(screen.getByTestId('sheet-pick-library'));

    await waitFor(() => expect(mockPickProgressPhoto).toHaveBeenCalledWith('library'));
    const photos = await repository.photos({ start: '2026-07-25', end: '2026-07-25' });
    expect(photos).toHaveLength(0);
  });

  it('removes a photo (behind a confirm) via repository.deletePhoto', async () => {
    const photo = await repository.addPhoto('2026-07-26', 'seed.jpg');
    await renderSheet(repository, { initialDate: '2026-07-26' });
    await screen.findByText('Log Measurements');

    const removeButton = await screen.findByTestId(`sheet-photo-${photo.id}-remove`);
    fireEvent.press(removeButton);

    const alertMock = Alert.alert as jest.Mock;
    const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1] as [
      string,
      string,
      { text: string; onPress?: () => void }[],
    ];
    const confirmButton = lastCall[2].find((b) => b.text === 'Remove');
    confirmButton?.onPress?.();

    await waitFor(async () => {
      const photos = await repository.photos({ start: '2026-07-26', end: '2026-07-26' });
      expect(photos).toHaveLength(0);
    });
  });
});
