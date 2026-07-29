/**
 * `lib/error-reporting` unit test (M0-11) — the `app/`-layer glue between
 * `ErrorBoundary`'s `onError` and the local log ring buffer + Sentry.
 */
import * as Sentry from '@sentry/react-native';

import { reportBoundaryError } from '@/lib/error-reporting';
import { logger } from '@/lib/logger';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

describe('lib/error-reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logger.clear();
  });

  it('logs a one-line entry and reports the error to Sentry', () => {
    const error = new Error('kaboom');

    reportBoundaryError('tab:workout', error);

    const events = logger.exportEvents();
    expect(events).toHaveLength(1);
    expect(events[0].level).toBe('error');
    expect(events[0].message).toBe('ErrorBoundary(tab:workout) caught: kaboom');
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
