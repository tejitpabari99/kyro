/**
 * `domain/supersets.ts` tests (M2-12 acceptance gate, 02 §8): group
 * label/color derivation by first-appearance order, dissolution-on-shrink,
 * and the Smart-Superset-Scrolling round-robin decision — 02 §8's own
 * acceptance line verbatim: "a 3-member circuit A/B/C all render one shared
 * color with correct labels; scroll cycles through members skipping ones
 * that are fully checked; removing the second-to-last member of a group
 * dissolves it."
 */
import {
  computeDissolution,
  computeSupersetGroups,
  nextSupersetScrollTarget,
  resolveSupersetScrollTarget,
  SUPERSET_PALETTE,
  supersetVisualsByExerciseId,
  type SupersetMemberInput,
  type SupersetScrollExerciseInput,
} from '../supersets';

describe('computeSupersetGroups — labels + colors by first-appearance position order', () => {
  it('a 3-member circuit gets one shared color and labels A for the whole group', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: 0 },
      { id: 'b', position: 1, supersetId: 0 },
      { id: 'c', position: 2, supersetId: 0 },
    ];
    const groups = computeSupersetGroups(exercises);
    expect(groups.size).toBe(1);
    const group = groups.get(0)!;
    expect(group.label).toBe('A');
    expect(group.color).toBe(SUPERSET_PALETTE[0]);
    expect(group.memberIds).toEqual(['a', 'b', 'c']);
  });

  it('assigns B/second-color to the second distinct group encountered by position', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: 5 },
      { id: 'b', position: 1, supersetId: 5 },
      { id: 'c', position: 2, supersetId: 9 },
      { id: 'd', position: 3, supersetId: 9 },
    ];
    const groups = computeSupersetGroups(exercises);
    expect(groups.get(5)!.label).toBe('A');
    expect(groups.get(5)!.color).toBe(SUPERSET_PALETTE[0]);
    expect(groups.get(9)!.label).toBe('B');
    expect(groups.get(9)!.color).toBe(SUPERSET_PALETTE[1]);
  });

  it('first-appearance order follows position, not input array order', () => {
    // group 9 is later in the input array but earlier by position (0) —
    // it must still be labeled "A".
    const exercises: SupersetMemberInput[] = [
      { id: 'c', position: 2, supersetId: 5 },
      { id: 'a', position: 0, supersetId: 9 },
      { id: 'd', position: 3, supersetId: 5 },
      { id: 'b', position: 1, supersetId: 9 },
    ];
    const groups = computeSupersetGroups(exercises);
    expect(groups.get(9)!.label).toBe('A');
    expect(groups.get(5)!.label).toBe('B');
    // Membership within a group is still position-ordered.
    expect(groups.get(9)!.memberIds).toEqual(['a', 'b']);
    expect(groups.get(5)!.memberIds).toEqual(['c', 'd']);
  });

  it('ungrouped exercises (supersetId null) are excluded entirely', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: null },
      { id: 'b', position: 1, supersetId: 0 },
      { id: 'c', position: 2, supersetId: null },
    ];
    const groups = computeSupersetGroups(exercises);
    expect(groups.size).toBe(1);
    expect(groups.get(0)!.memberIds).toEqual(['b']);
  });

  it('returns an empty map when nothing is grouped', () => {
    expect(computeSupersetGroups([]).size).toBe(0);
    expect(
      computeSupersetGroups([{ id: 'a', position: 0, supersetId: null }]).size,
    ).toBe(0);
  });

  it('cycles the 6-color palette past 6 concurrent groups (7th group reuses palette[0])', () => {
    const exercises: SupersetMemberInput[] = Array.from({ length: 7 }, (_, i) => ({
      id: `ex-${i}`,
      position: i,
      supersetId: i,
    }));
    const groups = computeSupersetGroups(exercises);
    expect(groups.get(0)!.color).toBe(SUPERSET_PALETTE[0]);
    expect(groups.get(5)!.color).toBe(SUPERSET_PALETTE[5]);
    expect(groups.get(6)!.color).toBe(SUPERSET_PALETTE[0]);
    expect(groups.get(6)!.label).toBe('G');
  });
});

describe('supersetVisualsByExerciseId', () => {
  it('maps each grouped exercise id to its group label/color; omits ungrouped ids', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: 0 },
      { id: 'b', position: 1, supersetId: 0 },
      { id: 'c', position: 2, supersetId: null },
    ];
    const visuals = supersetVisualsByExerciseId(exercises);
    expect(visuals.get('a')).toEqual({ label: 'A', color: SUPERSET_PALETTE[0] });
    expect(visuals.get('b')).toEqual({ label: 'A', color: SUPERSET_PALETTE[0] });
    expect(visuals.has('c')).toBe(false);
  });

  it('returns an empty map for an all-ungrouped workout', () => {
    expect(supersetVisualsByExerciseId([]).size).toBe(0);
  });
});

