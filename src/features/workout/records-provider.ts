/**
 * `records-provider.ts` (M2-14 no-op, wired for real in M4-10) — the
 * finish/save-screen "Records earned" data + display-formatting the Save
 * sheet (02 §14's finish flow, `SaveWorkoutSheet.tsx`) reads, plus the
 * shared label/value copy the live-PR banner (`ConnectedSetRow.tsx`) reuses
 * so both surfaces describe the same award identically (04 §5.4/§5.5).
 *
 * `useWorkoutRecordsEarned` computes what 04 §5.4 calls "record types this
 * workout's sets newly hold" — via `RecordsService.evaluateWorkoutEarned`
 * (`@/features/stats/records-service`), which folds this **in-progress,
 * not-yet-persisted** workout's own already-checked sets over the cached
 * full-history baseline (`domain/records.ts`'s `evaluateWorkoutRecordsEarned`,
 * see that function's own header for why this equals a post-save
 * `computeRecordsSnapshot` read without needing to wait for the real DB
 * write). The caller (`ActiveWorkoutScreen.tsx`) is responsible for passing
 * only `isCompleted` sets per exercise — this file has no way to tell an
 * unchecked row from a checked one on its own, and passing an unchecked one
 * through would preview a trophy `finish()` then silently drops (P9, 08
 * §4.1 case 13).
 *
 * `tryGetRecordsService` (not `getRecordsService`) throughout: this file's
 * own pre-M4-10 test suite (`__tests__/records-provider.test.tsx`) never
 * booted the RecordsService singleton, and neither does most of
 * `SaveWorkoutSheet.test.tsx`'s setup — resolving `[]` when unconfigured
 * (same as this file's old permanent no-op) rather than throwing keeps
 * every one of those green without retrofitting `configureRecordsService`
 * into test files this task has no reason to touch.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ExerciseType, SetType, WeightUnit } from '@/domain/enums';
import {
  recordAwardValue,
  type HistoricalSet,
  type RecordAward as DomainRecordAward,
  type RecordType,
} from '@/domain/records';
import { formatDuration } from '@/domain/units';
import { formatVolumeDisplay } from '@/domain/volume';
import { tryGetRecordsService } from '@/features/stats/records-service';

/** One trophy row the Save sheet renders — `value` is already unit-formatted display text (e.g. `"102.5 kg"`, `"8 reps"`, `"1:30"`), never a raw canonical number, so `SaveWorkoutSheet` never needs to know about weight units itself. */
export interface RecordAward {
  exerciseId: string;
  exerciseName: string;
  /** Human label, e.g. `"Heaviest Weight"` / `"Set Record (5)"` — see {@link formatRecordTypeLabel}. */
  kind: string;
  value: string;
}

/** 04 §5.1's own record-type names, verbatim. */
const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  heaviest_weight: 'Heaviest Weight',
  best_1rm: 'Best Estimated 1RM',
  best_set_volume: 'Best Set Volume',
  most_reps: 'Most Reps',
  longest_duration: 'Longest Duration',
  set_record: 'Set Record',
};

/** Human label for one award — `set_record` appends its rep-count bucket (e.g. `"Set Record (5)"`, `"Set Record (10+)"`) since 04 §5.1's Set Records table is keyed per rep count, not a single record. */
export function formatRecordTypeLabel(award: DomainRecordAward): string {
  if (award.recordType === 'set_record') {
    return `Set Record (${award.bucket})`;
  }
  return RECORD_TYPE_LABELS[award.recordType];
}

/** Display text for one award's achieved `value` (already the output of `domain/records.ts`'s `recordAwardValue`) — weight-denominated types convert via the same `domain/volume.ts` helper the logger's own Volume stat uses (identity for kg, `formatWeightLb` otherwise), reps is a bare count, duration reuses `domain/units.ts`'s `formatDuration`. */
export function formatRecordAwardValue(
  award: DomainRecordAward,
  value: number,
  weightUnit: WeightUnit,
): string {
  switch (award.recordType) {
    case 'heaviest_weight':
    case 'best_1rm':
    case 'best_set_volume':
    case 'set_record':
      return `${formatVolumeDisplay(value, weightUnit)} ${weightUnit}`;
    case 'most_reps':
      return `${value} reps`;
    case 'longest_duration':
      return formatDuration(value) ?? '0:00';
  }
}

/** The live-PR banner's own combined message (04 §5.5: "multiple types combine into one banner") — one `"{label} PR — {value}"` clause per award, joined so a single check that earns more than one record type still shows as one banner string. */
export function formatPRBannerMessage(
  awards: readonly DomainRecordAward[],
  set: HistoricalSet,
  weightUnit: WeightUnit,
): string {
  return awards
    .map(
      (award) =>
        `${formatRecordTypeLabel(award)} PR — ${formatRecordAwardValue(award, recordAwardValue(set, award), weightUnit)}`,
    )
    .join('; ');
}

/** One exercise's worth of input `useWorkoutRecordsEarned` needs — `ActiveWorkoutScreen` builds this from the in-progress workout's own `exercises`, filtered to `isCompleted` sets only (see file header). */
export interface WorkoutRecordsEarnedExerciseInput {
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** This workout's own already-checked sets for this exercise, across every workout-exercise row sharing this `exerciseId` (a duplicated exercise within one workout folds as a single chronological sequence, matching how the live-check baseline treats it, `ConnectedSetRow.tsx`). */
  sets: readonly {
    id: string;
    position: number;
    setType: SetType;
    weightKg: number | null;
    reps: number | null;
    durationSeconds: number | null;
  }[];
}

/**
 * `useWorkoutRecordsEarned(workoutId, exercises, weightUnit)` — the hook
 * `SaveWorkoutSheet` calls. `null` `workoutId` skips the query entirely
 * (mirrors every other conditional `useQuery` in this codebase); an
 * unconfigured RecordsService (see file header) resolves `[]`, same as a
 * genuinely-empty result.
 */
export function useWorkoutRecordsEarned(
  workoutId: string | null,
  exercises: readonly WorkoutRecordsEarnedExerciseInput[],
  weightUnit: WeightUnit,
): UseQueryResult<RecordAward[]> {
  return useQuery({
    queryKey: ['records', 'workout', workoutId, exercises.map((exercise) => exercise.exerciseId).join(',')],
    queryFn: async (): Promise<RecordAward[]> => {
      const service = tryGetRecordsService();
      if (!service || !workoutId) {
        return [];
      }

      const rows: RecordAward[] = [];
      for (const exercise of exercises) {
        const historicalSets: HistoricalSet[] = exercise.sets.map((s) => ({
          setId: s.id,
          workoutId,
          workoutStartTime: 0,
          setOrder: s.position,
          exerciseType: exercise.exerciseType,
          setType: s.setType,
          isCompleted: true,
          weightKg: s.weightKg,
          reps: s.reps,
          durationSeconds: s.durationSeconds,
        }));

        // Ensure the cache is warm even if nothing else warmed this
        // exercise yet — `getSnapshot` is a cheap watermark check on a hit
        // (M4-02's own header).
        await service.getSnapshot(exercise.exerciseId);
        const earned = service.evaluateWorkoutEarned(exercise.exerciseId, historicalSets);
        if (!earned) {
          continue;
        }

        for (const award of earned) {
          const set = historicalSets.find((s) => s.setId === award.setId);
          if (!set) {
            continue;
          }
          rows.push({
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
            kind: formatRecordTypeLabel(award),
            value: formatRecordAwardValue(award, recordAwardValue(set, award), weightUnit),
          });
        }
      }
      return rows;
    },
    enabled: workoutId != null,
  });
}
