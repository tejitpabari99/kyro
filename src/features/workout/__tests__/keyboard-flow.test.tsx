/**
 * M2-08 keyboard-flow acceptance-gate tests (02 §4, 06 §8) — "RNTL tests:
 * Next traversal order across rows and across exercises; check-while-
 * keyboard-up commits without dismiss," plus the inline-timer cell sheet
 * and the `KeyboardAccessoryBar`/`keyboardShouldPersistTaps` wiring at the
 * `ActiveWorkoutScreen` level. Real `WorkoutRepositoryImpl`/
 * `ExerciseRepositoryImpl` over an in-memory `better-sqlite3` driver (never
 * mocked, 08 §5), same convention as every other M2 logger suite.
 *
 * ## Why traversal is proven via a `registerField` spy, not real native focus
 *
 * RN's `TextInput.focus()` is an imperative native-bridge call; under Jest
 * (no simulator/device — `docs/plan/BLOCKERS.md`) calling it doesn't
 * synthesize a real focus event the way a genuine tap does, so a target
 * field's own `onFocus` prop never fires as an automatic *consequence* of
 * `.focus()` being called (unlike `fireEvent(input, 'focus')`, which does
 * reliably invoke `onFocus` — it's a plain React prop callback, the same
 * mechanism the rest of this suite's `blur` assertions already rely on).
 * To prove `focusNext()` targets the *correct* field without fighting that
 * native gap, these tests wrap `keyboardFocusStore.registerField` so every
 * real registration's `focus` callback also records its own `fieldId` —
 * this still calls straight through to the real `instance.focus()`
 * afterward, so nothing about the production wiring is bypassed, only
 * *observed*. Each hop's resulting focus is then simulated explicitly via
 * `fireEvent(nextField, 'focus')` before asserting the next hop — modeling
 * exactly what a real device's native responder change would do on its own.
 * Zero-keyboard-flicker / keypress-to-paint timing are explicitly out of
 * scope here (deferred to M2-19 physical-device sign-off per this task's
 * own acceptance gate) — this suite only proves the traversal *decision*
 * and the commit-without-dismiss *wiring* are correct.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SettingsRepository } from '@/data/settings/settings-repository';
import { SETTINGS_DEFAULTS } from '@/data/settings/settings-schema';
import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { ExerciseRepository } from '@/data/exercises/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { ExerciseSetTableSection } from '../ExerciseSetTableSection';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import {
  KEYBOARD_ACCESSORY_VIEW_ID,
  __resetKeyboardFocusRegistryForTests,
  useKeyboardFocusStore,
} from '../keyboardFocusStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

// `ExerciseCard`'s name-tap opens `ExerciseDetailSheet` -> the real
// `ExerciseDetailScreen`, which imports `@/lib/files` (native-only top-level
// imports, unavailable under Jest, 08 §5) — mocked wholesale, same
// convention `ExerciseCard.operations.test.tsx` established. Only the
// `ActiveWorkoutScreen`-level describe block below actually renders
// `ExerciseCard`; the `ExerciseSetTableSection`-only tests never reach this
// import at all, but mocking it here is harmless either way.
jest.mock('@/lib/files');

interface Fixture {
  driver: SqliteDriver;
  workoutRepo: WorkoutRepositoryImpl;
  exerciseRepo: ExerciseRepository;
}

function setup(): Fixture {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const workoutRepo = new WorkoutRepositoryImpl(driver, {});
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  return { driver, workoutRepo, exerciseRepo };
}

async function rehydrateStores(workoutRepo: WorkoutRepositoryImpl, driver: SqliteDriver): Promise<void> {
  await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
  await useSettingsStore.getState().load(new SettingsRepository(driver));
}

// Captured once, at module load, before any test can wrap `registerField` —
// every `spyOnFocusCalls()` call below always wraps *this* true original,
// never a previous test's already-wrapped version (composing wrappers
// across tests would recurse infinitely by the Nth test — reproduced while
// writing this suite, see git history if this comment is ever questioned).
const trueRegisterField = useKeyboardFocusStore.getState().registerField;

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  __resetKeyboardFocusRegistryForTests();
  useKeyboardFocusStore.setState({
    focusedFieldId: null,
    focusedIsWeight: false,
    registerField: trueRegisterField,
  });
});

/**
 * Wraps `registerField` so every real registration's `focus` also appends
 * its own `fieldId` to `calls` before calling straight through to the real
 * (production) focus function — see file header. Monkey-patches the
 * store's own action directly via `setState` (not `jest.spyOn`) so there is
 * exactly one, always-fresh wrapper per test, restored in `afterEach`
 * above.
 */
