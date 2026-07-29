/**
 * `domain/supersets.ts` (M2-12, 02 §8 / 07 §2.5 / 05 §3.2) — pure, RN-free
 * superset math: group derivation (labels + colors), dissolution-on-shrink,
 * and Smart Superset Scrolling's "which member next" decision. Everything
 * here operates on plain `{id, position, supersetId}` shapes rather than
 * the real `WorkoutExerciseFull`/`WorkoutFull` types so it stays trivially
 * unit-testable and import-free of `activeWorkoutStore`/`data/workouts` —
 * callers (`ActiveWorkoutScreen`, `activeWorkoutStore.removeFromSuperset`)
 * map their real objects down to this shape at the call site.
 *
 * `superset_id` sentinel (05 §3.2, confirmed against the schema/migration):
 * nullable integer per workout-exercise row, `null` = ungrouped, `0,1,2…`
 * (not necessarily contiguous or sequential across the workout — both
 * existing M2-09 group-creation paths mint the new group's id as "the
 * lowest involved `position`", which is already a unique integer per group
 * within a workout since positions themselves are unique) = the group's id,
 * unique per workout. This file never *mints* a `supersetId` (that stays
 * M2-09's "lowest involved position" convention, unchanged) — it only reads
 * existing ids to derive presentation (label/color) and membership.
 */

/** 07 §2.5: "cycled by group index; same both themes." */
export const SUPERSET_PALETTE = [
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#A3E635', // lime
  '#6366F1', // indigo
  '#D946EF', // fuchsia
] as const;

const SUPERSET_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface SupersetMemberInput {
  id: string;
  position: number;
  supersetId: number | null;
}

export interface SupersetVisual {
  /** "A", "B", "C"… — first-appearance order among grouped exercises (02 §8). */
  label: string;
  /** One of {@link SUPERSET_PALETTE}, cycled by first-appearance group index. */
  color: string;
}

export interface SupersetGroupInfo extends SupersetVisual {
  /** Member workout-exercise ids, in position order. */
  memberIds: string[];
}

/**
 * Derive every superset group's label/color/ordered-membership from a
 * workout's exercises. Labels and colors are assigned by **first-appearance
 * order** among grouped exercises when scanning in `position` order (02
 * §8) — the first `supersetId` encountered gets "A" + palette[0], the
 * second distinct `supersetId` gets "B" + palette[1], etc.; the palette
 * cycles (`% 6`) past 6 concurrent groups, labels cycle past 26 (an
 * unrealistic circuit count, but `% 26` keeps this total rather than
 * partial).
 */
export function computeSupersetGroups(
  exercises: readonly SupersetMemberInput[],
): Map<number, SupersetGroupInfo> {
  const sorted = [...exercises].sort((a, b) => a.position - b.position);
  const groups = new Map<number, SupersetGroupInfo>();

  for (const exercise of sorted) {
    if (exercise.supersetId == null) {
      continue;
    }
    let group = groups.get(exercise.supersetId);
    if (!group) {
      const index = groups.size;
      group = {
        label: SUPERSET_LABELS[index % SUPERSET_LABELS.length]!,
        color: SUPERSET_PALETTE[index % SUPERSET_PALETTE.length],
        memberIds: [],
      };
      groups.set(exercise.supersetId, group);
    }
    group.memberIds.push(exercise.id);
  }

  return groups;
}

/** Per-exercise-id convenience view over {@link computeSupersetGroups} — what `ExerciseCard` actually needs (its own label + color, or nothing when ungrouped). */
export function supersetVisualsByExerciseId(
  exercises: readonly SupersetMemberInput[],
): Map<string, SupersetVisual> {
  const groups = computeSupersetGroups(exercises);
  const out = new Map<string, SupersetVisual>();
  for (const group of groups.values()) {
    for (const id of group.memberIds) {
      out.set(id, { label: group.label, color: group.color });
    }
  }
  return out;
}

