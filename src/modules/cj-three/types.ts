import type * as THREE from 'three'
import type { Vec3 } from '../cityjson-core/types'
import type { ViewerAttributeColorState } from '../colors/types'

export type ViewerAppearanceMode = 'regular' | 'normal' | 'semantic' | 'colormap'
export type ViewerPickingMode = 'none' | 'object' | 'face' | 'vertex'

export type Theme = 'light' | 'dark'

export type ObjectGeometryBlueprint = {
  positions: Float32Array
  normals: Float32Array
  polygonTriangleIndices: number[][]
}

export type TriangleFaceIndices = ArrayLike<number>

export type BatchedObjectRecord = {
  key: string
  featureId: string
  objectId: string
  objectType: string
  hasRenderableChildren: boolean
  geometryIndex: number
  featureCenter: Vec3
  baseColorLight: string
  baseColorDark: string
  triangleFaceIndices: TriangleFaceIndices
  blueprint: ObjectGeometryBlueprint
  batch: THREE.BatchedMesh
  instanceId: number
  geometryId: number
}

export type BatchBuildItem = Omit<BatchedObjectRecord, 'batch' | 'instanceId' | 'geometryId'> & {
  renderKey: string
  geometry: THREE.BufferGeometry
  tileKey: string
  vertexCount: number
  indexCount: number
}

export type AttributeColorUniforms = {
  value: { value: number }
  hasValue: { value: number }
  directColor: { value: THREE.Color }
  selectionTint: { value: THREE.Color }
  selectionTintStrength: { value: number }
}

export type SelectionTintUniforms = {
  selectedObjectId: { value: number }
  selectedFaceIndex: { value: number }
  color: { value: THREE.Color }
  strength: { value: number }
  semanticStrength: { value: number }
}

export type AttributeColorSharedUniforms = {
  enabled: { value: number }
  direct: { value: number }
  min: { value: number }
  max: { value: number }
  colors: { value: THREE.Color[] }
  missingColor: { value: THREE.Color }
  valueMap: { value: THREE.DataTexture }
  valueMapSize: { value: THREE.Vector2 }
}

export type SemanticSurfaceSharedUniforms = {
  enabled: { value: number }
  colors: { value: THREE.Color[] }
}

export type NormalColorUniforms = {
  enabled: { value: number }
}

export type BatchColorMode = 'base' | 'semantic' | 'continuous-attribute'

export type LayerState = {
  rootGroup: THREE.Group
  meshesByRenderKey: Map<string, THREE.Mesh>
  meshesByFeatureId: Map<string, THREE.Mesh[]>
  batchedMeshes: THREE.BatchedMesh[]
  batchedObjectsByRenderKey: Map<string, BatchedObjectRecord>
  batchedObjectsByFeatureId: Map<string, BatchedObjectRecord[]>
  sceneScale: number
  theme: Theme
  appearanceMode: ViewerAppearanceMode
  attributeColor: ViewerAttributeColorState | null
  attributeColorSharedUniforms: AttributeColorSharedUniforms
  normalColorUniforms: NormalColorUniforms
  selectionTintUniforms: SelectionTintUniforms
  semanticSurfaceSharedUniforms: SemanticSurfaceSharedUniforms
  semanticSurfaceTypeIds: Map<string, number>
  shaderObjectIdsByObjectKey: Map<string, number>
  nextShaderObjectId: number
  preparedAttributeColorValuesByObjectKey: Record<string, number> | null
}
