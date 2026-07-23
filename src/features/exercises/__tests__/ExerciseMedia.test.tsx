/**
 * `ExerciseMedia` tests (M1-08 acceptance gate): 03 §4's fallback-tier
 * matrix — built-in with 2 real images crossfades, custom with 1 image is
 * static, custom with 0 images shows the placeholder glyph — plus RNTL
 * smoke render in both themes.
 *
 * The crossfade case uses the real generated `BUILTIN_IMAGES` registry
 * (built from the actual vendored `assets/exercise-db.json`) via a real
 * built-in id, not a mock — the same fidelity approach `exercise-fixtures.ts`
 * (M1-07) already established for this feature's tests.
 */
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ExerciseMedia, CROSSFADE_INTERVAL_MS, type ExerciseMediaExercise } from '../ExerciseMedia';
import { BUILTIN_IMAGES } from '../exercise-image-registry.generated';
import { ThemeProvider } from '@/ui/theme-provider';

const REAL_BUILTIN_ID = 'Barbell_Bench_Press_-_Medium_Grip';

function builtinExercise(overrides: Partial<ExerciseMediaExercise> = {}): ExerciseMediaExercise {
  return {
    id: REAL_BUILTIN_ID,
    name: 'Barbell Bench Press - Medium Grip',
    isCustom: false,
    images: [],
    animationUri: null,
    primaryMuscleGroup: 'chest',
    ...overrides,
  };
}

describe('ExerciseMedia — built-in with 2 real images crossfades', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('references both real registry sources and cycles the active one every ~1s', async () => {
    const expectedSources = BUILTIN_IMAGES[REAL_BUILTIN_ID];
    expect(expectedSources).toHaveLength(2);

    await render(
      <ThemeProvider preference="dark">
        <ExerciseMedia exercise={builtinExercise()} size={300} testID="media" />
      </ThemeProvider>,
    );

    const image = screen.getByTestId('media-image');
    expect(image.props.source).toBe(expectedSources[0]);

    await act(async () => {
      jest.advanceTimersByTime(CROSSFADE_INTERVAL_MS);
    });
    expect(screen.getByTestId('media-image').props.source).toBe(expectedSources[1]);

    await act(async () => {
      jest.advanceTimersByTime(CROSSFADE_INTERVAL_MS);
    });
    expect(screen.getByTestId('media-image').props.source).toBe(expectedSources[0]);
  });

  it('sets a transition (cross-dissolve) on the crossfading image', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseMedia exercise={builtinExercise()} size={300} testID="media" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('media-image').props.transition).toBeTruthy();
  });
});

describe('ExerciseMedia — custom exercise with 1 user-style image is static', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the single image and never attempts a crossfade', async () => {
    const customExercise = builtinExercise({
      id: 'custom-1',
      isCustom: true,
      images: ['file:///mock/documents/photos/exercises/custom-1/abc.jpg'],
    });

    await render(
      <ThemeProvider preference="dark">
        <ExerciseMedia exercise={customExercise} size={300} testID="media" />
      </ThemeProvider>,
    );

    // `expo-image` normalizes a bare string `source` into `{uri: string}`
    // internally (its own real behavior, not a test artifact) — asserted
    // against that normalized shape rather than the raw string.
    const image = screen.getByTestId('media-image');
    expect(image.props.source).toEqual({
      uri: 'file:///mock/documents/photos/exercises/custom-1/abc.jpg',
    });
    expect(image.props.transition).toBeFalsy();

    await act(async () => {
      jest.advanceTimersByTime(CROSSFADE_INTERVAL_MS * 3);
    });
    // Source is unchanged — a single-image tier has nothing to cycle to.
    expect(screen.getByTestId('media-image').props.source).toEqual({
      uri: 'file:///mock/documents/photos/exercises/custom-1/abc.jpg',
    });
  });
});

describe('ExerciseMedia — custom exercise with 0 images shows the placeholder', () => {
  it('renders the muscle-group glyph and label in dark theme', async () => {
    const customExercise = builtinExercise({
      id: 'custom-no-images',
      isCustom: true,
      images: [],
      primaryMuscleGroup: 'chest',
    });

    await render(
      <ThemeProvider preference="dark">
        <ExerciseMedia exercise={customExercise} size={300} testID="media" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('media-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('media-image')).toBeNull();
    expect(screen.getByText('Chest')).toBeTruthy();
  });

  it('renders the muscle-group glyph and label in light theme', async () => {
    const customExercise = builtinExercise({
      id: 'custom-no-images',
      isCustom: true,
      images: [],
      primaryMuscleGroup: 'hamstrings',
    });

    await render(
      <ThemeProvider preference="light">
        <ExerciseMedia exercise={customExercise} size={300} testID="media" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('media-placeholder')).toBeTruthy();
    expect(screen.getByText('Hamstrings')).toBeTruthy();
  });
});

describe('ExerciseMedia — animationUri takes priority even with real images present', () => {
  it('renders the animated source, not the image pair', async () => {
    const exercise = builtinExercise({ animationUri: 'https://example.com/future.gif' });

    await render(
      <ThemeProvider preference="dark">
        <ExerciseMedia exercise={exercise} size={300} testID="media" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('media-image').props.source).toEqual({
      uri: 'https://example.com/future.gif',
    });
  });
});

describe('ExerciseMedia — sizing', () => {
  it('derives a 16:9 height from the given width', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseMedia exercise={builtinExercise()} size={320} testID="media" />
      </ThemeProvider>,
    );

    const container = screen.getByTestId('media');
    const flatStyle = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style)
      : container.props.style;
    expect(flatStyle.width).toBe(320);
    expect(flatStyle.height).toBe(Math.round((320 * 9) / 16));
  });
});
