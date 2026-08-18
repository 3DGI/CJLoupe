import { strToU8, zip } from 'fflate'

import type {
  Vec3,
  ViewerAppearanceMode,
  ViewerDataset,
  ViewerDatasetSource,
  ViewerGeometryDisplayMode,
  ViewerPickingMode,
} from '@/types/cityjson'

export const VIEWER_STATE_QUERY_PARAM = 'state'
export const CJLOUPE_VIEWER_STATE_PROPERTY = '+CJLoupe-viewerState'

const VIEWER_STATE_VERSION = 1
const VIEWER_STATE_MAX_ENCODED_LENGTH = 64 * 1024

export type ViewerCameraPose = {
  kind: 'perspective' | 'orthographic'
  position: Vec3
  quaternion: [number, number, number, number]
  up: Vec3
  target: Vec3
  focalLength: number | null
  orthographicHalfHeight: number | null
}

export type ViewerShareStateV1 = {
  version: 1
  camera: ViewerCameraPose
  selection: {
    featureId: string | null
    objectId: string | null
    geometryDisplayMode: ViewerGeometryDisplayMode
    geometryIndex: number | null
    faceIndex: number | null
    faceRingIndex: number
    vertexIndex: number | null
    faceVertexEntryIndex: number | null
    semanticSurfaceSelected: boolean
  }
  appearance: {
    mode: ViewerAppearanceMode
    attributeColor: {
      key: string
      inheritsParent: boolean
      domain: { min: number; max: number } | null
      colorMapId: string
      reversed: boolean
      categoricalSeed: number
      customColors: Record<string, string>
    } | null
  }
  interaction: {
    isolateSelectedFeature: boolean
    editMode: boolean
    pickingMode: ViewerPickingMode
    hideOccludedEditEdges: boolean
    showVertexGizmo: boolean
    mobileInspectMode: 'object' | 'surface'
  }
  filters: {
    searchQuery: string
    showOnlyInvalidFeatures: boolean
    selectedErrorCodes: number[] | null
    pinnedAttributeKeys: string[]
  }
  measurement: {
    active: boolean
    points: Vec3[]
  }
}

export type ViewerShareMode = 'url' | 'file' | 'archive'

export type ViewerShareOutput =
  | { kind: 'url'; url: string }
  | { kind: 'file'; name: string; data: Blob }
  | { kind: 'archive'; name: string; data: Blob }

export type EmbeddedViewerStateResolution = {
  state: ViewerShareStateV1 | null
  warning: string | null
}

export function encodeViewerState(state: ViewerShareStateV1) {
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }

  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  if (encoded.length > VIEWER_STATE_MAX_ENCODED_LENGTH) {
    throw new Error('The current viewer state is too large to share.')
  }
  return encoded
}

export function decodeViewerState(encoded: string): ViewerShareStateV1 {
  if (!encoded || encoded.length > VIEWER_STATE_MAX_ENCODED_LENGTH) {
    throw new Error('The shared viewer state is empty or too large.')
  }

  let decoded: unknown
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    decoded = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error('The shared viewer state is not valid base64url JSON.')
  }

  if (!isRecord(decoded) || decoded.version !== VIEWER_STATE_VERSION) {
    throw new Error('This shared viewer state version is not supported.')
  }
  if (!isViewerShareStateV1(decoded)) {
    throw new Error('The shared viewer state has an invalid structure.')
  }
  return decoded
}

export function getViewerStateFromUrl(url: string): EmbeddedViewerStateResolution {
  const encoded = new URL(url).searchParams.get(VIEWER_STATE_QUERY_PARAM)
  if (!encoded) {
    return { state: null, warning: null }
  }

  try {
    return { state: decodeViewerState(encoded), warning: null }
  } catch (error) {
    return {
      state: null,
      warning: error instanceof Error ? error.message : 'Could not restore the shared viewer state.',
    }
  }
}

