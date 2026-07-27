/**
 * `HevyImportService` (M5-07, 05 §7.2) — the impure half of the Hevy CSV
 * import pipeline: reading the picked file's text, matching/auto-creating
 * exercises against the real `ExerciseRepository`, checking for already-
 * imported duplicate workouts against the real DB, and the transactional
 * bulk insert. `domain/hevy-import.ts` owns every pure parse/group/infer
 * rule (see that file's own header) — this module only ever turns its
 * output into real rows.
 *
 * Lives in `src/features/data-transfer/` alongside `csv-service.ts` (M5-06)
 * — the same "glues `src/data/**` + `src/domain/**`/`src/lib/**` together"
 * role that file's own header describes, for the same reason: this is where
 * both layers may legally be imported together (`eslint.config.js`'s
 * `import/no-restricted-paths` zones permit any `src/features/**` file to
 * import both, `src/domain`/`src/data`/`src/ui`/`src/lib` cannot import each
 * other directly).
 *
 * ## Bulk insert, not the live-mutator path — same reasoning as
 * `synthetic-history-loader.ts` (M4-11), read in full before touching this
 *
 * `startEmpty`/`addExercises`/`finish` (`WorkoutRepository`) assume exactly
 * one *active* workout, are built for one-workout-at-a-time live logging,
 * and each `await generateUuid()` per row/mutator call — fine for a human
 * typing sets in real time, prohibitively slow and the wrong shape for
 * inserting up to hundreds of already-*completed* historical workouts in
 * one operation. `src/test/fixtures/synthetic-history-loader.ts` (M4-11)
 * established exactly this same "documented bulk-insert helper that
 * produces the same schema shape" alternative — allowed explicitly by that
 * task's own brief for the identical reason — and this module follows the
 * same shape: real `generateUuid()` calls (never a deterministic/fake id —
 * unlike the test-only synthetic fixture, these rows are real user data
 * that must carry real, globally-unique ids for future cloud sync, `12`
 * §5/§9) resolved *before* entering the transaction (`generateUuid` is
 * async; `SqliteDriver.transaction`'s callback must be synchronous — see
 * that interface's own doc comment), then one single `driver.transaction`
 * call writes every `workouts`/`workout_exercises`/`sets` row for every
 * non-duplicate, non-skipped workout in the file, producing the **exact
 * same column shape** the real mutators write (cross-checked against
 * `workout-repository.ts`'s own `finish()` INSERT statements and
 * `synthetic-history-loader.ts`'s own column list — `routine_occurrence_index`/
 * `routine_set_position` both stay `NULL`, correct: an imported workout has
 * no routine origin).
 *
 * ## Two-phase API: `preview` (read-only) then `confirm` (writes)
 *
 * `M5-tasks.md`'s M5-07 "How" line: "document picker → preview screen
 * (workouts found, date range, exercises matched/unmatched, rows skipped
 * with reasons) → confirm → transactional insert → report." `preview`
 * parses the file and resolves the exercise-match plan **without writing
 * anything** (no auto-create, no insert) — every `ExerciseRepository` call
 * it makes is a read (`list`). `confirm` takes the exact `HevyImportPreview`
 * object `preview` returned (so the file is never re-parsed) and performs
 * every write: auto-creating unmatched exercises, then the transactional
 * bulk insert, then handing back the exercise ids the caller's own
 * `invalidateAfterWorkoutMutation(queryClient, ids)` call needs (`features/
 * stats/records-service.ts`, M4-02 — deliberately not called from inside
 * this module: `QueryClient` is a UI-layer concern this module has no
 * business depending on, exactly the same "caller owns the queryClient
 * call" split every other mutation call site in this codebase already uses,
 * `ActiveWorkoutScreen.tsx`/`EditWorkoutScreen.tsx`/`HistoryDetailScreen.tsx`).
 *
 * `confirm` re-checks for duplicate workouts against the DB **again**,
 * fresh, rather than trusting `preview`'s own duplicate snapshot — cheap (one
 * query), and correct if anything changed in the DB between preview and
 * confirm (a resumed app session, another import, ...) even though that
 * gap is realistically both narrow and single-user here.
 */
