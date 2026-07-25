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
 * ## Set correlation: position-order within the matched exercise, not the
 * warm-up/working bucket scheme
 *
 * `previous-values.ts`'s `computeCurrentRowBuckets` numbers warm-up and
 * non-warm-up rows independently so a *display-time* PREVIOUS lookup can
 * match "the i-th warm-up row" against an unrelated prior *session* that
 * may have a different-shaped warm-up prefix (02 §6/§16.6) — a genuinely
 * different problem from this one. Here, both sides of the comparison are
 * already stored in `position ASC` order (`routine_sets`/`sets`, 05
 * §3.2/§3.3), and the write-back is an inherently positional rewrite
 * (delete-all-reinsert-by-array-order, mirroring `RoutineRepositoryImpl
 * .update`'s own replace-all `exercises` convention) — 04 §2.4's own
 * wording, "per-set targets ← the workout's checked sets' actual values,"
 * describes a 1:1 positional correspondence, not an independently-bucketed
 * one. Plain `sets[i] <-> routine_sets[i]` position matching is therefore
 * both simpler and the natural fit, and is used identically by
 * {@link computeRoutineDiff} (is set `i`'s achieved value different from
 * target `i`?) and by `RoutineRepositoryImpl.updateFromWorkout` (is set
 * `i`'s achieved reps inside target `i`'s existing range?) — the same
 * index, the same meaning, in both places. A set-count mismatch between the
 * two sides is caught separately, before any per-index comparison, as its
 * own `set_added_or_removed` reason.
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

/** Mirrors `WorkoutSet`'s target-relevant fields — the workout side of a diffed/matched set pair. */
export interface RoutineDiffAchievedSetLike {
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
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

    if (we.sets.length !== re.sets.length) {
      reasons.push({ kind: 'set_added_or_removed', exerciseId: we.exerciseId });
    } else {
      we.sets.forEach((achievedSet, setIndex) => {
        const targetSet = re.sets[setIndex]!;
        if (setValueDiffers(achievedSet, targetSet)) {
          reasons.push({ kind: 'target_value_changed', exerciseId: we.exerciseId });
        }
      });
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
