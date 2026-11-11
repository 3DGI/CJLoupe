import { packPolygons, packVertices } from '../cityjson-core/buffers'
import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { parseCityJson } from '../cityjson-core/parse'
import type { Vec3 } from '../cityjson-core/types'
import { buildObjectGeometryBlueprint, buildUngroupedObjectGeometry } from './geometry'
import { createCityLayer, createLayerState, previewColorDomain } from './layer'
import { syncRuntimeAttributeColor } from './scene'
import type { ViewerAttributeColorState } from '../colors/types'

function dataset() {
  return parseCityJson(JSON.stringify({ type: 'CityJSON', vertices: [[1000, 2000, 0], [1010, 2000, 0], [1010, 2010, 0], [1000, 2010, 0]], CityObjects: { building: { type: 'Building', geometry: [{ type: 'MultiSurface', lod: '1', boundaries: [[[0, 1, 2, 3]]] }] } } }), 'square')
}
const colors: ViewerAttributeColorState = { mode: 'continuous', valuesByObjectKey: { 'building::building': 4 }, dataMin: 0, dataMax: 10, domainMin: 0, domainMax: 10, colors: ['#000000', '#ffffff'], missingColor: '#aaaaaa' }

describe('Three.js geometry and layer', () => {
  test('triangulation preserves holes, source faces and world-coordinate offsets', () => {
    const vertices: Vec3[] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [3, 3, 0], [3, 7, 0], [7, 7, 0], [7, 3, 0]]
    const blueprint = buildObjectGeometryBlueprint([[[0, 1, 2, 3], [4, 5, 6, 7]]], vertices, [5, 5, 0])
    const geometry = buildUngroupedObjectGeometry(blueprint)
    const position = geometry.getAttribute('position')
    const indices = geometry.getIndex()!
    let area = 0
    for (let i = 0; i < indices.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, indices.getX(i))
      const b = new THREE.Vector3().fromBufferAttribute(position, indices.getX(i + 1))
      const c = new THREE.Vector3().fromBufferAttribute(position, indices.getX(i + 2))
      area += b.sub(a).cross(c.sub(a)).length() / 2
    }
    expect(area).toBeCloseTo(84)
    expect(new Set(geometry.userData.triangleFaceIndices)).toEqual(new Set([0]))
    expect(position.getX(0)).toBe(-5)
    geometry.dispose()
  })

  test('batched and standalone ray hits identify the same source face', () => {
    for (const withError of [false, true]) {
      const data = dataset()
      if (withError) data.features[0].errors = [{ code: 203, description: 'test', id: '', info: '', cityObjectId: 'building', geometryIndex: 0, shellIndex: null, faceIndex: 0, ringIndex: null, vertexIndex: null, location: null }]
      const layer = createCityLayer({ origin: [1000, 2000, 0] })
      layer.setData(data)
      const hit = layer.pick(new THREE.Raycaster(new THREE.Vector3(2, 2, 20), new THREE.Vector3(0, 0, -1)))
      expect(hit?.objectId).toBe('building')
      expect(hit?.faceIndex).toBe(0)
      expect(hit?.point.toArray()).toEqual([2, 2, 0])
      layer.dispose()
    }
  })

  test('colour previews are instance-local and do not rebuild geometry', () => {
    const left = createLayerState(), right = createLayerState()
    syncRuntimeAttributeColor(left, colors)
    syncRuntimeAttributeColor(right, colors)
    expect(previewColorDomain(left, { min: 2, max: 8 })).toBe(true)
    expect(left.attributeColorSharedUniforms.min.value).toBe(2)
    expect(right.attributeColorSharedUniforms.min.value).toBe(0)
    const layer = createCityLayer()
    layer.setData(dataset())
    const mesh = layer.group.children[0]
    layer.setAttributeColors(colors)
    layer.previewColorDomain({ min: 1, max: 9 })
    expect(layer.group.children[0]).toBe(mesh)
    layer.dispose()
    left.attributeColorSharedUniforms.valueMap.value.dispose()
    right.attributeColorSharedUniforms.valueMap.value.dispose()
  })

  test('disposal releases owned geometry, detaches the layer and is idempotent', () => {
    const scene = new THREE.Scene(), layer = createCityLayer()
    scene.add(layer.group)
    layer.setData(dataset())
    const batch = layer.group.children[0] as THREE.BatchedMesh
    let disposals = 0
    batch.geometry.addEventListener('dispose', () => disposals++)
    layer.dispose(); layer.dispose()
    expect(disposals).toBe(1)
    expect(scene.children).toHaveLength(0)
    expect(() => layer.setData(dataset())).toThrow('disposed')
  })
})

test('native buffers match array input for holes, concave/closed/non-planar faces and degenerates', () => {
  const vertices: Vec3[] = [[1000000, 4000000, 0], [1000010, 4000000, 0], [1000010, 4000010, 0], [1000000, 4000010, 0], [1000003, 4000003, 0], [1000003, 4000007, 0], [1000007, 4000007, 0], [1000007, 4000003, 0], [1000005, 4000005, 3]]
  const polygons = [[[0, 1, 2, 3], [4, 5, 6, 7]], [[0, 1, 8, 3]], [[0, 1, 2, 3, 0]], [[0, 8, 2, 3]], [], [[0, 1]]]
  for (const specialFaces of [new Set<number>(), new Set([1, 3])]) {
    const legacy = buildObjectGeometryBlueprint(polygons, vertices, [1000000, 4000000, 0], specialFaces)
    const packed = buildObjectGeometryBlueprint(packPolygons(polygons), packVertices(vertices), [1000000, 4000000, 0], specialFaces)
    expect(packed).toEqual(legacy)
  }
})
