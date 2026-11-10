import { readGeographicalExtent } from './extents'
import { measurePerformance, nowPerformance, recordPerformanceMeasure } from './performance'
import type { CityJsonDocument, CityJsonFeature, CityJsonGeometry, CityJsonHeader, CityJsonObject, CityJsonSemantics, CityJsonTransform, ViewerDatasetInfo } from './source-types'
import type { PolygonRings, Vec3, ViewerCityObject, ViewerDataset, ViewerDatasetSource, ViewerFeature, ViewerObjectGeometry, ViewerSemanticSurface } from './types'

export type CityJsonParseOptions = {
  kind?: 'auto' | 'document' | 'sequence'
  onFeature?: (feature: ViewerFeature, objects: Record<string, CityJsonObject>, header: CityJsonHeader) => ViewerFeature
  onDataset?: (dataset: ViewerDataset, header: CityJsonHeader) => ViewerDataset
  objectAttributes?: (object: CityJsonObject) => Record<string, unknown>
}

export function combineViewerDatasets(datasets: ViewerDataset[]): ViewerDataset {
  if (datasets.length === 0) {
    throw new Error('No CityJSON files were loaded.')
  }

  if (datasets.length === 1) {
    return datasets[0]
  }

  const featureIdCounts = new Map<string, number>()
  for (const dataset of datasets) {
    for (const feature of dataset.features) {
      featureIdCounts.set(feature.id, (featureIdCounts.get(feature.id) ?? 0) + 1)
    }
  }

  const usedFeatureIds = new Set<string>()
  const features: ViewerFeature[] = []
  for (const dataset of datasets) {
    for (const feature of dataset.features) {
      const duplicateFeatureId = (featureIdCounts.get(feature.id) ?? 0) > 1
      const nextFeatureId = duplicateFeatureId
        ? createUniqueCombinedFeatureId(feature.id, dataset.sourceName, usedFeatureIds)
        : createUniqueFeatureId(feature.id, usedFeatureIds)
      features.push(nextFeatureId === feature.id ? feature : renameViewerFeature(feature, nextFeatureId, dataset.sourceName))
    }
  }

  features.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))

  const extent = calculateCombinedExtent(features)
  const center: Vec3 = [
    (extent[0] + extent[3]) / 2,
    (extent[1] + extent[4]) / 2,
    (extent[2] + extent[5]) / 2,
  ]
  const sources = datasets.flatMap(getDatasetSources)
  const sourceName = `${sources.length} CityJSON files`
  const sourceLocation = sources.map((source) => source.location).join('\n')
  const cityJsonKinds = new Set(sources.map((source) => source.cityJsonKind))
  const cityJsonVersions = new Set(sources.map((source) => source.cityJsonVersion).filter((version) => version != null))
  const validationSources = datasets.flatMap((dataset) => dataset.validationSource ? [dataset.validationSource] : [])
  const standaloneValidationSource = validationSources.find((source) => source.sourceKind !== 'embedded')
  const validationSource: ViewerDataset['validationSource'] = standaloneValidationSource ?? (validationSources.length > 0
    ? {
        name: 'embedded val3dity reports',
        location: validationSources.map((source) => source.location).join('\n'),
        sourceKind: 'embedded',
        sourceText: null,
      }
    : null)

  return {
    sourceName,
    sourceLocation,
    sourceText: '',
    sources,
    validationSource,
    center,
    extent,
    features,
    cityJsonVersion: cityJsonVersions.size === 1 ? [...cityJsonVersions][0] ?? null : null,
    cityJsonKind: cityJsonKinds.size === 1 ? [...cityJsonKinds][0] ?? 'Multiple' : 'Multiple',
    transform: null,
    metadata: null,
  }
}

function hasNonWhitespace(text: string) {
  return /\S/.test(text)
}

export function parseCityJson(text: string, sourceName: string, options: CityJsonParseOptions = {}): ViewerDataset {
  return parseCityJsonForSource(text, sourceName, options.kind ?? 'auto', options)
}

