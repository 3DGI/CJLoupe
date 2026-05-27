# val3dity wasm MVP

This is a thin Emscripten/Embind wrapper around the existing `val3dity` C++ API.

It exposes three validation entry points:

- `validateCityJSON(input, options?)`, where `input` is a CityJSON string.
- `validateCityJSONSeq(input, options?)`, where `input` is a CityJSONSeq / JSON Lines string.
- `validateRawArrays(vertices, faces, options?)`, where `vertices` is either a flat xyz array or an array of `[x, y, z]` triples, and `faces` is either `[[0, 1, 2, 3], ...]` or `[[[outer], [hole]], ...]`.

All functions return the normal val3dity report as a JavaScript object.

```js
import { createVal3dity } from "./val3dity.js";

const val3dity = await createVal3dity();

const report = val3dity.validateRawArrays(
  [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
    0, 0, 1,
    1, 0, 1,
    1, 1, 1,
    0, 1, 1,
  ],
  [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ],
  { primitive: "Solid" },
);

console.log(report.validity);
```

Build from the wasm dev shell:

```sh
nix develop .#wasm
wasm-build
```

The build writes `build-wasm/val3dity_wasm.mjs` and `build-wasm/val3dity_wasm.wasm`.

The same directory also contains `demo.html`, a small browser demo for uploading a CityJSON or CityJSONSeq file and viewing the validation report. Serve the directory over HTTP, for example:

```sh
python3 -m http.server -d build-wasm 8000
```

Then open `http://localhost:8000/demo.html`.

Supported options:

- `tolSnap` or `tol_snap`
- `planarityD2pTol` or `planarity_d2p_tol`
- `planarityNTol` or `planarity_n_tol`
- `overlapTol` or `overlap_tol`
- `primitive`: `Solid`, `MultiSurface`, or `CompositeSurface`
