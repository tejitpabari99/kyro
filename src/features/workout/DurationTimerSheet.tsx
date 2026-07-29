/**
 * `DurationTimerSheet` (M2-08) — 02 §4 / 07 §5: "duration cells with Inline
 * Timer enabled show a start/stop stopwatch control in the cell sheet:
 * start counts up; stop writes the elapsed seconds into the cell." Feature-
 * layer, not `src/ui/**` — this is control flow specific to one TIME
 * column's edit path (`ConnectedSetRow`), not a reusable design-system
 * primitive; built on `Sheet` (07 §5) same as `ConnectedSetRow`'s own RPE/
 * set-type sheets.
 *
 * Deliberately simpler than `useWorkoutStopwatch` — no pause/resume, just
 * one Start/Stop toggle, matching the spec's entire ask ("start counts up
 * from 0... stop writes the elapsed whole seconds"). The value committed on
 * Stop is always recomputed from `Date.now() - startedAt` at that exact
 * instant, never read off the last rendered tick — so a slow re-render (or
 * a tab backgrounded and returning right as Stop is tapped) never
 * under/over-counts by up to a second the way trusting `elapsedSeconds`
 * state directly would.
 */
import React, { useEffect, useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { formatDuration } from '@/domain/units';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface DurationTimerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Elapsed whole seconds — written into the TIME cell's field on Stop (02 §4). */
  onCommit: (seconds: number) => void;
  testID?: string;
}

const TICK_MS = 1000;

export function DurationTimerSheet({
  visible,
  onDismiss,
  onCommit,
  testID = 'duration-timer-sheet',
}: DurationTimerSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  // `typography.statLarge.fontVariant` is a readonly tuple (tokens.ts's own
  // traceability note); RN's `TextStyle` wants a mutable `FontVariant[]` —
  // same copy `NumericInput`/`StatColumn` already do.
  const elapsedStyle: TextStyle = {
    ...typography.statLarge,
    fontVariant: [...typography.statLarge.fontVariant],
  };

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Reset to "not running" every time the sheet transitions to open — not
  // on every parent re-render — mirroring `DurationEditSheet`'s established
  // mid-render "re-seed on visible transition" pattern (a `useEffect` doing
  // an unconditional `setState` on every commit is what this codebase's
  // `react-hooks/set-state-in-effect` rule forbids; see that file's header
  // for the full rationale).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStartedAt(null);
    }
  }

  useEffect(() => {
    if (startedAt === null) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsedSeconds =
    startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));

  const handleStart = (): void => {
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
  };

  const handleStop = (): void => {
    if (startedAt === null) {
      return;
    }
    const finalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    setStartedAt(null);
    onCommit(finalSeconds);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <View style={{ paddingHorizontal: spacing['4'], paddingBottom: spacing['4'], alignItems: 'center' }}>
        <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
          Inline Timer
        </Text>
        <Text
          testID={`${testID}-elapsed`}
          style={[elapsedStyle, { color: colors.accent.text, marginBottom: spacing['5'] }]}
        >
          {formatDuration(elapsedSeconds) ?? '0:00'}
        </Text>
        {startedAt === null ? (
          <Button testID={`${testID}-start`} label="Start" variant="primary" onPress={handleStart} />
        ) : (
          <Button
            testID={`${testID}-stop`}
            label="Stop"
            variant="destructive"
            emphasis="fill"
            onPress={handleStop}
          />
        )}
      </View>
    </Sheet>
  );
}
