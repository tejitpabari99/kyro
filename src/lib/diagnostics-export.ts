/**
 * "Export diagnostics" (M5-04, 06 §9: "Local log ring buffer ... exportable
 * from Settings → About → 'Export diagnostics' for debugging without
 * Sentry") — formats `lib/logger.ts`'s in-memory ring buffer into one plain-
 * text blob and hands it to the OS share sheet.
 *
 * ## Share mechanism: `react-native`'s own `Share`, not `expo-sharing`
 *
 * `M5-tasks.md`'s M5-04 "How" line names "share sheet" for this row and (in
 * a different bullet) for the not-yet-built M5-06 CSV export — but
 * `expo-sharing` is **not installed** (`package.json` has no such
 * dependency, confirmed by inspection) and M5-04's own task brief says
 * explicitly: "if not, check package.json and use whatever sharing
 * mechanism is already available/installed, don't add a new native
 * dependency without checking app.json/package.json config implications
 * first." React Native's own core `Share.share({message})` API needs no
 * package addition, no `app.json` config-plugin entry, and no linking step
 * beyond what's already bundled with `react-native` itself — it opens the
 * same native share sheet `expo-sharing` would, just via the message-string
 * form (no file URI needed here since diagnostics are exported as plain
 * text, not a file on disk — unlike the CSV/backup-zip exports M5-06/M5-09
 * will do, which *do* need a file URI and may be the case that finally
 * justifies adding `expo-sharing` when one of those tasks lands).
 *
 * `formatDiagnosticsExport` is kept pure/side-effect-free and exported
 * separately so its formatting rules (chronological order, one line per
 * event, ISO-8601 timestamps for unambiguous copy/paste into a bug report)
 * are unit-testable without touching `Share` at all; `shareDiagnostics` is
 * the thin impure wrapper the Settings screen's row calls.
 */
import { Share } from 'react-native';

import { logger, type LogEvent } from './logger';

/** Two-digit zero-pad, used only for the timestamp formatting below. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * One line per event, oldest-first (`Logger.exportEvents`'s own chronological
 * contract) — `[YYYY-MM-DD HH:mm:ss] LEVEL message`. Local time, not UTC
 * (matches `domain/csv-codec.ts`'s own "local time is what a human reading
 * an exported file expects" precedent) — deliberately hand-rolled rather
 * than `toISOString()` (which is always UTC) for the same reason.
 */
export function formatDiagnosticsExport(events: readonly LogEvent[]): string {
  if (events.length === 0) {
    return 'No diagnostic events recorded this session.';
  }

  return events
    .map((event) => {
      const d = new Date(event.timestamp);
      const stamp =
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
        `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      return `[${stamp}] ${event.level.toUpperCase()} ${event.message}`;
    })
    .join('\n');
}

/** Formats the current ring buffer and opens the OS share sheet with it as plain text. */
export async function shareDiagnostics(): Promise<void> {
  const text = formatDiagnosticsExport(logger.exportEvents());
  await Share.share({ message: text, title: 'Kyro diagnostics' });
}
