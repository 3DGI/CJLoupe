export type Vec3 = [number, number, number]
export type IndexArray = number[] | Uint32Array
export type PolygonRings = IndexArray[]
export type VertexInput = Vec3[] | Float64Array
export interface PackedPolygons {
  length: number
  indices: Uint32Array
  ringOffsets: Uint32Array
  polygonOffsets: Uint32Array
}
export type PolygonInput = PolygonRings[] | PackedPolygons

export type ViewerGeometryDisplayMode =
  | {
      kind: 'best'
    }
  | {
      kind: 'lod'
      lod: string
    }

export interface ViewerSemanticSurface {
  surfaceIndex: number
  type: string
  attributes: Record<string, unknown>
}

export interface ViewerValidationError {
  code: number
  description: string
  id: string
  info: string
  cityObjectId: string | null
  geometryIndex: number | null
  shellIndex: number | null
  faceIndex: number | null
  ringIndex: number | null
  vertexIndex: number | null
  location: Vec3 | null
}

export interface ViewerDataset {
  sourceName: string
  sourceLocation: string
  sources: ViewerDatasetSource[]
  validationSource: ViewerValidationSource | null
  center: Vec3
  extent: [number, number, number, number, number, number]
  features: ViewerFeature[]
  cityJsonVersion: string | null
  cityJsonKind: 'CityJSON' | 'CityJSONFeatures' | 'Multiple'
  transform: { scale: Vec3; translate: Vec3 } | null
  metadata: Record<string, unknown> | null
}

export interface ViewerDatasetSource {
  name: string
  location: string
  sourceKind: 'url' | 'file' | 'inline'
  embeddedViewerState: string | null
  embeddedViewerStateError: string | null
  embeddedSourceName: string | null
  cityJsonKind: 'CityJSON' | 'CityJSONFeatures'
  cityJsonVersion: string | null
  featureCount: number
  transform: { scale: Vec3; translate: Vec3 } | null
  metadata: Record<string, unknown> | null
}

export interface ViewerValidationSource {
  name: string
  location: string
  sourceKind: 'url' | 'file' | 'embedded' | 'generated'
}

export interface ViewerFeature {
  id: string
  label: string
  rootObjectId: string
  type: string
  validity: boolean | null
  errors: ViewerValidationError[]
  attributes: Record<string, unknown>
  vertices: Float64Array
  objects: ViewerCityObject[]
  extent: [number, number, number, number, number, number]
}

export interface ViewerObjectGeometry {
  index: number
  geometryType: string | null
  lod: string | null
  polygons: PackedPolygons
  semanticSurfaces: Array<ViewerSemanticSurface | null>
  sourceFaceIndices: Uint32Array
  vertexIndices: Uint32Array
}

export interface ViewerCityObject {
  id: string
  type: string
  geographicalExtent?: ViewerFeature['extent']
  attributes: Record<string, unknown>
  geometries: ViewerObjectGeometry[]
  bestGeometryIndex: number | null
  hasRenderableChildren: boolean
  parentIds: string[]
  childIds: string[]
}
