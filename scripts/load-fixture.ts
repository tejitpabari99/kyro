/**
 * `scripts/load-fixture.ts` (M4-11) — `pnpm run load-fixture`, in the same
 * `tsx scripts/*.ts` vein as `scripts/build-exercise-db.ts`. Generates the
 * synthetic 5-year, 1000+-workout history fixture
 * (`src/test/fixtures/synthetic-history.ts`) and bulk-loads it
 * (`src/test/fixtures/synthetic-history-loader.ts`) into a standalone
 * on-disk `better-sqlite3` database — for local inspection (open the
 * resulting file with any SQLite browser) and for reuse by M5's own
 * import-perf work and 08 §7's spot-checks (both named by M4-11's own task
 * text as future consumers of this exact fixture).
 *
 * This is deliberately **not** how fixture data reaches the real
 * on-device app — a Node script has no way to write into the sandboxed
 * `expo-sqlite` file a running app opens (a different process, a different
 * storage sandbox). `app/dev/load-fixture.tsx` (this same task, `__DEV__`
 * -gated, linked from the Profile tab's dev section) is the counterpart
 * for that: it calls the exact same generator + loader functions, just
 * against the real app's own already-open driver (`getAppDriver()`)
 * instead of a fresh on-disk file here.
 *
 * Usage: `pnpm run load-fixture [-- --out <path>] [-- --workouts <n>]`
 * (defaults: `./tmp/fixture.db`, 1040 workouts).
 */
import * as fs from 'node:fs';
import Module from 'node:module';
import * as path from 'node:path';

// `src/data/migrations/manifest.ts` imports each `.sql` migration file
// directly (`import migrationXSql from './000X_*.sql'`), relying on
// `babel-plugin-inline-import` (root `babel.config.js`) to inline the
// file's contents as a string at transform time — wired for Metro and
// Jest's babel-jest transform (jest.config.js's own `node` project plugin
// list), neither of which this plain `tsx`(esbuild)-run script goes
// through. Registering the same "a `.sql` import IS its own file
// contents, as a string" behavior as a CJS extension hook, before
// `require`-ing anything that transitively reaches the manifest below,
// reproduces that exact behavior here without duplicating the migration
// runner or its manifest. `require()` (not `import`) is used for every
// module that transitively depends on this hook — TS/esbuild's `import`
// syntax is hoisted to the top of the compiled output ahead of ordinary
// statements, which would run those requires before this hook is
// registered.
(Module as unknown as { _extensions: Record<string, (mod: NodeModule, filename: string) => void> })
  ._extensions['.sql'] = (mod, filename) => {
  mod.exports = fs.readFileSync(filename, 'utf-8');
};

/* eslint-disable @typescript-eslint/no-require-imports -- see hook comment above: must not be hoisted ahead of it. */
const { openBetterSqlite3Driver } = require('../src/data/sqlite/driver.better-sqlite3') as typeof import('../src/data/sqlite/driver.better-sqlite3');
const { migrate } = require('../src/data/sqlite/migrator') as typeof import('../src/data/sqlite/migrator');
const { generateSyntheticHistory } = require('../src/test/fixtures/synthetic-history') as typeof import('../src/test/fixtures/synthetic-history');
const { insertSyntheticHistory } = require('../src/test/fixtures/synthetic-history-loader') as typeof import('../src/test/fixtures/synthetic-history-loader');
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = path.join(__dirname, '..');

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const outArg = readArg('--out') ?? 'tmp/fixture.db';
  const outPath = path.isAbsolute(outArg) ? outArg : path.join(REPO_ROOT, outArg);
  const workoutCountArg = readArg('--workouts');
  const workoutCount = workoutCountArg ? Number(workoutCountArg) : undefined;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) {
    fs.rmSync(outPath);
  }

  console.log(`Generating synthetic history${workoutCount ? ` (${workoutCount} workouts)` : ''}...`);
  const dataset = generateSyntheticHistory(workoutCount ? { workoutCount } : {});

  console.log(`Opening ${outPath} and running migrations...`);
  const driver = openBetterSqlite3Driver(outPath);
  try {
    migrate(driver);

    console.log('Loading fixture...');
    const result = insertSyntheticHistory(driver, dataset);

    console.log(
      `Loaded ${result.workoutCount} workouts, ${result.setCount} sets, ` +
        `${result.exerciseCount} exercises in ${result.elapsedMs} ms.`,
    );
    console.log(`Wrote ${outPath}.`);
  } finally {
    driver.close();
  }
}

main();
