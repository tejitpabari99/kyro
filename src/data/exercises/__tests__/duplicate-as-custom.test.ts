/**
 * Duplicate-as-Custom — repository-level integration test (M1-10
 * acceptance gate): "duplicate a real built-in like Barbell_Bench_Press,
 * confirm the resulting custom has the right prefilled data and is
 * independently editable without affecting the original built-in."
 *
 * The UI-level prefill hand-off (`exercise-form-prefill.ts`'s in-memory
 * store, `ExerciseDetailScreen`'s ⋯ menu) has its own dedicated tests
 * (`src/features/exercises/__tests__/ExerciseDetailScreen.actions.test.tsx`,
 * `.../exercise-form-prefill.test.ts`, `ExerciseFormScreen.test.tsx`'s
 * prefill case). This file proves the *data-layer* half of the guarantee
 * against the real, migrated schema + the real vendored dataset (same
 * `better-sqlite3`/real-driver approach `exercise-repository.test.ts`,
 * M1-06, already established) — a real built-in seeded via
 * `seedBuiltinExercises`, duplicated through the exact field set the UI
 * layer would build, then edited and reloaded to prove independence.
 */
import { BUNDLED_EXERCISE_DATASET } from '../seed-builtins';
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { ExerciseRepositoryImpl } from '../exercise-repository';

const BUILTIN_ID = 'Barbell_Bench_Press_-_Medium_Grip';

describe('Duplicate as Custom — data-layer integration (M1-10, real dataset + real driver)', () => {
  let driver: SqliteDriver;
  let repo: ExerciseRepositoryImpl;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new ExerciseRepositoryImpl(driver);
    await repo.seedBuiltins(BUNDLED_EXERCISE_DATASET.exercises, BUNDLED_EXERCISE_DATASET.version);
  });

  afterEach(() => {
    driver.close();
  });

  it('produces an editable custom prefilled from the real built-in, without mutating the original', async () => {
    const builtin = await repo.get(BUILTIN_ID);
    expect(builtin).not.toBeNull();
    if (!builtin) throw new Error('unreachable');

    // Exactly the field set `ExerciseDetailScreen.handleDuplicateAsCustom`
    // (M1-10) builds from a built-in's data.
    const duplicate = await repo.create({
      name: `${builtin.name} (Copy)`,
      exerciseType: builtin.exerciseType,
      primaryMuscleGroup: builtin.primaryMuscleGroup,
      secondaryMuscleGroups: builtin.secondaryMuscleGroups,
      equipment: builtin.equipment,
      instructions: builtin.instructions,
      usesCustomMetric: builtin.usesCustomMetric,
    });

    expect(duplicate.isCustom).toBe(true);
    expect(duplicate.id).not.toBe(builtin.id);
    expect(duplicate.name).toBe('Barbell Bench Press - Medium Grip (Copy)');
    expect(duplicate.exerciseType).toBe(builtin.exerciseType);
    expect(duplicate.primaryMuscleGroup).toBe(builtin.primaryMuscleGroup);
    expect(duplicate.secondaryMuscleGroups).toEqual(builtin.secondaryMuscleGroups);
    expect(duplicate.equipment).toBe(builtin.equipment);
    expect(duplicate.instructions).toEqual(builtin.instructions);

    // Independently editable: a patch to the copy must not require any
    // built-in-only carve-out (unlike `update` on the built-in itself,
    // which would throw `BuiltinExerciseImmutableError`).
    const edited = await repo.update(duplicate.id, {
      name: 'My Bench Variant',
      equipment: 'dumbbell',
    });
    expect(edited.name).toBe('My Bench Variant');
    expect(edited.equipment).toBe('dumbbell');

    // Reload both rows fresh from the DB: the edit stuck on the copy, and
    // the original built-in is completely untouched.
    const reloadedDuplicate = await repo.get(duplicate.id);
    expect(reloadedDuplicate?.name).toBe('My Bench Variant');
    expect(reloadedDuplicate?.equipment).toBe('dumbbell');

    const reloadedBuiltin = await repo.get(builtin.id);
    expect(reloadedBuiltin?.name).toBe(builtin.name);
    expect(reloadedBuiltin?.equipment).toBe(builtin.equipment);
    expect(reloadedBuiltin?.isCustom).toBe(false);
  });

  it('rejects a duplicate whose generated name collides with an existing active exercise, case-insensitively', async () => {
    const builtin = await repo.get(BUILTIN_ID);
    if (!builtin) throw new Error('unreachable');
    const copyName = `${builtin.name} (Copy)`;
    await repo.create({
      name: copyName,
      exerciseType: builtin.exerciseType,
      primaryMuscleGroup: builtin.primaryMuscleGroup,
    });

    await expect(
      repo.create({
        name: copyName.toUpperCase(),
        exerciseType: builtin.exerciseType,
        primaryMuscleGroup: builtin.primaryMuscleGroup,
      }),
    ).rejects.toThrow(/already exists/);
  });
});
