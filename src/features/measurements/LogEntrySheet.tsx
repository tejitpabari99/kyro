/**
 * `LogEntrySheet` (M5-02, 04 §6.1) — the measurement log-entry bottom sheet:
 * a date field (default today), all 17 `MeasurementFields` as optional
 * unit-labeled `NumericInput`s (per the `body_measurement_unit` setting),
 * and a self-contained photo-attach section (camera/library thumbnail row
 * with remove — the plain version this task scopes; the full gallery/
 * compare/orphan-sweep is M5-03's separate job, `docs/plan/tasks/
 * M5-tasks.md`). `Save` calls `MeasurementRepository.upsert(date, fields)`.
 *
 * ## Date field: plain Y/M/D `NumericInput`s, not `WheelPicker`/`CalendarMonth`
 *
 * Mirrors `EditWorkoutMetaSheet.tsx`'s (M4-05) own date-editing precedent
 * exactly — that component's header explicitly chose plain numeric fields
 * over `WheelPicker`/`CalendarMonth` even though `WheelPicker` already
 * existed by then (M2-09), reserving it for its one named "duration/rest
 * picker" use case (07 §5). {@link resolveMeasurementDateKey} mirrors that
 * same file's `handleSave` clamping formula (month 1-12, day clamped to the
 * resolved year/month's real day count) — exported for direct unit testing.
 *
 * ## Re-seeding on open (not a fresh mount)
 *
 * `Sheet`'s own contract mounts/unmounts only its *content* while `visible`
 * toggles — the wrapping component here (this one) is typically kept
 * mounted by its caller across opens (same shape `EditWorkoutMetaSheet.tsx`
 * documents), so this component re-seeds its own local state on a
 * `visible: false -> true` transition via the same "compare-and-set during
 * render" idiom that file already established, rather than a `useEffect`
 * (avoids an extra render before the form shows the right values).
 *
 * ## Existing-entry prefill (edit flow + "pick an already-logged date")
 *
 * Whenever the resolved date changes (including the very first render after
 * opening), `repository.list({start: date, end: date})`/`repository.photos`
 * are queried for that date and — once loaded — populate every field's text
 * (converted to the current display unit via `toEditableDisplayValue`) and
 * the photo thumbnail row. This one mechanism serves both call sites this
 * task needs: `MeasuresHomeScreen`'s `+` FAB (opens on today, prefilling
 * whatever's already logged for today, if anything) and
 * `MeasurementDetailScreen`'s per-entry "Edit" action (opens on that entry's
 * exact date). Changing the date mid-session (before Save) re-fills the
 * form from *that* date's own data — deliberate: the sheet always reflects
 * "what's really saved for the date currently showing," never a stale
 * previous date's typed text.
 *
 * ## Photos are immediate, not staged
 *
 * Unlike `ExerciseFormScreen.tsx`'s picked-photo (which stays in local
 * state until the exercise row's real id exists), a progress photo's key is
 * just the calendar date — already known before any Save, no ordering
 * problem. `MeasurementRepository.addPhoto` also explicitly creates the
 * date's `body_measurements` row if absent (`./types.ts`'s own doc
 * comment), so add/remove are wired directly to `addPhoto`/`deletePhoto`
 * as soon as the user taps Camera/Library/remove, matching this task's
 * "wired directly to `MeasurementRepository.addPhoto`/`photos`/
 * `deletePhoto`" instruction literally rather than staging them behind
 * Save.
 *
 * ## Photo capture: shared with M5-03, not a separate implementation
 *
 * `pickProgressPhoto` (`@/lib/progress-photo-capture`) and `progressPhotoUri`
 * (`@/lib/progress-photos`) are the same real, re-encoding (<=2048px q80 JPEG)
 * implementation M5-03's gallery/pager/compare screens use — this sheet
 * originally reached a self-contained, non-re-encoding
 * `measurement-photo-files.ts` (a deliberate placeholder, see that file's own
 * former header), but a post-merge reconciliation pass replaced it: two
 * divergent save paths would have meant a photo attached here was stored
 * full-resolution/unprocessed while every other surface in the app assumes a
 * re-encoded jpg. `MeasurementRepositoryDeps.savePhotoFile`/`deletePhotoFile`
 * themselves are still injected at each route's `MeasurementRepositoryImpl`
 * construction site (`app/(tabs)/profile/measures/{index,[field]}.tsx`), not
 * imported here directly — this component only ever calls
 * `repository.addPhoto`/`deletePhoto`, never the deps functions themselves.
 */
