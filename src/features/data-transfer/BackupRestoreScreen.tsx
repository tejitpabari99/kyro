/**
 * `BackupRestoreScreen` (M5-09, 05 §9) — the Restore half of Settings →
 * Data's "Backup"/"Restore" pair (Backup itself is a one-shot action wired
 * directly in the Settings screen, same shape `handleExportCsv` already
 * establishes — no dedicated screen needed since there's no preview/confirm
 * flow before *producing* a file, only before *replacing everything* with
 * one). Same "feature component owns data + layout, route file only wires
 * real deps" split `HevyImportScreen.tsx`'s own header names — `app/backup/
 * restore.tsx` is the thin route wrapper.
 *
 * ## Double confirm (05 §9: "replace-all with double confirm")
 *
 * Two sequential `Alert.alert` calls, chained via `onPress`, same mechanism
 * `HistoryDetailScreen.tsx`'s own delete-workout confirm already uses (that
 * file's header names the exact "Alert.alert chain, destructive style"
 * convention). First alert uses 05 §9's own quoted copy verbatim — "This
 * replaces all current data" — as the literal message text, per this task's
 * explicit instruction to reuse that exact wording rather than paraphrasing
 * it. Second alert is a final, more explicit confirm ("can't be undone").
 * Cancelling *either* alert aborts the whole flow with zero calls into
 * `backupService.restore` — the file picked earlier is simply discarded,
 * the user lands back on the idle screen exactly as if they'd never picked
 * anything.
 *
 * ## Orphan sweep + full query invalidation happen here, not inside the service
 *
 * `backup-service.ts`'s own header explains why `restore()` itself never
 * runs the orphan sweep or touches `QueryClient` — both are UI-layer
 * concerns, the identical split `HevyImportScreen.tsx`'s own "bulk
 * invalidation happens here" section documents for the analogous import
 * flow. This screen calls `sweepOrphanProgressPhotos` (M5-03, reused
 * verbatim — restoring can leave stray photo files or DB rows pointing at
 * files that no longer exist, exactly the two cases that sweep already
 * handles) immediately after a successful `restore()`, then
 * `queryClient.clear()` — a **full** clear, not a targeted
 * `invalidateAfterWorkoutMutation`-style prefix list: a restore can change
 * literally every table (unlike a single workout mutation), so nothing
 * short of "every cached query is now stale" is correct here (this task's
 * own explicit instruction).
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { CircleAlert, CircleCheck, FileArchive } from 'lucide-react-native';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import type { MeasurementRepository } from '@/data/measurements/types';
import { sweepOrphanProgressPhotos } from '@/features/measurements/photo-orphan-sweep';
import {
  deleteProgressPhotoFile,
  listProgressPhotoFileNames,
  progressPhotoFileExists,
} from '@/lib/progress-photos';
import { pickFile } from '@/lib/hevy-import-file';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import type { BackupRestoreResult, BackupServiceApi } from './backup-service';

export interface BackupRestoreScreenProps {
  backupService: Pick<BackupServiceApi, 'restore'>;
  measurementRepository: Pick<MeasurementRepository, 'photos'>;
  testID?: string;
}

type Phase =
  | { status: 'idle' }
  | { status: 'restoring' }
  | { status: 'report'; result: BackupRestoreResult }
  | { status: 'error'; message: string };

/** Zip MIME types a document-picker provider might report a `.zip` as — mirrors `hevy-import-file.ts`'s own "accept a few, providers vary" reasoning for CSV, just for the zip container format instead. */
const ZIP_DOCUMENT_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'];

