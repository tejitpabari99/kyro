/**
 * `domain/exercise-mapping.ts` unit tests (M1-04) — 08 §4.7's named test
 * cases: every muscle/equipment mapping entry, each exercise-type heuristic
 * branch via representative slugs from the real vendored dataset, override
 * precedence, enum-validation build failure, deterministic output hash.
 *
 * Reads the real committed `data/free-exercise-db/exercises.json` +
 * `data/curation/overrides.json` (same pattern as
 * `src/domain/__tests__/curation.test.ts`) so heuristic-branch tests exercise
 * genuine dataset records, not hand-rolled fixtures — per the task brief,
 * "each heuristic branch via representative slugs" means real ids that
 * actually hit that branch today.
 *
 * One exception: heuristic rule 8 ("wall sit"/weighted hold ->
 * `weight_duration`) has **no matching record anywhere in the real 873-row
 * dataset** (verified at implementation time — no id/name contains "wall
 * sit" or "weighted hold"). That branch is tested with a synthetic
 * `SourceExerciseRecord` instead, called out explicitly below; every other
 * branch uses a real id.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseCurationOverrides } from '../curation';
import {
  EQUIPMENT_MAP,
  MUSCLE_MAP,
  assertValidDataset,
  buildExerciseDataset,
  buildMappedExercise,
  classifyExerciseType,
  classifyExerciseTypeHeuristic,
  computeDatasetHash,
  mapEquipment,
  mapImageAssetKeys,
  mapMuscle,
  mapPrimaryMuscleGroup,
  mapSecondaryMuscleGroups,
  validateMappedRecord,
  type MappedExerciseRecord,
  type SourceExerciseRecord,
} from '../exercise-mapping';

const SOURCE_PATH = path.join(__dirname, '../../../data/free-exercise-db/exercises.json');
const OVERRIDES_PATH = path.join(__dirname, '../../../data/curation/overrides.json');

const sourceRecords: SourceExerciseRecord[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));
const curation = parseCurationOverrides(JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')));

const byId = new Map(sourceRecords.map((r) => [r.id, r]));

function requireSource(id: string): SourceExerciseRecord {
  const record = byId.get(id);
  if (!record) throw new Error(`fixture assumption broken: "${id}" not in vendored dataset`);
  return record;
}

function makeSource(overrides: Partial<SourceExerciseRecord>): SourceExerciseRecord {
  return {
    id: 'Synthetic_Id',
    name: 'Synthetic Exercise',
    force: null,
    level: 'beginner',
    mechanic: null,
    equipment: null,
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    instructions: ['Step one.'],
    category: 'strength',
    images: [],
    ...overrides,
  };
}

describe('vendored dataset sanity (fixture assumptions)', () => {
  it('has 873 records', () => {
    expect(sourceRecords.length).toBe(873);
  });
});

// ---------------------------------------------------------------------------
// Muscle map — every entry (03 §6.3)
// ---------------------------------------------------------------------------

describe('MUSCLE_MAP — every entry (03 §6.3)', () => {
  const expected: Record<string, string> = {
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

  it('maps exactly the 17 source muscle strings the doc specifies', () => {
    expect(Object.keys(MUSCLE_MAP).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [source, kyro] of Object.entries(expected)) {
    it(`"${source}" -> "${kyro}"`, () => {
      expect(mapMuscle(source)).toBe(kyro);
    });
  }

  it('unrecognized source string -> undefined (caller falls back to "other")', () => {
    expect(mapMuscle('not-a-real-muscle')).toBeUndefined();
  });
});

describe('mapPrimaryMuscleGroup (03 §6.3)', () => {
  it('primaryMuscles[0] via the muscle map', () => {
    const source = makeSource({ category: 'strength', primaryMuscles: ['lower back'] });
    expect(mapPrimaryMuscleGroup(source)).toBe('lower_back');
  });

  it('category=cardio -> "cardio" regardless of primaryMuscles', () => {
    const source = makeSource({ category: 'cardio', primaryMuscles: ['quadriceps'] });
    expect(mapPrimaryMuscleGroup(source)).toBe('cardio');
  });

  it('missing primaryMuscles[0] -> "other"', () => {
    const source = makeSource({ category: 'strength', primaryMuscles: [] });
    expect(mapPrimaryMuscleGroup(source)).toBe('other');
  });

  it('unrecognized primaryMuscles[0] string -> "other"', () => {
    const source = makeSource({ category: 'strength', primaryMuscles: ['not-a-real-muscle'] });
    expect(mapPrimaryMuscleGroup(source)).toBe('other');
  });

  it('real record: 3_4_Sit-Up -> abdominals', () => {
    expect(mapPrimaryMuscleGroup(requireSource('3_4_Sit-Up'))).toBe('abdominals');
  });

  it('real record: Running_Treadmill (category=cardio) -> cardio', () => {
    expect(mapPrimaryMuscleGroup(requireSource('Running_Treadmill'))).toBe('cardio');
  });
});

describe('mapSecondaryMuscleGroups (03 §6.3)', () => {
  it('combines remaining primaryMuscles[1..] + secondaryMuscles, mapped', () => {
    const source = makeSource({
      primaryMuscles: ['chest', 'triceps'],
      secondaryMuscles: ['shoulders'],
    });
    expect(mapSecondaryMuscleGroups(source, 'chest')).toEqual(['triceps', 'shoulders']);
  });

  it('dedupes and excludes the primary', () => {
    const source = makeSource({
      primaryMuscles: ['chest', 'triceps', 'chest'],
      secondaryMuscles: ['triceps', 'shoulders'],
    });
    expect(mapSecondaryMuscleGroups(source, 'chest')).toEqual(['triceps', 'shoulders']);
  });

  it('drops unrecognized muscle strings silently', () => {
    const source = makeSource({
      primaryMuscles: ['chest'],
      secondaryMuscles: ['not-a-real-muscle', 'triceps'],
    });
    expect(mapSecondaryMuscleGroups(source, 'chest')).toEqual(['triceps']);
  });

  it('empty when there are no secondaries', () => {
    const source = makeSource({ primaryMuscles: ['chest'], secondaryMuscles: [] });
    expect(mapSecondaryMuscleGroups(source, 'chest')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Equipment map — every entry (03 §6.3)
// ---------------------------------------------------------------------------

describe('EQUIPMENT_MAP — every entry (03 §6.3)', () => {
  const expected: Record<string, string> = {
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

  it('maps exactly the source equipment strings the doc specifies', () => {
    expect(Object.keys(EQUIPMENT_MAP).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [source, kyro] of Object.entries(expected)) {
    it(`"${source}" -> "${kyro}"`, () => {
      expect(mapEquipment(source)).toBe(kyro);
    });
  }

  it('null -> "none"', () => {
    expect(mapEquipment(null)).toBe('none');
  });

  it('is case-insensitive', () => {
    expect(mapEquipment('Barbell')).toBe('barbell');
    expect(mapEquipment('BODY ONLY')).toBe('none');
  });

  it('unrecognized non-null equipment string falls back to "other"', () => {
    expect(mapEquipment('some-future-equipment')).toBe('other');
  });

  it('real record: Kettlebell_Pistol_Squat equipment field is the literal plural "kettlebells"', () => {
    // Confirms the map's key matches the vendored dataset's actual raw string
    // (spec text reads singular "kettlebell", the real source data is plural).
    expect(requireSource('Kettlebell_Pistol_Squat').equipment).toBe('kettlebells');
    expect(mapEquipment(requireSource('Kettlebell_Pistol_Squat').equipment)).toBe('kettlebell');
  });

  it('real record: Face_Pull (cable) -> machine', () => {
    expect(mapEquipment(requireSource('Face_Pull').equipment)).toBe('machine');
  });

  it('real record: Lying_Close-Grip_Barbell_Triceps_Press_To_Chin (e-z curl bar) -> barbell', () => {
    expect(
      mapEquipment(requireSource('Lying_Close-Grip_Barbell_Triceps_Press_To_Chin').equipment),
    ).toBe('barbell');
  });
});

// ---------------------------------------------------------------------------
// Exercise-type heuristic — each of the 9 branches, real slugs where the
// dataset has one (03 §6.3 / 08 §4.7).
// ---------------------------------------------------------------------------

describe('classifyExerciseTypeHeuristic — 9 branches (03 §6.3)', () => {
  it('rule 2: category=cardio + name matches run/row/bike/elliptical/ski/swim -> distance_duration (Running_Treadmill)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Running_Treadmill'))).toBe(
      'distance_duration',
    );
  });

  it('rule 2: Rowing_Stationary -> distance_duration', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Rowing_Stationary'))).toBe(
      'distance_duration',
    );
  });

  it('rule 2: Elliptical_Trainer -> distance_duration', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Elliptical_Trainer'))).toBe(
      'distance_duration',
    );
  });

  it('rule 3: category=cardio, no distance keyword -> duration (Stairmaster)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Stairmaster'))).toBe('duration');
  });

  it('rule 3: category=stretching -> duration (Calf_Stretch_Elbows_Against_Wall)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Calf_Stretch_Elbows_Against_Wall'))).toBe(
      'duration',
    );
  });

  it('rule 4: equipment=body only + name matches plank -> duration (Plank)', () => {
    const plank = requireSource('Plank');
    expect(plank.equipment).toBe('body only');
    expect(classifyExerciseTypeHeuristic(plank)).toBe('duration');
  });

  it('rule 5: equipment=body only + name matches chin-up -> bodyweight_reps (Chin-Up)', () => {
    const chinUp = requireSource('Chin-Up');
    expect(chinUp.equipment).toBe('body only');
    expect(classifyExerciseTypeHeuristic(chinUp)).toBe('bodyweight_reps');
  });

  it('rule 5: equipment=body only + name matches pull-up -> bodyweight_reps (Pullups)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Pullups'))).toBe('bodyweight_reps');
  });

  it('rule 5: "assisted" pull-up -> bodyweight_assisted_reps (Band_Assisted_Pull-Up)', () => {
    const assisted = requireSource('Band_Assisted_Pull-Up');
    // Real dataset detail: this is tagged equipment "other" (the band is the
    // assisting apparatus), not "body only" — the assisted branch still
    // fires on the name pattern per 03 §6.3 rule 5's "assisted" clause.
    expect(assisted.equipment).toBe('other');
    expect(classifyExerciseTypeHeuristic(assisted)).toBe('bodyweight_assisted_reps');
  });

  it('rule 6: equipment=body only, no rule-4/5 keyword -> reps_only (Sit-Up)', () => {
    const situp = requireSource('Sit-Up');
    expect(situp.equipment).toBe('body only');
    expect(classifyExerciseTypeHeuristic(situp)).toBe('reps_only');
  });

  it('rule 7: name matches farmer -> short_distance_weight (Farmers_Walk)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Farmers_Walk'))).toBe(
      'short_distance_weight',
    );
  });

  it('rule 7: name matches yoke -> short_distance_weight (Yoke_Walk)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Yoke_Walk'))).toBe(
      'short_distance_weight',
    );
  });

  it('rule 7: name matches sled -> short_distance_weight (Sled_Push)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Sled_Push'))).toBe(
      'short_distance_weight',
    );
  });

  // Rule 8 has no matching record anywhere in the real 873-row vendored
  // dataset (verified: no id/name contains "wall sit" or "weighted hold") —
  // tested with a synthetic record instead of a real slug, the sole
  // exception among the 9 branches.
  it('rule 8: name matches "wall sit" -> weight_duration (synthetic — no real dataset match exists)', () => {
    const wallSit = makeSource({
      id: 'Wall_Sit_Synthetic',
      name: 'Wall Sit',
      equipment: 'other',
      category: 'strength',
    });
    expect(classifyExerciseTypeHeuristic(wallSit)).toBe('weight_duration');
  });

  it('rule 8: name matches "weighted hold" -> weight_duration (synthetic)', () => {
    const weightedHold = makeSource({
      id: 'Weighted_Hold_Synthetic',
      name: 'Weighted Hold',
      equipment: 'other',
      category: 'strength',
    });
    expect(classifyExerciseTypeHeuristic(weightedHold)).toBe('weight_duration');
  });

  it('rule 9: default -> weight_reps (Barbell_Bench_Press_-_Medium_Grip)', () => {
    expect(classifyExerciseTypeHeuristic(requireSource('Barbell_Bench_Press_-_Medium_Grip'))).toBe(
      'weight_reps',
    );
  });
});

// ---------------------------------------------------------------------------
// Override precedence (03 §6.4 step 2 / 08 §4.7)
// ---------------------------------------------------------------------------

describe('override precedence — a real overrides.json entry changes the outcome', () => {
  it('Decline_Push-Up: heuristic alone would be reps_only (rule 6); override wins -> bodyweight_reps', () => {
    const source = requireSource('Decline_Push-Up');
    // Real dataset detail: this record's raw `equipment` is `null`, not the
    // literal string "body only" — the heuristic's rule 4-6 gate treats both
    // the same (both map to Kyro equipment "none"), see
    // `classifyExerciseTypeHeuristic`'s header comment.
    expect(source.equipment).toBeNull();
    // Heuristic-only (no override) sanity check on the same record:
    expect(classifyExerciseTypeHeuristic(source)).toBe('reps_only');

    const override = curation.overrides['Decline_Push-Up'];
    expect(override?.exercise_type).toBe('bodyweight_reps');
    expect(classifyExerciseType(source, override)).toBe('bodyweight_reps');
  });

  it('Handstand_Push-Ups: same precedence, different real id', () => {
    const source = requireSource('Handstand_Push-Ups');
    expect(classifyExerciseTypeHeuristic(source)).toBe('reps_only');
    const override = curation.overrides['Handstand_Push-Ups'];
    expect(classifyExerciseType(source, override)).toBe('bodyweight_reps');
  });

  it('Stairmaster: uses_custom_metric override applied, exercise_type still heuristic (no exercise_type key on that override)', () => {
    const source = requireSource('Stairmaster');
    const override = curation.overrides.Stairmaster;
    expect(override?.exercise_type).toBeUndefined();
    const mapped = buildMappedExercise(source, override, []);
    expect(mapped.exercise_type).toBe('duration');
    expect(mapped.uses_custom_metric).toBe(1);
  });

  it('no override present -> heuristic-only result unchanged', () => {
    const source = requireSource('Barbell_Bench_Press_-_Medium_Grip');
    expect(curation.overrides['Barbell_Bench_Press_-_Medium_Grip']).toBeUndefined();
    expect(classifyExerciseType(source, undefined)).toBe('weight_reps');
  });

  it('Push_Press: M1-11 instructions override replaces the source record\'s empty instructions[]', () => {
    const source = requireSource('Push_Press');
    expect(source.instructions).toEqual([]); // real vendored record ships with none
    const override = curation.overrides.Push_Press;
    expect(override?.instructions?.length).toBeGreaterThan(0);
    const mapped = buildMappedExercise(source, override, []);
    expect(mapped.instructions).toEqual(override?.instructions);
    expect(mapped.instructions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildMappedExercise / mapImageAssetKeys
// ---------------------------------------------------------------------------

describe('buildMappedExercise', () => {
  it('maps images[] to positional asset keys relative to assets/', () => {
    const source = requireSource('3_4_Sit-Up');
    expect(source.images).toHaveLength(2);
    expect(mapImageAssetKeys(source)).toEqual([
      'exercises/3_4_Sit-Up/0.jpg',
      'exercises/3_4_Sit-Up/1.jpg',
    ]);
  });

  it('is_custom is always 0', () => {
    const mapped = buildMappedExercise(requireSource('Plank'), undefined, []);
    expect(mapped.is_custom).toBe(0);
  });

  it('folds per-id override aliases + global aliases, deduped and sorted', () => {
    const source = requireSource('Barbell_Deadlift');
    const override = curation.overrides['Barbell_Deadlift']; // none seeded, but exercise fn signature still accepts extra aliases
    const mapped = buildMappedExercise(source, override, ['DL', 'dl']);
    expect(mapped.aliases).toEqual(['DL', 'dl']);
  });

  it('override name replaces the source name when present', () => {
    const source = requireSource('Plank');
    const mapped = buildMappedExercise(source, { name: 'Front Plank' }, []);
    expect(mapped.name).toBe('Front Plank');
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: buildExerciseDataset against the real committed files
// ---------------------------------------------------------------------------

describe('buildExerciseDataset — real committed data', () => {
  const { records, warnings } = buildExerciseDataset(sourceRecords, curation);

  it('maps every non-excluded source record (no excludes seeded yet, so 873)', () => {
    expect(records).toHaveLength(873);
  });

  it('output is sorted by id', () => {
    const ids = records.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it('every record passes hard-error validation (real dataset is clean)', () => {
    expect(() => assertValidDataset(records)).not.toThrow();
  });

  it('M1-11 curation pass fixed all 5 known real missing-instructions cases -> zero warnings today', () => {
    // M1-04's build first surfaced 5 real vendored records with an empty
    // instructions[] (Iron_Cross, One-Arm_Kettlebell_Swings, Push_Press,
    // Side_Bridge, Side_Jackknife — data/curation/curation-report.md). M1-11
    // triaged every one of them with a real `instructions` override (see
    // data/curation/README.md's "M1-11 curation pass" section), so the real
    // dataset produces zero missing-instructions warnings today.
    expect(warnings).toEqual([]);
  });

  it('still produces a missing-instructions warning for a record with no override (synthetic case)', () => {
    // Proves the warning mechanism itself still works post-fix — using a
    // synthetic curation file so this doesn't regress to a false-green test
    // once every real case above got an override.
    const noInstructionsSource = sourceRecords.find(
      (r) => r.instructions.length === 0 && !curation.overrides[r.id]?.instructions,
    );
    expect(noInstructionsSource).toBeUndefined(); // sanity: confirms the claim above — no real record is unfixed
    const synthetic = makeSource({ id: 'Synthetic_No_Instructions', instructions: [] });
    const { warnings: syntheticWarnings } = buildExerciseDataset([synthetic], {
      overrides: {},
      aliases: {},
    });
    expect(syntheticWarnings).toEqual(['Synthetic_No_Instructions: no instructions']);
  });

  it('drops excluded ids entirely (synthetic curation file)', () => {
    const { records: withExclude } = buildExerciseDataset(sourceRecords, {
      overrides: { Plank: { exclude: true } },
      aliases: {},
    });
    expect(withExclude.find((r) => r.id === 'Plank')).toBeUndefined();
    expect(withExclude).toHaveLength(872);
  });

  it('excluded override does not need to be internally consistent with other override fields', () => {
    // exclude:true is `.strict()`-schema-valid on its own (curation.ts already
    // covers this); here we just confirm the build drops it regardless of
    // heuristic outcome.
    const { records: withExclude } = buildExerciseDataset(sourceRecords, {
      overrides: { 'Sit-Up': { exclude: true } },
      aliases: {},
    });
    expect(withExclude.find((r) => r.id === 'Sit-Up')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Enum validation — hard failure (08 §4.7 "enum validation fails build on bad value")
// ---------------------------------------------------------------------------

describe('validateMappedRecord / assertValidDataset — enum validation build failure', () => {
  function validRecord(): MappedExerciseRecord {
    return buildMappedExercise(requireSource('Plank'), undefined, []);
  }

  it('a clean real-record mapping has zero errors', () => {
    expect(validateMappedRecord(validRecord())).toEqual([]);
  });

  it('illegal exercise_type is caught', () => {
    const bad = { ...validRecord(), exercise_type: 'not_a_real_type' } as unknown as MappedExerciseRecord;
    const errors = validateMappedRecord(bad);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/illegal exercise_type/);
  });

  it('illegal primary_muscle_group is caught', () => {
    const bad = {
      ...validRecord(),
      primary_muscle_group: 'not_a_real_muscle',
    } as unknown as MappedExerciseRecord;
    expect(validateMappedRecord(bad)[0]).toMatch(/illegal primary_muscle_group/);
  });

  it('illegal equipment is caught', () => {
    const bad = { ...validRecord(), equipment: 'not_a_real_equipment' } as unknown as MappedExerciseRecord;
    expect(validateMappedRecord(bad)[0]).toMatch(/illegal equipment/);
  });

  it('illegal secondary_muscle_groups entry is caught', () => {
    const bad = {
      ...validRecord(),
      secondary_muscle_groups: ['not_a_real_muscle'],
    } as unknown as MappedExerciseRecord;
    expect(validateMappedRecord(bad)[0]).toMatch(/illegal secondary_muscle_group/);
  });

  it('missing primary_muscle_group is caught', () => {
    const bad = { ...validRecord(), primary_muscle_group: '' } as unknown as MappedExerciseRecord;
    expect(validateMappedRecord(bad)[0]).toMatch(/missing primary_muscle_group/);
  });

  it('assertValidDataset throws (fails the build) when any record has an injected bad value', () => {
    const records = [validRecord(), { ...validRecord(), id: 'Bad_One', exercise_type: 'nonsense' } as unknown as MappedExerciseRecord];
    expect(() => assertValidDataset(records)).toThrow(/Bad_One/);
    expect(() => assertValidDataset(records)).toThrow(/illegal exercise_type/);
  });

  it('assertValidDataset does not throw for an all-valid array', () => {
    expect(() => assertValidDataset([validRecord()])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Deterministic output hash (08 §4.7)
// ---------------------------------------------------------------------------

describe('computeDatasetHash — determinism', () => {
  it('hashing the same records array twice produces the same hash', () => {
    const { records } = buildExerciseDataset(sourceRecords, curation);
    expect(computeDatasetHash(records)).toBe(computeDatasetHash(records));
  });

  it('building the full dataset twice from the same inputs produces the same hash', () => {
    const first = buildExerciseDataset(sourceRecords, curation);
    const second = buildExerciseDataset(sourceRecords, curation);
    expect(computeDatasetHash(first.records)).toBe(computeDatasetHash(second.records));
  });

  it('rebuilding from a freshly re-parsed copy of the source JSON (new object identities) still hashes identically', () => {
    const freshSource: SourceExerciseRecord[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'));
    const freshCuration = parseCurationOverrides(
      JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')),
    );
    const rebuilt = buildExerciseDataset(freshSource, freshCuration);
    const original = buildExerciseDataset(sourceRecords, curation);
    expect(computeDatasetHash(rebuilt.records)).toBe(computeDatasetHash(original.records));
  });

  it('a changed record produces a different hash', () => {
    const { records } = buildExerciseDataset(sourceRecords, curation);
    const mutated = records.map((r, i) => (i === 0 ? { ...r, name: r.name + ' (changed)' } : r));
    expect(computeDatasetHash(mutated)).not.toBe(computeDatasetHash(records));
  });

  it('input array order does not matter — buildExerciseDataset always sorts by id first', () => {
    const shuffled = [...sourceRecords].reverse();
    const a = buildExerciseDataset(sourceRecords, curation);
    const b = buildExerciseDataset(shuffled, curation);
    expect(computeDatasetHash(a.records)).toBe(computeDatasetHash(b.records));
  });
});
