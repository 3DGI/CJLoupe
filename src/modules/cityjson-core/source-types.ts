import type { Vec3 } from './types'

export type CityJsonTransform = {
  scale?: number[]
  translate?: number[]
}

export type CityJsonGeometry = {
  type?: string
  lod?: string
  boundaries?: unknown
  semantics?: CityJsonSemantics
}

export type CityJsonSemanticSurface = {
  type?: string
} & Record<string, unknown>

export type CityJsonSemantics = {
  surfaces?: CityJsonSemanticSurface[]
  values?: unknown
}

export type CityJsonObject = {
  type?: string
  geographicalExtent?: unknown
  attributes?: Record<string, unknown>
  geometry?: CityJsonGeometry[]
  parents?: string[]
  children?: string[]
}

export type CityJsonHeader = {
  type?: string
  version?: string
  transform?: CityJsonTransform
  metadata?: Record<string, unknown>
  [extension: string]: unknown
}

export type CityJsonDocument = CityJsonHeader & {
  CityObjects?: Record<string, CityJsonObject>
  vertices?: number[][]
}

export type ViewerDatasetInfo = {
  cityJsonVersion: string | null
  transform: { scale: Vec3; translate: Vec3 } | null
  metadata: Record<string, unknown> | null
}

export type CityJsonFeature = {
  type?: string
  id?: string
  CityObjects?: Record<string, CityJsonObject>
  vertices?: number[][]
}

