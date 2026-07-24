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

This is a standalone repo. Until it is published to npm, each app consumes it by
file reference to a local checkout sitting beside it
(`link:../../structflo-components`); after publish, that becomes `^0.1.0`.

The package ships raw `.tsx` — no build step. Each Next app must:

1. depend on it (`link:../../structflo-components` today, `^0.1.0` once published)
2. add `transpilePackages: ["@structflo/components"]` to `next.config.ts`
3. add `@source "../../node_modules/@structflo/components/src";` to the Tailwind
   entry CSS — **Tailwind v4 does not scan `node_modules`, so without this every
   class in the package is silently dropped and the charts render unstyled.**
4. **while consumed by `link:`** (real path outside the app's project root), set
   `turbopack.root` to the shared workspace parent in `next.config.ts`, or
   Turbopack fails to resolve the module. This override is removed once the
   package installs from npm.

## Peers & deps

Peers: `react`, `react-dom` (^19). Runtime deps: `clsx`, `tailwind-merge` (for
`cn`) — both already present in every suite app.

## Tests

`pnpm test` runs the component + domain unit tests (vitest + jsdom).
`pnpm contract` runs the publish-gate contract check (every `exports` path
resolves and the public surface is intact). `pnpm typecheck` runs `tsc`.

## Publishing (deferred)

Consumed by file reference today. To publish: `pnpm contract && pnpm test`, then
`npm publish` (ships `files: ["src"]`, no build). Then swap each consumer's
`link:` for `^0.1.0` and drop their `turbopack.root` override.
