// Root Jest config — two "projects" per docs/plan/08-testing-and-quality.md §1:
//
//   (a) `node` — src/domain/**, src/data/**, src/test/** (pure TS, no RN
//       preset needed — matches the "Unit (domain)" / "Integration (data)"
//       pyramid rows). Fast: plain babel TS transform, node test env.
//   (b) `ui`   — jest-expo + React Native Testing Library, everything that
//       touches React/React Native: src/ui, src/features, src/lib, app/.
//
// coverageThreshold lives at the root (Jest requires it there in
// multi-project mode — per-project coverageThreshold entries are ignored).
// Full target table, 08 §3 exactly:
//   src/domain/**            95% lines / 90% branches
//   src/data/**               90% lines / 85% branches
//   src/features/workout/**  85% lines / 80% branches
//   overall (global)          75% lines / 70% branches
//
// Deliberately NOT setting `collectCoverageFrom`: coverage is computed only
// from files a test actually exercises (Jest's default). This is what keeps
// the thresholds meaningful right now instead of vacuous or falsely red —
// see docs/plan/EXECUTION-LOG.md (M0-03) for the full reasoning, in short:
//   - src/data/sqlite/driver.expo.ts is real code that can only run on a
//     device/simulator (none available in this environment, see
//     docs/plan/BLOCKERS.md) — 08 §5 explicitly assigns it a device smoke
//     test via Maestro flow #1, not a Jest unit test, so it is intentionally
//     never `require`d by a Jest test and never enters the coverage map.
//     `driver.better-sqlite3.ts` (the file that *is* Jest-testable) is
//     covered by src/data/sqlite/__tests__/driver.test.ts.
//
// `src/domain/**` and `src/features/workout/**` thresholds are commented
// out below rather than active-but-trivially-passing: Jest's per-path/glob
// coverageThreshold checker only classifies a glob as PATH/GLOB (and checks
// it) when at least one *covered* file matches it — with zero source files
// under a glob (true today for both directories; real logic lands M1 for
// domain, M2 for features/workout) there is nothing to classify, so Jest
// hard-errors with "Coverage data for <glob> was not found" instead of
// passing vacuously (confirmed empirically — see EXECUTION-LOG.md M0-03).
// This is a mechanical Jest limitation, not a decision to weaken the bar:
// the moment the first file lands in either directory, uncomment its entry
// below (values already match 08 §3 verbatim — do not adjust them).
//
// `<rootDir>` resolves to the directory containing this file (Jest's
// default) — deliberately not spelled out via `__dirname` here so this
// file lints cleanly as plain script code, same as everything else in the
// repo (no Node-globals ESLint env carve-out needed just for this file).

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/domain/**/*.test.{ts,tsx}',
        '<rootDir>/src/data/**/*.test.{ts,tsx}',
        '<rootDir>/src/test/**/*.test.{ts,tsx}',
        // src/ui/tokens.ts is pure data with zero RN imports (M0-05) — its
        // contrast-math test belongs in the fast `node` project rather than
        // jest-expo. Only this one file is carved out of `ui`'s testMatch
        // below (see its testPathIgnorePatterns) so it isn't run twice.
        '<rootDir>/src/ui/__tests__/tokens.test.{ts,tsx}',
      ],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
      transform: {
        '\\.tsx?$': [
          'babel-jest',
          {
            presets: [
              ['@babel/preset-env', { targets: { node: 'current' } }],
              '@babel/preset-typescript',
            ],
          },
        ],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      testMatch: [
        '<rootDir>/src/ui/**/*.test.{ts,tsx}',
        '<rootDir>/src/features/**/*.test.{ts,tsx}',
        '<rootDir>/src/lib/**/*.test.{ts,tsx}',
        '<rootDir>/app/**/*.test.{ts,tsx}',
      ],
      // src/ui/tokens.ts's contrast test runs in the `node` project instead
      // (see its testMatch entry above) since tokens.ts has zero RN
      // imports — excluded here so it doesn't also run under jest-expo.
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/ui/__tests__/tokens.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],

  coverageThreshold: {
    // TODO(M1): uncomment once src/domain/** has its first source file.
    // './src/domain/**/*.{ts,tsx}': { lines: 95, branches: 90 },
    './src/data/**/*.{ts,tsx}': { lines: 90, branches: 85 },
    // TODO(M2): uncomment once src/features/workout/** has its first source file.
    // './src/features/workout/**/*.{ts,tsx}': { lines: 85, branches: 80 },
    global: { lines: 75, branches: 70 },
  },
};
