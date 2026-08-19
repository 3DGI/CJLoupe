# slider

2026-08-19, engine (legacy `new-york` classification), migrated the customized Slider wrapper and its attribute-range consumer to Base UI; baseline and incremental typechecks pass.

## Changed

- `src/components/ui/slider.tsx:1` replaces `@radix-ui/react-slider` with `@base-ui/react/slider` while retaining the customized square track, fill, and thumb styling.
- `src/components/ui/slider.tsx:17` uses `thumbAlignment="edge"` for Radix-like endpoint placement and introduces Base UI's required `Control` part.
- `src/components/ui/slider.tsx:25` maps Radix Range to Base UI Indicator and moves thumbs inside Control; disabled-state classes now use Base UI's live `data-disabled` hook.
- `src/App.tsx:6738` renames `minStepsBetweenThumbs` to `minStepsBetweenValues`.
- `src/App.tsx:6739` retains continuous range previews with the widened Base UI callback value type, and `src/App.tsx:6748` renames `onValueCommit` to `onValueCommitted` for persisted range changes.
- `.migration/slider.md` records the migration, behavior deltas, verification, and intentionally deferred work.
- Leftover scan is clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/slider.tsx` returned no matches.

## Left alone

- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `dialog.tsx`, `popover.tsx`, `tabs.tsx`, and `tooltip.tsx` remain on Radix because this run is scoped to Slider.
- All non-Radix UI wrappers and unrelated app behavior were intentionally untouched.

## Behavior changes

- Base UI's default `thumbCollisionBehavior="push"` moves the other range thumb when handles collide; Radix behavior was closest to Base UI's `"none"`. The idiomatic Base UI registry default is retained and flagged rather than patched.
- `onValueCommitted` does not fire when an interaction ends without changing the value; Radix's commit callback could still fire in that case.

## Verify by hand

- Open Attribute colors for a numeric property and drag each range thumb; confirm the histogram preview updates continuously and the chosen range persists on release.
- Drag the minimum thumb into the maximum thumb and confirm the Base UI push behavior is acceptable for this range selector.
- Focus each thumb and use Arrow keys, Page Up/Down, Home, and End; confirm both the displayed domain and numeric inputs remain synchronized.
