"""Generate the benchmark report from the saved JSONL results."""
import collections
import json
import pathlib
import statistics

records = collections.defaultdict(lambda: collections.defaultdict(list))
for line in pathlib.Path('docs/typed-buffer-benchmark.jsonl').read_text().splitlines():
    record = json.loads(line)
    records[record['file']][record['mode']].append(record)
assert len(records) == 11
assert all(len(modes[mode]) == 2 for modes in records.values() for mode in ['original', 'coordinates', 'packed'])

def value(group, key):
    return statistics.median(r[key] for r in group)

def timing(group, key):
    return statistics.median(v for r in group for v in r[key])

text = '''# Typed-buffer prototype benchmark

Historical conversion prototype; see `native-buffer-benchmark.md` for the production implementation.

Measured 2026-11-10: full packing reduced retained model memory by **31–76%** across 11 datasets. The largest model fell from **2,725 MiB to 651 MiB**. Coordinate-only packing saved **9–23%**. Full packing added **10 ms–2.84 s** after parsing; direct numeric traversal was **1.5–5.3× faster**. Existing mesh-builder bridge timings were mixed (12–54% slower on nine datasets, faster on the two largest).

This is an isolated prototype, not a change to CJLoupe's application or public module APIs. All 66 processes completed with matching traversal and sampled-mesh outputs; unit tests, prototype type checking and lint passed.

## What was implemented

- **Coordinates:** one Float64Array per feature, preserving JavaScript number precision.
- **Full packing:** coordinates plus Uint32 polygon-corner indices, ring offsets, polygon offsets, source-face mappings and geometry vertex mappings. Offsets have terminal sentinels and preserve empty rings/faces and holes.
- Attributes, semantic objects, hierarchy, metadata and source mappings remain present. Metadata objects are shared during conversion; numeric buffers are copied. The converter rejects indices that would overflow or silently truncate in Uint32.
- Conversion occurs **after the existing reader**. It does not yet build typed buffers directly while parsing.
- An adapter reconstructs arrays per feature/geometry for the **unchanged** Three.js geometry builder. It does not keep a permanent decoded copy. This is a compatibility experiment, not a native packed mesh builder.

## Method

Node 24.21.0 / V8 on macOS, Bun 1.4.4 for bundling. All 11 CityJSON inputs in `~/sync/cityjson-samples`, excluding the standalone validation report. Two fresh processes per file/variant, sequential execution to avoid benchmark contention; variant order rotates between inputs and runs. Each process uses an 8 GiB heap limit.

Memory is baseline-subtracted `heapUsed + external` after three forced GC cycles. `external` already includes typed-array backing stores; they are **not omitted or double counted**. All variants discard explicit source-text retention for a like-for-like comparison. Performance entries and V8's incidental RegExp last-input cache are cleared. Values are retained CPU memory, not RSS, GPU memory, or peak loading memory.

Every packed coordinate and geometry is checked against the original using an exhaustive round trip, one feature/geometry at a time. Attributes and semantics are also checked in geometry comparisons. All variants must return identical full-dataset traversal checksums and identical SHA-256 digests of sampled mesh positions, normals and triangulation indices. Hashing/verification are outside the timed regions.

Traversal visits every polygon corner and reads XYZ in the same order, with three warmups and five timed passes per process. Mesh preparation uses the same deterministic prefix of at least 50,000 faces, stopping at a geometry boundary (or all faces for smaller inputs), with a 2,000-face warmup and three timed passes per process. Mesh preparation includes unpacking in the typed variants, but not hashing. It uses the builder's default normal mode and all geometries in that prefix; it is not a full-scene/frame-rate or validation-specific-normal benchmark. Mesh buffers are not retained in the model-memory measurement.

Tables report medians across two processes; traversal has ten timed passes and mesh preparation six. Two runs provide useful directional evidence, not formal confidence intervals. Conversion timings are single conversions per process and include allocation/checking overhead. File reading and explicit GC are excluded from parse/conversion timings.

## Retained model memory

MiB; **source text excluded from every column**. Source retention, if enabled, adds approximately one input-file-size copy on these samples.

| Dataset | Original | Coordinates only | Fully packed | Full packing saves |
|---|---:|---:|---:|---:|
'''
for name, modes in records.items():
    original, coords, packed = [value(modes[m], 'modelBytes') / 1048576 for m in ['original', 'coordinates', 'packed']]
    text += f'| {name} | {original:.1f} | {coords:.1f} | {packed:.1f} | {100*(1-packed/original):.1f}% |\n'
