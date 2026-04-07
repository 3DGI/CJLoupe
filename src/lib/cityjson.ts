import type {
  PolygonRings,
  Vec3,
  ViewerCityObject,
  ViewerDataset,
  ViewerFeature,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'

type CityJsonTransform = {
  scale?: number[]
  translate?: number[]
}

type CityJsonGeometry = {
  type?: string
  lod?: string
  boundaries?: unknown
  semantics?: CityJsonSemantics
}

type CityJsonSemanticSurface = {
  type?: string
} & Record<string, unknown>

type CityJsonSemantics = {
  surfaces?: CityJsonSemanticSurface[]
  values?: unknown
}

type CityJsonObject = {
  type?: string
  attributes?: Record<string, unknown>
  geometry?: CityJsonGeometry[]
  parents?: string[]
  children?: string[]
}

type CityJsonHeader = {
  type?: string
  transform?: CityJsonTransform
}

type CityJsonFeature = {
  type?: string
  id?: string
  CityObjects?: Record<string, CityJsonObject>
  vertices?: number[][]
}

type Val3dityError = {
  code?: number
  description?: string
  id?: string
  info?: string
}

type Val3dityFeature = {
  id?: string
  validity?: boolean
  errors?: Val3dityError[]
}

type Val3dityReport = {
  features?: Val3dityFeature[]
}

export async function loadCityJsonSequenceFromUrl(url: string, sourceName: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch ${sourceName}.`)
  }

  const text = await response.text()
  return parseCityJsonSequence(text, sourceName)
}

export async function loadCityJsonSequenceFromFile(file: File) {
  const text = await file.text()
  return parseCityJsonSequence(text, file.name)
}

export async function loadValidationReportFromUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch validation report from ${url}.`)
  }

  const text = await response.text()
  return parseValidationReport(text)
}

export async function loadValidationReportFromFile(file: File) {
  const text = await file.text()
  return parseValidationReport(text)
}

export function parseCityJsonSequence(text: string, sourceName: string): ViewerDataset {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error('Expected a CityJSON feature sequence with a header line and at least one feature line.')
  }

  const header = JSON.parse(lines[0]) as CityJsonHeader
  const transform = header.transform ?? {}

  const features: ViewerFeature[] = []
  const globalMin: Vec3 = [Infinity, Infinity, Infinity]
  const globalMax: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const line of lines.slice(1)) {
    const feature = JSON.parse(line) as CityJsonFeature
    if (feature.type !== 'CityJSONFeature' || !feature.CityObjects || !feature.vertices) {
      continue
    }

    const worldVertices = feature.vertices.map((vertex) => applyTransform(vertex, transform))
    const objects = Object.entries(feature.CityObjects)
    if (objects.length === 0) {
      continue
    }

    const roots = objects.filter(([, object]) => !object.parents || object.parents.length === 0)
    const rootEntry =
      objects.find(([id]) => id === feature.id) ?? roots[0] ?? objects[0]
    const [rootObjectId, rootObject] = rootEntry
    const renderableObjects = createRenderableObjects(feature.CityObjects)
    const featureId = feature.id ?? rootObjectId
    const attributes = rootObject.attributes ?? {}
    const extent = calculateExtent(worldVertices)
    updateGlobalExtent(globalMin, globalMax, extent)
    const originalVertices = worldVertices.map((vertex) => [...vertex] as Vec3)

    features.push({
      id: featureId,
      label: deriveFeatureLabel(featureId, attributes),
      rootObjectId,
      type: rootObject.type ?? 'CityObject',
      validity: null,
      errors: [],
      attributes,
      originalVertices,
      vertices: worldVertices,
      objects: renderableObjects,
      extent,
    })
  }

  features.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))

  const extent: ViewerDataset['extent'] = [
    globalMin[0],
    globalMin[1],
    globalMin[2],
    globalMax[0],
    globalMax[1],
    globalMax[2],
  ]
  const center: Vec3 = [
    (extent[0] + extent[3]) / 2,
    (extent[1] + extent[4]) / 2,
    (extent[2] + extent[5]) / 2,
  ]

  return {
    sourceName,
    center,
    extent,
    features,
  }
}

