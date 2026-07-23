/**
 * `domain/exercise-mapping.ts` (M1-04) — 03 §6.3's field mapping (source
 * free-exercise-db shape -> Kyro `exercises` schema shape) and §6.4 step 3's
 * validation, as pure, disk-free, sharp-free functions so they can be
 * unit-tested directly against the real vendored dataset
 * (`data/free-exercise-db/exercises.json`) without any build/IO machinery.
 *
 * `scripts/build-exercise-db.ts` is the thin orchestrator around this module:
 * it reads the vendored JSON + curation files from disk, calls
 * `buildExerciseDataset` here, then does the disk-touching parts this module
 * deliberately has no opinion on — image processing (`sharp`), checking
 * image files exist on disk, and writing `assets/exercise-db.json` +
 * `curation-report.md`.
 *
 * Pure TS, zero React/React Native/Expo imports (06 §2 dependency rule) —
 * same `src/domain/**` zone as `enums.ts`/`units.ts`/`curation.ts`, and this
 * is why it counts toward the `src/domain/**` 95%/90% Jest coverage gate
 * (08 §3) rather than needing its own carve-out.
 */
import * as crypto from 'node:crypto';

import type { CurationOverridesFile, ExerciseOverride } from './curation';
import {
  EQUIPMENT_VALUES,
  EXERCISE_TYPE_VALUES,
  MUSCLE_GROUP_VALUES,
  type Equipment,
  type ExerciseType,
  type MuscleGroup,
} from './enums';

// ---------------------------------------------------------------------------
// Source shape (03 §6.2)
// ---------------------------------------------------------------------------

