/**
 * Haptic feedback seam (06 §6.4/§10 native-capability wrapper layer). Nothing
 * upstream of `src/lib` should import `expo-haptics` directly — go through
 * this module so it stays the single mockable seam (08 §5: "RNTL tests
 * mock only true natives ... via src/lib/ seams").
 *
 * M2-11 wires the real `expo-haptics` native module (installed this task —
 * M0-03 only ever stubbed this file, `TODO(M2)` comments left in place for
 * exactly this) behind the **semantic** names 06 §6.4 calls for verbatim:
 * "`lib/haptics.ts` wraps expo-haptics with semantic names (`tickCheck`,
 * `warnInvalid`, `successPR`) — single place to tune (07 §8)." Every row of
 * 07 §8's event→haptic table gets its own named export here rather than
 * exposing the raw `ImpactFeedbackStyle`/`NotificationFeedbackType` enums to
 * call sites — a call site reading `tickCheck()` says what *happened*;
 * `triggerImpact('light')` (the M0-03-era API this replaces) only said what
 * the *device* should do, forcing every caller to already know 07 §8's
 * mapping by heart. `ConnectedSetRow.tsx` (the one real consumer so far) is
 * migrated to the new names in this same task rather than left on the old
 * ones, per this task's own brief: "prefer migrating call sites rather than
 * leaving two parallel APIs."
 *
 * ## Two rows share one underlying feedback, on purpose
 * "PR banner" and "Rest timer done (foreground)" are both `notificationSuccess`
 * in 07 §8's table — `successPR`/`timerComplete` below call the identical
 * underlying `Haptics.notificationAsync(Success)`, just under two names so a
 * call site's own code reads as the actual event that happened, not a
 * borrowed one from an unrelated feature.
 *
 * ## Never throws, never rejects unhandled
 * `expo-haptics`'s own `impactAsync`/`notificationAsync`/`selectionAsync`
 * reject with an `UnavailabilityError` if the native module isn't linked
 * (confirmed empirically: `expo-haptics` uses expo's
 * `requireOptionalNativeModule`, which resolves to `undefined` rather than
 * throwing at *import* time — unlike `expo-audio`/`expo-notifications`, see
 * `src/lib/sound.ts`/`src/lib/notifications.ts`'s own headers — but each
 * exported function still guards `!ExpoHaptics?.xAsync` and throws at *call*
 * time). Every export below is fire-and-forget (`void`-returning, matching
 * every existing call site's own `triggerImpact('light')`-style usage) and
 * swallows that rejection via `.catch()` + a `logger.warn` rather than
 * leaving an unhandled promise rejection — this headless test environment
 * (no simulator/device, `docs/plan/BLOCKERS.md`) hits the "unavailable"
 * branch on every single call, so this path is exercised constantly, not a
 * rare edge case.
 */
import * as Haptics from 'expo-haptics';

import { logger } from './logger';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeImpact(style: Haptics.ImpactFeedbackStyle): void {
  Haptics.impactAsync(style).catch((error: unknown) => {
    logger.warn(`haptics: impactAsync failed (${describeError(error)})`);
  });
}

function safeNotification(type: Haptics.NotificationFeedbackType): void {
  Haptics.notificationAsync(type).catch((error: unknown) => {
    logger.warn(`haptics: notificationAsync failed (${describeError(error)})`);
  });
}

function safeSelection(): void {
  Haptics.selectionAsync().catch((error: unknown) => {
    logger.warn(`haptics: selectionAsync failed (${describeError(error)})`);
  });
}

/** Set checked successfully (07 §8: `impactLight`). */
export function tickCheck(): void {
  safeImpact(Haptics.ImpactFeedbackStyle.Light);
}

/** Invalid check — missing required value (07 §8: `notificationWarning`). Callers also drive the row's own 300 ms shake (`SetRow`'s `shakeSignal`) — this only fires the haptic half. */
export function warnInvalid(): void {
  safeNotification(Haptics.NotificationFeedbackType.Warning);
}

/** PR banner shown (07 §8: `notificationSuccess`). */
export function successPR(): void {
  safeNotification(Haptics.NotificationFeedbackType.Success);
}

/** Rest timer finishes while the timer surface is in the foreground (07 §8: `notificationSuccess` — see file header for why this is a separate name from {@link successPR} rather than a reused call). */
export function timerComplete(): void {
  safeNotification(Haptics.NotificationFeedbackType.Success);
}

/** Timer ±15/skip, chip/segment change (07 §8: `selection`). */
export function selection(): void {
  safeSelection();
}

/** Destructive confirm shown (07 §8: `impactMedium`). Exported for completeness against 07 §8's table; not yet wired into any existing confirm dialog (M2-11's own scope is the rest-timer surfaces — wiring this into e.g. Discard Workout's confirm is a separate, later call-site change). */
export function destructiveConfirm(): void {
  safeImpact(Haptics.ImpactFeedbackStyle.Medium);
}

/** Drag reorder pickup/drop (07 §8: `impactLight`). Wired (M3-03) into `RoutinesHubScreen`'s reorder mode — both `Draggable`'s `onDragStart` (pickup) and every `Droppable`'s `onDrop` (drop) call this, matching 07 §8's literal "pickup/drop" wording. Still NOT wired into `ReorderExercisesSheet`'s up/down-button reorder (M2-09) — that sheet has no drag gesture to hang a pickup/drop haptic off of; see `RoutinesHubScreen.tsx`'s header for M3-03's "leave it as up/down controls" decision. */
export function dragReorder(): void {
  safeImpact(Haptics.ImpactFeedbackStyle.Light);
}
