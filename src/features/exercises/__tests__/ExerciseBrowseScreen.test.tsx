/**
 * `ExerciseBrowseScreen` behavioral tests (M1-07 acceptance gate) —
 * search/filter AND-composition, the A–Z rail's imperative scroll call,
 * the empty-search Create shortcut's navigation seam, and the placeholder-
 * thumbnail fallback. Uses `exercise-fixtures.ts`'s small, real-record
 * subset (not the full 873-row dataset — that path is covered once,
 * separately, in `ExerciseBrowseScreen.full-dataset.test.tsx`) and mocks
 * `@shopify/flash-list` with a plain, deterministic list stand-in (real
 * `FlashList` renders every row through the exact same `renderItem`/
 * `ExerciseRow` this mock invokes, so filtering/row-content assertions are
 * unaffected — only virtualization/scroll internals are swapped out, which
 * RNTL can't meaningfully exercise without a simulator anyway).
 *
 * --- Every `fireEvent.press`/`fireEvent.changeText` call is `await`ed ----
 * `@testing-library/react-native` v14's `fireEvent.*` helpers are async
 * (each wraps its handler invocation in `act()` and returns that promise).
 * Skipping the `await` lets a second interaction start before the first
 * one's state update has flushed — confirmed by isolated repro while
 * building this suite: two chained, un-awaited `fireEvent.press` calls (one
 * opening/selecting the muscle sheet, the next opening the equipment sheet)
 * silently raced, leaving `onChange` "called" per a debug log but the
 * rendered tree still showing the pre-press state a moment later. Awaiting
 * every fire-event call serializes them correctly.
 *
 * --- Why `gcTime: 0` on every test `QueryClient` here ---------------------
 * `ExerciseBrowseScreen` uses `useQuery` (06 §4: "read models stay pure
 * TanStack-Query-over-SQLite") — the first such consumer in this codebase.
 * A `QueryClient`'s default `gcTime` (5 min) schedules a real `setTimeout`
 * once a query becomes unobserved (e.g. on unmount); that timer outlives
 * the test and keeps the Jest worker process alive well past every test
 * finishing ("Jest did not exit one second after the test run has
 * completed"), confirmed via several isolated repros while building this
 * screen — a real app `QueryClient` (see `app/_layout.tsx`) is unaffected,
 * this is purely a Jest-process-exit concern for test-owned clients.
 * `gcTime: 0` (test-only) avoids it without changing any product behavior.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseBrowseScreen } from '../ExerciseBrowseScreen';
import { FIXTURE_CUSTOM_NO_IMAGES, FIXTURE_EXERCISES, FakeExerciseRepository } from './exercise-fixtures';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));

// A minimal, deterministic `FlashList` stand-in: renders every row via the
// screen's own `renderItem`/`keyExtractor` in a plain `View`, and exposes a
// `scrollToIndex` jest mock through the imperative ref — exactly the two
// things these tests need to observe (row content, and the A–Z rail's
// scroll-call wiring) without FlashList's real virtualization/measurement
// machinery, which the screen's dedicated full-dataset smoke test already
// exercises for real.
jest.mock('@shopify/flash-list', () => {
  const ReactActual = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  const scrollToIndex = jest.fn();
  const FlashList = ReactActual.forwardRef(function MockFlashList(props: any, ref: any) {
    ReactActual.useImperativeHandle(ref, () => ({ scrollToIndex }));
    return ReactActual.createElement(
      RNView,
      { testID: props.testID },
      (props.data ?? []).map((item: any, index: number) =>
        ReactActual.cloneElement(props.renderItem({ item, index, target: 'Cell' }), {
          key: props.keyExtractor ? props.keyExtractor(item, index) : String(index),
        }),
      ),
    );
  });
  return { FlashList, __mockScrollToIndex: scrollToIndex };
});

function getMockScrollToIndex(): jest.Mock {
  return (jest.requireMock('@shopify/flash-list') as { __mockScrollToIndex: jest.Mock })
    .__mockScrollToIndex;
}

function renderScreen(repository: FakeExerciseRepository) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ExerciseBrowseScreen repository={repository} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Selects `option` in whichever filter sheet is currently open, awaiting the press through. */
async function selectFilterOption(testIdPrefix: string, value: string): Promise<void> {
  const option = await screen.findByTestId(`${testIdPrefix}-option-${value}`);
  await fireEvent.press(option);
}

