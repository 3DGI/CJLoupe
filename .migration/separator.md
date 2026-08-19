# separator

2026-08-19, engine (legacy `new-york` classification), migrated the customized and currently unused Separator wrapper to Base UI; baseline and incremental typechecks pass.

## Changed

- `src/components/ui/separator.tsx:1` replaces `@radix-ui/react-separator` with the callable `@base-ui/react/separator` primitive.
- `src/components/ui/separator.tsx:5` uses `SeparatorPrimitive.Props` and drops Radix's unsupported `decorative` prop while preserving the existing orientation default and every class string.
- `.migration/separator.md` records the migration, semantic behavior delta, verification, and intentionally deferred work.
- Leftover scan is clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/separator.tsx` returned no matches.

## Left alone

- No app files import `@/components/ui/separator`, so there were no consumers to migrate.
- `components.json` remains on legacy style `new-york` because this is a progressive, single-component migration.
- Radix dependencies remain installed until the last Radix wrapper is migrated.
- `collapsible.tsx`, `dialog.tsx`, `popover.tsx`, `scroll-area.tsx`, `slider.tsx`, `tabs.tsx`, and `tooltip.tsx` remain on Radix because this run is scoped to Separator.
- All non-Radix UI wrappers and unrelated app code were intentionally untouched.

## Behavior changes

- Base UI Separator is always semantic (`role="separator"`); Radix's default `decorative={true}` behavior is no longer available. The wrapper currently has no consumers, so this does not change the rendered app. Future purely visual rules should use an `aria-hidden` div or CSS border instead.

## Verify by hand

- Temporarily render `<Separator />` and confirm it is a one-pixel horizontal `bg-border` rule with `role="separator"` and `data-orientation="horizontal"`.
- Render `<Separator orientation="vertical" className="h-6" />` and confirm it is a one-pixel vertical rule with `data-orientation="vertical"`.