export function resolveEmbeddedViewerState(dataset: ViewerDataset): EmbeddedViewerStateResolution {
  const sourceWarning = dataset.sources.find((source) => source.embeddedViewerStateError)?.embeddedViewerStateError ?? null
  const encodedStates = dataset.sources
    .map((source) => source.embeddedViewerState)
    .filter((value): value is string => Boolean(value))

  if (encodedStates.length === 0) {
    return { state: null, warning: sourceWarning }
  }

  const uniqueStates = [...new Set(encodedStates)]
  if (uniqueStates.length > 1) {
    return {
      state: null,
      warning: 'The selected CityJSON files contain conflicting CJLoupe viewer states, so the default view was used.',
    }
  }

  try {
    return { state: decodeViewerState(uniqueStates[0]), warning: sourceWarning }
  } catch (error) {
    return {
      state: null,
      warning: error instanceof Error ? error.message : 'Could not restore the embedded viewer state.',
    }
  }
}

export function getViewerShareMode(dataset: ViewerDataset): ViewerShareMode {
  const validationSource = dataset.validationSource
  const validationIsReloadable = validationSource == null ||
    validationSource.sourceKind === 'embedded' ||
    validationSource.sourceKind === 'url'
  if (
    dataset.sources.length > 0 &&
    dataset.sources.every((source) => source.sourceKind === 'url') &&
    validationIsReloadable
  ) {
    return 'url'
  }

  const hasStandaloneValidation = validationSource != null && validationSource.sourceKind !== 'embedded'
  return dataset.sources.length === 1 && !hasStandaloneValidation ? 'file' : 'archive'
}

export async function createViewerShareOutput(
  dataset: ViewerDataset,
  state: ViewerShareStateV1,
  currentUrl: string,
): Promise<ViewerShareOutput> {
  const encodedState = encodeViewerState(state)
  const mode = getViewerShareMode(dataset)
  if (mode === 'url') {
    return {
      kind: 'url',
      url: buildViewerShareUrl(dataset, encodedState, currentUrl),
    }
  }

  if (mode === 'file') {
    const source = dataset.sources[0]
    if (!source) {
      throw new Error('The original CityJSON source is not available for download.')
    }
    return {
      kind: 'file',
      name: makeStateFileName(source.name, source.cityJsonKind),
      data: new Blob(
        [embedViewerStateInCityJson(source.sourceText, source.cityJsonKind, encodedState, source.name)],
        { type: source.cityJsonKind === 'CityJSONFeatures' ? 'application/x-ndjson' : 'application/json' },
      ),
    }
  }

  const files: Record<string, Uint8Array> = {}
  const usedNames = new Set<string>(['README.txt'])
  for (const source of dataset.sources) {
    const name = makeUniqueArchiveName(makeStateFileName(source.name, source.cityJsonKind), usedNames)
    files[name] = strToU8(embedViewerStateInCityJson(
      source.sourceText,
      source.cityJsonKind,
      encodedState,
      source.name,
    ))
  }

  const validationSource = dataset.validationSource
  if (validationSource && validationSource.sourceKind !== 'embedded') {
    if (!validationSource.sourceText) {
      throw new Error('The standalone validation report is not available for download.')
    }
    const reportName = makeUniqueArchiveName(makeValidationReportFileName(validationSource.name), usedNames)
    files[reportName] = strToU8(validationSource.sourceText)
  }
  files['README.txt'] = strToU8(
    'CJLoupe view bundle\n\nExtract this archive, then drag all CityJSON files and the optional val3dity report into CJLoupe together.\n',
  )

  const archive = await createZip(files)
  return {
    kind: 'archive',
    name: `${sanitizeFileStem(dataset.sourceName, 'CJLoupe-view')}.cjloupe.zip`,
    data: new Blob([
      archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer,
    ], { type: 'application/zip' }),
  }
}

export function embedViewerStateInCityJson(
  sourceText: string,
  cityJsonKind: ViewerDatasetSource['cityJsonKind'],
  encodedState: string,
  sourceName?: string,
) {
  const embedded = {
    version: VIEWER_STATE_VERSION,
    encoding: 'base64url',
    state: encodedState,
    ...(sourceName ? { sourceName } : {}),
  }

  if (cityJsonKind === 'CityJSON') {
    const document = JSON.parse(sourceText) as Record<string, unknown>
    document[CJLOUPE_VIEWER_STATE_PROPERTY] = embedded
    const indentation = detectJsonIndentation(sourceText)
    const trailingNewline = /(?:\r\n|\n|\r)$/.test(sourceText)
    return `${JSON.stringify(document, null, indentation)}${trailingNewline ? detectLineEnding(sourceText) : ''}`
  }

  const parts = sourceText.split(/(\r\n|\n|\r)/)
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    if (!line?.trim()) {
      continue
    }
    const header = JSON.parse(line) as Record<string, unknown>
    header[CJLOUPE_VIEWER_STATE_PROPERTY] = embedded
    parts[index] = JSON.stringify(header)
    return parts.join('')
  }
  throw new Error('The CityJSON sequence does not contain a header line.')
}

