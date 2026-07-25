/**
 * `domain/routine-diff.ts` (M3-06) — 02 §14.4 / 04 §2.4: pure material-change
 * detection between a just-finished workout and the routine it started from,
 * plus the exercise-correlation helpers `RoutineRepositoryImpl.updateFromWorkout`
 * (the write-back half of this same task) reuses so the two computations can
 * never disagree about "which set maps to which target." No I/O, no
 * `src/data` imports (06 §2) — structurally-compatible "Like" input shapes,
 * exactly the convention `domain/previous-values.ts` (M2-04) already
 * established for `PreviousSetLike`/`RoutineTargetLike`.
 *
 * ## Exercise correlation: `routineOccurrenceIndex`, not live position
 *
 * M3-05's review fix (see `src/data/workouts/workout-repository.ts`'s file
 * header, "M3-05 review fix — `routine_occurrence_index`") pinned a fixed,
 * reorder-immune `routineOccurrenceIndex` onto every `workout_exercises` row
 * created by `startFromRoutine` — the exact reason that fix exists is to
 * stop callers from re-deriving "which routine occurrence do I match" from
 * *current* position order, which silently cross-wires duplicated exercises
 * after a mid-workout reorder. This module follows that precedent deliberately:
 * {@link matchWorkoutToRoutineExercises} matches purely on
 * `(exerciseId, routineOccurrenceIndex)` against the *routine's own*
 * `position ASC` occurrence order (recomputed fresh from the routine's
 * current live structure — the routine may have been edited since the
 * workout started, 04 §2.2: "edits don't affect past workouts," so the
 * *live* routine is genuinely a moving target this diff must compare
 * against, not a snapshot) — never from the workout's own live position
 * order. A workout exercise with `routineOccurrenceIndex: null` (added
 * mid-workout via `+ Add Exercise`, or `replaceExercise`d — see next
 * section) never matches anything here, by construction.
 *
 * ## "Replaced" vs. "removed + added" (judgment call, documented per this
 * task's own instruction)
 *
 * `replaceExercise` nulls `routineOccurrenceIndex` on the row it repoints
 * (`workout-repository.ts`'s header: "a stale index pointing at the *old*
 * exercise's occurrence would be actively wrong for the new one"). By the
 * time a finished workout's exercises reach this module, a replaced
 * exercise is therefore indistinguishable — from the data alone — from "the
 * original routine exercise was removed and an unrelated new one was added
 * mid-workout." Recovering "replaced" specifically would require inferring
 * identity from the workout exercise's *position* (e.g. "whatever sits
 * where the old one used to be must be its replacement") — exactly the
 * live-position inference M3-05's review fix eliminated, and exactly what
 * this task's own brief warns against reintroducing. This module therefore
 * deliberately reports a replaced exercise as one `exercise_added` reason
 * (the new, unmatched workout exercise) plus one `exercise_removed` reason
 * (the now-unmatched routine occurrence) — an equivalent, defensible framing
 * that still correctly yields `material: true` and, on the write-back side,
 * still correctly produces the right final structure (the workout's own
 * final exercise list, verbatim) without ever trusting a position-based
 * guess.
 *
 * ## Set correlation: `routineSetPosition`, not plain position-order
 * (M3-06 review fix)
 *
 * The original version of this module matched sets via plain
 * `sets[i] <-> routine_sets[i]` position-order, reasoning that "both sides
 * are already stored in `position ASC` order" made that a genuine 1:1
 * correspondence. **That reasoning was wrong**, for exactly the same reason
 * M3-05's review fix (above) rejected live-position matching for
 * *exercises*: `WorkoutRepositoryImpl.finish()` deletes every
 * `is_completed=0` set and then renumbers the survivors back to contiguous
 * 0-based positions (`renumberSetPositions`) — preserving relative order
 * but closing any gap. Checking set 0 and set 2 of a 3-set exercise while
 * leaving set 1 unchecked (nothing in the UI/store enforces checking sets
 * in order) leaves the achieved set that was genuinely `routine_sets[2]`
 * sitting at post-finish position 1 — a plain positional diff/write-back
 * then silently correlates it against `routine_sets[1]` instead, e.g.
 * collapsing a rep-range target that should have survived.
 *
 * Fixed the same way M3-05 fixed the exercise-level version of this bug:
 * {@link matchWorkoutSetsToRoutineSets} matches purely on
 * `routineSetPosition` — each achieved set's fixed 0-based position among
 * its *source* `routine_exercise`'s own `routine_sets`, pinned once by
 * `WorkoutRepositoryImpl.startFromRoutine` at creation time (see
 * `workout-repository.ts`'s "M3-06 review fix" header section) and never
 * touched again by `renumberSetPositions` — against the matched routine
 * exercise's *current* `sets`/`routine_sets` count (live, same "may have
 * been edited since the workout started" reasoning the exercise-level
 * matching already applies). An achieved set with `routineSetPosition:
 * null` (added mid-workout via `+ Add Set`/warm-up insert, or belonging to
 * a `replaceExercise`d exercise) or whose pinned position no longer exists
 * in the routine's live `routine_sets` (a set removed from the routine
 * since) never matches anything, by construction — exactly the "no match"
 * contract {@link matchWorkoutToRoutineExercises} already establishes one
 * level up. Used identically by {@link computeRoutineDiff} (is a matched
 * set's achieved value different from its true target?) and by
 * `RoutineRepositoryImpl.updateFromWorkout` (is a matched set's achieved
 * reps inside its true target's existing range?) — the same matches, the
 * same meaning, in both places. `set_added_or_removed` is now itself
 * derived from this matching (any achieved or target set left unmatched),
 * not from a raw set-count comparison — the count-comparison version had
 * the identical "equal count can still hide a mismatch" flaw the exercise
 * layer's live-position matching had (e.g. one set skipped mid-workout and
 * a different, unrelated set added back via `+ Add Set` leaves the count
 * unchanged but the *identities* wrong).
 *
 * **Why not `previous-values.ts`'s warm-up/working bucket scheme?** Worth
 * reconsidering explicitly, since a bucket-relative index *is* more robust
 * than a raw position index against insertions/deletions elsewhere in the
 * same set-type bucket. But `computeCurrentRowBuckets` computes its bucket
 * index live, from current row order, at lookup time — it has no
 * creation-time pin. Applied to this problem it would still be recomputed
 * from the same post-`finish()`, post-renumbering `sets` array this bug
 * report's repro shows: a skipped set *within the same bucket* (e.g. two
 * `'normal'`-type sets, skip the first) shifts the bucket-relative index of
 * every later same-bucket set by exactly the same amount a raw position
 * index does, reproducing the identical bug. The bucket scheme solves a
 * genuinely different problem (matching against an *unrelated prior
 * session* with a different-shaped warm-up prefix, 02 §6/§16.6) — this
 * problem needs a value immune to *this workout's own* later mutation,
 * which only a creation-time pin (the `routineOccurrenceIndex` precedent)
 * provides.
 *
 * ## What participates in the diff (02 §14.4) vs. the write-back (04 §2.4)
 *
 * These are two different questions this task's own brief calls out as an
 * apparent gap: 02 §14.4's material-change list never mentions a workout
 * exercise's free-text `notes`, but 04 §2.4's write-back explicitly copies
 * "exercise list/order/superset/rest/notes" from the workout's final
 * structure. Resolved as: **notes changing alone never triggers the
 * prompt** (not compared by {@link computeRoutineDiff} at all — it isn't in
 * 02 §14.4's enumerated list, unlike rest timer / superset / set values /
 * structure, which are), but **notes are still overwritten** once the user
 * accepts "Update routine" for some *other* material reason (handled
 * entirely in `RoutineRepositoryImpl.updateFromWorkout`, not here) —
 * exactly like every other structural field the write-back always applies
 * wholesale once the prompt is accepted. Logged as ambiguity #14 in
 * `docs/plan/tasks/TASKS-INDEX.md`.
 *
 * `customMetric` is a similar judgment call in the *other* direction: 02
 * §14.4's own elaboration text names "weight/reps-or-range-membership/
 * distance/duration" as the target-relevant values to compare, omitting
 * `customMetric` — but it is a genuine per-exercise-type target value (03
 * §6.3's `uses_custom_metric` column) exactly like the others, and
 * `RoutineRepositoryImpl.createFromWorkout` (M3-01) already treats it as a
 * copied achieved value with no special-casing. Excluding it from the diff
 * would let a `customMetric`-only change silently update the routine
 * without the prompt ever firing, which would contradict the write-back's
 * own behavior — so it participates in {@link computeRoutineDiff}'s
 * target-value comparison here, consistent with (not narrower than) what
 * the write-back actually copies.
 */