export function BackupRestoreScreen({
  backupService,
  measurementRepository,
  testID = 'backup-restore-screen',
}: BackupRestoreScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ status: 'idle' });

  const performRestore = async (fileUri: string): Promise<void> => {
    setPhase({ status: 'restoring' });
    try {
      const result = await backupService.restore(fileUri);
      if ('error' in result) {
        setPhase({ status: 'error', message: result.error });
        return;
      }

      // M5-03's boot-time orphan sweep, reused verbatim (see file header) —
      // failures here are swallowed the same way `app/_layout.tsx`'s own
      // boot-time call does: a missed sweep pass is a minor, recoverable
      // gap, never a reason to make an otherwise-successful restore look
      // like it failed.
      await sweepOrphanProgressPhotos(measurementRepository, {
        listPhotoFileNames: listProgressPhotoFileNames,
        fileExists: progressPhotoFileExists,
        deleteOrphanFile: deleteProgressPhotoFile,
      }).catch(() => undefined);

      // A restore can change literally every table — a full clear, not a
      // targeted invalidation (this task's own explicit instruction; see
      // file header).
      queryClient.clear();

      setPhase({ status: 'report', result });
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Restore failed. Nothing was changed.',
      });
    }
  };

  const confirmFinal = (fileUri: string): void => {
    Alert.alert(
      'Are you sure?',
      "This can't be undone. Everything currently in Kyro — workouts, routines, measurements, photos, and settings — will be permanently replaced with the contents of this backup.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => void performRestore(fileUri) },
      ],
    );
  };

  const confirmReplaceAll = (fileUri: string): void => {
    // 05 §9's own quoted copy, verbatim — see file header.
    Alert.alert('Restore Backup', 'This replaces all current data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => confirmFinal(fileUri) },
    ]);
  };

  const handleChooseFile = async (): Promise<void> => {
    // Direct async call in an event handler — wrapped in try/catch (found
    // in M5 milestone-wide review — same recurring "unguarded direct async
    // call in an event handler" shape M1-M4's own reviews each found) so a
    // rejecting picker surfaces via the same error phase `performRestore`'s
    // own catch block already uses, instead of an unhandled rejection.
    let picked: Awaited<ReturnType<typeof pickFile>>;
    try {
      picked = await pickFile({ type: ZIP_DOCUMENT_TYPES });
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not open the file picker.',
      });
      return;
    }
    if (!picked) {
      return; // User cancelled the picker — stay on idle, no error.
    }
    confirmReplaceAll(picked.uri);
  };

  const handleDone = (): void => {
    router.back();
  };

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing['4'],
          paddingTop: insets.top + spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Button
          label={phase.status === 'report' ? 'Close' : 'Cancel'}
          variant="ghost"
          size="sm"
          testID={`${testID}-close`}
          onPress={() => router.back()}
        />
        <Text style={[typography.headline, { color: colors.text.primary }]}>Restore Backup</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing['4'] }}>
        {phase.status === 'idle' ? (
          <EmptyState
            testID={`${testID}-idle`}
            icon={<FileArchive size={40} color={colors.text.secondary} strokeWidth={1.5} />}
            title="Restore from a backup"
            caption="Pick a kyro_backup file. This replaces all current data — you'll be asked to confirm twice before anything changes."
            cta={
              <Button
                label="Choose Backup File"
                variant="primary"
                testID={`${testID}-choose-file`}
                onPress={() => void handleChooseFile()}
              />
            }
          />
        ) : null}

        {phase.status === 'restoring' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['8'] }}>
            <ActivityIndicator color={colors.accent.primary} testID={`${testID}-loading`} />
            <Text
              style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['3'] }]}
            >
              Restoring…
            </Text>
          </View>
        ) : null}

        {phase.status === 'error' ? (
          <EmptyState
            testID={`${testID}-error`}
            icon={<CircleAlert size={40} color={colors.semantic.danger} strokeWidth={1.5} />}
            title="Couldn't restore this backup"
            caption={phase.message}
            cta={
              <Button
                label="Try Again"
                variant="tonal"
                testID={`${testID}-retry`}
                onPress={() => setPhase({ status: 'idle' })}
              />
            }
          />
        ) : null}

        {phase.status === 'report' ? (
          <View testID={`${testID}-report`}>
            <View style={{ alignItems: 'center', marginBottom: spacing['4'] }}>
              <CircleCheck size={40} color={colors.semantic.success} strokeWidth={1.5} />
              <Text
                style={[typography.title2, { color: colors.text.primary, marginTop: spacing['2'] }]}
              >
                Restore complete
              </Text>
            </View>

            <Card style={{ marginBottom: spacing['4'] }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing['1'],
                }}
              >
                <Text style={[typography.body, { color: colors.text.primary }]}>Workouts</Text>
                <Text style={[typography.body, { color: colors.text.secondary }]}>
                  {phase.result.workoutCount}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing['1'],
                }}
              >
                <Text style={[typography.body, { color: colors.text.primary }]}>Photos</Text>
                <Text style={[typography.body, { color: colors.text.secondary }]}>
                  {phase.result.photoCount}
                </Text>
              </View>
            </Card>

            <Button label="Done" variant="primary" size="lg" testID={`${testID}-done`} onPress={handleDone} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
