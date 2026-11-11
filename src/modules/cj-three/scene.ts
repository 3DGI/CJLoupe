import type { VertexInput, IndexArray } from '../cityjson-core/types'
import * as THREE from 'three'
import { resolveObjectGeometries } from '../cityjson-core/geometry'
import { viewerObjectKey } from '../cityjson-core/identity'
import { measurePerformance, nowPerformance, recordPerformanceMeasure } from '../cityjson-core/performance'
import type { Vec3, ViewerCityObject, ViewerDataset, ViewerFeature, ViewerGeometryDisplayMode, ViewerObjectGeometry, ViewerSemanticSurface, ViewerValidationError } from '../cityjson-core/types'
import type { ViewerAttributeColorState } from '../colors/types'
import { buildGroupedObjectGeometry, buildObjectGeometryBlueprint, buildUngroupedObjectGeometry } from './geometry'
import { applyAttributeColorToMaterial, applyAttributeColorToScene, applyNormalColorToMaterial, applySelectionTintToMaterial, baseColorForType, buildMaterialArray, computeFaceErrorGroups, computeFaceSemanticGroups, createBatchMaterial, createErrorMaterial, createMaterial, createSemanticMaterial, getCurrentFaceIndexForSourceFace, getShaderObjectId, semanticSurfaceTypeKey, syncAttributeColorSharedUniforms, syncSemanticSurfaceSharedUniforms } from './materials'
import type { BatchBuildItem, BatchColorMode, BatchedObjectRecord, LayerState, ObjectGeometryBlueprint, TriangleFaceIndices } from './types'

export type SceneBuildOptions = {
  geometryDisplayMode: ViewerGeometryDisplayMode
  /** Optional app policy, e.g. CJLoupe's edit-mode geometry override. */
  geometriesForObject?: (feature: ViewerFeature, object: ViewerCityObject) => ViewerObjectGeometry[]
  verticesForFeature?: (feature: ViewerFeature) => VertexInput
}

export function clearLayerGeometry(state: LayerState) {
  const materials = new Set<THREE.Material>()
  for (const mesh of state.meshesByRenderKey.values()) {
    mesh.geometry.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
    mesh.removeFromParent()
  }
  for (const batch of state.batchedMeshes) {
    for (const material of Array.isArray(batch.material) ? batch.material : [batch.material]) materials.add(material)
    batch.dispose()
    batch.removeFromParent()
  }
  for (const material of materials) material.dispose()
  state.meshesByRenderKey.clear()
  state.meshesByFeatureId.clear()
  state.batchedObjectsByRenderKey.clear()
  state.batchedObjectsByFeatureId.clear()
  state.batchedMeshes = []
  state.preparedAttributeColorValuesByObjectKey = null
}

export const BATCH_TARGET_OBJECT_COUNT = 500
export const BATCH_MAX_OBJECT_COUNT = 900
export const BATCH_MAX_VERTEX_COUNT = 60000
export const BATCH_MAX_INDEX_COUNT = 120000
export function renderedGeometryKey(objectKey: string, geometryIndex: number) {
  return `${objectKey}::geometry:${geometryIndex}`
}