import { generateUuid } from '@/data/shared/uuid';
import type { SqliteDriver } from '@/data/sqlite/driver';
import type { ExerciseRepository, NewCustomExercise } from '@/data/exercises/types';
import {
  aggregateExerciseMetricFlags,
  inferExerciseType,
  parseHevyCsvRecords,
  type ExerciseTypeInference,
  type HevyCsvUnits,
  type HevyRowError,
  type HevyRowWarning,
  type HevyWorkoutSkip,
  type ImportWorkoutDraft,
} from '@/domain/hevy-import';
import { parseCsv } from '@/lib/csv';
import { readTextFile } from '@/lib/hevy-import-file';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** One exercise title the file references that has no library match yet — resolved on `confirm` via `ExerciseRepository.create`. */
export interface UnmatchedExercisePreview {
  exerciseTitle: string;
  inference: ExerciseTypeInference;
}

export interface HevyImportPreview {
  units: HevyCsvUnits;
  /** Every well-formed, internally-consistent workout group found in the file — *before* the duplicate-against-DB filter `confirm` applies. */
  workoutsFoundCount: number;
  /** `null` when `workoutsFoundCount` is 0 (nothing to range over). */
  dateRange: { start: number; end: number } | null;
  matchedExerciseTitles: string[];
  unmatchedExercises: UnmatchedExercisePreview[];
  duplicateWorkoutCount: number;
  malformedRows: HevyRowError[];
  workoutSkips: HevyWorkoutSkip[];
  warnings: HevyRowWarning[];
  /**
   * Internal state `confirm` needs to actually write the import without
   * re-parsing the file or re-running exercise matching — not intended for
   * direct UI display (the fields above already surface everything the
   * preview screen needs), but deliberately not hidden behind a closure
   * either: `confirm` is a plain function taking a plain, inspectable
   * object, the same "no hidden state" posture every other repository/
   * service in this codebase already follows.
   */
  workouts: readonly ImportWorkoutDraft[];
  exerciseIdByTitle: ReadonlyMap<string, string>;
}

export interface AutoCreatedExerciseReportEntry {
  exerciseTitle: string;
  exerciseId: string;
  inference: ExerciseTypeInference;
}

export interface HevyImportReport {
  importedWorkoutCount: number;
  importedSetCount: number;
  duplicateSkippedCount: number;
  autoCreatedExercises: AutoCreatedExerciseReportEntry[];
  malformedRows: HevyRowError[];
  workoutSkips: HevyWorkoutSkip[];
  warnings: HevyRowWarning[];
  /** Every distinct exercise id any imported workout touched — feed straight into `invalidateAfterWorkoutMutation(queryClient, touchedExerciseIds)` (see file header). Empty when `importedWorkoutCount` is 0. */
  touchedExerciseIds: string[];
}

/** A whole-file problem `preview` can't recover from (empty file, unrecognizable header) — see `domain/hevy-import.ts`'s `HevyHeaderError`. */
export interface HevyImportFileError {
  error: string;
}

export interface HevyImportServiceDeps {
  driver: SqliteDriver;
  exerciseRepository: Pick<ExerciseRepository, 'list' | 'create'>;
}

export interface HevyImportServiceApi {
  /** Reads `fileUri`, parses it, and resolves (without writing) everything the preview screen needs. */
  preview(fileUri: string): Promise<HevyImportPreview | HevyImportFileError>;
  /** Performs every write for a `preview()` result: auto-creates unmatched exercises, bulk-inserts non-duplicate workouts in one transaction, returns the final report. */
  confirm(preview: HevyImportPreview): Promise<HevyImportReport>;
}

// ---------------------------------------------------------------------------
// Exercise name matching (05 §7.2: "exact case-insensitive match against
// library incl. aliases")
// ---------------------------------------------------------------------------

