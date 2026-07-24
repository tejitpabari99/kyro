/**
 * "20-minute logging drill" scripted equivalent (M2-19 exit gate, 08 §7):
 * "20-minute real gym session (or simulated) logging 5 exercises incl.
 * superset, drop set, warm-ups, RPE — zero data errors, zero mistaps caused
 * by layout."
 *
 * The "real gym session" / interactive-typing-speed half of that drill isn't
 * executable headless (no simulator/device, `docs/plan/BLOCKERS.md`) — there
 * is no way to prove "zero mistaps caused by layout" without a human tapping
 * a real rendered screen. What **is** provable here is the logic half: this
 * test drives the real `activeWorkoutStore` + real `WorkoutRepositoryImpl`
 * (real `better-sqlite3`, never mocked, matching every other integration
 * suite in this codebase, 08 §5) through a realistic 5-exercise session —
 * a superset, a drop set, warm-up sets, and RPE all included, exactly the
 * drill's own ingredient list — then asserts the final DB state has zero
 * data corruption/mismatch: correct set counts, correct types, correct
 * superset grouping, correct positions, and a volume total that survives
 * the full store -> repo -> SQLite -> read-back round-trip unchanged.
 *
 * This complements, not duplicates, the two suites already covering
 * adjacent ground: `activeWorkoutStore.crash-safety.test.ts` (M2-03, 08
 * §4.9) proves the store survives *random* action sequences + kill/rehydrate;
 * this test proves one *deliberate, realistic* session — the exact shape
 *08 §7's drill describes — round-trips with zero data errors.
 */
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import type { ExerciseType } from '@/domain/enums';
import { totalVolumeKg, type VolumeSetInput } from '@/domain/volume';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';

import { createActiveWorkoutStore } from '../activeWorkoutStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

function insertExercise(driver: SqliteDriver, id: string, name: string, exerciseType: ExerciseType): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, name, exerciseType, now, now],
  );
  return id;
}

