import type { CityJsonHeader, CityJsonObject } from '../modules/cityjson-core/source-types'
import type { Vec3, ViewerDataset, ViewerFeature, ViewerValidationError } from '../modules/cityjson-core/types'

export type Val3dityError = {
  code?: number
  description?: string
  id?: string
  info?: string
}

export type Val3dityFeature = {
  id?: string
  validity?: boolean
  errors?: Val3dityError[]
}

export type Val3dityReport = {
  features?: Val3dityFeature[]
}

export type ValidationAnnotations = Map<
  string,
  {
    validity: boolean
    errors: ViewerValidationError[]
  }
>

export type LoadedValidationReport = {
  annotations: ValidationAnnotations
  sourceText: string
}

export type Val3dityExtensionReport = {
  val3dityVersion?: string
  val3dity_version?: string
  validity?: boolean
  parameters?: Record<string, number | string | boolean>
  featuresOverview?: Val3dityExtensionSummary[]
  features_overview?: Val3dityExtensionSummary[]
  primitivesOverview?: Val3dityExtensionSummary[]
  primitives_overview?: Val3dityExtensionSummary[]
  errorCodeSummary?: Val3dityExtensionErrorCodeCount[]
  error_code_summary?: Val3dityExtensionErrorCodeCount[]
  datasetErrors?: Val3dityExtensionDatasetError[]
  dataset_errors?: Val3dityExtensionDatasetError[]
}

export type Val3dityExtensionSummary = {
  type?: string
  total?: number
  valid?: number
}

export type Val3dityExtensionErrorCodeCount = {
  code?: number
  count?: number
}

export type Val3dityExtensionDatasetError = {
  code?: number
  description?: string
  info?: string
  sourceId?: string
}

export type Val3dityExtensionValidation = {
  validity?: boolean
  geometries?: Val3dityExtensionGeometryValidation[]
  features?: Val3dityExtensionError[]
}

export type Val3dityExtensionGeometryValidation = {
  geometryIndex?: number
  errors?: Val3dityExtensionError[]
}

export type Val3dityExtensionError = {
  code?: number
  description?: string
  info?: string
  sourceId?: string
  location?: Val3dityExtensionErrorLocation
}

export type Val3dityExtensionErrorLocation = {
  shellIndex?: number
  faceIndex?: number
  ringIndex?: number
  vertexIndex?: number
  point?: {
    role?: 'reported' | 'derived-centroid'
    coordinates?: unknown
  }
}

export function createVal3dityExtensionSource(
  header: CityJsonHeader,
  features: ViewerFeature[],
  sourceName: string,
): ViewerDataset['validationSource'] {
  const report = getVal3dityReport(header)
  const hasEmbeddedValidation = features.some((feature) => feature.validity != null || feature.errors.length > 0)
  if (!report && !hasEmbeddedValidation) {
    return null
  }

  const version = getVal3dityReportVersion(report)
  const versionLabel = version
    ? `val3dity ${version}`
    : 'val3dity'

  return {
    name: `embedded ${versionLabel} report`,
    location: sourceName,
    sourceKind: 'embedded',
    sourceText: null,
  }
}

export function hasVal3dityReport(header: CityJsonHeader) {
  return getVal3dityReport(header) != null
}

export function getVal3dityReport(header: CityJsonHeader) {
  const report = header['+val3dity-report']
  return isRecord(report) &&
    typeof getVal3dityReportVersion(report) === 'string' &&
    typeof report.validity === 'boolean'
    ? (report as Val3dityExtensionReport)
    : null
}

export function getVal3dityReportVersion(report: Record<string, unknown> | Val3dityExtensionReport | null | undefined) {
  const version = report?.val3dity_version ?? report?.val3dityVersion
  return typeof version === 'string' && version.trim() ? version.trim() : null
}

