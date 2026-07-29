/**
 * `TimerPill` (M2-11) — 07 §5 / 02 §7: "floating pill docked above the tab
 * bar / keyboard: circular progress + remaining time + `−15s · +15s ·
 * Skip`. Tap pill → full-screen timer sheet (big countdown ring, same
 * controls)." Mounted unconditionally by `ActiveWorkoutScreen` — renders
 * `null` whenever `restTimerStore.timer` is `null`, so it is only ever
 * visible while a rest timer is actually running.
 *
 * This is a **different** surface from `GlobalWorkoutBar` (M2-13)'s
 * plain-text mini-bar countdown: that one is the collapsed/minimized-logger
 * fallback (02 §10 — "in minimized mode, the mini-bar shows the
 * countdown"), this one is the full logger's own inline timer chrome
 * (02 §7). Both read the same `restTimerStore`, but `loggerVisibilityStore`
 * guarantees only one of the two is ever mounted-and-visible at a time
 * (`GlobalWorkoutBar` shows only while `ActiveWorkoutScreen` — and
 * therefore this component — is *not* mounted), so there is no double
 * "who calls `complete()`" race between them — `restTimerStore.complete`'s
 * own doc comment: "call once a mounted timer surface observes remaining
 * <= 0," and this file is that surface whenever the full logger is open.
 *
 * ## Foreground natural completion (02 §7 / 06 §6.2)
 * "Completion in-foreground: chime (per sound settings) + haptic; pill
 * collapses." Unlike `GlobalWorkoutBar`'s own `complete()` hook — silent,
 * because that surface can also observe an *already-expired* timer right
 * after a foreground/background reconciliation, where a chime would be
 * wrong/late (`useForegroundReconciliation.ts`'s own separate, silent path
 * already handles that case) — this file's completion effect always fires
 * `playTimerChime`/`timerComplete()` (haptic) alongside `complete()`: this
 * is unambiguously the live, foreground, user-watching-the-countdown path
 * 02 §7 describes. "Pill collapses" is automatic: once `complete()` clears
 * the store, `timer` becomes `null` and this component's own top-level
 * guard returns `null` (which also un-renders the full-screen `Sheet`, if
 * it happened to be open — see the render-time `sheetVisible` reset below
 * for why that doesn't leave a stale "sheet was open" flag for the *next*
 * timer that starts).
 *
 * ## Ring "total" — a judgment call, not a stored value
 * `restTimerStore`'s `RestTimer` shape (06 §4, M2-10) deliberately has no
 * "original duration" field — only the absolute `endsAt`. A progress ring
 * needs *some* denominator to compute a fraction, so this file tracks its
 * own local "total so far" per timer instance (keyed by `setId` — the
 * store itself guarantees only one timer runs at a time, so a changed
 * `setId` unambiguously means a brand-new timer replaced the old one):
 * initialized to the first observed `remainingMs`, and bumped upward
 * (never down) if a `+15s` adjustment ever pushes `remainingMs` past it —
 * so the ring never reports more than 100% full, and a `+15s` extension
 * visibly grows the ring's own "full" reference rather than clipping at an
 * artificial ceiling. `-15s` shortens `remainingMs` under the same fixed
 * `total`, which is exactly the "ring drains faster" feedback the control
 * implies. This "total"/`sheetVisible` reset is adjusted **during render**
 * (plain `useState`, compared against the timer's own `setId` each render —
 * see the component body's own comment, mirroring `ExerciseMedia.tsx`'s
 * identical `resetKey`/`lastResetKey` shape) rather than inside a
 * `useEffect`: this repo's `react-hooks/set-state-in-effect` rule flags an
 * unconditional `setState` call sitting directly in an effect body, and
 * `react-hooks/refs` separately forbids reading a ref's `.current` during
 * render — a ref-based version of this same tracker would need to do
 * exactly that to compute `progress` below. Deliberately does **not** touch
 * `restTimerStore`'s own public shape — this task's brief is explicit that
 * `adjust`/`skip` are already-built, already-tested store actions to wire
 * UI onto, not to extend.
 */
