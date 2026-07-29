/**
 * `settingsStore` tests (M0-10 acceptance gate) — synchronous reads,
 * write-through, and the "survives relaunch" gate: a **fresh store
 * instance** (via `createSettingsStore()`, not the app-wide singleton)
 * reading from the same underlying on-disk database sees the value written
 * by an earlier, independent instance — i.e. the persistence lives in
 * SQLite, not in any in-memory store state (see file header of
 * `settings-store.ts`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { SETTINGS_DEFAULTS } from '@/data/settings/settings-schema';
import type { SqliteDriver } from '@/data/sqlite/driver';

import { createSettingsStore, useSettingsStore } from '../settings-store';

describe('settingsStore (M0-10)', () => {
  it('starts seeded with code defaults before load() resolves', () => {
    const store = createSettingsStore();
    expect(store.getState().settings).toEqual(SETTINGS_DEFAULTS);
    expect(store.getState().loaded).toBe(false);
  });

  it('load() populates settings from the repository and flips loaded=true', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const repository = new SettingsRepository(driver);
    await repository.set('theme', 'dark');

    const store = createSettingsStore();
    await store.getState().load(repository);

    expect(store.getState().loaded).toBe(true);
    expect(store.getState().settings.theme).toBe('dark');

    driver.close();
  });

  it('setSetting() writes through to the repository and updates state synchronously for subsequent reads', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const repository = new SettingsRepository(driver);

    const store = createSettingsStore();
    await store.getState().load(repository);

    await store.getState().setSetting('weight_unit', 'lbs');

    // Synchronous read reflects the change immediately (no re-fetch needed).
    expect(store.getState().settings.weight_unit).toBe('lbs');
    // And it truly went through to the DB, not just local state.
    expect((await repository.get()).weight_unit).toBe('lbs');

    driver.close();
  });

  it('setSetting() before load() throws rather than silently dropping the write', async () => {
    const store = createSettingsStore();
    await expect(store.getState().setSetting('theme', 'dark')).rejects.toThrow(/load\(\)/);
  });

  it('the exported useSettingsStore singleton is independent of ad-hoc test instances', () => {
    const other = createSettingsStore();
    expect(other).not.toBe(useSettingsStore);
  });

  describe('theme + weight_unit survive a simulated relaunch (fresh store instance, same DB)', () => {
    let dbPath: string;

    beforeEach(() => {
      dbPath = path.join(os.tmpdir(), `kyro-settings-store-test-${process.pid}-${Date.now()}.db`);
    });

    afterEach(() => {
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${dbPath}${suffix}`, { force: true });
      }
    });

    it('persists theme across a fresh settingsStore instance reopening the same database file', async () => {
      // --- "first launch" ---
      const driver1: SqliteDriver = openBetterSqlite3Driver(dbPath);
      migrate(driver1);
      const storeA = createSettingsStore();
      await storeA.getState().load(new SettingsRepository(driver1));

      await storeA.getState().setSetting('theme', 'dark');
      await storeA.getState().setSetting('weight_unit', 'lbs');
      expect(storeA.getState().settings.theme).toBe('dark');

      driver1.close();

      // --- simulated relaunch: brand-new store instance + brand-new driver
      // handle reopening the same on-disk file (nothing shared in memory
      // with storeA/driver1 above). ---
      const driver2: SqliteDriver = openBetterSqlite3Driver(dbPath);
      const storeB = createSettingsStore();
      expect(storeB).not.toBe(storeA);

      await storeB.getState().load(new SettingsRepository(driver2));

      expect(storeB.getState().settings.theme).toBe('dark');
      expect(storeB.getState().settings.weight_unit).toBe('lbs');
      // Untouched keys still resolve to their code defaults post-relaunch.
      expect(storeB.getState().settings.distance_unit).toBe(SETTINGS_DEFAULTS.distance_unit);

      driver2.close();
    });
  });
});