export function rebuildScene(
  runtime: LayerState,
  data: ViewerDataset,
  options: SceneBuildOptions,
) {
  measurePerformance('cjvis:viewport:rebuild-scene-total', () => {
    measurePerformance('cjvis:viewport:dispose-scene-contents', () => clearLayerGeometry(runtime))
    runtime.shaderObjectIdsByObjectKey.clear()
    runtime.nextShaderObjectId = 1
    syncSemanticSurfaceSharedUniforms(runtime, data)

    const sizeX = data.extent[3] - data.extent[0]
    const sizeY = data.extent[4] - data.extent[1]
    const sizeZ = data.extent[5] - data.extent[2]
    runtime.sceneScale = Math.max(sizeX, sizeY, sizeZ)
    const batchItems: BatchBuildItem[] = []

    measurePerformance('cjvis:viewport:build-object-geometries', () => {
      for (const feature of data.features) {
        const vertices = (options.verticesForFeature?.(feature) ?? feature.vertices)

        // Center each feature's mesh geometry around the feature's own center
        // to keep float32 vertex buffer values small and avoid GPU precision jitter.
        const featureCenter: Vec3 = [
          (feature.extent[0] + feature.extent[3]) * 0.5,
          (feature.extent[1] + feature.extent[4]) * 0.5,
          (feature.extent[2] + feature.extent[5]) * 0.5,
        ]

        for (const object of feature.objects) {
          const objectGeometries = (options.geometriesForObject?.(feature, object) ?? resolveObjectGeometries(object, options.geometryDisplayMode))
          if (objectGeometries.length === 0) {
            continue
          }

          const nextObjectKey = viewerObjectKey(feature.id, object.id)

          for (const objectGeometry of objectGeometries) {
            const nextRenderKey = renderedGeometryKey(nextObjectKey, objectGeometry.index)

            if (canBatchObject(runtime, feature, object, objectGeometry)) {
              const blueprint = buildObjectGeometryBlueprint(
                objectGeometry.polygons,
                vertices,
                featureCenter,
                collectObjectErrorFaceIndices(
                  feature.errors,
                  object.id,
                  objectGeometry.index,
                  objectGeometry.sourceFaceIndices,
                ),
              )
              const geometry = buildUngroupedObjectGeometry(blueprint)
              applyBatchGeometryAttributes(
                geometry,
                blueprint,
                runtime,
                objectGeometry,
                nextObjectKey,
              )
              geometry.computeBoundingBox()
              batchItems.push({
                key: nextObjectKey,
                renderKey: nextRenderKey,
                featureId: feature.id,
                objectId: object.id,
                objectType: object.type,
                hasRenderableChildren: object.hasRenderableChildren,
                geometryIndex: objectGeometry.index,
                featureCenter,
                baseColorLight: baseColorForType(object.type, 'light'),
                baseColorDark: baseColorForType(object.type, 'dark'),
                triangleFaceIndices: geometry.userData.triangleFaceIndices,
                blueprint,
                geometry,
                tileKey: getBatchTileKey(featureCenter, data),
                vertexCount: geometry.getAttribute('position')?.count ?? 0,
                indexCount: geometry.getIndex()?.count ?? 0,
              })
            } else {
              addStandaloneObjectMesh(
                runtime,
                data,
                feature,
                object,
                objectGeometry,
                vertices,
                featureCenter,
                nextRenderKey,
              )
            }
          }
        }
      }
    })

    measurePerformance('cjvis:viewport:build-spatial-batches', () =>
      buildSpatialBatches(runtime, data, batchItems),
    )
    measurePerformance('cjvis:viewport:sync-batched-attribute-texture', () =>
      syncBatchedAttributeValueTexture(runtime, runtime.attributeColor),
    )
  })
}

export function canBatchObject(
  runtime: LayerState,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
) {
  if (runtime.appearanceMode === 'semantic') {
    return true
  }

  if (runtime.attributeColor) {
    return true
  }

  const { faceGroups } = computeFaceErrorGroups(
    feature.errors,
    object.id,
    objectGeometry.index,
    objectGeometry.sourceFaceIndices,
  )
  return faceGroups.size === 0
}

export function applyBatchGeometryAttributes(
  geometry: THREE.BufferGeometry,
  blueprint: ObjectGeometryBlueprint,
  runtime: LayerState,
  objectGeometry: ViewerObjectGeometry,
  objectKey: string,
) {
  const vertexCount = geometry.getAttribute('position')?.count ?? 0
  const colors = new Float32Array(vertexCount * 3)
  colors.fill(1)

  const shaderObjectId = getShaderObjectId(runtime, objectKey)
  const shaderObjectIds = new Float32Array(vertexCount)
  shaderObjectIds.fill(shaderObjectId)

  const semanticSurfaceTypeIds = new Float32Array(vertexCount)
  fillSemanticSurfaceAttributes(
    semanticSurfaceTypeIds,
    blueprint,
    objectGeometry.semanticSurfaces,
    runtime.semanticSurfaceTypeIds,
  )

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('shaderObjectId', new THREE.BufferAttribute(shaderObjectIds, 1))
  geometry.setAttribute('semanticSurfaceTypeId', new THREE.BufferAttribute(semanticSurfaceTypeIds, 1))
  setSelectionFaceIndexAttribute(geometry, blueprint)
}

