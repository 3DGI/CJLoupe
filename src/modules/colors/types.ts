export type ViewerAttributeColorState = {
  mode: 'continuous' | 'direct'
  valuesByObjectKey: Record<string, number>
  directColorsByObjectKey?: Record<string, string>
  domainMin: number
  domainMax: number
  dataMin: number
  dataMax: number
  colors: readonly string[]
  missingColor: string
}

