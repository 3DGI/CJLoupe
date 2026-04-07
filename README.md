# CJLoupe

CJLoupe is a fullscreen CityJSON sequence viewer and inspection tool built with React, Three.js, Tailwind, and lightweight shadcn-style UI components. It is aimed at browsing CityJSON feature sequences, loading matching val3dity reports, and inspecting per-object validation issues in 3D.

## Development

```bash
nix develop
bun install
bun dev
```

Other useful commands:

```bash
bun run build
bun run lint
```

## Data Loading

The app loads a bundled sample on startup and also supports local files.

- CityJSON feature sequences: `.jsonl`, `.city.jsonl`
- val3dity reports: `.json`

You can load files in two ways:

- Use the file controls in the left rail or file cards
- Drag and drop files into the window

When a dataset is already open, the file action lets you either replace the current CityJSON sequence or attach a matching val3dity report.

## Current capabilities

- Fullscreen 3D viewport for CityJSON feature sequences
- Collapsible left sidebar with file controls, feature list, and feature details
- Per-feature and per-cityobject inspection
- val3dity report loading and error visualization
- Direct links from validation error codes to the val3dity documentation
- Edit mode with face selection, vertex selection, and vertex movement
- Detail pane modes: split, collapsed, and fullscreen
- Light and dark UI themes with a shared object-material palette in the viewport

## Geometry selection

The loader currently chooses one geometry per CityObject.

- It picks the highest numeric LoD available
- If two geometries have the same LoD, it prefers `Solid` over surface geometry
- It prefers renderable leaf objects over parents when both are present
