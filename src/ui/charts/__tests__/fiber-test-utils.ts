/**
 * Test-only helper for asserting on props passed to a `victory-native`
 * component (e.g. `Line`'s `connectMissingData`) that this project's RNTL
 * setup can't reach through its normal queries.
 *
 * Why this exists: `@testing-library/react-native`'s `test-renderer`
 * package only exposes *host* instances (`Tag.Instance`, i.e. actual
 * rendered leaf elements — Skia's `skPath`/`skGroup`/etc host tags, RN's
 * `View`/`Text`) through `.children`/`queryAll`; composite/function
 * components like `victory-native`'s `Line`/`Area` are inlined away during
 * reconciliation and never get their own queryable node (confirmed reading
 * `test-renderer`'s `TestInstance` class — its `type`/`props` getters
 * return `""`/`{}` for anything that isn't `Tag.Instance`). The `04 §6`
 * gap-handling rule ("line connects existing points, no zero-fill") is a
 * `connectMissingData` prop on `Line`/`Area` themselves, consumed
 * internally by `useLinePath`/`useAreaPath` before a `skPath` even exists —
 * so there is no host-instance prop that reflects it. `TestInstance` does
 * expose an explicitly-unstable escape hatch for exactly this
 * (`unstable_fiber`, "internal react-reconciler structures ... use with
 * caution and only when absolutely necessary") — this walks that fiber
 * tree up to the root and back down to find the named component's
 * `memoizedProps`.
 */
/** Structural stand-in for `test-renderer`'s `TestInstance` — that package
 * is a transitive dependency of `@testing-library/react-native` (not
 * hoisted to this project's own `node_modules`, so its types aren't
 * resolvable from here), but `screen.container`'s runtime shape matches
 * this at the two members this helper needs. */
interface TestInstanceLike {
  children: readonly (TestInstanceLike | string)[];
  unstable_fiber: unknown;
}

interface FiberLike {
  type: unknown;
  memoizedProps: unknown;
  return: FiberLike | null;
  child: FiberLike | null;
  sibling: FiberLike | null;
}

function findAnyInstance(instance: TestInstanceLike): TestInstanceLike | null {
  for (const child of instance.children) {
    if (typeof child !== 'string') {
      return child;
    }
  }
  for (const child of instance.children) {
    if (typeof child !== 'string') {
      const found = findAnyInstance(child);
      if (found) return found;
    }
  }
  return null;
}

/** Finds every rendered instance of `componentType` anywhere in the tree
 * rooted at `container` and returns the props React actually passed each
 * one (`fiber.memoizedProps`, in tree order), by walking the underlying
 * React Fiber tree. */
export function findAllComponentProps(
  container: TestInstanceLike,
  componentType: unknown,
): Record<string, unknown>[] {
  const start = findAnyInstance(container);
  if (!start) {
    throw new Error('findAllComponentProps: no rendered instance to walk a fiber tree from.');
  }

  let fiber = start.unstable_fiber as FiberLike | null;
  while (fiber?.return) {
    fiber = fiber.return;
  }

  const seen = new Set<FiberLike>();
  const matches: Record<string, unknown>[] = [];

  function walk(node: FiberLike | null): void {
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (node.type === componentType) {
      matches.push(node.memoizedProps as Record<string, unknown>);
    }
    walk(node.child);
    walk(node.sibling);
  }

  walk(fiber);

  return matches;
}

/** Finds the first rendered instance of `componentType` — see
 * `findAllComponentProps` for the general case (multiple instances of the
 * same component, e.g. `BarChart`'s two `Bar` layers). */
export function findComponentProps(
  container: TestInstanceLike,
  componentType: unknown,
): Record<string, unknown> {
  const [match] = findAllComponentProps(container, componentType);
  if (!match) {
    throw new Error(`findComponentProps: no fiber found for component ${String(componentType)}.`);
  }
  return match;
}
