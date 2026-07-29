/**
 * `formatDiagnosticsExport`/`shareDiagnostics` tests (M5-04, 06 §9) — the
 * pure formatting rule (chronological order preserved as given, one line
 * per event, local-time `YYYY-MM-DD HH:mm:ss` stamps, level uppercased) and
 * the thin `Share.share` wrapper (mocked — the real native
 * `NativeActionSheetManager` is unavailable under Jest, confirmed
 * separately; see `diagnostics-export.ts`'s own file header).
 */
import { Share } from 'react-native';

import type { LogEvent } from '../logger';
import { formatDiagnosticsExport, shareDiagnostics } from '../diagnostics-export';
import { logger } from '../logger';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function expectedStamp(timestamp: number): string {
  const d = new Date(timestamp);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

describe('formatDiagnosticsExport', () => {
  it('returns a friendly message for an empty event list', () => {
    expect(formatDiagnosticsExport([])).toBe('No diagnostic events recorded this session.');
  });

  it('formats one line per event, in the given (chronological) order, with an uppercased level', () => {
    const events: LogEvent[] = [
      { timestamp: 1_700_000_000_000, level: 'info', message: 'app.boot' },
      { timestamp: 1_700_000_005_000, level: 'error', message: 'workout.autoHeal' },
    ];

    const text = formatDiagnosticsExport(events);
    const lines = text.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`[${expectedStamp(events[0]!.timestamp)}] INFO app.boot`);
    expect(lines[1]).toBe(`[${expectedStamp(events[1]!.timestamp)}] ERROR workout.autoHeal`);
  });

  it('zero-pads single-digit month/day/hour/minute/second components', () => {
    // 2026-01-03 04:05:06 local time.
    const timestamp = new Date(2026, 0, 3, 4, 5, 6).getTime();
    const text = formatDiagnosticsExport([{ timestamp, level: 'debug', message: 'x' }]);

    expect(text).toBe('[2026-01-03 04:05:06] DEBUG x');
  });
});

describe('shareDiagnostics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    logger.clear();
  });

  it('formats the current ring buffer and opens the share sheet with it', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    logger.info('app.boot');
    logger.warn('restTimer.restore.failed');

    await shareDiagnostics();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const [{ message, title }] = shareSpy.mock.calls[0]!;
    expect(title).toBe('Kyro diagnostics');
    expect(message).toContain('INFO app.boot');
    expect(message).toContain('WARN restTimer.restore.failed');
  });
});
