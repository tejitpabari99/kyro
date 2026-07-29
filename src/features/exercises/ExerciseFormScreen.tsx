/**
 * `ExerciseFormScreen` (M1-09/M1-10) — 03 §5's custom-exercise create/edit
 * form, shared by both routes (`app/exercise/new.tsx` / `app/exercise/
 * [id]/edit.tsx`) via a `mode` prop — the same "feature component owns
 * data + layout, route file only wires real deps" split every other
 * `src/features/exercises/*Screen.tsx` already established
 * (`ExerciseBrowseScreen`/`ExerciseDetailScreen`).
 *
 * **Fields** (03 §5): image (optional, library/camera via
 * `@/lib/files`'s `pickExercisePhoto`/`saveExercisePhoto` seam, M1-09),
 * name (required, inline duplicate error surfaced from the repository's
 * own `DuplicateExerciseNameError` — no client-side pre-check duplicated
 * here), exercise type (required, `ExerciseTypeSheet`; **disabled with an
 * explanation** once `ExerciseRepository.hasLoggedSets` — M1-10's addition
 * to the interface — reports `true` for the exercise being edited),
 * equipment (default `none`, `FilterOptionSheet`), primary muscle
 * (required, `FilterOptionSheet`), secondary muscles (optional multi-select,
 * `MultiSelectOptionSheet`), instructions (optional multiline, split on
 * newlines on save), "Track extra metric" toggle -> `usesCustomMetric`.
 *
 * **Image save ordering (why photo I/O happens *after* `create`/`update`,
 * never before):** a freshly-picked photo lives only in local state
 * (`pickedImage`, the raw `{uri, width, height}` from the picker) until
 * `handleSave` actually runs. `saveExercisePhoto` needs a real exercise id
 * to build `photos/exercises/{exerciseId}/...` (05 §8) — for **create**,
 * that id doesn't exist until `repository.create()` returns it (`create`
 * always mints its own uuid internally, M1-06 — this screen never
 * pre-generates one), so the sequence is always: create/update the row
 * first (without any image field), *then* crop+store the photo now that a
 * real id exists, *then* one more `repository.update(id, {images:[...]})`
 * to attach the resulting relative file name. This also means an
 * abandoned create (navigate away before tapping Save) never orphans a
 * photo file — nothing is written to disk until Save actually commits.
 *
 * **Duplicate-as-custom prefill:** see `exercise-form-prefill.ts`'s header
 * for the full param-contract writeup; this component just consumes
 * whatever `prefill` prop the route (`app/exercise/new.tsx`) resolved
 * (either from that store or from the plain `name` query param), it has no
 * opinion on which source it came from.
 */
import React, { useState } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  EXERCISE_TYPE_LABELS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type Equipment,
  type ExerciseType,
  type MuscleGroup,
} from '@/domain/enums';
import type { CustomExerciseFields, Exercise, ExerciseRepository } from '@/data/exercises/types';
import { DuplicateExerciseNameError } from '@/data/exercises/errors';
import {
  deleteExercisePhoto,
  exercisePhotoUri,
  pickExercisePhoto,
  saveExercisePhoto,
  type ExercisePhotoPickSource,
  type PickedExercisePhoto,
} from '@/lib/files';
import { Button } from '@/ui/Button';
import { ListRow } from '@/ui/ListRow';
import { useTheme } from '@/ui/theme-provider';

import { ExerciseTypeSheet } from './ExerciseTypeSheet';
import { FilterOptionSheet } from './FilterOptionSheet';
import { MultiSelectOptionSheet } from './MultiSelectOptionSheet';
import type { ExerciseFormPrefill } from './exercise-form-prefill';

export interface ExerciseFormScreenProps {
  repository: ExerciseRepository;
  mode: 'create' | 'edit';
  /** Required when `mode === 'edit'`. */
  exerciseId?: string;
  /** create-only: M1-07's empty-search-shortcut/`+`-button `name` query param. Ignored when `prefill` is given. */
  initialName?: string;
  /** create-only: Duplicate-as-Custom's full field prefill (M1-10). */
  prefill?: ExerciseFormPrefill | null;
  testID?: string;
}

interface FormState {
  name: string;
  exerciseType: ExerciseType | null;
  primaryMuscleGroup: MuscleGroup | null;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: Equipment;
  instructionsText: string;
  usesCustomMetric: boolean;
}

