/**
 * `SaveWorkoutSheet` tests (M2-14, 02 §14 step 2) — editable
 * title/description/start-time/duration, the computed stats row, the
 * Records-earned section rendering only when the (mocked) records provider
 * returns data, and `Save Workout` producing the right `FinishMeta`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecordAward } from '../records-provider';
import { SaveWorkoutSheet } from '../SaveWorkoutSheet';
import { ThemeProvider } from '@/ui/theme-provider';

const mockUseWorkoutRecordsEarned = jest.fn();
jest.mock('../records-provider', () => ({
  useWorkoutRecordsEarned: (...args: unknown[]) => mockUseWorkoutRecordsEarned(...args),
}));

async function renderSheet(overrides: Partial<React.ComponentProps<typeof SaveWorkoutSheet>> = {}) {
  const onDismiss = jest.fn();
  const onSave = jest.fn();
  const startTime = new Date(2026, 0, 1, 9, 0, 0).getTime();
  const props: React.ComponentProps<typeof SaveWorkoutSheet> = {
    visible: true,
    onDismiss,
    workoutId: 'workout-1',
    initialTitle: 'Morning Workout',
    initialDescription: null,
    startTime,
    elapsedMs: 45 * 60 * 1000, // 45 minutes
    volumeLabel: '480 kg',
    setsCount: 3,
    recordsEarnedExercises: [],
    weightUnit: 'kg',
    onSave,
    testID: 'save-sheet',
    ...overrides,
  };
  await render(
    <ThemeProvider preference="dark">
      <SaveWorkoutSheet {...props} />
    </ThemeProvider>,
  );
  return { onDismiss, onSave, startTime };
}

beforeEach(() => {
  mockUseWorkoutRecordsEarned.mockReturnValue({ data: [] });
});

describe('SaveWorkoutSheet — fields + stats row', () => {
  it('seeds title/description/duration from props', async () => {
    await renderSheet({ initialDescription: 'Felt strong today' });
    expect(screen.getByTestId('save-sheet-title').props.value).toBe('Morning Workout');
    expect(screen.getByTestId('save-sheet-description').props.value).toBe('Felt strong today');
    expect(screen.getByTestId('save-sheet-duration-hours').props.value).toBe('0');
    expect(screen.getByTestId('save-sheet-duration-minutes').props.value).toBe('45');
    expect(screen.getByTestId('save-sheet-duration-seconds').props.value).toBe('0');
  });

  it('shows the fixed Volume/Sets stats and a live Duration stat', async () => {
    await renderSheet();
    // StatColumn renders label/value as Text children — assert via text content.
    expect(screen.getByText('480 kg')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('45:00')).toBeTruthy();
  });

  it('recomputes the Duration stat live as the duration fields are edited', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('save-sheet-duration-minutes'), '10');
    expect(screen.getByText('10:00')).toBeTruthy();
  });
});

describe('SaveWorkoutSheet — Records earned (M2-14 no-op wiring)', () => {
  it('renders nothing when the records provider returns an empty array', async () => {
    mockUseWorkoutRecordsEarned.mockReturnValue({ data: [] });
    await renderSheet();
    expect(screen.queryByTestId('save-sheet-records')).toBeNull();
  });

  it('renders nothing when the records provider returns undefined (still loading)', async () => {
    mockUseWorkoutRecordsEarned.mockReturnValue({ data: undefined });
    await renderSheet();
    expect(screen.queryByTestId('save-sheet-records')).toBeNull();
  });

  it('renders a trophy row per award when the records provider returns data', async () => {
    const awards: RecordAward[] = [
      { exerciseId: 'ex-1', exerciseName: 'Bench Press', kind: 'Heaviest Weight', value: '100 kg' },
    ];
    mockUseWorkoutRecordsEarned.mockReturnValue({ data: awards });
    await renderSheet();
    expect(screen.getByTestId('save-sheet-records')).toBeTruthy();
    expect(screen.getByTestId('save-sheet-record-0')).toBeTruthy();
    expect(screen.getByText(/Bench Press/)).toBeTruthy();
  });
});

describe('SaveWorkoutSheet — Save Workout', () => {
  it('calls onSave with the edited title/description/startTime/endTime', async () => {
    const { onSave, startTime } = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('save-sheet-title'), 'Leg Day');
    await fireEvent.changeText(screen.getByTestId('save-sheet-description'), 'New PR on squats');
    await fireEvent.press(screen.getByTestId('save-sheet-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const meta = onSave.mock.calls[0][0];
    expect(meta.title).toBe('Leg Day');
    expect(meta.description).toBe('New PR on squats');
    expect(meta.startTime).toBe(startTime);
    expect(meta.endTime).toBe(startTime + 45 * 60 * 1000);
  });

  it('falls back to the initial title when the title is cleared to empty', async () => {
    const { onSave } = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('save-sheet-title'), '   ');
    await fireEvent.press(screen.getByTestId('save-sheet-save'));
    expect(onSave.mock.calls[0][0].title).toBe('Morning Workout');
  });

  it('saves description as null when cleared to empty/whitespace', async () => {
    const { onSave } = await renderSheet({ initialDescription: 'old note' });
    await fireEvent.changeText(screen.getByTestId('save-sheet-description'), '   ');
    await fireEvent.press(screen.getByTestId('save-sheet-save'));
    expect(onSave.mock.calls[0][0].description).toBeNull();
  });

  it('computes endTime from the edited duration fields, not just the original elapsed', async () => {
    const { onSave, startTime } = await renderSheet();
    await fireEvent.changeText(screen.getByTestId('save-sheet-duration-hours'), '1');
    await fireEvent.changeText(screen.getByTestId('save-sheet-duration-minutes'), '0');
    await fireEvent.changeText(screen.getByTestId('save-sheet-duration-seconds'), '0');
    await fireEvent.press(screen.getByTestId('save-sheet-save'));
    const meta = onSave.mock.calls[0][0];
    expect(meta.endTime).toBe(startTime + 3600 * 1000);
  });
});
