# CJLoupe

CityJSONL 3D viewer/inspection tool with support for val3dity annotations

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
- Visualising semantic surfaces
- val3dity report loading and error visualization
- Edit mode with face selection, vertex selection, and vertex movement

## Geometry selection

The loader currently chooses one geometry per CityObject.

- It picks the highest numeric LoD available
- If two geometries have the same LoD, it prefers `Solid` over surface geometry
- It prefers renderable leaf objects over parents when both are present
