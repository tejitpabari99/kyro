/**
 * In-app chime playback seam (06 §6.4, 02 §7) — "`lib/sound.ts` preloads
 * timer/check chimes (expo-audio, `playsInSilentMode: false`, volumes from
 * settings)." This is strictly the *in-app foreground* chime (the rest
 * timer's own OS-level notification sound is a separate, already-shipped
 * concern — `src/lib/notifications.ts`/`restTimerStore.ts`, M2-10 — this
 * file never touches that path).
 *
 * Nothing upstream of `src/lib` should import `expo-audio` directly — go
 * through this module so it stays the single mockable seam (08 §5).
 *
 * ## Why `expo-audio` is lazily `require()`d, inside a `try/catch`
 * Same finding `notifications.ts`'s own header documents at length for
 * `expo-notifications`, re-confirmed empirically for this package too:
 * `expo-audio`'s `ExpoAudio.ts` entry point calls
 * `AudioModule.AudioPlayer.prototype.replace` **at module-evaluation time**
 * (not lazily inside a function), and `AudioModule.ts` itself calls the
 * plain (non-optional) `requireNativeModule('ExpoAudio')` — under
 * `jest-expo` (no native host registered here, `docs/plan/BLOCKERS.md`),
 * even a bare `require('expo-audio')` throws `Cannot find native module
 * 'ExpoAudio'` synchronously, confirmed with a throwaway probe test before
 * writing this file. So every function below that needs the real module
 * calls {@link loadExpoAudio} (a lazy, try/catch-guarded `require()`,
 * mirroring `notifications.ts`'s `loadExpoNotifications`) rather than a
 * top-level `import` — merely importing `src/lib/sound.ts` (which
 * `TimerPill.tsx`/`ConnectedSetRow.tsx` do unconditionally) never touches
 * `expo-audio` at all unless a chime actually plays.
 *
 * The four chime **asset** `require()`s below are a different thing
 * entirely — plain Metro/Jest asset requires (`.wav` files), which never
 * throw (jest-expo's own preset already transforms `wav`/`mp3`/etc. via its
 * `defaultMetroAssetExts` asset-file transformer, the same mechanism that
 * already makes exercise-thumbnail image `require()`s work under Jest) — so
 * those stay as ordinary top-level `const` requires, resolved once,
 * independent of whether the native audio module itself is ever available.
 *
 * ## Placeholder chime assets (documented judgment call, not silently done)
 * No production chime audio exists anywhere in this repo yet (`assets/`
 * only has exercise thumbnails/icons before this task). Per this task's own
 * brief ("source or generate minimal placeholder sound assets ... do not
 * block the whole task on missing audio assets"), `assets/sounds/*.wav` are
 * freshly generated here (`python3`'s `wave`/`math` stdlib, no external
 * download, no licensing question) — short (80–500 ms), tiny (2.6–16 KB),
 * plain sine-tone WAVs distinguishing the three `timer_sound` choices
 * (`default` = two-note ascending ding, `bell` = a longer two-harmonic
 * tone, `beep` = a flat double-beep) plus one separate, higher/shorter
 * `set-check` tick so it's audibly distinct from any timer chime. These are
 * explicitly placeholders for a future design pass, not a finished audio
 * asset — flagged again in `docs/plan/EXECUTION-LOG.md`'s own M2-11 row.
 */
import { logger } from './logger';

export type SoundChoice = 'default' | 'bell' | 'beep' | 'none';
export type VolumeLevel = 'off' | 'low' | 'normal' | 'high';

type ChimeKey = 'timer-default' | 'timer-bell' | 'timer-beep' | 'set-check';

/** Plain Metro/Jest asset requires — never throw, see file header. */
const CHIME_ASSETS: Record<ChimeKey, number> = {
  'timer-default': require('../../assets/sounds/timer-chime-default.wav') as number,
  'timer-bell': require('../../assets/sounds/timer-chime-bell.wav') as number,
  'timer-beep': require('../../assets/sounds/timer-chime-beep.wav') as number,
  'set-check': require('../../assets/sounds/set-check.wav') as number,
};