import * as Linking from 'expo-linking';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/domain/units';
import { useSettingsStore } from '@/features/settings/settings-store';
import { selection, timerComplete } from '@/lib/haptics';
import { playTimerChime } from '@/lib/sound';
import { Button } from '@/ui/Button';
import { ProgressRing } from '@/ui/ProgressRing';
import { ScreenFooter } from '@/ui/ScreenFooter';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Snackbar } from '@/ui/Snackbar';
import { useTheme } from '@/ui/theme-provider';

import { useRestTimerStore } from './restTimerStore';
import { useRestTimerTicker } from './useRestTimerTicker';

/** 02 §7's own literal step. */
const ADJUST_STEP_SECONDS = 15;
const PILL_RING_SIZE = 40;
const PILL_RING_STROKE = 4;
const SHEET_RING_SIZE = 220;
const SHEET_RING_STROKE = 12;

export interface TimerPillProps {
  testID?: string;
}

interface TimerControlsRowProps {
  testIDPrefix: string;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
}

/** −15s / Skip / +15s — identical set of controls shared by the compact pill and the full-screen sheet (02 §7: "same controls"). Each dispatches straight to `restTimerStore`'s existing `adjust`/`skip` actions and fires the `selection` haptic (07 §8: "Timer ±15/skip, chip/segment change" -> `selection`). */
function TimerControlsRow({
  testIDPrefix,
  onAdjust,
  onSkip,
}: TimerControlsRowProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();
  return (
    <View style={[styles.controlsRow, { gap: spacing['2'] }]}>
      <Pressable
        testID={`${testIDPrefix}-minus15`}
        accessibilityRole="button"
        accessibilityLabel="Subtract 15 seconds"
        onPress={() => onAdjust(-ADJUST_STEP_SECONDS)}
        hitSlop={8}
        style={[
          styles.controlButton,
          { backgroundColor: colors.bg.elevated, borderRadius: radii.sm, paddingHorizontal: spacing['3'] },
        ]}
      >
        <Text style={[typography.footnote, { color: colors.text.primary, fontWeight: '600' }]}>
          −15s
        </Text>
      </Pressable>
      <Pressable
        testID={`${testIDPrefix}-skip`}
        accessibilityRole="button"
        accessibilityLabel="Skip rest timer"
        onPress={onSkip}
        hitSlop={8}
        style={[
          styles.controlButton,
          { backgroundColor: colors.bg.elevated, borderRadius: radii.sm, paddingHorizontal: spacing['3'] },
        ]}
      >
        <Text style={[typography.footnote, { color: colors.text.primary, fontWeight: '600' }]}>
          Skip
        </Text>
      </Pressable>
      <Pressable
        testID={`${testIDPrefix}-plus15`}
        accessibilityRole="button"
        accessibilityLabel="Add 15 seconds"
        onPress={() => onAdjust(ADJUST_STEP_SECONDS)}
        hitSlop={8}
        style={[
          styles.controlButton,
          { backgroundColor: colors.bg.elevated, borderRadius: radii.sm, paddingHorizontal: spacing['3'] },
        ]}
      >
        <Text style={[typography.footnote, { color: colors.text.primary, fontWeight: '600' }]}>
          +15s
        </Text>
      </Pressable>
    </View>
  );
}

