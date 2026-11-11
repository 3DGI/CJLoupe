import collections
import json
import pathlib
import statistics

rows = collections.defaultdict(lambda: collections.defaultdict(list))
for line in pathlib.Path('docs/native-buffer-benchmark.jsonl').read_text().splitlines():
    d = json.loads(line)
    rows[d['file']][d['mode']].append(d)
assert len(rows) == 11 and all(len(g[m]) == 2 for g in rows.values() for m in ['legacy', 'native'])
def val(records, key):
    return statistics.median(r[key] for r in records)
def timing(records, key):
    return statistics.median(v for r in records for v in r[key])
text = '''# Native packed-buffer benchmark

Measured 2026-11-11. The production reader writes Float64 coordinates and Uint32
polygon indices/offsets directly during normalisation. The production mesh builder
reads these buffers without unpacking a complete feature or geometry. CJLoupe owns
source text separately; the reusable module model contains no source-text fields.

## Method

Node 24.21.0 / V8 on macOS. Eleven local samples, two independent processes per
variant and file (44 processes), sequential with alternating order. Baseline is
commit `d15893bb98e016e86e7078a4fc57972ab7b50ddf`, using the historical benchmark
entry and original app reader/mesh builder. The native entry uses the new app
reader/mesh builder. Both include app validation annotations and state handling.

Memory is baseline-subtracted `heapUsed + external` after three forced GC cycles,
including typed-array backing stores exactly once. Source text is excluded from
both measurements: legacy source fields are cleared; the native benchmark releases
app-owned source descriptor identities by replacing them with copies. The real
CJLoupe app continues to keep its original source text. RegExp last-input caching
and performance entries are cleared before memory measurements. These are retained
CPU allocations, not process RSS, GPU usage, or loading peaks.

Parse time excludes reading the file and explicit GC. There is no conversion stage
in native mode. Mesh preparation uses the same deterministic prefix of at least
50,000 faces, ending at a geometry boundary (or all faces in smaller inputs), with
one 2,000-face warmup and three timed passes per process. Times are medians over
six passes. Neither variant retains mesh buffers in the model-memory measurement.
The default normal mode is used; special non-planar normal paths are covered by
unit tests. These are CPU mesh-preparation times, not interactive frame rates.

Each process hashes every feature's coordinates, extents, hierarchy, attributes,
errors, geometry indices, LoDs, semantic surfaces, polygon buffers and face/vertex
mappings. It also hashes sampled mesh positions, normals and triangle indices.
**All full-model hashes, traversal checksums and mesh hashes match between old and
new implementations across all 44 processes.** Hashing is excluded from timings.
Two runs provide directional measurements, not statistical confidence intervals.

## Memory and load time

Model memory in MiB; source text and meshes excluded. Parse times in milliseconds.

| Dataset | Old model | Native model | Saving | Old parse ms | Native parse ms |
|---|---:|---:|---:|---:|---:|
'''
for name, g in rows.items():
    a,b=g['legacy'],g['native']
    old,new=val(a,'modelBytes')/1048576,val(b,'modelBytes')/1048576
    text+=f"| {name} | {old:.1f} | {new:.1f} | {100*(1-new/old):.1f}% | {val(a,'parseMs'):.1f} | {val(b,'parseMs'):.1f} |\n"
text+='''
## Native mesh preparation

No unpacking bridge in this comparison. The last column is native time / old time;
below 1 is faster.

| Dataset | Sampled faces | Old ms | Native ms | Native / old |
|---|---:|---:|---:|---:|
'''
for name,g in rows.items():
    a,b=g['legacy'],g['native']
    old,new=timing(a,'meshMs'),timing(b,'meshMs')
    text+=f"| {name} | {a[0]['meshChecksum']['faces']:,} | {old:.1f} | {new:.1f} | {new/old:.2f}× |\n"
text+='''
## Remaining allocations and scope

`JSON.parse` still creates its source object tree. Normalisation uses temporary
sets/maps for remapping and distinct vertex indices. Triangulation can allocate
working arrays for the current polygon. None of these are a second complete viewer
model. The renderer's output buffers and Float32 conversion around the scene origin
remain necessary. Loading peak memory was not isolated in this experiment; raw
`maxRssBytes` includes verification and mesh preparation too.

The former standalone packing pass and whole-geometry unpacking bridge are gone.
This does not guarantee every stage is faster on every file; the table includes
regressions as well as improvements. Numeric coordinates retain Float64 precision.
Editing uses app-local coordinate drafts and packed undo snapshots, and topology
changes rebuild only the affected geometry. Source text for sharing and val3dity
validation lives in the app's weak-keyed store, outside module data types.

## Reproduce

```sh
python3 scripts/build-legacy-benchmark.py bun /tmp/cjloupe-before-native.mjs
bun build scripts/native-benchmark-entry.ts --target=node --outfile=/tmp/cjloupe-native-benchmark.mjs
python3 scripts/run-native-buffer-benchmarks.py node /tmp/cjloupe-before-native.mjs /tmp/cjloupe-native-benchmark.mjs ~/sync/cityjson-samples docs/native-buffer-benchmark.jsonl 2
python3 scripts/summarize-native-buffer-benchmarks.py
```

Raw measurements: `native-buffer-benchmark.jsonl`. The baseline builder uses a
temporary archive of the recorded commit; it does not switch or modify the working
tree. Prototype conversion results remain in `typed-buffer-benchmark.md`.
'''
pathlib.Path('docs/native-buffer-benchmark.md').write_text(text)
