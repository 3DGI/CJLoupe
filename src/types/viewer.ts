export type { ViewerAppearanceMode, ViewerPickingMode } from '../modules/cj-three/types'
import type { Vec3 } from '../modules/cityjson-core/types'

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
      geometryIndex: number | null
      faceIndex: number | null
      location: Vec3 | null
      preserveCameraOffset?: boolean
    }
  | {
      kind: 'location'
      location: Vec3
    }
  | null

