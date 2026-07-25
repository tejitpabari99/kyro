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
// `src/features/workout/**`'s threshold is still commented out below rather
// than active-but-trivially-passing: Jest's per-path/glob coverageThreshold
// checker only classifies a glob as PATH/GLOB (and checks it) when at least
// one *covered* file matches it — with zero source files under a glob (true
// today for that directory; real logic lands M2) there is nothing to
// classify, so Jest hard-errors with "Coverage data for <glob> was not
// found" instead of passing vacuously (confirmed empirically — see
// EXECUTION-LOG.md M0-03). This is a mechanical Jest limitation, not a
// decision to weaken the bar: the moment the first file lands there,
// uncomment its entry below (value already matches 08 §3 verbatim — do not
// adjust it). `src/domain/**`'s entry was the same story until M1-01 landed
// `src/domain/enums.ts`, its first source file — now active, per that
// task's cross-reference note.
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
            // Mirrors root `babel.config.js`'s plugin (M0-09): the `node`
            // project defines its own inline babel transform instead of
            // reading that file, so the plugin that lets
            // `src/data/migrations/manifest.ts` `import` a `.sql` file as an
            // inlined string constant (rather than needing filesystem access
            // at runtime — required for the same file to also bundle
            // cleanly under Metro/Hermes, which has none) has to be
            // registered here too.
            plugins: [['inline-import', { extensions: ['.sql'] }]],
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
      // `Sheet` (M0-07) is built on react-native-gesture-handler +
      // react-native-reanimated (4.x, which delegates worklets to the
      // separate `react-native-worklets` package). Three pieces make that
      // combination runnable under Jest (no simulator/device, no native
      // worklets runtime available):
      //  1. gesture-handler's `jestSetup.js` replaces its native module +
      //     gesture components with JS mocks (recommended install step in
      //     its own docs).
      //  2. reanimated itself needs no mapper/mock entry point — it
      //     self-detects Jest via `process.env.JEST_WORKER_ID`
      //     (`src/common/constants/platform.ts`'s `IS_JEST`/
      //     `SHOULD_BE_USE_WEB`) and falls back to its synchronous JS/"web"
      //     implementation, the same path it uses on react-native-web.
      //  3. That fallback only engages if module resolution actually loads
      //     `react-native-worklets`' *plain* (web-safe) files instead of its
      //     `.native.ts` variants — Jest's Haste/RN resolver prefers
      //     `.native.ts` by default, and that variant's `NativeWorklets`
      //     class throws synchronously in its constructor if the native
      //     module isn't registered (true in Jest). `react-native-worklets`
      //     ships a `jest/resolver.js` for exactly this: it strips `native`
      //     from the resolvable extensions list, but *only* for requests
      //     resolving inside the `react-native-worklets` package itself
      //     (checked via `options.basedir`/`request`), so it doesn't affect
      //     resolution of anything else in the `ui` project.
      //  4. `<rootDir>/jest/resolver.js` (M0-08) wraps that same vendor
      //     resolver with one more scoped rule, for `expo-router`'s
      //     internal toolbar native-view module — see that file's header.
      resolver: '<rootDir>/jest/resolver.js',
      // `@shopify/react-native-skia` (M4-07, `ui/charts/`) ships its own
      // documented Jest wiring, verbatim per its README's testing section:
      // a `jestSetup.js` that replaces the whole module with a JS-only mock
      // (`lib/module/mock`, real Skia JS-API objects — `Path`/`Group`/
      // `Circle`/etc. all work as genuine (if headless) Skia primitives, not
      // stubs) driven by a real CanvasKit-wasm instance, plus a custom
      // `jestEnv.js` `TestEnvironment` (extends `jest-environment-node`)
      // that loads that CanvasKit-wasm instance once per worker and exposes
      // it as `global.CanvasKit` before `jestSetup.js` reads it. Both are
      // required for victory-native's chart primitives (`Line`/`Area`/`Bar`/
      // `StackedBar`, all built on real `Skia.Path` construction via
      // `useLinePath`/`useAreaPath`/`useBarPath`) to render under Jest at
      // all — without a real CanvasKit-backed Skia object those hooks throw
      // immediately (`Skia.Path.Make` is undefined), so this is not
      // optional plumbing. `canvaskit-wasm` pinned as an explicit
      // devDependency (`0.41.0`, matching the version
      // `@shopify/react-native-skia@2.6.2` itself already resolves — see
      // `pnpm-lock.yaml`) purely so it hoists to root `node_modules` (pnpm's
      // nested `.pnpm/` layout doesn't otherwise expose a package's own
      // dependencies to files outside it, and `jestEnv.js`'s
      // `require("canvaskit-wasm/...")` resolves from `<rootDir>`).
      testEnvironment: '<rootDir>/node_modules/@shopify/react-native-skia/jestEnv.js',
      setupFiles: [
        '<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js',
        '<rootDir>/node_modules/@shopify/react-native-skia/jestSetup.js',
      ],
      // `@shopify/flash-list` v2 (M1-07) ships `dist/index.js` as plain ESM
      // (`import`/`export` syntax, no CJS build) — `jest-expo`'s own default
      // `transformIgnorePatterns` (see its `jest-preset.js`) already
      // un-ignores a specific package allow-list (react-native, expo*,
      // react-navigation, etc.) under both plain and pnpm's nested
      // `.pnpm/<pkg>/node_modules/<pkg>` layout; `@shopify/flash-list` isn't
      // on that list, so requiring it raises "Cannot use import statement
      // outside a module" unless it's added here too. This is the *same*
      // pattern jest-expo ships, verbatim, with one more alternative added
      // — not a hand-rolled replacement — so every other package that
      // preset already handles (including pnpm's `.pnpm/` un-ignoring)
      // keeps working. `react-native-reanimated-dnd` (M3-03) is the same
      // story — its own `package.json` is `"type": "module"` with only an
      // ESM `lib/index.js` build, no CJS fallback — added to the same
      // allow-list for the same reason. `@shopify/react-native-skia` (M4-07)
      // is the same story again: its `"react-native"` field (which Jest's RN
      // resolver prefers over `main`) points at `lib/module/index.js`, an
      // ESM build with bare `import`/`export`. `victory-native` (M4-07) goes
      // one step further — its own `"react-native"` field points at
      // `src/index.ts`, raw TypeScript source (not even pre-compiled),
      // relying on the *consumer's* Metro/Babel pipeline to transform it
      // (that's how Metro resolves it on-device too) — needs the same
      // un-ignoring so babel-jest's TS preset can run over it. Its
      // transitive `d3-scale`/`d3-shape`/`d3-zoom` dependencies (plus
      // *their* transitive `d3-*` deps — `d3-array`, `d3-color`,
      // `d3-dispatch`, `d3-drag`, `d3-ease`, `d3-format`, `d3-interpolate`,
      // `d3-path`, `d3-selection`, `d3-time`, `d3-time-format`, `d3-timer`,
      // `d3-transition`, enumerated from `pnpm-lock.yaml`) are the same
      // story again, one layer deeper: every d3 v3/v4 package publishes
      // `"main"` pointing straight at its raw ESM `src/index.js` with no
      // CJS build at all — `d3-[a-z-]+` un-ignores the whole family in one
      // pattern rather than enumerating 15 exact names that will drift as
      // victory-native's own dependency tree changes.
      transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@shopify/flash-list|react-native-reanimated-dnd|@shopify/react-native-skia|victory-native|d3-[a-z-]+|internmap))',
        '/node_modules/react-native-reanimated/plugin/',
        '/node_modules/@react-native/babel-preset/',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        // `lucide-react-native`'s `"react-native"` package.json field (which
        // Jest's RN resolver prefers) points at its ESM build
        // (`dist/esm/lucide-react-native.mjs`, bare `export` syntax) — jest-expo's
        // preset only registers a transform for `.[jt]sx?` files, so requiring
        // that path raises "Unexpected token 'export'". Redirect resolution to
        // the package's CJS build instead of widening the preset's transform
        // config (M0-06 iconography, 07 §4).
        '^lucide-react-native$':
          '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
      },
    },
  ],

  coverageThreshold: {
    // M1-01: src/domain/enums.ts is the first src/domain/** source file —
    // threshold activated per M0-03's TODO (values unchanged, 08 §3).
    './src/domain/**/*.{ts,tsx}': { lines: 95, branches: 90 },
    './src/data/**/*.{ts,tsx}': { lines: 90, branches: 85 },
    // M2-03: src/features/workout/activeWorkoutStore.ts is the first real
    // source file under this glob — threshold activated per M0-03's
    // TODO(M2) (value unchanged, 08 §3).
    './src/features/workout/**/*.{ts,tsx}': { lines: 85, branches: 80 },
    global: { lines: 75, branches: 70 },
  },
};