export function applyVal3dityExtensionValidation(
  feature: ViewerFeature,
  cityObjects: Record<string, CityJsonObject>,
  hasVal3dityExtensionReport: boolean,
): ViewerFeature {
  let validity: boolean | null = null
  const errors: ViewerValidationError[] = []

  for (const [cityObjectId, cityObject] of Object.entries(cityObjects)) {
    const validation = getVal3dityExtensionValidation(cityObject)
    if (!validation) {
      continue
    }

    if (typeof validation.validity === 'boolean') {
      validity = validation.validity === false ? false : validity ?? true
    }

    for (const geometryValidation of validation.geometries ?? []) {
      for (const error of geometryValidation.errors ?? []) {
        errors.push(parseVal3dityExtensionError(error, cityObjectId, geometryValidation.geometryIndex))
      }
    }

    for (const error of validation.features ?? []) {
      errors.push(...parseVal3dityExtensionFeatureErrors(error, cityObjectId))
    }
  }

  if (validity == null && errors.length === 0 && !hasVal3dityExtensionReport) {
    return feature
  }

  return {
    ...feature,
    validity: errors.length > 0 ? false : validity ?? true,
    errors,
  }
}

export function getVal3dityExtensionValidation(cityObject: CityJsonObject): Val3dityExtensionValidation | null {
  const validation = cityObject.attributes?.['+val3dity-validation']
  return isRecord(validation) ? (validation as Val3dityExtensionValidation) : null
}

export function parseVal3dityExtensionFeatureErrors(
  error: Val3dityExtensionError,
  fallbackCityObjectId: string,
): ViewerValidationError[] {
  const referencedGeometries = getVal3dityFeatureErrorGeometryReferences(error.sourceId)
  if (referencedGeometries.length === 0) {
    return [parseVal3dityExtensionError(error, fallbackCityObjectId, undefined, false)]
  }

  return referencedGeometries.map(({ cityObjectId, geometryIndex }) =>
    parseVal3dityExtensionError(error, cityObjectId, geometryIndex, false),
  )
}

export function getVal3dityFeatureErrorGeometryReferences(sourceId: unknown) {
  if (typeof sourceId !== 'string') {
    return []
  }

  return sourceId.split('&&').flatMap((reference) => {
    const parts = parseValidationIdParts(reference)
    const geometryIndex = parseNullableInteger(parts.geom)
    return typeof parts.coid === 'string' && parts.coid && geometryIndex != null
      ? [{ cityObjectId: parts.coid, geometryIndex }]
      : []
  })
}

export function parseVal3dityExtensionError(
  error: Val3dityExtensionError,
  fallbackCityObjectId: string,
  fallbackGeometryIndex: number | undefined,
  parseSourceIdLocation = true,
): ViewerValidationError {
  const rawId = error.sourceId ?? ''
  const parts = parseValidationIdParts(rawId)
  const location = isRecord(error.location) ? error.location : null
  const pointCoordinates = Array.isArray(location?.point?.coordinates)
    ? location.point.coordinates
    : null

  return {
    code: error.code ?? -1,
    description: error.description ?? 'UNKNOWN',
    id: rawId,
    info: error.info ?? '',
    cityObjectId: fallbackCityObjectId,
    geometryIndex: parseNullableIntegerValue(fallbackGeometryIndex) ??
      (parseSourceIdLocation ? parseNullableInteger(parts.geom) : null),
    shellIndex: parseNullableIntegerValue(location?.shellIndex) ??
      (parseSourceIdLocation ? parseNullableInteger(parts.shell) : null),
    faceIndex: parseNullableIntegerValue(location?.faceIndex) ??
      (parseSourceIdLocation ? parseNullableInteger(parts.face) : null),
    ringIndex: parseNullableIntegerValue(location?.ringIndex) ??
      (parseSourceIdLocation ? parseNullableInteger(parts.ring) : null),
    vertexIndex: parseNullableIntegerValue(location?.vertexIndex) ??
      (parseSourceIdLocation ? parseNullableInteger(parts.vertex) : null),
    location: parseValidationPoint(pointCoordinates) ?? parseValidationLocation(error.info, error.description),
  }
}

