# popover

2026-08-19, engine (legacy `new-york` classification), migrated the customized Popover wrapper and all five app consumers to Base UI; baseline, incremental typechecks, lint, tests, and the final production build pass.

## Changed

- `src/components/ui/popover.tsx:1` replaces `@radix-ui/react-popover` with `@base-ui/react/popover` while preserving the compact bordered surface and customized 6px offset.
- `src/components/ui/popover.tsx:31` splits Radix Content into Base UI's Portal, Positioner, and Popup parts; `side`, `sideOffset`, `align`, and `alignOffset` are declared, destructured, and forwarded to Positioner.
- `src/components/ui/popover.tsx:40` replaces Radix keyframe state hooks with Base UI starting/ending opacity, scale, and per-side transition hooks, including logical inline sides.
- `src/App.tsx:5207`, `src/App.tsx:5269`, `src/App.tsx:6094`, `src/App.tsx:6536`, and `src/App.tsx:6963` replace Radix `asChild` triggers with Base UI `render` composition while retaining each existing Button and its DOM shape.
- `src/App.tsx:6550` replaces Radix's trigger-width variable with Base UI's `--anchor-width` for the controlled color-map popover.
- `.migration/popover.md` records the migration, behavior deltas, verification, and intentionally deferred work.
- Leftover and golden sweeps are clean: `radix-ui`, `@radix-ui`, `popover-base`, `asChild`, Radix Popover props, stale state hooks, old CSS variables, and `IconPlaceholder` returned no matches in the migrated scope.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `dialog.tsx` remains on Radix because this run is scoped to Popover.
- No Popover Anchor, Close, custom focus, or dismissal APIs were added because the existing wrapper and consumers do not expose them.
- Non-Popover UI wrappers and the contents of each settings, filter, color-map, and color-picker surface were intentionally left unchanged.

## Behavior changes

- Base UI's default collision padding is 5px rather than Radix's 0px, so popovers may keep slightly more distance from viewport or clipping edges when they shift or flip.
- Base UI's Portal renders a wrapper `<div>`, whereas Radix's Portal did not add an element. No current selector or layout rule depends on the portal's immediate DOM shape.
- When opened by touch, Base UI focuses the popup itself instead of the first tabbable control to avoid opening the virtual keyboard; mouse and keyboard opening continue to use the first tabbable control by default.

## Verify by hand

- Open the val3dity parameters, validation error filters, pinned-attribute settings, color-map selector, and category color picker; confirm each surface keeps its existing size, alignment, and 6px gap.
- Use Tab and Shift+Tab inside each popover, then close with Escape and by clicking outside; confirm focus returns to the trigger.
- Choose a color map and confirm the controlled popover closes, the selected swatch updates, and the popup width still matches its trigger.
- Open the right-side category color picker and popovers near viewport edges; confirm they flip or shift without clipping and remain anchored to the correct button.
