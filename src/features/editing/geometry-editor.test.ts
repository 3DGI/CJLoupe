import { unpackVertices } from '../../modules/cityjson-core/buffers'
import { getDatasetSourceText } from '../../lib/source-text'
import { expect, test } from 'bun:test'
import { parseCityJson } from '../../lib/cityjson'
import { createGeometryEditor } from './geometry-editor'

test('CJLoupe edits identify the changed feature, refresh bounds, and restore geometry without changing source text or origin', () => {
  const source = JSON.stringify({ type: 'CityJSON', vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]], CityObjects: { a: { type: 'Building', geometry: [{ type: 'MultiSurface', boundaries: [[[0, 1, 2]], [[0, 1, 3]]], semantics: { surfaces: [{ type: 'WallSurface' }], values: [0, null] } }] } } })
  const dataset = parseCityJson(source, 'sample'), editor = createGeometryEditor()
  const feature = dataset.features[0], original = structuredClone(feature), origin = [...dataset.center]
  const vertices = unpackVertices(feature.vertices)
  vertices[1][0] = 20
  expect(editor.commitVertices(dataset, feature.id, vertices)?.featureId).toBe(feature.id)
  expect(feature.extent[3]).toBe(20)
  expect(dataset.center).toEqual(origin)
  expect(editor.deleteFace(dataset, feature.id, 'a', 0, 0)?.revision).toBe(2)
  expect(Array.from(feature.objects[0].geometries[0].sourceFaceIndices)).toEqual([1])
  expect(feature.objects[0].geometries[0].semanticSurfaces).toEqual([null])
  expect(editor.hasChanges(feature.id)).toBe(true)
  expect(editor.restoreFeature(dataset, feature.id)?.revision).toBe(3)
  expect(feature).toEqual(original)
  expect(getDatasetSourceText(dataset)).toBe(source)
  expect(editor.hasChanges(feature.id)).toBe(false)
})
