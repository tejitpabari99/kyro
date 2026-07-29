export {
  aWorkout,
  exercise,
  parseSetSpec,
  ExerciseBuilder,
  WorkoutBuilder,
  type FixtureSet,
  type FixtureSetType,
  type FixtureExercise,
  type FixtureWorkout,
} from './workout-builder';

export {
  generateSyntheticHistory,
  SYNTHETIC_EXERCISES,
  type SyntheticExercise,
  type SyntheticSet,
  type SyntheticWorkout,
  type SyntheticWorkoutExercise,
  type SyntheticHistoryDataset,
  type SyntheticHistoryOptions,
} from './synthetic-history';

export {
  insertSyntheticHistory,
  type InsertSyntheticHistoryResult,
} from './synthetic-history-loader';