export function TimerPill({ testID = 'timer-pill' }: TimerPillProps): React.JSX.Element | null {
  const { colors, typography, spacing, radii } = useTheme();

  const timer = useRestTimerStore((state) => state.timer);
  const soundChoice = useSettingsStore((state) => state.settings.sounds.timer_sound);
  const soundVolume = useSettingsStore((state) => state.settings.sounds.timer_volume);

  const now = useRestTimerTicker(timer != null);
  const remainingMs = timer ? Math.max(0, timer.endsAt - now) : 0;

  // Track this timer instance's own "total" (see file header) + the
  // full-screen sheet's own open/closed state, both reset whenever a
  // *different* timer instance appears (a changed `setId`) or the timer
  // clears (`timerKey` -> `null`). Adjusted **during render** — React's own
  // "adjusting state when a value changes" pattern (see e.g.
  // `ExerciseMedia.tsx`'s identical `resetKey`/`lastResetKey` shape) —
  // rather than inside a `useEffect`: this repo's `react-hooks/set-state-in-
  // effect` lint rule flags an unconditional `setState` call sitting
  // directly in an effect body (an extra render-then-immediately-re-render
  // cascade every commit), and `react-hooks/refs` separately forbids
  // reading a ref's `.current` during render (which a ref-based version of
  // this same "total" tracker would need to do to compute `progress`
  // below) — plain `useState`, adjusted conditionally mid-render, sidesteps
  // both restrictions at once.
  const timerKey = timer ? timer.setId : null;
  const [lastTimerKey, setLastTimerKey] = useState(timerKey);
  const [totalMs, setTotalMs] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);

  if (timerKey !== lastTimerKey) {
    setLastTimerKey(timerKey);
    setTotalMs(remainingMs);
    setSheetVisible(false);
  } else if (timer && remainingMs > totalMs) {
    // `+15s` pushed remaining past the previously-known total — grow the
    // ring's own "full" reference rather than clipping at a stale ceiling
    // (see file header).
    setTotalMs(remainingMs);
  }

  // Foreground natural completion (see file header) — a genuine side
  // effect (store dispatch + haptic + chime), so this one *does* belong in
  // a `useEffect`, unlike the render-time adjustment above. The "already
  // fired for this timer instance" guard is a ref compared against the
  // timer's own `setId` — read/written only inside this effect, never
  // during render, so it doesn't trip the same `react-hooks/refs` rule.
  const completedForKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!timer || remainingMs > 0) {
      return;
    }
    if (completedForKeyRef.current === timer.setId) {
      return;
    }
    completedForKeyRef.current = timer.setId;
    void useRestTimerStore.getState().complete();
    timerComplete();
    void playTimerChime(soundChoice, soundVolume);
  }, [timer, remainingMs, soundChoice, soundVolume]);

  if (!timer) {
    return null;
  }

  const total = totalMs || remainingMs || 1;
  const progress = Math.max(0, Math.min(1, remainingMs / total));
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingText = formatDuration(remainingSeconds) ?? '0:00';
  // `typography.statLarge` carries a readonly `fontVariant` tuple (tokens.ts
  // header) — copy into a mutable array to satisfy RN's `TextStyle`, same
  // pattern `StatColumn.tsx` already established for this exact token.
  const remainingTextStyle = {
    ...typography.statLarge,
    fontVariant: [...typography.statLarge.fontVariant],
  };

  const handleAdjust = (deltaSeconds: number): void => {
    selection();
    void useRestTimerStore.getState().adjust(deltaSeconds);
  };
  const handleSkip = (): void => {
    selection();
    void useRestTimerStore.getState().skip();
  };

  return (
    <>
      <View
        testID={testID}
        style={[
          styles.pillContainer,
          {
            backgroundColor: colors.bg.surface,
            borderRadius: radii.pill,
            borderColor: colors.border.hairline,
            paddingHorizontal: spacing['3'],
            paddingVertical: spacing['2'],
            gap: spacing['3'],
          },
        ]}
      >
        <Pressable
          testID={`${testID}-open`}
          accessibilityRole="button"
          accessibilityLabel={`Rest timer, ${remainingText} remaining. Tap for details.`}
          onPress={() => setSheetVisible(true)}
          style={styles.pillTapArea}
        >
          <ProgressRing
            testID={`${testID}-ring`}
            progress={progress}
            size={PILL_RING_SIZE}
            strokeWidth={PILL_RING_STROKE}
            color={colors.accent.primary}
            trackColor={colors.bg.elevated}
          />
          <Text
            testID={`${testID}-remaining`}
            style={[remainingTextStyle, { color: colors.text.primary, marginLeft: spacing['2'] }]}
          >
            {remainingText}
          </Text>
        </Pressable>
        <TimerControlsRow testIDPrefix={testID} onAdjust={handleAdjust} onSkip={handleSkip} />
        {/* M2-18 (08 §6 flow 7, semi-manual): dev-only debug hook asserting
            notification *scheduling* happened — `restTimerStore`'s own
            `RestTimer.notificationId` is already the exact signal (non-null
            iff `scheduleRestNotification` succeeded, see that store's
            `start`/`adjust` actions); this just surfaces it as inspectable
            text so a Maestro flow can assert on it without a real device's
            lock screen, which is out of reach in any simulator (that part
            is owner drill O-09). Gated on `__DEV__` exactly like the
            existing `app/(tabs)/profile/index.tsx` dev-gallery link — never
            rendered in a production/TestFlight build. */}
        {__DEV__ ? (
          <Text
            testID={`${testID}-debug-notification-id`}
            style={[typography.caption, { color: colors.text.tertiary }]}
          >
            {timer.notificationId ?? 'none'}
          </Text>
        ) : null}
      </View>

      <Sheet
        testID={`${testID}-sheet`}
        visible={sheetVisible}
        onDismiss={() => setSheetVisible(false)}
        detent="full"
      >
        <View style={{ flex: 1 }}>
          <SheetHeader testID={`${testID}-sheet-header`} title="Rest Timer" safeTop />
          <View style={styles.sheetContent}>
            <ProgressRing
              testID={`${testID}-sheet-ring`}
              progress={progress}
              size={SHEET_RING_SIZE}
              strokeWidth={SHEET_RING_STROKE}
              color={colors.accent.primary}
              trackColor={colors.bg.elevated}
            >
              <Text
                testID={`${testID}-sheet-remaining`}
                style={[typography.display, { color: colors.text.primary }]}
              >
                {remainingText}
              </Text>
            </ProgressRing>
            <View style={{ marginTop: spacing['6'] }}>
              <TimerControlsRow
                testIDPrefix={`${testID}-sheet`}
                onAdjust={handleAdjust}
                onSkip={handleSkip}
              />
            </View>
          </View>
          <ScreenFooter testID={`${testID}-sheet-footer`}>
            <Button
              testID={`${testID}-sheet-close`}
              label="Close"
              variant="tonal"
              onPress={() => setSheetVisible(false)}
            />
          </ScreenFooter>
        </View>
      </Sheet>
    </>
  );
}

