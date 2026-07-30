/**
 * `ExercisePickerSheet` (M2-09) — 03 §2's "Picker mode": "same screen
 * presented as a sheet with multi-select checkmarks, a selection counter,
 * `Superset` toggle, and bottom `Add N exercises` button ... Single-tap in
 * picker selects; info button (ⓘ) on the row opens detail without
 * selecting." Also serves ⋯ → Replace Exercise (02 §3), a single-select
 * variant of the same screen (`mode="replace"`: tapping a row commits
 * immediately, no counter/toggle/confirm step).
 *
 * Reuses M1-07's actual browse building blocks rather than re-implementing
 * them: `exercise-list-model.ts` (search/filter/section logic, pure),
 * `AzRail`, `SectionHeaderRow`, `FilterOptionSheet`, `ExerciseRow` (extended
 * by this task with the optional `selected`/`onInfoPress` picker props),
 * and the same `FlashList` virtualization `ExerciseBrowseScreen` uses for
 * the 873-row list (06 §8). `ExerciseBrowseScreen` itself is **not** reused
 * directly — its own row press is hardcoded to `router.push` navigation
 * (that screen's file header: "Nothing below assumes single-tap-navigates
 * — that's a deliberate seam, not an oversight"), so this component is the
 * sheet-presented, selection-aware assembly that seam was left open for.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Settings as SettingsIcon } from 'lucide-react-native';

import {
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type Equipment,
  type MuscleGroup,
} from '@/domain/enums';
import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutRepository } from '@/data/workouts/types';
import { AzRail } from '@/features/exercises/AzRail';
import {
  buildExerciseRows,
  filterExercises,
  isBrowsingUnfiltered,
  type ExerciseBrowseRow,
  type ExerciseFilterState,
} from '@/features/exercises/exercise-list-model';
import { ExerciseRow } from '@/features/exercises/ExerciseRow';
import { FilterOptionSheet } from '@/features/exercises/FilterOptionSheet';
import { SectionHeaderRow } from '@/features/exercises/SectionHeaderRow';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { SearchBar } from '@/ui/SearchBar';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useTheme } from '@/ui/theme-provider';

import { ExerciseDetailSheet } from './ExerciseDetailSheet';
import { ExercisePickerOptionsSheet } from './ExercisePickerOptionsSheet';

const SEARCH_DEBOUNCE_MS = 150;
const RECENT_LIMIT = 10;

export type ExercisePickerMode = 'add' | 'replace';

export interface ExercisePickerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  repository: ExerciseRepository;
  /** M4-09: threaded straight through to the ⓘ info button's `ExerciseDetailSheet` — see that component's own `workoutRepository` doc comment. Optional; omitted call sites (e.g. the routine editor's picker, which has no natural `WorkoutRepository` in scope) just fall back to the sheet's pre-M4-09 empty states. */
  workoutRepository?: Pick<WorkoutRepository, 'exerciseHistory'>;
  mode: ExercisePickerMode;
  /** `mode: "add"` — selected exercise ids in tap (selection) order, plus whether the Superset toggle was on. */
  onAdd?: (exerciseIds: string[], superset: boolean) => void;
  /** `mode: "replace"` — the single chosen exercise id. */
  onReplace?: (exerciseId: string) => void;
  testID?: string;
}

