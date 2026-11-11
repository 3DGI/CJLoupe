import type { IndexArray, PackedPolygons, PolygonRings, Vec3, VertexInput, PolygonInput } from './types'

export function vertexCount(vertices: VertexInput) { return vertices instanceof Float64Array ? vertices.length / 3 : vertices.length }
export function hasVertex(vertices: VertexInput, index: number) {
  return Number.isInteger(index) && index >= 0 && index < vertexCount(vertices)
}
export function vertexComponent(vertices: VertexInput, index: number, axis: number): number {
  return vertices instanceof Float64Array ? vertices[index * 3 + axis] : vertices[index][axis]
}
/** Reads a single point; callers in hot loops should use vertexComponent instead. */
export function vertexAt(vertices: VertexInput, index: number): Vec3 | undefined {
  if (!hasVertex(vertices, index)) return undefined
  return vertices instanceof Float64Array
    ? [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]]
    : vertices[index]
}
export function unpackVertices(vertices: VertexInput): Vec3[] {
  return Array.from({ length: vertexCount(vertices) }, (_, index) => vertexAt(vertices, index)!.slice() as Vec3)
}
export function packVertices(vertices: Vec3[]): Float64Array {
  const buffer = new Float64Array(vertices.length * 3)
  for (let i = 0; i < vertices.length; i++) buffer.set(vertices[i], i * 3)
  return buffer
}
/** Creates only views of one face's rings, never copies its corner indices. */
export function polygonAt(polygons: PolygonInput, face: number): PolygonRings | undefined {
  if (face < 0 || face >= polygons.length) return undefined
  if (Array.isArray(polygons)) return polygons[face]
  const rings: PolygonRings = []
  for (let r = polygons.polygonOffsets[face]; r < polygons.polygonOffsets[face + 1]; r++) {
    rings.push(polygons.indices.subarray(polygons.ringOffsets[r], polygons.ringOffsets[r + 1]))
  }
  return rings
}
export function* polygonRings(polygons: PolygonInput): Generator<PolygonRings> {
  for (let i = 0; i < polygons.length; i++) yield polygonAt(polygons, i)!
}
export function checkedIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) throw new RangeError(`Invalid vertex index: ${index}`)
  return index
}
/** The visitor can traverse raw CityJSON shells twice without building another polygon tree. */
export function buildPackedPolygons(visit: (callback: (polygon: PolygonRings) => void) => void, remap?: ReadonlyMap<number, number>): PackedPolygons {
  let faces = 0, rings = 0, corners = 0
  visit(polygon => { faces++; rings += polygon.length; for (const ring of polygon) corners += ring.length })
  checkedIndex(rings)
  checkedIndex(corners)
  const indices = new Uint32Array(corners)
  const ringOffsets = new Uint32Array(rings + 1)
  const polygonOffsets = new Uint32Array(faces + 1)
  let f = 0, r = 0, i = 0
  visit(polygon => {
    polygonOffsets[f++] = r
    for (const ring of polygon) {
      ringOffsets[r++] = i
      for (const index of ring) indices[i++] = checkedIndex(remap?.get(index) ?? index)
    }
  })
  polygonOffsets[f] = r
  ringOffsets[r] = i
  return { length: faces, indices, ringOffsets, polygonOffsets }
}
export function packPolygons(polygons: PolygonRings[]): PackedPolygons {
  return buildPackedPolygons(callback => polygons.forEach(callback))
}
export function uniqueIndices(indices: IndexArray): Uint32Array {
  return Uint32Array.from(new Set(indices)).sort()
}