/** `'off'` is handled by every call site before this is consulted — never actually looked up at 0, kept here anyway so the map is total over `VolumeLevel`. */
const VOLUME_GAIN: Record<VolumeLevel, number> = {
  off: 0,
  low: 0.35,
  normal: 0.7,
  high: 1,
};

/** See file header — `null` means "unavailable," every call site treats that as a silent no-op (matches `notifications.ts`'s own graceful-degradation posture for the identical native-module-missing case). */
function loadExpoAudio(): typeof import('expo-audio') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load, see file header.
    return require('expo-audio') as typeof import('expo-audio');
  } catch {
    return null;
  }
}

type ExpoAudioModule = NonNullable<ReturnType<typeof loadExpoAudio>>;
type AudioPlayerInstance = ReturnType<ExpoAudioModule['createAudioPlayer']>;

const players = new Map<ChimeKey, AudioPlayerInstance>();
let audioModeConfigured = false;

function ensurePlayer(key: ChimeKey): AudioPlayerInstance | null {
  const cached = players.get(key);
  if (cached) {
    return cached;
  }
  const ExpoAudio = loadExpoAudio();
  if (!ExpoAudio) {
    return null;
  }
  if (!audioModeConfigured) {
    audioModeConfigured = true;
    // Fire-and-forget, same posture as every other native call in this
    // file — 06 §6.4 / this task's "How": "playsInSilentMode: false."
    ExpoAudio.setAudioModeAsync({ playsInSilentMode: false }).catch((error: unknown) => {
      logger.warn(
        `sound: setAudioModeAsync failed (${error instanceof Error ? error.message : String(error)})`,
      );
    });
  }
  try {
    const player = ExpoAudio.createAudioPlayer(CHIME_ASSETS[key]);
    players.set(key, player);
    return player;
  } catch (error) {
    logger.warn(
      `sound: createAudioPlayer failed for ${key} (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return null;
  }
}

/**
 * Preload every chime once (06 §6.4: "preloads timer/check chimes") — call
 * once at app boot (`app/_layout.tsx`) so the very first playback has no
 * load latency. Safe to call more than once (idempotent — {@link ensurePlayer}
 * caches) and safe when `expo-audio`'s native module is unavailable (this
 * headless environment): every path degrades to a no-op rather than
 * throwing, matching this file's overall graceful-degradation posture.
 */
export function preloadChimes(): void {
  (Object.keys(CHIME_ASSETS) as ChimeKey[]).forEach((key) => ensurePlayer(key));
}

function chimeKeyForTimerSound(choice: SoundChoice): ChimeKey | null {
  switch (choice) {
    case 'none':
      return null;
    case 'bell':
      return 'timer-bell';
    case 'beep':
      return 'timer-beep';
    case 'default':
      return 'timer-default';
    default:
      return 'timer-default';
  }
}

async function play(key: ChimeKey, volume: VolumeLevel): Promise<void> {
  if (volume === 'off') {
    return;
  }
  const player = ensurePlayer(key);
  if (!player) {
    return;
  }
  try {
    player.volume = VOLUME_GAIN[volume];
    // Restart from the top on every play — these are short, one-shot
    // chimes reused across many plays (preloaded, not recreated), so a
    // second play while `currentTime` is mid-way through the first must
    // not just resume from there.
    await player.seekTo(0);
    player.play();
  } catch (error) {
    logger.warn(
      `sound: play failed for ${key} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** Rest timer foreground completion chime (02 §7 "Completion in-foreground: chime ... "; 06 §6.4 timer volume). `choice === 'none'` or `volume === 'off'` is a silent no-op. */
export async function playTimerChime(choice: SoundChoice, volume: VolumeLevel): Promise<void> {
  const key = chimeKeyForTimerSound(choice);
  if (!key) {
    return;
  }
  await play(key, volume);
}

/** Set-check chime (02 §7's "sounds setting" names timer/set-check/notifications as three independent volumes — this is the set-check one). `volume === 'off'` is a silent no-op; there is no per-choice variant for this chime (unlike the timer's default/bell/beep), matching `set_check_volume`'s own schema shape (05 §3.5: a volume only, no separate sound-choice field). */
export async function playSetCheckChime(volume: VolumeLevel): Promise<void> {
  await play('set-check', volume);
}
