/**
 * Dev-only fixture loader (M4-11, 09 M4 exit) — the "dev-only route/script"
 * half of the synthetic 5-year history fixture
 * (`src/test/fixtures/synthetic-history.ts` + `synthetic-history-loader.ts`)
 * that loads it into the *real, running app's* on-device database, for the
 * on-device-only checks this task's own text calls out as unreachable in
 * this sandbox (60 fps history scroll at 1000+ workouts, dashboard
 * range-switch re-render profiling — `docs/plan/BLOCKERS.md`'s M4-11 entry)
 * plus M5's import-perf work / 08 §7's spot-checks (both named by this
 * task's own brief as future reuses of the same fixture).
 *
 * Dev-only exactly like `app/dev/gallery.tsx` (M0-08): nothing outside
 * `__DEV__` links here (`app/(tabs)/profile/index.tsx`'s guarded "Load
 * Fixture Data" row) — the route file itself still exists in the bundle
 * either way (Expo Router has no conditional-existence mechanism), but
 * that's harmless, same reasoning `gallery.tsx`'s own header already gives.
 *
 * Uses the exact same generator + bulk-insert loader
 * `scripts/load-fixture.ts` uses, just against the real app's own
 * already-open driver (`getAppDriver()`, `src/data/sqlite/boot.ts`) instead
 * of a fresh on-disk file — see that script's own header for why a Node
 * script can't reach this on-device database directly (a different
 * process, a different storage sandbox), which is exactly why this screen
 * exists as a second entry point rather than replacing that script.
 */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { getAppDriver } from '@/data/sqlite/boot';
import {
  generateSyntheticHistory,
  insertSyntheticHistory,
  type InsertSyntheticHistoryResult,
} from '@/test/fixtures';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { useTheme } from '@/ui/theme-provider';

export default function DevLoadFixtureScreen(): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsertSyntheticHistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = (): void => {
    setLoading(true);
    setError(null);
    setResult(null);

    // Synchronous (the bulk loader is one `driver.transaction`, not
    // awaited I/O) — deferred one macrotask via `setTimeout` so the
    // `loading` spinner actually paints before the (blocking) insert runs.
    setTimeout(() => {
      try {
        const dataset = generateSyntheticHistory();
        const insertResult = insertSyntheticHistory(getAppDriver(), dataset);
        setResult(insertResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }, 0);
  };

  return (
    <ScrollView
      testID="dev-load-fixture"
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={{ padding: spacing['4'], gap: spacing['4'] }}
    >
      <Text style={[typography.title1, { color: colors.text.primary }]}>Load Fixture Data</Text>
      <Text style={[typography.body, { color: colors.text.secondary }]}>
        Inserts a synthetic 5-year, 1000+-workout history (realistic exercise-type spread) directly
        into this device&rsquo;s real database — for manual History-scroll and Statistics-dashboard
        perf/QA passes (M4-11). This does not touch the active-workout invariant (every inserted
        workout is already `completed`) and does not remove any existing data.
      </Text>

      <Button
        testID="dev-load-fixture-button"
        label={loading ? 'Loading…' : 'Load Synthetic 5-Year History'}
        onPress={handleLoad}
        disabled={loading}
        loading={loading}
      />

      {result ? (
        <Card testID="dev-load-fixture-result">
          <Text style={[typography.subhead, { color: colors.text.primary }]}>Loaded</Text>
          <View style={{ marginTop: spacing['2'], gap: spacing['1'] }}>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {result.workoutCount} workouts
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {result.setCount} sets
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {result.exerciseCount} exercises
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              {result.elapsedMs} ms
            </Text>
          </View>
        </Card>
      ) : null}

      {error ? (
        <Card testID="dev-load-fixture-error">
          <Text style={[typography.body, { color: colors.semantic.danger }]}>{error}</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}
