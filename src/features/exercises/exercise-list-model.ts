/**
 * `exercise-list-model.ts` (M1-07) — the browse screen's pure, RN-free
 * logic: search+filter AND-composition (03 §2: "Filters combine (equipment
 * AND muscle) and compose with search") and the flat, sectioned row array
 * `ExerciseBrowseScreen` feeds `FlashList` (Recent header + rows, then
 * per-first-letter sticky headers + rows, 03 §2 / 06 §8's "in-memory over
 * the preloaded array" tactic). Kept side-effect-free and independent of
 * `@shopify/flash-list`/React so it's cheap to unit-test directly against
 * the real 873-row vendored dataset without mounting any component.
 */
import { normalizeForSearch, matchesSearchQuery } from '@/domain/search';
import type { Equipment, MuscleGroup } from '@/domain/enums';
import type { Exercise } from '@/data/exercises/types';

/** The browse screen's current search/filter selection (03 §2). */
export interface ExerciseFilterState {
  /** Raw (already-debounced) search text — 03 §2's "case/diacritic-insensitive substring ... also matches aliases". */
  query: string;
  /** Single-select primary-muscle filter, or `null` ("All Muscles"). */
  muscle: MuscleGroup | null;
  /** Single-select equipment filter, or `null` ("All Equipment"). */
  equipment: Equipment | null;
}

export const EMPTY_EXERCISE_FILTER_STATE: ExerciseFilterState = {
  query: '',
  muscle: null,
  equipment: null,
};

/** `true` when no search text and no filter is active — the state in which Recent renders (03 §2: "hidden while searching/filtering"). */
export function isBrowsingUnfiltered(filter: ExerciseFilterState): boolean {
  return filter.query.trim().length === 0 && filter.muscle === null && filter.equipment === null;
}

/**
 * AND-composes every active filter dimension over `all` (03 §2 acceptance:
 * "Filters combine (equipment AND muscle) and compose with search"). `all`
 * is expected to already be the full, `includeArchived: false` (default)
 * preloaded array (`ExerciseRepository.list()`, no `filter` args) — this
 * function does the per-keystroke work in memory, never re-queries.
 */
export function filterExercises(all: readonly Exercise[], filter: ExerciseFilterState): Exercise[] {
  const trimmedQuery = filter.query.trim();
  return all.filter((exercise) => {
    if (filter.muscle && exercise.primaryMuscleGroup !== filter.muscle) {
      return false;
    }
    if (filter.equipment && exercise.equipment !== filter.equipment) {
      return false;
    }
    if (trimmedQuery.length > 0) {
      const matchesName = matchesSearchQuery(exercise.name, trimmedQuery);
      const matchesAlias = exercise.aliases.some((alias) => matchesSearchQuery(alias, trimmedQuery));
      if (!matchesName && !matchesAlias) {
        return false;
      }
    }
    return true;
  });
}

/** First-letter section-header bucket for `name` (03 §2's "sticky letter headers"): the diacritic/case-folded first character, uppercased, or `'#'` for anything that doesn't fold to A–Z (e.g. a name starting with a digit). */
export function sectionLetterFor(name: string): string {
  const normalized = normalizeForSearch(name);
  const first = normalized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

export type ExerciseBrowseRow =
  | { type: 'header'; key: string; label: string }
  | { type: 'exercise'; key: string; exercise: Exercise };

export interface BuiltExerciseRows {
  rows: ExerciseBrowseRow[];
  /** Section letter (or `'Recent'`) -> index of that section's header row within `rows` — what the A–Z rail scrolls to. */
  sectionIndex: Record<string, number>;
}

/**
 * Builds the flat row array `FlashList` renders: an optional `Recent`
 * header + rows (only when `showRecent` and `recent` is non-empty — 03 §2:
 * "hidden while searching/filtering" is the caller's job via
 * {@link isBrowsingUnfiltered}, not this function's), then `all` grouped
 * alphabetically by {@link sectionLetterFor} with one header row per letter
 * change. `all` is sorted by name here (case/diacritic-insensitive) so
 * callers never need to pre-sort — cheap at ~873 rows (06 §8).
 */
export function buildExerciseRows(params: {
  recent: readonly Exercise[];
  all: readonly Exercise[];
  showRecent: boolean;
}): BuiltExerciseRows {
  const rows: ExerciseBrowseRow[] = [];
  const sectionIndex: Record<string, number> = {};

  if (params.showRecent && params.recent.length > 0) {
    sectionIndex.Recent = rows.length;
    rows.push({ type: 'header', key: 'header:recent', label: 'Recent' });
    for (const exercise of params.recent) {
      rows.push({ type: 'exercise', key: `recent:${exercise.id}`, exercise });
    }
  }

  const sorted = [...params.all].sort((a, b) =>
    normalizeForSearch(a.name).localeCompare(normalizeForSearch(b.name)),
  );

  let lastLetter: string | null = null;
  for (const exercise of sorted) {
    const letter = sectionLetterFor(exercise.name);
    if (letter !== lastLetter) {
      sectionIndex[letter] = rows.length;
      rows.push({ type: 'header', key: `header:${letter}`, label: letter });
      lastLetter = letter;
    }
    rows.push({ type: 'exercise', key: `all:${exercise.id}`, exercise });
  }

  return { rows, sectionIndex };
}

/** The A–Z rail's fixed letter set (03 §2: "right-edge A–Z index rail") — always all 26, regardless of which letters the current data actually has a section for (rail entries with no section are simply non-interactive, `AzRail`'s job). */
export const AZ_RAIL_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
