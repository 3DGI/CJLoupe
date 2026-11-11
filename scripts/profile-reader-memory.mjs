// Historical source-retention benchmark. Build the legacy application reader:
// python3 scripts/build-legacy-benchmark.py bun /tmp/cjloupe-profile-parser.mjs
// node --expose-gc scripts/profile-reader-memory.mjs /tmp/cjloupe-profile-parser.mjs input.city.json
// Run each input in a fresh process. Reports bytes; excludes renderer/GPU memory.
import { readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

if (!global.gc) throw new Error('Run Node with --expose-gc')
const [parserPath, inputPath] = process.argv.slice(2)
if (!parserPath || !inputPath) throw new Error('Expected parser bundle and dataset paths')
const { parseCityJson } = await import(pathToFileURL(resolve(parserPath)).href)
const tick = () => new Promise(resolve => setImmediate(resolve))
async function sample() {
  // Clear V8's legacy RegExp last-input cache so it cannot pin the input.
  /x/.test('x')
  performance.clearMarks()
  performance.clearMeasures()
  for (let i = 0; i < 3; i++) { await tick(); global.gc() }
  const { heapUsed, external, arrayBuffers, rss } = process.memoryUsage()
  // external includes arrayBuffers: do not count them twice.
  return { heapUsed, external, arrayBuffers, rss, retained: heapUsed + external }
}
// Warm up the reader and runtime before establishing the baseline.
parseCityJson('{"type":"CityJSON","version":"2.0","CityObjects":{"warm":{"type":"Building","geometry":[{"type":"MultiSurface","lod":"2","boundaries":[[[0,1,2]]]}]}},"vertices":[[0,0,0],[1,0,0],[0,1,0]]}', 'warmup')
const baseline = await sample()
function loadInput() { globalThis.profileText = readFileSync(inputPath, 'utf8'); return globalThis.profileText.length }
const characters = loadInput()
const loaded = await sample()
let dataset
function parseInput() {
  const start = performance.now()
  dataset = parseCityJson(globalThis.profileText, basename(inputPath))
  globalThis.profileText = null
  return performance.now() - start
}
const parseMs = parseInput()
if (!('sourceText' in dataset)) throw new Error('Use the legacy reader bundle for this historical source-retention benchmark.')
const withSource = await sample()
function countModel(dataset) {
  const counts = { features: dataset.features.length, objects: 0, vertices: 0, geometries: 0, polygons: 0 }
  for (const feature of dataset.features) {
    counts.vertices += feature.vertices.length
    counts.objects += feature.objects.length
    for (const object of feature.objects) {
      counts.geometries += object.geometries.length
      for (const geometry of object.geometries) counts.polygons += geometry.polygons.length
    }
  }
  return counts
}
const counts = countModel(dataset)
function clearSource(dataset) {
  dataset.sourceText = ''
  for (const source of dataset.sources) source.sourceText = ''
}
clearSource(dataset)
const withoutSource = await sample()
// Keep model observably alive across the measurement.
if (dataset.features.length !== counts.features) throw new Error('Unexpected model mutation')
dataset = null
const released = await sample()
console.log(JSON.stringify({
  file: basename(inputPath), runtime: process.version, fileBytes: statSync(inputPath).size,
  characters, parseMs, counts, baseline, loaded, withSource, withoutSource, released,
  sourceOnlyBytes: loaded.retained - baseline.retained,
  modelAndSourceBytes: withSource.retained - baseline.retained,
  modelWithoutExplicitSourceBytes: withoutSource.retained - baseline.retained,
  sourceRemovalSavingsBytes: withSource.retained - withoutSource.retained,
  afterReleaseBytes: released.retained - baseline.retained,
  maxRssBytes: process.resourceUsage().maxRSS * 1024,
}))
