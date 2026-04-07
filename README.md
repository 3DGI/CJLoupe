# CJLoupe

Fullscreen CityJSON feature viewer built with React, Three.js, Tailwind, and shadcn-style UI components. It uses Bun for dependency management and a Nix flake for the development shell.

## Development

```bash
nix develop
bun install
bun dev
```

The app loads a bundled sample copied from `/data/geodepot/rf-val3dity/rf-out/122064_485853.city.jsonl` and also supports opening local `.city.json` / `.city.jsonl` files from the sidebar.

## Current capabilities

- Fullscreen 3D view for CityJSON feature sequences
- Left-hand collapsible two-column pane
- Synced list and 3D feature selection
- Attribute panel for the active feature
- Initial cityobject edit mode with vertex selection and movement
