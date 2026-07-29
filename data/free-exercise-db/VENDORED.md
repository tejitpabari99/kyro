# Vendored dataset: free-exercise-db

- **Source:** https://github.com/yuhonas/free-exercise-db
- **License:** Unlicense (public domain) — see upstream `LICENSE.md`, reproduced below.
- **Pinned commit:** `b0eed061e1c832b3ed815fbaa4b45b3cdc14df49` (fetched via
  `git clone --depth 1 https://github.com/yuhonas/free-exercise-db` on 2026-07-23; this was the
  tip of the default branch at fetch time).
- **Vendored on:** 2026-07-23, task M1-03.
- **Files taken from upstream:**
  - `dist/exercises.json` → `data/free-exercise-db/exercises.json` verbatim (873 records).
  - `exercises/{Name}/{0,1}.jpg` → `data/free-exercise-db/images/{Name}/{0,1}.jpg` verbatim
    (1746 JPGs across 873 exercise directories; every `images[]` path referenced in
    `exercises.json` resolves to a real file here — verified at vendor time, zero missing).
  - Upstream's per-exercise duplicate `.json` files (one alongside each image directory,
    redundant with `dist/exercises.json`) were **not** vendored — not needed by the build
    pipeline (M1-04), which reads `exercises.json` as the single source of truth.
- **Not modified:** these files are committed byte-for-byte as fetched. No curation edits are
  applied here — curation happens via `data/curation/overrides.json`, consumed at build time by
  the M1-04 pipeline (`scripts/build-exercise-db.ts`), never by hand-editing the vendored files.
- **Size at vendor time:** `data/free-exercise-db/` ≈ 102 MB (images are raw/uncompressed as
  fetched from upstream — this is expected and fine per the M1-03 task spec; image compression
  (resize to 600px, JPEG q75, thumbnails) happens in M1-04's build pipeline and outputs to
  `assets/exercises/`, not here). No network access is required at build time going forward —
  everything the pipeline needs is now committed in this directory.
- **Re-vendoring:** if the upstream dataset needs a refresh later, re-run the same clone command,
  re-copy `dist/exercises.json` and the per-exercise image directories, and update the pinned
  commit hash + record counts in this file.

## Upstream LICENSE.md (Unlicense)

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>
```
