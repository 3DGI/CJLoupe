import { unpackVertices as readVertices, polygonAt } from '../../src/modules/cityjson-core/buffers'
import { expect, test } from 'bun:test'
import { packGeometry, unpackGeometry, packVertices, unpackVertices, packDataset } from './model'
import { parseCityJson } from '../../src/lib/cityjson'
import type { ViewerObjectGeometry, Vec3 } from './legacy-types'

test('round trips holes, empty faces/rings, repeated closure, mappings and semantics', () => {
  const geometry: ViewerObjectGeometry = {
    index: 3, geometryType: 'Solid', lod: '2.2',
    polygons: [[[0, 1, 2, 0], [3, 4, 5]], [], [[]]],
    sourceFaceIndices: [7, 8, 9], vertexIndices: [5, 4, 3, 2, 1, 0],
    semanticSurfaces: [{ surfaceIndex: 2, type: 'RoofSurface', attributes: { slope: 15 } }, null, null],
  }
  const packed = packGeometry(geometry)
  expect(unpackGeometry(packed)).toEqual(geometry)
  expect([...packed.polygonOffsets]).toEqual([0, 2, 2, 3])
  expect([...packed.ringOffsets]).toEqual([0, 4, 7, 7])
  expect(unpackGeometry(packGeometry({ ...geometry, polygons: [] })).polygons).toEqual([])
})

test('Float64 preserves geographic precision and signed zero', () => {
  const vertices: Vec3[] = [[12345678.123456789, -0, 0.000000000001], [-123.5, 2, 3]]
  expect(unpackVertices(packVertices(vertices))).toEqual(vertices)
  expect(Object.is(unpackVertices(packVertices(vertices))[0][1], -0)).toBe(true)
})

test('rejects indices that would silently wrap or truncate in Uint32', () => {
  const geometry: ViewerObjectGeometry = { index: 0, geometryType: null, lod: null, polygons: [], sourceFaceIndices: [], vertexIndices: [], semanticSurfaces: [] }
  for (const index of [-1, 1.5, 2 ** 32, NaN]) {
    expect(() => packGeometry({ ...geometry, polygons: [[[index]]] })).toThrow(RangeError)
    expect(() => packGeometry({ ...geometry, sourceFaceIndices: [index] })).toThrow(RangeError)
  }
})

test('preserves dataset metadata and object fields without changing original', () => {
  const native = parseCityJson(JSON.stringify({ type: 'CityJSON', version: '2.0', metadata: { title: 'test' }, vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], CityObjects: { test: { type: 'Building', attributes: { value: 5 }, geometry: [{ type: 'MultiSurface', lod: '2', boundaries: [[[0, 1, 2]]] }] } } }), 'test')
  const dataset = {
    ...native, sourceText: '', validationSource: null,
    sources: native.sources.map(source => ({ ...source, sourceText: '' })),
    features: native.features.map(feature => ({
      ...feature, vertices: readVertices(feature.vertices),
      objects: feature.objects.map(object => ({ ...object, geometries: object.geometries.map(geometry => ({
        ...geometry,
        polygons: Array.from({ length: geometry.polygons.length }, (_, i) => polygonAt(geometry.polygons, i)!.map(ring => Array.from(ring))),
        sourceFaceIndices: Array.from(geometry.sourceFaceIndices), vertexIndices: Array.from(geometry.vertexIndices),
      })) })),
    })),
  }
  const packed = packDataset(dataset)
  const restored = { ...packed, features: packed.features.map(feature => ({ ...feature, vertices: unpackVertices(feature.vertices), objects: feature.objects.map(object => ({ ...object, geometries: object.geometries.map(unpackGeometry) })) })) }
  expect(restored).toEqual(dataset)
  expect(Array.isArray(dataset.features[0].vertices)).toBe(true)
  expect(packed.features[0].objects[0].geometries[0].semanticSurfaces).toBe(dataset.features[0].objects[0].geometries[0].semanticSurfaces)
})
