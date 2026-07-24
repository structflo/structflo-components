# @structflo/components

Shared presentational visualizations for the DAIKON app suite. Components take
plain data via props and render — no data fetching, no auth, no stores. Colors
are semantic Tailwind classes (`fill-chart-1`, `text-muted-foreground`, …) that
resolve through `@structflo/daikon-design-tokens` in the host app, so a chart
inherits whichever app's theme it renders in.

## Exports

- `@structflo/components/target-biology` — `EssentialityCallScale`,
  `VulnerabilityPanel`, `ResistanceLollipop`, plus the `*Like` prop types and the
  `essentialityBucket` / `ESSENTIALITY_STYLE` helpers.

Props are typed against hand-written `*Like` interfaces, not any app's generated
API DTOs. Map your data into that shape before passing it.

## Consuming

Published to npm. Each app depends on the released version (`^0.1.0`) — this is
the value committed to every consumer's `package.json`, so any checkout (and CI)
installs cleanly without the sibling repo present.

The package ships raw `.tsx` — no build step. Each Next app must:

1. depend on it: `"@structflo/components": "^0.1.0"`
2. add `transpilePackages: ["@structflo/components"]` to `next.config.ts`
3. add `@source "../../node_modules/@structflo/components/src";` to the Tailwind
   entry CSS — **Tailwind v4 does not scan `node_modules`, so without this every
   class in the package is silently dropped and the charts render unstyled.**
4. set `turbopack.root` to the shared workspace parent in `next.config.ts`, but
   **only in dev** (`process.env.NODE_ENV !== "production"`). It is needed while
   the package is pnpm-linked (see below): the linked source lives outside the
   app's project root and Turbopack won't resolve a symlink beyond the root
   otherwise. In prod the package installs from npm inside `node_modules`, where
   a widened root is unnecessary and would shift module resolution.

## Local development (iterate without publishing)

To develop the library and three apps together, `pnpm link` each consumer to
this checkout. The committed dependency stays `^0.1.0`; the link is local-only
override state that must **not** be committed.

From a consumer's `frontend/` directory:

```bash
# start iterating against the local checkout
pnpm link ../../structflo-components
rm -rf node_modules && pnpm install     # rebuild: pnpm's fast path won't apply
                                        # a new link override in place

# ...edit src here, dev servers hot-reload the change (transpilePackages) ...

# back to the released npm version
pnpm unlink @structflo/components
rm -rf node_modules && pnpm install
```

`pnpm link` leaves `package.json` untouched (`^0.1.0`) and records the override
in `pnpm-workspace.yaml`; `pnpm install` mirrors it into `pnpm-lock.yaml`. So
**while linked, `pnpm-workspace.yaml` and `pnpm-lock.yaml` are dirty — do not
commit them.** `pnpm unlink` (or `git checkout -- pnpm-workspace.yaml
pnpm-lock.yaml`) reverts both; a full round-trip returns the tree to pristine.
If a linked lockfile is committed by accident, CI's `pnpm install
--frozen-lockfile` fails on the override mismatch, so it can't ship silently.

## Peers & deps

Peers: `react`, `react-dom` (^19). Runtime deps: `clsx`, `tailwind-merge` (for
`cn`) — both already present in every suite app.

## Tests

`pnpm test` runs the component + domain unit tests (vitest + jsdom).
`pnpm contract` runs the publish-gate contract check (every `exports` path
resolves and the public surface is intact). `pnpm typecheck` runs `tsc`.

## Publishing

Publishing is automated: pushing a `v*` tag runs `.github/workflows/publish.yml`
(contract check + tests, then `npm publish --provenance` via the npm trusted
publisher). To cut a release:

1. Bump `version` in `package.json` and commit.
2. `git tag v0.1.x && git push --tags` — CI publishes on the tag.
3. In each consumer, take the new version:

   ```bash
   pnpm unlink @structflo/components   # if you were dev-linked — never bump while linked
   rm -rf node_modules && pnpm install
   pnpm up @structflo/components       # moves ^0.1.x forward; commit the lockfile
   ```

Because `package.json` already tracks `^0.1.0`, a patch/minor release is picked
up by `pnpm up` with no manifest edit. **Unlink before releasing or bumping** —
`pnpm up` while linked rewrites `package.json` to `link:…` and churns the tree.
