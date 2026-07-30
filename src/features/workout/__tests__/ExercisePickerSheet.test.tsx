/**
 * `ExercisePickerSheet` (M2-09 → AD-4) — dedicated coverage for the
 * suspend/restore mechanism added on top of the browse-mode picker: an ⓘ
 * press on a row calls `router.push('/exercise/${id}')` and flips
 * `isNavigatingToDetail` true, which makes the sheet's own
 * `<Sheet visible={visible && !isNavigatingToDetail}>` disappear from the
 * tree (the `Sheet` primitive itself unmounts entirely while invisible —
 * see `src/ui/Sheet.tsx`'s file header) without unmounting
 * `ExercisePickerSheet`, so a `useFocusEffect` on return-to-focus can flip
 * it back to `false` and restore the sheet with whatever search/selection
 * state was already in local component state. Everything else about this
 * component (search/filter/AZ-rail/list rendering) is already covered
 * indirectly via `ActiveWorkoutScreen`/`EditWorkoutScreen`/
 * `RoutineEditorScreen`'s own suites — this file is scoped to the
 * suspend/restore behavior only.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { FakeExerciseRepository, FIXTURE_EXERCISES } from '@/features/exercises/__tests__/exercise-fixtures';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExercisePickerSheet, type ExercisePickerSheetProps } from '../ExercisePickerSheet';

// Captures the latest callback `ExercisePickerSheet` registers via
// `useFocusEffect` so tests can invoke it directly (`simulateReturnToFocus`
// below) to simulate the screen regaining focus, instead of depending on a
// real `NavigationContainer`/focus-event plumbing this component-only
// render has none of.
//
// Note: an earlier draft of this mock called the callback synchronously and
// unconditionally inside `useFocusEffect` itself (i.e. on every render,
// mirroring `(callback) => callback()`). That crashes in practice —
// `ExercisePickerSheet` calls `useFocusEffect` unconditionally on every
// render, so a same-render, always-invoked `setIsNavigatingToDetail(false)`
// call is classified by React as a "render phase update": that path enqueues
// a retry every single pass regardless of whether the value actually
// changed (no `Object.is` bailout the way an event-handler-originated update
// gets), so it retries forever and hits React's "Too many re-renders" cap —
// reproducible even at initial mount, no interaction required. Capturing the
// callback and invoking it from *outside* a render (via `act` below) avoids
// that: it becomes a normal, correctly-deduped state update, and it also
// means the sheet stays suspended until a test explicitly simulates a focus
// event, matching real `useFocusEffect` semantics (fires once per focus,
// not once per render).
let latestFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    latestFocusCallback = callback;
  },
}));

// `ExerciseRow` -> `exercise-thumbnail.ts` -> `@/lib/files` (native-only
// top-level imports, unavailable under Jest, 08 §5) — same convention every
// other consumer of that seam uses (see `ExerciseCard.test.tsx`).
jest.mock('@/lib/files');

// Two fixture exercises (real vendored-dataset records, see
// exercise-fixtures.ts) is enough to exercise a "press ⓘ on one row while a
// different row is selected" flow — no real `ExerciseRepository`/SQLite
// driver needed since this file never touches persistence.
const EXERCISE_A = FIXTURE_EXERCISES[0]!; // 'Barbell Bench Press - Medium Grip'
const EXERCISE_B = FIXTURE_EXERCISES[2]!; // 'Dumbbell Bench Press'

const TEST_ID = 'picker';

function renderSheet(overrides: Partial<ExercisePickerSheetProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const props: ExercisePickerSheetProps = {
    visible: true,
    onDismiss: jest.fn(),
    repository: new FakeExerciseRepository([EXERCISE_A, EXERCISE_B]),
    mode: 'add',
    onAdd: jest.fn(),
    onReplace: jest.fn(),
    testID: TEST_ID,
    ...overrides,
  };
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <ExercisePickerSheet {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { props, ...result };
}

async function waitForListReady(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(`exercise-row-${EXERCISE_A.id}`)).toBeTruthy());
}

async function simulateReturnToFocus(): Promise<void> {
  await act(async () => {
    latestFocusCallback?.();
  });
}

describe('ExercisePickerSheet — suspend/restore (AD-4)', () => {
  it('pressing a row\'s ⓘ suspends the sheet and navigates to exercise detail', async () => {
    renderSheet();
    await waitForListReady();

    await fireEvent.press(screen.getByTestId(`exercise-row-${EXERCISE_A.id}-info`));

    expect(router.push).toHaveBeenCalledWith(`/exercise/${EXERCISE_A.id}`);
    // `Sheet` only renders while `visible` is true (src/ui/Sheet.tsx) — the
    // whole tree, including this testID, is provably absent once suspended.
    expect(screen.queryByTestId(TEST_ID)).toBeNull();
  });

  it('returning to focus restores the sheet with search/selection state intact', async () => {
    renderSheet();
    await waitForListReady();

    // Build up some transient state before suspending. `SearchBar`
    // (src/ui/SearchBar.tsx) puts its `testID` on the wrapping `View`, not
    // the `TextInput` itself, so the input is targeted by its placeholder
    // (also its accessibility label) instead.
    await fireEvent.press(screen.getByTestId(`exercise-row-${EXERCISE_A.id}`));
    await fireEvent.changeText(screen.getByPlaceholderText('Search exercises'), 'bench');

    expect(screen.getByTestId(`${TEST_ID}-counter`)).toHaveTextContent('1 selected');

    // ⓘ on a *different* row suspends the sheet (per the previous test).
    await fireEvent.press(screen.getByTestId(`exercise-row-${EXERCISE_B.id}-info`));
    expect(screen.queryByTestId(TEST_ID)).toBeNull();

    // Simulate the screen regaining focus (the real trigger for this
    // component's `useFocusEffect`, unavailable here since this is a
    // component-only render with no `NavigationContainer`) by invoking the
    // captured focus callback directly.
    await simulateReturnToFocus();

    expect(screen.getByTestId(TEST_ID)).toBeTruthy();
    expect(screen.getByTestId(`${TEST_ID}-counter`)).toHaveTextContent('1 selected');
    expect(screen.getByPlaceholderText('Search exercises').props.value).toBe('bench');
  });
});
