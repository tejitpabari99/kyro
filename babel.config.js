// Explicit babel config (M0-09). Before this file existed, Metro fell back
// to its own default (`@expo/metro-config`'s `loadBabelConfig` resolves to
// `expo/internal/babel-preset`, which is a bare re-export of
// `babel-preset-expo` — see that package's `internal/babel-preset.js`), so
// adding this file with the same preset is behaviorally a no-op for every
// existing file in the project; it exists now only to register the extra
// plugin below.
//
// `inline-import` (babel-plugin-inline-import) is what lets
// `src/data/migrations/manifest.ts` do `import sql from './0000_x.sql'` and
// get the file's *contents* inlined as a string literal at transform time
// (no bundler asset/loader step, no `fs` at runtime) — the mechanism that
// makes drizzle-kit's generated `.sql` files bundle-safe for Metro/Hermes
// (which has no filesystem) while staying byte-identical to what the Node/
// Jest `better-sqlite3` integration test reads (08 §5 parity). Scoped to
// `.sql` only.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