/**
 * 02 §8: "group of 1 dissolves automatically." Given the full exercise list
 * and the id just being removed from its group, returns the id(s) that
 * should **also** have their `supersetId` cleared — empty when the group
 * still has 2+ members left (or `removedId` wasn't grouped/found), a
 * single-element array (the last remaining member) when the group would
 * otherwise shrink to exactly one. `removedId` itself is not included in
 * the result — the caller clears that one unconditionally as the direct
 * effect of "Remove from Superset."
 */
export function computeDissolution(
  exercises: readonly SupersetMemberInput[],
  removedId: string,
): string[] {
  const removed = exercises.find((exercise) => exercise.id === removedId);
  if (!removed || removed.supersetId == null) {
    return [];
  }
  const remaining = exercises.filter(
    (exercise) => exercise.id !== removedId && exercise.supersetId === removed.supersetId,
  );
  return remaining.length === 1 ? [remaining[0]!.id] : [];
}

/**
 * Smart Superset Scrolling's round-robin decision (02 §8): given a group's
 * member ids in `position` order, the set of member ids that are currently
 * **fully completed** (no unchecked sets remaining), and the id of the
 * member a set was just checked in, returns the next member (cycling,
 * wrapping past the end back to the start) that still has unchecked sets —
 * or `null` when every other member is already fully completed (nothing to
 * scroll to) or `currentId` isn't a member of `memberIdsByPosition` (or the
 * group has fewer than 2 members — supersets never do, per the dissolution
 * rule above, but this stays defensive).
 *
 * Always advances at least one step — this never returns `currentId` itself
 * (the whole point is round-robin logging across members, not re-visiting
 * the row the user is already on).
 */
export function nextSupersetScrollTarget(
  memberIdsByPosition: readonly string[],
  fullyCompletedIds: ReadonlySet<string>,
  currentId: string,
): string | null {
  const index = memberIdsByPosition.indexOf(currentId);
  if (index === -1 || memberIdsByPosition.length < 2) {
    return null;
  }
  for (let step = 1; step < memberIdsByPosition.length; step += 1) {
    const candidate = memberIdsByPosition[(index + step) % memberIdsByPosition.length]!;
    if (!fullyCompletedIds.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export interface SupersetScrollExerciseInput {
  id: string;
  position: number;
  supersetId: number | null;
  /** Only `isCompleted` matters here — a shape any `{sets: {isCompleted}[]}[]` array (real `WorkoutExerciseFull[]` included) already satisfies structurally. */
  sets: readonly { isCompleted: boolean }[];
}

/**
 * Smart Superset Scrolling's full end-to-end decision (02 §8), in one pure
 * call: given every exercise in the workout and the id of the one a set was
 * just checked in, returns the workout-exercise id to scroll to (or `null`
 * — ungrouped, or every other member already fully completed). Wraps
 * {@link nextSupersetScrollTarget} with the "gather this group's members in
 * position order, and which of them are fully completed (every set
 * checked, or zero sets at all)" glue a caller would otherwise have to
 * hand-roll itself — kept here, fully covered by this file's own domain
 * coverage bar, rather than only reachable through a full RN render
 * (`ActiveWorkoutScreen`'s own `handleSetChecked` is a thin, low-risk
 * wrapper: read the `smart_superset_scroll` setting, call this, then
 * `scrollTo` the result's own recorded card offset).
 */
export function resolveSupersetScrollTarget(
  exercises: readonly SupersetScrollExerciseInput[],
  checkedWorkoutExerciseId: string,
): string | null {
  const checked = exercises.find((exercise) => exercise.id === checkedWorkoutExerciseId);
  if (!checked || checked.supersetId == null) {
    return null;
  }
  const members = exercises
    .filter((exercise) => exercise.supersetId === checked.supersetId)
    .sort((a, b) => a.position - b.position);
  const memberIds = members.map((member) => member.id);
  // A member with zero sets has nothing left to check — `.every()`'s own
  // vacuous truth on an empty array already reads that as "fully
  // completed" for free, which is exactly right here: there's no reason to
  // ever scroll to a row with no set to log.
  const fullyCompletedIds = new Set(
    members.filter((member) => member.sets.every((s) => s.isCompleted)).map((member) => member.id),
  );
  return nextSupersetScrollTarget(memberIds, fullyCompletedIds, checkedWorkoutExerciseId);
}