export function applyStandaloneGeometryAttributes(
  geometry: THREE.BufferGeometry,
  blueprint: ObjectGeometryBlueprint,
  runtime: LayerState,
  objectKey: string,
) {
  const vertexCount = geometry.getAttribute('position')?.count ?? 0
  const shaderObjectId = getShaderObjectId(runtime, objectKey)
  const shaderObjectIds = new Float32Array(vertexCount)
  shaderObjectIds.fill(shaderObjectId)
  geometry.setAttribute('shaderObjectId', new THREE.BufferAttribute(shaderObjectIds, 1))
  setSelectionFaceIndexAttribute(geometry, blueprint)
}

export function setSelectionFaceIndexAttribute(
  geometry: THREE.BufferGeometry,
  blueprint: ObjectGeometryBlueprint,
) {
  const vertexCount = geometry.getAttribute('position')?.count ?? 0
  const selectionFaceIndices = new Float32Array(vertexCount)
  selectionFaceIndices.fill(-1)

  blueprint.polygonTriangleIndices.forEach((polygonIndices, faceIndex) => {
    for (const vertexIndex of polygonIndices) {
      selectionFaceIndices[vertexIndex] = faceIndex
    }
  })

  geometry.setAttribute('selectionFaceIndex', new THREE.BufferAttribute(selectionFaceIndices, 1))
}

export function fillSemanticSurfaceAttributes(
  semanticSurfaceTypeIds: Float32Array,
  blueprint: ObjectGeometryBlueprint,
  semanticSurfaces: Array<ViewerSemanticSurface | null>,
  semanticSurfaceTypeIdsByKey: Map<string, number>,
) {
  blueprint.polygonTriangleIndices.forEach((polygonIndices, faceIndex) => {
    const surface = semanticSurfaces[faceIndex]
    const surfaceTypeId = surface
      ? semanticSurfaceTypeIdsByKey.get(semanticSurfaceTypeKey(surface.type)) ?? 0
      : 0

    for (const vertexIndex of polygonIndices) {
      semanticSurfaceTypeIds[vertexIndex] = surfaceTypeId
    }
  })
}

export function resolveInitialBatchedObjectColor(runtime: LayerState, item: BatchBuildItem) {
  if (runtime.appearanceMode === 'semantic') {
    return '#ffffff'
  }

  const attributeColor = runtime.attributeColor
  if (attributeColor?.mode === 'direct') {
    return attributeColor.directColorsByObjectKey?.[item.key] ?? attributeColor.missingColor
  }

  if (attributeColor?.mode === 'continuous') {
    return '#ffffff'
  }

  return runtime.theme === 'light' ? item.baseColorLight : item.baseColorDark
}

export function addStandaloneObjectMesh(
  runtime: LayerState,
  data: ViewerDataset,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
  draftVertices: VertexInput,
  featureCenter: Vec3,
  renderKey: string,
) {
  const { blueprint, geometry, material } = buildObjectMeshPresentation(
    runtime,
    feature,
    object,
    objectGeometry,
    draftVertices,
    featureCenter,
  )
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(
    featureCenter[0] - data.center[0],
    featureCenter[1] - data.center[1],
    featureCenter[2] - data.center[2],
  )
  mesh.userData = {
    featureId: feature.id,
    objectId: object.id,
    objectType: object.type,
    hasRenderableChildren: object.hasRenderableChildren,
    geometryIndex: objectGeometry.index,
    featureCenter,
    baseColorLight: baseColorForType(object.type, 'light'),
    baseColorDark: baseColorForType(object.type, 'dark'),
    triangleFaceIndices: geometry.userData.triangleFaceIndices,
    geometryBlueprint: blueprint,
  }
  runtime.meshesByRenderKey.set(renderKey, mesh)
  const featureMeshes = runtime.meshesByFeatureId.get(feature.id)
  if (featureMeshes) {
    featureMeshes.push(mesh)
  } else {
    runtime.meshesByFeatureId.set(feature.id, [mesh])
  }
  runtime.rootGroup.add(mesh)
}

