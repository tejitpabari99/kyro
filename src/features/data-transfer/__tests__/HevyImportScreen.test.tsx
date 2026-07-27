/**
 * `HevyImportScreen` tests (M5-07 acceptance gate: RNTL smoke of the
 * document-picker → preview → confirm → report flow, plus the
 * whole-file-error and preview-cancel paths). `@/lib/hevy-import-file` is
 * mocked wholesale (manual mock, `src/lib/__mocks__/hevy-import-file.ts`) —
 * no real native document picker/filesystem call ever happens here. The
 * `importService` itself is a plain `jest.fn()`-backed stub passed as a
 * prop (this component's own contract — the route, `app/import/hevy.tsx`,
 * is what constructs the real one) so every phase transition can be driven
 * deterministically without a real DB.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '@/ui/theme-provider';

import { HevyImportScreen } from '../HevyImportScreen';
import type {
  HevyImportPreview,
  HevyImportReport,
  HevyImportServiceApi,
} from '../hevy-import-service';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/lib/hevy-import-file');
const mockedFile = jest.requireMock('@/lib/hevy-import-file') as {
  pickFile: jest.Mock;
};

function buildPreview(overrides: Partial<HevyImportPreview> = {}): HevyImportPreview {
  return {
    units: { weightUnit: 'kg', distanceUnit: 'km' },
    workoutsFoundCount: 2,
    dateRange: { start: 1, end: 2 },
    matchedExerciseTitles: ['Bench Press'],
    unmatchedExercises: [
      {
        exerciseTitle: 'Zercher Carry',
        inference: { exerciseType: 'short_distance_weight', ambiguous: false },
      },
    ],
    duplicateWorkoutCount: 1,
    malformedRows: [{ line: 5, reason: 'Missing or unparseable start_time.' }],
    workoutSkips: [],
    warnings: [{ line: 3, message: 'RPE 11 is outside the valid range — snapped to 10.' }],
    workouts: [],
    exerciseIdByTitle: new Map(),
    ...overrides,
  };
}

function buildReport(overrides: Partial<HevyImportReport> = {}): HevyImportReport {
  return {
    importedWorkoutCount: 1,
    importedSetCount: 4,
    duplicateSkippedCount: 1,
    autoCreatedExercises: [
      {
        exerciseTitle: 'Zercher Carry',
        exerciseId: 'new-ex-1',
        inference: { exerciseType: 'short_distance_weight', ambiguous: false },
      },
    ],
    malformedRows: [{ line: 5, reason: 'Missing or unparseable start_time.' }],
    workoutSkips: [],
    warnings: [{ line: 3, message: 'RPE 11 is outside the valid range — snapped to 10.' }],
    touchedExerciseIds: ['bench-press', 'new-ex-1'],
    ...overrides,
  };
}

// `@testing-library/react-native` v14's `render` is async — every call site
// below awaits this function (same pattern `ExerciseFormScreen.test.tsx`'s
// own `renderForm` helper documents) so `screen.getByTestId` immediately
// after is guaranteed to see a mounted tree.
async function renderScreen(importService: HevyImportServiceApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <HevyImportScreen importService={importService} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HevyImportScreen — idle/pick', () => {
  it('renders the idle empty state with a Choose CSV File button', async () => {
    await renderScreen({ preview: jest.fn(), confirm: jest.fn() });

    expect(screen.getByTestId('hevy-import-screen-idle')).toBeTruthy();
    expect(screen.getByTestId('hevy-import-screen-choose-file')).toBeTruthy();
  });

  it('stays on idle when the user cancels the document picker (pickFile resolves null)', async () => {
    mockedFile.pickFile.mockResolvedValue(null);
    const preview = jest.fn();
    await renderScreen({ preview, confirm: jest.fn() });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));

    await waitFor(() => expect(mockedFile.pickFile).toHaveBeenCalled());
    expect(preview).not.toHaveBeenCalled();
    expect(screen.getByTestId('hevy-import-screen-idle')).toBeTruthy();
  });

  it('closing via the header Cancel button navigates back without picking a file', async () => {
    await renderScreen({ preview: jest.fn(), confirm: jest.fn() });

    fireEvent.press(screen.getByTestId('hevy-import-screen-close'));

    expect(router.back).toHaveBeenCalled();
  });
});

describe('HevyImportScreen — preview', () => {
  it('shows preview stats, matched/unmatched exercises, skipped rows, and warnings after a successful pick', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const preview = jest.fn().mockResolvedValue(buildPreview());
    await renderScreen({ preview, confirm: jest.fn() });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));

    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-preview')).toBeTruthy());
    expect(preview).toHaveBeenCalledWith('file:///picked.csv');
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText(/Zercher Carry/)).toBeTruthy();
    expect(screen.getByText(/Line 5: Missing or unparseable start_time/)).toBeTruthy();
  });

  it('shows a whole-file error screen when preview() returns a header error, with a retry back to idle', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const preview = jest.fn().mockResolvedValue({ error: 'Missing required column(s): title.' });
    await renderScreen({ preview, confirm: jest.fn() });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));

    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-error')).toBeTruthy());
    expect(screen.getByText('Missing required column(s): title.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('hevy-import-screen-retry'));
    expect(screen.getByTestId('hevy-import-screen-idle')).toBeTruthy();
  });

  it('shows an error screen when preview() rejects (e.g. a file-read failure)', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const preview = jest.fn().mockRejectedValue(new Error('disk read failed'));
    await renderScreen({ preview, confirm: jest.fn() });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));

    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-error')).toBeTruthy());
    expect(screen.getByText('disk read failed')).toBeTruthy();
  });

  it('cancelling the preview returns to idle without confirming', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const preview = jest.fn().mockResolvedValue(buildPreview());
    const confirm = jest.fn();
    await renderScreen({ preview, confirm });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));
    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-preview')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('hevy-import-screen-preview-cancel'));

    expect(screen.getByTestId('hevy-import-screen-idle')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('disables the confirm button when there is nothing new to import (all duplicates)', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const preview = jest
      .fn()
      .mockResolvedValue(buildPreview({ workoutsFoundCount: 1, duplicateWorkoutCount: 1 }));
    await renderScreen({ preview, confirm: jest.fn() });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));
    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-preview')).toBeTruthy());

    expect(screen.getByTestId('hevy-import-screen-preview-confirm').props.accessibilityState.disabled).toBe(
      true,
    );
  });
});

describe('HevyImportScreen — confirm/report', () => {
  it('confirms the import, shows the report, and Done navigates back', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const previewResult = buildPreview();
    const preview = jest.fn().mockResolvedValue(previewResult);
    const report = buildReport();
    const confirm = jest.fn().mockResolvedValue(report);
    await renderScreen({ preview, confirm });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));
    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-preview')).toBeTruthy());

    fireEvent.press(screen.getByTestId('hevy-import-screen-preview-confirm'));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(previewResult));
    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-report')).toBeTruthy());
    expect(screen.getByText('Import complete')).toBeTruthy();
    expect(screen.getByText(/Zercher Carry/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('hevy-import-screen-done'));
    expect(router.back).toHaveBeenCalled();
  });

  it('surfaces an error screen when confirm() rejects, without leaving the UI stuck on "Importing…"', async () => {
    mockedFile.pickFile.mockResolvedValue({ uri: 'file:///picked.csv', name: 'hevy.csv' });
    const preview = jest.fn().mockResolvedValue(buildPreview());
    const confirm = jest.fn().mockRejectedValue(new Error('transaction failed'));
    await renderScreen({ preview, confirm });

    fireEvent.press(screen.getByTestId('hevy-import-screen-choose-file'));
    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-preview')).toBeTruthy());

    fireEvent.press(screen.getByTestId('hevy-import-screen-preview-confirm'));

    await waitFor(() => expect(screen.getByTestId('hevy-import-screen-error')).toBeTruthy());
    expect(screen.getByText('transaction failed')).toBeTruthy();
  });
});
