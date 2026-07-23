/**
 * `ExerciseRepository`'s public shapes (M1-06) — 05 §6's interface, typed
 * against `src/domain/enums.ts`'s canonical enum unions and mirroring
 * `src/data/sqlite/schema.ts`'s `exercises` table (05 §3.1) field-for-field
 * (camelCase here; the repository implementation owns the snake_case
 * mapping at the SQL boundary).
 */
import type { Equipment, ExerciseType, MuscleGroup } from '@/domain/enums';
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';

/** One row of the `exercises` table (05 §3.1), decoded into TS-native shapes (JSON columns parsed, `0`/`1` integers as `boolean`). */
export interface Exercise {
  id: string;
  name: string;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: Equipment;
  instructions: string[];
  /** Built-ins: bundled asset keys (relative to `assets/`). Customs: file names relative to the exercise's photos dir (05 §8). */
  images: string[];
  /** Reserved for a future GIF milestone (03 §4) — always `null` until then. */
  animationUri: string | null;
  isCustom: boolean;
  usesCustomMetric: boolean;
  /** Search synonyms (03 §2) — e.g. `["OHP"]` on "Barbell Shoulder Press". */
  aliases: string[];
  /** `null` = visible in browse/picker; set = hidden from browse/picker but still rendered in history/stats/old routines (03 §5). */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** `ExerciseRepository.list`'s optional filter (05 §6 / 03 §2). */
export interface ExerciseListFilter {
  /** Case/diacritic-insensitive substring match against `name` OR any `aliases` entry (03 §2). */
  query?: string;
  /** Exact match against `primaryMuscleGroup`. */
  muscle?: MuscleGroup;
  /** Exact match against `equipment`. */
  equipment?: Equipment;
  /** `true` includes archived rows; default (`false`/omitted) excludes them — matches browse/picker's default-exclude rule (03 §5). */
  includeArchived?: boolean;
}

/** The fields a custom exercise's `create`/`update` may set (05 §6: `Partial<CustomExerciseFields>` for `update`). Never includes `aliases` — 03 §2/§6.4 scope aliases to the built-in curation file, not the user-facing custom-exercise form (03 §5). */
export interface CustomExerciseFields {
  name: string;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: Equipment;
  instructions: string[];
  images: string[];
  usesCustomMetric: boolean;
}

/** `ExerciseRepository.create`'s input — `name`/`exerciseType`/`primaryMuscleGroup` are required (03 §5); everything else defaults (secondary muscles `[]`, equipment `none`, instructions `[]`, images `[]`, `usesCustomMetric` `false`). */
export type NewCustomExercise = Pick<
  CustomExerciseFields,
  'name' | 'exerciseType' | 'primaryMuscleGroup'
> &
  Partial<Omit<CustomExerciseFields, 'name' | 'exerciseType' | 'primaryMuscleGroup'>>;

/**
 * The exercise repository interface (05 §6, verbatim signatures). See
 * `exercise-repository.ts`'s header for the concrete implementation and its
 * per-method design notes.
 */
export interface ExerciseRepository {
  list(filter?: ExerciseListFilter): Promise<Exercise[]>;
  get(id: string): Promise<Exercise | null>;
  create(input: NewCustomExercise): Promise<Exercise>;
  update(id: string, patch: Partial<CustomExerciseFields>): Promise<Exercise>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  referenceCount(id: string): Promise<number>;
  recentlyUsed(limit: number): Promise<Exercise[]>;
  seedBuiltins(dataset: readonly MappedExerciseRecord[], version: string): Promise<void>;
}