describe('ExerciseBrowseScreen (M1-07)', () => {
  beforeEach(() => {
    jest.mocked(router.push).mockClear();
    getMockScrollToIndex().mockClear();
  });

  it('renders the fixture exercises by name (sanity check the data flows through to rows)', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));

    await waitFor(() =>
      expect(screen.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy(),
    );
    expect(screen.getByText('Dumbbell Bench Press')).toBeTruthy();
  });

  it('search + equipment filter AND-compose (search "press" + equipment "barbell" excludes the dumbbell variant)', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('exercise-browse-screen-search'), 'press');
    await waitFor(() =>
      expect(screen.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy(),
    );
    // No equipment filter yet — the dumbbell variant still matches "press".
    expect(screen.getByText('Dumbbell Bench Press')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('exercise-browse-screen-equipment-chip'));
    await selectFilterOption('exercise-browse-screen-equipment-sheet', 'barbell');

    await waitFor(() => expect(screen.queryByText('Dumbbell Bench Press')).toBeNull());
    expect(screen.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy();
    expect(screen.getByText('Barbell Shoulder Press')).toBeTruthy();
  });

  it('muscle + equipment + search AND-compose to a known subset (squat + quadriceps + barbell)', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('exercise-browse-screen-search'), 'squat');

    await fireEvent.press(screen.getByTestId('exercise-browse-screen-muscle-chip'));
    await selectFilterOption('exercise-browse-screen-muscle-sheet', 'quadriceps');

    await fireEvent.press(screen.getByTestId('exercise-browse-screen-equipment-chip'));
    await selectFilterOption('exercise-browse-screen-equipment-sheet', 'barbell');

    await waitFor(() => expect(screen.getByText('Zercher Squats')).toBeTruthy());
    expect(screen.getByText('Barbell Squat')).toBeTruthy();
    expect(screen.queryByText('Bodyweight Squat')).toBeNull();
    expect(screen.queryByText('Dumbbell Squat')).toBeNull();
  });

  it('Clear on the filter sheet resets the selection (chip returns to unselected)', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('exercise-browse-screen-equipment-chip'));
    await selectFilterOption('exercise-browse-screen-equipment-sheet', 'barbell');

    await waitFor(() =>
      expect(screen.getByTestId('exercise-browse-screen-equipment-chip')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ selected: true }),
      ),
    );

    await fireEvent.press(screen.getByTestId('exercise-browse-screen-equipment-chip'));
    await fireEvent.press(
      await screen.findByTestId('exercise-browse-screen-equipment-sheet-clear'),
    );

    await waitFor(() =>
      expect(screen.getByTestId('exercise-browse-screen-equipment-chip')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ selected: false }),
      ),
    );
    // Cleared -> the dumbbell variant (excluded by the barbell filter a
    // moment ago) is visible again.
    expect(screen.getByText('Dumbbell Bench Press')).toBeTruthy();
  });

  it('A–Z rail: tapping a letter with a section calls scrollToIndex with that section header\'s row index', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    // Unfiltered fixture set sorted alphabetically starts with the '#'
    // bucket ("3/4 Sit-Up") then 'B' (Barbell...) — 'B' definitely has a
    // section here.
    await fireEvent.press(screen.getByTestId('exercise-browse-screen-az-rail-letter-B'));

    expect(getMockScrollToIndex()).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, index: expect.any(Number) }),
    );
    const [{ index }] = getMockScrollToIndex().mock.calls.at(-1)!;
    expect(index).toBeGreaterThanOrEqual(0);
  });

  it('A–Z rail: a letter with no section in the current data is disabled and does not scroll', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    // No fixture name starts with 'Q'.
    const qButton = screen.getByTestId('exercise-browse-screen-az-rail-letter-Q');
    expect(qButton).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    await fireEvent.press(qButton);
    expect(getMockScrollToIndex()).not.toHaveBeenCalled();
  });

  it('empty search shows the "No exercises found" state with a Create shortcut, and pressing it navigates with the query pre-filled', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    await fireEvent.changeText(
      screen.getByTestId('exercise-browse-screen-search'),
      'zzz_not_a_real_exercise_zzz',
    );

    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-empty')).toBeTruthy());
    expect(screen.getByText('No exercises found')).toBeTruthy();

    const cta = screen.getByTestId('exercise-browse-screen-create-cta');
    await fireEvent.press(cta);

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercise/new',
      params: { name: 'zzz_not_a_real_exercise_zzz' },
    });
  });

  it('the header "+" button navigates to the create-exercise seam with no name param', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('exercise-browse-screen-create-button'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/exercise/new', params: undefined });
  });

  it('tapping a row navigates to the exercise detail seam', async () => {
    renderScreen(new FakeExerciseRepository(FIXTURE_EXERCISES));
    await waitFor(() => expect(screen.getByTestId('exercise-row-Barbell_Squat')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('exercise-row-Barbell_Squat'));
    expect(router.push).toHaveBeenCalledWith('/exercise/Barbell_Squat');
  });

  it('placeholder thumbnail renders for a custom exercise with no images, tagged "Custom"', async () => {
    renderScreen(new FakeExerciseRepository([...FIXTURE_EXERCISES, FIXTURE_CUSTOM_NO_IMAGES]));
    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());

    await fireEvent.changeText(
      screen.getByTestId('exercise-browse-screen-search'),
      'My Custom Move',
    );

    await waitFor(() => expect(screen.getByText('My Custom Move')).toBeTruthy());
    // Avatar/Thumb's initial-letter fallback: accessible label = exercise
    // name, initial letter rendered as text — no broken-image UI attempted
    // for an image-less exercise (03 §2 acceptance criterion). Scoped to the
    // row itself (via `within`) since the A–Z rail also renders a bare "M"
    // letter button elsewhere on screen.
    const row = screen.getByTestId('exercise-row-custom-1');
    expect(within(row).getByLabelText('My Custom Move')).toBeTruthy();
    expect(within(row).getByText('M')).toBeTruthy();
    expect(within(row).getByText('Custom')).toBeTruthy();
  });

  it('Recent section renders only when unfiltered, and disappears once a search/filter is active', async () => {
    const repository = new FakeExerciseRepository(FIXTURE_EXERCISES, [FIXTURE_EXERCISES[0]]);
    renderScreen(repository);

    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('exercise-browse-screen-search'), 'squat');
    await waitFor(() => expect(screen.queryByText('Recent')).toBeNull());
  });
});

describe('ExerciseBrowseScreen — empty repository (no crash edge case)', () => {
  it('shows the empty state (no Create shortcut) when there is no query and zero exercises', async () => {
    renderScreen(new FakeExerciseRepository([]));

    await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-empty')).toBeTruthy());
    expect(screen.queryByTestId('exercise-browse-screen-create-cta')).toBeNull();
  });
});