// ---------------------------------------------------------------------------
// Input shapes — structurally compatible with (never importing) the
// data-layer shapes they mirror (`WorkoutExerciseFull`/`WorkoutSet`,
// `RoutineExerciseFull`/`RoutineSet`, `src/data/workouts|routines/types.ts`).
// ---------------------------------------------------------------------------

/** Mirrors `WorkoutSet`'s target-relevant and set-correlation fields — the workout side of a diffed/matched set pair. */
export interface RoutineDiffAchievedSetLike {
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
  /** `WorkoutSet.routineSetPosition` — `null` means "no routine counterpart" (mid-workout `+ Add Set`/warm-up insert, or a `replaceExercise`d exercise's set). See file header, "Set correlation". */
  routineSetPosition: number | null;
}

/** Mirrors `WorkoutExerciseFull`'s structure-relevant fields. */
export interface RoutineDiffWorkoutExerciseLike {
  exerciseId: string;
  /** `WorkoutExerciseFull.routineOccurrenceIndex` — `null` means "no routine counterpart" (mid-workout add, or a `replaceExercise`d identity change). See file header. */
  routineOccurrenceIndex: number | null;
  supersetId: number | null;
  restSeconds: number | null;
  sets: readonly RoutineDiffAchievedSetLike[];
}

