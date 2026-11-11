import type { PolygonRings } from '../../modules/cityjson-core/types'

import faceSelectIconUrl from '@/assets/blender-icons/facesel.svg'
import restrictSelectOffIconUrl from '@/assets/blender-icons/restrict_select_off.svg'
import restrictSelectOnIconUrl from '@/assets/blender-icons/restrict_select_on.svg'
import vertexSelectIconUrl from '@/assets/blender-icons/vertexsel.svg'
import type { ThemeMode } from '@/components/theme-context'
import type { Val3dityValidationOptions } from '@/lib/val3dity-wasm'
import {
  VIEWER_STATE_QUERY_PARAM
} from '@/lib/viewer-state'
import type {
  Vec3,
  ViewerAppearanceMode,
  ViewerCityObject,
  ViewerDataset,
  ViewerFeature,
  ViewerObjectGeometry,
  ViewerPickingMode,
  ViewerValidationError
} from '@/types/cityjson'
import packageJson from '../../../package.json'


export const VAL3DITY_ERRORS_URL = 'https://val3dity.readthedocs.io/2.6.0/errors/'
export const GITHUB_REPO_URL = 'https://github.com/3DGI/CJLoupe'
export const APP_VERSION = packageJson.version
export const CAMERA_FOLLOW_QUERY_PARAM = 'cameraFollow'
export const DEFAULT_CAMERA_FOCAL_LENGTH = 50
export const BAG_BUILDING_ID_PREFIX = 'NL.IMBAG.Pand.'
export const DEFAULT_VAL3DITY_PARAMETERS: Val3dityParameterForm = {
  tolSnap: '0.001',
  planarityD2pTol: '0.01',
  planarityNTol: '20.0',
  overlapTol: '-1.0',
  primitive: 'Solid',
}

export type DetailPaneMode = 'split' | 'collapsed' | 'fullscreen'
export type MobileInspectMode = 'object' | 'surface'
export type MobilePanelView = 'features' | 'details'
export type InfoPanelSection = 'pinned' | 'attribute' | 'semantic'
export type Val3dityPrimitiveOption = 'auto' | 'Solid' | 'MultiSurface' | 'CompositeSurface'
export type Val3dityParameterForm = {
  tolSnap: string
  planarityD2pTol: string
  planarityNTol: string
  overlapTol: string
  primitive: Val3dityPrimitiveOption
}
export type HelpItem = { keys: string; description: string }
export const VIEW_PICKING_MODES: ViewerPickingMode[] = ['none', 'object', 'face']
export const EDIT_PICKING_MODES: ViewerPickingMode[] = ['none', 'face', 'vertex']
export const VIEWER_APPEARANCE_MODES: ViewerAppearanceMode[] = ['regular', 'semantic', 'normal', 'colormap']

export const FEATURE_LIST_ROW_HEIGHT = 58
export const CITY_OBJECT_TREE_ROW_HEIGHT = 32
export const CITY_OBJECT_TREE_ROW_GAP = 4
export const FEATURE_SEPARATOR_HEIGHT_ESTIMATE = 18
export const FEATURE_LIST_ROW_GAP = 6
export const FEATURE_LIST_TOP_PADDING = 8
export const FEATURE_LIST_BOTTOM_PADDING = 12
export const FEATURE_LIST_OVERSCAN = 6
export const OBJECT_LIST_VISIBILITY_INSET = 4
export const EMPTY_CITY_OBJECTS: ViewerCityObject[] = []
export const EMPTY_ATTRIBUTES: Record<string, unknown> = {}
export type FeatureListItem = {
  feature: ViewerFeature
  objects: ViewerCityObject[]
  errorCountsByObjectId: Map<string, number>
  errorCount: number
  isInvalid: boolean
  searchText: string
}

export type ErrorCodeFilterOption = {
  code: number
  description: string
  count: number
}

export function formatObjectDisplayId(objectId: string) {
  return objectId.startsWith(BAG_BUILDING_ID_PREFIX)
    ? objectId.slice(BAG_BUILDING_ID_PREFIX.length)
    : objectId
}

export function countDatasetObjects(dataset: ViewerDataset) {
  return dataset.features.reduce((count, feature) => count + feature.objects.length, 0)
}

