/**
 * `GlobalWorkoutBar` — render-slot placeholder (M0-08).
 *
 * 06 §3: "`GlobalWorkoutBar` (rendered in the tabs layout, above the tab
 * bar) appears whenever `activeWorkout != null && !loggerVisible`, and
 * re-presents the route on tap." The real mini-player (title +
 * elapsed/rest countdown, reading `activeWorkoutStore`) lands in M2-13.
 *
 * This is only the reserved seam: `app/(tabs)/_layout.tsx` renders this
 * component unconditionally above the tab bar so the layout slot exists
 * from M0 onward and later work doesn't need to touch the tabs layout
 * again to wire it in. It is a deliberate no-op — `null` — until M2-13.
 */
import React from 'react';

export function GlobalWorkoutBar(): React.JSX.Element | null {
  // TODO(M2-13): read activeWorkoutStore; render the mini-player bar when
  // `activeWorkout != null && !loggerVisible`; tap re-presents
  // `workout/active` route. Until then, an intentional no-op.
  return null;
}