export function parseValidationReport(text: string) {
  const report = JSON.parse(text) as Val3dityReport
  const annotations = new Map<
    string,
    {
      validity: boolean
      errors: ViewerValidationError[]
    }
  >()

  for (const feature of report.features ?? []) {
    const featureId = feature.id
    if (!featureId) {
      continue
    }

    annotations.set(featureId, {
      validity: Boolean(feature.validity),
      errors: (feature.errors ?? []).map(parseValidationError),
    })
  }

  return annotations
}

export function mergeValidationAnnotations(
  dataset: ViewerDataset,
  annotations: Map<string, { validity: boolean; errors: ViewerValidationError[] }>,
) {
  return {
    ...dataset,
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

function createRenderableObjects(cityObjects: Record<string, CityJsonObject>) {
  const objects = Object.entries(cityObjects).map(([id, object]) => {
    const geometry = pickBestGeometry(object.geometry ?? [])
    const polygons = geometry ? extractPolygons(geometry.type ?? '', geometry.boundaries) : []
    const semanticSurfaces = geometry
      ? extractSemanticSurfaces(geometry.type ?? '', geometry.semantics, polygons.length)
      : []

    return {
      id,
      object,
      parsed: {
        id,
        type: object.type ?? 'CityObject',
        attributes: object.attributes ?? {},
        geometryType: geometry?.type ?? null,
        lod: geometry?.lod ?? null,
        polygons,
        semanticSurfaces,
        vertexIndices: uniqueVertexIndices(polygons),
      } satisfies ViewerCityObject,
    }
  })

  const parsedById = new Map(objects.map((entry) => [entry.id, entry]))
  const renderableLeafObjects = objects
    .filter((entry) => entry.parsed.polygons.length > 0)
    .filter((entry) => !hasRenderableChild(entry.object, parsedById))
    .map((entry) => entry.parsed)

  if (renderableLeafObjects.length > 0) {
    return renderableLeafObjects
  }

  return objects.filter((entry) => entry.parsed.polygons.length > 0).map((entry) => entry.parsed)
}

function hasRenderableChild(
  object: CityJsonObject,
  parsedById: Map<string, { object: CityJsonObject; parsed: ViewerCityObject }>,
): boolean {
  for (const childId of object.children ?? []) {
    const child = parsedById.get(childId)
    if (!child) {
      continue
    }

    if (child.parsed.polygons.length > 0 || hasRenderableChild(child.object, parsedById)) {
      return true
    }
  }

  return false
}

function pickBestGeometry(geometries: CityJsonGeometry[]) {
  let bestGeometry: CityJsonGeometry | null = null
  let bestScore = -Infinity

  for (const geometry of geometries) {
    const polygons = extractPolygons(geometry.type ?? '', geometry.boundaries)
    if (polygons.length === 0) {
      continue
    }

    const lodScore = Number.parseFloat(geometry.lod ?? '0') || 0
    const typeScore = geometry.type?.includes('Solid') ? 1 : 0
    const score = lodScore * 10 + typeScore

    if (score > bestScore) {
      bestGeometry = geometry
      bestScore = score
    }
  }

  return bestGeometry
}

function extractPolygons(geometryType: string, boundaries: unknown): PolygonRings[] {
  if (!boundaries || !Array.isArray(boundaries)) {
    return []
  }

  if (geometryType === 'MultiSurface' || geometryType === 'CompositeSurface') {
    return boundaries.filter(isPolygonRings)
  }

  if (geometryType === 'Solid') {
    return boundaries.flatMap((shell) =>
      Array.isArray(shell) ? shell.filter(isPolygonRings) : [],
    )
  }

  if (geometryType === 'MultiSolid' || geometryType === 'CompositeSolid') {
    return boundaries.flatMap((solid) =>
      Array.isArray(solid)
        ? solid.flatMap((shell) => (Array.isArray(shell) ? shell.filter(isPolygonRings) : []))
        : [],
    )
  }

  return []
}

function extractSemanticSurfaces(
  geometryType: string,
  semantics: CityJsonSemantics | undefined,
  polygonCount: number,
): Array<ViewerSemanticSurface | null> {
  const surfaceRefs = extractSemanticSurfaceRefs(geometryType, semantics?.values)
  const surfaces = semantics?.surfaces ?? []

  return Array.from({ length: polygonCount }, (_, polygonIndex) => {
    const surfaceRef = surfaceRefs[polygonIndex]
    if (surfaceRef == null || surfaceRef < 0) {
      return null
    }

    const surface = surfaces[surfaceRef]
    if (!surface) {
      return null
    }

    const { type, ...attributes } = surface
    return {
      surfaceIndex: surfaceRef,
      type: typeof type === 'string' && type.trim().length > 0 ? type : 'UnknownSurface',
      attributes,
    }
  })
}

function extractSemanticSurfaceRefs(geometryType: string, values: unknown): Array<number | null> {
  if (!values || !Array.isArray(values)) {
    return []
  }

  if (geometryType === 'MultiSurface' || geometryType === 'CompositeSurface') {
    return values.map(parseSemanticSurfaceRef)
  }

  if (geometryType === 'Solid') {
    return values.flatMap((shell) =>
      Array.isArray(shell) ? shell.map(parseSemanticSurfaceRef) : [],
    )
  }

  if (geometryType === 'MultiSolid' || geometryType === 'CompositeSolid') {
    return values.flatMap((solid) =>
      Array.isArray(solid)
        ? solid.flatMap((shell) => (Array.isArray(shell) ? shell.map(parseSemanticSurfaceRef) : []))
        : [],
    )
  }

  return []
}

function parseSemanticSurfaceRef(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function isPolygonRings(value: unknown): value is PolygonRings {
  return Array.isArray(value) && value.every((ring) => Array.isArray(ring))
}

function uniqueVertexIndices(polygons: PolygonRings[]) {
  const indices = new Set<number>()

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const index of ring) {
        if (typeof index === 'number') {
          indices.add(index)
        }
      }
    }
  }

  return [...indices].sort((left, right) => left - right)
}

