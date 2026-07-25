/**
 * `domain/records.ts` (M4-01) — 04 §5.1–5.3, §5.5; 00 P5/P10; 05 §1: the PR
 * (personal record) computation engine. Pure functions over a flat
 * `HistoricalSet[]` for **one exercise** (the caller — M4-02's
 * `RecordsService`/`setsForExercise` — already scopes the array to a single
 * exercise; this module never sees or needs an `exerciseId` field). No I/O,
 * no `src/data` imports (06 §2), structurally-compatible "Like" input shape
 * exactly like `domain/volume.ts`/`domain/previous-values.ts`/
 * `domain/routine-diff.ts` already establish.
 *
 * Records are **derived, never stored** (P10, 05 §1) — there is no `prs`
 * table. Every surface (Records tab, finish-screen "Records earned," workout
 * -detail trophy icons, History card PR counts, the live PR banner) is a
 * read of this module's output over whatever `HistoricalSet[]` the caller
 * currently has, which is exactly why editing/deleting a workout "just
 * works": re-run the same pure function over the updated array and every
 * badge re-flows (04 §5.6).
 *
 * ## One engine, three call shapes
 *
 * 04 §5.2 defines a **trophy** as: a set holds the trophy for record type R
 * iff it strictly beats the best value of R among all *earlier* sets
 * (workout `start_time`, then set order). That is a left-to-right scan that
 * only ever needs "the running best so far" — so the whole engine is one
 * pure step function, {@link applyRecordSet}, applied in chronological
 * order:
 *
 *  - **{@link computeRecordsSnapshot}** — the full-history case (Records tab,
 *    "current" PRs, Set Records table, workout-detail trophies, History-card
 *    PR counts). Sorts `HistoricalSet[]` by `(workoutStartTime, setOrder)`,
 *    folds {@link applyRecordSet} left-to-right, and returns both the final
 *    {@link RecordsSnapshot} (today's holders — by construction, the *last*
 *    award for a given record type in the awards list, since nothing later
 *    beat it) and the full chronological {@link RecordAward} list (every
 *    (set, record-type) trophy ever awarded — filter by `workoutId` for a
 *    workout's "Records earned" count, or by `setId` for that one set's
 *    trophy badges).
 *  - **{@link evaluateLiveCheck}** — the live-banner case (04 §5.5). Baseline
 *    = completed-history's own final {@link RecordsSnapshot} (cached by
 *    M4-02, computed once via `computeRecordsSnapshot(history).snapshot` —
 *    "no DB hit per check," M4-02's own acceptance note) **plus** the
 *    current session's already-checked sets, folded in the order they were
 *    actually checked (not `workoutStartTime`/`setOrder` — a live session's
 *    sets don't have meaningful historical ordering yet, they have real-time
 *    check order, which is exactly the array order the caller must supply).
 *    Unchecking a set removes its contribution simply by omitting it from
 *    the next call's `sessionCheckedSets` — this module holds no state, so
 *    "uncheck" needs no special-cased undo path (08 §4.1 case 13).
 *  - **{@link applyRecordSet}** itself — exposed directly for any caller (or
 *    test) that wants single-step control rather than either convenience
 *    wrapper above; both wrappers are implemented in terms of it, so all
 *    three call shapes can never disagree about what "beats" means.
 *
 * ## Eligibility (04 §5.1/§5.3), mirroring `domain/volume.ts`'s per-type
 * branching
 *
 * Two independent gates apply to every set, in order:
 *
 *  1. **Global** (any record type): `isCompleted` (checked) and
 *     `setType !== 'warmup'`. Failure/dropset sets ARE eligible — only
 *     warm-ups are excluded (04 §5.3). This mirrors
 *     `volume.ts`'s `isStatsEligibleSet`, but deliberately does **not**
 *     reuse it: that function's warm-up exclusion is *conditional* on the
 *     `warmup_in_stats` setting (volume/sets counters respect user
 *     preference), whereas here warm-ups are *unconditionally* excluded from
 *     every record type (04 §5.1's table header: "checked, non-warm-up
 *     sets") — a genuinely different rule, not a parameterization of the
 *     same one.
 *  2. **Per-type, per-record-type** ({@link eligibilityForExerciseType}) —
 *     which of the six record "slots" (Heaviest Weight, Best Est. 1RM, Best
 *     Set Volume, Most Reps, Longest Duration, Set Records) a given
 *     `exercise_type` can even contribute to, straight off 04 §5.1's own
 *     table plus its two prose carve-outs ("`bodyweight_reps` records use
 *     **added** weight" — trivially true since `weightKg` on that type
 *     already *is* the added-weight column, 05 §3.2's own comment; "assisted
 *     excluded from Heaviest/volume records," tracked as `leastAssistance`
 *     instead, see below). One exhaustive `switch` (not a handful of
 *     `Set<ExerciseType>` literals scattered per record type) so every one
 *     of the 8 `exercise_type`s is audited against the 04 §5.1 table in a
 *     single place, with a `never`-guard default exactly like
 *     `volume.ts::setVolumeKg`'s own exhaustiveness convention — a new
 *     `ExerciseType` added to `enums.ts` without a case here fails
 *     `tsc --noEmit`, not just a missed test.
 *
 * Beyond per-type applicability, three **value-level** exclusions apply (04
 * §5.3, this task's own "How" text) once a record type is otherwise
 * applicable:
 *
 *  - `reps === 0` / `durationSeconds === 0` are excluded **everywhere** they
 *    participate (Most Reps, Best Set Volume, Best Est. 1RM's reps input,
 *    Set Records' bucket key, Longest Duration) — a `0` is "no value
 *    entered," not a legitimate 0-rep/0-second performance.
 *  - `weightKg === 0` is excluded from the three record types that are
 *    themselves fundamentally *about* a weight value — Heaviest Weight, Best
 *    Est. 1RM, Set Records — per the task text's literal "weight 0 excluded
 *    from weight records." **Best Set Volume is deliberately exempt from
 *    this exclusion** (judgment call): `weightKg × reps` already naturally
 *    evaluates to `0` for a 0-weight set and can never become a new max
 *    unless *every* eligible set in history is also weightless (an
 *    unreachable edge case for `weight_reps`, and for `bodyweight_reps` a
 *    genuine "pure bodyweight, no added load" set — 02 §4: "+KG (optional
 *    added weight)... empty = 0" — is real, common, everyday data that
 *    should still compete for the volume record on its `reps` alone if that
 *    ever becomes the max seen; excluding it here would just silently
 *    suppress a legitimate volume value for no benefit, unlike Heaviest
 *    Weight/Set Records, where a `0` genuinely means "this set carries no
 *    information about how much weight this exercise can bear" and
 *    excluding it is the entire point of the rule).
 *  - `weightKg === null` (or `reps`/`durationSeconds === null`) is always
 *    excluded from any record type that reads that field — "no value
 *    entered" is never treated as `0`.
 *
 * ## Set Records: 11 independent buckets, not 12 (04 §5.1 ambiguity,
 * resolved per this task's own text)
 *
 * 04 §5.1's table cell reads "per rep count 1–10 and "10+" bucket... (10+ =
 * reps ≥ 10 bucket keyed as 10+)" — read *fully* literally that parenthetical
 * would make `reps === 10` land in **both** the exact "10" bucket and the
 * "10+" bucket, which can't be what's intended (a rep-count bucket is a
 * lookup key, not a pair of them). This task's own "How" text is
 * unambiguous — "Set Records per rep count 1–10 + "10+" bucket" — and 04
 * §5.6's acceptance box independently confirms the same reading ("Set
 * record table shows best weight per rep count 1–10, 10+ bucketed"): **11**
 * distinct buckets, `1..10` exact and a separate `10+` for anything above
 * that range. Implemented as {@link setRecordBucket}: `reps <= 10 ? reps :
 * '10+'` — `reps === 10` keys the exact `10` bucket, `reps >= 11` keys
 * `10+`, matching 08 §4.1 case 6's own worked example ("reps 12 → bucket
 * "10+"") and never double-writing a single set into two buckets.
 *
 * ## kg tolerance (04 §5.3, 08 §4.1 case 7)
 *
 * Every comparison against a kg-denominated running best (Heaviest Weight,
 * Best Est. 1RM, Best Set Volume, Set Records, least-assistance) uses
 * {@link beatsKg}/{@link undercutsKg} — `candidate` must exceed/undercut the
 * current holder by strictly more than `0.001` to count, absorbing
 * lb->kg->lb-style unit-conversion float noise without ever manufacturing a
 * false PR. `Most Reps` and `Longest Duration` compare plain integers (reps,
 * whole seconds) with no conversion path into either value, so they use
 * exact `>` — no tolerance needed or applied there.
 */
