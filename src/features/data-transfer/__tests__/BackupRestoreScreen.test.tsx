/**
 * `BackupRestoreScreen` tests (M5-09 acceptance gate: double-confirm flow
 * via RNTL — both confirmations required, cancel at either point aborts
 * cleanly with zero DB changes). `@/lib/hevy-import-file` (reused here for
 * its generic `pickFile`) and `@/features/measurements/photo-orphan-sweep`
 * are mocked wholesale — no real native document picker/filesystem call
 * ever happens in this file. `backupService`/`measurementRepository` are
 * plain `jest.fn()`-backed stubs passed as props (this component's own
 * contract — the route, `app/backup/restore.tsx`, is what constructs the
 * real ones), same convention `HevyImportScreen.test.tsx` already
 * established for the sibling import flow.
 *
 * "Zero DB changes" on cancel is asserted the strongest way available at
 * this layer: `backupService.restore` (a plain `jest.fn()`) is asserted
 * `not.toHaveBeenCalled()` — since `restore()` is the *only* function in
 * this whole flow that can mutate the database (`backup-service.ts`'s own
 * `replaceAllTables`), a cancelled confirm that never calls it has,
 * definitionally, made zero DB changes.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { MeasurementRepository } from '@/data/measurements/types';
import { ThemeProvider } from '@/ui/theme-provider';

import { BackupRestoreScreen } from '../BackupRestoreScreen';
import type { BackupRestoreResult, BackupServiceApi } from '../backup-service';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/lib/hevy-import-file');
const mockedFile = jest.requireMock('@/lib/hevy-import-file') as { pickFile: jest.Mock };

jest.mock('@/features/measurements/photo-orphan-sweep', () => ({
  sweepOrphanProgressPhotos: jest.fn().mockResolvedValue({ orphanFilesDeleted: [], rowsMissingFiles: [] }),
}));
const mockedSweep = jest.requireMock('@/features/measurements/photo-orphan-sweep') as {
  sweepOrphanProgressPhotos: jest.Mock;
};

/** Same helper `HistoryDetailScreen.test.tsx`/`RoutinesHubScreen.test.tsx` use — finds and presses a button by label in the most recent `Alert.alert` call, wrapped in `act` so any state update the press triggers (including ones after an `await` inside an async handler) is flushed before the next assertion. */
async function pressAlertButton(label: string): Promise<void> {
  const alertMock = Alert.alert as jest.Mock;
  const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
  const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === label);
  if (!button) throw new Error(`No "${label}" button was found.`);
  await act(async () => {
    button.onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buildResult(overrides: Partial<BackupRestoreResult> = {}): BackupRestoreResult {
  return { workoutCount: 12, photoCount: 3, restoredAt: 0, ...overrides };
}

async function renderScreen(
  backupService: Pick<BackupServiceApi, 'restore'>,
  measurementRepository: Pick<MeasurementRepository, 'photos'> = { photos: async () => [] },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const clearSpy = jest.spyOn(queryClient, 'clear');
  // `@testing-library/react-native` v14's `render` is async (same note
  // `HevyImportScreen.test.tsx`'s own `renderScreen` makes) — must be
  // awaited here, not just by the outer async function's implicit
  // Promise-unwrapping-on-return (this helper does more work, like
  // building `clearSpy`, after the render call, so it needs the real
  // resolved value here rather than a still-pending Promise).
  const rendered = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BackupRestoreScreen backupService={backupService} measurementRepository={measurementRepository} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, clearSpy };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.zip', name: 'kyro_backup_2026-01-01.zip' });
});