function spyOnFocusCalls(): string[] {
  const calls: string[] = [];
  useKeyboardFocusStore.setState({
    registerField: (fieldId, registration) => {
      trueRegisterField(fieldId, {
        ...registration,
        focus: () => {
          calls.push(fieldId);
          registration.focus();
        },
      });
    },
  });
  return calls;
}

describe('Keyboard flow — Next traversal across rows and exercises (02 §4)', () => {
  it('weight -> reps -> next row -> next exercise, in exactly that order', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exerciseA = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    const exerciseB = await exerciseRepo.create({
      name: 'Barbell Row',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'upper_back',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [addedA, addedB] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: exerciseA.id }, { exerciseId: exerciseB.id }]);
    // Exercise A gets a second set — this is the "next row, same exercise" hop.
    await useActiveWorkoutStore.getState().addSet(addedA!.id);

    const focusCalls = spyOnFocusCalls();

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <>
            <ExerciseSetTableSection
              testID="secA"
              workoutExerciseId={addedA!.id}
              exercisePosition={addedA!.position}
              exercise={exerciseA}
              weightUnit="kg"
              distanceUnit="km"
              rpeEnabled={false}
              previousValuesMode="any_workout"
              routineId={null}
            />
            <ExerciseSetTableSection
              testID="secB"
              workoutExerciseId={addedB!.id}
              exercisePosition={addedB!.position}
              exercise={exerciseB}
              weightUnit="kg"
              distanceUnit="km"
              rpeEnabled={false}
              previousValuesMode="any_workout"
              routineId={null}
            />
          </>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    const active = await workoutRepo.getActive();
    const setsA = active!.exercises[0]!.sets;
    const setsB = active!.exercises[1]!.sets;
    expect(setsA).toHaveLength(2);
    expect(setsB).toHaveLength(1);

    const expectedHops = [
      `${setsA[0]!.id}:reps`,
      `${setsA[1]!.id}:weight`,
      `${setsA[1]!.id}:reps`,
      `${setsB[0]!.id}:weight`,
    ];

    await fireEvent(screen.getByTestId('secA-row-0-value-weight'), 'focus');

    for (const expectedFieldId of expectedHops) {
      useKeyboardFocusStore.getState().focusNext();
      const [setId, columnKey] = expectedFieldId.split(':');
      const rowIndex = setId === setsA[0]!.id ? 0 : setId === setsA[1]!.id ? 1 : 0;
      const sectionTestID = setId === setsB[0]!.id ? 'secB' : 'secA';
      await fireEvent(
        screen.getByTestId(`${sectionTestID}-row-${rowIndex}-value-${columnKey}`),
        'focus',
      );
    }

    expect(focusCalls).toEqual(expectedHops);
  });

  it('does nothing (keyboard stays put, no error) once the last field of the last exercise is reached', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    const focusCalls = spyOnFocusCalls();
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="sec"
            workoutExerciseId={added!.id}
            exercisePosition={added!.position}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled={false}
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await fireEvent(screen.getByTestId('sec-row-0-value-reps'), 'focus');
    expect(() => useKeyboardFocusStore.getState().focusNext()).not.toThrow();
    expect(focusCalls).toEqual([]);
  });

  it('the RPE column is never a Next-traversal stop, even when the RPE setting is on', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);
    await useActiveWorkoutStore.getState().addSet(added!.id);

    const focusCalls = spyOnFocusCalls();
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="sec"
            workoutExerciseId={added!.id}
            exercisePosition={added!.position}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    const active = await workoutRepo.getActive();
    const secondSetId = active!.exercises[0]!.sets[1]!.id;

    await fireEvent(screen.getByTestId('sec-row-0-value-reps'), 'focus');
    useKeyboardFocusStore.getState().focusNext();

    // Straight to the next row's weight field — never `...-rpe`.
    expect(focusCalls).toEqual([`${secondSetId}:weight`]);
  });
});

