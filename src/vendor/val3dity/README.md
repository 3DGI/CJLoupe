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

## Updating the CJLoupe vendored files

Build the wasm branch of val3dity in a separate checkout:

```sh
git clone https://github.com/Ylannl/val3dity.git
cd val3dity
git checkout wasm
nix develop .#wasm
wasm-build
```

Then copy the generated module files into this directory:

```sh
cp build-wasm/val3dity_wasm.mjs /path/to/cjvis/src/vendor/val3dity/
cp build-wasm/val3dity_wasm.wasm /path/to/cjvis/src/vendor/val3dity/
```

Keep `val3dity.js` and `val3dity.d.ts` in this directory in sync with the exported Embind functions. CJLoupe expects the wrapper to expose:

- `createVal3dity(options?)`
- `validateCityJSON(input, options?)`
- `validateCityJSONSeq(input, options?)`
- `validateRawArrays(vertices, faces, options?)`

After updating the files, run the app checks from the CJLoupe repository:

```sh
nix develop --command bun run build
nix develop --command bun run lint
```

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