describe('BackupRestoreScreen — idle/pick', () => {
  it('renders the idle empty state with a Choose Backup File button', async () => {
    await renderScreen({ restore: jest.fn() });

    expect(screen.getByTestId('backup-restore-screen-idle')).toBeTruthy();
    expect(screen.getByTestId('backup-restore-screen-choose-file')).toBeTruthy();
  });

  it('stays on idle when the user cancels the document picker (pickFile resolves null) — no confirm dialog, no restore call', async () => {
    mockedFile.pickFile.mockResolvedValue(null);
    const restore = jest.fn();
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));

    await waitFor(() => expect(mockedFile.pickFile).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByTestId('backup-restore-screen-idle')).toBeTruthy();
  });

  it('closing via the header Cancel button navigates back without picking a file', async () => {
    await renderScreen({ restore: jest.fn() });

    fireEvent.press(screen.getByTestId('backup-restore-screen-close'));

    expect(router.back).toHaveBeenCalled();
  });

  // Regression (found in M5 milestone-wide review): `handleChooseFile` had
  // no try/catch anywhere — a rejecting `pickFile()` became an unhandled
  // promise rejection instead of the same error phase the rest of this
  // screen already uses for a failed restore.
  it('shows an error screen when the file picker itself rejects, instead of throwing unhandled', async () => {
    mockedFile.pickFile.mockRejectedValue(new Error('picker crashed'));
    const restore = jest.fn();
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));

    await waitFor(() => expect(screen.getByTestId('backup-restore-screen-error')).toBeTruthy());
    expect(screen.getByText('picker crashed')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe('BackupRestoreScreen — double confirm (M5-09 acceptance gate)', () => {
  it('shows the first confirm ("This replaces all current data") after picking a file, before calling restore', async () => {
    const restore = jest.fn();
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Restore Backup',
      'This replaces all current data.',
      expect.any(Array),
    );
    expect(restore).not.toHaveBeenCalled();
  });

  it('cancelling the FIRST confirm aborts cleanly — no second dialog, restore never called, screen stays idle', async () => {
    const restore = jest.fn();
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));

    await pressAlertButton('Cancel');

    expect(Alert.alert).toHaveBeenCalledTimes(1); // second dialog never shown
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByTestId('backup-restore-screen-idle')).toBeTruthy();
  });

  it('confirming the first dialog shows the SECOND ("can\'t be undone") confirm — restore still not called', async () => {
    const restore = jest.fn();
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));

    await pressAlertButton('Continue');

    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Are you sure?',
      expect.stringContaining("can't be undone"),
      expect.any(Array),
    );
    expect(restore).not.toHaveBeenCalled();
  });

  it('cancelling the SECOND confirm aborts cleanly — restore never called, screen stays idle', async () => {
    const restore = jest.fn();
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButton('Continue');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));

    await pressAlertButton('Cancel');

    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByTestId('backup-restore-screen-idle')).toBeTruthy();
  });

  it('confirming BOTH dialogs calls restore() with the picked file URI', async () => {
    const restore = jest.fn().mockResolvedValue(buildResult());
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButton('Continue');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    await pressAlertButton('Restore');

    await waitFor(() => expect(restore).toHaveBeenCalledWith('file:///picked.zip'));
  });
});

describe('BackupRestoreScreen — restore/report', () => {
  it('on success: runs the orphan sweep, clears the query cache, and shows the report; Done navigates back', async () => {
    const result = buildResult({ workoutCount: 7, photoCount: 2 });
    const restore = jest.fn().mockResolvedValue(result);
    const { clearSpy } = await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButton('Continue');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    await pressAlertButton('Restore');

    await waitFor(() => expect(screen.getByTestId('backup-restore-screen-report')).toBeTruthy());
    expect(screen.getByText('Restore complete')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(mockedSweep.sweepOrphanProgressPhotos).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('backup-restore-screen-done'));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows an error screen when restore() returns a file error, without running the orphan sweep or clearing the cache', async () => {
    const restore = jest.fn().mockResolvedValue({ error: 'This file is not a valid Kyro backup.' });
    const { clearSpy } = await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButton('Continue');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    await pressAlertButton('Restore');

    await waitFor(() => expect(screen.getByTestId('backup-restore-screen-error')).toBeTruthy());
    expect(screen.getByText('This file is not a valid Kyro backup.')).toBeTruthy();
    expect(mockedSweep.sweepOrphanProgressPhotos).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('backup-restore-screen-retry'));
    expect(screen.getByTestId('backup-restore-screen-idle')).toBeTruthy();
  });

  it('shows an error screen when restore() rejects, without leaving the UI stuck on "Restoring…"', async () => {
    const restore = jest.fn().mockRejectedValue(new Error('transaction failed'));
    await renderScreen({ restore });

    fireEvent.press(screen.getByTestId('backup-restore-screen-choose-file'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    await pressAlertButton('Continue');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    await pressAlertButton('Restore');

    await waitFor(() => expect(screen.getByTestId('backup-restore-screen-error')).toBeTruthy());
    expect(screen.getByText('transaction failed')).toBeTruthy();
  });
});
