# tabs

2026-08-19, engine (legacy `new-york` classification), migrated the customized Tabs wrapper, both app consumers, and the shared active-tab selector to Base UI; baseline, incremental typechecks, lint, and the final production build pass.

## Changed

- `src/components/ui/tabs.tsx:1` replaces `@radix-ui/react-tabs` with `@base-ui/react/tabs` while preserving the customized compact tab styling.
- `src/components/ui/tabs.tsx:21` maps Radix Trigger to Base UI Tab and rewrites active-state classes from `data-[state=active]` to `data-active`.
- `src/components/ui/tabs.tsx:33` maps Radix Content to Base UI Panel.
- `src/App.tsx:2947` replaces the detail pane root's `asChild` composition with Base UI's `render` prop while retaining the existing semantic `<section>` and layout classes.
- `src/App.tsx:7336` and `src/App.tsx:7383` rewrite inactive info-panel visibility from Radix's `data-[state=inactive]` hook to Base UI's `data-hidden` hook.
- `src/index.css:175` rewrites the shared `.detail-tab` active selector to Base UI's `data-active` presence attribute.
- `.migration/tabs.md` records the migration, behavior deltas, verification, and intentionally deferred work.
- Leftover and golden sweeps are clean: `radix-ui`, `@radix-ui`, `tabs-base`, stale Tabs state hooks, and `IconPlaceholder` returned no matches in the migrated scope.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `dialog.tsx`, `popover.tsx`, and `tooltip.tsx` remain on Radix because this run is scoped to Tabs.
- All non-Tabs UI wrappers and unrelated app behavior were intentionally untouched.

## Behavior changes

- Base UI defaults to manual keyboard activation. Arrow keys move focus between tabs without changing the active panel until Enter or Space is pressed; Radix defaulted to activating the newly focused tab. The idiomatic Base UI default is retained rather than adding `activateOnFocus`.
- Base UI selects the first enabled tab when neither `value` nor `defaultValue` is provided, whereas Radix leaves every tab inactive. Both current consumers explicitly provide a controlled value or default value, so their initial selection is unchanged.

## Verify by hand

- Select Geometries and Attributes in the feature detail pane; confirm the active border, background, count badges, and corresponding content still update.
- Open the information dialog and switch among each CityJSON source and the val3dity report; confirm only the selected panel is visible and the active tab keeps its joined-border styling.
- Focus a tab and use the arrow keys; confirm focus moves without activating a panel, then press Enter or Space and confirm the focused panel activates.
- Resize between desktop and mobile layouts and confirm the rendered detail `<section>` retains its border, collapsed, fullscreen, and flex behavior.
