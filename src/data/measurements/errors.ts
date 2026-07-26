/**
 * Typed errors for `MeasurementRepository` (M5-01) — mirrors the pattern
 * `src/data/exercises/errors.ts`/`src/data/workouts/errors.ts` established:
 * a repository-level invariant violation is a distinct `Error` subclass
 * (checkable via `instanceof`), never a raw SQLite message or a generic
 * `Error` leaking to callers.
 *
 * `clearField` deliberately has **no** matching "row not found" error — a
 * date with no `body_measurements` row is treated as an idempotent no-op
 * (see that method's own doc comment in `./types.ts`), the same
 * "never throw on an already-gone side effect" posture
 * `src/lib/files.ts`'s `deleteExercisePhoto` established (03 §5). Only
 * `deletePhoto` gets a typed not-found error: unlike a bare date key
 * (never explicitly "created", only ever implied by `upsert`/`addPhoto`), a
 * photo `id` is a real row a caller must already hold a reference to, so a
 * miss is either a genuine bug or a stale/raced id — worth surfacing rather
 * than silently swallowing.
 */

/** Thrown by `deletePhoto` when no `progress_photos` row matches `id`. */
export class ProgressPhotoNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Progress photo "${id}" was not found.`);
    this.name = 'ProgressPhotoNotFoundError';
  }
}