export function ExercisePickerSheet({
  visible,
  onDismiss,
  repository,
  workoutRepository,
  mode,
  onAdd,
  onReplace,
  testID = 'exercise-picker-sheet',
}: ExercisePickerSheetProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | null>(null);
  const [equipmentSheetVisible, setEquipmentSheetVisible] = useState(false);
  const [muscleSheetVisible, setMuscleSheetVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [superset, setSuperset] = useState(false);
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);

  // Reset every transient picker state on each open transition — the same
  // mid-render "derive state from a prop change" pattern used throughout
  // this feature (`NoteEditSheet`, `ReorderExercisesSheet`) — so a stale
  // selection/search from a previous open never leaks into the next.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSearchInput('');
      setDebouncedQuery('');
      setMuscleFilter(null);
      setEquipmentFilter(null);
      setSelectedIds([]);
      setSuperset(false);
      setDetailExerciseId(null);
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const allQuery = useQuery({
    queryKey: ['exercises', 'browse-all'],
    queryFn: () => repository.list(),
    enabled: visible,
  });
  const recentQuery = useQuery({
    queryKey: ['exercises', 'recent', RECENT_LIMIT],
    queryFn: () => repository.recentlyUsed(RECENT_LIMIT),
    enabled: visible,
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
    () =>
      rows.reduce<number[]>((acc, row, index) => {
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

  const handleRowPress = useCallback(
    (exercise: Exercise) => {
      if (mode === 'replace') {
        onReplace?.(exercise.id);
        onDismiss();
        return;
      }
      setSelectedIds((current) =>
        current.includes(exercise.id)
          ? current.filter((id) => id !== exercise.id)
          : [...current, exercise.id],
      );
    },
    [mode, onReplace, onDismiss],
  );

  const handleInfoPress = useCallback((exercise: Exercise) => {
    setDetailExerciseId(exercise.id);
  }, []);

  const handleConfirmAdd = (): void => {
    if (selectedIds.length === 0) {
      return;
    }
    onAdd?.(selectedIds, superset);
    onDismiss();
  };

  const renderItem = useCallback(
    ({ item }: { item: ExerciseBrowseRow }) => {
      if (item.type === 'header') {
        return <SectionHeaderRow label={item.label} />;
      }
      return (
        <ExerciseRow
          exercise={item.exercise}
          onPress={handleRowPress}
          onInfoPress={handleInfoPress}
          selected={mode === 'add' ? selectedIds.includes(item.exercise.id) : undefined}
        />
      );
    },
    [handleRowPress, handleInfoPress, mode, selectedIds],
  );

  const equipmentChipLabel = equipmentFilter ? EQUIPMENT_LABELS[equipmentFilter] : 'All Equipment';
  const muscleChipLabel = muscleFilter ? MUSCLE_GROUP_LABELS[muscleFilter] : 'All Muscles';
  const showEmptyState = !allQuery.isLoading && rows.length === 0;

  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing['4'],
            paddingBottom: spacing['2'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>
            {mode === 'replace' ? 'Replace Exercise' : 'Add Exercise'}
          </Text>
          <Button
            testID={`${testID}-cancel`}
            label="Cancel"
            variant="ghost"
            size="sm"
            onPress={onDismiss}
          />
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

        {mode === 'add' ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing['4'],
              marginBottom: spacing['3'],
            }}
          >
            <Chip
              testID={`${testID}-superset-toggle`}
              label="Superset"
              active={superset}
              showCaret={false}
              onPress={() => setSuperset((current) => !current)}
            />
            <Text
              testID={`${testID}-counter`}
              style={[typography.subhead, { color: colors.text.secondary }]}
            >
              {selectedIds.length} selected
            </Text>
          </View>
        ) : null}

        {allQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.accent.primary} />
          </View>
        ) : showEmptyState ? (
          <EmptyState
            testID={`${testID}-empty`}
            icon={<Text style={{ fontSize: 32 }}>🔍</Text>}
            title="No exercises found"
            caption="Try adjusting your search or filters."
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
              extraData={`${mode}:${selectedIds.join(',')}`}
            />
            <AzRail
              testID={`${testID}-az-rail`}
              availableLetters={availableLetters}
              onSelectLetter={handleSelectLetter}
            />
          </View>
        )}

        {mode === 'add' ? (
          <View style={{ padding: spacing['4'] }}>
            <Button
              testID={`${testID}-confirm`}
              label={`Add ${selectedIds.length} Exercise${selectedIds.length === 1 ? '' : 's'}`}
              variant="primary"
              size="lg"
              disabled={selectedIds.length === 0}
              onPress={handleConfirmAdd}
            />
          </View>
        ) : null}
      </View>

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
      <ExerciseDetailSheet
        testID={`${testID}-detail-sheet`}
        visible={detailExerciseId != null}
        onDismiss={() => setDetailExerciseId(null)}
        repository={repository}
        workoutRepository={workoutRepository}
        exerciseId={detailExerciseId}
      />
    </Sheet>
  );
}