import React, { useState } from 'react';
import { Image } from 'expo-image';
import { Trash2 } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import type { MeasurementFields, MeasurementRepository } from '@/data/measurements/types';
import { MEASUREMENT_FIELD_KEYS } from '@/data/measurements/types';
import type { BodyMeasurementUnit } from '@/domain/enums';
import { localDateKey } from '@/domain/streaks';
import { pickProgressPhoto, type ProgressPhotoPickSource } from '@/lib/progress-photo-capture';
import { progressPhotoUri } from '@/lib/progress-photos';
import { Button } from '@/ui/Button';
import { NumericInput } from '@/ui/NumericInput';
import { ScreenFooter } from '@/ui/ScreenFooter';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useTheme } from '@/ui/theme-provider';

import {
  MEASUREMENT_FIELD_LABELS,
  measurementUnitSuffix,
  toCanonicalFromDisplay,
  toEditableDisplayValue,
  type MeasurementFieldKey,
} from './measurement-units';

export interface LogEntrySheetProps {
  visible: boolean;
  onDismiss: () => void;
  repository: MeasurementRepository;
  bodyMeasurementUnit: BodyMeasurementUnit;
  /** `'YYYY-MM-DD'` to open on — defaults to today. The detail screen's "Edit" action passes the entry's own date; the Measures-home FAB omits it. */
  initialDate?: string;
  testID?: string;
}