text += '''
## Conversion and traversal

Parse timings below are medians of the two original-variant runs. Packing is an additional step after that same parser; it does not replace parsing. Traversal speedup is original time / fully packed time.

| Dataset | Original parse ms | Pack coordinates ms | Fully pack ms | Original traversal ms | Packed traversal ms | Traversal speedup |
|---|---:|---:|---:|---:|---:|---:|
'''
for name, modes in records.items():
    original, coords, packed = [modes[m] for m in ['original', 'coordinates', 'packed']]
    a, b = timing(original, 'traversalMs'), timing(packed, 'traversalMs')
    text += f"| {name} | {value(original,'parseMs'):.1f} | {value(coords,'conversionMs'):.1f} | {value(packed,'conversionMs'):.1f} | {a:.2f} | {b:.2f} | {a/b:.2f}× |\n"
text += '''
## Existing mesh-builder compatibility cost

These timings measure the **current builder plus an unpacking bridge**, not what an implementation reading packed buffers directly would achieve. The full bridge currently reconstructs complete geometry records, including the mapping arrays; a narrower bridge could avoid those extra copies. Do not interpret this as an inherent typed-array penalty.

| Dataset | Sampled faces | Original ms | Coordinates bridge ms | Full bridge ms | Full / original |
|---|---:|---:|---:|---:|---:|
'''
for name, modes in records.items():
    a, b, c = [timing(modes[m], 'meshMs') for m in ['original', 'coordinates', 'packed']]
    faces = modes['original'][0]['meshChecksum']['faces']
    text += f'| {name} | {faces:,} | {a:.1f} | {b:.1f} | {c:.1f} | {c/a:.2f}× |\n'
text += '''
## Memory during conversion

Packing after parsing requires both representations to coexist. The following measures retained allocations while both are alive (shared metadata counted once), after collecting conversion temporaries. It is **not a peak measurement**; actual peak memory can be higher. Raw `maxRssBytes` also includes correctness checks and mesh runs, so it cannot isolate loading peak.

| Dataset | Original model MiB | Old + packed coexist MiB | Packed model MiB |
|---|---:|---:|---:|
'''
for name, modes in records.items():
    a = value(modes['original'], 'modelBytes') / 1048576
    b = value(modes['packed'], 'coexistBytes') / 1048576
    c = value(modes['packed'], 'modelBytes') / 1048576
    text += f'| {name} | {a:.1f} | {b:.1f} | {c:.1f} |\n'
text += '''
## Implications

The memory gain justifies pursuing typed storage for large inputs. Coordinates alone give a smaller, simpler improvement; flattening polygon arrays and mappings yields much of the remaining saving. Read-only numeric traversal benefits, while adapting back to the existing array-based mesh builder adds work.

For production, build packed buffers during normalisation (or convert/release one feature at a time) and let geometry construction consume them directly. Keep coordinates in Float64 and preserve geometry/face mappings. Attribute and semantic APIs need not change. Topology editing would need mutable scratch data or buffer replacement; changing an existing coordinate remains an in-place operation. Worker transfer, browser frame rate, colour updates and editing costs were not benchmarked here.

## Reproduction and checks

```sh
bun test prototypes/typed-buffers/model.test.ts
bunx tsc -p prototypes/typed-buffers/tsconfig.json
python3 scripts/build-legacy-benchmark.py bun /tmp/cjloupe-packed-benchmark.mjs
python3 scripts/run-typed-buffer-benchmarks.py node /tmp/cjloupe-packed-benchmark.mjs ~/sync/cityjson-samples docs/typed-buffer-benchmark.jsonl 2
python3 scripts/summarize-typed-buffer-benchmarks.py
```

Unit tests cover holes, empty faces/rings, closing duplicate vertices, mapping preservation, semantic metadata, precision/signed zero, Uint32 range rejection and non-mutating dataset conversion. Raw measurements and checksums are in `typed-buffer-benchmark.jsonl`.
'''
pathlib.Path('docs/typed-buffer-benchmark.md').write_text(text)
