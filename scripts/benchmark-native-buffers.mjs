// node --expose-gc --max-old-space-size=8192 scripts/benchmark-native-buffers.mjs BUNDLE INPUT legacy|native
import { readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

if (!global.gc) throw new Error('Run with --expose-gc')
const [bundle, input, mode = 'native'] = process.argv.slice(2)
if (!['legacy', 'native'].includes(mode)) throw new Error('Unknown variant')
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
const withSource = await memory()
function clearSource() {
  if ('sourceText' in original) original.sourceText = ''
  for (const source of original.sources) if ('sourceText' in source) source.sourceText = ''
}
clearSource()
const originalMemory = await memory()
let model = original
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
function traversePacked(dataset) {
  let sum = 0, corners = 0
  for (const feature of dataset.features) for (const object of feature.objects) for (const geometry of object.geometries) {
    const { polygonOffsets, ringOffsets, indices } = geometry.polygons
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
const traverse = mode === 'native' ? traversePacked : traverseOriginal
for (let i = 0; i < 3; i++) traverse(model)
const traversalMs = []
let traversalChecksum
for (let i = 0; i < 5; i++) {
  const start = performance.now()
  traversalChecksum = traverse(model)
  traversalMs.push(performance.now() - start)
}

// Deterministic prefix ending at a geometry boundary, >= 50,000 faces if available.
// Native mode passes typed buffers directly to the production builder.
function mesh(limit) {
  const blueprints = []
  let faces = 0, geometries = 0, features = 0
  for (const feature of model.features) {
    const vertices = feature.vertices
    features++
    for (const object of feature.objects) for (const geometry of object.geometries) {
      const polygons = geometry.polygons
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
const modelHash = hashModel(model)
model = null
const released = await memory()
console.log(JSON.stringify({
  file: basename(input), fileBytes: statSync(input).size, runtime: process.version, mode,
  parseMs, baseline, withSource, originalMemory, modelMemory, released,
  originalModelBytes: originalMemory.retained - baseline.retained,
  modelBytes: modelMemory.retained - baseline.retained,
  afterReleaseBytes: released.retained - baseline.retained,
  traversalMs, traversalChecksum, meshMs, meshChecksum, modelHash,
  maxRssBytes: process.resourceUsage().maxRSS * 1024,
}))

function hashModel(dataset) {
  const hash = createHash('sha256')
  const bytes = array => hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
  const json = value => hash.update(JSON.stringify(value))
  json({ center: dataset.center, extent: dataset.extent })
  for (const feature of dataset.features) {
    json({ id: feature.id, rootObjectId: feature.rootObjectId, attributes: feature.attributes, extent: feature.extent, errors: feature.errors })
    bytes(mode === 'native' ? feature.vertices : Float64Array.from(feature.vertices.flat()))
    for (const object of feature.objects) {
      json({ id: object.id, type: object.type, attributes: object.attributes, parentIds: object.parentIds, childIds: object.childIds, bestGeometryIndex: object.bestGeometryIndex })
      for (const geometry of object.geometries) {
        json({ index: geometry.index, type: geometry.geometryType, lod: geometry.lod == null ? null : String(geometry.lod), semantics: geometry.semanticSurfaces })
        const packed = mode === 'native' ? geometry.polygons : api.packGeometry(geometry)
        for (const key of ['indices', 'ringOffsets', 'polygonOffsets']) bytes(packed[key])
        bytes(mode === 'native' ? geometry.sourceFaceIndices : Uint32Array.from(geometry.sourceFaceIndices))
        bytes(mode === 'native' ? geometry.vertexIndices : Uint32Array.from(geometry.vertexIndices))
      }
    }
  }
  return hash.digest('hex')
}
