/**
 * `lib/logger` unit tests (M0-11 acceptance gate): ring-buffer overflow
 * (the 501st event evicts the oldest) and ordering (events retrievable in
 * correct chronological order).
 */
import { LOG_RING_BUFFER_CAPACITY, Logger, logger, type LogPersistence } from '@/lib/logger';

describe('lib/logger — Logger', () => {
  it('retains events in chronological order (oldest first)', () => {
    const logger = new Logger();

    logger.info('first');
    logger.warn('second');
    logger.error('third');

    const events = logger.exportEvents();

    expect(events.map((event) => event.message)).toEqual(['first', 'second', 'third']);
    expect(events.map((event) => event.level)).toEqual(['info', 'warn', 'error']);
    // Non-decreasing timestamps in insertion order.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
    }
  });

  it('evicts the oldest event once the 501st event is recorded (ring overflow)', () => {
    const logger = new Logger();

    for (let i = 0; i < LOG_RING_BUFFER_CAPACITY; i += 1) {
      logger.info(`event-${i}`);
    }

    let events = logger.exportEvents();
    expect(events).toHaveLength(LOG_RING_BUFFER_CAPACITY);
    expect(events[0].message).toBe('event-0');
    expect(events[events.length - 1].message).toBe(`event-${LOG_RING_BUFFER_CAPACITY - 1}`);

    // The 501st event: oldest ("event-0") is evicted, buffer stays at capacity.
    logger.info('event-500-overflow');

    events = logger.exportEvents();
    expect(events).toHaveLength(LOG_RING_BUFFER_CAPACITY);
    expect(events[0].message).toBe('event-1');
    expect(events[events.length - 1].message).toBe('event-500-overflow');
    expect(events.some((event) => event.message === 'event-0')).toBe(false);
  });

  it('exportEvents() returns a snapshot copy, not a live reference', () => {
    const logger = new Logger();
    logger.info('one');

    const first = logger.exportEvents();
    logger.info('two');
    const second = logger.exportEvents();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  it('clear() empties the buffer', () => {
    const logger = new Logger();
    logger.info('one');
    logger.clear();

    expect(logger.exportEvents()).toHaveLength(0);
  });

  it('debug/info/warn/error each tag the recorded level correctly', () => {
    const logger = new Logger();
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(logger.exportEvents().map((event) => event.level)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
    ]);
  });

  it('calls persistence.save (best-effort) after each recorded event and swallows failures', async () => {
    const save = jest.fn().mockRejectedValue(new Error('disk full'));
    const persistence: LogPersistence = { load: jest.fn().mockResolvedValue([]), save };
    const logger = new Logger(persistence);

    logger.info('one');
    // Flush the fire-and-forget promise microtask.
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    // Recording again after a failed save must not throw or drop state.
    expect(() => logger.info('two')).not.toThrow();
    expect(logger.exportEvents()).toHaveLength(2);
  });

  it('the default logger singleton uses no-op persistence — hydrate() yields an empty buffer', async () => {
    logger.clear();

    await logger.hydrate();

    expect(logger.exportEvents()).toEqual([]);
  });

  it('hydrate() loads persisted events, capped to the ring capacity, oldest-first', async () => {
    const persisted = Array.from({ length: LOG_RING_BUFFER_CAPACITY + 10 }, (_, i) => ({
      timestamp: i,
      level: 'info' as const,
      message: `persisted-${i}`,
    }));
    const persistence: LogPersistence = {
      load: jest.fn().mockResolvedValue(persisted),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const logger = new Logger(persistence);

    await logger.hydrate();

    const events = logger.exportEvents();
    expect(events).toHaveLength(LOG_RING_BUFFER_CAPACITY);
    expect(events[0].message).toBe('persisted-10');
    expect(events[events.length - 1].message).toBe(`persisted-${LOG_RING_BUFFER_CAPACITY + 9}`);
  });
});
