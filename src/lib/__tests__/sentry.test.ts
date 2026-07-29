/**
 * `lib/sentry` unit tests (M0-11 acceptance gate) — asserts the two halves
 * of "app runs identically with and without DSN set": `Sentry.init` is NOT
 * called when the DSN env var is empty/unset, and IS called with the
 * required config (`sendDefaultPii: false`) when a DSN is present.
 * `@sentry/react-native` itself is mocked — this suite only asserts our
 * seam's behavior, not the vendor SDK's.
 */
import * as Sentry from '@sentry/react-native';

import { __resetSentryForTests, captureError, initSentry, recordBreadcrumb } from '@/lib/sentry';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

describe('lib/sentry', () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetSentryForTests();
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  afterAll(() => {
    if (originalDsn === undefined) {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    } else {
      process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    }
  });

  it('does not call Sentry.init when the DSN env var is unset', () => {
    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('does not call Sentry.init when the DSN env var is an empty string', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = '';

    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the required privacy config when a DSN is present', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';

    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@o0.ingest.sentry.io/0',
        sendDefaultPii: false,
      }),
    );
  });

  it('is idempotent — a second call does not re-init', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';

    initSentry();
    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });

  it('recordBreadcrumb forwards a one-line message, truncating at the first newline', () => {
    recordBreadcrumb('workout.start\nsome extra content that must never be sent');

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'action',
      message: 'workout.start',
      level: 'info',
    });
  });

  it('captureError forwards to Sentry.captureException', () => {
    const error = new Error('boom');

    captureError(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
