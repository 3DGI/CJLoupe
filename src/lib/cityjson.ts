import * as io from '../modules/cityjson-core/io'
import type { CityJsonParseOptions } from '../modules/cityjson-core/parse'
import * as core from '../modules/cityjson-core/parse'
import type { CityJsonHeader } from '../modules/cityjson-core/source-types'
import { applyVal3dityExtensionValidation, createVal3dityExtensionSource, getDisplayCityObjectAttributes, hasVal3dityReport, parseValidationReport } from './cityjson-validation'
import { CJLOUPE_VIEWER_STATE_PROPERTY, VIEWER_STATE_VERSION } from './viewer-state-schema'
export { classifyJsonFile } from '../modules/cityjson-core/io'
export { combineViewerDatasets } from '../modules/cityjson-core/parse'
export * from './cityjson-validation'

const appParsing: CityJsonParseOptions = {
  onFeature: (feature, objects, header) => applyVal3dityExtensionValidation(feature, objects, hasVal3dityReport(header)),
  objectAttributes: getDisplayCityObjectAttributes,
  onDataset(dataset, header) {
    const state = readEmbeddedViewerState(header)
    return {
      ...dataset,
      validationSource: createVal3dityExtensionSource(header, dataset.features, dataset.sourceName),
      sources: dataset.sources.map(source => ({ ...source, embeddedViewerState: state.state, embeddedViewerStateError: state.error, embeddedSourceName: state.sourceName })),
    }
  },
}
export function parseCityJson(text: string, sourceName: string) { return core.parseCityJson(text, sourceName, appParsing) }
export function parseCityJsonSequence(text: string, sourceName: string) { return core.parseCityJsonSequence(text, sourceName, appParsing) }
export function loadCityJsonFromUrl(url: string, sourceName: string, options?: { cityJsonKind?: 'auto' | 'document' | 'sequence'; signal?: AbortSignal }) {
  return io.loadCityJsonFromUrl(url, sourceName, { ...appParsing, ...options })
}
export function loadCityJsonFromFile(file: File, options?: { cityJsonKind?: 'auto' | 'document' | 'sequence' }) {
  return io.loadCityJsonFromFile(file, { ...appParsing, ...options })
}
export function loadCityJsonSequenceFromUrl(url: string, sourceName: string) { return loadCityJsonFromUrl(url, sourceName, { cityJsonKind: 'sequence' }) }
export function loadCityJsonSequenceFromFile(file: File) { return loadCityJsonFromFile(file, { cityJsonKind: 'sequence' }) }
export async function loadValidationReportFromUrl(url: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(url, { signal: options?.signal })
  if (!response.ok) throw new Error(`Could not fetch validation report from ${url}.`)
  const sourceText = await response.text()
  return { annotations: parseValidationReport(sourceText), sourceText }
}
export async function loadValidationReportFromFile(file: File) {
  const sourceText = await io.readFileText(file)
  return { annotations: parseValidationReport(sourceText), sourceText }
}

function readEmbeddedViewerState(header: CityJsonHeader | null) {
  if (!header || !(CJLOUPE_VIEWER_STATE_PROPERTY in header)) {
    return { state: null, error: null, sourceName: null }
  }

  const value = header[CJLOUPE_VIEWER_STATE_PROPERTY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { state: null, error: 'The CityJSON file contains an invalid CJLoupe viewer-state block.', sourceName: null }
  }

  const candidate = value as Record<string, unknown>
  if (candidate.version === VIEWER_STATE_VERSION &&
    candidate.encoding === 'base64url' &&
    typeof candidate.state === 'string') {
    return {
      state: candidate.state,
      error: null,
      sourceName: typeof candidate.sourceName === 'string' && candidate.sourceName.length <= 512
        ? candidate.sourceName
        : null,
    }
  }
  return {
    state: null,
    error: 'The CityJSON file contains an unsupported CJLoupe viewer-state block.',
    sourceName: null,
  }
}