export function getBatchTileKey(center: Vec3, data: ViewerDataset) {
  const gridDimension = Math.max(1, Math.ceil(Math.sqrt(data.features.length / BATCH_TARGET_OBJECT_COUNT)))
  const spanX = Math.max(data.extent[3] - data.extent[0], 0.000001)
  const spanY = Math.max(data.extent[4] - data.extent[1], 0.000001)
  const x = Math.min(
    gridDimension - 1,
    Math.max(0, Math.floor(((center[0] - data.extent[0]) / spanX) * gridDimension)),
  )
  const y = Math.min(
    gridDimension - 1,
    Math.max(0, Math.floor(((center[1] - data.extent[1]) / spanY) * gridDimension)),
  )
  return `${x}:${y}`
}

export function buildSpatialBatches(
  runtime: LayerState,
  data: ViewerDataset,
  items: BatchBuildItem[],
) {
  if (items.length === 0) {
    return
  }

  const chunks = measurePerformance('cjvis:viewport:batch:chunk-items', () => chunkBatchItems(items))
  const identity = new THREE.Matrix4()
  const translation = new THREE.Matrix4()
  const color = new THREE.Color()
  let allocateBatchDuration = 0
  let addGeometryDuration = 0
  let addInstanceDuration = 0
  let recordBatchDuration = 0
  let computeBoundsDuration = 0

  for (const chunk of chunks) {
    const maxInstanceCount = chunk.length
    const maxVertexCount = chunk.reduce((sum, item) => sum + item.vertexCount, 0)
    const maxIndexCount = chunk.reduce((sum, item) => sum + item.indexCount, 0)
    if (maxInstanceCount === 0 || maxVertexCount === 0 || maxIndexCount === 0) {
      for (const item of chunk) {
        item.geometry.dispose()
      }
      continue
    }

    let startedAt = nowPerformance()
    const batch = new THREE.BatchedMesh(
      maxInstanceCount,
      maxVertexCount,
      maxIndexCount,
      createBatchMaterial(
        getBatchColorMode(runtime),
        runtime.attributeColorSharedUniforms,
        runtime.semanticSurfaceSharedUniforms,
        runtime.selectionTintUniforms,
        runtime.normalColorUniforms,
      ),
    )
    allocateBatchDuration += nowPerformance() - startedAt
    batch.perObjectFrustumCulled = true
    batch.sortObjects = false
    batch.userData.recordsByInstanceId = new Map<number, BatchedObjectRecord>()
    runtime.batchedMeshes.push(batch)
    runtime.rootGroup.add(batch)

    for (const item of chunk) {
      startedAt = nowPerformance()
      const geometryId = batch.addGeometry(item.geometry)
      addGeometryDuration += nowPerformance() - startedAt

      startedAt = nowPerformance()
      const instanceId = batch.addInstance(geometryId)
      translation.copy(identity)
      translation.setPosition(
        item.featureCenter[0] - data.center[0],
        item.featureCenter[1] - data.center[1],
        item.featureCenter[2] - data.center[2],
      )
      batch.setMatrixAt(instanceId, translation)
      batch.setColorAt(instanceId, color.set(resolveInitialBatchedObjectColor(runtime, item)))
      addInstanceDuration += nowPerformance() - startedAt

      startedAt = nowPerformance()
      const record: BatchedObjectRecord = {
        key: item.key,
        featureId: item.featureId,
        objectId: item.objectId,
        objectType: item.objectType,
        hasRenderableChildren: item.hasRenderableChildren,
        geometryIndex: item.geometryIndex,
        featureCenter: item.featureCenter,
        baseColorLight: item.baseColorLight,
        baseColorDark: item.baseColorDark,
        triangleFaceIndices: item.triangleFaceIndices,
        blueprint: item.blueprint,
        batch,
        instanceId,
        geometryId,
      }
      ;(batch.userData.recordsByInstanceId as Map<number, BatchedObjectRecord>).set(instanceId, record)
      runtime.batchedObjectsByRenderKey.set(item.renderKey, record)
      const featureRecords = runtime.batchedObjectsByFeatureId.get(item.featureId)
      if (featureRecords) {
        featureRecords.push(record)
      } else {
        runtime.batchedObjectsByFeatureId.set(item.featureId, [record])
      }
      item.geometry.dispose()
      recordBatchDuration += nowPerformance() - startedAt
    }

    startedAt = nowPerformance()
    batch.computeBoundingSphere()
    batch.computeBoundingBox()
    computeBoundsDuration += nowPerformance() - startedAt
  }

  recordPerformanceMeasure('cjvis:viewport:batch:allocate-meshes', allocateBatchDuration)
  recordPerformanceMeasure('cjvis:viewport:batch:add-geometries', addGeometryDuration)
  recordPerformanceMeasure('cjvis:viewport:batch:add-instances', addInstanceDuration)
  recordPerformanceMeasure('cjvis:viewport:batch:record-objects', recordBatchDuration)
  recordPerformanceMeasure('cjvis:viewport:batch:compute-bounds', computeBoundsDuration)
}

