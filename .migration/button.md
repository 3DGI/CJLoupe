# button

2026-08-19, engine (legacy `new-york` classification), migrated the customized Button wrapper and its consumer to Base UI; the baseline and incremental typechecks pass.

## Changed

- `src/components/ui/button.tsx:1` now uses the real `@base-ui/react/button` primitive while preserving every existing variant and size class.
- `src/components/ui/button.tsx:29` exposes `ButtonPrimitive.Props`, replacing the Radix Slot-specific `asChild` API with Base UI's `render` API.
- `src/App.tsx:2822` migrates the GitHub link button from `asChild` to `render` and declares `nativeButton={false}` for the rendered anchor.
- `package.json:15` adds `@base-ui/react` alongside Radix for the progressive migration; `bun.lock` records the Bun-resolved dependency graph.
- `.migration/button.md` records the migration, verification, and intentionally deferred work.
- Leftover scan is clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/button.tsx` returned no matches.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- `@radix-ui/react-slot` and the other Radix dependencies remain installed until the last Radix wrapper is migrated, as required by the migration strategy.
- `collapsible.tsx`, `dialog.tsx`, `popover.tsx`, `scroll-area.tsx`, `separator.tsx`, `slider.tsx`, `tabs.tsx`, and `tooltip.tsx` remain on Radix because this run is scoped to Button.
- All other app behavior and non-Radix UI wrappers were intentionally untouched.

## Behavior changes

## Verify by hand

- Tab through ordinary buttons and activate them with Enter and Space; confirm focus rings and actions behave as before.
- Activate the GitHub icon button and confirm it opens the repository in a new tab with the accessible name "Open GitHub repository".
- Check a disabled button, if present in the current app state, and confirm it cannot be activated.
