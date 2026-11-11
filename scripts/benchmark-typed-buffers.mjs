// node --expose-gc --max-old-space-size=8192 scripts/benchmark-typed-buffers.mjs BUNDLE INPUT original|coordinates|packed
import { readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

if (!global.gc) throw new Error('Run with --expose-gc')
const [bundle, input, mode = 'original'] = process.argv.slice(2)
if (!['original', 'coordinates', 'packed'].includes(mode)) throw new Error('Unknown variant')
const api = await import(pathToFileURL(resolve(bundle)).href)
const tick = () => new Promise(resolve => setImmediate(resolve))
async function memory() {
  /x/.test('x') // Release V8's incidental RegExp last-input cache.
  performance.clearMarks()
  performance.clearMeasures()
  for (let i = 0; i < 3; i++) { await tick(); global.gc() }
  const { heapUsed, external, arrayBuffers, rss } = process.memoryUsage()
  return { heapUsed, external, arrayBuffers, rss, retained: heapUsed + external }
}
const fixture = '{"type":"CityJSON","version":"2.0","CityObjects":{"warm":{"type":"Building","geometry":[{"type":"MultiSurface","lod":"2","boundaries":[[[0,1,2]]]}]}},"vertices":[[0,0,0],[1,0,0],[0,1,0]]}'
function warmup() {
  const small = api.parseCityJson(fixture, 'warmup')
  api.packCoordinates(small)
  api.packDataset(small)
  api.buildObjectGeometryBlueprint(small.features[0].objects[0].geometries[0].polygons, small.features[0].vertices, small.center)
}
warmup()
const baseline = await memory()
let original
function load() {
  const text = readFileSync(input, 'utf8')
  const start = performance.now()
  original = api.parseCityJson(text, basename(input))
  return performance.now() - start
}
const parseMs = load()
if (!Array.isArray(original.features[0].vertices)) throw new Error('This historical conversion benchmark requires a legacy reader bundle; use build-legacy-benchmark.py.')
const withSource = await memory()
function clearSource() {
  original.sourceText = ''
  for (const source of original.sources) source.sourceText = ''
}
clearSource()
const originalMemory = await memory()
let model
function convert() {
  const start = performance.now()
  model = mode === 'packed' ? api.packDataset(original) : mode === 'coordinates' ? api.packCoordinates(original) : original
  return performance.now() - start
}
const conversionMs = convert()
const coexistMemory = await memory()
// Exhaustive numeric equivalence, one geometry at a time to bound verification allocations.
function verify() {
  if (mode === 'original') return
  for (let f = 0; f < original.features.length; f++) {
    const before = original.features[f]
    const after = model.features[f]
    assert.deepEqual(api.unpackVertices(after.vertices), before.vertices)
    if (mode === 'packed') {
      for (let o = 0; o < before.objects.length; o++) {
        for (let g = 0; g < before.objects[o].geometries.length; g++) {
          assert.deepEqual(api.unpackGeometry(after.objects[o].geometries[g]), before.objects[o].geometries[g])
        }
      }
    }
  }
}
verify()
original = null
const modelMemory = await memory()

// Traverse all polygon corners and read XYZ in identical order. Not a frame-rate benchmark.
function traverseOriginal(dataset) {
  let sum = 0, corners = 0
  for (const feature of dataset.features) for (const object of feature.objects) for (const geometry of object.geometries) {
    for (const polygon of geometry.polygons) for (const ring of polygon) for (const index of ring) {
      const v = feature.vertices[index]
      sum += v[0] + v[1] + v[2]
      corners++
    }
  }
  return { sum, corners }
}
function traverseCoordinates(dataset) {
  let sum = 0, corners = 0
  for (const feature of dataset.features) for (const object of feature.objects) for (const geometry of object.geometries) {
    for (const polygon of geometry.polygons) for (const ring of polygon) for (const index of ring) {
      const offset = index * 3
      sum += feature.vertices[offset] + feature.vertices[offset + 1] + feature.vertices[offset + 2]
      corners++
    }
  }
  return { sum, corners }
}
function traversePacked(dataset) {
  let sum = 0, corners = 0
  for (const feature of dataset.features) for (const object of feature.objects) for (const geometry of object.geometries) {
    const { polygonOffsets, ringOffsets, indices } = geometry
    for (let p = 0; p < polygonOffsets.length - 1; p++) for (let r = polygonOffsets[p]; r < polygonOffsets[p + 1]; r++) {
      for (let i = ringOffsets[r]; i < ringOffsets[r + 1]; i++) {
        const offset = indices[i] * 3
        sum += feature.vertices[offset] + feature.vertices[offset + 1] + feature.vertices[offset + 2]
        corners++
      }
    }
  }
  return { sum, corners }
}
const traverse = mode === 'packed' ? traversePacked : mode === 'coordinates' ? traverseCoordinates : traverseOriginal
for (let i = 0; i < 3; i++) traverse(model)
const traversalMs = []
let traversalChecksum
for (let i = 0; i < 5; i++) {
  const start = performance.now()
  traversalChecksum = traverse(model)
  traversalMs.push(performance.now() - start)
}

// Deterministic prefix ending at a geometry boundary, >= 50,000 faces if available.
// Packed variants materialise ordinary arrays for the existing mesh builder.
// Arrays live only for the current feature/geometry; no permanent decoded cache.
function mesh(limit) {
  const blueprints = []
  let faces = 0, geometries = 0, features = 0
  for (const feature of model.features) {
    const vertices = mode === 'original' ? feature.vertices : api.unpackVertices(feature.vertices)
    features++
    for (const object of feature.objects) for (const geometry of object.geometries) {
      const polygons = mode === 'packed' ? api.unpackGeometry(geometry).polygons : geometry.polygons
      blueprints.push(api.buildObjectGeometryBlueprint(polygons, vertices, model.center))
      faces += polygons.length
      geometries++
      if (faces >= limit) return { blueprints, faces, geometries, features }
    }
  }
  return { blueprints, faces, geometries, features }
}
function digestMeshes(output) {
  const hash = createHash('sha256')
  let vertices = 0, indices = 0
  for (const blueprint of output.blueprints) {
    hash.update(new Uint8Array(blueprint.positions.buffer, blueprint.positions.byteOffset, blueprint.positions.byteLength))
    hash.update(new Uint8Array(blueprint.normals.buffer, blueprint.normals.byteOffset, blueprint.normals.byteLength))
    vertices += blueprint.positions.length / 3
    for (const polygon of blueprint.polygonTriangleIndices) {
      hash.update(new Uint8Array(Uint32Array.from([polygon.length, ...polygon]).buffer))
      indices += polygon.length
    }
  }
  return { hash: hash.digest('hex'), faces: output.faces, geometries: output.geometries, features: output.features, vertices, indices }
}
mesh(2000)
const meshMs = []
let meshChecksum
function measureMesh() {
  const start = performance.now()
  const output = mesh(50000)
  meshMs.push(performance.now() - start)
  const checksum = digestMeshes(output) // Hashing excluded from timing.
  if (meshChecksum) assert.deepEqual(checksum, meshChecksum)
  meshChecksum = checksum
}
for (let i = 0; i < 3; i++) {
  await memory()
  measureMesh()
}
model = null
const released = await memory()
console.log(JSON.stringify({
  file: basename(input), fileBytes: statSync(input).size, runtime: process.version, mode,
  parseMs, conversionMs, baseline, withSource, originalMemory, coexistMemory, modelMemory, released,
  originalModelBytes: originalMemory.retained - baseline.retained,
  modelBytes: modelMemory.retained - baseline.retained,
  coexistBytes: coexistMemory.retained - baseline.retained,
  afterReleaseBytes: released.retained - baseline.retained,
  traversalMs, traversalChecksum, meshMs, meshChecksum,
  maxRssBytes: process.resourceUsage().maxRSS * 1024,
}))
