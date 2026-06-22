import type {
  ViewerCityObject,
  ViewerDataset,
  ViewerGeometryDisplayMode,
  ViewerObjectGeometry,
} from '@/types/cityjson'

export function getGeometryDisplayModeKey(mode: ViewerGeometryDisplayMode) {
  return mode.kind === 'best' ? 'best' : `lod:${mode.lod}`
}

export function collectAvailableLods(dataset: ViewerDataset | null) {
  if (!dataset) {
    return []
  }

  const lods = new Set<string>()

  for (const feature of dataset.features) {
    for (const object of feature.objects) {
      for (const geometry of object.geometries) {
        if (geometry.lod) {
          lods.add(geometry.lod)
        }
      }
    }
  }

  return Array.from(lods).toSorted(compareLods)
}

export function getObjectGeometryByIndex(
  object: ViewerCityObject | null | undefined,
  geometryIndex: number | null | undefined,
) {
  if (!object || geometryIndex == null) {
    return null
  }

  return object.geometries.find((geometry) => geometry.index === geometryIndex) ?? null
}

export function findObjectGeometryIndexByLod(object: ViewerCityObject, lod: string) {
  return object.geometries.find((geometry) => geometry.lod === lod)?.index ?? null
}

export function getObjectGeometriesByLod(object: ViewerCityObject, lod: string) {
  return object.geometries.filter((geometry) => geometry.lod === lod)
}

export function getBestGeometryIndex(object: ViewerCityObject) {
  if (object.bestGeometryIndex != null) {
    return object.bestGeometryIndex
  }

  return object.geometries[0]?.index ?? null
}

export function getBestObjectGeometries(object: ViewerCityObject) {
  const bestGeometry = getObjectGeometryByIndex(object, getBestGeometryIndex(object))
  if (!bestGeometry) {
    return []
  }

  return bestGeometry.lod ? getObjectGeometriesByLod(object, bestGeometry.lod) : [bestGeometry]
}

export function normalizeObjectGeometryIndex(
  object: ViewerCityObject | null | undefined,
  geometryIndex: number | null | undefined,
) {
  return getObjectGeometryByIndex(object, geometryIndex) ? geometryIndex ?? null : null
}

export function resolveObjectGeometryIndex(
  object: ViewerCityObject | null | undefined,
  mode: ViewerGeometryDisplayMode,
  overrideGeometryIndex?: number | null,
) {
  if (!object) {
    return null
  }

  const normalizedOverride = normalizeObjectGeometryIndex(object, overrideGeometryIndex)
  if (normalizedOverride != null) {
    const geometry = getObjectGeometryByIndex(object, normalizedOverride)
    if (mode.kind !== 'lod' || geometry?.lod === mode.lod) {
      return normalizedOverride
    }
  }

  if (mode.kind === 'lod') {
    return findObjectGeometryIndexByLod(object, mode.lod)
  }

  return getBestGeometryIndex(object)
}

export function resolveObjectGeometry(
  object: ViewerCityObject | null | undefined,
  mode: ViewerGeometryDisplayMode,
  overrideGeometryIndex?: number | null,
) {
  const geometryIndex = resolveObjectGeometryIndex(object, mode, overrideGeometryIndex)
  return getObjectGeometryByIndex(object, geometryIndex)
}

export function resolveObjectGeometries(
  object: ViewerCityObject | null | undefined,
  mode: ViewerGeometryDisplayMode,
) {
  if (!object) {
    return []
  }

  if (mode.kind === 'lod') {
    return getObjectGeometriesByLod(object, mode.lod)
  }

  return getBestObjectGeometries(object)
}

export function formatGeometryLabel(geometry: ViewerObjectGeometry) {
  return geometry.lod ? `LoD ${geometry.lod}` : `Geometry ${geometry.index}`
}

function compareLods(left: string, right: string) {
  const leftScore = Number.parseFloat(left)
  const rightScore = Number.parseFloat(right)
  const hasLeftScore = Number.isFinite(leftScore)
  const hasRightScore = Number.isFinite(rightScore)

  if (hasLeftScore && hasRightScore && leftScore !== rightScore) {
    return leftScore - rightScore
  }

  return left.localeCompare(right, undefined, { numeric: true })
}