export function objectSelectionKey(featureId: string, objectId?: string | null) {
  return `${featureId}::${objectId ?? ''}`
}

export function estimateFeatureListRowHeight(item: FeatureListItem, showFeatureSeparator: boolean) {
  const objectRowCount = Math.max(item.objects.length, 1)
  const objectRowsHeight =
    objectRowCount * CITY_OBJECT_TREE_ROW_HEIGHT +
    Math.max(objectRowCount - 1, 0) * CITY_OBJECT_TREE_ROW_GAP
  return showFeatureSeparator
    ? Math.max(FEATURE_LIST_ROW_HEIGHT, objectRowsHeight + FEATURE_SEPARATOR_HEIGHT_ESTIMATE)
    : objectRowsHeight
}

export function featureListRowHeightKey(item: FeatureListItem) {
  return `${item.feature.id}::${item.objects.length}::${item.errorCount}`
}

export function countErrorsByObjectId(
  errors: ViewerValidationError[],
  selectedErrorCodeSet: Set<number> | null = null,
) {
  const counts = new Map<string, number>()

  for (const error of errors) {
    if (!error.cityObjectId || (selectedErrorCodeSet !== null && !selectedErrorCodeSet.has(error.code))) {
      continue
    }

    counts.set(error.cityObjectId, (counts.get(error.cityObjectId) ?? 0) + 1)
  }

  return counts
}

export function collectTreeRootIds(objects: ViewerCityObject[], objectById: Map<string, ViewerCityObject>) {
  const roots: string[] = []
  for (const object of objects) {
    if (object.parentIds.length === 0 || object.parentIds.every((parentId) => !objectById.has(parentId))) {
      roots.push(object.id)
    }
  }

  return roots.length > 0 ? roots : objects.map((object) => object.id)
}

export function collectExpandedObjectIds(activeObjectId: string | null, objectById: Map<string, ViewerCityObject>) {
  if (!activeObjectId) {
    return new Set<string>()
  }

  const expandedIds = new Set<string>()
  const visit = (objectId: string | null | undefined) => {
    if (!objectId || expandedIds.has(objectId)) {
      return
    }

    const object = objectById.get(objectId)
    if (!object) {
      return
    }

    expandedIds.add(objectId)
    object.parentIds.forEach(visit)
  }

  visit(activeObjectId)
  return expandedIds
}

export function collectObjectAncestors(
  object: ViewerCityObject | null,
  objects: ViewerCityObject[],
) {
  if (!object || object.parentIds.length === 0) {
    return []
  }

  const objectById = new Map(objects.map((entry) => [entry.id, entry]))
  const ancestors: ViewerCityObject[] = []
  const visited = new Set<string>()

  const visit = (objectId: string) => {
    if (visited.has(objectId)) {
      return
    }

    visited.add(objectId)
    const parent = objectById.get(objectId)
    if (!parent) {
      return
    }

    ancestors.push(parent)
    parent.parentIds.forEach(visit)
  }

  object.parentIds.forEach(visit)
  return ancestors
}

export function getObjectGeometryChips(geometries: ViewerObjectGeometry[]) {
  const chips = new Map<string, { key: string; label: string }>()

  for (const geometry of geometries) {
    const label = geometry.lod ?? `g${geometry.index}`
    if (chips.has(label)) {
      continue
    }

    chips.set(label, {
      key: `${label}:${geometry.index}`,
      label,
    })
  }

  return [...chips.values()]
}

export function getObjectGeometryTypeLabel(geometries: ViewerObjectGeometry[]) {
  const types = new Set<string>()
  for (const geometry of geometries) {
    if (geometry.geometryType) {
      types.add(geometry.geometryType)
    }
  }
  const typeList = Array.from(types)

  if (typeList.length === 0) {
    return null
  }

  if (typeList.length === 1) {
    return typeList[0]
  }

  if (typeList.length === 2) {
    return `${typeList[0]} + ${typeList[1]}`
  }

  return `${typeList[0]} +${typeList.length - 1}`
}

export function getAvailablePickingModes(editMode: boolean) {
  if (editMode) return EDIT_PICKING_MODES
  return VIEW_PICKING_MODES
}