function parseCityJsonForSource(
  text: string,
  sourceName: string,
  cityJsonKind: 'auto' | 'document' | 'sequence',
  options: CityJsonParseOptions,
): ViewerDataset {
  return measurePerformance('cjvis:cityjson:parse-total', () => {
    if (!hasNonWhitespace(text)) {
      throw new Error('CityJSON input is empty.')
    }

    if (cityJsonKind === 'sequence') {
      return parseCityJsonSequence(text, sourceName, options)
    }

    try {
      const parsed = measurePerformance('cjvis:cityjson:parse-json-document-attempt', () => JSON.parse(text) as unknown)
      if (!isRecord(parsed) || Array.isArray(parsed)) {
        throw new Error('CityJSON input must be a JSON object or a CityJSON feature sequence.')
      }

      const type = parsed.type
      if (type === 'CityJSON') {
        return parseCityJsonDocument(parsed as CityJsonDocument, sourceName, text, options)
      }

      if (cityJsonKind === 'document') {
        throw new Error('Expected a CityJSON object.')
      }

      if (type === 'CityJSONFeature') {
        throw new Error('Expected a CityJSON feature sequence with a header line before feature objects.')
      }

      throw new Error('Expected a CityJSON object or a CityJSON feature sequence.')
    } catch (caughtError) {
      if (!(caughtError instanceof SyntaxError)) {
        throw caughtError
      }
    }

    if (cityJsonKind === 'document') {
      throw new Error('Expected a CityJSON object.')
    }

    return parseCityJsonSequence(text, sourceName, options)
  })
}

export function parseCityJsonSequence(text: string, sourceName: string, options: CityJsonParseOptions = {}): ViewerDataset {
  return measurePerformance('cjvis:cityjsonseq:parse-total', () => {
    const lines = measurePerformance('cjvis:cityjsonseq:split-lines', () => text.split(/\r?\n/))
    const headerLineIndex = lines.findIndex(hasNonWhitespace)

    if (headerLineIndex < 0) {
      throw new Error('Expected a CityJSON feature sequence with a header line and at least one feature line.')
    }

    const header = measurePerformance('cjvis:cityjsonseq:parse-header', () => JSON.parse(lines[headerLineIndex]) as CityJsonHeader)
    const transform = header.transform ?? {}
    const info = extractDatasetInfo(header)

    const features: ViewerFeature[] = []

    measurePerformance('cjvis:cityjsonseq:build-features', () => {
      let lineParseDuration = 0
      let vertexTransformDuration = 0
      let rootSelectionDuration = 0
      let viewerFeatureDuration = 0

      for (let lineIndex = headerLineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]
        if (!hasNonWhitespace(line)) {
          continue
        }

        let startedAt = nowPerformance()
        const feature = JSON.parse(line) as CityJsonFeature
        lineParseDuration += nowPerformance() - startedAt
        if (feature.type !== 'CityJSONFeature' || !feature.CityObjects || !feature.vertices) {
          continue
        }

        startedAt = nowPerformance()
        const worldVertices = transformVerticesInPlace(feature.vertices, transform)
        vertexTransformDuration += nowPerformance() - startedAt

        startedAt = nowPerformance()
        const objects = Object.entries(feature.CityObjects)
        if (objects.length === 0) {
          rootSelectionDuration += nowPerformance() - startedAt
          continue
        }

        const objectsById = new Map(objects)
        const roots = objects.filter(([, object]) => !object.parents || object.parents.length === 0)
        const featureRootObject = feature.id ? objectsById.get(feature.id) : undefined
        const rootEntry =
          (feature.id && featureRootObject
            ? ([feature.id, featureRootObject] as const)
            : null) ?? roots[0] ?? objects[0]
        const [rootObjectId, rootObject] = rootEntry
        rootSelectionDuration += nowPerformance() - startedAt

        startedAt = nowPerformance()
        const viewerFeature = createViewerFeature({
          featureId: feature.id ?? rootObjectId,
          rootObjectId,
          rootObject,
          cityObjects: feature.CityObjects,
          vertices: worldVertices,
          options,
        })
        viewerFeatureDuration += nowPerformance() - startedAt

        if (viewerFeature) {
          features.push((options.onFeature?.(viewerFeature, feature.CityObjects, header) ?? viewerFeature))
        }
      }

      recordPerformanceMeasure('cjvis:cityjsonseq:parse-feature-lines', lineParseDuration)
      recordPerformanceMeasure('cjvis:cityjsonseq:transform-feature-vertices', vertexTransformDuration)
      recordPerformanceMeasure('cjvis:cityjsonseq:select-feature-roots', rootSelectionDuration)
      recordPerformanceMeasure('cjvis:cityjsonseq:create-viewer-features', viewerFeatureDuration)
    })

    return measurePerformance('cjvis:cityjson:create-viewer-dataset', () =>
      createViewerDataset(
        sourceName,
        text,
        features,
        info,
        'CityJSONFeatures',
        header,
        options,
      ),
    )
  })
}

