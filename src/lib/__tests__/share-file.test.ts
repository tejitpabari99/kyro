/**
 * `lib/share-file.ts` tests (M5-06 acceptance gate: "share sheet invoked
 * test — mock `expo-sharing`'s `shareAsync`, check it's called with a real,
 * non-empty file URI"). Mocks the raw `expo-sharing` native module directly
 * (unlike the `SettingsScreen`/`HistoryDetailScreen` tests, which mock this
 * file's own `shareFile` export instead — see that file's header) so this
 * suite is the one place that actually proves the real call reaches
 * `Sharing.shareAsync` with the URI it was given.
 */
import * as Sharing from 'expo-sharing';

import { shareFile } from '../share-file';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const mockSharing = Sharing as unknown as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};

describe('shareFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the share sheet with the given real, non-empty file URI and options once sharing is available', async () => {
    mockSharing.isAvailableAsync.mockResolvedValue(true);
    mockSharing.shareAsync.mockResolvedValue(undefined);

    await shareFile('file:///mock-cache/kyro_workouts.csv', {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export Workouts',
    });

    expect(mockSharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(mockSharing.shareAsync).toHaveBeenCalledWith('file:///mock-cache/kyro_workouts.csv', {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export Workouts',
    });
  });

  it('throws a clear error and never calls shareAsync when sharing is unavailable on this platform', async () => {
    mockSharing.isAvailableAsync.mockResolvedValue(false);

    await expect(shareFile('file:///mock-cache/kyro_workouts.csv')).rejects.toThrow(
      /not available/i,
    );
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });

  it('propagates a rejection from shareAsync itself (e.g. a native share-sheet error)', async () => {
    mockSharing.isAvailableAsync.mockResolvedValue(true);
    mockSharing.shareAsync.mockRejectedValue(new Error('native failure'));

    await expect(shareFile('file:///mock-cache/kyro_workouts.csv')).rejects.toThrow(
      'native failure',
    );
  });
});
