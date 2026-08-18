import type { Vec3 } from '@/types/cityjson'

export const VIEWER_STATE_VERSION = 1
export const CJLOUPE_VIEWER_STATE_PROPERTY = '+CJLoupe-viewerState'

export type ViewerCameraPose = {
  kind: 'perspective' | 'orthographic'
  position: Vec3
  quaternion: [number, number, number, number]
  up: Vec3
  target: Vec3
  focalLength: number | null
  orthographicHalfHeight: number | null
}

export function isViewerCameraPose(value: unknown): value is ViewerCameraPose {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as Partial<ViewerCameraPose>
  return (
    (candidate.kind === 'perspective' || candidate.kind === 'orthographic') &&
    isVec3(candidate.position) &&
    isQuaternion(candidate.quaternion) &&
    isVec3(candidate.up) &&
    isVec3(candidate.target) &&
    isNullablePositiveNumber(candidate.focalLength) &&
    isNullablePositiveNumber(candidate.orthographicHalfHeight)
  )
}

function isVec3(value: unknown): value is Vec3 {
  return isNumberArray(value) && value.length === 3
}

function isQuaternion(value: unknown): value is [number, number, number, number] {
  return isNumberArray(value) && value.length === 4
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber)
}

function isNullablePositiveNumber(value: unknown) {
  return value === null || (isFiniteNumber(value) && value > 0)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
