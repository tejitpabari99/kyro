/**
 * `ExerciseMedia({exercise, size})` (M1-08) — 03 §4's media-slot contract,
 * the **only** component in this codebase that renders an exercise's full
 * (non-thumbnail) media. Resolves, in priority order: `exercise.animationUri`
 * (future GIF/WebP slot, `expo-image` plays these natively, always `null`
 * today) -> `images[0..1]` auto-crossfade (~1 s interval) -> `images[0]`
 * static -> a branded placeholder (muscle-group glyph on a themed
 * background). Source *selection* per tier lives in
 * `exercise-media-source.ts` (unit-tested standalone); this file owns only
 * the render + the crossfade interval/animation.
 *
 * **Not the same seam as the browse-row thumbnail** — 03 §4 explicitly
 * carves that out as a smaller, separate use case ("Thumbnails use
 * `images[0]` -> placeholder"): `ExerciseRow`/`resolveExerciseThumbnailSource`
 * (M1-07) keep using the 128 px `thumb.jpg` registry and stay untouched.
 * This component is the one true implementation of the *full* priority
 * chain (crossfade tier included) for the exercise detail page (and, later,
 * anywhere else full-size exercise media is needed — the mid-workout sheet
 * reuse note in M1-08's task text, M2's job to wire).
 *
 * **Placeholder tier — a documented scope call:** 03 §4 says "branded
 * placeholder (muscle-group glyph on `bg.tertiary`)". Two things don't
 * exist anywhere else in this codebase to build that literally: (1)
 * `bg.tertiary` isn't a token `07`/`src/ui/tokens.ts` defines (`bg` only has
 * `base`/`surface`/`elevated`/`accentSubtle`) — used `bg.elevated` instead,
 * the same token `Avatar`/`Thumb`'s placeholder circle already uses for
 * this exact purpose (nested-surface/thumbnail placeholder, per that
 * token's own doc comment). (2) no per-muscle-group icon set is specified
 * in `07`'s icon inventory (§5's icon list is generic app chrome: tab
 * icons, trophy, timer, folder, calendar — nothing muscle-specific). Rather
 * than invent a 20-icon mapping nothing in the design doc calls for, this
 * renders one consistent branded glyph (`Dumbbell`, already 07 §5's chosen
 * icon for the Workout tab — a recognizable "this is exercise content"
 * mark) plus the primary muscle group's label as a caption underneath, so
 * "using the exercise's primary_muscle_group" (the task text's own phrase)
 * is satisfied via the visible label rather than a bespoke icon-per-muscle
 * inventory that would just be guessed.
 *
 * **Crossfade implementation:** a `setInterval` (~1 s, `03` §3's own
 * interval figure) flips which of the two resolved sources is "active";
 * `expo-image`'s `transition` prop (a real cross-dissolve `expo-image`
 * performs internally when its `source` prop changes) provides the actual
 * visual fade between the two — no hand-rolled `Animated` opacity layering
 * needed. Only armed when there are >= 2 sources and no `animationUri`
 * (an animated/GIF source plays on its own, no interval needed).
 */
import React, { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react-native';
import { Image, type ImageSource } from 'expo-image';
import { Text, View } from 'react-native';

import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/enums';

import { resolveExerciseMediaSources, type MediaSourceExercise } from './exercise-media-source';
import { useTheme } from '@/ui/theme-provider';

/** ~1 s per 03 §3/§4's own crossfade interval figure. */
export const CROSSFADE_INTERVAL_MS = 1000;
/** Fade duration `expo-image`'s `transition` uses for the crossfade — shorter than the interval so each fade completes before the next flip. */
const CROSSFADE_TRANSITION_MS = 400;

export interface ExerciseMediaExercise extends MediaSourceExercise {
  name: string;
  primaryMuscleGroup: MuscleGroup;
}

export interface ExerciseMediaProps {
  exercise: ExerciseMediaExercise;
  /** Rendered width in pt; height is derived at a 16:9 aspect ratio (03 §3's detail-page header shape). */
  size: number;
  testID?: string;
}

function PlaceholderGlyph({
  exercise,
  testID,
}: {
  exercise: ExerciseMediaExercise;
  testID: string;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const label = MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup];

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${exercise.name} — no media, ${label}`}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg.elevated,
      }}
    >
      <Dumbbell size={40} strokeWidth={1.5} color={colors.text.tertiary} />
      <Text
        testID={`${testID}-label`}
        style={[typography.footnote, { color: colors.text.tertiary, marginTop: spacing['2'] }]}
      >
        {label}
      </Text>
    </View>
  );
}

export function ExerciseMedia({
  exercise,
  size,
  testID = 'exercise-media',
}: ExerciseMediaProps): React.JSX.Element {
  const { sources, tier } = resolveExerciseMediaSources(exercise);
  const [activeIndex, setActiveIndex] = useState(0);
  const height = Math.round((size * 9) / 16);

  // Reset to the first source whenever the exercise (or its resolved tier)
  // changes, so switching exercises never briefly shows the previous
  // exercise's second frame. Deliberately *not* a `useEffect` (React's own
  // "adjusting state when a prop changes" pattern, not the "synchronize
  // with an external system" one `useEffect` is for — calling `setState`
  // unconditionally inside an effect body triggers an extra
  // render-then-immediately-re-render cascade every commit, flagged by this
  // repo's `react-hooks/set-state-in-effect` lint rule): track the
  // exercise/tier key that produced the current `activeIndex` and adjust
  // state mid-render, once, exactly when that key changes.
  const resetKey = `${exercise.id}:${tier}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (tier !== 'crossfade') {
      return undefined;
    }
    const handle = setInterval(() => {
      setActiveIndex((current) => (current + 1) % sources.length);
    }, CROSSFADE_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [tier, sources.length]);

  if (tier === 'placeholder') {
    return (
      <View testID={testID} style={{ width: size, height, overflow: 'hidden' }}>
        <PlaceholderGlyph exercise={exercise} testID={`${testID}-placeholder`} />
      </View>
    );
  }

  const activeSource = sources[activeIndex] as ImageSource | number | string;

  return (
    <View testID={testID} style={{ width: size, height, overflow: 'hidden' }}>
      <Image
        testID={`${testID}-image`}
        source={activeSource}
        style={{ width: size, height }}
        contentFit="cover"
        accessible
        accessibilityLabel={exercise.name}
        transition={tier === 'crossfade' ? CROSSFADE_TRANSITION_MS : undefined}
      />
    </View>
  );
}
