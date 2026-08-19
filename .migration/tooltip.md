# tooltip

2026-08-19, engine (legacy `new-york` classification), migrated the customized Tooltip wrapper and its shared viewport-control consumer to Base UI; baseline, incremental typechecks, lint, tests, and the final production build pass.

## Changed

- `src/components/ui/tooltip.tsx:1` replaces `@radix-ui/react-tooltip` with `@base-ui/react/tooltip` while preserving the customized primary colors, zero provider delay, and 6px popup offset.
- `src/components/ui/tooltip.tsx:39` splits Radix Content into Base UI's Portal, Positioner, and Popup parts; `side`, `sideOffset`, `align`, and `alignOffset` are declared, destructured, and forwarded to Positioner.
- `src/components/ui/tooltip.tsx:48` replaces the Radix transform-origin variable and keyframe state hooks with Base UI's `--transform-origin` and starting/ending transition hooks.
- `src/components/ui/tooltip.tsx:54` gives Base UI's div-based Arrow an explicit primary-colored diamond shape and per-side positioning, including logical inline sides.
- `src/App.tsx:5420` narrows the viewport tooltip child to one `ReactElement`, and `src/App.tsx:5425` replaces Radix `asChild` with Base UI's `render` composition without adding DOM wrappers.
- `.migration/tooltip.md` records the migration, behavior deltas, verification, and intentionally deferred work.
- Leftover and golden sweeps are clean: `radix-ui`, `@radix-ui`, `tooltip-base`, Radix Tooltip props, stale state hooks, old CSS variables, and `IconPlaceholder` returned no matches in the migrated scope.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `dialog.tsx` and `popover.tsx` remain on Radix because this run is scoped to Tooltip.
- The viewport controls, Kbd styling, and non-Tooltip UI wrappers were intentionally left otherwise unchanged.

## Behavior changes

- Base UI's default collision and arrow padding is 5px rather than Radix's 0px, so a tooltip may keep slightly more distance from viewport edges and move its arrow slightly farther from popup corners.
- Base UI renders the arrow as a styled `<div>`; the idiomatic Base UI diamond replaces Radix's SVG triangle while retaining the project's primary color.
- Base UI's grouped-tooltip timeout defaults to 400ms instead of Radix's 300ms. Current usage creates one zero-delay provider per tooltip, so the timeout does not affect the existing viewport controls.

## Verify by hand

- On desktop, expand the viewport help panel and confirm the visible tooltips remain anchored 6px to the left of buttons and composite controls.
- Confirm tooltip text, hotkey badges, primary background, primary arrow, and foreground contrast match the existing theme in light and dark modes.
- Resize or move the window near viewport edges and confirm tooltips flip or shift without clipping and their arrows remain attached to the trigger.
- Collapse the help panel or open a modal/menu and confirm the controlled tooltips close cleanly without lingering portal content.