describe('20-minute logging drill — scripted equivalent (M2-19, 08 §7)', () => {
  it('a realistic 5-exercise session (superset, drop set, warm-ups, RPE) round-trips through finish() with zero data errors', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const benchId = insertExercise(driver, 'ex-bench', 'Bench Press', 'weight_reps');
    const rowId = insertExercise(driver, 'ex-row', 'Cable Row', 'weight_reps');
    const squatId = insertExercise(driver, 'ex-squat', 'Squat', 'weight_reps');
    const curlId = insertExercise(driver, 'ex-curl', 'Bicep Curl', 'weight_reps');
    const plankId = insertExercise(driver, 'ex-plank', 'Plank', 'duration');
    const repository = new WorkoutRepositoryImpl(driver, {});

    const store = createActiveWorkoutStore();
    await store.getState().rehydrate(repository);
    await store.getState().startEmpty({ title: 'Logging Drill', startTime: Date.now() });

    // --- Add all 5 exercises, in session order --------------------------
    const [bench, row, squat, curl, plank] = await store
      .getState()
      .addExercises([
        { exerciseId: benchId },
        { exerciseId: rowId },
        { exerciseId: squatId },
        { exerciseId: curlId },
        { exerciseId: plankId },
      ]);

    // Each `addExercises` item pre-creates one empty normal set (no prior
    // history in this fresh DB) — remove those before building the real
    // session's own rows explicitly, so every set below is one this test
    // intentionally created (no incidental leftover row to lose track of).
    for (const workoutExercise of [bench!, row!, squat!, curl!, plank!]) {
      for (const s of workoutExercise.sets) {
        await store.getState().removeSet(s.id);
      }
    }

    // --- 1. Bench Press <-> Cable Row superset (M2-12, 02 §8) ------------
    const supersetGroupId = Math.min(bench!.position, row!.position);
    await store.getState().updateExercise(bench!.id, { supersetId: supersetGroupId });
    await store.getState().updateExercise(row!.id, { supersetId: supersetGroupId });

    // --- 2. Bench Press: 2 warm-up sets (M2-16), then 3 working sets with
    //        RPE (M2-07) -----------------------------------------------
    await store.getState().addWarmUpSets(bench!.id, [
      { setType: 'warmup', weightKg: 20, reps: 10 },
      { setType: 'warmup', weightKg: 40, reps: 8 },
    ]);
    const benchWorking: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await store.getState().addSet(bench!.id, { weightKg: 60, reps: 8, rpe: 7.5 });
      benchWorking.push(s!.id);
    }
    // Check every Bench Press row (warm-ups included — a real user checks
    // warm-up sets too; `finish()` drops *any* unchecked row regardless of
    // type, so an unchecked warm-up would vanish just like an unchecked
    // working set).
    const benchAfterAdds = (await repository.getFull(store.getState().workout!.id))!.exercises.find(
      (e) => e.id === bench!.id,
    )!;
    for (const s of benchAfterAdds.sets) {
      await store.getState().setCompleted(s.id, true);
    }

    // --- 3. Cable Row: 3 plain working sets, no warm-ups/RPE this time --
    for (let i = 0; i < 3; i++) {
      const s = await store.getState().addSet(row!.id, { weightKg: 50, reps: 10 });
      await store.getState().setCompleted(s!.id, true);
    }

    // --- 4. Squat: 3 working sets + 1 drop set (M2-06/M2-07) -------------
    for (let i = 0; i < 3; i++) {
      const s = await store.getState().addSet(squat!.id, { weightKg: 100, reps: 8 });
      await store.getState().setCompleted(s!.id, true);
    }
    const squatDrop = await store.getState().addSet(squat!.id, {
      setType: 'dropset',
      weightKg: 70,
      reps: 12,
    });
    await store.getState().setCompleted(squatDrop!.id, true);

    // --- 5. Bicep Curl: 2 checked sets + 1 left UNCHECKED (the realistic
    //        "ran out of time, forgot to tap check" case finish() must
    //        drop cleanly without touching the other two) -----------------
    for (let i = 0; i < 2; i++) {
      const s = await store.getState().addSet(curl!.id, { weightKg: 15, reps: 10 });
      await store.getState().setCompleted(s!.id, true);
    }
    await store.getState().addSet(curl!.id, { weightKg: 15, reps: 10 }); // left unchecked, intentionally

    // --- 6. Plank: 2 duration sets (no weight/reps at all) ---------------
    for (const durationSeconds of [45, 60]) {
      const s = await store.getState().addSet(plank!.id, { durationSeconds });
      await store.getState().setCompleted(s!.id, true);
    }

    // --- Finish -----------------------------------------------------------
    const finished = await store.getState().finish({});
    expect(finished).not.toBeNull();
    expect(store.getState().workout).toBeNull();

    const saved = (await repository.getFull(finished!.id))!;
    expect(saved.state).toBe('completed');

    // Zero data errors #1: exactly the 5 exercises logged survive, in
    // session order (contiguous 0-based positions, no gaps/dupes).
    expect(saved.exercises).toHaveLength(5);
    expect(saved.exercises.map((e) => e.position)).toEqual([0, 1, 2, 3, 4]);
    const byExerciseId = new Map(saved.exercises.map((e) => [e.exerciseId, e]));

    // Zero data errors #2: superset grouping survived the finish()
    // renumber/drop pass intact and only on the two intended members.
    const savedBench = byExerciseId.get(benchId)!;
    const savedRow = byExerciseId.get(rowId)!;
    expect(savedBench.supersetId).not.toBeNull();
    expect(savedBench.supersetId).toBe(savedRow.supersetId);
    expect(byExerciseId.get(squatId)!.supersetId).toBeNull();
    expect(byExerciseId.get(curlId)!.supersetId).toBeNull();
    expect(byExerciseId.get(plankId)!.supersetId).toBeNull();

    // Zero data errors #3: Bench Press kept its 2 warm-ups + 3 working sets,
    // in position order, warm-ups first, every RPE value intact.
    expect(savedBench.sets).toHaveLength(5);
    expect(savedBench.sets.map((s) => s.setType)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'normal']);
    expect(savedBench.sets.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);
    expect(savedBench.sets.slice(0, 2).map((s) => s.weightKg)).toEqual([20, 40]);
    expect(savedBench.sets.slice(2).every((s) => s.rpe === 7.5)).toBe(true);
    expect(savedBench.sets.every((s) => s.isCompleted)).toBe(true);

    // Zero data errors #4: Squat's drop set survived as the last row with
    // the right type + values, not merged/reordered into a normal set.
    const savedSquat = byExerciseId.get(squatId)!;
    expect(savedSquat.sets).toHaveLength(4);
    expect(savedSquat.sets.map((s) => s.setType)).toEqual(['normal', 'normal', 'normal', 'dropset']);
    expect(savedSquat.sets[3]!.weightKg).toBe(70);
    expect(savedSquat.sets[3]!.reps).toBe(12);

    // Zero data errors #5: Bicep Curl's unchecked 3rd set was dropped and
    // the other two renumbered contiguously — not silently kept, not
    // taking a checked sibling down with it.
    const savedCurl = byExerciseId.get(curlId)!;
    expect(savedCurl.sets).toHaveLength(2);
    expect(savedCurl.sets.map((s) => s.position)).toEqual([0, 1]);
    expect(savedCurl.sets.every((s) => s.isCompleted)).toBe(true);

    // Zero data errors #6: Plank's duration-only sets kept their duration
    // and never picked up a stray weight/reps value.
    const savedPlank = byExerciseId.get(plankId)!;
    expect(savedPlank.sets.map((s) => s.durationSeconds)).toEqual([45, 60]);
    expect(savedPlank.sets.every((s) => s.weightKg === null && s.reps === null)).toBe(true);

    // Zero data errors #7: no stray unchecked rows survived *anywhere* in
    // the saved workout (finish() is a whole-workout delete, 05 §6).
    const allSavedSets = saved.exercises.flatMap((e) => e.sets);
    expect(allSavedSets.every((s) => s.isCompleted)).toBe(true);
    expect(allSavedSets).toHaveLength(5 + 3 + 4 + 2 + 2); // bench + row + squat + curl + plank

    // Zero data errors #8: the volume computed from what was *saved* to SQLite
    // exactly matches the volume computed from what this test *intended* to
    // log — proving no silent numeric drift anywhere across the
    // store -> repo -> SQLite -> read-back pipeline. (`domain/volume.ts`'s
    // own math is already unit-tested per 08 §4.2 — this is a pipeline
    // fidelity check, not a re-test of that formula.)
    const intended: VolumeSetInput[] = [
      // Bench: 2 warm-ups + 3 working, all checked.
      { exerciseType: 'weight_reps', setType: 'warmup', weightKg: 20, reps: 10, isCompleted: true },
      { exerciseType: 'weight_reps', setType: 'warmup', weightKg: 40, reps: 8, isCompleted: true },
      ...Array.from({ length: 3 }, () => ({
        exerciseType: 'weight_reps' as const,
        setType: 'normal' as const,
        weightKg: 60,
        reps: 8,
        isCompleted: true,
      })),
      // Cable Row: 3 working, all checked.
      ...Array.from({ length: 3 }, () => ({
        exerciseType: 'weight_reps' as const,
        setType: 'normal' as const,
        weightKg: 50,
        reps: 10,
        isCompleted: true,
      })),
      // Squat: 3 working + 1 drop, all checked.
      ...Array.from({ length: 3 }, () => ({
        exerciseType: 'weight_reps' as const,
        setType: 'normal' as const,
        weightKg: 100,
        reps: 8,
        isCompleted: true,
      })),
      { exerciseType: 'weight_reps', setType: 'dropset', weightKg: 70, reps: 12, isCompleted: true },
      // Bicep Curl: only the 2 checked sets count (unchecked 3rd never
      // logs any volume at all, checked or not — it was discarded).
      ...Array.from({ length: 2 }, () => ({
        exerciseType: 'weight_reps' as const,
        setType: 'normal' as const,
        weightKg: 15,
        reps: 10,
        isCompleted: true,
      })),
      // Plank: duration-type sets always contribute 0 (08 §4.2).
      { exerciseType: 'duration', setType: 'normal', weightKg: null, reps: null, isCompleted: true },
      { exerciseType: 'duration', setType: 'normal', weightKg: null, reps: null, isCompleted: true },
    ];
    const expectedVolumeKg = totalVolumeKg(intended, /* warmupInStats */ true);
    expect(expectedVolumeKg).toBe(7000); // 520 (warm-ups) + 1440 (bench) + 1500 (row) + 2400 (squat) + 840 (drop) + 300 (curl)

    const roundTripped: VolumeSetInput[] = allSavedSets.map((s) => {
      const exercise = saved.exercises.find((e) => e.sets.some((set) => set.id === s.id))!;
      return {
        exerciseType: exercise.exerciseId === plankId ? 'duration' : 'weight_reps',
        setType: s.setType,
        weightKg: s.weightKg,
        reps: s.reps,
        isCompleted: s.isCompleted,
      };
    });
    expect(totalVolumeKg(roundTripped, true)).toBe(expectedVolumeKg);

    driver.close();
  });
});
