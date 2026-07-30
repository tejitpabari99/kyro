/**
 * `ExerciseBrowseScreen` (M1-07) — 03 §2's full library browse screen:
 * header + `+` create shortcut, debounced search, equipment/muscle filter
 * chips (each opening a `FilterOptionSheet`), a `Recent` section (hidden
 * while searching/filtering, 03 §2), an alphabetical `All` section with
 * sticky per-letter headers, a right-edge A–Z index rail, and a "no
 * matches" empty state with a `Create "{query}"` shortcut.
 *
 * Picker mode (multi-select sheet presentation, superset toggle, "Add N
 * exercises" button — 03 §2) is explicitly **not** built here: this task
 * (M1-07) only has to shape the screen so M2-09 can reuse it, per this
 * task's own scoping note. Nothing below assumes single-tap-navigates —
 * that's a deliberate seam, not an oversight.
 *
 * --- Data flow (06 §4 / §8) -------------------------------------------
 * `ExerciseRepository.list()` (no filter args — the default excludes
 * archived rows, 05 §6) is loaded **once** via TanStack Query and kept in
 * memory; every keystroke/filter change re-filters that same in-memory
 * array (`exercise-list-model.ts`'s `filterExercises`) instead of
 * re-querying SQLite — 06 §8's explicit perf tactic for this screen ("search
 * debounce 150 ms in-memory over preloaded array"). `recentlyUsed(10)` is a
 * second, independent query (03 §2: "last 10 distinct exercises logged").
 *
 * --- Two navigation seams left open for later tasks --------------------
 * Both `router.push` calls below target routes that do not exist yet in
 * this milestone — intentionally (see each call site's comment and this
 * task's own instructions: "wire the intended navigation call ... don't
 * build a fake target screen"). `docs/plan/EXECUTION-LOG.md`'s M1-07 entry
 * documents both for the tasks that land them:
 *  - `/exercise/new` (+ optional `name` param) — the create-custom-exercise
 *    form, M1-09.
 *  - `/exercise/[id]` — the exercise detail screen, M1-08.
 *
 * --- Back button (PRD I §4.2/§4.5) --------------------------------------
 * This screen correctly had no back control while it was a tab root; the
 * tabs-navigation-restructure PRD relocates it under `profile/exercises.tsx`
 * (no longer its own tab), so it's now a pushed route and needs one. A
 * mechanical, narrow carve-out from this file's "internal content
 * untouched" scope — not a content/logic change — matching the same
 * hand-rolled `ChevronLeft` + `Pressable` + `router.back()` convention
 * `ArchivedExercisesScreen.tsx` already established.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus, Search as SearchIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type Equipment,
  type MuscleGroup,
} from '@/domain/enums';
import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { SearchBar } from '@/ui/SearchBar';
import { useTheme } from '@/ui/theme-provider';

import { AzRail } from './AzRail';
import {
  buildExerciseRows,
  filterExercises,
  isBrowsingUnfiltered,
  type ExerciseBrowseRow,
  type ExerciseFilterState,
} from './exercise-list-model';
import { ExerciseRow, EXERCISE_ROW_HEIGHT } from './ExerciseRow';
import { FilterOptionSheet } from './FilterOptionSheet';
import { SectionHeaderRow, SECTION_HEADER_HEIGHT } from './SectionHeaderRow';

/** 03 §2 / 06 §8: search updates are debounced 150 ms. */
const SEARCH_DEBOUNCE_MS = 150;
const RECENT_LIMIT = 10;

export interface ExerciseBrowseScreenProps {
  repository: ExerciseRepository;
  testID?: string;
}

