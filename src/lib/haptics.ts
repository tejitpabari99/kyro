/**
 * Haptic feedback seam (06 §10 native-capability wrapper layer). Nothing
 * upstream of `src/lib` should import `expo-haptics` directly — go through
 * this module so it stays the single mockable seam (08 §5: "RNTL tests
 * mock only true natives ... via src/lib/ seams").
 *
 * Placeholder for M0-03: `expo-haptics` isn't installed yet (no consumer
 * needs it before the set-check / rest-timer interactions land in M2) —
 * these are stub bodies so the seam and its manual-mock pattern
 * (`src/lib/__mocks__/haptics.ts`) exist for later tasks to build on. See
 * `src/lib/__tests__/haptics.test.tsx` for the pattern in use.
 */

export type ImpactStyle = 'light' | 'medium' | 'heavy';
export type NotificationFeedbackType = 'success' | 'warning' | 'error';

/** TODO(M2): wire to `expo-haptics` `impactAsync` once installed. */
export function triggerImpact(_style: ImpactStyle = 'medium'): void {
  // Intentionally a no-op until M2 wires the real native module.
}

/** TODO(M2): wire to `expo-haptics` `notificationAsync` once installed. */
export function triggerNotificationFeedback(_type: NotificationFeedbackType = 'success'): void {
  // Intentionally a no-op until M2 wires the real native module.
}
