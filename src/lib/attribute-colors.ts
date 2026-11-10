import { collectAttributeValues } from '../modules/cityjson-core/attributes'
import type { ViewerDataset } from '../modules/cityjson-core/types'
import { analyzeAttributeValues, colorizeAttributeAnalysis } from '../modules/colors/analysis'
import type { AttributeColorMapId } from '../modules/colors/palettes'

/** CJLoupe adapter used for one-off settings restoration and attribute selection. */
export function buildAttributeColorModel(
  dataset: ViewerDataset | null,
  key: string | null,
  inheritFromParents: boolean,
  colorMapId: AttributeColorMapId,
  colors: readonly string[],
  seed: number,
  customColors: Record<string, string>,
) {
  return dataset && key
    ? colorizeAttributeAnalysis(analyzeAttributeValues(key, collectAttributeValues(dataset, key, inheritFromParents)), colorMapId, colors, seed, customColors)
    : null
}