function buildViewerShareUrl(dataset: ViewerDataset, encodedState: string, currentUrl: string) {
  const url = new URL(currentUrl)
  url.searchParams.delete('cj')
  url.searchParams.delete('val')
  url.searchParams.delete('cameraFollow')
  url.searchParams.delete(VIEWER_STATE_QUERY_PARAM)

  for (const source of dataset.sources) {
    url.searchParams.append('cj', new URL(source.location, currentUrl).toString())
  }
  if (dataset.validationSource?.sourceKind === 'url') {
    url.searchParams.set('val', new URL(dataset.validationSource.location, currentUrl).toString())
  }
  url.searchParams.set(VIEWER_STATE_QUERY_PARAM, encodedState)
  return url.toString()
}

function createZip(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve(data)
      }
    })
  })
}

function makeStateFileName(name: string, kind: ViewerDatasetSource['cityJsonKind']) {
  const fallback = kind === 'CityJSONFeatures' ? 'dataset.city.jsonl' : 'dataset.city.json'
  const safeName = sanitizeFileName(name, fallback)
  const knownSuffixes = kind === 'CityJSONFeatures'
    ? ['.city.jsonl', '.jsonl']
    : ['.city.json', '.cityjson', '.json']
  const suffix = knownSuffixes.find((candidate) => safeName.toLowerCase().endsWith(candidate))
  if (!suffix) {
    return `${safeName}.cjloupe${kind === 'CityJSONFeatures' ? '.city.jsonl' : '.city.json'}`
  }
  return `${safeName.slice(0, -suffix.length)}.cjloupe${suffix}`
}

function makeValidationReportFileName(name: string) {
  const safeName = sanitizeFileName(name, 'val3dity-report.json')
  return safeName.toLowerCase().endsWith('.json') ? safeName : 'val3dity-report.json'
}