/** The finished-workout-shaped input {@link computeRoutineDiff} compares against a routine. Exercises must be in the workout's own final `position ASC` order (post-`finish()` — every `sets` row present is already checked, see `workout-repository.ts`'s `finish()`). */
export interface FinishedWorkoutLike {
  exercises: readonly RoutineDiffWorkoutExerciseLike[];
}

/** Mirrors `RoutineSet`'s target-relevant fields — the routine side of a diffed/matched set pair. `repRangeStart`/`repRangeEnd` non-null (mutually exclusive with `reps`, the schema's own XOR check) marks this target as a rep range. */
export interface RoutineDiffTargetSetLike {
  weightKg: number | null;
  reps: number | null;
  repRangeStart: number | null;
  repRangeEnd: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
}

/** Mirrors `RoutineExerciseFull`'s structure-relevant fields. */
export interface RoutineDiffRoutineExerciseLike {
  exerciseId: string;
  supersetId: number | null;
  restSeconds: number | null;
  sets: readonly RoutineDiffTargetSetLike[];
}

/** The routine-shaped input {@link computeRoutineDiff} compares a finished workout against. Exercises must be in the routine's own current `position ASC` order (its *live* structure at diff time — see file header). */
export interface SourceRoutineLike {
  exercises: readonly RoutineDiffRoutineExerciseLike[];
}

// ---------------------------------------------------------------------------
// Exercise correlation — shared by the diff and by
// `RoutineRepositoryImpl.updateFromWorkout`'s write-back (file header).
// ---------------------------------------------------------------------------

export interface OccurrenceMatchWorkoutExerciseLike {
  exerciseId: string;
  routineOccurrenceIndex: number | null;
}

export interface OccurrenceMatchRoutineExerciseLike {
  exerciseId: string;
}

/** One matched pair — indexes into the two input arrays passed to {@link matchWorkoutToRoutineExercises}. */
export interface ExerciseMatch {
  workoutExerciseIndex: number;
  routineExerciseIndex: number;
}