function buildInitialState(prefill?: ExerciseFormPrefill | null, initialName?: string): FormState {
  if (prefill) {
    return {
      name: prefill.name,
      exerciseType: prefill.exerciseType,
      primaryMuscleGroup: prefill.primaryMuscleGroup,
      secondaryMuscleGroups: prefill.secondaryMuscleGroups,
      equipment: prefill.equipment,
      instructionsText: prefill.instructions.join('\n'),
      usesCustomMetric: prefill.usesCustomMetric,
    };
  }
  return {
    name: initialName ?? '',
    exerciseType: null,
    primaryMuscleGroup: null,
    secondaryMuscleGroups: [],
    equipment: 'none',
    instructionsText: '',
    usesCustomMetric: false,
  };
}

function stateFromExercise(exercise: Exercise): FormState {
  return {
    name: exercise.name,
    exerciseType: exercise.exerciseType,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    secondaryMuscleGroups: exercise.secondaryMuscleGroups,
    equipment: exercise.equipment,
    instructionsText: exercise.instructions.join('\n'),
    usesCustomMetric: exercise.usesCustomMetric,
  };
}

export function ExerciseFormScreen({
  repository,
  mode,
  exerciseId,
  initialName,
  prefill,
  testID = 'exercise-form-screen',
}: ExerciseFormScreenProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const existingQuery = useQuery({
    queryKey: ['exercises', 'detail', exerciseId],
    queryFn: () => repository.get(exerciseId as string),
    enabled: mode === 'edit' && exerciseId != null,
  });
  const hasLoggedSetsQuery = useQuery({
    queryKey: ['exercises', 'has-logged-sets', exerciseId],
    queryFn: () => repository.hasLoggedSets(exerciseId as string),
    enabled: mode === 'edit' && exerciseId != null,
  });

  const [form, setForm] = useState<FormState>(() => buildInitialState(prefill, initialName));
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [existingImageFileName, setExistingImageFileName] = useState<string | null>(null);

  // Mid-render state sync from the async `existingQuery` (same pattern
  // `ExerciseMedia.tsx`, M1-08, already uses for "adjust state when an
  // external value changes" rather than a `useEffect` + extra re-render —
  // runs exactly once per loaded exercise id, never re-clobbers in-progress
  // edits on a background refetch of the same id).
  if (mode === 'edit' && existingQuery.data != null && hydratedId !== existingQuery.data.id) {
    setHydratedId(existingQuery.data.id);
    setForm(stateFromExercise(existingQuery.data));
    setExistingImageFileName(existingQuery.data.images[0] ?? null);
  }

  const [pickedImage, setPickedImage] = useState<PickedExercisePhoto | null>(null);
  const [imageCleared, setImageCleared] = useState(false);

  const [typeSheetVisible, setTypeSheetVisible] = useState(false);
  const [equipmentSheetVisible, setEquipmentSheetVisible] = useState(false);
  const [muscleSheetVisible, setMuscleSheetVisible] = useState(false);
  const [secondarySheetVisible, setSecondarySheetVisible] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [muscleError, setMuscleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const typeFieldDisabled =
    mode === 'edit' && (hasLoggedSetsQuery.isLoading || hasLoggedSetsQuery.data === true);
  const typeLocked = mode === 'edit' && hasLoggedSetsQuery.data === true;

  const previewUri = pickedImage
    ? pickedImage.uri
    : !imageCleared && existingImageFileName && exerciseId
      ? exercisePhotoUri(exerciseId, existingImageFileName)
      : null;

  const handlePickImage = async (source: ExercisePhotoPickSource): Promise<void> => {
    const result = await pickExercisePhoto(source);
    if (result) {
      setPickedImage(result);
      setImageCleared(false);
    }
  };

  const handleRemoveImage = (): void => {
    setPickedImage(null);
    setImageCleared(true);
  };

  const handleSave = async (): Promise<void> => {
    setNameError(null);
    setTypeError(null);
    setMuscleError(null);
    setSubmitError(null);

    const trimmedName = form.name.trim();
    let hasError = false;
    if (trimmedName.length === 0) {
      setNameError('Name is required.');
      hasError = true;
    }
    if (!form.exerciseType) {
      setTypeError('Exercise type is required.');
      hasError = true;
    }
    if (!form.primaryMuscleGroup) {
      setMuscleError('Primary muscle is required.');
      hasError = true;
    }
    if (hasError) {
      return;
    }

    const instructions = form.instructionsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setSaving(true);
    try {
      let saved: Exercise;
      if (mode === 'create') {
        saved = await repository.create({
          name: trimmedName,
          exerciseType: form.exerciseType as ExerciseType,
          primaryMuscleGroup: form.primaryMuscleGroup as MuscleGroup,
          secondaryMuscleGroups: form.secondaryMuscleGroups,
          equipment: form.equipment,
          instructions,
          usesCustomMetric: form.usesCustomMetric,
        });
      } else {
        const patch: Partial<CustomExerciseFields> = {
          name: trimmedName,
          primaryMuscleGroup: form.primaryMuscleGroup as MuscleGroup,
          secondaryMuscleGroups: form.secondaryMuscleGroups,
          equipment: form.equipment,
          instructions,
          usesCustomMetric: form.usesCustomMetric,
        };
        if (!typeLocked) {
          patch.exerciseType = form.exerciseType as ExerciseType;
        }
        saved = await repository.update(exerciseId as string, patch);
      }

      if (pickedImage) {
        const fileName = await saveExercisePhoto(saved.id, pickedImage);
        if (existingImageFileName && existingImageFileName !== fileName) {
          await deleteExercisePhoto(saved.id, existingImageFileName);
        }
        saved = await repository.update(saved.id, { images: [fileName] });
      } else if (mode === 'edit' && imageCleared && existingImageFileName) {
        await deleteExercisePhoto(saved.id, existingImageFileName);
        saved = await repository.update(saved.id, { images: [] });
      }

      await queryClient.invalidateQueries({ queryKey: ['exercises'] });

      if (mode === 'create') {
        router.replace(`/exercise/${saved.id}` as never);
      } else {
        router.back();
      }
    } catch (error) {
      if (error instanceof DuplicateExerciseNameError) {
        setNameError(error.message);
      } else {
        setSubmitError('Something went wrong saving this exercise. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'edit' && existingQuery.isLoading) {
    return (
      <View testID={testID} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

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
        <Button
          label="Cancel"
          variant="ghost"
          size="sm"
          testID={`${testID}-cancel`}
          onPress={() => router.back()}
        />
        <Text style={[typography.headline, { color: colors.text.primary }]}>
          {mode === 'create' ? 'New Exercise' : 'Edit Exercise'}
        </Text>
        <Button
          label="Save"
          variant="ghost"
          size="sm"
          loading={saving}
          testID={`${testID}-save`}
          onPress={() => void handleSave()}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing['4'] }}>
        {submitError ? (
          <Text
            testID={`${testID}-submit-error`}
            style={[typography.subhead, { color: colors.semantic.danger, marginBottom: spacing['3'] }]}
          >
            {submitError}
          </Text>
        ) : null}

        {/* Photo */}
        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: spacing['2'] }]}>
            PHOTO
          </Text>
          {previewUri ? (
            <Image
              testID={`${testID}-image-preview`}
              source={{ uri: previewUri }}
              style={{ width: 96, height: 96, borderRadius: radii.sm, marginBottom: spacing['2'] }}
              contentFit="cover"
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing['2'] }}>
            <Button
              label="Camera"
              variant="tonal"
              size="sm"
              testID={`${testID}-pick-camera`}
              onPress={() => void handlePickImage('camera')}
            />
            <Button
              label="Library"
              variant="tonal"
              size="sm"
              testID={`${testID}-pick-library`}
              onPress={() => void handlePickImage('library')}
            />
            {previewUri ? (
              <Button
                label="Remove"
                variant="destructive"
                size="sm"
                testID={`${testID}-remove-image`}
                onPress={handleRemoveImage}
              />
            ) : null}
          </View>
        </View>

        {/* Name */}
        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: spacing['1'] }]}>
            NAME
          </Text>
          <TextInput
            testID={`${testID}-name-input`}
            value={form.name}
            onChangeText={(text) => {
              setForm((f) => ({ ...f, name: text }));
              setNameError(null);
            }}
            placeholder="Exercise name"
            placeholderTextColor={colors.text.tertiary}
            style={[
              typography.body,
              {
                minHeight: 44,
                backgroundColor: colors.bg.elevated,
                borderRadius: radii.sm,
                paddingHorizontal: spacing['3'],
                color: colors.text.primary,
              },
            ]}
          />
          {nameError ? (
            <Text
              testID={`${testID}-name-error`}
              style={[typography.footnote, { color: colors.semantic.danger, marginTop: spacing['1'] }]}
            >
              {nameError}
            </Text>
          ) : null}
        </View>

        {/* Exercise type */}
        <View style={{ marginBottom: spacing['5'] }}>
          <ListRow
            testID={`${testID}-type-row`}
            title="Exercise Type"
            subtitle={form.exerciseType ? EXERCISE_TYPE_LABELS[form.exerciseType] : 'Required'}
            chevron={!typeFieldDisabled}
            disabled={typeFieldDisabled}
            onPress={typeFieldDisabled ? undefined : () => setTypeSheetVisible(true)}
          />
          {typeLocked ? (
            <Text
              testID={`${testID}-type-locked-explanation`}
              style={[typography.footnote, { color: colors.text.tertiary, marginTop: spacing['1'] }]}
            >
              This exercise has a logged set — its type can&apos;t be changed.
            </Text>
          ) : null}
          {typeError ? (
            <Text
              testID={`${testID}-type-error`}
              style={[typography.footnote, { color: colors.semantic.danger, marginTop: spacing['1'] }]}
            >
              {typeError}
            </Text>
          ) : null}
        </View>

        {/* Equipment */}
        <View style={{ marginBottom: spacing['5'] }}>
          <ListRow
            testID={`${testID}-equipment-row`}
            title="Equipment"
            subtitle={EQUIPMENT_LABELS[form.equipment]}
            chevron
            onPress={() => setEquipmentSheetVisible(true)}
          />
        </View>

        {/* Primary muscle */}
        <View style={{ marginBottom: spacing['5'] }}>
          <ListRow
            testID={`${testID}-primary-muscle-row`}
            title="Primary Muscle"
            subtitle={
              form.primaryMuscleGroup ? MUSCLE_GROUP_LABELS[form.primaryMuscleGroup] : 'Required'
            }
            chevron
            onPress={() => setMuscleSheetVisible(true)}
          />
          {muscleError ? (
            <Text
              testID={`${testID}-primary-muscle-error`}
              style={[typography.footnote, { color: colors.semantic.danger, marginTop: spacing['1'] }]}
            >
              {muscleError}
            </Text>
          ) : null}
        </View>

        {/* Secondary muscles */}
        <View style={{ marginBottom: spacing['5'] }}>
          <ListRow
            testID={`${testID}-secondary-muscles-row`}
            title="Secondary Muscles"
            subtitle={
              form.secondaryMuscleGroups.length > 0
                ? form.secondaryMuscleGroups.map((m) => MUSCLE_GROUP_LABELS[m]).join(', ')
                : 'None'
            }
            chevron
            onPress={() => setSecondarySheetVisible(true)}
          />
        </View>

        {/* Instructions */}
        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: spacing['1'] }]}>
            INSTRUCTIONS
          </Text>
          <TextInput
            testID={`${testID}-instructions-input`}
            value={form.instructionsText}
            onChangeText={(text) => setForm((f) => ({ ...f, instructionsText: text }))}
            placeholder={'One step per line'}
            placeholderTextColor={colors.text.tertiary}
            multiline
            style={[
              typography.body,
              {
                minHeight: 96,
                backgroundColor: colors.bg.elevated,
                borderRadius: radii.sm,
                padding: spacing['3'],
                color: colors.text.primary,
                textAlignVertical: 'top',
              },
            ]}
          />
        </View>

        {/* Track extra metric */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['6'],
          }}
        >
          <View style={{ flex: 1, marginRight: spacing['3'] }}>
            <Text style={[typography.body, { color: colors.text.primary }]}>Track extra metric</Text>
            <Text style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}>
              Adds a CUSTOM column in the logger.
            </Text>
          </View>
          <Switch
            testID={`${testID}-custom-metric-switch`}
            value={form.usesCustomMetric}
            onValueChange={(value) => setForm((f) => ({ ...f, usesCustomMetric: value }))}
            trackColor={{ true: colors.accent.primary, false: colors.border.input }}
          />
        </View>
      </ScrollView>

      <ExerciseTypeSheet
        testID={`${testID}-type-sheet`}
        visible={typeSheetVisible}
        onDismiss={() => setTypeSheetVisible(false)}
        value={form.exerciseType}
        onChange={(value) => {
          setForm((f) => ({ ...f, exerciseType: value }));
          setTypeError(null);
        }}
      />
      <FilterOptionSheet
        testID={`${testID}-equipment-sheet`}
        visible={equipmentSheetVisible}
        onDismiss={() => setEquipmentSheetVisible(false)}
        title="Equipment"
        options={EQUIPMENT_OPTIONS}
        value={form.equipment}
        onChange={(value) => setForm((f) => ({ ...f, equipment: value ?? 'none' }))}
      />
      <FilterOptionSheet
        testID={`${testID}-primary-muscle-sheet`}
        visible={muscleSheetVisible}
        onDismiss={() => setMuscleSheetVisible(false)}
        title="Primary Muscle"
        options={MUSCLE_GROUP_OPTIONS}
        value={form.primaryMuscleGroup}
        onChange={(value) => {
          setForm((f) => ({ ...f, primaryMuscleGroup: value }));
          setMuscleError(null);
        }}
      />
      <MultiSelectOptionSheet
        testID={`${testID}-secondary-muscles-sheet`}
        visible={secondarySheetVisible}
        onDismiss={() => setSecondarySheetVisible(false)}
        title="Secondary Muscles"
        options={MUSCLE_GROUP_OPTIONS}
        value={form.secondaryMuscleGroups}
        onChange={(value) => setForm((f) => ({ ...f, secondaryMuscleGroups: value }))}
      />
    </View>
  );
}
