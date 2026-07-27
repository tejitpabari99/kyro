/**
 * `PhotoGalleryScreen` tests (M5-03 acceptance gate) — grid-by-date
 * rendering, tap-to-navigate (pager route), select-two -> Compare
 * navigation, and the "+ Add Photo" capture pipeline (camera/library pick ->
 * `repository.addPhoto`), plus a light-theme smoke pass (this repo's
 * existing "one full dark-theme test + one 'renders without throwing'
 * light-theme test" convention, `MuscleDistributionBars.test.tsx`).
 *
 * `@/lib/progress-photo-capture` (`pickProgressPhoto`) and `@/lib/
 * progress-photos` (`progressPhotoUri`) are both mocked (08 §5 native-seam
 * pattern) — this screen never touches `expo-file-system`/
 * `expo-image-manipulator`/`expo-image-picker` directly.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type {
  BodyMeasurement,
  MeasurementDateRange,
  MeasurementPoint,
  MeasurementRepository,
  ProgressPhoto,
} from '@/data/measurements/types';
import { pickProgressPhoto } from '@/lib/progress-photo-capture';
import { ThemeProvider } from '@/ui/theme-provider';

import { PhotoGalleryScreen } from '../PhotoGalleryScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/lib/progress-photo-capture');
jest.mock('@/lib/progress-photos', () => ({
  progressPhotoUri: (fileName: string) => `file:///mock-documents/photos/progress/${fileName}`,
}));

const mockPickProgressPhoto = pickProgressPhoto as jest.Mock;

function photo(overrides: Partial<ProgressPhoto> & Pick<ProgressPhoto, 'id' | 'date'>): ProgressPhoto {
  return { fileName: `${overrides.id}.jpg`, createdAt: 0, ...overrides };
}

class FakeRepo implements MeasurementRepository {
  public addPhotoCalls: { date: string; sourceUri: string }[] = [];

  constructor(private rows: ProgressPhoto[]) {}

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
    return [];
  }
  async addPhoto(date: string, sourceUri: string): Promise<ProgressPhoto> {
    this.addPhotoCalls.push({ date, sourceUri });
    const created = photo({ id: `new-${this.addPhotoCalls.length}`, date });
    this.rows = [...this.rows, created];
    return created;
  }
  async photos(_range?: MeasurementDateRange): Promise<ProgressPhoto[]> {
    return this.rows;
  }
  async deletePhoto(): Promise<void> {
    throw new Error('unused');
  }
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderScreen(repository: MeasurementRepository, theme: 'dark' | 'light' = 'dark') {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <PhotoGalleryScreen repository={repository} testID="gallery" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Scoped to *just* the `Alert.alert` spy each Alert-driven test below sets
// up (never a blanket `jest.restoreAllMocks()`): jest-expo's own test
// environment sets up several of its own `jest.spyOn` calls internally
// (Dimensions/Appearance/etc.) for the RN host to work at all under Jest —
// a global restore reverts *those* too, breaking every render after the
// first Alert-mocking test (confirmed empirically while building this file:
// `restoreAllMocks()` here made every test after the first "Add Photo"
// test fail to render anything, `screen.debug()` showing an empty tree).
let alertSpy: ReturnType<typeof jest.spyOn> | undefined;
afterEach(() => {
  alertSpy?.mockRestore();
  alertSpy = undefined;
});

describe('PhotoGalleryScreen (dark theme)', () => {
  it('shows an empty state when there are no photos', async () => {
    await renderScreen(new FakeRepo([]));
    expect(await screen.findByTestId('gallery-empty')).toBeTruthy();
  });

  it('renders one thumbnail per photo, grouped under its date', async () => {
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-07-01' }),
      photo({ id: 'p2', date: '2026-07-02' }),
    ]);
    await renderScreen(repository);

    expect(await screen.findByTestId('gallery-thumb-p1')).toBeTruthy();
    expect(await screen.findByTestId('gallery-thumb-p2')).toBeTruthy();
  });

  it('tapping a thumbnail (outside select mode) navigates to the pager route', async () => {
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository);

    fireEvent.press(await screen.findByTestId('gallery-thumb-p1'));

    expect(router.push).toHaveBeenCalledWith('/profile/measures/photos/p1');
  });

  it('selecting exactly two photos in select mode shows Compare, which navigates with both ids', async () => {
    const repository = new FakeRepo([
      photo({ id: 'p1', date: '2026-07-01' }),
      photo({ id: 'p2', date: '2026-07-02' }),
      photo({ id: 'p3', date: '2026-07-03' }),
    ]);
    await renderScreen(repository);

    fireEvent.press(await screen.findByTestId('gallery-select-toggle'));
    fireEvent.press(await screen.findByTestId('gallery-thumb-p1'));
    fireEvent.press(await screen.findByTestId('gallery-thumb-p3'));

    expect(await screen.findByTestId('gallery-compare-button')).toBeTruthy();
    // A third selection past the 2-photo cap is a no-op, not a swap. Asserted
    // via `waitFor` (not a bare synchronous `expect`) — this no-op press
    // returns the same array reference from the `setSelectedIds` updater
    // (a deliberate React bail-out, see `PhotoGalleryScreen.handleThumbnailPress`),
    // and asserting synchronously right after was found (empirically, while
    // building this file) to leave a pending scheduler update that corrupts
    // the *next* test's render — `waitFor` gives React's own act()-wrapped
    // flush a chance to fully settle before this test ends.
    fireEvent.press(await screen.findByTestId('gallery-thumb-p2'));
    await waitFor(() => expect(screen.queryByTestId('gallery-thumb-selected-p2')).toBeNull());

    fireEvent.press(screen.getByTestId('gallery-compare-button'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/profile/measures/photos/compare',
      params: { a: 'p1', b: 'p3' },
    });
  });

});

describe('PhotoGalleryScreen — Add Photo pipeline (Alert-driven)', () => {
  it('choosing Camera from the Add Photo alert saves via repository.addPhoto', async () => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const cameraButton = buttons?.find((b) => b.text === 'Camera');
      cameraButton?.onPress?.();
    });
    mockPickProgressPhoto.mockResolvedValue({ uri: 'file:///picked.jpg', width: 500, height: 500 });

    const repository = new FakeRepo([]);
    await renderScreen(repository);

    fireEvent.press(await screen.findByTestId('gallery-empty-add'));

    await waitFor(() => expect(repository.addPhotoCalls).toHaveLength(1));
    expect(repository.addPhotoCalls[0]?.sourceUri).toBe('file:///picked.jpg');
    expect(mockPickProgressPhoto).toHaveBeenCalledWith('camera');
  });

  it('a cancelled/denied pick (null) never calls repository.addPhoto', async () => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const libraryButton = buttons?.find((b) => b.text === 'Library');
      libraryButton?.onPress?.();
    });
    mockPickProgressPhoto.mockResolvedValue(null);

    const repository = new FakeRepo([]);
    await renderScreen(repository);

    fireEvent.press(await screen.findByTestId('gallery-empty-add'));

    await waitFor(() => expect(mockPickProgressPhoto).toHaveBeenCalledWith('library'));
    expect(repository.addPhotoCalls).toHaveLength(0);
  });

  // Regression (found in M5 milestone-wide review): each Camera/Library
  // `Alert.alert` `onPress` callback wraps `pickProgressPhoto` in a bare
  // `void (async () => {...})()` with no try/catch — a rejecting picker
  // (camera/library permission errors, etc.) became an unhandled promise
  // rejection instead of the same user-facing failure Alert
  // `addPhotoMutation.onError` already shows for a failed save.
  it('a rejecting picker (e.g. a camera permission error) shows the same failure Alert as a failed save, without throwing unhandled', async () => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const cameraButton = buttons?.find((b) => b.text === 'Camera');
      cameraButton?.onPress?.();
    });
    mockPickProgressPhoto.mockRejectedValue(new Error('camera permission denied'));

    const repository = new FakeRepo([]);
    await renderScreen(repository);

    fireEvent.press(await screen.findByTestId('gallery-empty-add'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Something went wrong',
        'This photo could not be saved. Please try again.',
      ),
    );
    expect(repository.addPhotoCalls).toHaveLength(0);
  });
});

describe('PhotoGalleryScreen (light theme smoke)', () => {
  it('renders without throwing in light theme', async () => {
    const repository = new FakeRepo([photo({ id: 'p1', date: '2026-07-01' })]);
    await renderScreen(repository, 'light');

    expect(await screen.findByTestId('gallery-thumb-p1')).toBeTruthy();
  });
});
