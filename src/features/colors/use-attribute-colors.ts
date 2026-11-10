import { collectAttributeValues } from '@/modules/cityjson-core/attributes'
import { analyzeAttributeValues, colorizeAttributeAnalysis } from '@/modules/colors/analysis'
import type { AttributeColorDomain, AttributeColorMapId } from '@/modules/colors/palettes'
import { ATTRIBUTE_COLOR_MISSING, DEFAULT_ATTRIBUTE_COLOR_MAP_ID, getContinuousAttributeColorMapColors } from '@/modules/colors/palettes'
import { useMemo, useRef, useState } from 'react'

import type {
  ViewerAppearanceMode,
  ViewerAttributeColorState,
  ViewerDataset
} from '@/types/cityjson'


const EMPTY_ATTRIBUTES: Record<string, string> = {}

export function useAttributeColors(dataset: ViewerDataset | null, appearanceMode: ViewerAppearanceMode) {
  const attributeColorDomainsByKeyRef = useRef<Map<string, AttributeColorDomain>>(new Map())
  const attributeColorMapIdsByKeyRef = useRef<Map<string, AttributeColorMapId>>(new Map())
  const attributeColorMapReversedByKeyRef = useRef<Map<string, boolean>>(new Map())
  const attributeColorSeedsByKeyRef = useRef<Map<string, number>>(new Map())
  const [attributeColorKey, setAttributeColorKey] = useState<string | null>(null)
  const [attributeColorInheritsParent, setAttributeColorInheritsParent] = useState(true)
  const [attributeColorDomain, setAttributeColorDomain] = useState<AttributeColorDomain | null>(null)
  const [attributeColorMapId, setAttributeColorMapId] = useState<AttributeColorMapId>(DEFAULT_ATTRIBUTE_COLOR_MAP_ID)
  const [attributeColorMapReversed, setAttributeColorMapReversed] = useState(false)
  const [attributeCategoricalColorSeed, setAttributeCategoricalColorSeed] = useState(0)
  const [customCategoricalColorMaps, setCustomCategoricalColorMaps] = useState<Record<string, Record<string, string>>>({})
  const attributeColorMapColors = useMemo(() => {
    const base = getContinuousAttributeColorMapColors(attributeColorMapId)
    return attributeColorMapReversed ? [...base].reverse() : base
  }, [attributeColorMapId, attributeColorMapReversed])
  const customCategoricalColorsForAttribute = attributeColorKey
    ? customCategoricalColorMaps[attributeColorKey] ?? EMPTY_ATTRIBUTES
    : EMPTY_ATTRIBUTES
  const attributeAnalysis = useMemo(
    () => dataset && attributeColorKey
      ? analyzeAttributeValues(attributeColorKey, collectAttributeValues(dataset, attributeColorKey, attributeColorInheritsParent))
      : null,
    [dataset, attributeColorKey, attributeColorInheritsParent],
  )
  const attributeColorModel = useMemo(
    () => colorizeAttributeAnalysis(attributeAnalysis, attributeColorMapId, attributeColorMapColors, attributeCategoricalColorSeed, customCategoricalColorsForAttribute as Record<string, string>),
    [attributeAnalysis, attributeColorMapId, attributeColorMapColors, attributeCategoricalColorSeed, customCategoricalColorsForAttribute],
  )
  const activeAttributeColorDomain = useMemo(() => {
    if (!attributeColorModel || attributeColorModel.kind !== 'continuous') {
      return null
    }

    if (attributeColorDomain?.key === attributeColorModel.key) {
      return attributeColorDomain
    }

    return {
      key: attributeColorModel.key,
      min: attributeColorModel.dataMin,
      max: attributeColorModel.dataMax,
    }
  }, [attributeColorDomain, attributeColorModel])
  const availableAttributeColorViewportState = useMemo<ViewerAttributeColorState | null>(() => {
    if (!attributeColorModel) {
      return null
    }

    if (attributeColorModel.kind === 'categorical') {
      if (attributeColorModel.valueCount === 0) {
        return null
      }

      return {
        mode: 'direct',
        valuesByObjectKey: attributeColorModel.valuesByObjectKey,
        directColorsByObjectKey: attributeColorModel.directColorsByObjectKey,
        domainMin: 0,
        domainMax: Math.max(attributeColorModel.categories.length - 1, 1),
        dataMin: 0,
        dataMax: Math.max(attributeColorModel.categories.length - 1, 1),
        colors: attributeColorModel.categories.slice(0, 10).map((category) => category.color),
        missingColor: ATTRIBUTE_COLOR_MISSING,
      }
    }

    if (!activeAttributeColorDomain || attributeColorModel.continuousCount === 0) {
      return null
    }

    return {
      mode: 'continuous',
      valuesByObjectKey: attributeColorModel.valuesByObjectKey,
      domainMin: activeAttributeColorDomain.min,
      domainMax: activeAttributeColorDomain.max,
      dataMin: attributeColorModel.dataMin,
      dataMax: attributeColorModel.dataMax,
      colors: attributeColorMapColors,
      missingColor: ATTRIBUTE_COLOR_MISSING,
    }
  }, [activeAttributeColorDomain, attributeColorMapColors, attributeColorModel])
  const attributeColorViewportState = appearanceMode === 'colormap'
    ? availableAttributeColorViewportState
    : null
  return { attributeColorDomainsByKeyRef, attributeColorMapIdsByKeyRef, attributeColorMapReversedByKeyRef, attributeColorSeedsByKeyRef, attributeColorKey, setAttributeColorKey, attributeColorInheritsParent, setAttributeColorInheritsParent, attributeColorDomain, setAttributeColorDomain, attributeColorMapId, setAttributeColorMapId, attributeColorMapReversed, setAttributeColorMapReversed, attributeCategoricalColorSeed, setAttributeCategoricalColorSeed, customCategoricalColorMaps, setCustomCategoricalColorMaps, attributeColorModel, activeAttributeColorDomain, availableAttributeColorViewportState, attributeColorViewportState }
}