function parseCityJsonDocument(document: CityJsonDocument, sourceName: string, sourceText: string, options: CityJsonParseOptions): ViewerDataset {
  return measurePerformance('cjvis:cityjson:parse-document-total', () => {
    if (!isCityObjectsRecord(document.CityObjects)) {
      throw new Error('CityJSON object must contain a top-level "CityObjects" object.')
    }

    if (!Array.isArray(document.vertices)) {
      throw new Error('CityJSON object must contain a top-level "vertices" array.')
    }

    const cityObjectsById = document.CityObjects
    const vertices = document.vertices
    const transform = document.transform ?? {}
    const info = extractDatasetInfo(document)
    const worldVertices = measurePerformance('cjvis:cityjson:transform-document-vertices', () =>
      transformVerticesInPlace(vertices, transform),
    )
    const featureRootIds = measurePerformance('cjvis:cityjson:collect-feature-roots', () =>
      collectFeatureRootIds(cityObjectsById),
    )
    const features: ViewerFeature[] = []
    const processedObjectIds = new Set<string>()

    measurePerformance('cjvis:cityjson:build-document-features', () => {
      for (const rootObjectId of featureRootIds) {
        const rootObject = cityObjectsById[rootObjectId]
        if (!rootObject) {
          continue
        }

        const cityObjects = collectCityObjectSubtree(rootObjectId, cityObjectsById)
        for (const objectId of Object.keys(cityObjects)) {
          processedObjectIds.add(objectId)
        }

        const localized = localizeCityObjects(cityObjects, worldVertices)
        const viewerFeature = createViewerFeature({
          featureId: rootObjectId,
          rootObjectId,
          rootObject,
          cityObjects: localized.cityObjects,
          vertices: localized.vertices,
          options,
        })

        if (viewerFeature) {
          features.push((options.onFeature?.(viewerFeature, localized.cityObjects, document) ?? viewerFeature))
        }
      }

      for (const [objectId, object] of Object.entries(cityObjectsById)) {
        if (processedObjectIds.has(objectId)) {
          continue
        }

        const localized = localizeCityObjects({ [objectId]: object }, worldVertices)
        const viewerFeature = createViewerFeature({
          featureId: objectId,
          rootObjectId: objectId,
          rootObject: object,
          cityObjects: localized.cityObjects,
          vertices: localized.vertices,
          options,
        })

        if (viewerFeature) {
          features.push((options.onFeature?.(viewerFeature, localized.cityObjects, document) ?? viewerFeature))
        }
      }
    })

    return measurePerformance('cjvis:cityjson:create-viewer-dataset', () =>
      createViewerDataset(
        sourceName,
        sourceText,
        features,
        info,
        'CityJSON',
        document,
        options,
      ),
    )
  })
}

function createViewerDataset(
  sourceName: string,
  sourceText: string,
  features: ViewerFeature[],
  info: ViewerDatasetInfo,
  cityJsonKind: 'CityJSON' | 'CityJSONFeatures',
  sourceHeader: CityJsonHeader,
  options: CityJsonParseOptions,
): ViewerDataset {
  if (features.length === 0) {
    throw new Error('No renderable CityJSON features were found.')
  }

  features.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))

  const globalMin: Vec3 = [Infinity, Infinity, Infinity]
  const globalMax: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const feature of features) {
    updateGlobalExtent(globalMin, globalMax, feature.extent)
  }

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

  const dataset: ViewerDataset = {
    sourceName,
    sourceLocation: sourceName,
    sourceText,
    validationSource: null,
    sources: [
      {
        name: sourceName,
        location: sourceName,
        sourceKind: 'inline',
        sourceText,
        embeddedViewerState: null,
        embeddedViewerStateError: null,
        embeddedSourceName: null,
        cityJsonKind,
        cityJsonVersion: info.cityJsonVersion,
        featureCount: features.length,
        transform: info.transform,
        metadata: info.metadata,
      },
    ],
    center,
    extent,
    features,
    ...info,
    cityJsonKind,
  }
  return options.onDataset?.(dataset, sourceHeader) ?? dataset
}