export function ExerciseBrowseScreen({
  repository,
  testID = 'exercise-browse-screen',
}: ExerciseBrowseScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | null>(null);
  const [equipmentSheetVisible, setEquipmentSheetVisible] = useState(false);
  const [muscleSheetVisible, setMuscleSheetVisible] = useState(false);

  // 150 ms debounce (06 §8) — re-armed on every keystroke, applied once idle.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const allQuery = useQuery({
    queryKey: ['exercises', 'browse-all'],
    queryFn: () => repository.list(),
  });
  const recentQuery = useQuery({
    queryKey: ['exercises', 'recent', RECENT_LIMIT],
    queryFn: () => repository.recentlyUsed(RECENT_LIMIT),
  });

  const filterState: ExerciseFilterState = useMemo(
    () => ({ query: debouncedQuery, muscle: muscleFilter, equipment: equipmentFilter }),
    [debouncedQuery, muscleFilter, equipmentFilter],
  );

  const all = useMemo(() => allQuery.data ?? [], [allQuery.data]);
  const recent = useMemo(() => recentQuery.data ?? [], [recentQuery.data]);
  const filtered = useMemo(() => filterExercises(all, filterState), [all, filterState]);
  const unfiltered = isBrowsingUnfiltered(filterState);
  const showRecent = unfiltered && recent.length > 0;

  const { rows, sectionIndex } = useMemo(
    () => buildExerciseRows({ recent, all: filtered, showRecent }),
    [recent, filtered, showRecent],
  );

  const stickyHeaderIndices = useMemo(
    () => rows.reduce<number[]>((acc, row, index) => {
      if (row.type === 'header') acc.push(index);
      return acc;
    }, []),
    [rows],
  );

  const availableLetters = useMemo(
    () => new Set(Object.keys(sectionIndex).filter((key) => key !== 'Recent')),
    [sectionIndex],
  );

  const listRef = useRef<FlashListRef<ExerciseBrowseRow>>(null);

  const handleSelectLetter = useCallback(
    (letter: string) => {
      const index = sectionIndex[letter];
      if (index === undefined) return;
      listRef.current?.scrollToIndex({ index, animated: true });
    },
    [sectionIndex],
  );

  const handleRowPress = useCallback((exercise: Exercise) => {
    // Seam for M1-08 (exercise detail screen, route not built yet) — see
    // file header. Wired now so this screen doesn't need touching again.
    router.push(`/exercise/${exercise.id}` as never);
  }, []);

  const handleCreatePress = useCallback(() => {
    const name = debouncedQuery.trim();
    // Seam for M1-09 (custom-exercise create form, route not built yet) —
    // see file header.
    router.push({ pathname: '/exercise/new' as never, params: name ? { name } : undefined });
  }, [debouncedQuery]);

  const renderItem = useCallback(
    ({ item }: { item: ExerciseBrowseRow }) => {
      if (item.type === 'header') {
        return <SectionHeaderRow label={item.label} />;
      }
      return <ExerciseRow exercise={item.exercise} onPress={handleRowPress} />;
    },
    [handleRowPress],
  );

  const equipmentChipLabel = equipmentFilter ? EQUIPMENT_LABELS[equipmentFilter] : 'All Equipment';
  const muscleChipLabel = muscleFilter ? MUSCLE_GROUP_LABELS[muscleFilter] : 'All Muscles';

  const trimmedQuery = debouncedQuery.trim();
  const showEmptyState = !allQuery.isLoading && rows.length === 0;

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing['4'],
          // BUGFIX-01: `insets.top` clears the status bar/notch — see
          // `app/_layout.tsx`'s header.
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            testID={`${testID}-back`}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => router.back()}
            style={{ marginRight: spacing['3'] }}
          >
            <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
          </Pressable>
          <Text style={[typography.title1, { color: colors.text.primary }]}>Exercises</Text>
        </View>
        <Pressable
          testID={`${testID}-create-button`}
          accessibilityRole="button"
          accessibilityLabel="Create exercise"
          hitSlop={8}
          onPress={() => {
            // Same M1-09 seam as the empty-state CTA below, no query prefill.
            router.push({ pathname: '/exercise/new' as never, params: undefined });
          }}
        >
          <Plus size={24} strokeWidth={1.75} color={colors.accent.text} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing['4'], marginBottom: spacing['3'] }}>
        <SearchBar
          testID={`${testID}-search`}
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search exercises"
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: spacing['4'],
          marginBottom: spacing['3'],
          gap: spacing['2'],
        }}
      >
        <Chip
          testID={`${testID}-equipment-chip`}
          label={equipmentChipLabel}
          active={equipmentFilter != null}
          onPress={() => setEquipmentSheetVisible(true)}
        />
        <Chip
          testID={`${testID}-muscle-chip`}
          label={muscleChipLabel}
          active={muscleFilter != null}
          onPress={() => setMuscleSheetVisible(true)}
        />
      </View>

      {allQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : allQuery.isError ? (
        <EmptyState
          testID={`${testID}-error`}
          icon={<SearchIcon size={40} strokeWidth={1.75} color={colors.semantic.danger} />}
          title="Couldn't load exercises"
          caption="Something went wrong loading the exercise library."
          cta={
            <Button
              label="Retry"
              variant="tonal"
              onPress={() => void allQuery.refetch()}
              testID={`${testID}-retry`}
            />
          }
        />
      ) : showEmptyState ? (
        <EmptyState
          testID={`${testID}-empty`}
          icon={<SearchIcon size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="No exercises found"
          caption={
            trimmedQuery.length > 0
              ? undefined
              : 'Try adjusting your filters.'
          }
          cta={
            trimmedQuery.length > 0 ? (
              <Button
                label={`Create "${trimmedQuery}"`}
                variant="tonal"
                onPress={handleCreatePress}
                testID={`${testID}-create-cta`}
              />
            ) : undefined
          }
        />
      ) : (
        <View style={{ flex: 1 }}>
          <FlashList
            testID={`${testID}-list`}
            ref={listRef}
            data={rows}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.type}
            stickyHeaderIndices={stickyHeaderIndices}
            renderItem={renderItem}
            extraData={handleRowPress}
          />
          <AzRail
            testID={`${testID}-az-rail`}
            availableLetters={availableLetters}
            onSelectLetter={handleSelectLetter}
          />
        </View>
      )}

      <FilterOptionSheet
        testID={`${testID}-equipment-sheet`}
        visible={equipmentSheetVisible}
        onDismiss={() => setEquipmentSheetVisible(false)}
        title="Equipment"
        options={EQUIPMENT_OPTIONS}
        value={equipmentFilter}
        onChange={setEquipmentFilter}
      />
      <FilterOptionSheet
        testID={`${testID}-muscle-sheet`}
        visible={muscleSheetVisible}
        onDismiss={() => setMuscleSheetVisible(false)}
        title="Muscle"
        options={MUSCLE_GROUP_OPTIONS}
        value={muscleFilter}
        onChange={setMuscleFilter}
      />
    </View>
  );
}

// Re-exported for row-height parity checks in tests/consumers that need it
// (e.g. verifying the "fixed row height" perf tactic, 06 §8) without
// reaching into `ExerciseRow.tsx` directly.
export { EXERCISE_ROW_HEIGHT, SECTION_HEADER_HEIGHT };
