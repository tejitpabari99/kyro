/**
 * `lib/sound` unit tests (M2-11 acceptance gate) — the real implementation
 * under test, with `expo-audio` mocked at the module boundary (same pattern
 * `notifications.test.ts`, M2-10, already established for a `src/lib/**`
 * seam that needs a native import). Separate from any consumer test that
 * mocks this whole module via `src/lib/__mocks__/sound.ts` (08 §5's "mock
 * only true natives via `src/lib/` seams" convention) — this file is what
 * actually exercises `sound.ts`'s own logic (chime-choice → asset-key
 * mapping, volume-off/none no-ops, player caching/preload, and the "native
 * module unavailable" graceful-degradation path this file's own header
 * documents).
 *
 * `jest.resetModules()` + a fresh `require('../sound')` runs before *every*
 * test (not just the native-unavailable block below) — `sound.ts` caches
 * created `AudioPlayer`s in a module-level `Map` (deliberately, "preloaded,
 * not recreated per play" is the whole point), so without resetting the
 * module between tests, a chime played in one test would silently reuse a
 * player instance created (and no longer visible in `mockCreateAudioPlayer`'s
 * call history, cleared by `jest.clearAllMocks()`) by an earlier test —
 * confirmed the hard way (every assertion on "was `createAudioPlayer`
 * called this test" failed spuriously until this fix).
 */
const mockSetAudioModeAsync = jest.fn();
const mockCreateAudioPlayer = jest.fn();

function makeFakePlayer() {
  return {
    volume: 1,
    seekTo: jest.fn().mockResolvedValue(undefined),
    play: jest.fn(),
  };
}

jest.mock('expo-audio', () => ({
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

type SoundModule = typeof import('../sound');

let sound: SoundModule;

describe('lib/sound (M2-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockCreateAudioPlayer.mockImplementation(() => makeFakePlayer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sound = require('../sound') as SoundModule;
  });

  describe('preloadChimes', () => {
    it('creates a player for every chime key exactly once', () => {
      sound.preloadChimes();
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(4);
    });

    it('is idempotent — a second call reuses the already-created players', () => {
      sound.preloadChimes();
      sound.preloadChimes();
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(4);
    });

    it('configures playsInSilentMode: false exactly once, on first player creation', () => {
      sound.preloadChimes();
      expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
      expect(mockSetAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: false });
    });
  });

  describe('playTimerChime', () => {
    it('does nothing when choice is "none"', async () => {
      await sound.playTimerChime('none', 'normal');
      expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    });

    it('does nothing when volume is "off", regardless of choice', async () => {
      await sound.playTimerChime('bell', 'off');
      expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    });

    it('plays the "default" chime, applying the volume gain and restarting from 0', async () => {
      await sound.playTimerChime('default', 'high');
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
      const player = mockCreateAudioPlayer.mock.results[0].value;
      expect(player.seekTo).toHaveBeenCalledWith(0);
      expect(player.play).toHaveBeenCalledTimes(1);
      expect(player.volume).toBe(1);
    });

    it('plays a distinct asset for "bell" vs "beep" vs "default"', async () => {
      await sound.playTimerChime('bell', 'normal');
      await sound.playTimerChime('beep', 'normal');
      await sound.playTimerChime('default', 'normal');
      // Three distinct chime keys -> three distinct players created (each
      // asset only created once and cached thereafter).
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(3);
    });

    it('applies the "low" gain', async () => {
      await sound.playTimerChime('default', 'low');
      const player = mockCreateAudioPlayer.mock.results[0].value;
      expect(player.volume).toBeCloseTo(0.35);
    });

    it('applies the "normal" gain', async () => {
      await sound.playTimerChime('default', 'normal');
      const player = mockCreateAudioPlayer.mock.results[0].value;
      expect(player.volume).toBeCloseTo(0.7);
    });

    it('reuses the same (preloaded) player instance across repeated plays instead of recreating it', async () => {
      await sound.playTimerChime('default', 'normal');
      await sound.playTimerChime('default', 'normal');
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
      const player = mockCreateAudioPlayer.mock.results[0].value;
      expect(player.play).toHaveBeenCalledTimes(2);
    });
  });

  describe('playSetCheckChime', () => {
    it('does nothing when volume is "off"', async () => {
      await sound.playSetCheckChime('off');
      expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    });

    it('plays the set-check chime at the given volume', async () => {
      await sound.playSetCheckChime('high');
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
      const player = mockCreateAudioPlayer.mock.results[0].value;
      expect(player.play).toHaveBeenCalledTimes(1);
      expect(player.volume).toBe(1);
    });

    it('is a separate cached player instance from any timer chime', async () => {
      await sound.playTimerChime('default', 'normal');
      await sound.playSetCheckChime('normal');
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    });
  });

  it('does not throw when the underlying player throws on play() (graceful degradation)', async () => {
    mockCreateAudioPlayer.mockImplementation(() => ({
      volume: 1,
      seekTo: jest.fn().mockResolvedValue(undefined),
      play: jest.fn(() => {
        throw new Error('native play() failed');
      }),
    }));
    await expect(sound.playTimerChime('default', 'normal')).resolves.toBeUndefined();
  });

  it('does not throw when createAudioPlayer itself throws', async () => {
    mockCreateAudioPlayer.mockImplementation(() => {
      throw new Error('failed to create player');
    });
    await expect(sound.playTimerChime('default', 'normal')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Native-module-unavailable graceful degradation (see `sound.ts`'s file
// header) — a *separate* describe block using `jest.doMock` +
// `jest.resetModules()` so this file can also cover the "expo-audio itself
// throws on require()" path without disturbing the happy-path mock above
// (mirrors `notifications.test.ts`'s own identical two-block structure).
// ---------------------------------------------------------------------------
describe('lib/sound — native module unavailable (headless/Jest environment)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-audio', () => {
      throw new Error("Cannot find native module 'ExpoAudio'");
    });
  });

  afterEach(() => {
    jest.dontMock('expo-audio');
  });

  it('playTimerChime resolves as a silent no-op instead of throwing', async () => {
    // Plain `require()`, not a dynamic `import()` — mirrors
    // `notifications.test.ts`'s own identical rationale (this Jest/Babel
    // config doesn't transform `import()`, confirmed there empirically).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../sound') as SoundModule;
    await expect(mod.playTimerChime('default', 'normal')).resolves.toBeUndefined();
  });

  it('playSetCheckChime resolves as a silent no-op instead of throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../sound') as SoundModule;
    await expect(mod.playSetCheckChime('normal')).resolves.toBeUndefined();
  });

  it('preloadChimes never throws', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../sound') as SoundModule;
    expect(() => mod.preloadChimes()).not.toThrow();
  });
});
