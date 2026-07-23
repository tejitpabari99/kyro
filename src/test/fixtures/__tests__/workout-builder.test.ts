import { aWorkout, exercise } from '../workout-builder';

describe('fixture builder — aWorkout().with(exercise(...).sets(...))', () => {
  it('builds the 08 §1 canonical example shape', () => {
    const workout = aWorkout().with(exercise('bench').sets('80x8', 'W:40x10')).build();

    expect(workout).toEqual({
      title: 'Fixture Workout',
      exercises: [
        {
          name: 'bench',
          supersetGroup: null,
          sets: [
            { type: 'normal', weightKg: 80, reps: 8, checked: true },
            { type: 'warmup', weightKg: 40, reps: 10, checked: true },
          ],
        },
      ],
    });
  });

  it('supports multiple exercises and a custom title', () => {
    const workout = aWorkout()
      .titled('Push Day')
      .with(exercise('bench').sets('80x8'), exercise('overhead press').sets('40x10', 'F:45x6'))
      .build();

    expect(workout.title).toBe('Push Day');
    expect(workout.exercises.map((e) => e.name)).toEqual(['bench', 'overhead press']);
    expect(workout.exercises[1].sets[1]).toEqual({
      type: 'failure',
      weightKg: 45,
      reps: 6,
      checked: true,
    });
  });

  it('lastUnchecked() marks the most recently added set as pending', () => {
    const [ex] = aWorkout().with(exercise('bench').sets('80x8').lastUnchecked()).build().exercises;

    expect(ex.sets[0].checked).toBe(false);
  });

  it('rejects malformed set specs', () => {
    expect(() => exercise('bench').sets('not-a-spec')).toThrow(/does not match/);
  });

  it('rejects unknown set-spec prefixes', () => {
    expect(() => exercise('bench').sets('X:80x8')).toThrow(/Unknown fixture set prefix/);
  });
});
