/**
 * Keep-awake seam (06 §10) — the active-workout screen (M2) will go through
 * this module rather than importing `expo-keep-awake` directly, so it stays
 * the single mockable seam (08 §5).
 *
 * Placeholder for M0-03: `expo-keep-awake` isn't installed yet (the active
 * workout screen that needs it lands in M2). Stub bodies exist so the seam
 * and its manual-mock pattern (`src/lib/__mocks__/keep-awake.ts`) are ready
 * for that task to fill in.
 */

/** TODO(M2): wire to `expo-keep-awake` `activateKeepAwakeAsync`. */
export function activateKeepAwake(_tag?: string): void {
  // Intentionally a no-op until M2 wires the real native module.
}

/** TODO(M2): wire to `expo-keep-awake` `deactivateKeepAwake`. */
export function deactivateKeepAwake(_tag?: string): void {
  // Intentionally a no-op until M2 wires the real native module.
}