/** Each element's 0-based occurrence count among prior elements sharing the same `exerciseId` — the exact scheme `WorkoutRepositoryImpl.startFromRoutine` uses to mint `routine_occurrence_index` in the first place (`workout-repository.ts`), recomputed here fresh against the routine's *current* structure. */
function computeOccurrenceIndexes(exerciseIds: readonly string[]): number[] {
  const counts = new Map<string, number>();
  return exerciseIds.map((exerciseId) => {
    const occurrence = counts.get(exerciseId) ?? 0;
    counts.set(exerciseId, occurrence + 1);
    return occurrence;
  });
}

/**
 * Matches each workout exercise to its routine counterpart via
 * `(exerciseId, routineOccurrenceIndex)` — never via live position (file
 * header). A workout exercise with `routineOccurrenceIndex: null`, or whose
 * occurrence no longer exists in the routine's current live structure
 * (routine edited since the workout started), is simply absent from the
 * returned list — the caller treats "no match" as "added" (diff) / "no
 * original target" (write-back). Returned in the workout's own array order.
 */
export function matchWorkoutToRoutineExercises(
  workoutExercises: readonly OccurrenceMatchWorkoutExerciseLike[],
  routineExercises: readonly OccurrenceMatchRoutineExerciseLike[],
): ExerciseMatch[] {
  const routineOccurrenceIndexes = computeOccurrenceIndexes(routineExercises.map((re) => re.exerciseId));
  const routineIndexByKey = new Map<string, number>();
  routineExercises.forEach((re, index) => {
    routineIndexByKey.set(`${re.exerciseId}::${routineOccurrenceIndexes[index]}`, index);
  });

  const matches: ExerciseMatch[] = [];
  workoutExercises.forEach((we, workoutExerciseIndex) => {
    if (we.routineOccurrenceIndex === null) {
      return;
    }
    const routineExerciseIndex = routineIndexByKey.get(`${we.exerciseId}::${we.routineOccurrenceIndex}`);
    if (routineExerciseIndex === undefined) {
      return;
    }
    matches.push({ workoutExerciseIndex, routineExerciseIndex });
  });
  return matches;
}

// ---------------------------------------------------------------------------
// Set correlation (M3-06 review fix) — shared by the diff and by
// `RoutineRepositoryImpl.updateFromWorkout`'s write-back (file header,
// "Set correlation"). Matches sets *within one already-matched exercise
// pair* — call once per {@link ExerciseMatch}.
// ---------------------------------------------------------------------------

export interface OccurrenceMatchWorkoutSetLike {
  /** `WorkoutSet.routineSetPosition` — see file header, "Set correlation". */
  routineSetPosition: number | null;
}

/** One matched pair — indexes into the achieved-set array and the target-set array passed to {@link matchWorkoutSetsToRoutineSets}. */
export interface SetMatch {
  workoutSetIndex: number;
  routineSetIndex: number;
}

/**
 * Matches each achieved set (within one already-matched exercise) to its
 * routine target set via `routineSetPosition` — never via live position
 * (file header, "Set correlation"). An achieved set with
 * `routineSetPosition: null`, or whose pinned position is `>=
 * routineSetCount` (the set no longer exists in the routine's current live
 * `routine_sets`, e.g. removed since the workout started), is simply absent
 * from the returned list — the caller treats "no match" as "added" (diff) /
 * "no original target" (write-back), the identical contract
 * {@link matchWorkoutToRoutineExercises} establishes one level up. Returned
 * in the achieved-set array's own order.
 */
export function matchWorkoutSetsToRoutineSets(
  workoutSets: readonly OccurrenceMatchWorkoutSetLike[],
  routineSetCount: number,
): SetMatch[] {
  const matches: SetMatch[] = [];
  workoutSets.forEach((ws, workoutSetIndex) => {
    if (ws.routineSetPosition === null) {
      return;
    }
    if (ws.routineSetPosition < 0 || ws.routineSetPosition >= routineSetCount) {
      return;
    }
    matches.push({ workoutSetIndex, routineSetIndex: ws.routineSetPosition });
  });
  return matches;
}