export function chunkBatchItems(items: BatchBuildItem[]) {
  const chunks: BatchBuildItem[][] = []
  const itemsByTile = new Map<string, BatchBuildItem[]>()

  for (const item of items) {
    const tileItems = itemsByTile.get(item.tileKey)
    if (tileItems) {
      tileItems.push(item)
    } else {
      itemsByTile.set(item.tileKey, [item])
    }
  }

  for (const tileItems of itemsByTile.values()) {
    let current: BatchBuildItem[] = []
    let vertexCount = 0
    let indexCount = 0

    const flush = () => {
      if (current.length > 0) {
        chunks.push(current)
        current = []
        vertexCount = 0
        indexCount = 0
      }
    }

    for (const item of tileItems) {
      const exceedsObjectLimit = current.length >= BATCH_MAX_OBJECT_COUNT
      const exceedsVertexLimit = current.length > 0 && vertexCount + item.vertexCount > BATCH_MAX_VERTEX_COUNT
      const exceedsIndexLimit = current.length > 0 && indexCount + item.indexCount > BATCH_MAX_INDEX_COUNT
      if (exceedsObjectLimit || exceedsVertexLimit || exceedsIndexLimit) {
        flush()
      }

      current.push(item)
      vertexCount += item.vertexCount
      indexCount += item.indexCount
    }

    flush()
  }

  return chunks
}

export function getBatchColorMode(runtime: LayerState): BatchColorMode {
  if (runtime.appearanceMode === 'semantic') {
    return 'semantic'
  }

  if (runtime.attributeColor?.mode === 'continuous') {
    return 'continuous-attribute'
  }

  return 'base'
}

export function syncBatchMaterials(runtime: LayerState) {
  const mode = getBatchColorMode(runtime)
  for (const batch of runtime.batchedMeshes) {
    const currentMaterials = Array.isArray(batch.material) ? batch.material : [batch.material]
    const currentMode = currentMaterials[0]?.userData.batchColorMode as BatchColorMode | undefined
    if (currentMode === mode) {
      continue
    }

    for (const material of currentMaterials) {
      material.dispose()
    }
    batch.material = createBatchMaterial(
      mode,
      runtime.attributeColorSharedUniforms,
      runtime.semanticSurfaceSharedUniforms,
      runtime.selectionTintUniforms,
      runtime.normalColorUniforms,
    )
  }
}