describe('computeDissolution — 02 §8 "group of 1 dissolves automatically"', () => {
  it('a 3-member group losing one still has 2 left: no dissolution', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: 0 },
      { id: 'b', position: 1, supersetId: 0 },
      { id: 'c', position: 2, supersetId: 0 },
    ];
    expect(computeDissolution(exercises, 'a')).toEqual([]);
  });

  it('a 2-member group losing one dissolves the last remaining member', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: 0 },
      { id: 'b', position: 1, supersetId: 0 },
    ];
    expect(computeDissolution(exercises, 'a')).toEqual(['b']);
  });

  it('removing an already-ungrouped exercise is a no-op', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: null },
      { id: 'b', position: 1, supersetId: 0 },
    ];
    expect(computeDissolution(exercises, 'a')).toEqual([]);
  });

  it('an unknown id is a no-op', () => {
    const exercises: SupersetMemberInput[] = [{ id: 'a', position: 0, supersetId: 0 }];
    expect(computeDissolution(exercises, 'nonexistent')).toEqual([]);
  });

  it('other groups are untouched by a dissolution in a different group', () => {
    const exercises: SupersetMemberInput[] = [
      { id: 'a', position: 0, supersetId: 0 },
      { id: 'b', position: 1, supersetId: 0 },
      { id: 'c', position: 2, supersetId: 1 },
      { id: 'd', position: 3, supersetId: 1 },
      { id: 'e', position: 4, supersetId: 1 },
    ];
    expect(computeDissolution(exercises, 'c')).toEqual([]);
  });
});

describe('nextSupersetScrollTarget — Smart Superset Scrolling round-robin (02 §8)', () => {
  const members = ['a', 'b', 'c'];

  it('advances to the immediate next member when it still has unchecked sets', () => {
    expect(nextSupersetScrollTarget(members, new Set(), 'a')).toBe('b');
  });

  it('skips a fully-completed member and lands on the one after it', () => {
    expect(nextSupersetScrollTarget(members, new Set(['b']), 'a')).toBe('c');
  });

  it('cycles back to the first member when checking the last member', () => {
    expect(nextSupersetScrollTarget(members, new Set(), 'c')).toBe('a');
  });

  it('returns null when every other member is fully completed (cycles past all of them)', () => {
    expect(nextSupersetScrollTarget(members, new Set(['b', 'c']), 'a')).toBeNull();
  });

  it('never returns currentId itself even if it wraps all the way around', () => {
    const target = nextSupersetScrollTarget(members, new Set(['a', 'c']), 'b');
    // 'a' and 'c' are marked complete; 'b' (current) is intentionally
    // excluded from consideration entirely — so this must be null, not 'b'.
    expect(target).toBeNull();
  });

  it('returns null when currentId is not a member of the list', () => {
    expect(nextSupersetScrollTarget(members, new Set(), 'z')).toBeNull();
  });

  it('returns null for a group with fewer than 2 members (defensive — should never occur post-dissolution)', () => {
    expect(nextSupersetScrollTarget(['a'], new Set(), 'a')).toBeNull();
  });

  it('a 3-member circuit: full cycle A -> B -> C -> A as each gets checked off in turn', () => {
    // Simulates: check a set in A, scroll to B; check B, scroll to C; check
    // C, scroll back to A — matching 02 §8's acceptance example.
    expect(nextSupersetScrollTarget(members, new Set(), 'a')).toBe('b');
    expect(nextSupersetScrollTarget(members, new Set(), 'b')).toBe('c');
    expect(nextSupersetScrollTarget(members, new Set(), 'c')).toBe('a');
  });
});

describe('resolveSupersetScrollTarget — end-to-end decision from raw workout-exercise shapes (02 §8)', () => {
  it('a 3-member circuit skips a fully-completed member and lands on the next one with sets remaining', () => {
    const exercises: SupersetScrollExerciseInput[] = [
      { id: 'a', position: 0, supersetId: 0, sets: [{ isCompleted: false }] },
      // B is fully completed (its one set checked) — must be skipped.
      { id: 'b', position: 1, supersetId: 0, sets: [{ isCompleted: true }] },
      { id: 'c', position: 2, supersetId: 0, sets: [{ isCompleted: false }] },
    ];
    expect(resolveSupersetScrollTarget(exercises, 'a')).toBe('c');
  });

  it('an ungrouped exercise resolves to null', () => {
    const exercises: SupersetScrollExerciseInput[] = [
      { id: 'a', position: 0, supersetId: null, sets: [{ isCompleted: false }] },
    ];
    expect(resolveSupersetScrollTarget(exercises, 'a')).toBeNull();
  });

  it('an exercise with zero sets counts as fully completed (nothing left to check, so it is skipped)', () => {
    const exercises: SupersetScrollExerciseInput[] = [
      { id: 'a', position: 0, supersetId: 0, sets: [{ isCompleted: false }] },
      { id: 'b', position: 1, supersetId: 0, sets: [] },
    ];
    expect(resolveSupersetScrollTarget(exercises, 'a')).toBeNull();
  });

  it('an unknown checked id resolves to null', () => {
    const exercises: SupersetScrollExerciseInput[] = [
      { id: 'a', position: 0, supersetId: 0, sets: [{ isCompleted: false }] },
    ];
    expect(resolveSupersetScrollTarget(exercises, 'nonexistent')).toBeNull();
  });

  it('a 2-member group advances to the other member when it still has unchecked sets', () => {
    const exercises: SupersetScrollExerciseInput[] = [
      { id: 'a', position: 0, supersetId: 0, sets: [{ isCompleted: true }, { isCompleted: false }] },
      { id: 'b', position: 1, supersetId: 0, sets: [{ isCompleted: false }] },
    ];
    expect(resolveSupersetScrollTarget(exercises, 'a')).toBe('b');
  });
});
