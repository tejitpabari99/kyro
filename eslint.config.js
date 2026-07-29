// ESLint flat config for Kyro.
//
// Layers on top of Expo's base config (`eslint-config-expo/flat`) with the
// project's import-boundary (dependency-direction) rules per
// docs/plan/06-architecture.md §2 and §10:
//
//   app -> features -> {domain, data, ui, lib}
//
//   - domain imports nothing app-side: no `react`, no `react-native`, no
//     `expo*` packages, and no reaching into app/features/data/ui/lib.
//   - data imports domain (types/pure logic) only — not features/ui/lib/app.
//   - ui imports its own tokens only — not domain/data/features/lib/app.
//   - lib is the native-capability wrapper layer — not domain/data/ui/
//     features/app (app/features depend on lib, never the reverse).
//   - features may depend on domain/data/ui/lib (and other features'
//     public surface), but never reach up into app/.
//   - Nothing may import from app/ — it is the top of the dependency graph.
//
// Platform.OS branching (06 §10 portability guardrails) is banned everywhere
// except inside src/lib/ — the single lint-allowed exception.

const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const { defineConfig } = require('eslint/config');

const PLATFORM_OS_SELECTOR = "MemberExpression[object.name='Platform'][property.name='OS']";
const PLATFORM_OS_MESSAGE =
  'Direct Platform.OS branching is only allowed inside src/lib/ (06 §10 portability guardrails). ' +
  'Wrap platform-specific behavior in a src/lib/ module instead.';

module.exports = defineConfig([
  {
    ignores: [
      'dist/**',
      'web-build/**',
      'coverage/**',
      '.expo/**',
      'node_modules/**',
      'assets/exercises/**',
      'ios/**',
      'android/**',
    ],
  },
  ...expoConfig,
  prettierConfig,
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
        node: true,
      },
    },
    rules: {
      // Default posture: Platform.OS branching is disallowed outside lib/;
      // reinstated for src/lib/ below (the single lint-allowed exception).
      'no-restricted-syntax': [
        'error',
        {
          selector: PLATFORM_OS_SELECTOR,
          message: PLATFORM_OS_MESSAGE,
        },
      ],
    },
  },

  // ---- domain: pure TS, no React/Expo, no reaching into app-side layers ----
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'src/domain is pure TS — no React imports.',
            },
            {
              group: ['react-native', 'react-native/*'],
              message: 'src/domain is pure TS — no React Native imports.',
            },
            {
              group: ['expo', 'expo/*', 'expo-*', 'expo-*/*', '@expo/*'],
              message: 'src/domain is pure TS — no Expo imports.',
            },
          ],
        },
      ],
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/domain',
              from: ['./app', './src/features', './src/data', './src/ui', './src/lib'],
              message:
                'src/domain must not import from app-side layers (app/features/data/ui/lib) — 06 §2 dependency rule.',
            },
          ],
        },
      ],
    },
  },

  // ---- data: repository interfaces + implementations; domain types only ----
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/data',
              from: ['./app', './src/features', './src/ui', './src/lib'],
              message:
                'src/data may only depend on src/domain (types/pure logic) — not features/ui/lib/app. 06 §2 dependency rule.',
            },
          ],
        },
      ],
    },
  },

  // ---- ui: design-system components; tokens only, no domain/data/features/lib ----
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/ui',
              from: ['./app', './src/features', './src/domain', './src/data', './src/lib'],
              message:
                'src/ui may only depend on its own tokens — not domain/data/features/lib/app. 06 §2 dependency rule.',
            },
          ],
        },
      ],
    },
  },

  // ---- lib: native-capability wrappers; never depends upward ----
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/lib',
              from: ['./app', './src/features', './src/domain', './src/data', './src/ui'],
              message:
                'src/lib must not depend on domain/data/ui/features/app — app/features depend on lib, never the reverse. 06 §2 dependency rule.',
            },
          ],
        },
      ],
      // The single lint-allowed exception (06 §10): Platform.OS branching is
      // permitted inside src/lib/ only.
      'no-restricted-syntax': 'off',
    },
  },

  // ---- features: may use domain/data/ui/lib, never app/ ----
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/features',
              from: ['./app'],
              message:
                'src/features must not import from app/ — app depends on features, never the reverse. 06 §2 dependency rule.',
            },
          ],
        },
      ],
    },
  },
]);
