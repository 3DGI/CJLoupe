import { viewerObjectKey } from './identity'
import type { ViewerCityObject, ViewerDataset } from './types'

export function resolveObjectAttribute(
  object: ViewerCityObject,
  key: string,
  objectById: Map<string, ViewerCityObject> | null,
) {
  const direct = object.attributes[key]
  if (!isMissingAttributeValue(direct) || !objectById) {
    return direct
  }

  const visited = new Set<string>()
  const visit = (objectId: string): unknown => {
    if (visited.has(objectId)) {
      return null
    }

    visited.add(objectId)
    const parent = objectById.get(objectId)
    if (!parent) {
      return null
    }

    const value = parent.attributes[key]
    if (!isMissingAttributeValue(value)) {
      return value
    }

    for (const parentId of parent.parentIds) {
      const inheritedValue = visit(parentId)
      if (inheritedValue != null) {
        return inheritedValue
      }
    }

    return null
  }

  for (const parentId of object.parentIds) {
    const inheritedValue = visit(parentId)
    if (inheritedValue != null) {
      return inheritedValue
    }
  }

  return null
}

export function isMissingAttributeValue(value: unknown) {
  return value == null || (typeof value === 'string' && value.trim().length === 0)
}

export function* collectAttributeValues(dataset: ViewerDataset, key: string, inheritFromParents: boolean): Generator<readonly [string, unknown]> {
  for (const feature of dataset.features) {
    const objectById = inheritFromParents ? new Map(feature.objects.map(object => [object.id, object])) : null
    for (const object of feature.objects) yield [viewerObjectKey(feature.id, object.id), resolveObjectAttribute(object, key, objectById)]
  }
}
