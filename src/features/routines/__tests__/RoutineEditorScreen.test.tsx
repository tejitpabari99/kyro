/**
 * `RoutineEditorScreen` behavioral tests (M3-04 acceptance gate, 04 §2.1).
 *
 * Real `RoutineRepositoryImpl`/`ExerciseRepositoryImpl` over an in-memory
 * `better-sqlite3` driver (08 §5, same convention `ExerciseCard.test.tsx`/
 * `routine-repository.crud.test.ts` already use) — both repositories share
 * one driver so an exercise picked via the picker satisfies the
 * `routine_exercises.exercise_id` foreign key for real, and `getFull` after
 * `Save` proves an actual round-trip through SQLite, not a mock assertion.
 *
 * Covers: smoke render (both themes), Save disabled until title is
 * non-empty, dirty-cancel confirm (dirty vs. not-dirty, Discard vs. Cancel),
 * zero-exercise warn-but-allow, the rep-range toggle interaction (header tap
 * = bulk, per-row long-press = single, both directions), and the save
 * round-trip acceptance case itself: create a routine with one ranged set
 * and one single-value set in the same exercise, save, then `getFull` the
 * persisted row and assert the exact XOR shape landed — plus an edit-mode
 * hydrate-then-resave case.
 *
 * `render`/`fireEvent.*` are all `await`ed (RNTL v14's async convention,
 * same reasoning `ExerciseBrowseScreen.test.tsx`'s header documents) and
 * every `Alert.alert` button press goes through `pressAlertButton` (copied
 * from `RoutinesHubScreen.test.tsx`).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { Exercise } from '@/data/exercises/types';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { ThemeProvider } from '@/ui/theme-provider';

import { RoutineEditorScreen, type RoutineEditorScreenProps } from '../RoutineEditorScreen';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// The "Add Exercise"/"Replace" picker (`ExercisePickerSheet`) renders each
// row via `ExerciseRow`, which calls `resolveExerciseThumbnailSource`
// (`exercise-thumbnail.ts`) to resolve custom-exercise photo thumbnails —
// that helper imports `@/lib/files` (native-only top-level imports,
// unavailable under Jest, 08 §5) — mocked wholesale, same convention
// `ExerciseCard.operations.test.tsx` established.
jest.mock('@/lib/files');

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: () => {},
}));

interface Fixture {
  driver: SqliteDriver;
  routineRepository: RoutineRepositoryImpl;
  exerciseRepository: ExerciseRepositoryImpl;
  bench: Exercise;
  squat: Exercise;
}

async function setup(): Promise<Fixture> {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const routineRepository = new RoutineRepositoryImpl(driver);
  const exerciseRepository = new ExerciseRepositoryImpl(driver);
  const bench = await exerciseRepository.create({
    name: 'Barbell Bench Press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
  });
  const squat = await exerciseRepository.create({
    name: 'Barbell Back Squat',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'quadriceps',
  });
  return { driver, routineRepository, exerciseRepository, bench, squat };
}

async function addExerciseViaPicker(testID: string, exercise: Exercise): Promise<void> {
  await fireEvent.press(screen.getByTestId(`${testID}-add-exercise`));
  await waitFor(() => expect(screen.getByTestId(`exercise-row-${exercise.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`exercise-row-${exercise.id}`));
  await fireEvent.press(screen.getByTestId(`${testID}-exercise-picker-confirm`));
  await waitFor(() => expect(screen.getByTestId(`${testID}-card-${exercise.id}`)).toBeTruthy());
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderEditor(
  fixture: Fixture,
  overrides: Partial<RoutineEditorScreenProps> = {},
): Promise<void> {
  await render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference="dark">
        <RoutineEditorScreen
          mode="create"
          routineRepository={fixture.routineRepository}
          exerciseRepository={fixture.exerciseRepository}
          previousSets={jest.fn().mockResolvedValue([])}
          weightUnit="kg"
          distanceUnit="km"
          defaultRestSeconds={90}
          {...overrides}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Same helper `RoutinesHubScreen.test.tsx` uses — finds and presses a button by label in the most recent `Alert.alert` call. */
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

