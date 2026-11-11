import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { unpackVertices } from '../../modules/cityjson-core/buffers'
import { parseCityJson } from '../../modules/cityjson-core/parse'
import type { ViewerDataset } from '../../modules/cityjson-core/types'
import { createCityLayer } from '../../modules/cj-three/layer'
import type { BatchedObjectRecord } from '../../modules/cj-three/types'
import { createGeometryEditor } from './geometry-editor'

function markError(data: ViewerDataset) {
  data.features.find(feature => feature.id === 'a')!.errors = [{
    code: 203, description: 'test', id: '', info: '', cityObjectId: 'a',
    geometryIndex: 0, faceIndex: 0, shellIndex: null, ringIndex: null,
    vertexIndex: null, location: null,
  }]
}

function ray(x: number, y: number) {
  return new THREE.Raycaster(new THREE.Vector3(x, y, 20), new THREE.Vector3(0, 0, -1))
}

test('standalone face deletion and undo refresh materials, shader attributes and picking together', () => {
  const data = parseCityJson(JSON.stringify({
    type: 'CityJSON',
    vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0], [20, 0, 0], [30, 0, 0], [20, 10, 0]],
    CityObjects: { a: { type: 'Building', geometry: [{ type: 'MultiSurface', boundaries: [[[0, 1, 2]], [[3, 4, 5]]] }] } },
  }), 'faces')
  markError(data)
  const editor = createGeometryEditor()
  const layer = createCityLayer({ origin: [0, 0, 0] })
  layer.setData(data)
  const mesh = layer.group.children[0] as THREE.Mesh
  const oldGeometry = mesh.geometry
  const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  expect(oldMaterials).toHaveLength(2)
  expect(Array.from(mesh.userData.triangleFaceIndices)).toEqual([1, 0])
  const shaderObjectId = mesh.geometry.getAttribute('shaderObjectId').getX(0)
  let geometryDisposals = 0, materialDisposals = 0
  oldGeometry.addEventListener('dispose', () => geometryDisposals++)
  for (const material of new Set(oldMaterials)) material.addEventListener('dispose', () => materialDisposals++)

  editor.deleteFace(data, 'a', 'a', 0, 0)
  layer.updateFeature('a')
  expect(layer.group.children[0]).toBe(mesh)
  expect(Array.isArray(mesh.material)).toBe(false)
  expect(mesh.geometry.groups).toHaveLength(0)
  expect(Array.from(mesh.userData.triangleFaceIndices)).toEqual([0])
  expect(mesh.userData.triangleFaceIndices).toBe(mesh.geometry.userData.triangleFaceIndices)
  expect(mesh.geometry.getAttribute('shaderObjectId').getX(0)).toBe(shaderObjectId)
  expect(Array.from(mesh.geometry.getAttribute('selectionFaceIndex').array)).toEqual([0, 0, 0])
  expect(layer.pick(ray(21, 1))?.faceIndex).toBe(0)
  expect(layer.pick(ray(1, 1))).toBeNull()
  expect(geometryDisposals).toBe(1)
  expect(materialDisposals).toBe(2)

  editor.restoreFeature(data, 'a')
  layer.updateFeature('a')
  expect(layer.group.children[0]).toBe(mesh)
  expect(Array.isArray(mesh.material) && mesh.material.length).toBe(2)
  expect(Array.from(mesh.userData.triangleFaceIndices)).toEqual([1, 0])
  expect(layer.pick(ray(1, 1))?.faceIndex).toBe(0)
  expect(layer.pick(ray(21, 1))?.faceIndex).toBe(1)
  expect(mesh.geometry.getAttribute('shaderObjectId').getX(0)).toBe(shaderObjectId)
  expect(mesh.geometry.getAttribute('selectionFaceIndex').count).toBe(6)
  layer.dispose()
})