/** One record of the vendored `data/free-exercise-db/exercises.json` array (03 §6.2). */
export interface SourceExerciseRecord {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

// ---------------------------------------------------------------------------
// Mapped output shape — matches `src/data/sqlite/schema.ts`'s `exercises`
// table shape (05 §3.1), minus the seed-time-only columns
// (`created_at`/`updated_at`/`archived_at`/`animation_uri`) that M1-05's
// seed migration assigns, not this static build-time dataset.
// ---------------------------------------------------------------------------

export interface MappedExerciseRecord {
  id: string;
  name: string;
  exercise_type: ExerciseType;
  primary_muscle_group: MuscleGroup;
  secondary_muscle_groups: MuscleGroup[];
  equipment: Equipment;
  instructions: string[];
  /** Asset keys relative to `assets/`, e.g. `"exercises/Bench_Press/0.jpg"`. */
  images: string[];
  is_custom: 0;
  uses_custom_metric: 0 | 1;
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Muscle map (03 §6.3) — source `primaryMuscles`/`secondaryMuscles` string ->
// Kyro `muscle_group` (05 §2.3, `src/domain/enums.ts`). Exhaustive over every
// value the vendored dataset actually contains (verified against
// `data/free-exercise-db/exercises.json` at implementation time); `cardio`,
// `full_body`, `other` have no source equivalent (assigned by
// category/overrides/fallback instead, per the spec note under the map).
// ---------------------------------------------------------------------------

export const MUSCLE_MAP: Record<string, MuscleGroup> = {
  abdominals: 'abdominals',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower_back',
  'middle back': 'upper_back',
  neck: 'neck',
  quadriceps: 'quadriceps',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
};

/** Maps one source muscle string; `undefined` for anything unrecognized. */
export function mapMuscle(source: string): MuscleGroup | undefined {
  return MUSCLE_MAP[source];
}

/**
 * `primary_muscle_group` (03 §6.3): `primaryMuscles[0]` via {@link MUSCLE_MAP};
 * if `category=cardio` -> `cardio`; missing (no `primaryMuscles[0]`, or an
 * unrecognized source string) -> `other`.
 */
export function mapPrimaryMuscleGroup(source: SourceExerciseRecord): MuscleGroup {
  if (source.category === 'cardio') return 'cardio';
  const first = source.primaryMuscles[0];
  if (!first) return 'other';
  return mapMuscle(first) ?? 'other';
}

/**
 * `secondary_muscle_groups` (03 §6.3): remaining `primaryMuscles[1..]` +
 * `secondaryMuscles[]`, mapped, deduped, minus the primary — in that source
 * order (primaryMuscles remainder first, then secondaryMuscles), stable
 * dedupe (first occurrence wins) for deterministic output.
 */
export function mapSecondaryMuscleGroups(
  source: SourceExerciseRecord,
  primary: MuscleGroup,
): MuscleGroup[] {
  const candidates = [...source.primaryMuscles.slice(1), ...source.secondaryMuscles];
  const result: MuscleGroup[] = [];
  const seen = new Set<MuscleGroup>([primary]);
  for (const candidate of candidates) {
    const mapped = mapMuscle(candidate);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    result.push(mapped);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Equipment map (03 §6.3) — source `equipment` string (or `null`) -> Kyro
// `equipment` (05 §2.4). Keys are the exact raw strings found in the vendored
// dataset, lower-cased for a case-insensitive lookup; note the dataset's
// actual kettlebell string is the plural `"kettlebells"`, not `"kettlebell"`
// (verified against the real file) — mapped the same as the spec's singular
// wording intends.
// ---------------------------------------------------------------------------

export const EQUIPMENT_MAP: Record<string, Equipment> = {
  'body only': 'none',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  kettlebells: 'kettlebell',
  machine: 'machine',
  cable: 'machine',
  'e-z curl bar': 'barbell',
  bands: 'resistance_band',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'foam roll': 'other',
  other: 'other',
};

/** Maps the source `equipment` string (or `null`) per 03 §6.3's equipment map; `null` -> `none`. */
export function mapEquipment(source: string | null): Equipment {
  if (source === null) return 'none';
  const key = source.toLowerCase();
  return EQUIPMENT_MAP[key] ?? 'other';
}

// ---------------------------------------------------------------------------
// Exercise-type heuristic (03 §6.3, order matters — overrides win first,
// then rules 2-9 in the exact specified order). Name matching is done
// against a normalized form of the source `name` (lower-cased, all
// non-alphanumeric characters stripped) so hyphen/underscore/space/apostrophe
// spelling differences in the source data ("Chin-Up" vs "Muscle Up" vs
// "Farmer's Walk") don't matter — verified against the real dataset's actual
// `name` spellings at implementation time.
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const CARDIO_DISTANCE_RE = /run|row|bike|elliptical|ski|swim/;
const BODY_ONLY_HOLD_RE = /plank|hold|hang/;
const BODY_ONLY_REP_RE = /pullup|chinup|dip|muscleup|pistol/;
const ASSISTED_RE = /assisted/;
const CARRY_RE = /carry|farmer|suitcase|sled|yoke/;
const WEIGHTED_HOLD_RE = /wallsit|weightedhold/;

/**
 * The 9-step exercise-type heuristic (03 §6.3). Rules 4-6's "equipment=body
 * only" gate is evaluated against the **mapped** Kyro equipment value
 * (`mapEquipment(source.equipment) === 'none'`) rather than the raw source
 * string, so a source record with `equipment: null` (rather than the
 * literal string `"body only"`) is treated identically — both map to the
 * same Kyro `'none'` equipment, and in the real vendored dataset several
 * genuinely-bodyweight strength moves (`Decline_Push-Up`,
 * `Bodyweight_Walking_Lunge`, `Inverted_Row`, ...) are tagged `null` rather
 * than `"body only"`, seemingly inconsistently with near-identical
 * exercises in the same dataset. Treating them the same is also what
 * `data/curation/README.md`'s own rationale for the `Decline_Push-Up`
 * override assumes (it describes the *un-overridden* heuristic result as
 * rule 6's `reps_only`, which only holds if `null` equipment counts as
 * "body only" here).
 *
 * Overrides are applied by the caller (`buildMappedExercise`) *before*
 * this — rule 1 ("override file entry -> use it") is therefore not
 * re-implemented here; this function is only ever invoked for the
 * heuristic fallback (rules 2-9).
 */
export function classifyExerciseTypeHeuristic(source: SourceExerciseRecord): ExerciseType {
  const normalized = normalizeName(source.name);
  const isBodyOnly = mapEquipment(source.equipment) === 'none';

  // Rule 2: category=cardio and name matches run/row/bike/elliptical/ski/swim -> distance_duration.
  if (source.category === 'cardio' && CARDIO_DISTANCE_RE.test(normalized)) {
    return 'distance_duration';
  }

  // Rule 3: category=cardio or stretching otherwise -> duration.
  if (source.category === 'cardio' || source.category === 'stretching') {
    return 'duration';
  }

  // Rule 4: equipment=body only + name matches plank/hold/hang(-less-carry) isometrics -> duration.
  if (isBodyOnly && BODY_ONLY_HOLD_RE.test(normalized)) {
    return 'duration';
  }

  // Rule 5: name matches pull-up/chin-up/dip/muscle-up/pistol.
  //   - "assisted" in the name -> bodyweight_assisted_reps, regardless of the
  //     specific source equipment value (the one real assisted exercise in
  //     the vendored dataset, `Band_Assisted_Pull-Up`, is tagged
  //     `equipment: "other"`, not `"body only"`, since the band is the
  //     assisting apparatus — the movement itself is still bodyweight).
  //   - otherwise, only when equipment=body only -> bodyweight_reps.
  if (BODY_ONLY_REP_RE.test(normalized)) {
    if (ASSISTED_RE.test(normalized)) return 'bodyweight_assisted_reps';
    if (isBodyOnly) return 'bodyweight_reps';
  }

  // Rule 6: equipment=body only otherwise -> reps_only.
  if (isBodyOnly) {
    return 'reps_only';
  }

  // Rule 7: name matches carry/farmer/suitcase/sled/yoke -> short_distance_weight.
  if (CARRY_RE.test(normalized)) {
    return 'short_distance_weight';
  }

  // Rule 8: name matches "wall sit"/weighted hold -> weight_duration.
  if (WEIGHTED_HOLD_RE.test(normalized)) {
    return 'weight_duration';
  }

  // Rule 9: default -> weight_reps.
  return 'weight_reps';
}

/**
 * Full exercise-type resolution including override precedence (rule 1):
 * an override's `exercise_type`, when present, wins over every heuristic
 * rule below it (03 §6.3: "override file wins over all heuristics").
 */
export function classifyExerciseType(
  source: SourceExerciseRecord,
  override: ExerciseOverride | undefined,
): ExerciseType {
  if (override?.exercise_type) return override.exercise_type;
  return classifyExerciseTypeHeuristic(source);
}

// ---------------------------------------------------------------------------
// Image asset keys (03 §6.4 step 4/5) — deterministic mapping from the
// source's `images[]` (e.g. `"Bench_Press/0.jpg"`) to the bundled asset key
// the build's `sharp` pass writes to (`assets/exercises/{id}/{n}.jpg`),
// expressed relative to `assets/` (what `assets/exercise-db.json` itself
// lives alongside). Pure path math — no filesystem access.
// ---------------------------------------------------------------------------

export function mapImageAssetKeys(source: SourceExerciseRecord): string[] {
  return source.images.map((_, index) => `exercises/${source.id}/${index}.jpg`);
}

// ---------------------------------------------------------------------------
// Whole-record mapping + overrides (03 §6.4 steps 2-3)
// ---------------------------------------------------------------------------

export interface BuildDatasetResult {
  records: MappedExerciseRecord[];
  /** Non-fatal issues (03 §6.4 step 3: "instructions non-empty warning list" etc). */
  warnings: string[];
}

/** Maps one source record (with its override, if any, already resolved) to the Kyro shape. */
export function buildMappedExercise(
  source: SourceExerciseRecord,
  override: ExerciseOverride | undefined,
  globalAliasesForId: string[],
): MappedExerciseRecord {
  const primary = mapPrimaryMuscleGroup(source);
  const secondary = mapSecondaryMuscleGroups(source, primary);
  const aliases = [...(override?.aliases ?? []), ...globalAliasesForId];
  return {
    id: source.id,
    name: override?.name ?? source.name,
    exercise_type: classifyExerciseType(source, override),
    primary_muscle_group: primary,
    secondary_muscle_groups: secondary,
    equipment: mapEquipment(source.equipment),
    instructions: [...source.instructions],
    images: mapImageAssetKeys(source),
    is_custom: 0,
    uses_custom_metric: override?.uses_custom_metric ? 1 : 0,
    aliases: [...new Set(aliases)].sort(),
  };
}

/**
 * Applies `overrides.json` (03 §6.4 step 2) over the vendored source array
 * and maps every non-excluded record to the Kyro shape (03 §6.3), producing
 * a **deterministic** (stably id-sorted) output array plus a warnings list
 * for step 3's non-fatal checks (missing instructions; hard-error checks —
 * illegal enum values, missing primary muscle — are `validateMappedRecord`'s
 * job below, invoked separately so the build script can decide to abort).
 *
 * Deliberately does not check image files exist on disk (that needs `fs`,
 * kept out of this pure module) — the build script does that check itself
 * and folds any resulting warnings into the same report.
 */
export function buildExerciseDataset(
  sourceRecords: SourceExerciseRecord[],
  curation: CurationOverridesFile,
): BuildDatasetResult {
  const aliasesByTargetId = new Map<string, string[]>();
  for (const [term, targetId] of Object.entries(curation.aliases)) {
    const list = aliasesByTargetId.get(targetId) ?? [];
    list.push(term);
    aliasesByTargetId.set(targetId, list);
  }

  const warnings: string[] = [];
  const records: MappedExerciseRecord[] = [];

  const sorted = [...sourceRecords].sort((a, b) => a.id.localeCompare(b.id));

  for (const source of sorted) {
    const override = curation.overrides[source.id];
    if (override?.exclude) continue;

    const mapped = buildMappedExercise(source, override, aliasesByTargetId.get(source.id) ?? []);
    records.push(mapped);

    if (mapped.instructions.length === 0) {
      warnings.push(`${source.id}: no instructions`);
    }
  }

  return { records, warnings };
}

// ---------------------------------------------------------------------------
// Validation (03 §6.4 step 3) — hard errors that must fail the build.
// ---------------------------------------------------------------------------

const EXERCISE_TYPE_SET = new Set<string>(EXERCISE_TYPE_VALUES);
const MUSCLE_GROUP_SET = new Set<string>(MUSCLE_GROUP_VALUES);
const EQUIPMENT_SET = new Set<string>(EQUIPMENT_VALUES);

/**
 * Returns the list of hard-error messages for one mapped record (empty =
 * valid): every enum value legal against `src/domain/enums.ts`, and a
 * primary muscle group present. Exported standalone (rather than only a
 * throwing wrapper) so a corrupted/synthetic record can be checked directly
 * in tests without needing to fabricate a whole dataset (08 §4.7's
 * "enum-validation build failure" case).
 */
export function validateMappedRecord(record: MappedExerciseRecord): string[] {
  const errors: string[] = [];
  if (!record.primary_muscle_group) {
    errors.push(`${record.id}: missing primary_muscle_group`);
  } else if (!MUSCLE_GROUP_SET.has(record.primary_muscle_group)) {
    errors.push(`${record.id}: illegal primary_muscle_group "${record.primary_muscle_group}"`);
  }
  for (const muscle of record.secondary_muscle_groups) {
    if (!MUSCLE_GROUP_SET.has(muscle)) {
      errors.push(`${record.id}: illegal secondary_muscle_group "${muscle}"`);
    }
  }
  if (!EXERCISE_TYPE_SET.has(record.exercise_type)) {
    errors.push(`${record.id}: illegal exercise_type "${record.exercise_type}"`);
  }
  if (!EQUIPMENT_SET.has(record.equipment)) {
    errors.push(`${record.id}: illegal equipment "${record.equipment}"`);
  }
  return errors;
}

/**
 * Validates every record and throws a single `Error` (message = all
 * collected hard-error lines, newline-joined) if any record has one —
 * "fail the build on hard errors" (03 §6.4 step 3). No-op (returns
 * normally) when every record is valid.
 */
export function assertValidDataset(records: MappedExerciseRecord[]): void {
  const errors = records.flatMap(validateMappedRecord);
  if (errors.length > 0) {
    throw new Error(`Exercise dataset validation failed (${errors.length} error(s)):\n${errors.join('\n')}`);
  }
}

// ---------------------------------------------------------------------------
// Deterministic checksum (03 §6.4 step 5)
// ---------------------------------------------------------------------------

/**
 * A stable JSON string for a mapped record — explicit key order (not
 * reliant on insertion order surviving every call site) so
 * {@link computeDatasetHash} is stable regardless of how a record was built.
 */
function stableRecordJson(record: MappedExerciseRecord): string {
  return JSON.stringify({
    id: record.id,
    name: record.name,
    exercise_type: record.exercise_type,
    primary_muscle_group: record.primary_muscle_group,
    secondary_muscle_groups: record.secondary_muscle_groups,
    equipment: record.equipment,
    instructions: record.instructions,
    images: record.images,
    is_custom: record.is_custom,
    uses_custom_metric: record.uses_custom_metric,
    aliases: record.aliases,
  });
}

/**
 * sha256 hex digest over the id-sorted records in stable key order —
 * the "checksum/version constant" (03 §6.4 step 5) used both as
 * `assets/exercise-db.json`'s `version` field and, unchanged, as the
 * `dataset_version` value M1-05's seed migration compares against
 * `app_meta` to decide whether to re-seed. Two builds from the same inputs
 * must produce byte-identical output — determinism is achieved by this
 * function needing a **pre-sorted** `records` array (callers, i.e.
 * `buildExerciseDataset`, always emit id-sorted arrays) and by every field
 * in {@link stableRecordJson} already being deterministic (deduped +
 * sorted aliases, no timestamps).
 */
export function computeDatasetHash(records: MappedExerciseRecord[]): string {
  const hash = crypto.createHash('sha256');
  for (const record of records) {
    hash.update(stableRecordJson(record));
    hash.update('\n');
  }
  return hash.digest('hex');
}