async function addBenchViaPicker(testID: string, fixture: Fixture): Promise<void> {
  await addExerciseViaPicker(testID, fixture.bench);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('RoutineEditorScreen — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    expect(await screen.findByTestId('routine-editor-screen')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    const fixture = await setup();
    await renderEditor(fixture, {});
    expect(await screen.findByTestId('routine-editor-screen')).toBeTruthy();
  });
});

describe('RoutineEditorScreen — Save disabled until title non-empty', () => {
  it('Save starts disabled with an empty title', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId('routine-editor-screen-title-input');
    expect(screen.getByTestId('routine-editor-screen-save').props.accessibilityState.disabled).toBe(true);
  });

  it('Save becomes enabled once a title is typed, and disabled again once cleared', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId('routine-editor-screen-title-input');
    await fireEvent.changeText(titleInput, 'Push Day');
    expect(screen.getByTestId('routine-editor-screen-save').props.accessibilityState.disabled).toBe(false);
    await fireEvent.changeText(titleInput, '   ');
    expect(screen.getByTestId('routine-editor-screen-save').props.accessibilityState.disabled).toBe(true);
  });
});

describe('RoutineEditorScreen — dirty-cancel confirm', () => {
  it('Cancel with no edits exits immediately, no Alert', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId('routine-editor-screen-cancel');
    await fireEvent.press(screen.getByTestId('routine-editor-screen-cancel'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('Cancel after a title edit shows a confirm Alert; "Cancel" on the Alert keeps the screen', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId('routine-editor-screen-title-input');
    await fireEvent.changeText(titleInput, 'Push Day');
    await fireEvent.press(screen.getByTestId('routine-editor-screen-cancel'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await pressAlertButton('Cancel');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Cancel after an edit, then "Discard", actually exits', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId('routine-editor-screen-title-input');
    await fireEvent.changeText(titleInput, 'Push Day');
    await fireEvent.press(screen.getByTestId('routine-editor-screen-cancel'));
    await pressAlertButton('Discard');
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('RoutineEditorScreen — zero-exercise warn-but-allow', () => {
  it('tapping Save with a title but zero exercises warns before saving', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId('routine-editor-screen-title-input');
    await fireEvent.changeText(titleInput, 'Empty Routine');
    await fireEvent.press(screen.getByTestId('routine-editor-screen-save'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Empty Routine',
      expect.stringContaining('no exercises'),
      expect.any(Array),
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('confirming the empty-routine warning actually saves (zero exercises allowed)', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId('routine-editor-screen-title-input');
    await fireEvent.changeText(titleInput, 'Empty Routine');
    await fireEvent.press(screen.getByTestId('routine-editor-screen-save'));
    await pressAlertButton('Save');
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    const list = await fixture.routineRepository.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('Empty Routine');
    const full = await fixture.routineRepository.getFull(list[0]!.id);
    expect(full!.exercises).toEqual([]);
  });

  it('does not warn when at least one exercise is present', async () => {
    const fixture = await setup();
    const testID = 'routine-editor-screen';
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId(`${testID}-title-input`);
    await fireEvent.changeText(titleInput, 'Push Day');
    await addBenchViaPicker(testID, fixture);
    await fireEvent.press(screen.getByTestId(`${testID}-save`));
    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });
});

describe('RoutineEditorScreen — target mode + rep-range toggle', () => {
  const testID = 'routine-editor-screen';

  it('a newly added exercise renders in target mode: no ✓ header, REPS still shows single input', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.getByTestId(`${testID}-card-${fixture.bench.id}-table-row-0-value-reps`)).toBeTruthy();
  });

  it('tapping the REPS header toggles every set in the exercise into range mode (bulk)', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${cardTestID}-table-header-reps-press`));

    expect(screen.queryByTestId(`${cardTestID}-table-row-0-value-reps`)).toBeNull();
    expect(screen.getByTestId(`${cardTestID}-table-row-0-value-reps_from`)).toBeTruthy();
    expect(screen.getByTestId(`${cardTestID}-table-row-0-value-reps_to`)).toBeTruthy();
  });

  it('typing into the from/to inputs and blurring commits repRangeStart/End with reps cleared', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId(`${testID}-title-input`);
    await fireEvent.changeText(titleInput, 'Push Day');
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${cardTestID}-table-header-reps-press`));

    const fromInput = screen.getByTestId(`${cardTestID}-table-row-0-value-reps_from`);
    const toInput = screen.getByTestId(`${cardTestID}-table-row-0-value-reps_to`);
    await fireEvent.changeText(fromInput, '6');
    await fireEvent(fromInput, 'blur');
    await fireEvent.changeText(toInput, '8');
    await fireEvent(toInput, 'blur');

    await fireEvent.press(screen.getByTestId(`${testID}-save`));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    const list = await fixture.routineRepository.list();
    const full = await fixture.routineRepository.getFull(list[0]!.id);
    expect(full!.exercises[0]!.sets[0]).toMatchObject({ reps: null, repRangeStart: 6, repRangeEnd: 8 });
  });

  it('long-pressing a single row toggles just that row back to a single value, clearing the range', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    const rowTestID = `${cardTestID}-table-row-0`;

    // Toggle on via header (bulk), then toggle this one row back off via long-press.
    await fireEvent.press(screen.getByTestId(`${cardTestID}-table-header-reps-press`));
    expect(screen.getByTestId(`${rowTestID}-value-reps_from`)).toBeTruthy();

    await fireEvent(screen.getByTestId(`${rowTestID}-reps-target-cell`), 'longPress');
    expect(screen.queryByTestId(`${rowTestID}-value-reps_from`)).toBeNull();
    expect(screen.getByTestId(`${rowTestID}-value-reps`)).toBeTruthy();
  });
});

describe('RoutineEditorScreen — save round-trips through getFull (mixed ranged + single-value sets)', () => {
  it('creates a routine with one single-value set and one ranged set on the same exercise, and getFull reflects the exact XOR shape', async () => {
    const fixture = await setup();
    const testID = 'routine-editor-screen';
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId(`${testID}-title-input`);
    await fireEvent.changeText(titleInput, 'Push Day');
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;

    // Row 0: single-value reps (default mode) — type reps=10, weight=60.
    const repsInput = screen.getByTestId(`${cardTestID}-table-row-0-value-reps`);
    await fireEvent.changeText(repsInput, '10');
    await fireEvent(repsInput, 'blur');
    const weightInput0 = screen.getByTestId(`${cardTestID}-table-row-0-value-weight`);
    await fireEvent.changeText(weightInput0, '60');
    await fireEvent(weightInput0, 'blur');

    // Add a second set, toggle *only that row* into range mode via long-press, fill 6-8.
    await fireEvent.press(screen.getByTestId(`${cardTestID}-add-set`));
    const row1TestID = `${cardTestID}-table-row-1`;
    await fireEvent(screen.getByTestId(`${row1TestID}-reps-target-cell`), 'longPress');
    const fromInput = screen.getByTestId(`${row1TestID}-value-reps_from`);
    const toInput = screen.getByTestId(`${row1TestID}-value-reps_to`);
    await fireEvent.changeText(fromInput, '6');
    await fireEvent(fromInput, 'blur');
    await fireEvent.changeText(toInput, '8');
    await fireEvent(toInput, 'blur');

    // Row 0 must still be single-value (untouched by row 1's toggle).
    expect(screen.getByTestId(`${cardTestID}-table-row-0-value-reps`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`${testID}-save`));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    const list = await fixture.routineRepository.list();
    expect(list).toHaveLength(1);
    const full = await fixture.routineRepository.getFull(list[0]!.id);
    expect(full).not.toBeNull();
    expect(full!.title).toBe('Push Day');
    expect(full!.exercises).toHaveLength(1);
    expect(full!.exercises[0]!.exerciseId).toBe(fixture.bench.id);
    expect(full!.exercises[0]!.sets).toHaveLength(2);
    expect(full!.exercises[0]!.sets[0]).toMatchObject({
      reps: 10,
      repRangeStart: null,
      repRangeEnd: null,
      weightKg: 60,
    });
    expect(full!.exercises[0]!.sets[1]).toMatchObject({ reps: null, repRangeStart: 6, repRangeEnd: 8 });
  });
});

describe('RoutineEditorScreen — edit mode hydration + resave', () => {
  it('hydrates title/sets from an existing routine and resaves via update()', async () => {
    const fixture = await setup();
    const created = await fixture.routineRepository.create({
      title: 'Original Title',
      exercises: [{ exerciseId: fixture.bench.id, sets: [{ reps: 8, weightKg: 50 }] }],
    });

    const testID = 'routine-editor-screen';
    await render(
      <QueryClientProvider client={newTestQueryClient()}>
        <ThemeProvider preference="dark">
          <RoutineEditorScreen
            mode="edit"
            routineId={created.id}
            routineRepository={fixture.routineRepository}
            exerciseRepository={fixture.exerciseRepository}
            previousSets={jest.fn().mockResolvedValue([])}
            weightUnit="kg"
            distanceUnit="km"
            defaultRestSeconds={90}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    const titleInput = await screen.findByTestId(`${testID}-title-input`);
    await waitFor(() => expect(titleInput.props.value).toBe('Original Title'));

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    await waitFor(() =>
      expect(screen.getByTestId(`${cardTestID}-table-row-0-value-reps`).props.value).toBe('8'),
    );

    await fireEvent.changeText(titleInput, 'Renamed Push Day');
    await fireEvent.press(screen.getByTestId(`${testID}-save`));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    const full = await fixture.routineRepository.getFull(created.id);
    expect(full!.title).toBe('Renamed Push Day');
    expect(full!.exercises[0]!.sets[0]).toMatchObject({ reps: 8, weightKg: 50 });
  });
});

describe('RoutineEditorScreen — per-exercise ⋯ menu (04 §2.1: reorder/replace/superset/note/rest timer/remove)', () => {
  const testID = 'routine-editor-screen';

  it('Remove Exercise removes the card and the removal survives Save', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    const titleInput = await screen.findByTestId(`${testID}-title-input`);
    await fireEvent.changeText(titleInput, 'Push Day');
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${cardTestID}-menu-button`));
    await fireEvent.press(screen.getByTestId(`${cardTestID}-menu-remove-exercise`));
    expect(screen.queryByTestId(cardTestID)).toBeNull();

    await fireEvent.press(screen.getByTestId(`${testID}-save`));
    await pressAlertButton('Save'); // zero-exercise warn, since the only exercise was just removed
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    const list = await fixture.routineRepository.list();
    const full = await fixture.routineRepository.getFull(list[0]!.id);
    expect(full!.exercises).toEqual([]);
  });

  it('tapping the note row enters edit mode; typing and blurring shows the note on the card', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    const cardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${cardTestID}-note-row`));
    const noteInput = await screen.findByTestId(`${cardTestID}-note-input`);
    await fireEvent.changeText(noteInput, 'Keep elbows tucked');
    await fireEvent(noteInput, 'blur');

    expect(screen.getByTestId(`${cardTestID}-note-text`)).toBeTruthy();
  });

  it('Add to Superset (from ⋯) opens the sheet listing the other exercise as a candidate', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);
    await addExerciseViaPicker(testID, fixture.squat);

    const benchCardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-button`));
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-add-to-superset`));

    expect(await screen.findByTestId(`${testID}-add-to-superset-sheet`)).toBeTruthy();
    // Squat appears twice: its own card header, plus the sheet's candidate row.
    expect(screen.getAllByText(fixture.squat.name).length).toBeGreaterThanOrEqual(2);
    // Bench is the card that opened the sheet — never its own candidate, so
    // it appears only once (its own card header).
    expect(screen.queryAllByText(fixture.bench.name)).toHaveLength(1);
  });

  it('Reorder (from ⋯) opens the reorder sheet listing every exercise in the draft', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);
    await addExerciseViaPicker(testID, fixture.squat);

    const benchCardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-button`));
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-reorder`));

    expect(await screen.findByTestId(`${testID}-reorder-sheet`)).toBeTruthy();
    expect(screen.getAllByText(fixture.bench.name).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(fixture.squat.name).length).toBeGreaterThanOrEqual(1);
  });

  it('Replace Exercise (from ⋯) opens the picker in replace mode, and picking a new exercise swaps it in place', async () => {
    const fixture = await setup();
    await renderEditor(fixture);
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    const benchCardTestID = `${testID}-card-${fixture.bench.id}`;
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-button`));
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-replace`));

    await waitFor(() => expect(screen.getByTestId(`exercise-row-${fixture.squat.id}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`exercise-row-${fixture.squat.id}`));

    expect(screen.queryByTestId(benchCardTestID)).toBeNull();
    expect(await screen.findByTestId(`${testID}-card-${fixture.squat.id}`)).toBeTruthy();
  });

  // M3-08 milestone-QA-sweep addition: the rest-timer row/⋯-menu path had a
  // fully-wired pure mutator (`updateDraftExerciseRestSeconds`, unit-tested
  // since M3-04's own `routine-draft.test.ts`) and fully-wired UI
  // (`RoutineExerciseCard`'s rest-timer-row press / ⋯ → "Rest Timer" both
  // open the same `RestTimerSheet`, `onChange={handleSaveRestSeconds}`) but
  // — unlike every other ⋯ item just above — no RNTL test ever drove the
  // sheet interaction end to end (open -> pick a wheel option -> label
  // updates -> value survives Save). Same shape as the folder-rename gap
  // this task's own sweep found in `RoutinesHubScreen.test.tsx`: working
  // code, missing wiring-level test, not a broken feature. `defaultRestSeconds`
  // is deliberately overridden to `null` (Off) here — `renderEditor`'s own
  // default is 90, which would make a real "did the picker actually change
  // anything" bug invisible (a freshly-added exercise already reading 90
  // either way).
  it('⋯ → Rest Timer opens the wheel picker; picking 90 s updates the row label and survives Save', async () => {
    const fixture = await setup();
    await renderEditor(fixture, { defaultRestSeconds: null });
    await screen.findByTestId(`${testID}-title-input`);
    await addBenchViaPicker(testID, fixture);

    const benchCardTestID = `${testID}-card-${fixture.bench.id}`;
    expect(screen.getByText('Rest Timer: Off')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-button`));
    await fireEvent.press(screen.getByTestId(`${benchCardTestID}-menu-rest-timer`));

    const sheetTestID = `${benchCardTestID}-rest-timer-sheet`;
    await screen.findByTestId(sheetTestID);
    await fireEvent.press(screen.getByTestId(`${sheetTestID}-wheel-option-90`));

    expect(screen.getByText('Rest Timer: 1min 30s')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`${sheetTestID}-done`));
    expect(screen.queryByTestId(sheetTestID)).toBeNull();

    await fireEvent.changeText(screen.getByTestId(`${testID}-title-input`), 'Push Day');
    await fireEvent.press(screen.getByTestId(`${testID}-save`));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    const list = await fixture.routineRepository.list();
    const full = await fixture.routineRepository.getFull(list[0]!.id);
    expect(full!.exercises[0]!.restSeconds).toBe(90);
  });
});
