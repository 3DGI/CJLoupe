import { packVertices, vertexAt, polygonAt, buildPackedPolygons, uniqueIndices } from '../../modules/cityjson-core/buffers'
import type { Vec3, ViewerDataset, ViewerFeature, ViewerObjectGeometry } from '../../modules/cityjson-core/types'

export type FeatureGeometryChange = { revision: number; featureId: string }


function cloneGeometries(geometries: ViewerObjectGeometry[]): ViewerObjectGeometry[] {
  return geometries.map(geometry => ({
    ...geometry,
    polygons: { ...geometry.polygons, indices: geometry.polygons.indices.slice(), ringOffsets: geometry.polygons.ringOffsets.slice(), polygonOffsets: geometry.polygons.polygonOffsets.slice() },
    semanticSurfaces: [...geometry.semanticSurfaces],
    sourceFaceIndices: geometry.sourceFaceIndices.slice(),
    vertexIndices: geometry.vertexIndices.slice(),
  }))
}

function refreshBounds(dataset: ViewerDataset, feature: ViewerFeature) {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const object of feature.objects) for (const geometry of object.geometries) for (const index of geometry.vertexIndices) {
    const vertex = vertexAt(feature.vertices, index)
    if (!vertex) continue
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertex[axis])
      max[axis] = Math.max(max[axis], vertex[axis])
    }
  }
  if (min.every(Number.isFinite)) feature.extent = [...min, ...max]
  const extent: ViewerDataset['extent'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const item of dataset.features) for (let axis = 0; axis < 3; axis++) {
    extent[axis] = Math.min(extent[axis], item.extent[axis])
    extent[axis + 3] = Math.max(extent[axis + 3], item.extent[axis + 3])
  }
  dataset.extent = extent
  // Keep the scene origin stable while editing. It is not the current bounds midpoint.
}

/** CJLoupe-only editing and undo. Shared renderers receive explicit feature updates. */
export function createGeometryEditor() {
  const verticesBeforeEdit = new Map<string, Float64Array>()
  const geometryBeforeEdit = new Map<string, Map<string, ViewerObjectGeometry[]>>()
  let revision = 0
  const changed = (dataset: ViewerDataset, feature: ViewerFeature): FeatureGeometryChange => {
    refreshBounds(dataset, feature)
    return { revision: ++revision, featureId: feature.id }
  }
  return {
    hasChanges(featureId: string) { return verticesBeforeEdit.has(featureId) || geometryBeforeEdit.has(featureId) },
    reset() { verticesBeforeEdit.clear(); geometryBeforeEdit.clear() },
    commitVertices(dataset: ViewerDataset, featureId: string, vertices: Vec3[]) {
      const feature = dataset.features.find(item => item.id === featureId)
      if (!feature) return null
      if (!verticesBeforeEdit.has(featureId)) verticesBeforeEdit.set(featureId, feature.vertices.slice())
      feature.vertices = packVertices(vertices)
      return changed(dataset, feature)
    },
    deleteFace(dataset: ViewerDataset, featureId: string, objectId: string, geometryIndex: number, faceIndex: number) {
      const feature = dataset.features.find(item => item.id === featureId)
      const object = feature?.objects.find(item => item.id === objectId)
      const geometry = object?.geometries.find(item => item.index === geometryIndex)
      if (!feature || !object || (!geometry || !polygonAt(geometry.polygons, faceIndex))) return null
      let originals = geometryBeforeEdit.get(featureId)
      if (!originals) { originals = new Map(); geometryBeforeEdit.set(featureId, originals) }
      if (!originals.has(objectId)) originals.set(objectId, cloneGeometries(object.geometries))
      const originalPolygons = geometry.polygons
      geometry.polygons = buildPackedPolygons(visit => {
        for (let i = 0; i < originalPolygons.length; i++) if (i !== faceIndex) visit(polygonAt(originalPolygons, i)!)
      })
      geometry.semanticSurfaces = geometry.semanticSurfaces.filter((_, index) => index !== faceIndex)
      geometry.sourceFaceIndices = geometry.sourceFaceIndices.filter((_, index) => index !== faceIndex)
      geometry.vertexIndices = uniqueIndices(geometry.polygons.indices)
      return changed(dataset, feature)
    },
    restoreFeature(dataset: ViewerDataset, featureId: string) {
      const feature = dataset.features.find(item => item.id === featureId)
      if (!feature || (!verticesBeforeEdit.has(featureId) && !geometryBeforeEdit.has(featureId))) return null
      const vertices = verticesBeforeEdit.get(featureId)
      if (vertices) feature.vertices = vertices.slice()
      const originals = geometryBeforeEdit.get(featureId)
      for (const object of feature.objects) {
        const geometries = originals?.get(object.id)
        if (geometries) object.geometries = cloneGeometries(geometries)
      }
      verticesBeforeEdit.delete(featureId)
      geometryBeforeEdit.delete(featureId)
      return changed(dataset, feature)
    },
  }
}