function getDatasetSources(dataset: ViewerDataset): ViewerDatasetSource[] {
  return dataset.sources.length > 0
    ? dataset.sources
    : [
        {
          name: dataset.sourceName,
          location: dataset.sourceLocation,
          sourceKind: 'inline',
          sourceText: dataset.sourceText,
          embeddedViewerState: null,
          embeddedViewerStateError: null,
          embeddedSourceName: null,
          cityJsonKind: dataset.cityJsonKind === 'Multiple' ? 'CityJSONFeatures' : dataset.cityJsonKind,
          cityJsonVersion: dataset.cityJsonVersion,
          featureCount: dataset.features.length,
          transform: dataset.transform,
          metadata: dataset.metadata,
        },
      ]
}

function calculateCombinedExtent(features: ViewerFeature[]): ViewerDataset['extent'] {
  const globalMin: Vec3 = [Infinity, Infinity, Infinity]
  const globalMax: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const feature of features) {
    updateGlobalExtent(globalMin, globalMax, feature.extent)
  }

  return [
    globalMin[0],
    globalMin[1],
    globalMin[2],
    globalMax[0],
    globalMax[1],
    globalMax[2],
  ]
}

function createUniqueFeatureId(featureId: string, usedFeatureIds: Set<string>) {
  if (!usedFeatureIds.has(featureId)) {
    usedFeatureIds.add(featureId)
    return featureId
  }

  return createUniqueCombinedFeatureId(featureId, 'source', usedFeatureIds)
}

function createUniqueCombinedFeatureId(
  featureId: string,
  sourceName: string,
  usedFeatureIds: Set<string>,
) {
  const baseFeatureId = `${sanitizeCombinedFeatureIdPart(sourceName)}#${featureId}`
  let nextFeatureId = baseFeatureId
  let suffix = 2

  while (usedFeatureIds.has(nextFeatureId)) {
    nextFeatureId = `${baseFeatureId}#${suffix}`
    suffix += 1
  }

  usedFeatureIds.add(nextFeatureId)
  return nextFeatureId
}

function sanitizeCombinedFeatureIdPart(value: string) {
  return value.trim().replace(/::/g, ':') || 'source'
}

function renameViewerFeature(feature: ViewerFeature, featureId: string, sourceName: string): ViewerFeature {
  return {
    ...feature,
    id: featureId,
    label: `${sourceName} / ${feature.label}`,
  }
}

function extractDatasetInfo(header: CityJsonHeader): ViewerDatasetInfo {
  const version = typeof header.version === 'string' ? header.version : null
  const metadata = isRecord(header.metadata) ? (header.metadata as Record<string, unknown>) : null
  const rawTransform = header.transform
  let transform: { scale: Vec3; translate: Vec3 } | null = null
  if (rawTransform && (Array.isArray(rawTransform.scale) || Array.isArray(rawTransform.translate))) {
    const scale = rawTransform.scale ?? [1, 1, 1]
    const translate = rawTransform.translate ?? [0, 0, 0]
    transform = {
      scale: [scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1],
      translate: [translate[0] ?? 0, translate[1] ?? 0, translate[2] ?? 0],
    }
  }
  return { cityJsonVersion: version, transform, metadata }
}

function createViewerFeature({
  featureId,
  rootObjectId,
  rootObject,
  cityObjects,
  vertices,
  options,
}: {
  featureId: string
  rootObjectId: string
  rootObject: CityJsonObject
  cityObjects: Record<string, CityJsonObject>
  vertices: Vec3[]
  options: CityJsonParseOptions
}): ViewerFeature | null {
  const objects = createViewerObjects(cityObjects, options)
  const renderableObjects = objects.filter((object) => object.geometries.length > 0)
  if (renderableObjects.length === 0) {
    return null
  }

  const vertexIndices = uniqueVertexIndices(
    renderableObjects.flatMap((object) =>
      object.geometries.flatMap((geometry) => geometry.polygons),
    ),
  )
  const extent = calculateExtentFromIndices(vertices, vertexIndices)
  if (!extent) {
    return null
  }

  return {
    id: featureId,
    label: deriveFeatureLabel(featureId),
    rootObjectId,
    type: rootObject.type ?? 'CityObject',
    validity: null,
    errors: [],
    attributes: (options.objectAttributes?.(rootObject) ?? rootObject.attributes ?? {}),
    vertices,
    objects,
    extent,
  }
}