/** Whether `reps` falls inside `target`'s rep range, inclusive of both endpoints (04 §2.4: a displayed "6-8" range includes both 6 and 8 — the natural reading of "achieved reps fall inside the existing range"). `false` when `target` isn't actually a range (both bounds `null`) or `reps` is `null`. Shared by {@link computeRoutineDiff} (does an in-range achieved value still count as "unchanged"?) and `RoutineRepositoryImpl.updateFromWorkout` (does the range get preserved on write-back?) — see file header. */
export function repsWithinRoutineRange(
  reps: number | null,
  target: { repRangeStart: number | null; repRangeEnd: number | null },
): boolean {
  if (target.repRangeStart === null && target.repRangeEnd === null) {
    return false;
  }
  if (reps === null) {
    return false;
  }
  const start = target.repRangeStart ?? -Infinity;
  const end = target.repRangeEnd ?? Infinity;
  return reps >= start && reps <= end;
}

// ---------------------------------------------------------------------------
// Material-change detection (02 §14.4)
// ---------------------------------------------------------------------------

export type RoutineDiffReasonKind =
  | 'exercise_added'
  | 'exercise_removed'
  | 'exercise_reordered'
  | 'set_added_or_removed'
  | 'target_value_changed'
  | 'rest_timer_changed'
  | 'superset_changed';

export interface RoutineDiffReason {
  kind: RoutineDiffReasonKind;
  /** The workout-side exercise id this reason is about, when applicable (absent for whole-diff reasons like `exercise_reordered`/`superset_changed`, which span multiple exercises). */
  exerciseId?: string;
}

export interface RoutineDiffResult {
  /** `true` iff `reasons` is non-empty — 02 §14.4's "if non-empty -> prompt." */
  material: boolean;
  reasons: RoutineDiffReason[];
}

/** One achieved set's target-relevant values differ from `target`'s (weight/distance/duration/customMetric always compared directly; reps compared via range-membership when `target` is a range, file header). */
function setValueDiffers(achieved: RoutineDiffAchievedSetLike, target: RoutineDiffTargetSetLike): boolean {
  if (achieved.weightKg !== target.weightKg) {
    return true;
  }
  if (achieved.distanceMeters !== target.distanceMeters) {
    return true;
  }
  if (achieved.durationSeconds !== target.durationSeconds) {
    return true;
  }
  if (achieved.customMetric !== target.customMetric) {
    return true;
  }

  const isRangeTarget = target.repRangeStart !== null || target.repRangeEnd !== null;
  if (isRangeTarget) {
    return !repsWithinRoutineRange(achieved.reps, target);
  }
  return achieved.reps !== target.reps;
}

/** For each element (indexed identically to `matches`), the set of *other* matched-array indexes sharing its `supersetId` — `null` when ungrouped. Comparing these sets (rather than raw `supersetId` values, which are locally-scoped "lowest position in group" ids in two different position domains — `workout-repository.ts`'s `startFromRoutine` header) is what makes "superset changed" meaningful across the workout/routine boundary. */
function partnerGroupsByMatchIndex(items: readonly { supersetId: number | null }[]): (Set<number> | null)[] {
  const membersBySupersetId = new Map<number, number[]>();
  items.forEach((item, index) => {
    if (item.supersetId === null) {
      return;
    }
    const members = membersBySupersetId.get(item.supersetId) ?? [];
    members.push(index);
    membersBySupersetId.set(item.supersetId, members);
  });
  return items.map((item, index) => {
    if (item.supersetId === null) {
      return null;
    }
    const members = membersBySupersetId.get(item.supersetId) ?? [];
    return new Set(members.filter((memberIndex) => memberIndex !== index));
  });
}