export interface RestTimerPermissionNoticeProps {
  testID?: string;
}

/**
 * One-time OS-notification-permission-denied inline warning (02 §16.9),
 * rendered by `ActiveWorkoutScreen` alongside (not nested inside)
 * `TimerPill` — `restTimerStore.permissionDeniedNoticePending` can stay
 * `true` for the rest of the session after the *first ever* denied
 * `start()` call, independent of whether a timer happens to be running
 * right now (the pill itself unmounts as soon as its own timer clears), so
 * this needs its own always-mounted subscriber rather than living inside
 * `TimerPill`'s own `if (!timer) return null` guard.
 *
 * Reuses `Snackbar` (07 §5's own listed "toast"-shaped primitive — "undo
 * affordance, 5 s") rather than inventing a new inline-warning component:
 * its existing `onAction`/`actionLabel` props are exactly what 02 §16.9's
 * literal text asks for here — "one-time inline warning on first timer
 * start **with link to iOS Settings**" (M2-11 review fix: the action was
 * missing entirely in the initial landing, leaving only the message text
 * with no way to actually act on it) — wired to `expo-linking`'s
 * `openSettings()` (already a project dependency, same import
 * `NoteText.tsx` uses for its own tappable links). Tapping it calls
 * `onDismiss` right after (`Snackbar`'s own `handleAction`), so "Open
 * Settings" also counts as dismissing this notice — correct, since the
 * user has now acted on it either way.
 * `restTimerStore.dismissPermissionDeniedNotice()` is called both on the
 * 5 s auto-dismiss and on that same manual dismiss-via-action path.
 */
export function RestTimerPermissionNotice({
  testID = 'timer-permission-notice',
}: RestTimerPermissionNoticeProps): React.JSX.Element | null {
  const pending = useRestTimerStore((state) => state.permissionDeniedNoticePending);
  const { spacing } = useTheme();

  return (
    <Snackbar
      testID={testID}
      visible={pending}
      message="Notifications are off, so the rest timer will only work while Kyro is open."
      actionLabel="Open Settings"
      onAction={() => {
        void Linking.openSettings();
      }}
      onDismiss={() => useRestTimerStore.getState().dismissPermissionDeniedNotice()}
      style={{ marginHorizontal: spacing['4'] }}
    />
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillTapArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
