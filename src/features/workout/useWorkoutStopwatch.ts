/**
 * `useWorkoutStopwatch` (M2-05) — 06 §6.1: "Display-only derivation: `now −
 * start_time − pause_offset` (paused: frozen at stored offset). Implemented
 * as a 1 s interval hook mounted only in logger/mini-bar."
 *
 * ## Pause modeling (read before touching this file)
 *
 * The `workouts` schema (05 §3.2) persists exactly two time fields relevant
 * here — `start_time` and `duration_pause_offset_ms` — and nothing else
 * (no `paused_at` column). This hook treats "currently paused" as **local,
 * ephemeral UI state** (a `pausedAt` timestamp kept in `useState`, not
 * written to the DB the instant Pause is pressed): the *effect* of a pause
 * only becomes durable when the caller calls {@link WorkoutStopwatch.resume}
 * and persists the returned `nextPauseOffsetMs` via
 * `activeWorkoutStore.updateMeta({ durationPauseOffsetMs })` — the exact
 * "mutates `start_time`/`duration_pause_offset_ms` via `updateMeta`" 06 §6.1
 * describes. This is a deliberate scope simplification for M2-05 (documented
 * here rather than left implicit): a pause that is still active when the
 * app is killed does not survive relaunch as "still paused" — the durability
 * matrix for that exact edge case belongs to M2-13's mini-bar/AppState work,
 * not this task's acceptance gate (which only requires "duration/pause edits
 * persist," i.e. the *offset a completed pause/resume cycle produces* is
 * durable, which it is).
 *
 * Formula while running: `elapsedMs = now - startTime - durationPauseOffsetMs`.
 * Formula while paused: `elapsedMs = pausedAt - startTime - durationPauseOffsetMs`
 * (frozen — `now` never enters it, matching "paused: frozen at stored
 * offset" literally: the frozen value **is** what the offset will become
 * once resume persists it).
 *
 * Retro-log mode (02 §1: "the duration stopwatch **paused at 0**"): pass
 * `initiallyPaused: true` — the hook seeds `pausedAt = startTime` on mount,
 * which makes the frozen formula evaluate to exactly `0` (`startTime -
 * startTime - 0`) without a separate "paused at zero" special case.
 */
import { useEffect, useState } from 'react';

const TICK_MS = 1000;

export interface UseWorkoutStopwatchParams {
  /** The active workout's `start_time` (epoch ms). */
  startTime: number;
  /** The active workout's persisted `duration_pause_offset_ms`. */
  durationPauseOffsetMs: number;
  /** Retro-log mode (02 §1) — starts paused with elapsed frozen at 0. Only read on mount. */
  initiallyPaused?: boolean;
}

export interface WorkoutStopwatch {
  elapsedMs: number;
  isPaused: boolean;
  /** Freeze the stopwatch now (local UI state only — not yet persisted). */
  pause: () => void;
  /** Un-freeze; returns the `durationPauseOffsetMs` value the caller must persist (`updateMeta`) for the pause to actually stick. A no-op call (already running) just returns the current offset unchanged. */
  resume: () => number;
}

export function useWorkoutStopwatch({
  startTime,
  durationPauseOffsetMs,
  initiallyPaused = false,
}: UseWorkoutStopwatchParams): WorkoutStopwatch {
  const [now, setNow] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(() =>
    initiallyPaused ? startTime : null,
  );

  useEffect(() => {
    if (pausedAt !== null) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [pausedAt]);

  const elapsedMs =
    pausedAt !== null
      ? Math.max(0, pausedAt - startTime - durationPauseOffsetMs)
      : Math.max(0, now - startTime - durationPauseOffsetMs);

  const pause = (): void => {
    setPausedAt((current) => current ?? Date.now());
  };

  const resume = (): number => {
    if (pausedAt === null) {
      return durationPauseOffsetMs;
    }
    const nowMs = Date.now();
    const nextOffset = durationPauseOffsetMs + (nowMs - pausedAt);
    setPausedAt(null);
    setNow(nowMs);
    return nextOffset;
  };

  return { elapsedMs, isPaused: pausedAt !== null, pause, resume };
}
