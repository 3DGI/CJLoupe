export const CAMERA_FOCAL_LENGTH_MIN = 18
export const CAMERA_FOCAL_LENGTH_MAX = 120
export const ORTHOGRAPHIC_CAMERA_VALUE = CAMERA_FOCAL_LENGTH_MAX + 1

export function isOrthographicCameraValue(value: number) {
  return value >= ORTHOGRAPHIC_CAMERA_VALUE
}