function createViewerObjects(cityObjects: Record<string, CityJsonObject>, options: CityJsonParseOptions) {
  const objects = Object.entries(cityObjects).map(([id, object]) => {
    const geometries = extractRenderableGeometries(object.geometry ?? [])

    return {
      id,
      object,
      parsed: {
        id,
        type: object.type ?? 'CityObject',
        geographicalExtent: readGeographicalExtent(object.geographicalExtent),
        attributes: (options.objectAttributes?.(object) ?? object.attributes ?? {}),
        geometries,
        bestGeometryIndex: pickBestGeometryIndex(geometries),
        hasRenderableChildren: false,
        parentIds: [],
        childIds: [],
      } satisfies ViewerCityObject,
    }
  })

  const parsedById = new Map(objects.map((entry) => [entry.id, entry]))

  const viewerObjects: ViewerCityObject[] = []
  for (const entry of objects) {
    viewerObjects.push({
      ...entry.parsed,
      hasRenderableChildren: hasRenderableChild(entry.object, parsedById),
      parentIds: (entry.object.parents ?? []).filter((parentId) => parsedById.has(parentId)),
      childIds: (entry.object.children ?? []).filter((childId) => parsedById.has(childId)),
    })
  }

  return viewerObjects
}

function collectFeatureRootIds(cityObjects: Record<string, CityJsonObject>) {
  const objectIds = new Set(Object.keys(cityObjects))
  const rootIds: string[] = []
  for (const [id, object] of Object.entries(cityObjects)) {
    if (!(object.parents ?? []).some((parentId) => objectIds.has(parentId))) {
      rootIds.push(id)
    }
  }

  return rootIds.length > 0 ? rootIds : Object.keys(cityObjects)
}

function collectCityObjectSubtree(
  rootObjectId: string,
  cityObjects: Record<string, CityJsonObject>,
) {
  const collected: Record<string, CityJsonObject> = {}
  const stack = [rootObjectId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const objectId = stack.pop()
    if (!objectId || visited.has(objectId)) {
      continue
    }

    visited.add(objectId)
    const object = cityObjects[objectId]
    if (!object) {
      continue
    }

    collected[objectId] = object
    for (const childId of object.children ?? []) {
      stack.push(childId)
    }
  }

  return collected
}

function localizeCityObjects(
  cityObjects: Record<string, CityJsonObject>,
  vertices: Vec3[],
) {
  const globalVertexIndices = collectCityObjectVertexIndices(cityObjects)
    .filter((index) => index >= 0 && index < vertices.length)
  const localVertexIndices = Array.from(new Set(globalVertexIndices)).toSorted((left, right) => left - right)
  const localIndexByGlobalIndex = new Map(
    localVertexIndices.map((globalIndex, localIndex) => [globalIndex, localIndex]),
  )
  const localizedCityObjects = Object.fromEntries(
    Object.entries(cityObjects).map(([objectId, object]) => [
      objectId,
      remapCityObjectVertexIndices(object, localIndexByGlobalIndex),
    ]),
  )

  return {
    cityObjects: localizedCityObjects,
    vertices: localVertexIndices.map((index) => vertices[index]),
  }
}

function collectCityObjectVertexIndices(cityObjects: Record<string, CityJsonObject>) {
  const indices: number[] = []

  for (const object of Object.values(cityObjects)) {
    for (const geometry of object.geometry ?? []) {
      collectBoundaryVertexIndices(geometry.boundaries, indices)
    }
  }

  return indices
}

function collectBoundaryVertexIndices(value: unknown, indices: number[]) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    indices.push(value)
    return
  }

  if (!Array.isArray(value)) {
    return
  }

  for (const entry of value) {
    collectBoundaryVertexIndices(entry, indices)
  }
}

