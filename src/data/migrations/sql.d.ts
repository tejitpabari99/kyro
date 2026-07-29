/**
 * Ambient module declaration for raw `.sql` imports (M0-09). `manifest.ts`
 * imports the drizzle-kit-generated `.sql` files directly; at build/test
 * time `babel-plugin-inline-import` (see root `babel.config.js`) rewrites
 * those imports into string-literal constants, so at the type level each
 * import just resolves to a `string`.
 */
declare module '*.sql' {
  const contents: string;
  export default contents;
}
