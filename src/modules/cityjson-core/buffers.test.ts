import { expect, test } from 'bun:test'
import { buildPackedPolygons, packPolygons, packVertices, polygonAt, unpackVertices } from './buffers'
import { parseCityJson } from './parse'
import type { Vec3 } from './types'

test('packed offsets preserve empty faces/rings, holes, closures and ordering', () => {
  const polygons = [[[0, 1, 2, 0], [3, 4, 5]], [], [[]]]
  const packed = packPolygons(polygons)
  expect(Array.from(packed.polygonOffsets)).toEqual([0, 2, 2, 3])
  expect(Array.from(packed.ringOffsets)).toEqual([0, 4, 7, 7])
  expect(Array.from({ length: packed.length }, (_, i) => polygonAt(packed, i)!.map(r => Array.from(r)))).toEqual(polygons)
  expect(polygonAt(packed, 3)).toBeUndefined()
  expect(packPolygons([]).indices.length).toBe(0)
})
test('coordinates keep Float64 precision; indices cannot silently truncate', () => {
  const points: Vec3[] = [[12345678.123456789, -0, 1e-12]]
  expect(unpackVertices(packVertices(points))).toEqual(points)
  expect(Object.is(unpackVertices(packVertices(points))[0][1], -0)).toBe(true)
  for (const index of [-1, 0.5, NaN, 2 ** 32]) expect(() => packPolygons([[[index]]])).toThrow(RangeError)
  const remapped = buildPackedPolygons(visit => visit([[10, 20, 30]]), new Map([[10, 2], [20, 0], [30, 1]]))
  expect(Array.from(remapped.indices)).toEqual([2, 0, 1])
})
test('document normalisation writes remapped buffers across solid shells and preserves face semantics', () => {
  const data = parseCityJson(JSON.stringify({ type: 'CityJSON', vertices: [[9, 9, 9], [0, 0, 0], [1, 0, 0], [0, 1, 0]], CityObjects: { a: { type: 'Building', geometry: [{ type: 'MultiSolid', lod: 2, boundaries: [[[[[1, 2, 3]]], [[[3, 2, 1]]]]], semantics: { surfaces: [{ type: 'RoofSurface' }, { type: 'WallSurface' }], values: [[[0], [1]]] } }] } } }), 'test')
  const feature = data.features[0], geometry = feature.objects[0].geometries[0]
  expect(feature.vertices).toEqual(new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
  expect(Array.from(geometry.polygons.indices)).toEqual([0, 1, 2, 2, 1, 0])
  expect(Array.from(geometry.sourceFaceIndices)).toEqual([0, 1])
  expect(geometry.semanticSurfaces.map(s => s?.type)).toEqual(['RoofSurface', 'WallSurface'])
  expect(geometry.lod).toBe('2')
  expect('sourceText' in data).toBe(false)
})