function deriveFeatureLabel(featureId: string, attributes: Record<string, unknown>) {
  for (const key of ['name', 'naam', 'title', 'label', 'identificatie']) {
    const value = attributes[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return featureId
}

function parseValidationError(error: Val3dityError): ViewerValidationError {
  const rawId = error.id ?? ''
  const parts = Object.fromEntries(
    rawId.split('|').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    }),
  )

  return {
    code: error.code ?? -1,
    description: error.description ?? 'UNKNOWN',
    id: rawId,
    info: error.info ?? '',
    cityObjectId: parts.coid ?? null,
    geometryIndex: parseNullableInteger(parts.geom),
    shellIndex: parseNullableInteger(parts.shell),
    faceIndex: parseNullableInteger(parts.face),
    location: parseValidationLocation(error.info, error.description),
  }
}

function parseNullableInteger(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function parseValidationLocation(...sources: Array<string | undefined>) {
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

function applyTransform(vertex: number[], transform: CityJsonTransform): Vec3 {
  const scale = transform.scale ?? [1, 1, 1]
  const translate = transform.translate ?? [0, 0, 0]

  return [
    (vertex[0] ?? 0) * (scale[0] ?? 1) + (translate[0] ?? 0),
    (vertex[1] ?? 0) * (scale[1] ?? 1) + (translate[1] ?? 0),
    (vertex[2] ?? 0) * (scale[2] ?? 1) + (translate[2] ?? 0),
  ]
}

function calculateExtent(vertices: Vec3[]): ViewerFeature['extent'] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], vertex[axis])
      max[axis] = Math.max(max[axis], vertex[axis])
    }
  }

  return [min[0], min[1], min[2], max[0], max[1], max[2]]
}

function updateGlobalExtent(
  globalMin: Vec3,
  globalMax: Vec3,
  extent: ViewerFeature['extent'],
) {
  globalMin[0] = Math.min(globalMin[0], extent[0])
  globalMin[1] = Math.min(globalMin[1], extent[1])
  globalMin[2] = Math.min(globalMin[2], extent[2])
  globalMax[0] = Math.max(globalMax[0], extent[3])
  globalMax[1] = Math.max(globalMax[1], extent[4])
  globalMax[2] = Math.max(globalMax[2], extent[5])
}