/** Case-insensitive name/alias -> id index, active rows preferred over archived ones sharing a name (`idx_exercises_name_active` only enforces uniqueness among active rows — see this module's header, "05 §7.4 re-link"). */
function buildExerciseNameIndex(
  exercises: readonly { id: string; name: string; aliases: readonly string[]; archivedAt: number | null }[],
): Map<string, string> {
  const active = new Map<string, string>();
  const archived = new Map<string, string>();

  for (const exercise of exercises) {
    const target = exercise.archivedAt === null ? active : archived;
    const names = [exercise.name, ...exercise.aliases];
    for (const name of names) {
      const key = name.toLowerCase();
      if (!target.has(key)) {
        target.set(key, exercise.id);
      }
    }
  }

  // Archived-only names fill in gaps active names didn't cover — active
  // always wins on a genuine collision (05 §7.4: re-importing a CSV should
  // re-link to the same exercise even if it was later archived, but never
  // at the cost of shadowing a *different*, currently-active exercise that
  // happens to share the archived one's old name).
  const merged = new Map(archived);
  for (const [key, id] of active) {
    merged.set(key, id);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------

function computeDateRange(
  workouts: readonly ImportWorkoutDraft[],
): { start: number; end: number } | null {
  if (workouts.length === 0) return null;
  let start = workouts[0].startTime;
  let end = workouts[0].startTime;
  for (const workout of workouts) {
    if (workout.startTime < start) start = workout.startTime;
    if (workout.startTime > end) end = workout.startTime;
  }
  return { start, end };
}

/** One row per distinct `(title, start_time)` pair currently in the DB (non-deleted) — the duplicate-check index (05 §7.2: "duplicate import (same title+start_time already exists) -> skip workout"). */
function loadExistingWorkoutKeys(driver: SqliteDriver): Set<string> {
  const rows = driver.queryAll<{ title: string; start_time: number }>(
    `SELECT title, start_time FROM workouts WHERE deleted_at IS NULL`,
  );
  return new Set(rows.map((row) => `${row.title} ${row.start_time}`));
}

function workoutKey(workout: Pick<ImportWorkoutDraft, 'title' | 'startTime'>): string {
  return `${workout.title} ${workout.startTime}`;
}

function distinctExerciseTitles(workouts: readonly ImportWorkoutDraft[]): string[] {
  const titles = new Set<string>();
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      titles.add(exercise.exerciseTitle);
    }
  }
  return Array.from(titles).sort((a, b) => a.localeCompare(b));
}

async function buildPreview(
  deps: HevyImportServiceDeps,
  fileText: string,
): Promise<HevyImportPreview | HevyImportFileError> {
  const { records } = parseCsv(fileText);
  const parseResult = parseHevyCsvRecords(records);
  if ('error' in parseResult) {
    return parseResult;
  }

  const { units, workouts, skippedWorkouts, malformedRows, warnings } = parseResult;

  const libraryExercises = await deps.exerciseRepository.list({ includeArchived: true });
  const nameIndex = buildExerciseNameIndex(libraryExercises);

  const matched: string[] = [];
  const unmatched: UnmatchedExercisePreview[] = [];
  const exerciseIdByTitle = new Map<string, string>();

  for (const title of distinctExerciseTitles(workouts)) {
    const existingId = nameIndex.get(title.toLowerCase());
    if (existingId) {
      matched.push(title);
      exerciseIdByTitle.set(title, existingId);
    } else {
      const flags = aggregateExerciseMetricFlags(workouts, title);
      unmatched.push({ exerciseTitle: title, inference: inferExerciseType(flags) });
    }
  }

  const existingWorkoutKeys = loadExistingWorkoutKeys(deps.driver);
  const duplicateWorkoutCount = workouts.filter((workout) =>
    existingWorkoutKeys.has(workoutKey(workout)),
  ).length;

  return {
    units,
    workoutsFoundCount: workouts.length,
    dateRange: computeDateRange(workouts),
    matchedExerciseTitles: matched,
    unmatchedExercises: unmatched,
    duplicateWorkoutCount,
    malformedRows,
    workoutSkips: skippedWorkouts,
    warnings,
    workouts,
    exerciseIdByTitle,
  };
}

