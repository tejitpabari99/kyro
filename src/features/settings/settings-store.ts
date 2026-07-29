/**
 * `settingsStore` (M0-10) — 06 §4 item 2: "loaded at boot from
 * `SettingsRepository`, synchronous reads everywhere (units, toggles),
 * writes through."
 *
 * `createSettingsStore()` is a **factory**, not just a bare singleton store,
 * so tests can construct an independent store instance that still reads
 * through to the same underlying database — the exact shape M0-10's
 * "survives relaunch" acceptance gate asks for: "re-mounts the root layout
 * (simulating relaunch by creating a fresh settingsStore instance backed by
 * the same DB)". A real app boot only ever needs one instance — `
 * useSettingsStore` below is that singleton, imported everywhere in app
 * code (root layout, settings screen, future consumers).
 *
 * Boot sequence (06 §5.1, wired in `app/_layout.tsx`): after
 * `runDbBoot()` resolves, call `useSettingsStore.getState().load(new
 * SettingsRepository(getAppDriver()))` before rendering the route tree —
 * every read after that point is synchronous (`useSettingsStore((s) =>
 * s.settings.theme)` or `useSettingsStore.getState().settings...` outside
 * React), matching 06 §4's "synchronous reads everywhere".
 */
import { create } from 'zustand';

import type { SettingsRepository } from '@/data/settings/settings-repository';
import { SETTINGS_DEFAULTS, type Settings, type SettingsKey } from '@/data/settings/settings-schema';

export interface SettingsStoreState {
  /** The current settings snapshot — `SETTINGS_DEFAULTS` until `load()` resolves. */
  settings: Settings;
  /** `true` once `load()` has resolved at least once (boot's settings step completed). */
  loaded: boolean;
  /**
   * Read the full settings object from `repository` and seed the store with
   * it. Call once at boot (06 §5.1, before rendering tabs); keeps `repository`
   * for subsequent `setSetting()` write-throughs.
   */
  load: (repository: SettingsRepository) => Promise<void>;
  /**
   * Write `value` through to the repository, then update the in-memory
   * snapshot so every subscribed consumer (e.g. `ThemeProvider`'s controlled
   * `preference` prop) re-renders instantly — the "instant app-wide" half of
   * M0-10's acceptance gate. Throws if called before `load()` (programmer
   * error — boot always calls `load()` before rendering the route tree that
   * could reach a settings-writing screen).
   */
  setSetting: <K extends SettingsKey>(key: K, value: Settings[K]) => Promise<void>;
}

/** Build a fresh, independent settings store — see file header for why this is a factory. */
export function createSettingsStore() {
  let repository: SettingsRepository | undefined;

  return create<SettingsStoreState>((set) => ({
    settings: SETTINGS_DEFAULTS,
    loaded: false,

    async load(nextRepository) {
      repository = nextRepository;
      const settings = await nextRepository.get();
      set({ settings, loaded: true });
    },

    async setSetting(key, value) {
      if (!repository) {
        throw new Error(
          'settingsStore.setSetting() called before load() — boot must call load() first (06 §5.1).',
        );
      }
      await repository.set(key, value);
      set((state) => ({ settings: { ...state.settings, [key]: value } }));
    },
  }));
}

/** The one settings store used by the real app (app root, settings screen, future consumers). */
export const useSettingsStore = createSettingsStore();
