/**
 * `buildHistoryCard` tests (M4-03 acceptance gate: "Cards show accurate
 * volume/PR counts"). Pure, no React/query/records-singleton involved —
 * `awardsByExerciseId` is passed in directly, standing in for whatever
 * `RecordsService.getSnapshot(exerciseId).awards` the screen would have
 * resolved.
 */
import type { Exercise } from '@/data/exercises/types';
import type { WorkoutExerciseFull, WorkoutSummary } from '@/data/workouts/types';
import type { RecordAward } from '@/domain/records';

import { buildHistoryCard, type ExerciseAwards } from '../history-list-model';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1',
    name: 'Bench Press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: [],
    equipment: 'barbell',
    instructions: [],
    images: [],
    animationUri: null,
    isCustom: false,
    usesCustomMetric: false,
    aliases: [],
    archivedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<WorkoutSummary> = {}): WorkoutSummary {
  return {
    id: 'w-1',
    title: 'Push Day',
    description: null,
    routineId: null,
    startTime: new Date(2026, 0, 1, 9, 0, 0).getTime(),
    endTime: new Date(2026, 0, 1, 9, 30, 0).getTime(),
    durationPauseOffsetMs: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeWorkoutExercise(overrides: Partial<WorkoutExerciseFull> = {}): WorkoutExerciseFull {
  return {
    id: 'we-1',
    workoutId: 'w-1',
    exerciseId: 'ex-1',
    position: 0,
    supersetId: null,
    notes: null,
    restSeconds: null,
    routineOccurrenceIndex: null,
    sets: [
      {
        id: 'set-1',
        position: 0,
        setType: 'normal',
        weightKg: 60,
        reps: 8,
        distanceMeters: null,
        durationSeconds: null,
        rpe: null,
        customMetric: null,
        isCompleted: true,
        routineSetPosition: null,
      },
    ],
    ...overrides,
  };
}

const UNITS = { weightUnit: 'kg' as const, distanceUnit: 'km' as const };

describe('buildHistoryCard', () => {
  it('computes accurate volume (60kg x 8 = 480 kg)', () => {
    const card = buildHistoryCard(
      makeSummary(),
      [makeWorkoutExercise()],
      new Map([['ex-1', makeExercise()]]),
      new Map(),
      UNITS,
      false,
    );
    expect(card.volumeLabel).toBe('480 kg');
  });

  it('excludes unchecked sets from volume', () => {
    const we = makeWorkoutExercise({
      sets: [
        ...makeWorkoutExercise().sets,
        {
          id: 'set-2',
          position: 1,
          setType: 'normal',
          weightKg: 999,
          reps: 999,
          distanceMeters: null,
          durationSeconds: null,
          rpe: null,
          customMetric: null,
          isCompleted: false,
          routineSetPosition: null,
        },
      ],
    });
    const card = buildHistoryCard(
      makeSummary(),
      [we],
      new Map([['ex-1', makeExercise()]]),
      new Map(),
      UNITS,
      false,
    );
    expect(card.volumeLabel).toBe('480 kg');
  });

  it('duration = (endTime - startTime - pauseOffset), formatted mm:ss', () => {
    const summary = makeSummary({
      startTime: 0,
      endTime: 90_000,
      durationPauseOffsetMs: 30_000,
    });
    const card = buildHistoryCard(summary, [], new Map(), new Map(), UNITS, false);
    expect(card.durationLabel).toBe('1:00');
  });

  it('prCount sums this workout\'s own (set, record-type) awards across its distinct exercises, ignoring other workouts\' awards', () => {
    const awards: ExerciseAwards = [
      { recordType: 'heaviest_weight', setId: 's1', workoutId: 'w-1' },
      { recordType: 'best_1rm', setId: 's1', workoutId: 'w-1' },
      { recordType: 'heaviest_weight', setId: 's-other', workoutId: 'w-2' },
    ];
    const card = buildHistoryCard(
      makeSummary(),
      [makeWorkoutExercise()],
      new Map([['ex-1', makeExercise()]]),
      new Map([['ex-1', awards]]),
      UNITS,
      false,
    );
    expect(card.prCount).toBe(2);
  });

  it('prCount is 0 (and the caller omits the trophy segment, not shown here) when no awards match this workout', () => {
    const card = buildHistoryCard(
      makeSummary(),
      [makeWorkoutExercise()],
      new Map([['ex-1', makeExercise()]]),
      new Map([['ex-1', []]]),
      UNITS,
      false,
    );
    expect(card.prCount).toBe(0);
  });

  it('prCount sums across two distinct exercises in the same workout', () => {
    const we1 = makeWorkoutExercise({ id: 'we-1', exerciseId: 'ex-1' });
    const we2 = makeWorkoutExercise({ id: 'we-2', exerciseId: 'ex-2' });
    const awards1: ExerciseAwards = [{ recordType: 'heaviest_weight', setId: 's1', workoutId: 'w-1' }];
    const awards2: RecordAward[] = [
      { recordType: 'most_reps', setId: 's2', workoutId: 'w-1' },
      { recordType: 'longest_duration', setId: 's3', workoutId: 'w-1' },
    ];
    const card = buildHistoryCard(
      makeSummary(),
      [we1, we2],
      new Map([
        ['ex-1', makeExercise({ id: 'ex-1' })],
        ['ex-2', makeExercise({ id: 'ex-2', name: 'Squat' })],
      ]),
      new Map([
        ['ex-1', awards1],
        ['ex-2', awards2],
      ]),
      UNITS,
      false,
    );
    expect(card.prCount).toBe(3);
  });

  it('exercise summary line: "N × Name (Equipment) — best …"', () => {
    const card = buildHistoryCard(
      makeSummary(),
      [makeWorkoutExercise()],
      new Map([['ex-1', makeExercise()]]),
      new Map(),
      UNITS,
      false,
    );
    expect(card.exerciseLines).toEqual(['1 × Bench Press (Barbell) — best 60kg × 8']);
  });

  it('equipment "none" omits the parenthetical', () => {
    const card = buildHistoryCard(
      makeSummary(),
      [makeWorkoutExercise()],
      new Map([['ex-1', makeExercise({ equipment: 'none' })]]),
      new Map(),
      UNITS,
      false,
    );
    expect(card.exerciseLines[0]).toBe('1 × Bench Press — best 60kg × 8');
  });

  it('a workoutExercise referencing an unknown/orphaned exerciseId is skipped, not thrown', () => {
    const card = buildHistoryCard(
      makeSummary(),
      [makeWorkoutExercise({ exerciseId: 'does-not-exist' })],
      new Map(),
      new Map(),
      UNITS,
      false,
    );
    expect(card.exerciseLines).toEqual([]);
    expect(card.volumeLabel).toBe('0 kg');
  });

  it('relativeDate / title pass through from the summary', () => {
    const card = buildHistoryCard(
      makeSummary({ title: 'Leg Day' }),
      [],
      new Map(),
      new Map(),
      UNITS,
      false,
    );
    expect(card.title).toBe('Leg Day');
    expect(card.workoutId).toBe('w-1');
  });
});
