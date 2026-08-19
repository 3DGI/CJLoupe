# collapsible

2026-08-19, engine (legacy `new-york` classification), migrated the customized minimal Collapsible wrapper and its feature-tree consumer to Base UI; baseline and incremental typechecks pass.

## Changed

- `src/components/ui/collapsible.tsx:1` replaces `@radix-ui/react-collapsible` with `@base-ui/react/collapsible` while preserving the wrapper's minimal re-export shape.
- `src/components/ui/collapsible.tsx:5` maps the public `CollapsibleContent` name to Base UI's `Panel` part.
- `src/App.tsx:4655` migrates the feature-object tree trigger from Radix `asChild` composition to Base UI `render` composition, retaining the native button, accessible label, click propagation guard, and icon.
- `.migration/collapsible.md` records the migration, verification, and intentionally deferred work.
- Leftover scan is clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/collapsible.tsx` returned no matches.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `dialog.tsx`, `popover.tsx`, `scroll-area.tsx`, `slider.tsx`, `tabs.tsx`, and `tooltip.tsx` remain on Radix because this run is scoped to Collapsible.
- All non-Radix UI wrappers and unrelated app behavior were intentionally untouched.

## Behavior changes

## Verify by hand

- Open a dataset with nested CityObjects, expand and collapse a parent using the chevron, and confirm its children appear and disappear while the chevron rotates.
- Focus the chevron button and toggle it with Enter and Space; confirm its accessible label changes between "Expand" and "Collapse".
- Click the chevron and confirm the adjacent object-selection button is not activated by event propagation.
