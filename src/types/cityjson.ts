export type Vec3 = [number, number, number]
export type PolygonRings = number[][]

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
  location: Vec3 | null
}

export type ViewerFocusTarget =
  | {
      kind: 'feature'
      featureId: string
    }
  | {
      kind: 'vertex'
      featureId: string
      objectId: string | null
      vertexIndex: number
    }
    | {
      kind: 'error'
      featureId: string
      objectId: string | null
      faceIndex: number | null
      location: Vec3 | null
      preserveCameraOffset?: boolean
    }
  | null

export interface ViewerDataset {
  sourceName: string
  center: Vec3
  extent: [number, number, number, number, number, number]
  features: ViewerFeature[]
}

export interface ViewerFeature {
  id: string
  label: string
  rootObjectId: string
  type: string
  validity: boolean | null
  errors: ViewerValidationError[]
  attributes: Record<string, unknown>
  originalVertices: Vec3[]
  vertices: Vec3[]
  objects: ViewerCityObject[]
  extent: [number, number, number, number, number, number]
}

export interface ViewerCityObject {
  id: string
  type: string
  attributes: Record<string, unknown>
  geometryType: string | null
  lod: string | null
  polygons: PolygonRings[]
  semanticSurfaces: Array<ViewerSemanticSurface | null>
  vertexIndices: number[]
}