// ---------------------------------------------------------------------------
// confirm — writes
// ---------------------------------------------------------------------------

/** Auto-creates every still-unmatched exercise title (re-resolved fresh — see file header on why `confirm` doesn't just trust `preview`'s own snapshot) as a custom exercise, typed per its inference. Returns the merged `title -> id` map (preview's matches + newly-created ones) plus the report entries for each creation. */
async function resolveAndCreateExercises(
  deps: HevyImportServiceDeps,
  preview: HevyImportPreview,
): Promise<{ idByTitle: Map<string, string>; autoCreated: AutoCreatedExerciseReportEntry[] }> {
  // Re-check the library fresh — a title `preview` reported unmatched could
  // have been created by something else in the (realistically vanishingly
  // small) gap between preview and confirm; re-checking avoids a spurious
  // duplicate-name create attempt in that case.
  const libraryExercises = await deps.exerciseRepository.list({ includeArchived: true });
  const nameIndex = buildExerciseNameIndex(libraryExercises);

  const idByTitle = new Map(preview.exerciseIdByTitle);
  const autoCreated: AutoCreatedExerciseReportEntry[] = [];

  for (const unmatched of preview.unmatchedExercises) {
    const existingId = nameIndex.get(unmatched.exerciseTitle.toLowerCase());
    if (existingId) {
      idByTitle.set(unmatched.exerciseTitle, existingId);
      continue;
    }

    const input: NewCustomExercise = {
      name: unmatched.exerciseTitle,
      exerciseType: unmatched.inference.exerciseType,
      // 05 §7.2 only specifies the *type* inference rule — primary muscle
      // group has no equivalent signal anywhere in a Hevy CSV row, so every
      // auto-created exercise gets `other` (the one muscle-group value 05
      // §2.3 documents as the generic catch-all) and is flagged in the
      // report for the user to re-type via the normal exercise-edit form
      // (05 §7.2: "flagged in the report for later re-typing/merging" — a
      // guessed muscle group would be strictly worse than an honest "not
      // set," which `other` communicates without inventing a wrong-looking
      // guess).
      primaryMuscleGroup: 'other',
    };
    const created = await deps.exerciseRepository.create(input);
    idByTitle.set(unmatched.exerciseTitle, created.id);
    autoCreated.push({
      exerciseTitle: unmatched.exerciseTitle,
      exerciseId: created.id,
      inference: unmatched.inference,
    });
  }

  return { idByTitle, autoCreated };
}

interface PreparedWorkoutIds {
  workoutId: string;
  /** `[exerciseIndex]` -> that occurrence's `workout_exercises.id`. */
  workoutExerciseIds: string[];
  /** `[exerciseIndex][setIndex]` -> that set's `sets.id`. */
  setIds: string[][];
}

/** Pre-generates every id the bulk insert needs — real `generateUuid()` calls, awaited *before* the synchronous transaction (see file header). */
async function prepareIds(workouts: readonly ImportWorkoutDraft[]): Promise<PreparedWorkoutIds[]> {
  const prepared: PreparedWorkoutIds[] = [];
  for (const workout of workouts) {
    const workoutId = await generateUuid();
    const workoutExerciseIds: string[] = [];
    const setIds: string[][] = [];
    for (const exercise of workout.exercises) {
      workoutExerciseIds.push(await generateUuid());
      const exerciseSetIds: string[] = [];
      for (let setIndex = 0; setIndex < exercise.sets.length; setIndex += 1) {
        exerciseSetIds.push(await generateUuid());
      }
      setIds.push(exerciseSetIds);
    }
    prepared.push({ workoutId, workoutExerciseIds, setIds });
  }
  return prepared;
}

