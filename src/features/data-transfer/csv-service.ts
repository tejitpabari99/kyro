/**
 * `CsvService` (M5-06, 05 §7.1's export surfaces) — the glue layer
 * `domain/csv-codec.ts`'s own header predicted ("`CsvService.exportAll`/
 * `exportWorkout` ... own fetching real data and handing it to
 * `encodeWorkoutsCsv`; this module only ever turns already-fetched rows into
 * a CSV string"). Lives in `src/features/data-transfer/` specifically
 * because that file's header names this exact path as the one place allowed
 * to import both `src/data/**` (repositories) and `src/domain/**`/
 * `src/lib/**` (the codec + the cache-file writer) — `eslint.config.js`'s
 * `import/no-restricted-paths` zones forbid `src/domain` from reaching
 * either of those itself.
 *
 * ## Two data-fetch shapes, one per export scope — not a single "getFull per
 * workout" loop
 *
 * `exportWorkout` fetches exactly one workout via `WorkoutRepository.getFull`
 * (already hydrated with exercises/sets in one call — the natural shape for
 * "one workout"). `exportAll` deliberately does **not** call `getFull` once
 * per workout (`workout-repository.ts`'s own M4-02 header calls that exact
 * N+1 shape out by name as the pattern M4 replaced for `HistoryListScreen`) —
 * instead: one `listCompleted` call for every completed `WorkoutSummary`
 * (see {@link EXPORT_ALL_FETCH_LIMIT}'s own doc comment for why this is a
 * single large-`limit` call rather than a paginated loop), then one
 * `getExercisesForWorkouts` call to batch-hydrate every one of their
 * exercises/sets in exactly two `IN`-batched queries total, regardless of
 * how many thousand workouts that is (05 §4's own "avoid N+1" framing,
 * applied at export-all scale).
 *
 * ## Exercise names: one `list()` call, not one `get(id)` per exercise
 *
 * `csv-codec.ts`'s own input shape needs `exerciseTitle`, not `exerciseId`
 * (that file's header, "Input shape") — `ExerciseRepository` has no
 * id-batch lookup (`get(id)` is one-at-a-time), so rather than one `get`
 * call per **distinct** exercise this export touches (still an N+1 shape,
 * just at exercise-cardinality instead of workout-cardinality),
 * {@link buildExerciseNameMap} calls `list({ includeArchived: true })`
 * exactly once — every exercise this app could possibly reference, built-in
 * or custom, archived or not (an archived custom exercise can still appear
 * in old history, 03 §5) — and builds an in-memory `id -> name` map from
 * that single result. A referenced exercise resolving to nothing in that map
 * would mean a `workout_exercises.exercise_id` pointing at a hard-deleted
 * exercise row — `ExerciseRepository.delete`'s own zero-reference-only rule
 * (03 §5) makes this state unreachable in practice, but the fallback below
 * degrades to a labeled placeholder rather than crashing the whole export
 * over one row, consistent with this codebase's existing "never let one bad
 * row abort a bulk operation" posture (`progress-photos.ts`'s orphan-sweep
 * placeholder-on-missing-file precedent, same idea one layer over).
 */
import { logger } from '@/lib/logger';
import type { ExerciseRepository } from '@/data/exercises/types';
import type {
  WorkoutExerciseFull,
  WorkoutFull,
  WorkoutRepository,
  WorkoutSummary,
} from '@/data/workouts/types';
import {
  encodeWorkoutsCsv,
  type CsvExportExercise,
  type CsvExportSet,
  type CsvExportUnits,
  type CsvExportWorkout,
} from '@/domain/csv-codec';
import { localDateKey } from '@/domain/streaks';
import { writeCacheTextFile } from '@/lib/csv-export-file';

/** The `WorkoutRepository` slice `CsvService` needs — mirrors every other feature's `Pick<Repository, '...'>` prop-typing convention (`records-service.ts`'s own `RecordsRepository`). */
export type CsvExportWorkoutRepository = Pick<
  WorkoutRepository,
  'listCompleted' | 'getExercisesForWorkouts' | 'getFull'
>;

/** The `ExerciseRepository` slice `CsvService` needs — just the one bulk lookup (see file header, "Exercise names"). */
export type CsvExportExerciseRepository = Pick<ExerciseRepository, 'list'>;

export interface CsvServiceDeps {
  workoutRepository: CsvExportWorkoutRepository;
  exerciseRepository: CsvExportExerciseRepository;
}

/** One written CSV export — `uri` is a real, already-on-disk `file://` path ready for `lib/share-file.ts`'s `shareFile`. */
export interface CsvExportFile {
  uri: string;
  /** Bare file name (no directory) — the same value written under the cache directory. */
  fileName: string;
}

export interface CsvServiceApi {
  /** Every completed workout in history, encoded per `units` and written to `kyro_workouts.csv` in the cache directory. */
  exportAll(units: CsvExportUnits): Promise<CsvExportFile>;
  /** One workout, encoded per `units` and written to `kyro_workout_{YYYY-MM-DD}.csv` (the workout's own local start date) in the cache directory. Throws a plain `Error` when `workoutId` doesn't resolve to any workout. */
  exportWorkout(workoutId: string, units: CsvExportUnits): Promise<CsvExportFile>;
}

const EXPORT_ALL_FILE_NAME = 'kyro_workouts.csv';