interface DateFieldsText {
  year: string;
  month: string;
  day: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function seedDateFields(dateKey: string): DateFieldsText {
  const [year, month, day] = dateKey.split('-') as [string, string, string];
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Clamps `fields`' typed Y/M/D text into a real `'YYYY-MM-DD'` date key —
 * see file header. Invalid/empty text falls back to the matching field of
 * `fallbackDateKey` (mirrors `EditWorkoutMetaSheet.tsx`'s `handleSave`
 * "`|| fallback`" clamping) — a plain parameter, not an internal
 * `Date.now()` call, so this stays a pure function safely callable during
 * render (`localDateKey(Date.now())` is computed once, outside render, by
 * the caller — see `LogEntrySheet`'s own `todayKey`). Exported for direct
 * unit testing.
 */
export function resolveMeasurementDateKey(fields: DateFieldsText, fallbackDateKey: string): string {
  const fallback = seedDateFields(fallbackDateKey);
  const year = Number.parseInt(fields.year, 10) || Number.parseInt(fallback.year, 10);
  const month = Math.min(
    12,
    Math.max(1, Number.parseInt(fields.month, 10) || Number.parseInt(fallback.month, 10)),
  );
  const day = Math.min(
    daysInMonth(year, month),
    Math.max(1, Number.parseInt(fields.day, 10) || Number.parseInt(fallback.day, 10)),
  );
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function LogEntrySheet({
  visible,
  onDismiss,
  repository,
  bodyMeasurementUnit,
  initialDate,
  testID = 'log-entry-sheet',
}: LogEntrySheetProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();
  const queryClient = useQueryClient();

  // Captured once via a lazy initializer (React's documented exception to
  // "components must be pure" — `useState`'s lazy-initializer form runs
  // exactly once, the same posture `ActiveWorkoutScreen.tsx`'s
  // `mountTimeFallback`/`DurationTimerSheet.tsx`'s `now` already establish
  // for an equivalent "capture `Date.now()` once, never call it bare during
  // render again" need) rather than a bare `Date.now()` call in the
  // render-phase reset block below, which the `react-hooks/purity` lint
  // rule correctly flags as an impure call during render.
  const [todayKey] = useState(() => localDateKey(Date.now()));

  const [wasVisible, setWasVisible] = useState(visible);
  const [dateFields, setDateFields] = useState<DateFieldsText>(() =>
    seedDateFields(initialDate ?? todayKey),
  );
  const [values, setValues] = useState<Partial<Record<MeasurementFieldKey, string>>>({});
  const [seededForDate, setSeededForDate] = useState<string | null>(null);
  // Race guard (found in testing): `entryQuery` is a real async fetch —
  // without this, a user typing into a field *before* that fetch resolves
  // gets silently overwritten the instant it does resolve (the seeding
  // block below would fire on that later render and reset `values` back to
  // whatever the fetched row says, discarding the just-typed text). Once
  // the user has touched any of the 17 fields this open/date, auto-seeding
  // stops entirely until the next open or date change — see the two reset
  // points below.
  const [hasEditedValues, setHasEditedValues] = useState(false);

  // Re-seed on a `false -> true` visibility transition — see file header.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDateFields(seedDateFields(initialDate ?? todayKey));
      setValues({});
      setSeededForDate(null);
      setHasEditedValues(false);
    }
  }

  const date = resolveMeasurementDateKey(dateFields, todayKey);

  // A second, independent trigger for the same "allow one fresh seed"
  // reset above: the user editing the Y/M/D fields directly (no visibility
  // transition involved) also picks a (possibly already-logged) date whose
  // own data should populate the form — mirrors the file header's "existing
  // entry prefill ... picking a different date" behavior. `trackedDate`
  // only ever exists to detect this transition; the resolved `date` itself
  // remains the single source of truth used everywhere else below.
  const [trackedDate, setTrackedDate] = useState(date);
  if (date !== trackedDate) {
    setTrackedDate(date);
    setSeededForDate(null);
    setHasEditedValues(false);
  }

  const entryQuery = useQuery({
    queryKey: ['measurements', 'entry', date],
    queryFn: async () => {
      const rows = await repository.list({ start: date, end: date });
      return rows[0] ?? null;
    },
    enabled: visible,
  });

  const photosQuery = useQuery({
    queryKey: ['measurements', 'photos', date],
    queryFn: () => repository.photos({ start: date, end: date }),
    enabled: visible,
  });

  // Populate `values` from the fetched row once per resolved-date change —
  // see file header ("existing-entry prefill") — but never once the user
  // has started typing (see `hasEditedValues`'s own doc comment above).
  if (visible && !hasEditedValues && entryQuery.data !== undefined && seededForDate !== date) {
    setSeededForDate(date);
    const row = entryQuery.data;
    const next: Partial<Record<MeasurementFieldKey, string>> = {};
    for (const field of MEASUREMENT_FIELD_KEYS) {
      const canonical = row ? row[field] : null;
      const display = toEditableDisplayValue(field, canonical, bodyMeasurementUnit);
      next[field] = display === null ? '' : String(display);
    }
    setValues(next);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fields: Partial<MeasurementFields> = {};
      for (const field of MEASUREMENT_FIELD_KEYS) {
        const text = values[field];
        if (text == null || text.trim() === '') continue;
        const parsed = Number.parseFloat(text);
        if (Number.isNaN(parsed)) continue;
        const canonical = toCanonicalFromDisplay(field, parsed, bodyMeasurementUnit);
        if (canonical !== null) {
          fields[field] = canonical;
        }
      }
      await repository.upsert(date, fields);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['measurements'] });
      onDismiss();
    },
  });

  const addPhotoMutation = useMutation({
    mutationFn: async (source: ProgressPhotoPickSource) => {
      const picked = await pickProgressPhoto(source);
      if (!picked) return;
      await repository.addPhoto(date, picked.uri);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) => repository.deletePhoto(photoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
  });

  const handleRemovePhoto = (photoId: string): void => {
    Alert.alert('Remove Photo?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deletePhotoMutation.mutate(photoId) },
    ]);
  };

  const sectionLabelStyle = {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing['2'],
  };

  return (
    <Sheet testID={testID} visible={visible} onDismiss={onDismiss} detent="full">
      <SheetHeader
        testID={`${testID}-header`}
        title="Log Measurements"
        left={{ kind: 'back', onPress: onDismiss }}
        safeTop
      />
      <ScrollView
        testID={`${testID}-scroll`}
        contentContainerStyle={{ paddingHorizontal: spacing['4'], paddingBottom: spacing['8'] }}
      >
        {entryQuery.isError || photosQuery.isError ? (
          <View style={{ marginBottom: spacing['4'] }}>
            <Text
              testID={`${testID}-load-error`}
              style={[typography.subhead, { color: colors.semantic.danger, marginBottom: spacing['2'] }]}
            >
              Couldn&apos;t load this entry — existing values or photos for this date may not be
              shown. Saving now could overwrite them.
            </Text>
            <Button
              label="Retry"
              variant="tonal"
              size="sm"
              testID={`${testID}-load-retry`}
              onPress={() => {
                void entryQuery.refetch();
                void photosQuery.refetch();
              }}
            />
          </View>
        ) : null}

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>DATE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-date-year`}
              mode="integer"
              value={dateFields.year}
              onChangeText={(text) => setDateFields((f) => ({ ...f, year: text }))}
              placeholder="YYYY"
              style={{ width: 72 }}
              accessibilityLabel="Year"
            />
            <NumericInput
              testID={`${testID}-date-month`}
              mode="integer"
              value={dateFields.month}
              onChangeText={(text) => setDateFields((f) => ({ ...f, month: text }))}
              placeholder="MM"
              style={{ width: 56 }}
              accessibilityLabel="Month"
            />
            <NumericInput
              testID={`${testID}-date-day`}
              mode="integer"
              value={dateFields.day}
              onChangeText={(text) => setDateFields((f) => ({ ...f, day: text }))}
              placeholder="DD"
              style={{ width: 56 }}
              accessibilityLabel="Day"
            />
          </View>
        </View>

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>MEASUREMENTS</Text>
          {MEASUREMENT_FIELD_KEYS.map((field) => (
            <View
              key={field}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: spacing['3'],
              }}
            >
              <Text style={[typography.body, { color: colors.text.primary }]}>
                {MEASUREMENT_FIELD_LABELS[field]}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
                <NumericInput
                  testID={`${testID}-field-${field}`}
                  mode="decimal"
                  value={values[field] ?? ''}
                  onChangeText={(text) => {
                    setHasEditedValues(true);
                    setValues((v) => ({ ...v, [field]: text }));
                  }}
                  placeholder="—"
                  style={{ width: 88 }}
                  accessibilityLabel={MEASUREMENT_FIELD_LABELS[field]}
                />
                <Text style={[typography.subhead, { color: colors.text.tertiary, width: 28 }]}>
                  {measurementUnitSuffix(field, bodyMeasurementUnit)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>PHOTOS</Text>
          {(photosQuery.data ?? []).length > 0 ? (
            <ScrollView
              testID={`${testID}-photos`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing['2'], marginBottom: spacing['3'] }}
            >
              {(photosQuery.data ?? []).map((photo) => (
                <View key={photo.id} style={{ position: 'relative' }}>
                  <Image
                    testID={`${testID}-photo-${photo.id}`}
                    source={{ uri: progressPhotoUri(photo.fileName) }}
                    style={{ width: 72, height: 72, borderRadius: radii.sm }}
                    contentFit="cover"
                  />
                  <Pressable
                    testID={`${testID}-photo-${photo.id}-remove`}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                    onPress={() => handleRemovePhoto(photo.id)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      backgroundColor: colors.semantic.danger,
                      borderRadius: 10,
                      padding: 3,
                    }}
                  >
                    <Trash2 size={12} strokeWidth={2} color={colors.accent.onAccent} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing['2'] }}>
            <Button
              label="Camera"
              variant="tonal"
              size="sm"
              testID={`${testID}-pick-camera`}
              loading={addPhotoMutation.isPending}
              onPress={() => addPhotoMutation.mutate('camera')}
            />
            <Button
              label="Library"
              variant="tonal"
              size="sm"
              testID={`${testID}-pick-library`}
              loading={addPhotoMutation.isPending}
              onPress={() => addPhotoMutation.mutate('library')}
            />
          </View>
        </View>

        {saveMutation.isError ? (
          <Text
            testID={`${testID}-save-error`}
            style={[typography.subhead, { color: colors.semantic.danger, marginBottom: spacing['3'] }]}
          >
            Something went wrong saving this entry. Please try again.
          </Text>
        ) : null}

        <ScreenFooter testID={`${testID}-footer`}>
          <Button
            label="Save"
            variant="primary"
            size="lg"
            testID={`${testID}-save`}
            loading={saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          />
        </ScreenFooter>
      </ScrollView>
    </Sheet>
  );
}
