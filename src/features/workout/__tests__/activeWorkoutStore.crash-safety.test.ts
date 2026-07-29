/**
 * `activeWorkoutStore` kill-simulation suite (M2-03 acceptance gate, 08
 * §4.9): "perform N random valid actions (property-style, seeded), drop the
 * store, rehydrate from repo -> deep-equal state. Run with 100 seeds."
 *
 * Each seed drives a fresh `createActiveWorkoutStore()` instance through a
 * deterministically-generated sequence of valid store actions (a seeded
 * `mulberry32` PRNG — no external dependency needed for this), against a
 * real `WorkoutRepositoryImpl`/`better-sqlite3` backend (never mocked, 08
 * §5). "Drop the store" = simply stop using that JS object and construct a
 * brand-new one (`createActiveWorkoutStore()` again) bound to the *same*
 * repository/DB — nothing shared in memory between the two, exactly the
 * `settingsStore` "survives relaunch" test's own shape
 * (`settings-store.test.ts`), applied here as the crash-safety property
 * check: if the DB (not the JS store) is truly the durable copy, a freshly
 * rehydrated store must reconstruct the *exact* same draft the "live" store
 * ended up with.
 *
 * **M2-19 exit-gate update:** `runRandomAction`'s candidate list originally
 * only covered the M2-03-era action set (lifecycle, exercise CRUD/reorder,
 * set CRUD/check). The M2-19 milestone gate's task text specifically calls
 * for re-confirming this suite "genuinely exercises the finish/discard/
 * check/uncheck action set added across later M2 tasks (M2-07 through
 * M2-17), not just the original M2-03-era action set" — it did not:
 * `updateExercise`'s `supersetId` field (M2-12 "Add to Superset"),
 * `removeFromSuperset` (M2-12), `addWarmUpSets` (M2-16), and `updateSet`'s
 * `rpe` field (M2-07) were all real store actions/fields with zero
 * crash-safety coverage. All four are core mid-session logging actions (not
 * settings toggles), so this pass added them to the generator rather than
 * just flagging the gap — see `docs/qa/M2-checklist.md` §3 for the writeup.
 */
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { RPE_VALUES, SET_TYPE_VALUES, type SetType } from '@/domain/enums';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';

import { createActiveWorkoutStore } from '../activeWorkoutStore';

// See `activeWorkoutStore.test.ts` for why `@sentry/react-native` is
// mocked wholesale even though nothing here asserts on it directly: the
// store imports `@/lib/sentry`, and the real SDK registers a leaking
// `setInterval` at module-load time otherwise (M0-11's
// `error-reporting.test.ts` established this same mock).
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Deterministic PRNG + small random-value helpers
// ---------------------------------------------------------------------------