import type { ExerciseType, SetType } from './enums';
import { epley1RM } from './epley';

// ---------------------------------------------------------------------------
// Public enums
// ---------------------------------------------------------------------------

export const RECORD_TYPE_VALUES = [
  'heaviest_weight',
  'best_1rm',
  'best_set_volume',
  'most_reps',
  'longest_duration',
  'set_record',
] as const;

export type RecordType = (typeof RECORD_TYPE_VALUES)[number];

/** 04 §5.1's Set Records buckets: exact rep counts `1..10`, plus a catch-all `'10+'` for anything above. See file header, "Set Records: 11 independent buckets." */
export const SET_RECORD_BUCKET_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '10+'] as const;

export type SetRecordBucket = (typeof SET_RECORD_BUCKET_VALUES)[number];

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/**
 * One eligible-or-not set, flattened for records computation — structurally
 * compatible with (never importing) `src/data/workouts/types.ts`'s
 * `WorkoutSet` joined with its parent `WorkoutExerciseFull.exerciseType` and
 * `WorkoutFull.startTime`, the shape M4-02's `setsForExercise(exerciseId)`
 * feed is expected to produce (already scoped to one exercise — no
 * `exerciseId` field here). Used for both the full-history case
 * ({@link computeRecordsSnapshot}, where `workoutStartTime`/`setOrder`
 * matter — they're the sort key) and the live-check case
 * ({@link evaluateLiveCheck}, where they're ignored — see that function's
 * own doc comment).
 */