/** Same INSERT column shape `WorkoutRepositoryImpl`'s real mutators write and `synthetic-history-loader.ts` mirrors (see file header) — one transaction for the whole batch of non-duplicate workouts. */
function bulkInsertWorkouts(
  driver: SqliteDriver,
  toImport: readonly { workout: ImportWorkoutDraft; ids: PreparedWorkoutIds }[],
  exerciseIdByTitle: ReadonlyMap<string, string>,
): number {
  let setCount = 0;
  const now = Date.now();

  driver.transaction(() => {
    for (const { workout, ids } of toImport) {
      driver.execute(
        `INSERT INTO workouts
           (id, title, description, routine_id, state, start_time, end_time,
            duration_pause_offset_ms, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, NULL, 'completed', ?, ?, 0, ?, ?, NULL)`,
        [ids.workoutId, workout.title, workout.description, workout.startTime, workout.endTime, now, now],
      );

      workout.exercises.forEach((exercise, exerciseIndex) => {
        const workoutExerciseId = ids.workoutExerciseIds[exerciseIndex];
        const exerciseId = exerciseIdByTitle.get(exercise.exerciseTitle);
        if (!exerciseId) {
          // Unreachable in practice: every exercise title in `workout` was
          // either matched or auto-created before this function runs (see
          // `confirm` below) — defensive guard, not a real code path.
          throw new Error(
            `hevy-import: no resolved exercise id for "${exercise.exerciseTitle}" — this is a bug, every title should have been matched or auto-created before the bulk insert.`,
          );
        }

        driver.execute(
          `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          [
            workoutExerciseId,
            ids.workoutId,
            exerciseId,
            exercise.position,
            exercise.supersetId,
            exercise.notes,
          ],
        );

        exercise.sets.forEach((set, setIndex) => {
          driver.execute(
            `INSERT INTO sets
               (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
                duration_seconds, rpe, custom_metric, is_completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
            [
              ids.setIds[exerciseIndex][setIndex],
              workoutExerciseId,
              set.position,
              set.setType,
              set.weightKg,
              set.reps,
              set.distanceMeters,
              set.durationSeconds,
              set.rpe,
            ],
          );
          setCount += 1;
        });
      });
    }
  });

  return setCount;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createHevyImportService(deps: HevyImportServiceDeps): HevyImportServiceApi {
  async function preview(fileUri: string): Promise<HevyImportPreview | HevyImportFileError> {
    const text = await readTextFile(fileUri);
    return buildPreview(deps, text);
  }

  async function confirm(previewResult: HevyImportPreview): Promise<HevyImportReport> {
    const { idByTitle, autoCreated } = await resolveAndCreateExercises(deps, previewResult);

    const existingWorkoutKeys = loadExistingWorkoutKeys(deps.driver);
    const newWorkouts = previewResult.workouts.filter(
      (workout) => !existingWorkoutKeys.has(workoutKey(workout)),
    );
    const duplicateSkippedCount = previewResult.workouts.length - newWorkouts.length;

    const preparedIds = await prepareIds(newWorkouts);
    const toImport = newWorkouts.map((workout, index) => ({ workout, ids: preparedIds[index] }));

    const importedSetCount = bulkInsertWorkouts(deps.driver, toImport, idByTitle);

    const touchedExerciseIds = Array.from(
      new Set(
        newWorkouts.flatMap((workout) =>
          workout.exercises
            .map((exercise) => idByTitle.get(exercise.exerciseTitle))
            .filter((id): id is string => id !== undefined),
        ),
      ),
    );

    return {
      importedWorkoutCount: newWorkouts.length,
      importedSetCount,
      duplicateSkippedCount,
      autoCreatedExercises: autoCreated,
      malformedRows: previewResult.malformedRows,
      workoutSkips: previewResult.workoutSkips,
      warnings: previewResult.warnings,
      touchedExerciseIds,
    };
  }

  return { preview, confirm };
}