export function nextPickingMode(mode: ViewerPickingMode, editMode: boolean): ViewerPickingMode {
  const modes = getAvailablePickingModes(editMode)
  const currentIndex = modes.indexOf(mode)
  return modes[(currentIndex + 1) % modes.length] ?? modes[0]
}

export function isCityJsonFileName(name: string) {
  return (
    name.endsWith('.jsonl') ||
    name.endsWith('.city.jsonl') ||
    name.endsWith('.city.json') ||
    name.endsWith('.cityjson')
  )
}

export function tryParseHttpUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

export function buildVal3dityValidationOptions(parameters: Val3dityParameterForm): Val3dityValidationOptions {
  const options: Val3dityValidationOptions = {}
  const tolSnap = parseVal3dityParameterValue(parameters.tolSnap, 0)
  const planarityD2pTol = parseVal3dityParameterValue(parameters.planarityD2pTol, 0)
  const planarityNTol = parseVal3dityParameterValue(parameters.planarityNTol, 0)
  const overlapTol = parseVal3dityParameterValue(parameters.overlapTol, -Infinity)

  if (tolSnap != null) {
    options.tolSnap = tolSnap
  }
  if (planarityD2pTol != null) {
    options.planarityD2pTol = planarityD2pTol
  }
  if (planarityNTol != null) {
    options.planarityNTol = planarityNTol
  }
  if (overlapTol != null) {
    options.overlapTol = overlapTol
  }
  if (parameters.primitive !== 'auto') {
    options.primitive = parameters.primitive
  }

  return options
}

export function parseVal3dityParameterValue(value: string, min: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= min ? parsed : null
}

export function isValidVal3dityParameterValue(value: string, min: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= min
}

export function isValidVal3dityParameters(parameters: Val3dityParameterForm) {
  return (
    isValidVal3dityParameterValue(parameters.tolSnap, 0) &&
    isValidVal3dityParameterValue(parameters.planarityD2pTol, 0) &&
    isValidVal3dityParameterValue(parameters.planarityNTol, 0) &&
    isValidVal3dityParameterValue(parameters.overlapTol, -Infinity)
  )
}

export function getCameraFollowChannelFromUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  const channel = new URLSearchParams(window.location.search).get(CAMERA_FOLLOW_QUERY_PARAM)
  return channel && /^[a-zA-Z0-9._-]+$/.test(channel) ? channel : null
}

export function createCameraSyncChannelId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function buildCameraFollowerUrl(channel: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete('cj')
  url.searchParams.delete('val')
  url.searchParams.delete(VIEWER_STATE_QUERY_PARAM)
  url.searchParams.set(CAMERA_FOLLOW_QUERY_PARAM, channel)
  return url.toString()
}

export function getPickingModeIconUrl(mode: ViewerPickingMode) {
  switch (mode) {
    case 'none':
      return restrictSelectOnIconUrl
    case 'object':
      return restrictSelectOffIconUrl
    case 'face':
      return faceSelectIconUrl
    case 'vertex':
      return vertexSelectIconUrl
  }
}

export function getPickingModeLabel(mode: ViewerPickingMode) {
  switch (mode) {
    case 'none':
      return 'Off'
    case 'object':
      return 'Object'
    case 'face':
      return 'Face'
    case 'vertex':
      return 'Vertex'
  }
}

export function getPickingModeDescription(mode: ViewerPickingMode) {
  switch (mode) {
    case 'none':
      return 'Picking disabled'
    case 'object':
      return 'Pick object'
    case 'face':
      return 'Pick face'
    case 'vertex':
      return 'Pick vertex'
  }
}

export function getAppearanceModeLabel(mode: ViewerAppearanceMode) {
  switch (mode) {
    case 'regular':
      return 'Basic meshes'
    case 'normal':
      return 'Face normals'
    case 'semantic':
      return 'Semantic coloring'
    case 'colormap':
      return 'Attribute colormap'
  }
}

export function getThemeModeLabel(themeMode: ThemeMode) {
  switch (themeMode) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    case 'system':
      return 'Auto'
  }
}

export function formatValue(value: unknown) {
  if (value == null) {
    return '—'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3)
  }

  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function getVal3dityErrorUrl(error: ViewerValidationError) {
  const anchor = error.description
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return anchor ? `${VAL3DITY_ERRORS_URL}#${anchor}` : VAL3DITY_ERRORS_URL
}