export interface HistoricalSet {
  setId: string;
  workoutId: string;
  /** `WorkoutFull.startTime` of this set's own workout — the primary chronological-order key (04 §5.2). */
  workoutStartTime: number;
  /**
   * This set's position in the true logged order **within its own
   * workout** — the "then set order" tiebreak (04 §5.2) for two sets
   * sharing a `workoutStartTime`. Only relative order among sets of the
   * *same* workout needs to be correct; values don't need to be globally
   * unique across different workouts (their `workoutStartTime` already
   * separates them in the common case).
   */
  setOrder: number;
  exerciseType: ExerciseType;
  setType: SetType;
  /** `WorkoutSet.isCompleted` — only checked sets are eligible for any record type (04 §5.1's table header). */
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Awards & snapshot
// ---------------------------------------------------------------------------

/**
 * One (set, record-type) trophy — 04 §5.2's own definition of what a
 * "record" actually is at the badge level. `bucket` is present only for
 * `set_record` (which record types the other five variants don't need it).
 */
export type RecordAward =
  | { recordType: 'heaviest_weight'; setId: string; workoutId: string }
  | { recordType: 'best_1rm'; setId: string; workoutId: string }
  | { recordType: 'best_set_volume'; setId: string; workoutId: string }
  | { recordType: 'most_reps'; setId: string; workoutId: string }
  | { recordType: 'longest_duration'; setId: string; workoutId: string }
  | { recordType: 'set_record'; bucket: SetRecordBucket; setId: string; workoutId: string };

/** The set currently holding a record slot, and its value — enough to render a Records-tab card (value + link to `workoutId`) or a trophy-tap label (via `RECORD_TYPE_VALUES`/the award's own `recordType`). */
export interface RecordHolder {
  value: number;
  setId: string;
  workoutId: string;
}

/**
 * "Today's" PRs for one exercise — the running state {@link applyRecordSet}
 * threads forward. `leastAssistanceKg` is tracked here too (04 §5.1:
 * "assisted... least-assistance is shown informationally on Records tab")
 * but is **not** a trophy type — it never appears in {@link RecordAward}'s
 * union and {@link applyRecordSet} never emits an award for it (see that
 * function's own comment) — it is a running *minimum*, not a "beats the
 * best" trophy.
 */
export interface RecordsSnapshot {
  heaviestWeightKg: RecordHolder | null;
  best1RmKg: RecordHolder | null;
  bestSetVolumeKg: RecordHolder | null;
  mostReps: RecordHolder | null;
  longestDurationSeconds: RecordHolder | null;
  setRecords: Record<SetRecordBucket, RecordHolder | null>;
  leastAssistanceKg: RecordHolder | null;
}

const EMPTY_SET_RECORDS = SET_RECORD_BUCKET_VALUES.reduce(
  (acc, bucket) => {
    acc[bucket] = null;
    return acc;
  },
  {} as Record<SetRecordBucket, RecordHolder | null>,
);

/** The zero-history starting state — every slot empty. Never mutated; every step produces a new object (`applyRecordSet` is pure). */
export const EMPTY_RECORDS_SNAPSHOT: RecordsSnapshot = {
  heaviestWeightKg: null,
  best1RmKg: null,
  bestSetVolumeKg: null,
  mostReps: null,
  longestDurationSeconds: null,
  setRecords: EMPTY_SET_RECORDS,
  leastAssistanceKg: null,
};

// ---------------------------------------------------------------------------
// Eligibility table (04 §5.1), mirrors `volume.ts::setVolumeKg`'s per-type
// exhaustive switch — see file header.
// ---------------------------------------------------------------------------

interface RecordTypeEligibility {
  heaviestWeight: boolean;
  best1Rm: boolean;
  bestSetVolume: boolean;
  mostReps: boolean;
  longestDuration: boolean;
  setRecord: boolean;
  leastAssistance: boolean;
}

function eligibilityForExerciseType(exerciseType: ExerciseType): RecordTypeEligibility {
  switch (exerciseType) {
    case 'weight_reps':
      return {
        heaviestWeight: true,
        best1Rm: true,
        bestSetVolume: true,
        mostReps: true,
        longestDuration: false,
        setRecord: true,
        leastAssistance: false,
      };
    case 'bodyweight_reps':
      return {
        heaviestWeight: true,
        best1Rm: false,
        bestSetVolume: true,
        mostReps: true,
        longestDuration: false,
        setRecord: true,
        leastAssistance: false,
      };
    case 'bodyweight_assisted_reps':
      // 04 §5.1: excluded from Heaviest/volume/1RM/set-record; Most Reps
      // still applies (it's a rep type); tracked via `leastAssistance`
      // instead of a trophy (file header).
      return {
        heaviestWeight: false,
        best1Rm: false,
        bestSetVolume: false,
        mostReps: true,
        longestDuration: false,
        setRecord: false,
        leastAssistance: true,
      };
    case 'reps_only':
      return {
        heaviestWeight: false,
        best1Rm: false,
        bestSetVolume: false,
        mostReps: true,
        longestDuration: false,
        setRecord: false,
        leastAssistance: false,
      };
    case 'duration':
      return {
        heaviestWeight: false,
        best1Rm: false,
        bestSetVolume: false,
        mostReps: false,
        longestDuration: true,
        setRecord: false,
        leastAssistance: false,
      };
    case 'weight_duration':
      return {
        heaviestWeight: true,
        best1Rm: false,
        bestSetVolume: false,
        mostReps: false,
        longestDuration: true,
        setRecord: false,
        leastAssistance: false,
      };
    case 'distance_duration':
      return {
        heaviestWeight: false,
        best1Rm: false,
        bestSetVolume: false,
        mostReps: false,
        longestDuration: true,
        setRecord: false,
        leastAssistance: false,
      };
    case 'short_distance_weight':
      return {
        heaviestWeight: true,
        best1Rm: false,
        bestSetVolume: false,
        mostReps: false,
        longestDuration: false,
        setRecord: false,
        leastAssistance: false,
      };
    default: {
      const exhaustive: never = exerciseType;
      throw new Error(`records.eligibilityForExerciseType: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

function setRecordBucket(reps: number): SetRecordBucket {
  return reps <= 10 ? (reps as SetRecordBucket) : '10+';
}

// ---------------------------------------------------------------------------
// kg-tolerant comparisons (04 §5.3, 08 §4.1 case 7)
// ---------------------------------------------------------------------------

const KG_TOLERANCE = 0.001;

/** `true` iff `candidate` exceeds `current` by strictly more than the 0.001 kg tolerance — "strictly-greater beats, equal does not re-award" (04 §5.3), float-drift-safe. */
function beatsKg(candidate: number, current: number): boolean {
  return candidate - current > KG_TOLERANCE;
}

/** The least-assistance mirror of {@link beatsKg} — `candidate` undercuts `current` (a smaller assistance value is "better") by strictly more than tolerance. */
function undercutsKg(candidate: number, current: number): boolean {
  return current - candidate > KG_TOLERANCE;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Applies one set to a {@link RecordsSnapshot}, returning the (possibly
 * unchanged) next snapshot and the list of {@link RecordAward}s this set
 * newly earns against it — the single step function every call shape in
 * this module folds (file header). A set that fails the global gate
 * (unchecked, or a warm-up) changes nothing and earns nothing, one check,
 * up front, rather than repeating it per record type.
 */
export function applyRecordSet(
  snapshot: RecordsSnapshot,
  set: HistoricalSet,
): { snapshot: RecordsSnapshot; awards: RecordAward[] } {
  if (!set.isCompleted || set.setType === 'warmup') {
    return { snapshot, awards: [] };
  }

  const eligibility = eligibilityForExerciseType(set.exerciseType);
  const { weightKg, reps, durationSeconds } = set;
  const holder = (value: number): RecordHolder => ({ value, setId: set.setId, workoutId: set.workoutId });

  let next = snapshot;
  const awards: RecordAward[] = [];

  if (eligibility.heaviestWeight && weightKg !== null && weightKg > 0) {
    if (next.heaviestWeightKg === null || beatsKg(weightKg, next.heaviestWeightKg.value)) {
      next = { ...next, heaviestWeightKg: holder(weightKg) };
      awards.push({ recordType: 'heaviest_weight', setId: set.setId, workoutId: set.workoutId });
    }
  }

  if (eligibility.best1Rm && weightKg !== null && weightKg > 0 && reps !== null) {
    const oneRm = epley1RM(weightKg, reps);
    if (oneRm !== null && (next.best1RmKg === null || beatsKg(oneRm, next.best1RmKg.value))) {
      next = { ...next, best1RmKg: holder(oneRm) };
      awards.push({ recordType: 'best_1rm', setId: set.setId, workoutId: set.workoutId });
    }
  }

  if (eligibility.bestSetVolume && weightKg !== null && reps !== null && reps > 0) {
    const volume = weightKg * reps;
    if (next.bestSetVolumeKg === null || beatsKg(volume, next.bestSetVolumeKg.value)) {
      next = { ...next, bestSetVolumeKg: holder(volume) };
      awards.push({ recordType: 'best_set_volume', setId: set.setId, workoutId: set.workoutId });
    }
  }

  if (eligibility.mostReps && reps !== null && reps > 0) {
    if (next.mostReps === null || reps > next.mostReps.value) {
      next = { ...next, mostReps: holder(reps) };
      awards.push({ recordType: 'most_reps', setId: set.setId, workoutId: set.workoutId });
    }
  }

  if (eligibility.longestDuration && durationSeconds !== null && durationSeconds > 0) {
    if (next.longestDurationSeconds === null || durationSeconds > next.longestDurationSeconds.value) {
      next = { ...next, longestDurationSeconds: holder(durationSeconds) };
      awards.push({ recordType: 'longest_duration', setId: set.setId, workoutId: set.workoutId });
    }
  }

  if (eligibility.setRecord && weightKg !== null && weightKg > 0 && reps !== null && reps > 0) {
    const bucket = setRecordBucket(reps);
    const bucketHolder = next.setRecords[bucket];
    if (bucketHolder === null || beatsKg(weightKg, bucketHolder.value)) {
      next = { ...next, setRecords: { ...next.setRecords, [bucket]: holder(weightKg) } };
      awards.push({ recordType: 'set_record', bucket, setId: set.setId, workoutId: set.workoutId });
    }
  }

  // Informational only — no award (file header, `RecordsSnapshot`'s comment).
  if (eligibility.leastAssistance && weightKg !== null) {
    if (next.leastAssistanceKg === null || undercutsKg(weightKg, next.leastAssistanceKg.value)) {
      next = { ...next, leastAssistanceKg: holder(weightKg) };
    }
  }

  return { snapshot: next, awards };
}

function compareChronological(a: HistoricalSet, b: HistoricalSet): number {
  if (a.workoutStartTime !== b.workoutStartTime) {
    return a.workoutStartTime - b.workoutStartTime;
  }
  return a.setOrder - b.setOrder;
}

export interface RecordsComputation {
  /** The current PR holders — "today's" records for this exercise. */
  snapshot: RecordsSnapshot;
  /** Every (set, record-type) trophy ever awarded, in chronological order (04 §5.2). Filter by `workoutId` for a workout's "🏆 N PRs" count (04 §5.4); filter by `setId` for that set's own trophy badges. */
  awards: RecordAward[];
}

/**
 * The full-history computation (file header) — sorts `sets` by
 * `(workoutStartTime, setOrder)` and folds {@link applyRecordSet}
 * left-to-right. Deleting/editing a workout is just calling this again with
 * the updated array (P10/04 §5.6) — there is nothing else to invalidate
 * inside this module, it holds no state of its own.
 */
export function computeRecordsSnapshot(sets: readonly HistoricalSet[]): RecordsComputation {
  const sorted = [...sets].sort(compareChronological);
  let snapshot = EMPTY_RECORDS_SNAPSHOT;
  const awards: RecordAward[] = [];
  for (const set of sorted) {
    const result = applyRecordSet(snapshot, set);
    snapshot = result.snapshot;
    awards.push(...result.awards);
  }
  return { snapshot, awards };
}

/**
 * The live-banner evaluator (04 §5.5, 08 §4.1 cases 10/13). `historySnapshot`
 * is the cached `computeRecordsSnapshot(completedHistory).snapshot` (M4-02
 * owns the cache — "no DB hit per check"). `sessionCheckedSets` are the
 * current active workout's own already-checked sets **in the order they
 * were actually checked** — unlike {@link computeRecordsSnapshot}, this
 * function does **not** sort them by `workoutStartTime`/`setOrder`; those
 * fields carry no meaningful ordering yet for a set that hasn't been saved
 * (04 §5.5's baseline is "completed history... plus already-checked sets of
 * the current session," in session order, not a re-derived chronological
 * order). Returns exactly the awards `candidate` newly earns right now —
 * empty when nothing beats the running best (including the "duplicate
 * value, no banner" case, 08 §4.1 case 10's last clause). Unchecking a set
 * needs no separate API: simply omit it from the next call's
 * `sessionCheckedSets` (file header) — re-checking it recomputes from
 * scratch and re-earns the same awards (case 13).
 */
export function evaluateLiveCheck(
  historySnapshot: RecordsSnapshot,
  sessionCheckedSets: readonly HistoricalSet[],
  candidate: HistoricalSet,
): RecordAward[] {
  let snapshot = historySnapshot;
  for (const set of sessionCheckedSets) {
    snapshot = applyRecordSet(snapshot, set).snapshot;
  }
  return applyRecordSet(snapshot, candidate).awards;
}