export function parseValidationReport(text: string) {
  let reportData: unknown

  try {
    reportData = JSON.parse(text)
  } catch {
    throw new Error('Validation report is not valid JSON.')
  }

  if (!reportData || typeof reportData !== 'object' || Array.isArray(reportData)) {
    throw new Error('Validation report must be a JSON object with a top-level "features" array.')
  }

  const report = reportData as Val3dityReport
  if (!Array.isArray(report.features)) {
    throw new Error('Validation report must contain a top-level "features" array.')
  }

  if (report.features.length === 0) {
    throw new Error('Validation report contains no features.')
  }

  const annotations: ValidationAnnotations = new Map()

  for (const feature of report.features) {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
      throw new Error('Validation report contains an invalid feature entry.')
    }

    const featureId = feature.id
    if (typeof featureId !== 'string' || featureId.trim().length === 0) {
      throw new Error('Validation report contains a feature without a valid string id.')
    }

    if ('validity' in feature && typeof feature.validity !== 'boolean') {
      throw new Error(`Validation report feature "${featureId}" is missing a valid boolean "validity" field.`)
    }

    if ('errors' in feature && !Array.isArray(feature.errors)) {
      throw new Error(`Validation report feature "${featureId}" has an invalid "errors" field.`)
    }

    annotations.set(featureId.trim(), {
      validity: feature.validity ?? false,
      errors: (feature.errors ?? []).map(parseValidationError),
    })
  }

  return annotations
}

export function assertValidationAnnotationsMatchDataset(
  dataset: ViewerDataset,
  annotations: Map<string, { validity: boolean; errors: ViewerValidationError[] }>,
) {
  const datasetFeatureIds = new Set(dataset.features.map((feature) => feature.id))
  let matchingFeatureCount = 0

  for (const featureId of annotations.keys()) {
    if (datasetFeatureIds.has(featureId)) {
      matchingFeatureCount += 1
    }
  }

  if (matchingFeatureCount === 0) {
    throw new Error('Validation report does not match the currently loaded CityJSON features.')
  }
}

export function mergeValidationAnnotations(
  dataset: ViewerDataset,
  annotations: ValidationAnnotations,
  validationSource: ViewerDataset['validationSource'] = dataset.validationSource,
) {
  return {
    ...dataset,
    validationSource,
    features: dataset.features.map((feature) => {
      const annotation = annotations.get(feature.id)
      return {
        ...feature,
        validity: annotation?.validity ?? null,
        errors: annotation?.errors ?? [],
      }
    }),
  }
}

export function getDisplayCityObjectAttributes(object: CityJsonObject) {
  if (!object.attributes?.['+val3dity-validation']) {
    return object.attributes ?? {}
  }

  const attributes = { ...object.attributes }
  delete attributes['+val3dity-validation']
  return attributes
}

export function parseValidationError(error: Val3dityError): ViewerValidationError {
  const rawId = error.id ?? ''
  const parts = parseValidationIdParts(rawId)

  return {
    code: error.code ?? -1,
    description: error.description ?? 'UNKNOWN',
    id: rawId,
    info: error.info ?? '',
    cityObjectId: parts.coid ?? null,
    geometryIndex: parseNullableInteger(parts.geom),
    shellIndex: parseNullableInteger(parts.shell),
    faceIndex: parseNullableInteger(parts.face),
    ringIndex: parseNullableInteger(parts.ring),
    vertexIndex: parseNullableInteger(parts.vertex),
    location: parseValidationLocation(error.info, error.description),
  }
}

export function parseValidationIdParts(rawId: string) {
  return Object.fromEntries(
    rawId.split('|').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    }),
  )
}

export function parseNullableInteger(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function parseNullableIntegerValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function parseValidationPoint(coordinates: unknown[] | null) {
  if (!coordinates || coordinates.length < 3) {
    return null
  }

  const parsed = coordinates.slice(0, 3)
  if (!parsed.every((value): value is number => typeof value === 'number' && Number.isFinite(value))) {
    return null
  }

  return parsed as Vec3
}

export function parseValidationLocation(...sources: Array<string | undefined>) {
  const coordinatePattern =
    /\(\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\)/i

  for (const source of sources) {
    if (!source) {
      continue
    }

    const match = source.match(coordinatePattern)
    if (!match) {
      continue
    }

    const coordinates = match.slice(1, 4).map((entry) => Number.parseFloat(entry))
    if (coordinates.some((value) => Number.isNaN(value))) {
      continue
    }

    return coordinates as Vec3
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

