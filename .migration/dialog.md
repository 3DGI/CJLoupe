# dialog

2026-08-19, transformation engine (legacy `new-york` classification), migrated the customized Dialog wrapper and all three controlled app dialogs to Base UI; Dialog was the final Radix wrapper, so the obsolete Radix dependencies were also removed.

## Changed

- `src/components/ui/dialog.tsx` replaces `@radix-ui/react-dialog` with `@base-ui/react/dialog`, mapping Overlay to Backdrop and Content to Popup while preserving the existing compact surface, backdrop, close button, close-label API, and exported wrapper API.
- `src/App.tsx` replaces the file dialog's Radix `onCloseAutoFocus` event handler with Base UI's `finalFocus` ref, preserving explicit focus restoration to the file-dialog opener.
- `package.json` and `bun.lock` remove all nine obsolete `@radix-ui/react-*` dependencies now that every wrapper imports Base UI.
- `components.json` switches from legacy `new-york` to `base-nova`, so future shadcn additions resolve to Base UI registry variants.
- Leftover sweeps are clean: no source wrapper or dependency manifest contains a Radix UI import or package, and no migration candidate file remains.

## Left alone

- The wrapper's exact visual classes remain unchanged; no registry-default layout, spacing, radius, color, or animation styles were introduced.
- Existing component and theme files were not overwritten when the registry default changed; the new style only controls future shadcn additions and updates.
- No Trigger, Portal, Close, Footer, or Overlay exports were added because they were not part of the existing public wrapper API.

## Behavior changes

- Base UI's Portal renders a wrapper `<div>`, whereas Radix's Portal did not add an element. The current Backdrop and Popup use fixed positioning, and no current selector depends on their immediate portal parent.
- When opened by touch, Base UI focuses the popup instead of the first tabbable control to avoid opening the virtual keyboard. Mouse and keyboard opening continue to use the first tabbable control by default.
- Dialog open-change callbacks may now receive Base UI event details as a second argument; the existing single-argument controlled-state handlers remain compatible.
- Future components added through the shadcn CLI use Base Nova's visual defaults rather than legacy New York defaults; existing customized components keep their current appearance.

## Verify by hand

- Open the file dialog, close it with the X button, Escape, and an outside click, and confirm focus returns to the folder button each time.
- With no dataset loaded, confirm the required file dialog cannot be dismissed and still omits its close button; after loading a dataset, confirm normal dismissal is restored.
- Open the information and changelog dialogs; confirm their title and description relationships, focus trapping, scrollable content, backdrop blur, and close controls behave as before.
- Check all dialogs on narrow and tall viewports to confirm their fixed centering, maximum height, and internal scrolling remain unchanged.