function remapCityObjectVertexIndices(
  object: CityJsonObject,
  localIndexByGlobalIndex: Map<number, number>,
): CityJsonObject {
  return {
    ...object,
    geometry: object.geometry?.map((geometry) => ({
      ...geometry,
      boundaries: remapBoundaryVertexIndices(geometry.boundaries, localIndexByGlobalIndex),
    })),
  }
}

function remapBoundaryVertexIndices(
  value: unknown,
  localIndexByGlobalIndex: Map<number, number>,
): unknown {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return localIndexByGlobalIndex.get(value) ?? value
  }

  if (!Array.isArray(value)) {
    return value
  }

  return value.map((entry) => remapBoundaryVertexIndices(entry, localIndexByGlobalIndex))
}

function hasRenderableChild(
  object: CityJsonObject,
  parsedById: Map<string, { object: CityJsonObject; parsed: ViewerCityObject }>,
  visited = new Set<string>(),
): boolean {
  for (const childId of object.children ?? []) {
    if (visited.has(childId)) {
      continue
    }

    visited.add(childId)
    const child = parsedById.get(childId)
    if (!child) {
      continue
    }

    if (child.parsed.geometries.length > 0 || hasRenderableChild(child.object, parsedById, visited)) {
      return true
    }
  }

  return false
}

function extractRenderableGeometries(geometries: CityJsonGeometry[]) {
  return geometries.flatMap((geometry, index) => {
    const polygons = extractPolygons(geometry.type ?? '', geometry.boundaries)
    if (polygons.length === 0) {
      return []
    }

    const semanticSurfaces = extractSemanticSurfaces(
      geometry.type ?? '',
      geometry.semantics,
      polygons.length,
    )

    return [{
      index,
      geometryType: geometry.type ?? null,
      lod: geometry.lod ?? null,
      polygons,
      semanticSurfaces,
      sourceFaceIndices: polygons.map((_, polygonIndex) => polygonIndex),
      vertexIndices: uniqueVertexIndices(polygons),
    } satisfies ViewerObjectGeometry]
  })
}

function pickBestGeometryIndex(geometries: ViewerObjectGeometry[]) {
  let bestGeometryIndex: number | null = null
  let bestScore = -Infinity

  for (const geometry of geometries) {
    const lodScore = Number.parseFloat(geometry.lod ?? '0') || 0
    const typeScore = geometry.geometryType?.includes('Solid') ? 1 : 0
    const score = lodScore * 10 + typeScore

    if (score > bestScore) {
      bestGeometryIndex = geometry.index
      bestScore = score
    }
  }

  return bestGeometryIndex
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

  return Array.from(indices).toSorted((left, right) => left - right)
}

function deriveFeatureLabel(featureId: string) {
  const prefix = 'NL.IMBAG.Pand.'
  return featureId.startsWith(prefix) ? featureId.slice(prefix.length) : featureId
}

function transformVerticesInPlace(vertices: number[][], transform: CityJsonTransform): Vec3[] {
  const scale = transform.scale ?? [1, 1, 1]
  const translate = transform.translate ?? [0, 0, 0]

  for (const vertex of vertices) {
    vertex[0] = (vertex[0] ?? 0) * (scale[0] ?? 1) + (translate[0] ?? 0)
    vertex[1] = (vertex[1] ?? 0) * (scale[1] ?? 1) + (translate[1] ?? 0)
    vertex[2] = (vertex[2] ?? 0) * (scale[2] ?? 1) + (translate[2] ?? 0)
  }

  return vertices as Vec3[]
}

function calculateExtentFromIndices(
  vertices: Vec3[],
  indices: number[],
): ViewerFeature['extent'] | null {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  let hasVertex = false

  for (const index of indices) {
    const vertex = vertices[index]
    if (!vertex) {
      continue
    }

    hasVertex = true
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], vertex[axis])
      max[axis] = Math.max(max[axis], vertex[axis])
    }
  }

  return hasVertex ? [min[0], min[1], min[2], max[0], max[1], max[2]] : null
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCityObjectsRecord(value: unknown): value is Record<string, CityJsonObject> {
  if (!isRecord(value)) {
    return false
  }

  return Object.values(value).every((entry) => isRecord(entry))
}