function partnerSetsEqual(a: Set<number> | null, b: Set<number> | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

/**
 * 02 §14.4's material-change detection. Compares a just-finished workout
 * against the (live, possibly-since-edited — file header) routine it
 * started from. Every case in 02 §14.4's own list is covered: set
 * added/removed on a matched exercise, exercise added/removed/reordered (a
 * `replaceExercise`d identity is reported as added+removed, file header),
 * target-relevant value differs from target, rest timer changed, superset
 * changed. Free-text `notes` never participates (file header).
 */
export function computeRoutineDiff(workout: FinishedWorkoutLike, routine: SourceRoutineLike): RoutineDiffResult {
  const reasons: RoutineDiffReason[] = [];
  const matches = matchWorkoutToRoutineExercises(workout.exercises, routine.exercises);
  const matchedWorkoutIndexes = new Set(matches.map((m) => m.workoutExerciseIndex));
  const matchedRoutineIndexes = new Set(matches.map((m) => m.routineExerciseIndex));

  workout.exercises.forEach((we, index) => {
    if (!matchedWorkoutIndexes.has(index)) {
      reasons.push({ kind: 'exercise_added', exerciseId: we.exerciseId });
    }
  });
  routine.exercises.forEach((re, index) => {
    if (!matchedRoutineIndexes.has(index)) {
      reasons.push({ kind: 'exercise_removed', exerciseId: re.exerciseId });
    }
  });

  // Reordered: the matched pairs' routine-side indexes, read in the
  // workout's own order, must already be strictly ascending — i.e. equal to
  // the routine's own order — for nothing to have moved. Exercises added
  // mid-workout (unmatched, interleaved) don't affect this: only matched
  // (routine-linked) pairs are considered.
  if (matches.length > 0) {
    const routineIndexesInWorkoutOrder = matches
      .slice()
      .sort((a, b) => a.workoutExerciseIndex - b.workoutExerciseIndex)
      .map((m) => m.routineExerciseIndex);
    const isAscending = routineIndexesInWorkoutOrder.every(
      (value, i) => i === 0 || value > routineIndexesInWorkoutOrder[i - 1]!,
    );
    if (!isAscending) {
      reasons.push({ kind: 'exercise_reordered' });
    }
  }

  for (const match of matches) {
    const we = workout.exercises[match.workoutExerciseIndex]!;
    const re = routine.exercises[match.routineExerciseIndex]!;

    if ((we.restSeconds ?? null) !== (re.restSeconds ?? null)) {
      reasons.push({ kind: 'rest_timer_changed', exerciseId: we.exerciseId });
    }

    // Set correlation via `routineSetPosition`, not plain position-order —
    // see file header, "Set correlation" (M3-06 review fix). `hasUnmatchedSet`
    // replaces a raw `we.sets.length !== re.sets.length` count comparison:
    // equal counts can still hide a mismatch (e.g. one set skipped
    // mid-workout and a different set added back via `+ Add Set` leaves the
    // count unchanged but the identities wrong), so "added or removed" is
    // derived from actual match coverage on both sides instead.
    const setMatches = matchWorkoutSetsToRoutineSets(we.sets, re.sets.length);
    const matchedWorkoutSetIndexes = new Set(setMatches.map((m) => m.workoutSetIndex));
    const matchedRoutineSetIndexes = new Set(setMatches.map((m) => m.routineSetIndex));
    const hasUnmatchedSet =
      we.sets.some((_, index) => !matchedWorkoutSetIndexes.has(index)) ||
      re.sets.some((_, index) => !matchedRoutineSetIndexes.has(index));
    if (hasUnmatchedSet) {
      reasons.push({ kind: 'set_added_or_removed', exerciseId: we.exerciseId });
    }
    for (const setMatch of setMatches) {
      const achievedSet = we.sets[setMatch.workoutSetIndex]!;
      const targetSet = re.sets[setMatch.routineSetIndex]!;
      if (setValueDiffers(achievedSet, targetSet)) {
        reasons.push({ kind: 'target_value_changed', exerciseId: we.exerciseId });
      }
    }
  }

  const workoutPartnerGroups = partnerGroupsByMatchIndex(
    matches.map((m) => workout.exercises[m.workoutExerciseIndex]!),
  );
  const routinePartnerGroups = partnerGroupsByMatchIndex(
    matches.map((m) => routine.exercises[m.routineExerciseIndex]!),
  );
  const supersetChanged = matches.some(
    (_, index) => !partnerSetsEqual(workoutPartnerGroups[index]!, routinePartnerGroups[index]!),
  );
  if (supersetChanged) {
    reasons.push({ kind: 'superset_changed' });
  }

  return { material: reasons.length > 0, reasons };
}
