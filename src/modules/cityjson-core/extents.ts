import type { ViewerFeature } from './types'

export function readGeographicalExtent(value: unknown): ViewerFeature['extent'] | undefined {
  if (!Array.isArray(value) || value.length !== 6 || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return undefined
  }
  if (value[0] > value[3] || value[1] > value[4] || value[2] > value[5]) {
    return undefined
  }
  return value as ViewerFeature['extent']
}