export function formatCountLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

export function summarizeValidation(dataset: ViewerDataset) {
  const errorCountsByKey = new Map<string, {
    code: number
    description: string
    count: number
    objectIds: Set<string>
  }>()
  let validCount = 0
  let invalidCount = 0
  let totalErrorCount = 0

  for (const feature of dataset.features) {
    if (feature.validity === true) {
      validCount += 1
    } else if (feature.validity === false) {
      invalidCount += 1
    }

    for (const error of feature.errors) {
      totalErrorCount += 1
      const key = `${error.code}:${error.description}`
      const entry = errorCountsByKey.get(key)
      const objectId = error.cityObjectId ?? feature.rootObjectId
      if (entry) {
        entry.count += 1
        entry.objectIds.add(objectId)
      } else {
        errorCountsByKey.set(key, {
          code: error.code,
          description: error.description,
          count: 1,
          objectIds: new Set([objectId]),
        })
      }
    }
  }

  return {
    validCount,
    invalidCount,
    totalErrorCount,
    errorCounts: Array.from(errorCountsByKey.values())
      .map(({ objectIds, ...entry }) => ({
        ...entry,
        objectCount: objectIds.size,
      }))
      .toSorted((left, right) =>
        right.count - left.count ||
        right.objectCount - left.objectCount ||
        left.code - right.code ||
        left.description.localeCompare(right.description),
      ),
  }
}

export function parseChangelog(markdown: string): Array<{ heading: string; items: string[] }> {
  const sections: Array<{ heading: string; items: string[] }> = []
  let current: { heading: string; items: string[] } | null = null

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()

    if (line.startsWith('## ')) {
      current = { heading: line.replace(/^##\s+/, ''), items: [] }
      sections.push(current)
      continue
    }

    if (!current || !line.startsWith('- ')) {
      continue
    }

    current.items.push(line.replace(/^-\s+/, ''))
  }

  return sections.filter((section) => section.items.length > 0)
}

export function isEmptyMetadataValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.every(isEmptyMetadataValue)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isEmptyMetadataValue)
  }
  return false
}

export function formatMetadataKey(key: string) {
  const withSpaces = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase()
}

export function formatOpenFileCount(count: number) {
  return `${count} ${count === 1 ? 'file' : 'files'} open`
}

export function formatCityJsonFileTabLabel(sourceName: string, index: number, sourceCount: number) {
  if (sourceCount === 1) {
    return 'CityJSON'
  }

  return sourceName.trim() || `File ${index + 1}`
}

export function isGeographicalExtentKey(key: string | undefined) {
  return key?.toLowerCase() === 'geographicalextent'
}

export function isNumberArray(value: unknown[]): value is number[] {
  return value.every((entry) => typeof entry === 'number')
}

export function formatDimensionValue(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, '')
}

export function formatContinuousInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(8)).toString()
}

export function formatMetadataPrimitive(value: string | number | boolean | null): string {
  if (value == null) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}


export function formatCoordinateTriple(coordinates: Vec3) {
  return `${coordinates[0].toFixed(3)}, ${coordinates[1].toFixed(3)}, ${coordinates[2].toFixed(3)}`
}

export function formatDistanceValue(distance: number) {
  if (distance === 0 || distance >= 0.001) {
    return distance.toFixed(3)
  }

  const decimalPlaces = Math.min(12, Math.max(4, 2 - Math.floor(Math.log10(distance))))
  const formatted = distance.toFixed(decimalPlaces)
  return Number(formatted) === 0 ? distance.toExponential(2) : formatted
}

export function distanceBetweenPoints(left: Vec3, right: Vec3) {
  return Math.hypot(
    right[0] - left[0],
    right[1] - left[1],
    right[2] - left[2],
  )
}

export function getFaceVertexCycle(rings: PolygonRings | null, ringIndex: number) {
  const targetRing = rings?.[ringIndex] ?? []
  return [...targetRing]
}

export function getCurrentFaceIndexForSourceFace(geometry: ViewerObjectGeometry, sourceFaceIndex: number) {
  const currentFaceIndex = geometry.sourceFaceIndices.indexOf(sourceFaceIndex)
  return currentFaceIndex >= 0 ? currentFaceIndex : null
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}
