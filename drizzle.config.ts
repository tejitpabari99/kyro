/**
 * drizzle-kit config (M0-09) — generates versioned SQL migration files from
 * `src/data/sqlite/schema.ts` into `src/data/migrations/` (05 §10: "drizzle-kit
 * generates versioned SQL files, bundled and applied sequentially at cold
 * start"). Run with `npx drizzle-kit generate` after editing schema.ts;
 * never hand-edit or re-generate an already-applied migration file (05 §10).
 *
 * `dbCredentials` is required by drizzle-kit's CLI schema validation even
 * though `generate` (schema-diff codegen, no live DB) never opens it —
 * that's the runner's job (`src/data/sqlite/migrator.ts`), deliberately kept
 * outside drizzle-kit entirely so the applied head can be tracked in
 * `app_meta.schema_version` (05 §3.5) rather than drizzle's own default
 * migrations-tracking table.
 */
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/data/sqlite/schema.ts',
  out: './src/data/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: ':memory:',
  },
} satisfies Config;