/**
 * `listCompleted`'s own paging is built for the History screen's incremental
 * FlashList (`before`/`limit` cursor, default `limit` 20, 06 §8) — a whole-
 * history export has no incremental-render need, so rather than looping
 * `before` cursors (which has a real edge case: two workouts sharing the
 * exact same `start_time` could straddle a page boundary and have one land
 * on the wrong side of a `< before` cut, silently dropping it from the
 * export — vanishingly unlikely in practice but a real correctness gap for a
 * cursor loop, and trivially avoidable), this asks for every completed
 * workout in **one** call with a single, very large `limit`. 05 §4's own
 * "1000+ workouts" ceiling is comfortably under this — matches
 * `workoutDates`/`statsFeed`'s own established "one unbounded query for the
 * whole history when no range is given" precedent (`workout-repository.ts`'s
 * own header).
 */
const EXPORT_ALL_FETCH_LIMIT = 1_000_000;

/** `kyro_workout_{YYYY-MM-DD}.csv` — the workout's own local start date (`domain/streaks.ts`'s `localDateKey`, the same "date -> filename/DB-key" helper `progress_photos.date` already keys off). Not the title: a workout title can contain characters unsafe/ambiguous in a file name (slashes, quotes) and isn't guaranteed unique per day either way, while the date is both safe and immediately meaningful to a user picking a share destination. */
function singleWorkoutFileName(startTime: number): string {
  return `kyro_workout_${localDateKey(startTime)}.csv`;
}

/** See file header, "Exercise names": one bulk fetch, `id -> name` map, placeholder fallback for the practically-unreachable dangling-reference case. */
async function buildExerciseNameMap(
  exerciseRepository: CsvExportExerciseRepository,
): Promise<Map<string, string>> {
  const exercises = await exerciseRepository.list({ includeArchived: true });
  return new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
}

function exerciseTitleFor(exerciseId: string, names: ReadonlyMap<string, string>): string {
  const name = names.get(exerciseId);
  if (name === undefined) {
    // Practically unreachable (see file header) — logged, not thrown, so
    // one dangling reference never aborts an otherwise-good export.
    logger.warn(`csv-service.exportAll: no exercise found for id "${exerciseId}"`);
    return 'Unknown Exercise';
  }
  return name;
}

/** `WorkoutExerciseFull[]` -> `CsvExportExercise[]`, joining in each exercise's title via `names` (`csv-codec.ts`'s own "denormalize onto the row" input shape — see that file's header). */
function toCsvExportExercises(
  exercises: readonly WorkoutExerciseFull[],
  names: ReadonlyMap<string, string>,
): CsvExportExercise[] {
  return exercises.map((exercise): CsvExportExercise => ({
    position: exercise.position,
    exerciseTitle: exerciseTitleFor(exercise.exerciseId, names),
    supersetId: exercise.supersetId,
    notes: exercise.notes,
    sets: exercise.sets.map(
      (set): CsvExportSet => ({
        position: set.position,
        setType: set.setType,
        weightKg: set.weightKg,
        reps: set.reps,
        distanceMeters: set.distanceMeters,
        durationSeconds: set.durationSeconds,
        rpe: set.rpe,
      }),
    ),
  }));
}

/** One `WorkoutSummary`/`WorkoutFull` "meta" slice + its already-hydrated exercises -> one `CsvExportWorkout` row. `state` is always passed through faithfully rather than assumed `'completed'` — `encodeWorkoutsCsv`'s own filter (`csv-codec.ts`'s header) is the single source of truth for what actually gets a row; this function never second-guesses it. */
function toCsvExportWorkout(
  meta: Pick<WorkoutSummary, 'title' | 'description' | 'startTime' | 'endTime'> & {
    state: WorkoutFull['state'];
  },
  exercises: readonly WorkoutExerciseFull[],
  names: ReadonlyMap<string, string>,
): CsvExportWorkout {
  return {
    title: meta.title,
    description: meta.description,
    state: meta.state,
    startTime: meta.startTime,
    endTime: meta.endTime,
    exercises: toCsvExportExercises(exercises, names),
  };
}

export function createCsvService(deps: CsvServiceDeps): CsvServiceApi {
  const { workoutRepository, exerciseRepository } = deps;

  async function exportAll(units: CsvExportUnits): Promise<CsvExportFile> {
    const summaries = await workoutRepository.listCompleted({ limit: EXPORT_ALL_FETCH_LIMIT });
    const exercisesByWorkoutId = await workoutRepository.getExercisesForWorkouts(
      summaries.map((s) => s.id),
    );
    const names = await buildExerciseNameMap(exerciseRepository);

    const workouts = summaries.map((summary) =>
      toCsvExportWorkout(
        { ...summary, state: 'completed' },
        exercisesByWorkoutId.get(summary.id) ?? [],
        names,
      ),
    );

    const csv = encodeWorkoutsCsv(workouts, units);
    const uri = await writeCacheTextFile(EXPORT_ALL_FILE_NAME, csv);
    return { uri, fileName: EXPORT_ALL_FILE_NAME };
  }

  async function exportWorkout(workoutId: string, units: CsvExportUnits): Promise<CsvExportFile> {
    const workout = await workoutRepository.getFull(workoutId);
    if (!workout) {
      throw new Error(`CsvService.exportWorkout: workout "${workoutId}" not found.`);
    }

    const names = await buildExerciseNameMap(exerciseRepository);
    const csvWorkout = toCsvExportWorkout(workout, workout.exercises, names);
    const csv = encodeWorkoutsCsv([csvWorkout], units);

    const fileName = singleWorkoutFileName(workout.startTime);
    const uri = await writeCacheTextFile(fileName, csv);
    return { uri, fileName };
  }

  return { exportAll, exportWorkout };
}
