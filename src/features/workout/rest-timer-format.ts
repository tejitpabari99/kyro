/**
 * Rest-timer display/option helpers (M2-09) — 02 §3's rest-timer row:
 * "clock icon + 'Rest Timer: 2min 30s' (or 'Rest Timer: Off'); tap → wheel
 * picker sheet, Off / 5 s–5 min in 5 s steps up to 1 min then 15 s steps."
 * Pure and RN-free (no component imports) so both the option list and the
 * display formatter are directly unit-testable — `RestTimerSheet.tsx`
 * (the `WheelPicker` wiring) and `ExerciseCard.tsx` (the row label) both
 * consume this module rather than duplicating the step math/format string.
 *
 * Deliberately **not** `domain/units.ts`'s `formatDuration` (`"1:30"`
 * mm:ss) — this is a distinct, spec-mandated display string ("2min 30s"),
 * not the set-table's compact clock format.
 */

/** `null` = the "Off" row (05 §3.2: `rest_seconds` is nullable, `null` = Off). */
export type RestSeconds = number | null;

/** 5 s steps from 5 s up to 60 s, then 15 s steps up to 300 s (5 min) — 02 §3's exact wheel contents (excluding the "Off" row, prepended separately by the sheet). */
export function restTimerSecondsOptions(): number[] {
  const options: number[] = [];
  for (let s = 5; s <= 60; s += 5) {
    options.push(s);
  }
  for (let s = 75; s <= 300; s += 15) {
    options.push(s);
  }
  return options;
}

/** "Off" / "45s" / "2min" / "2min 30s" — the exact row-label format 02 §3 shows verbatim ("Rest Timer: 2min 30s"). */
export function formatRestSeconds(seconds: RestSeconds): string {
  if (seconds === null) {
    return 'Off';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}min` : `${minutes}min ${remainder}s`;
}
