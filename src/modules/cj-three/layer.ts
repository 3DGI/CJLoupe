import * as THREE from 'three'
import type { Vec3, ViewerDataset, ViewerGeometryDisplayMode } from '../cityjson-core/types'
import type { ViewerAttributeColorState } from '../colors/types'
import { getGeometryDisplayModeKey } from '../cityjson-core/geometry'
import { createAttributeColorSharedUniforms, createNormalColorUniforms, createSelectionTintUniforms, createSemanticSurfaceSharedUniforms } from './materials'
import type { SceneBuildOptions } from './scene'
import { clearLayerGeometry, rebuildFeatureGeometry, rebuildScene, resolveBatchedObjectColor, resolveObjectHit, syncRuntimeAttributeColor } from './scene'
import type { LayerState, Theme, ViewerAppearanceMode } from './types'

export function createLayerState(options: { theme?: Theme; appearanceMode?: ViewerAppearanceMode; attributeColor?: ViewerAttributeColorState | null } = {}): LayerState {
  return {
    rootGroup: new THREE.Group(),
    meshesByRenderKey: new Map(), meshesByFeatureId: new Map(), batchedMeshes: [],
    batchedObjectsByRenderKey: new Map(), batchedObjectsByFeatureId: new Map(),
    sceneScale: 1, theme: options.theme ?? 'light',
    appearanceMode: options.appearanceMode === 'normal' ? 'regular' : options.appearanceMode ?? 'regular',
    attributeColor: options.attributeColor ?? null,
    attributeColorSharedUniforms: createAttributeColorSharedUniforms(),
    normalColorUniforms: createNormalColorUniforms(options.appearanceMode ?? 'regular'),
    selectionTintUniforms: createSelectionTintUniforms(),
    semanticSurfaceSharedUniforms: createSemanticSurfaceSharedUniforms(),
    semanticSurfaceTypeIds: new Map(), shaderObjectIdsByObjectKey: new Map(), nextShaderObjectId: 1,
    preparedAttributeColorValuesByObjectKey: null,
  }
}

/** Does not schedule a frame: the host owns rendering and any preview throttling. */
export function previewColorDomain(state: LayerState, domain: { min: number; max: number }) {
  if (state.attributeColor?.mode !== 'continuous' || !Number.isFinite(domain.min) || !Number.isFinite(domain.max)) return false
  state.attributeColorSharedUniforms.min.value = domain.min
  state.attributeColorSharedUniforms.max.value = domain.max
  return true
}

export type CityLayerOptions = {
  theme?: Theme
  appearanceMode?: ViewerAppearanceMode
  geometryDisplayMode?: ViewerGeometryDisplayMode
  /** World-coordinate origin of the host scene. Defaults to the dataset center. */
  origin?: Vec3
  onChange?: () => void
}

/** A renderable layer. The caller owns the scene, camera, renderer and frame loop. */
export function createCityLayer(options: CityLayerOptions = {}) {
  const state = createLayerState(options)
  let dataset: ViewerDataset | null = null
  let disposed = false
  const build: SceneBuildOptions = { geometryDisplayMode: options.geometryDisplayMode ?? { kind: 'best' } }
  const changed = () => options.onChange?.()
  const assertActive = () => { if (disposed) throw new Error('City layer has been disposed.') }
  const applyVisibility = () => {
    for (const mesh of state.meshesByRenderKey.values()) mesh.visible = build.geometryDisplayMode.kind !== 'best' || !mesh.userData.hasRenderableChildren
    for (const record of state.batchedObjectsByRenderKey.values()) record.batch.setVisibleAt(record.instanceId, build.geometryDisplayMode.kind !== 'best' || !record.hasRenderableChildren)
  }
  const rebuild = () => {
    if (dataset) rebuildScene(state, dataset, build)
    applyVisibility()
    changed()
  }
  return {
    group: state.rootGroup,
    get origin(): Vec3 | null { return dataset ? [...dataset.center] : null },
    setData(data: ViewerDataset | null) {
      assertActive()
      dataset = data && options.origin ? { ...data, center: [...options.origin] } : data
      if (!dataset) clearLayerGeometry(state)
      rebuild()
    },
    setGeometryDisplayMode(mode: ViewerGeometryDisplayMode) {
      assertActive()
      if (getGeometryDisplayModeKey(build.geometryDisplayMode) === getGeometryDisplayModeKey(mode)) return
      build.geometryDisplayMode = mode
      rebuild()
    },
    setAppearance(mode: ViewerAppearanceMode) {
      assertActive()
      state.normalColorUniforms.enabled.value = mode === 'normal' ? 1 : 0
      const next = mode === 'normal' ? 'regular' : mode
      if (state.appearanceMode !== next) { state.appearanceMode = next; rebuild() }
      else changed()
    },
    setTheme(theme: Theme) {
      assertActive()
      if (state.theme === theme) return
      state.theme = theme
      rebuild()
    },
    setAttributeColors(colors: ViewerAttributeColorState | null) {
      assertActive()
      const { batchColorsChanged } = syncRuntimeAttributeColor(state, colors)
      if (batchColorsChanged) {
        const color = new THREE.Color()
        for (const record of state.batchedObjectsByRenderKey.values()) record.batch.setColorAt(record.instanceId, color.set(resolveBatchedObjectColor(state, record)))
      }
      changed()
    },
    previewColorDomain(domain: { min: number; max: number }) {
      assertActive(); if (previewColorDomain(state, domain)) changed()
    },
    /** Refresh a committed model change; editing and undo remain host responsibilities. */
    updateFeature(featureId: string, changedVertexIndex?: number) {
      assertActive()
      if (dataset) rebuildFeatureGeometry(state, dataset, featureId, build, changedVertexIndex)
      changed()
    },
    pick(raycaster: THREE.Raycaster) {
      assertActive()
      state.rootGroup.updateMatrixWorld(true)
      const objects = [...state.meshesByRenderKey.values(), ...state.batchedMeshes].filter(object => object.visible)
      for (const hit of raycaster.intersectObjects(objects, false)) {
        const target = resolveObjectHit(hit)
        if (target) return { ...target, point: hit.point, distance: hit.distance }
      }
      return null
    },
    dispose() {
      if (disposed) return
      clearLayerGeometry(state)
      state.attributeColorSharedUniforms.valueMap.value.dispose()
      state.rootGroup.removeFromParent()
      dataset = null
      disposed = true
    },
  }
}

export type CityLayer = ReturnType<typeof createCityLayer>
