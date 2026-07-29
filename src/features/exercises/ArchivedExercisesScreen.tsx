/**
 * `ArchivedExercisesScreen` (M1-10) — 03 §5 / 04 §7: "Archived list lives
 * under Profile → Exercises → Archived, with Restore." Lists every archived
 * custom exercise (`repository.list({includeArchived:true})`, filtered
 * client-side to `archivedAt != null` — `ExerciseRepository.list` has no
 * archived-only filter of its own, and this screen's expected row count is
 * small enough that filtering the one extra query result in memory needs
 * no new repository method) with a Restore action per row.
 *
 * Built-ins are never archived by a user action (only the M1-05 dataset-
 * seed path archives a *removed* built-in) but nothing here excludes them
 * from this list either — 03 §5's rule is about *archived exercises* in
 * general, not customs specifically, and a removed built-in restored here
 * would go through the exact same `repository.restore` call a custom does.
 */
import React from 'react';
import { ArchiveRestore, ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { DuplicateExerciseNameError } from '@/data/exercises/errors';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { useTheme } from '@/ui/theme-provider';

export interface ArchivedExercisesScreenProps {
  repository: ExerciseRepository;
  testID?: string;
}

export function ArchivedExercisesScreen({
  repository,
  testID = 'archived-exercises-screen',
}: ArchivedExercisesScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['exercises', 'archived'],
    queryFn: () => repository.list({ includeArchived: true }),
  });

  const archived = (query.data ?? []).filter((exercise) => exercise.archivedAt != null);

  // `repository.restore` can throw `DuplicateExerciseNameError` — restoring
  // an archived exercise whose name now collides with an active one (a newly
  // created/renamed exercise took the name in the meantime) must raise the
  // same typed error `create`/`update` would (see that method's own comment)
  // rather than a silent UNIQUE-constraint failure, so this UI needs to
  // surface *something* to the user instead of an unhandled rejection.
  const handleRestore = async (exercise: Exercise): Promise<void> => {
    try {
      await repository.restore(exercise.id);
      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
    } catch (error) {
      if (error instanceof DuplicateExerciseNameError) {
        Alert.alert(
          "Can't Restore This Exercise",
          `An active exercise is already named "${exercise.name}". Rename or archive that one first.`,
        );
        return;
      }
      Alert.alert('Something went wrong', 'This exercise could not be restored. Please try again.');
    }
  };

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing['4'],
          // BUGFIX-01: `insets.top` clears the status bar/notch — see
          // `app/_layout.tsx`'s header.
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Pressable
          testID={`${testID}-back`}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
        </Pressable>
        <Text
          style={[typography.headline, { color: colors.text.primary, marginLeft: spacing['3'] }]}
        >
          Archived Exercises
        </Text>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : archived.length === 0 ? (
        <EmptyState
          testID={`${testID}-empty`}
          icon={<ArchiveRestore size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="No archived exercises"
          caption="Exercises you archive appear here and can be restored anytime."
        />
      ) : (
        <View>
          {archived.map((exercise, index) => (
            <ListRow
              key={exercise.id}
              testID={`${testID}-row-${exercise.id}`}
              title={exercise.name}
              hideSeparator={index === archived.length - 1}
              trailing={
                <Pressable
                  testID={`${testID}-restore-${exercise.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${exercise.name}`}
                  hitSlop={8}
                  onPress={() => void handleRestore(exercise)}
                >
                  <Text style={[typography.footnote, { color: colors.accent.text, fontWeight: '600' }]}>
                    Restore
                  </Text>
                </Pressable>
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}