export function syncRuntimeAttributeColor(
  runtime: LayerState,
  attributeColor: ViewerAttributeColorState | null,
) {
  const previousAttributeColor = runtime.attributeColor
  const previousValuesByObjectKey = previousAttributeColor?.valuesByObjectKey ?? null
  runtime.attributeColor = attributeColor
  syncAttributeColorSharedUniforms(runtime.attributeColorSharedUniforms, attributeColor)
  syncBatchMaterials(runtime)

  if (
    attributeColor?.mode === 'continuous' &&
    (
      previousAttributeColor?.mode !== 'continuous' ||
      previousValuesByObjectKey !== attributeColor.valuesByObjectKey
    )
  ) {
    syncBatchedAttributeValueTexture(runtime, attributeColor)
  }

  if (
    attributeColor &&
    (
      runtime.preparedAttributeColorValuesByObjectKey !== attributeColor.valuesByObjectKey ||
      previousAttributeColor?.directColorsByObjectKey !== attributeColor.directColorsByObjectKey ||
      previousValuesByObjectKey == null
    )
  ) {
    applyAttributeColorToScene(runtime)
    runtime.preparedAttributeColorValuesByObjectKey = attributeColor.valuesByObjectKey
  }
}

export function getRenderedGeometryTarget(
  runtime: LayerState,
  objectKey: string,
  geometryIndex: number,
) {
  const renderKey = renderedGeometryKey(objectKey, geometryIndex)
  return {
    mesh: runtime.meshesByRenderKey.get(renderKey),
    batchedRecord: runtime.batchedObjectsByRenderKey.get(renderKey),
  }
}

export function replaceBatchedRecordGeometry(
  runtime: LayerState,
  record: BatchedObjectRecord,
  objectGeometry: ViewerObjectGeometry,
  objectKey: string,
  blueprint: ObjectGeometryBlueprint,
) {
  const nextGeometry = buildUngroupedObjectGeometry(blueprint)
  applyBatchGeometryAttributes(
    nextGeometry,
    blueprint,
    runtime,
    objectGeometry,
    objectKey,
  )
  try {
    const batch = record.batch
    const range = batch.getGeometryRangeAt(record.geometryId)!
    const vertexCount = nextGeometry.getAttribute('position').count
    const indexCount = nextGeometry.getIndex()!.count
    if (vertexCount <= range.reservedVertexCount && indexCount <= range.reservedIndexCount) {
      batch.setGeometryAt(record.geometryId, nextGeometry)
    } else {
      // A coordinate edit can change triangulation and require more vertices.
      // Keep the instance (and its transform, colour and visibility), but give it
      // a new geometry reservation before retiring the old one.
      const reservedVertexCount = Math.max(vertexCount, range.reservedVertexCount)
      const reservedIndexCount = Math.max(indexCount, range.reservedIndexCount)
      const extraVertices = Math.max(0, reservedVertexCount - batch.unusedVertexCount)
      const extraIndices = Math.max(0, reservedIndexCount - batch.unusedIndexCount)
      if (extraVertices > 0 || extraIndices > 0) {
        batch.setGeometrySize(
          batch.geometry.getAttribute('position').count + extraVertices,
          batch.geometry.getIndex()!.count + extraIndices,
        )
      }
      const previousGeometryId = record.geometryId
      const nextGeometryId = batch.addGeometry(nextGeometry, reservedVertexCount, reservedIndexCount)
      batch.setGeometryIdAt(record.instanceId, nextGeometryId)
      record.geometryId = nextGeometryId
      batch.deleteGeometry(previousGeometryId)
      // Reclaim the retired reservation so repeated edits do not leave holes.
      batch.optimize()
    }
    record.triangleFaceIndices = nextGeometry.userData.triangleFaceIndices
    record.blueprint = blueprint
    record.geometryIndex = objectGeometry.index
    record.batch.computeBoundingSphere()
    record.batch.computeBoundingBox()
  } finally {
    nextGeometry.dispose()
  }
}