function sanitizeFileName(name: string, fallback: string) {
  const leaf = name.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
  const sanitized = Array.from(leaf.replace(/[<>:"|?*]/g, '_'))
    .map((character) => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .trim()
  return sanitized || fallback
}

function sanitizeFileStem(name: string, fallback: string) {
  const sanitized = sanitizeFileName(name, fallback).replace(/\.(?:city\.)?jsonl?$|\.cityjson$/i, '')
  return sanitized || fallback
}

function makeUniqueArchiveName(name: string, usedNames: Set<string>) {
  if (!usedNames.has(name)) {
    usedNames.add(name)
    return name
  }

  const dotIndex = name.indexOf('.')
  const stem = dotIndex >= 0 ? name.slice(0, dotIndex) : name
  const suffix = dotIndex >= 0 ? name.slice(dotIndex) : ''
  let counter = 2
  let candidate = `${stem}-${counter}${suffix}`
  while (usedNames.has(candidate)) {
    counter += 1
    candidate = `${stem}-${counter}${suffix}`
  }
  usedNames.add(candidate)
  return candidate
}

function detectJsonIndentation(sourceText: string): string | number | undefined {
  if (!/[\r\n]/.test(sourceText)) {
    return undefined
  }
  const match = sourceText.match(/(?:\r\n|\n|\r)([\t ]+)"/)
  return match?.[1] ?? 2
}

function detectLineEnding(sourceText: string) {
  return sourceText.includes('\r\n') ? '\r\n' : sourceText.includes('\r') ? '\r' : '\n'
}

function isViewerShareStateV1(value: Record<string, unknown>): value is ViewerShareStateV1 {
  if (!isCameraPose(value.camera) || !isRecord(value.selection) || !isRecord(value.appearance) ||
      !isRecord(value.interaction) || !isRecord(value.filters) || !isRecord(value.measurement)) {
    return false
  }

  const selection = value.selection
  const appearance = value.appearance
  const interaction = value.interaction
  const filters = value.filters
  const measurement = value.measurement
  return (
    isNullableString(selection.featureId) &&
    isNullableString(selection.objectId) &&
    isGeometryDisplayMode(selection.geometryDisplayMode) &&
    isNullableNonNegativeInteger(selection.geometryIndex) &&
    isNullableNonNegativeInteger(selection.faceIndex) &&
    isNonNegativeInteger(selection.faceRingIndex) &&
    isNullableNonNegativeInteger(selection.vertexIndex) &&
    isNullableNonNegativeInteger(selection.faceVertexEntryIndex) &&
    typeof selection.semanticSurfaceSelected === 'boolean' &&
    isAppearanceMode(appearance.mode) &&
    (appearance.attributeColor === null || isAttributeColorSettings(appearance.attributeColor)) &&
    typeof interaction.isolateSelectedFeature === 'boolean' &&
    typeof interaction.editMode === 'boolean' &&
    isPickingMode(interaction.pickingMode) &&
    typeof interaction.hideOccludedEditEdges === 'boolean' &&
    typeof interaction.showVertexGizmo === 'boolean' &&
    (interaction.mobileInspectMode === 'object' || interaction.mobileInspectMode === 'surface') &&
    typeof filters.searchQuery === 'string' &&
    typeof filters.showOnlyInvalidFeatures === 'boolean' &&
    (filters.selectedErrorCodes === null || isNumberArray(filters.selectedErrorCodes, true)) &&
    isStringArray(filters.pinnedAttributeKeys) &&
    typeof measurement.active === 'boolean' &&
    Array.isArray(measurement.points) && measurement.points.length <= 2 && measurement.points.every(isVec3)
  )
}

function isCameraPose(value: unknown): value is ViewerCameraPose {
  if (!isRecord(value)) return false
  return (
    (value.kind === 'perspective' || value.kind === 'orthographic') &&
    isVec3(value.position) &&
    isQuaternion(value.quaternion) &&
    isVec3(value.up) &&
    isVec3(value.target) &&
    isNullablePositiveNumber(value.focalLength) &&
    isNullablePositiveNumber(value.orthographicHalfHeight)
  )
}

function isAttributeColorSettings(value: unknown) {
  if (!isRecord(value)) return false
  const domain = value.domain
  const customColors = value.customColors
  return (
    typeof value.key === 'string' &&
    typeof value.inheritsParent === 'boolean' &&
    (domain === null || (isRecord(domain) && isFiniteNumber(domain.min) && isFiniteNumber(domain.max))) &&
    typeof value.colorMapId === 'string' &&
    typeof value.reversed === 'boolean' &&
    isNonNegativeInteger(value.categoricalSeed) &&
    isRecord(customColors) && Object.values(customColors).every((entry) => typeof entry === 'string')
  )
}

function isGeometryDisplayMode(value: unknown): value is ViewerGeometryDisplayMode {
  return isRecord(value) && (value.kind === 'best' || (value.kind === 'lod' && typeof value.lod === 'string'))
}

function isAppearanceMode(value: unknown): value is ViewerAppearanceMode {
  return value === 'regular' || value === 'normal' || value === 'semantic' || value === 'colormap'
}

function isPickingMode(value: unknown): value is ViewerPickingMode {
  return value === 'none' || value === 'object' || value === 'face' || value === 'vertex'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isNullableNonNegativeInteger(value: unknown) {
  return value === null || isNonNegativeInteger(value)
}

function isNullablePositiveNumber(value: unknown) {
  return value === null || (isFiniteNumber(value) && value > 0)
}

function isNullableString(value: unknown) {
  return value === null || typeof value === 'string'
}

function isVec3(value: unknown): value is Vec3 {
  return isNumberArray(value, false) && value.length === 3
}

function isQuaternion(value: unknown): value is [number, number, number, number] {
  return isNumberArray(value, false) && value.length === 4
}

function isNumberArray(value: unknown, integersOnly: boolean): value is number[] {
  return Array.isArray(value) && value.every((entry) => integersOnly ? isNonNegativeInteger(entry) : isFiniteNumber(entry))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}
