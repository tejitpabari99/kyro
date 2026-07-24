/**
 * `FolderSection` (M3-02, 04 §1) — one collapsible folder header (chevron,
 * title, routine count, ⋯) plus its routine cards; also renders the
 * implicit "My Routines" bucket (`folder: null`) as a plain, non-collapsible
 * header (no chevron/⋯ — there is nothing to rename/reorder/delete/collapse
 * about it, and no `routine_folders` row backs it to persist a collapse
 * state against, see `RoutinesHubScreen.tsx`'s header) or, per
 * `showHeader={false}`, no header row at all (the zero-real-folders case).
 */
import React from 'react';
import { ChevronDown, ChevronRight, Ellipsis } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { RoutineFolder, RoutineSummary } from '@/data/routines/types';
import { useTheme } from '@/ui/theme-provider';

import { RoutineCard } from './RoutineCard';

export interface FolderSectionProps {
  folder: RoutineFolder | null;
  routines: RoutineSummary[];
  showHeader: boolean;
  previewByRoutineId: Map<string, string>;
  onToggleCollapsed: (folder: RoutineFolder) => void;
  onFolderMenuPress: (folder: RoutineFolder) => void;
  onStartRoutine: (routine: RoutineSummary) => void;
  onRoutineMenuPress: (routine: RoutineSummary) => void;
}

export function FolderSection({
  folder,
  routines,
  showHeader,
  previewByRoutineId,
  onToggleCollapsed,
  onFolderMenuPress,
  onStartRoutine,
  onRoutineMenuPress,
}: FolderSectionProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();

  const label = folder?.title ?? 'My Routines';
  const collapsed = folder?.collapsed ?? false;
  const sectionTestId = folder ? `folder-section-${folder.id}` : 'folder-section-my-routines';

  return (
    <View testID={sectionTestId} style={{ marginBottom: spacing['4'] }}>
      {showHeader ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: spacing['2'],
          }}
        >
          <Pressable
            testID={`${sectionTestId}-toggle`}
            accessibilityRole="button"
            accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
            disabled={folder == null}
            hitSlop={8}
            onPress={() => {
              if (folder) onToggleCollapsed(folder);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          >
            {folder ? (
              collapsed ? (
                <ChevronRight size={18} strokeWidth={1.75} color={colors.text.secondary} />
              ) : (
                <ChevronDown size={18} strokeWidth={1.75} color={colors.text.secondary} />
              )
            ) : null}
            <Text
              style={[
                typography.headline,
                { color: colors.text.primary, marginLeft: folder ? spacing['1'] : 0 },
              ]}
            >
              {label}
            </Text>
            <Text
              style={[typography.footnote, { color: colors.text.tertiary, marginLeft: spacing['2'] }]}
            >
              {routines.length}
            </Text>
          </Pressable>
          {folder ? (
            <Pressable
              testID={`${sectionTestId}-menu`}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${label}`}
              hitSlop={8}
              onPress={() => onFolderMenuPress(folder)}
            >
              <Ellipsis size={20} strokeWidth={1.75} color={colors.text.secondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!collapsed
        ? routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              testID={`routine-card-${routine.id}`}
              routine={routine}
              preview={previewByRoutineId.get(routine.id) ?? ''}
              onStart={() => onStartRoutine(routine)}
              onMenuPress={() => onRoutineMenuPress(routine)}
            />
          ))
        : null}
    </View>
  );
}
