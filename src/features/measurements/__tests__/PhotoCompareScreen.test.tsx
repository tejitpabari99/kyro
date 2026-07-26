/**
 * `PhotoCompareScreen` tests (M5-03 acceptance gate) — side-by-side render
 * with both dates, correct per-field deltas (metric and imperial), fields
 * present on only one side, the "neither date has data" empty case, and the
 * "photo no longer exists" guard, plus a light-theme smoke pass.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type {
  BodyMeasurement,
  MeasurementDateRange,
  MeasurementFields,
  MeasurementPoint,
  MeasurementRepository,
  ProgressPhoto,
} from '@/data/measurements/types';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { PhotoCompareScreen } from '../PhotoCompareScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/lib/progress-photos', () => ({
  progressPhotoUri: (fileName: string) => `file:///mock-documents/photos/progress/${fileName}`,
}));

function photo(overrides: Partial<ProgressPhoto> & Pick<ProgressPhoto, 'id' | 'date'>): ProgressPhoto {
  return { fileName: `${overrides.id}.jpg`, createdAt: 0, ...overrides };
}

function measurement(overrides: Partial<BodyMeasurement> & Pick<BodyMeasurement, 'date'>): BodyMeasurement {
  const empty: MeasurementFields = {
    weightKg: null,
    fatPercent: null,
    leanMassKg: null,
    neckCm: null,
    shouldersCm: null,
    chestCm: null,
    leftBicepCm: null,
    rightBicepCm: null,
    leftForearmCm: null,
    rightForearmCm: null,
    abdomenCm: null,
    waistCm: null,
    hipsCm: null,
    leftThighCm: null,
    rightThighCm: null,
    leftCalfCm: null,
    rightCalfCm: null,
  };
  return { ...empty, createdAt: 0, updatedAt: 0, ...overrides };
}

class FakeRepo implements MeasurementRepository {
  constructor(
    private photoRows: ProgressPhoto[],
    private measurementRows: BodyMeasurement[] = [],
  ) {}

  async upsert(): Promise<void> {
    throw new Error('unused');
  }
  async clearField(): Promise<void> {
    throw new Error('unused');
  }
  async list(_range?: MeasurementDateRange): Promise<BodyMeasurement[]> {
    return this.measurementRows;
  }
  async series(): Promise<MeasurementPoint[]> {
    return [];
  }
  async addPhoto(): Promise<ProgressPhoto> {
    throw new Error('unused');
  }
  async photos(_range?: MeasurementDateRange): Promise<ProgressPhoto[]> {
    return this.photoRows;
  }
  async deletePhoto(): Promise<void> {
    throw new Error('unused');
  }
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderScreen(
  repository: MeasurementRepository,
  photoAId: string,
  photoBId: string,
  theme: 'dark' | 'light' = 'dark',
) {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <PhotoCompareScreen
          repository={repository}
          photoAId={photoAId}
          photoBId={photoBId}
          testID="compare"
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, body_measurement_unit: 'metric' },
  }));
});

describe('PhotoCompareScreen (dark theme)', () => {
  it('renders both dates and both images', async () => {
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-06-01' }),
      photo({ id: 'p2', date: '2026-07-01' }),
    ]);
    await renderScreen(repository, 'p1', 'p2');

    expect(await screen.findByTestId('compare-image-a')).toBeTruthy();
    expect(await screen.findByTestId('compare-image-b')).toBeTruthy();
    expect(await screen.findByTestId('compare-date-a')).toHaveTextContent('1 Jun 2026');
    expect(await screen.findByTestId('compare-date-b')).toHaveTextContent('1 Jul 2026');
  });

  it('renders a delta row (with correct sign) for a field present on both dates', async () => {
    const repository = new FakeRepo(
      [photo({ id: 'p1', date: '2026-06-01' }), photo({ id: 'p2', date: '2026-07-01' })],
      [
        measurement({ date: '2026-06-01', weightKg: 80, waistCm: 82 }),
        measurement({ date: '2026-07-01', weightKg: 78, waistCm: 80 }),
      ],
    );
    await renderScreen(repository, 'p1', 'p2');

    expect(await screen.findByTestId('compare-row-weightKg')).toHaveTextContent(
      '80 kg → 78 kg',
      { exact: false },
    );
    expect(await screen.findByTestId('compare-delta-weightKg')).toHaveTextContent('-2 kg');
    expect(await screen.findByTestId('compare-row-waistCm')).toHaveTextContent(
      '82 cm → 80 cm',
      { exact: false },
    );
    expect(await screen.findByTestId('compare-delta-waistCm')).toHaveTextContent('-2 cm');
  });

  it('formats deltas in imperial units when body_measurement_unit is imperial', async () => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, body_measurement_unit: 'imperial' },
    }));
    const repository = new FakeRepo(
      [photo({ id: 'p1', date: '2026-06-01' }), photo({ id: 'p2', date: '2026-07-01' })],
      [
        measurement({ date: '2026-06-01', weightKg: 80 }),
        measurement({ date: '2026-07-01', weightKg: 82 }),
      ],
    );
    await renderScreen(repository, 'p1', 'p2');

    expect(await screen.findByTestId('compare-delta-weightKg')).toHaveTextContent('+4.5 lb');
  });

  it('shows a value on one side and "—" on the other for a field only one date has, with no delta', async () => {
    const repository = new FakeRepo(
      [photo({ id: 'p1', date: '2026-06-01' }), photo({ id: 'p2', date: '2026-07-01' })],
      [measurement({ date: '2026-07-01', weightKg: 78 })],
    );
    await renderScreen(repository, 'p1', 'p2');

    expect(await screen.findByTestId('compare-row-weightKg')).toHaveTextContent(
      '— → 78 kg',
      { exact: false },
    );
    expect(screen.queryByTestId('compare-delta-weightKg')).toBeNull();
  });

  it('omits a field entirely when neither date has a value for it', async () => {
    const repository = new FakeRepo(
      [photo({ id: 'p1', date: '2026-06-01' }), photo({ id: 'p2', date: '2026-07-01' })],
      [
        measurement({ date: '2026-06-01', weightKg: 80 }),
        measurement({ date: '2026-07-01', weightKg: 78 }),
      ],
    );
    await renderScreen(repository, 'p1', 'p2');

    await screen.findByTestId('compare-row-weightKg');
    expect(screen.queryByTestId('compare-row-waistCm')).toBeNull();
  });

  it('shows the "no data" message when neither date has any measurement row at all', async () => {
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-06-01' }),
      photo({ id: 'p2', date: '2026-07-01' }),
    ]);
    await renderScreen(repository, 'p1', 'p2');

    expect(await screen.findByTestId('compare-no-data')).toBeTruthy();
  });

  it('shows a "photo no longer available" guard when a photo id no longer resolves', async () => {
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-06-01' })]);
    await renderScreen(repository, 'p1', 'deleted-id');

    expect(await screen.findByTestId('compare-missing')).toBeTruthy();
  });
});

describe('PhotoCompareScreen (light theme smoke)', () => {
  it('renders without throwing in light theme', async () => {
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-06-01' }),
      photo({ id: 'p2', date: '2026-07-01' }),
    ]);
    await renderScreen(repository, 'p1', 'p2', 'light');

    expect(await screen.findByTestId('compare-image-a')).toBeTruthy();
  });
});
