/**
 * `HevyImportScreen` (M5-07, 05 §7.2/06 §3) — the Hevy CSV import flow's
 * feature component: document picker → preview (workouts found, date
 * range, exercises matched/unmatched, rows skipped + reasons) → confirm →
 * report. Same "feature component owns data + layout, route file only
 * wires real deps" split every other `src/features/**Screen.tsx` already
 * establishes (`ExerciseFormScreen.tsx`'s own header names this
 * convention) — `app/import/hevy.tsx` is the thin route wrapper that
 * constructs the real `HevyImportService`/repositories and renders this.
 *
 * ## Four-phase state machine, not a multi-step navigator
 *
 * `idle → picking → preview → confirming → report` all live in one
 * component's local `phase` state rather than separate routes/screens —
 * this flow has no back-stack navigation need beyond "cancel the whole
 * import" (the modal's own Cancel/dismiss), and keeping the already-parsed
 * `HevyImportPreview` (which `confirm()` needs verbatim, per `hevy-import-
 * service.ts`'s own "no re-parsing" design) in one component's state is far
 * simpler than threading it through route params (05 §7.2's preview object
 * is not a small, URL-param-friendly shape — it carries every parsed
 * workout draft).
 *
 * ## Bulk invalidation happens here, not inside the service
 *
 * `hevy-import-service.ts`'s own header explains why `confirm()` returns
 * `touchedExerciseIds` rather than calling `invalidateAfterWorkoutMutation`
 * itself (`QueryClient` is a UI-layer concern) — this screen is that
 * caller, firing the bulk invalidation exactly once, after `confirm()`
 * resolves, mirroring `ActiveWorkoutScreen.tsx`'s/`EditWorkoutScreen.tsx`'s
 * own "await the mutation, then invalidate" call shape.
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { CircleAlert, CircleCheck, FileUp, TriangleAlert } from 'lucide-react-native';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { formatWorkoutDate } from '@/features/history/date-format';
import { invalidateAfterWorkoutMutation } from '@/features/stats/records-service';
import { pickFile } from '@/lib/hevy-import-file';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import type {
  HevyImportPreview,
  HevyImportReport,
  HevyImportServiceApi,
} from './hevy-import-service';

export interface HevyImportScreenProps {
  importService: HevyImportServiceApi;
  testID?: string;
}

type Phase =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'preview'; preview: HevyImportPreview }
  | { status: 'confirming'; preview: HevyImportPreview }
  | { status: 'report'; report: HevyImportReport }
  | { status: 'error'; message: string };

function SectionLabel({ children }: { children: string }): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  return (
    <Text
      style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['1'] }]}
    >
      {children}
    </Text>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing['1'],
      }}
    >
      <Text style={[typography.body, { color: colors.text.primary }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.text.secondary }]}>{value}</Text>
    </View>
  );
}

export function HevyImportScreen({
  importService,
  testID = 'hevy-import-screen',
}: HevyImportScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ status: 'idle' });

  const handleChooseFile = async (): Promise<void> => {
    // No explicit `type` override — `pickFile`'s own default already
    // restricts to CSV/plain-text MIME types (`lib/hevy-import-file.ts`).
    const picked = await pickFile();
    if (!picked) {
      return; // User cancelled — stay on the idle screen, no error.
    }
    setPhase({ status: 'picking' });
    try {
      const result = await importService.preview(picked.uri);
      if ('error' in result) {
        setPhase({ status: 'error', message: result.error });
        return;
      }
      setPhase({ status: 'preview', preview: result });
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not read the selected file.',
      });
    }
  };

  const handleConfirm = async (preview: HevyImportPreview): Promise<void> => {
    setPhase({ status: 'confirming', preview });
    try {
      const report = await importService.confirm(preview);
      await invalidateAfterWorkoutMutation(queryClient, report.touchedExerciseIds);
      setPhase({ status: 'report', report });
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Import failed. Nothing was imported.',
      });
    }
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
        <Text style={[typography.headline, { color: colors.text.primary }]}>Import Hevy CSV</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing['4'] }}>
        {phase.status === 'idle' ? (
          <EmptyState
            testID={`${testID}-idle`}
            icon={<FileUp size={40} color={colors.text.secondary} strokeWidth={1.5} />}
            title="Import your Hevy workout history"
            caption="Pick a Hevy CSV export. We'll show a preview before anything is saved."
            cta={
              <Button
                label="Choose CSV File"
                variant="primary"
                testID={`${testID}-choose-file`}
                onPress={() => void handleChooseFile()}
              />
            }
          />
        ) : null}

        {phase.status === 'picking' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['8'] }}>
            <ActivityIndicator color={colors.accent.primary} testID={`${testID}-loading`} />
            <Text
              style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['3'] }]}
            >
              Reading file…
            </Text>
          </View>
        ) : null}

        {phase.status === 'error' ? (
          <EmptyState
            testID={`${testID}-error`}
            icon={<CircleAlert size={40} color={colors.semantic.danger} strokeWidth={1.5} />}
            title="Couldn't import this file"
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

        {phase.status === 'preview' ? (
          <PreviewSection
            testID={testID}
            preview={phase.preview}
            onConfirm={() => void handleConfirm(phase.preview)}
            onCancel={() => setPhase({ status: 'idle' })}
          />
        ) : null}

        {phase.status === 'confirming' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['8'] }}>
            <ActivityIndicator color={colors.accent.primary} testID={`${testID}-importing`} />
            <Text
              style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['3'] }]}
            >
              Importing…
            </Text>
          </View>
        ) : null}

        {phase.status === 'report' ? (
          <ReportSection testID={testID} report={phase.report} onDone={handleDone} />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function PreviewSection({
  testID,
  preview,
  onConfirm,
  onCancel,
}: {
  testID: string;
  preview: HevyImportPreview;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const newWorkoutCount = preview.workoutsFoundCount - preview.duplicateWorkoutCount;

  return (
    <View testID={`${testID}-preview`}>
      <Card style={{ marginBottom: spacing['4'] }}>
        <SectionLabel>SUMMARY</SectionLabel>
        <StatRow label="Workouts found" value={preview.workoutsFoundCount} />
        <StatRow label="New workouts to import" value={newWorkoutCount} />
        <StatRow label="Already imported (skipped)" value={preview.duplicateWorkoutCount} />
        {preview.dateRange ? (
          <StatRow
            label="Date range"
            value={`${formatWorkoutDate(preview.dateRange.start)} – ${formatWorkoutDate(preview.dateRange.end)}`}
          />
        ) : null}
        {preview.workoutSkips.length > 0 ? (
          <StatRow label="Skipped (inconsistent data)" value={preview.workoutSkips.length} />
        ) : null}
        {preview.malformedRows.length > 0 ? (
          <StatRow label="Skipped rows (malformed)" value={preview.malformedRows.length} />
        ) : null}
        {preview.warnings.length > 0 ? (
          <StatRow label="Warnings" value={preview.warnings.length} />
        ) : null}
      </Card>

      {preview.matchedExerciseTitles.length > 0 ? (
        <Card style={{ marginBottom: spacing['4'] }}>
          <SectionLabel>
            {`MATCHED EXERCISES (${preview.matchedExerciseTitles.length})`}
          </SectionLabel>
          {preview.matchedExerciseTitles.map((title) => (
            <Text
              key={title}
              style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}
            >
              {title}
            </Text>
          ))}
        </Card>
      ) : null}

      {preview.unmatchedExercises.length > 0 ? (
        <Card testID={`${testID}-unmatched-card`} style={{ marginBottom: spacing['4'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['1'] }}>
            <TriangleAlert size={16} color={colors.semantic.warning} strokeWidth={1.75} />
            <Text
              style={[
                typography.footnote,
                { color: colors.text.secondary, marginLeft: spacing['1'] },
              ]}
            >
              {`NEW CUSTOM EXERCISES (${preview.unmatchedExercises.length})`}
            </Text>
          </View>
          <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
            {
              "These names weren't found in your library — they'll be created as custom exercises. You can re-type or merge them later from the exercise's edit screen."
            }
          </Text>
          {preview.unmatchedExercises.map((exercise) => (
            <Text
              key={exercise.exerciseTitle}
              style={[typography.subhead, { color: colors.text.primary, marginTop: spacing['1'] }]}
            >
              {exercise.exerciseTitle}
              <Text style={{ color: colors.text.secondary }}>{`  ·  ${exercise.inference.exerciseType}${exercise.inference.ambiguous ? ' (guessed)' : ''}`}</Text>
            </Text>
          ))}
        </Card>
      ) : null}

      {preview.workoutSkips.length > 0 ? (
        <Card style={{ marginBottom: spacing['4'] }}>
          <SectionLabel>{`SKIPPED WORKOUTS (${preview.workoutSkips.length})`}</SectionLabel>
          {preview.workoutSkips.map((skip, index) => (
            <Text
              key={`${skip.title}-${skip.startTime}-${index}`}
              style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['1'] }]}
            >
              {`${skip.title} — ${skip.reason}`}
            </Text>
          ))}
        </Card>
      ) : null}

      {preview.malformedRows.length > 0 ? (
        <Card style={{ marginBottom: spacing['4'] }}>
          <SectionLabel>{`SKIPPED ROWS (${preview.malformedRows.length})`}</SectionLabel>
          {preview.malformedRows.map((row) => (
            <Text
              key={row.line}
              style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['1'] }]}
            >
              {`Line ${row.line}: ${row.reason}`}
            </Text>
          ))}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', marginTop: spacing['2'] }}>
        <Button
          label="Cancel"
          variant="tonal"
          size="lg"
          style={{ flex: 1, marginRight: spacing['2'] }}
          testID={`${testID}-preview-cancel`}
          onPress={onCancel}
        />
        <Button
          label={newWorkoutCount > 0 ? `Import ${newWorkoutCount}` : 'Nothing to Import'}
          variant="primary"
          size="lg"
          disabled={newWorkoutCount === 0}
          style={{ flex: 1, marginLeft: spacing['2'] }}
          testID={`${testID}-preview-confirm`}
          onPress={onConfirm}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function ReportSection({
  testID,
  report,
  onDone,
}: {
  testID: string;
  report: HevyImportReport;
  onDone: () => void;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <View testID={`${testID}-report`}>
      <View style={{ alignItems: 'center', marginBottom: spacing['4'] }}>
        <CircleCheck size={40} color={colors.semantic.success} strokeWidth={1.5} />
        <Text
          style={[typography.title2, { color: colors.text.primary, marginTop: spacing['2'] }]}
        >
          Import complete
        </Text>
      </View>

      <Card style={{ marginBottom: spacing['4'] }}>
        <StatRow label="Workouts imported" value={report.importedWorkoutCount} />
        <StatRow label="Sets imported" value={report.importedSetCount} />
        <StatRow label="Already imported (skipped)" value={report.duplicateSkippedCount} />
        <StatRow label="Custom exercises created" value={report.autoCreatedExercises.length} />
        <StatRow label="Workouts skipped (inconsistent)" value={report.workoutSkips.length} />
        <StatRow label="Rows skipped (malformed)" value={report.malformedRows.length} />
        <StatRow label="Warnings" value={report.warnings.length} />
      </Card>

      {report.autoCreatedExercises.length > 0 ? (
        <Card style={{ marginBottom: spacing['4'] }}>
          <SectionLabel>{`CUSTOM EXERCISES CREATED (${report.autoCreatedExercises.length})`}</SectionLabel>
          {report.autoCreatedExercises.map((exercise) => (
            <Text
              key={exercise.exerciseId}
              style={[typography.subhead, { color: colors.text.primary, marginTop: spacing['1'] }]}
            >
              {exercise.exerciseTitle}
              <Text style={{ color: colors.text.secondary }}>{`  ·  ${exercise.inference.exerciseType}`}</Text>
            </Text>
          ))}
        </Card>
      ) : null}

      {report.malformedRows.length > 0 ? (
        <Card style={{ marginBottom: spacing['4'] }}>
          <SectionLabel>{`SKIPPED ROWS (${report.malformedRows.length})`}</SectionLabel>
          {report.malformedRows.map((row) => (
            <Text
              key={row.line}
              style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['1'] }]}
            >
              {`Line ${row.line}: ${row.reason}`}
            </Text>
          ))}
        </Card>
      ) : null}

      {report.warnings.length > 0 ? (
        <Card style={{ marginBottom: spacing['4'] }}>
          <SectionLabel>{`WARNINGS (${report.warnings.length})`}</SectionLabel>
          {report.warnings.map((warning, index) => (
            <Text
              key={`${warning.line}-${index}`}
              style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['1'] }]}
            >
              {`Line ${warning.line}: ${warning.message}`}
            </Text>
          ))}
        </Card>
      ) : null}

      <Button label="Done" variant="primary" size="lg" testID={`${testID}-done`} onPress={onDone} />
    </View>
  );
}
