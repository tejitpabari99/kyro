/**
 * `PhotoPagerScreen` tests (M5-03 acceptance gate) — initial index
 * resolution, date + weight overlay, prev/next paging, delete-with-confirm
 * (both the "last photo -> navigate back" and "more photos remain -> stay"
 * paths), and the missing-file placeholder (05 §8's orphan-sweep UI half),
 * plus a light-theme smoke pass.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { Alert } from 'react-native';
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

import { PhotoPagerScreen } from '../PhotoPagerScreen';

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
  public deletedIds: string[] = [];

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
    return this.photoRows.filter((row) => !this.deletedIds.includes(row.id));
  }
  async deletePhoto(id: string): Promise<void> {
    this.deletedIds.push(id);
  }
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderScreen(
  repository: MeasurementRepository,
  initialPhotoId: string,
  theme: 'dark' | 'light' = 'dark',
) {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <PhotoPagerScreen repository={repository} initialPhotoId={initialPhotoId} testID="pager" />
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

describe('PhotoPagerScreen (dark theme)', () => {
  it('opens centered on the requested photo, showing its date and weight overlay', async () => {
    const repository = new FakeRepo(
      [photo({ id: 'p1', date: '2026-07-01' }), photo({ id: 'p2', date: '2026-07-02' })],
      [measurement({ date: '2026-07-02', weightKg: 82.3 })],
    );
    await renderScreen(repository, 'p2');

    expect(await screen.findByTestId('pager-image-p2')).toBeTruthy();
    expect(await screen.findByTestId('pager-date')).toHaveTextContent('2 Jul 2026');
    expect(await screen.findByTestId('pager-weight')).toHaveTextContent('82.3 kg');
  });

  it('omits the weight line when the date has no weight logged', async () => {
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository, 'p1');

    expect(await screen.findByTestId('pager-date')).toBeTruthy();
    expect(screen.queryByTestId('pager-weight')).toBeNull();
  });

  it('next/prev buttons move between photos and disable at the ends', async () => {
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-07-01' }),
      photo({ id: 'p2', date: '2026-07-02' }),
    ]);
    await renderScreen(repository, 'p1');

    expect(await screen.findByTestId('pager-date')).toHaveTextContent('1 Jul 2026');

    fireEvent.press(screen.getByTestId('pager-next'));
    await waitFor(() => expect(screen.getByTestId('pager-date')).toHaveTextContent('2 Jul 2026'));

    fireEvent.press(screen.getByTestId('pager-prev'));
    await waitFor(() => expect(screen.getByTestId('pager-date')).toHaveTextContent('1 Jul 2026'));
  });

  it('delete with confirm removes the photo via repository.deletePhoto and navigates back when it was the last one', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const deleteButton = buttons?.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository, 'p1');

    fireEvent.press(await screen.findByTestId('pager-delete'));

    await waitFor(() => expect(repository.deletedIds).toEqual(['p1']));
    await waitFor(() => expect(router.back).toHaveBeenCalled());

    alertSpy.mockRestore();
  });

  it('delete with confirm stays on the pager (no navigation back) when other photos remain', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const deleteButton = buttons?.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-07-01' }),
      photo({ id: 'p2', date: '2026-07-02' }),
    ]);
    await renderScreen(repository, 'p1');

    fireEvent.press(await screen.findByTestId('pager-delete'));

    await waitFor(() => expect(repository.deletedIds).toEqual(['p1']));
    expect(router.back).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('cancelling the delete confirm never calls repository.deletePhoto', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository, 'p1');

    fireEvent.press(await screen.findByTestId('pager-delete'));

    expect(repository.deletedIds).toEqual([]);

    alertSpy.mockRestore();
  });

  it('renders a placeholder (not a crash) when the image fails to load — the orphan-sweep UI half', async () => {
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository, 'p1');

    const image = await screen.findByTestId('pager-image-p1');
    fireEvent(image, 'error', { nativeEvent: { error: 'file not found' } });

    expect(await screen.findByTestId('pager-placeholder-p1')).toBeTruthy();
    expect(screen.queryByTestId('pager-image-p1')).toBeNull();
  });
});

// Regression (found in M5 milestone-wide review): a real query failure
// previously fell through to `photos = []`, rendering a blank pager with no
// error indicator at all — indistinguishable from a data-loading bug.
class FailingRepo implements MeasurementRepository {
  async upsert(): Promise<void> {
    throw new Error('unused');
  }
  async clearField(): Promise<void> {
    throw new Error('unused');
  }
  async list(_range?: MeasurementDateRange): Promise<BodyMeasurement[]> {
    throw new Error('database is locked');
  }
  async series(): Promise<MeasurementPoint[]> {
    return [];
  }
  async addPhoto(): Promise<ProgressPhoto> {
    throw new Error('unused');
  }
  async photos(_range?: MeasurementDateRange): Promise<ProgressPhoto[]> {
    throw new Error('database is locked');
  }
  async deletePhoto(): Promise<void> {
    throw new Error('unused');
  }
}

describe('PhotoPagerScreen — query error', () => {
  it('shows a distinct error state (not a blank pager) when a query fails, with a working retry', async () => {
    const repository = new FailingRepo();
    await renderScreen(repository, 'p1');

    expect(await screen.findByTestId('pager-error')).toBeTruthy();
    expect(screen.queryByTestId('pager-scroll')).toBeNull();

    jest.spyOn(repository, 'photos').mockResolvedValue([photo({ id: 'p1', date: '2026-07-01' })]);
    jest.spyOn(repository, 'list').mockResolvedValue([]);
    await fireEvent.press(screen.getByTestId('pager-retry'));

    expect(await screen.findByTestId('pager-image-p1')).toBeTruthy();
    expect(screen.queryByTestId('pager-error')).toBeNull();
  });
});

describe('PhotoPagerScreen (light theme smoke)', () => {
  it('renders without throwing in light theme', async () => {
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository, 'p1', 'light');

    expect(await screen.findByTestId('pager-image-p1')).toBeTruthy();
  });
});