describe('Keyboard flow — check-while-keyboard-up commits without dismissing (02 §4)', () => {
  it('checking a row while its weight field is focused commits the typed values and never clears focus tracking itself', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="sec"
            workoutExerciseId={added!.id}
            exercisePosition={added!.position}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled={false}
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await fireEvent(screen.getByTestId('sec-row-0-value-weight'), 'focus');
    const active = await workoutRepo.getActive();
    const setId = active!.exercises[0]!.sets[0]!.id;
    expect(useKeyboardFocusStore.getState().focusedFieldId).toBe(`${setId}:weight`);

    await fireEvent.changeText(screen.getByTestId('sec-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('sec-row-0-value-reps'), '8');
    // Tapping the ✓ button never itself fires the weight field's `onBlur`
    // (no `fireEvent(..., 'blur')` here) — modeling the real behavior a
    // `keyboardShouldPersistTaps="handled"` container gives: the check
    // `Pressable`'s own `onPress` handler runs directly, the way any other
    // touchable does, without the container swallowing the tap purely to
    // dismiss the keyboard first (`ActiveWorkoutScreen.tsx`'s own body
    // `ScrollView` sets this prop for exactly this reason).
    await fireEvent.press(screen.getByTestId('sec-row-0-check'));

    expect(screen.getByTestId('sec-row-0-check').props.accessibilityState.checked).toBe(true);
    const committed = await workoutRepo.getActive();
    expect(committed!.exercises[0]!.sets[0]!.weightKg).toBe(60);
    expect(committed!.exercises[0]!.sets[0]!.reps).toBe(8);
    expect(committed!.exercises[0]!.sets[0]!.isCompleted).toBe(true);
    // This app's own code never blurred/cleared the field — focus tracking
    // is exactly where it was before the check tap.
    expect(useKeyboardFocusStore.getState().focusedFieldId).toBe(`${setId}:weight`);
  });
});

describe('Keyboard flow — inline timer cell sheet (02 §4, Settings → Inline Timer)', () => {
  it('is hidden on a TIME cell when the setting is off', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('inline_timer', false);
    const exercise = await exerciseRepo.create({
      name: 'Plank',
      exerciseType: 'duration',
      primaryMuscleGroup: 'abdominals',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="sec"
            workoutExerciseId={added!.id}
            exercisePosition={added!.position}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled={false}
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    // Settle the async `previousSets` query before the test ends — an
    // unsettled `notifyManager` timeout firing after this test's own `act()`
    // scope has closed is what produces a spurious "not wrapped in act(...)"
    // warning on a *later* test (the same failure mode `ExerciseSetTableSection
    // .render-isolation.test.tsx`'s own header documents at length).
    await waitFor(() => expect(screen.getByTestId('sec-row-0-value-duration')).toBeTruthy());

    expect(screen.queryByTestId('sec-row-0-timer-duration')).toBeNull();
  });

  it('opens the stopwatch sheet, and Stop writes the elapsed seconds into the field and commits it', async () => {
    jest.useFakeTimers();
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('inline_timer', true);
    const exercise = await exerciseRepo.create({
      name: 'Plank',
      exerciseType: 'duration',
      primaryMuscleGroup: 'abdominals',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="sec"
            workoutExerciseId={added!.id}
            exercisePosition={added!.position}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled={false}
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await fireEvent.press(screen.getByTestId('sec-row-0-timer-duration'));
    expect(screen.getByTestId('sec-row-0-duration-timer-sheet')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('sec-row-0-duration-timer-sheet-start'));
    });
    await act(async () => {
      jest.advanceTimersByTime(12_000);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('sec-row-0-duration-timer-sheet-stop'));
    });

    expect(screen.getByTestId('sec-row-0-value-duration').props.value).toBe('0:12');
    await waitFor(async () => {
      const active = await workoutRepo.getActive();
      expect(active!.exercises[0]!.sets[0]!.durationSeconds).toBe(12);
    });
  });
});

describe('Keyboard flow — ActiveWorkoutScreen wiring (KeyboardAccessoryBar, keyboardShouldPersistTaps)', () => {
  function renderScreen(exerciseRepository: ExerciseRepository) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepository} />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it("the body ScrollView sets keyboardShouldPersistTaps='handled' (so a check tap while the keyboard is up is never swallowed as a dismiss)", async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });

    await renderScreen(exerciseRepo);

    await waitFor(() => expect(screen.getByTestId('screen-body')).toBeTruthy());
    expect(screen.getByTestId('screen-body').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('mounts one KeyboardAccessoryBar sharing KEYBOARD_ACCESSORY_VIEW_ID with the set-table inputs', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);

    await waitFor(() =>
      expect(
        screen.getByTestId(`screen-exercise-${useActiveWorkoutStore.getState().workout!.exercises[0]!.id}-table-row-0-value-weight`),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('screen-keyboard-accessory-bar')).toBeTruthy();
    const weightField = screen.getByTestId(
      `screen-exercise-${useActiveWorkoutStore.getState().workout!.exercises[0]!.id}-table-row-0-value-weight`,
    );
    expect(weightField.props.inputAccessoryViewID).toBe(KEYBOARD_ACCESSORY_VIEW_ID);
  });

  it('Calculator button shows only when a weight field is focused AND the plate calculator setting is enabled', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('plate_calc', {
      ...SETTINGS_DEFAULTS.plate_calc,
      enabled: true,
    });
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);

    const weightTestID = `screen-exercise-${added!.id}-table-row-0-value-weight`;
    const repsTestID = `screen-exercise-${added!.id}-table-row-0-value-reps`;
    await waitFor(() => expect(screen.getByTestId(weightTestID)).toBeTruthy());

    expect(screen.queryByTestId('screen-keyboard-accessory-bar-calculator')).toBeNull();

    await fireEvent(screen.getByTestId(weightTestID), 'focus');
    expect(screen.getByTestId('screen-keyboard-accessory-bar-calculator')).toBeTruthy();

    await fireEvent(screen.getByTestId(repsTestID), 'focus');
    expect(screen.queryByTestId('screen-keyboard-accessory-bar-calculator')).toBeNull();
  });

  it('Calculator button never shows when the plate calculator setting is off, even with a weight field focused', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    // `plate_calc.enabled` defaults to false (05 §11) — left untouched.
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);

    const weightTestID = `screen-exercise-${added!.id}-table-row-0-value-weight`;
    await waitFor(() => expect(screen.getByTestId(weightTestID)).toBeTruthy());
    await fireEvent(screen.getByTestId(weightTestID), 'focus');

    expect(screen.queryByTestId('screen-keyboard-accessory-bar-calculator')).toBeNull();
  });

  it('Calculator opens the plate calculator sheet pre-filled from the focused field, and "Use this value" writes the achieved weight back into that field (M2-15)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('plate_calc', {
      ...SETTINGS_DEFAULTS.plate_calc,
      enabled: true,
    });
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);

    const weightTestID = `screen-exercise-${added!.id}-table-row-0-value-weight`;
    await waitFor(() => expect(screen.getByTestId(weightTestID)).toBeTruthy());

    await fireEvent(screen.getByTestId(weightTestID), 'focus');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId(weightTestID), '18');
    });

    await fireEvent.press(screen.getByTestId('screen-keyboard-accessory-bar-calculator'));

    const sheetTestID = 'screen-plate-calculator-sheet';
    // Pre-filled from the field's own current (uncommitted, still-focused)
    // typed value — proving the read goes through `latestRef`, not a stale
    // registration-time snapshot (`ConnectedSetRow.tsx`'s M2-15 addition).
    expect(screen.getByTestId(`${sheetTestID}-target-input`).props.value).toBe('18');

    await act(async () => {
      fireEvent.changeText(screen.getByTestId(`${sheetTestID}-target-input`), '22.5');
    });
    // 22.5 on the default 20 kg Barbell -> exact via a single 1.25 kg plate/side.
    expect(screen.getByTestId(`${sheetTestID}-achieved`).props.children.join('')).toBe('22.5kg');

    await fireEvent.press(screen.getByTestId(`${sheetTestID}-use-value`));

    expect(screen.queryByTestId(`${sheetTestID}-target-input`)).toBeNull();
    expect(screen.getByTestId(weightTestID).props.value).toBe('22.5');
    await waitFor(async () => {
      const active = await workoutRepo.getActive();
      expect(active!.exercises[0]!.sets[0]!.weightKg).toBe(22.5);
    });
  });

  it("the accessory bar's Next button drives keyboardFocusStore.focusNext()", async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    const focusCalls = spyOnFocusCalls();
    await renderScreen(exerciseRepo);

    const weightTestID = `screen-exercise-${added!.id}-table-row-0-value-weight`;
    await waitFor(() => expect(screen.getByTestId(weightTestID)).toBeTruthy());
    await fireEvent(screen.getByTestId(weightTestID), 'focus');

    await fireEvent.press(screen.getByTestId('screen-keyboard-accessory-bar-next'));

    const active = await workoutRepo.getActive();
    const setId = active!.exercises[0]!.sets[0]!.id;
    expect(focusCalls).toEqual([`${setId}:reps`]);
  });
});
