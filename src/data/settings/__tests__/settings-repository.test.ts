/**
 * `SettingsRepository` integration tests (M0-10 acceptance gate) — run
 * fully in Node via `better-sqlite3` against the real migrated schema (05
 * §10 / 08 §5 parity: same migration SQL the device applies).
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import { SettingsRepository } from '../settings-repository';
import { SETTINGS_DEFAULTS, SETTINGS_KEYS } from '../settings-schema';
import type { SqliteDriver } from '../../sqlite/driver';

describe('SettingsRepository (better-sqlite3 integration, M0-10)', () => {
  let driver: SqliteDriver;
  let repository: SettingsRepository;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new SettingsRepository(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('get() returns every key at its code default on an empty database', async () => {
    const settings = await repository.get();

    expect(settings).toEqual(SETTINGS_DEFAULTS);
    // Belt-and-suspenders: every one of the 19 documented keys (05 §3.5) is
    // present — not just "the object deep-equals defaults" (which would
    // also pass if both were vacuously `{}`).
    expect(SETTINGS_KEYS).toHaveLength(19);
    for (const key of SETTINGS_KEYS) {
      expect(settings[key]).toEqual(SETTINGS_DEFAULTS[key]);
    }
  });

  it('set()/get() round-trips a simple scalar value', async () => {
    await repository.set('theme', 'dark');
    await repository.set('weight_unit', 'lbs');

    const settings = await repository.get();

    expect(settings.theme).toBe('dark');
    expect(settings.weight_unit).toBe('lbs');
    // Untouched keys keep their defaults.
    expect(settings.distance_unit).toBe(SETTINGS_DEFAULTS.distance_unit);
  });

  it('set()/get() round-trips a nested object value', async () => {
    const customSounds = {
      timer_sound: 'bell' as const,
      timer_volume: 'high' as const,
      set_check_volume: 'off' as const,
      notification_volume: 'low' as const,
    };
    await repository.set('sounds', customSounds);

    const settings = await repository.get();
    expect(settings.sounds).toEqual(customSounds);
  });

  it('a second set() call on the same key overwrites (upsert), not duplicates', async () => {
    await repository.set('default_rest_seconds', 60);
    await repository.set('default_rest_seconds', 120);

    const rows = driver.queryAll<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'default_rest_seconds'`,
    );
    expect(rows).toHaveLength(1);
    expect((await repository.get()).default_rest_seconds).toBe(120);
  });

  it('persists across repository instances against the same underlying database', async () => {
    await repository.set('theme', 'light');

    const secondRepository = new SettingsRepository(driver);
    expect((await secondRepository.get()).theme).toBe('light');
  });

  it('a deliberately corrupted JSON value for one key falls back to that key’s default without throwing or corrupting other keys', async () => {
    await repository.set('theme', 'dark');
    // Not valid JSON at all.
    driver.execute(`INSERT INTO settings (key, value) VALUES ('weight_unit', ?)`, [
      '{not-json',
    ]);

    const settings = await repository.get();

    expect(settings.weight_unit).toBe(SETTINGS_DEFAULTS.weight_unit);
    // Sibling keys unaffected — the one before it in iteration order...
    expect(settings.theme).toBe('dark');
    // ...and the ones after it in iteration order (rules out "corruption
    // stops the decode loop partway through").
    expect(settings.body_measurement_unit).toBe(SETTINGS_DEFAULTS.body_measurement_unit);
    expect(settings.sentry_enabled).toBe(SETTINGS_DEFAULTS.sentry_enabled);
  });

  it('a value that is valid JSON but fails its Zod shape also falls back to the default', async () => {
    // Valid JSON, wrong enum member — `weight_unit` only accepts 'kg'|'lbs'.
    driver.execute(`INSERT INTO settings (key, value) VALUES ('weight_unit', ?)`, [
      JSON.stringify('stone'),
    ]);
    // Valid JSON, wrong shape entirely for a nested object key.
    driver.execute(`INSERT INTO settings (key, value) VALUES ('sounds', ?)`, [
      JSON.stringify({ unrelated: true }),
    ]);

    const settings = await repository.get();

    expect(settings.weight_unit).toBe(SETTINGS_DEFAULTS.weight_unit);
    expect(settings.sounds).toEqual(SETTINGS_DEFAULTS.sounds);
  });

  it('an unrecognized stored key (schema shrank/renamed) is ignored, not surfaced', async () => {
    driver.execute(`INSERT INTO settings (key, value) VALUES ('some_removed_key', ?)`, [
      JSON.stringify(true),
    ]);

    const settings = await repository.get();
    expect(settings).toEqual(SETTINGS_DEFAULTS);
    expect(Object.keys(settings)).not.toContain('some_removed_key');
  });
});