/** mulberry32 — a tiny, deterministic, seedable PRNG (public-domain algorithm). Same seed -> same sequence forever, which is exactly what "100 seeded runs" needs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function insertExercise(driver: SqliteDriver, id: string): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, id, now, now],
  );
  return id;
}

// ---------------------------------------------------------------------------
// One random valid store action, chosen among whatever is currently valid
// given the store's own draft (mirrors a real user's always-consistent
// stream of taps — never an out-of-thin-air invalid id).
// ---------------------------------------------------------------------------

async function runRandomAction(
  store: ReturnType<typeof createActiveWorkoutStore>,
  rng: () => number,
  exercisePool: readonly string[],
): Promise<void> {
  const workout = store.getState().workout;
  if (!workout) {
    return;
  }

  const candidates: (() => Promise<unknown>)[] = [
    async () =>
      store.getState().updateMeta({
        title: `Workout ${randInt(rng, 1, 1000)}`,
        durationPauseOffsetMs: randInt(rng, 0, 60_000),
      }),
  ];

  if (workout.exercises.length < 4) {
    candidates.push(async () => store.getState().addExercises([{ exerciseId: pick(rng, exercisePool) }]));
  }

  if (workout.exercises.length > 0) {
    candidates.push(async () => store.getState().addSet(pick(rng, workout.exercises).id));

    candidates.push(async () =>
      store.getState().updateExercise(pick(rng, workout.exercises).id, {
        notes: rng() > 0.5 ? `note ${randInt(rng, 1, 999)}` : null,
        restSeconds: rng() > 0.5 ? randInt(rng, 15, 180) : null,
      }),
    );

    candidates.push(async () =>
      store.getState().replaceExercise(pick(rng, workout.exercises).id, pick(rng, exercisePool)),
    );

    candidates.push(async () => store.getState().removeExercise(pick(rng, workout.exercises).id));

    if (workout.exercises.length >= 2) {
      candidates.push(async () => {
        const shuffled = [...workout.exercises]
          .map((exercise) => ({ exercise, sortKey: rng() }))
          .sort((a, b) => a.sortKey - b.sortKey)
          .map(({ exercise }) => exercise.id);
        return store.getState().reorderExercises(shuffled);
      });

      // M2-12 "Add to Superset": group two distinct exercises under a
      // shared `supersetId` via `updateExercise`'s patch — found missing
      // from this suite's action set during M2-19's exit-gate re-trace
      // (08 §4.9 asks this suite to cover "every store action", and
      // `supersetId` is a real `UpdateExerciseInput` field a live user
      // reaches through the superset sheet mid-session, not a settings
      // toggle). The exact id value doesn't need to mirror the real UI's
      // min-position-derived minting rule — only that an arbitrary shared
      // int round-trips through drop-and-rehydrate like every other field.
      candidates.push(async () => {
        const [a, b] = [...workout.exercises]
          .map((exercise) => ({ exercise, sortKey: rng() }))
          .sort((x, y) => x.sortKey - y.sortKey)
          .slice(0, 2)
          .map(({ exercise }) => exercise.id);
        const groupId = randInt(rng, 1, 3);
        await store.getState().updateExercise(a!, { supersetId: groupId });
        return store.getState().updateExercise(b!, { supersetId: groupId });
      });
    }

    // M2-12 "Remove from Superset" — exercises the dedicated
    // `removeFromSuperset` action (dissolution included), which the prior
    // version of this generator never called at all. Also exercised
    // against ungrouped exercises (the store's own no-op branch).
    candidates.push(async () => store.getState().removeFromSuperset(pick(rng, workout.exercises).id));

    // M2-16 "Add Warm-Up Sets" — `addWarmUpSets` inserts rows above an
    // exercise's existing sets and renumbers siblings; also missing from
    // this suite's action set until this pass.
    candidates.push(async () => {
      const exercise = pick(rng, workout.exercises);
      const rowCount = randInt(rng, 1, 3);
      const rows = Array.from({ length: rowCount }, () => ({
        setType: 'warmup' as SetType,
        weightKg: randInt(rng, 0, 100),
        reps: randInt(rng, 1, 15),
      }));
      return store.getState().addWarmUpSets(exercise.id, rows);
    });

    const exercisesWithSets = workout.exercises.filter((exercise) => exercise.sets.length > 0);
    if (exercisesWithSets.length > 0) {
      candidates.push(async () => {
        const set = pick(rng, pick(rng, exercisesWithSets).sets);
        return store.getState().updateSet(set.id, {
          weightKg: randInt(rng, 0, 200),
          reps: randInt(rng, 1, 20),
          // RPE (M2-07) — a real `UpdateSetInput` field with its own
          // rehydrate round-trip to prove, previously never exercised here.
          rpe: rng() > 0.5 ? pick(rng, RPE_VALUES) : null,
        });
      });
      candidates.push(async () => {
        const set = pick(rng, pick(rng, exercisesWithSets).sets);
        return store.getState().setCompleted(set.id, rng() > 0.5);
      });
      candidates.push(async () => {
        const set = pick(rng, pick(rng, exercisesWithSets).sets);
        return store.getState().setSetType(set.id, pick(rng, SET_TYPE_VALUES) as SetType);
      });
      candidates.push(async () => {
        const set = pick(rng, pick(rng, exercisesWithSets).sets);
        return store.getState().removeSet(set.id);
      });
    }
  }

  await pick(rng, candidates)();
}

// ---------------------------------------------------------------------------

describe('activeWorkoutStore kill simulation (M2-03, 08 §4.9)', () => {
  it('100 seeded random-action runs each survive drop-and-rehydrate with a deep-equal draft', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const exercisePool = ['seed-ex-1', 'seed-ex-2', 'seed-ex-3', 'seed-ex-4'].map((id) =>
      insertExercise(driver, id),
    );
    const repository = new WorkoutRepositoryImpl(driver);

    const SEED_COUNT = 100;
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const rng = mulberry32(seed);
      const store = createActiveWorkoutStore();
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: `Seed ${seed}`, startTime: seed });

      const actionCount = randInt(rng, 10, 20);
      for (let i = 0; i < actionCount; i++) {
        // Deliberately sequential: each action reads the store's
        // just-updated draft before choosing the next one.
        await runRandomAction(store, rng, exercisePool);
      }

      // "Kill": stop using `store` and rehydrate an entirely independent
      // instance from the same repository/DB.
      const revived = createActiveWorkoutStore();
      await revived.getState().rehydrate(repository);

      expect(revived.getState().workout).toEqual(store.getState().workout);

      // Reset for the next seed (one-active-workout invariant).
      if (store.getState().workout) {
        await store.getState().discard();
      }
    }

    driver.close();
  }, 30_000);
});
