# scroll-area

2026-08-19, engine (legacy `new-york` classification), migrated the customized Scroll Area wrapper and its four app consumers to Base UI; baseline and incremental typechecks pass.

## Changed

- `src/components/ui/scroll-area.tsx:1` replaces `@radix-ui/react-scroll-area` with `@base-ui/react/scroll-area` and updates wrapper types and part names.
- `src/components/ui/scroll-area.tsx:12` preserves the custom `viewportRef` API used by the virtualized feature list.
- `src/components/ui/scroll-area.tsx:20` adds Base UI's `Content` part so the existing direct-child display/min-width overrides retain their original target and content-size changes are observed.
- `src/components/ui/scroll-area.tsx:34` maps Radix Scrollbar and Thumb parts to Base UI while preserving the custom dimensions, z-index, padding, and thumb styling.
- `src/App.tsx:80` continues importing the finalized public wrapper; its four call sites require no removed Scroll Area props.
- `.migration/scroll-area.md` records the migration, behavior delta, verification, and intentionally deferred work.
- Leftover scan is clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/scroll-area.tsx` returned no matches.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `dialog.tsx`, `popover.tsx`, `slider.tsx`, `tabs.tsx`, and `tooltip.tsx` remain on Radix because this run is scoped to Scroll Area.
- All non-Radix UI wrappers and unrelated app behavior were intentionally untouched.

## Behavior changes

- Radix's default `type="hover"` scrollbar visibility has no Base UI prop equivalent. The idiomatic Base UI wrapper keeps a scrollbar visible whenever that axis overflows; hover-only visibility would require additional CSS against `data-hovering` and `data-scrolling`.

## Verify by hand

- Load a dataset with enough features to overflow the feature list, scroll with the wheel or trackpad, and drag the vertical thumb from top to bottom.
- Select a feature outside the current viewport and confirm the `viewportRef`-based virtual list scrolls to reveal it.
- Check the detail pane, attribute-color panel, and semantic-surface panel at narrow heights; confirm content remains scrollable and the scrollbar stays aligned without covering controls.
