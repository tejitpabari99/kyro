/**
 * Local log ring buffer (M0-11) — 06 §9: "Local log ring buffer
 * (`lib/logger.ts`, last 500 events, in kv-store) exportable from Settings
 * → About → 'Export diagnostics' for debugging without Sentry."
 *
 * The ring-buffer core below (`Logger`) is pure, dependency-free TS —
 * fully unit-testable (overflow eviction + chronological ordering, this
 * task's acceptance gate) without touching React Native or Expo at all.
 *
 * --- Persistence: deferred, on purpose (read before wiring) ---------------
 * 06 §9 names `expo-sqlite/kv-store` as the persistence target, and it *is*
 * installed (part of the `expo-sqlite` package already in this project).
 * But like `src/data/sqlite/driver.expo.ts` (see that file's header),
 * `expo-sqlite` needs a native module host — it cannot run under plain
 * Jest/Node, so a real `kv-store`-backed `LogPersistence` implementation
 * must live in its own device-only file, never imported by a test, the
 * same boundary `driver.expo.ts` / `driver.better-sqlite3.ts` already
 * establish for the DB driver.
 *
 * That device-only implementation is intentionally **not built yet** —
 * this task's scope is the ring buffer's correctness (overflow/ordering)
 * plus the persistence *seam* (`LogPersistence`), not the KV wiring
 * itself. `logger` (the singleton below) runs with `noopLogPersistence`
 * for now: events live in memory only and are lost on relaunch. Wiring a
 * real `expo-sqlite/kv-store`-backed `LogPersistence` (mirroring
 * `driver.expo.ts`'s shape: a `logger-kv-persistence.ts` file that
 * constructs a `Storage`/`SQLiteStorage` instance and implements `load`/
 * `save` below) is deferred to whichever task first needs logs to survive
 * a relaunch — at the latest, M5-04's diagnostics screen.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single ring-buffer entry. `message` must stay one line, no payload content (mirrors 06 §9's Sentry breadcrumb posture). */
export interface LogEvent {
  /** Epoch ms, assigned by `Logger` at record time — determines chronological order. */
  timestamp: number;
  level: LogLevel;
  message: string;
}

/** Maximum events retained — the 501st push evicts the oldest (index 0). */
export const LOG_RING_BUFFER_CAPACITY = 500;

/**
 * Pluggable persistence for the ring buffer. `load()` is called once to
 * hydrate a freshly constructed `Logger`; `save()` is called (fire-and-
 * forget, best-effort) after every recorded event. See file header for why
 * the real `expo-sqlite/kv-store` implementation is deferred.
 */
export interface LogPersistence {
  load(): Promise<LogEvent[]>;
  save(events: readonly LogEvent[]): Promise<void>;
}

/** Default persistence: nothing survives relaunch. See file header. */
export const noopLogPersistence: LogPersistence = {
  async load() {
    return [];
  },
  async save() {
    // Intentionally a no-op — see file header ("Persistence: deferred").
  },
};

/**
 * In-memory ring buffer of the last `LOG_RING_BUFFER_CAPACITY` events, with
 * an injectable persistence seam. Construct your own instance in tests;
 * the app uses the `logger` singleton exported below.
 */
export class Logger {
  private events: LogEvent[] = [];

  constructor(private readonly persistence: LogPersistence = noopLogPersistence) {}

  /** Record one event, evicting the oldest if over capacity. */
  record(level: LogLevel, message: string): void {
    this.events.push({ timestamp: Date.now(), level, message });
    if (this.events.length > LOG_RING_BUFFER_CAPACITY) {
      this.events.shift();
    }
    // Fire-and-forget, best-effort — a persistence failure must never
    // affect in-memory logging (which is the source of truth for the
    // current session either way).
    void this.persistence.save(this.events).catch(() => {});
  }

  debug(message: string): void {
    this.record('debug', message);
  }

  info(message: string): void {
    this.record('info', message);
  }

  warn(message: string): void {
    this.record('warn', message);
  }

  error(message: string): void {
    this.record('error', message);
  }

  /**
   * Export hook for the future diagnostics screen (M5-04, "Export
   * diagnostics" per 06 §9) — returns events oldest-first (chronological
   * order). Just the seam: no screen consumes this yet.
   */
  exportEvents(): LogEvent[] {
    return [...this.events];
  }

  /** Replace the in-memory buffer with previously persisted events (newest `LOG_RING_BUFFER_CAPACITY`, oldest-first). Call once at startup if wiring real persistence. */
  async hydrate(): Promise<void> {
    const persisted = await this.persistence.load();
    this.events = persisted.slice(-LOG_RING_BUFFER_CAPACITY);
  }

  /** Test/debug helper: drop all in-memory events. */
  clear(): void {
    this.events = [];
  }
}

/** The logger instance used by the real app. See file header re: deferred persistence. */
export const logger = new Logger();
