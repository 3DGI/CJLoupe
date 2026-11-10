import type { AttributeColorMapId, AttributeColorModel } from './palettes'
import {
  ATTRIBUTE_COLOR_BIN_COUNT,
  getCategoricalAttributeColor,
  parseCategoricalAttributeValue,
  parseContinuousAttributeValue,
  sampleColorMap,
} from './palettes'

export type AttributeAnalysis = {
  key: string
  kind: 'continuous' | 'categorical'
  valuesByObjectKey: Record<string, number>
  values: number[]
  dataMin: number
  dataMax: number
  objectCount: number
  missingCount: number
  bins: Array<{ start: number; end: number; count: number }>
  categories: Array<{ key: string; label: string; count: number; index: number }>
}

/** Analyze values once; changing a palette never revisits the source dataset. */
export function analyzeAttributeValues(
  key: string,
  entries: Iterable<readonly [string, unknown]>,
): AttributeAnalysis {
  const valuesByObjectKey: Record<string, number> = Object.create(null)
  const categoricalKeys: Record<string, string> = Object.create(null)
  const categories = new Map<string, { key: string; label: string; count: number }>()
  const values: number[] = []
  let dataMin = Infinity
  let dataMax = -Infinity
  let missingCount = 0
  let objectCount = 0
  let categorical = false
  for (const [id, raw] of entries) {
    objectCount++
    const value = parseContinuousAttributeValue(raw)
    const category = parseCategoricalAttributeValue(raw)
    if (!category) {
      missingCount++
      continue
    }
    categoricalKeys[id] = category.key
    const existing = categories.get(category.key)
    if (existing) existing.count++
    else categories.set(category.key, { ...category, count: 1 })
    if (value == null) categorical = true
    else {
      valuesByObjectKey[id] = value
      values.push(value)
      dataMin = Math.min(dataMin, value)
      dataMax = Math.max(dataMax, value)
    }
  }

  const sortedCategories = categorical
    ? [...categories.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
      .map((category, index) => ({ ...category, index }))
    : []
  if (categorical) {
    const indexByKey = new Map(sortedCategories.map(category => [category.key, category.index]))
    for (const [id, categoryKey] of Object.entries(categoricalKeys)) valuesByObjectKey[id] = indexByKey.get(categoryKey)!
  }
  if (!values.length) {
    dataMin = 0
    dataMax = 1
  }
  const binCount = Math.min(ATTRIBUTE_COLOR_BIN_COUNT, values.length)
  const span = Math.max(dataMax - dataMin, 0.000001)
  const bins = categorical ? [] : Array.from({ length: binCount }, (_, index) => ({
    start: dataMin + span * index / binCount,
    end: index === binCount - 1 ? dataMax : dataMin + span * (index + 1) / binCount,
    count: 0,
  }))
  if (!categorical) for (const value of values) {
    const index = Math.max(0, Math.min(Math.floor((value - dataMin) / span * binCount), binCount - 1))
    bins[index].count++
  }
  return { key, kind: categorical ? 'categorical' : 'continuous', valuesByObjectKey, values, dataMin, dataMax, objectCount, missingCount, bins, categories: sortedCategories }
}

export function colorizeAttributeAnalysis(
  analysis: AttributeAnalysis | null,
  colorMapId: AttributeColorMapId,
  colors: readonly string[],
  seed = 0,
  customColors: Record<string, string> = {},
): AttributeColorModel | null {
  if (!analysis) return null
  const { key, valuesByObjectKey, missingCount, objectCount } = analysis
  if (analysis.kind === 'continuous') {
    return {
      kind: 'continuous', key, valuesByObjectKey, missingCount, objectCount,
      values: analysis.values, dataMin: analysis.dataMin, dataMax: analysis.dataMax,
      continuousCount: analysis.values.length,
      bins: analysis.bins.map((bin, index) => ({ ...bin, color: sampleColorMap(colors, analysis.bins.length === 1 ? 0.5 : index / (analysis.bins.length - 1)) })),
    }
  }
  const categories = analysis.categories.map(category => ({
    ...category,
    color: getCategoricalAttributeColor(key, category.key, category.index, analysis.categories.length, colorMapId, colors, seed, customColors[category.key]),
  }))
  const directColorsByObjectKey: Record<string, string> = Object.create(null)
  for (const [id, index] of Object.entries(valuesByObjectKey)) directColorsByObjectKey[id] = categories[index].color
  return { kind: 'categorical', key, valuesByObjectKey, directColorsByObjectKey, categories, valueCount: Object.keys(valuesByObjectKey).length, missingCount, objectCount }
}