export function rebuildFeatureGeometry(
  runtime: LayerState,
  data: ViewerDataset,
  featureId: string,
  options: SceneBuildOptions,
  changedVertexIndex?: number,
) {
  const feature = data.features.find((candidate) => candidate.id === featureId)
  if (!feature) {
    return
  }
  const vertices = (options.verticesForFeature?.(feature) ?? feature.vertices)

  for (const object of feature.objects) {
    const objectGeometries = (options.geometriesForObject?.(feature, object) ?? resolveObjectGeometries(object, options.geometryDisplayMode))
    if (objectGeometries.length === 0) {
      continue
    }

    const objectKey = viewerObjectKey(featureId, object.id)
    for (const objectGeometry of objectGeometries) {
      if (changedVertexIndex != null) {
        let hasChangedVertex = false
        for (const vertexIndex of objectGeometry.vertexIndices) {
          if (vertexIndex === changedVertexIndex) {
            hasChangedVertex = true
            break
          }
        }
        if (!hasChangedVertex) {
          continue
        }
      }

      const { mesh, batchedRecord } = getRenderedGeometryTarget(runtime, objectKey, objectGeometry.index)
      if (!mesh && !batchedRecord) {
        continue
      }

      const center = (mesh?.userData.featureCenter as Vec3 | undefined) ?? batchedRecord?.featureCenter ?? data.center
      const nextBlueprint = buildObjectGeometryBlueprint(
        objectGeometry.polygons,
        vertices,
        center,
        collectObjectErrorFaceIndices(
          feature.errors,
          object.id,
          objectGeometry.index,
          objectGeometry.sourceFaceIndices,
        ),
      )
      if (mesh) {
        const presentation = buildObjectMeshPresentation(
          runtime, feature, object, objectGeometry, vertices, center, nextBlueprint,
        )
        mesh.geometry.dispose()
        for (const material of new Set(Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
          material.dispose()
        }
        mesh.geometry = presentation.geometry
        mesh.material = presentation.material
        mesh.userData.triangleFaceIndices = presentation.geometry.userData.triangleFaceIndices
        mesh.userData.geometryBlueprint = presentation.blueprint
        mesh.userData.geometryIndex = objectGeometry.index
      } else if (batchedRecord) {
        replaceBatchedRecordGeometry(runtime, batchedRecord, objectGeometry, objectKey, nextBlueprint)
      }
    }
  }
}

export function buildObjectMeshPresentation(
  runtime: LayerState,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
  vertices: VertexInput,
  featureCenter: Vec3,
  existingBlueprint?: ObjectGeometryBlueprint,
) {
  const blueprint = existingBlueprint ?? buildObjectGeometryBlueprint(
    objectGeometry.polygons,
    vertices,
    featureCenter,
    collectObjectErrorFaceIndices(
      feature.errors,
      object.id,
      objectGeometry.index,
      objectGeometry.sourceFaceIndices,
    ),
  )
  const { faceGroups, groupColors } = resolveObjectFaceGroups(runtime, feature, object, objectGeometry)
  const geometry = buildGroupedObjectGeometry(blueprint, faceGroups)
  const objectKey = viewerObjectKey(feature.id, object.id)
  applyStandaloneGeometryAttributes(geometry, blueprint, runtime, objectKey)
  const semanticMode = runtime.appearanceMode === 'semantic'
  const baseMaterial = createMaterial(object.type, runtime.theme, semanticMode)
  applySelectionTintToMaterial(baseMaterial, runtime.selectionTintUniforms, semanticMode)
  applyAttributeColorToMaterial(
    baseMaterial,
    runtime.attributeColor,
    runtime.attributeColor?.valuesByObjectKey[objectKey] ?? null,
    runtime.attributeColor?.directColorsByObjectKey?.[objectKey] ?? null,
    runtime.attributeColorSharedUniforms,
    runtime.selectionTintUniforms,
  )
  const materials = buildMaterialArray(
    baseMaterial,
    groupColors,
    semanticMode ? createSemanticMaterial : createErrorMaterial,
  )
  for (const material of materials) {
    applySelectionTintToMaterial(
      material,
      runtime.selectionTintUniforms,
      Boolean(material.userData.isSemantic || material.userData.isSemanticBase),
    )
    applyNormalColorToMaterial(material, runtime.normalColorUniforms)
  }

  return {
    blueprint,
    geometry,
    material: materials.length > 1 ? materials : baseMaterial,
  }
}

export function resolveObjectFaceGroups(
  runtime: LayerState,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
) {
  return runtime.appearanceMode === 'semantic'
    ? computeFaceSemanticGroups(objectGeometry.semanticSurfaces)
    : computeFaceErrorGroups(feature.errors, object.id, objectGeometry.index, objectGeometry.sourceFaceIndices)
}

export function collectObjectErrorFaceIndices(
  errors: ViewerValidationError[],
  objectId: string,
  geometryIndex: number,
  sourceFaceIndices: IndexArray,
) {
  const faceIndices = new Set<number>()

  for (const error of errors) {
    if (
      error.cityObjectId !== objectId ||
      error.faceIndex == null ||
      (error.geometryIndex != null && error.geometryIndex !== geometryIndex)
    ) {
      continue
    }

    const currentFaceIndex = getCurrentFaceIndexForSourceFace(sourceFaceIndices, error.faceIndex)
    if (currentFaceIndex != null) {
      faceIndices.add(currentFaceIndex)
    }
  }

  return faceIndices
}

export function syncBatchedAttributeValueTexture(
  runtime: LayerState,
  attributeColor: ViewerAttributeColorState | null,
) {
  const objectCount = Math.max(runtime.nextShaderObjectId, 1)
  const textureSize = Math.max(1, Math.ceil(Math.sqrt(objectCount)))
  const data = new Float32Array(textureSize * textureSize * 4)

  if (attributeColor?.mode === 'continuous') {
    for (const [objectKey, objectId] of runtime.shaderObjectIdsByObjectKey.entries()) {
      const offset = objectId * 4
      const value = attributeColor.valuesByObjectKey[objectKey]
      data[offset] = value ?? 0
      data[offset + 1] = value == null ? 0 : 1
    }
  }

  const texture = new THREE.DataTexture(data, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true

  const previousTexture = runtime.attributeColorSharedUniforms.valueMap.value
  runtime.attributeColorSharedUniforms.valueMap.value = texture
  runtime.attributeColorSharedUniforms.valueMapSize.value.set(textureSize, textureSize)
  previousTexture.dispose()
}

export function resolveBatchedObjectColor(
  runtime: LayerState,
  record: BatchedObjectRecord,
) {
  const attributeColor = runtime.attributeColor
  if (attributeColor) {
    if (attributeColor.mode === 'direct') {
      return attributeColor.directColorsByObjectKey?.[record.key] ?? attributeColor.missingColor
    }

    return '#ffffff'
  }

  if (runtime.appearanceMode === 'semantic') {
    return '#ffffff'
  }

  return runtime.theme === 'light' ? record.baseColorLight : record.baseColorDark
}

export function resolveObjectHit(hit: THREE.Intersection) {
  const batchId = (hit as THREE.Intersection & { batchId?: number }).batchId
  if (typeof batchId === 'number' && hit.object instanceof THREE.BatchedMesh) {
    const recordsByInstanceId = hit.object.userData.recordsByInstanceId as Map<number, BatchedObjectRecord> | undefined
    const record = recordsByInstanceId?.get(batchId) ?? null
    if (!record) {
      return null
    }

    const geometryRange = hit.object.getGeometryRangeAt(record.geometryId)
    if (!geometryRange) {
      return null
    }
    const localFaceIndex = typeof hit.faceIndex === 'number'
      ? hit.faceIndex - Math.floor((geometryRange.start ?? 0) / 3)
      : null
    const faceIndex =
      localFaceIndex != null && localFaceIndex >= 0
        ? record.triangleFaceIndices[localFaceIndex] ?? null
        : null
    return {
      key: record.key,
      featureId: record.featureId,
      objectId: record.objectId,
      geometryIndex: record.geometryIndex,
      faceIndex,
    }
  }

  if (hit.object instanceof THREE.Mesh) {
    const triangleFaceIndices = (hit.object.userData.triangleFaceIndices as TriangleFaceIndices | undefined) ?? []
    const featureId = hit.object.userData.featureId as string | undefined
    const objectId = hit.object.userData.objectId as string | undefined
    if (!featureId || !objectId) {
      return null
    }

    return {
      key: viewerObjectKey(featureId, objectId),
      featureId,
      objectId,
      geometryIndex: hit.object.userData.geometryIndex as number | null | undefined,
      faceIndex:
        typeof hit.faceIndex === 'number'
          ? triangleFaceIndices[hit.faceIndex] ?? null
          : null,
    }
  }

  return null
}