for (const appearanceMode of ['semantic', 'regular'] as const) {
  test(`${appearanceMode} batch geometry can grow without losing instance state or neighbouring picks`, () => {
    const data = parseCityJson(JSON.stringify({
      type: 'CityJSON',
      vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [20, 0, 0], [30, 0, 0], [20, 10, 0]],
      CityObjects: {
        a: { type: 'Building', geometry: [{ type: 'MultiSurface', boundaries: [[[0, 1, 2, 3]]], semantics: { surfaces: [{ type: 'RoofSurface' }], values: [0] } }] },
        b: { type: 'Building', geometry: [{ type: 'MultiSurface', boundaries: [[[4, 5, 6]]] }] },
      },
    }), 'batch')
    markError(data)
    const layer = createCityLayer({ appearanceMode, origin: [0, 0, 0] })
    if (appearanceMode === 'regular') layer.setAttributeColors({
      mode: 'direct', valuesByObjectKey: {}, directColorsByObjectKey: { 'a::a': '#123456' },
      dataMin: 0, dataMax: 1, domainMin: 0, domainMax: 1, colors: ['#000000', '#ffffff'], missingColor: '#aaaaaa',
    })
    layer.setData(data)
    expect(layer.group.children).toHaveLength(1)
    const batch = layer.group.children[0] as THREE.BatchedMesh
    const records = batch.userData.recordsByInstanceId as Map<number, BatchedObjectRecord>
    const record = [...records.values()].find(record => record.objectId === 'a')!
    const neighbour = [...records.values()].find(record => record.objectId === 'b')!
    const instanceId = record.instanceId
    const oldGeometryId = record.geometryId
    const neighbourBlueprint = neighbour.blueprint
    const matrix = batch.getMatrixAt(instanceId, new THREE.Matrix4()).clone()
    const color = batch.getColorAt(instanceId, new THREE.Color()).clone()
    expect(batch.getGeometryRangeAt(record.geometryId).vertexCount).toBe(4)
    batch.setVisibleAt(instanceId, false)

    const editor = createGeometryEditor()
    const feature = data.features.find(feature => feature.id === 'a')!
    const vertices = unpackVertices(feature.vertices)
    vertices[2][2] = 5
    editor.commitVertices(data, 'a', vertices)
    expect(() => layer.updateFeature('a', 2)).not.toThrow()
    expect(record.geometryId).not.toBe(oldGeometryId)
    expect(record.instanceId).toBe(instanceId)
    expect(batch.getGeometryIdAt(instanceId)).toBe(record.geometryId)
    expect(records.get(instanceId)).toBe(record)
    expect(records.size).toBe(2)
    expect(batch.getGeometryRangeAt(record.geometryId).vertexCount).toBe(6)
    expect(batch.getVisibleAt(instanceId)).toBe(false)
    expect(batch.getMatrixAt(instanceId, new THREE.Matrix4())).toEqual(matrix)
    expect(batch.getColorAt(instanceId, new THREE.Color())).toEqual(color)
    expect(neighbour.blueprint).toBe(neighbourBlueprint)
    expect(layer.pick(ray(21, 1))?.objectId).toBe('b')
    batch.setVisibleAt(instanceId, true)
    expect(layer.pick(ray(8, 7))?.objectId).toBe('a')
    expect(layer.pick(ray(8, 7))?.faceIndex).toBe(0)
    expect(layer.pick(ray(8, 7))!.point.z).toBeGreaterThan(0)
    expect(batch.boundingBox!.max.z).toBe(5)

    const grownGeometry = batch.geometry
    const grownGeometryId = record.geometryId
    for (let i = 0; i < 3; i++) {
      editor.restoreFeature(data, 'a')
      layer.updateFeature('a')
      expect(layer.pick(ray(8, 7))!.point.z).toBe(0)
      editor.commitVertices(data, 'a', vertices)
      layer.updateFeature('a', 2)
      expect(batch.geometry).toBe(grownGeometry)
      expect(record.geometryId).toBe(grownGeometryId)
      expect(layer.pick(ray(21, 1))?.objectId).toBe('b')
    }
    let disposals = 0
    batch.geometry.addEventListener('dispose', () => disposals++)
    layer.dispose()
    expect(disposals).toBe(1)
  })
}
