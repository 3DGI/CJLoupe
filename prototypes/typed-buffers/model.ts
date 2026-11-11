// Experimental storage only: not imported by the application.
import type { ViewerDataset, ViewerFeature, ViewerCityObject, ViewerObjectGeometry, Vec3 } from './legacy-types'

export type PackedGeometry = Omit<ViewerObjectGeometry, 'polygons' | 'sourceFaceIndices' | 'vertexIndices'> & {
  indices: Uint32Array
  ringOffsets: Uint32Array
  polygonOffsets: Uint32Array
  sourceFaceIndices: Uint32Array
  vertexIndices: Uint32Array
}
export type PackedObject = Omit<ViewerCityObject, 'geometries'> & { geometries: PackedGeometry[] }
export type PackedFeature = Omit<ViewerFeature, 'vertices' | 'objects'> & { vertices: Float64Array; objects: PackedObject[] }
export type PackedDataset = Omit<ViewerDataset, 'features'> & { features: PackedFeature[] }
export type CoordinateFeature = Omit<ViewerFeature, 'vertices'> & { vertices: Float64Array }
export type CoordinateDataset = Omit<ViewerDataset, 'features'> & { features: CoordinateFeature[] }

function checkUint32(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`Value cannot be represented as Uint32: ${value}`)
  }
  return value
}
function packIntegers(values: number[]) {
  const result = new Uint32Array(values.length)
  for (let i = 0; i < values.length; i++) result[i] = checkUint32(values[i])
  return result
}
export function packVertices(vertices: Vec3[]) {
  const result = new Float64Array(vertices.length * 3)
  for (let i = 0; i < vertices.length; i++) {
    result[i * 3] = vertices[i][0]
    result[i * 3 + 1] = vertices[i][1]
    result[i * 3 + 2] = vertices[i][2]
  }
  return result
}
export function unpackVertices(vertices: Float64Array): Vec3[] {
  const result: Vec3[] = new Array(vertices.length / 3)
  for (let i = 0; i < result.length; i++) result[i] = [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]]
  return result
}
export function packGeometry(geometry: ViewerObjectGeometry): PackedGeometry {
  const { polygons, sourceFaceIndices, vertexIndices, ...rest } = geometry
  let ringCount = 0
  let indexCount = 0
  for (const polygon of polygons) {
    ringCount += polygon.length
    for (const ring of polygon) indexCount += ring.length
  }
  checkUint32(ringCount)
  checkUint32(indexCount)
  const indices = new Uint32Array(indexCount)
  const ringOffsets = new Uint32Array(ringCount + 1)
  const polygonOffsets = new Uint32Array(polygons.length + 1)
  let r = 0
  let offset = 0
  for (let p = 0; p < polygons.length; p++) {
    polygonOffsets[p] = r
    for (const ring of polygons[p]) {
      ringOffsets[r++] = offset
      for (const index of ring) indices[offset++] = checkUint32(index)
    }
  }
  polygonOffsets[polygons.length] = r
  ringOffsets[r] = offset
  return { ...rest, indices, ringOffsets, polygonOffsets, sourceFaceIndices: packIntegers(sourceFaceIndices), vertexIndices: packIntegers(vertexIndices) }
}
export function unpackGeometry(geometry: PackedGeometry): ViewerObjectGeometry {
  const { indices, ringOffsets, polygonOffsets, sourceFaceIndices, vertexIndices, ...rest } = geometry
  const polygons: number[][][] = []
  for (let p = 0; p < polygonOffsets.length - 1; p++) {
    const polygon: number[][] = []
    for (let r = polygonOffsets[p]; r < polygonOffsets[p + 1]; r++) {
      polygon.push(Array.from(indices.subarray(ringOffsets[r], ringOffsets[r + 1])))
    }
    polygons.push(polygon)
  }
  return { ...rest, polygons, sourceFaceIndices: Array.from(sourceFaceIndices), vertexIndices: Array.from(vertexIndices) }
}
export function packCoordinates(dataset: ViewerDataset): CoordinateDataset {
  return { ...dataset, features: dataset.features.map(feature => ({ ...feature, vertices: packVertices(feature.vertices) })) }
}
export function packDataset(dataset: ViewerDataset): PackedDataset {
  return {
    ...dataset,
    features: dataset.features.map(feature => ({
      ...feature,
      vertices: packVertices(feature.vertices),
      objects: feature.objects.map(object => ({ ...object, geometries: object.geometries.map(packGeometry) })),
    })),
  }
}
