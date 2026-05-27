import { parseValidationReport } from '@/lib/cityjson'
import type { ViewerDataset, ViewerValidationError } from '@/types/cityjson'
import { createVal3dity } from '@/vendor/val3dity/val3dity.js'
import val3dityWasmUrl from '@/vendor/val3dity/val3dity_wasm.wasm?url'

type ValidationAnnotations = Map<
  string,
  {
    validity: boolean
    errors: ViewerValidationError[]
  }
>

type Val3dityModule = {
  validateCityJSON(input: string, validationOptions?: Val3dityValidationOptions): unknown
  validateCityJSONSeq(input: string, validationOptions?: Val3dityValidationOptions): unknown
}

export type Val3dityValidationOptions = {
  tolSnap?: number
  planarityD2pTol?: number
  planarityNTol?: number
  overlapTol?: number
  primitive?: 'Solid' | 'MultiSurface' | 'CompositeSurface'
}

let val3dityPromise: Promise<Val3dityModule> | null = null

export async function validateDatasetWithVal3dity(
  dataset: ViewerDataset,
  validationOptions: Val3dityValidationOptions = {},
): Promise<ValidationAnnotations> {
  if (!dataset.sourceText.trim()) {
    throw new Error('The original CityJSON source text is not available for validation.')
  }

  const val3dity = await loadVal3dity()
  const report =
    dataset.cityJsonKind === 'CityJSONFeatures'
      ? val3dity.validateCityJSONSeq(dataset.sourceText, validationOptions)
      : val3dity.validateCityJSON(dataset.sourceText, validationOptions)

  return parseValidationReport(JSON.stringify(report))
}

async function loadVal3dity() {
  val3dityPromise ??= createVal3dity({
    locateFile(path: string) {
      return path.endsWith('.wasm') ? val3dityWasmUrl : path
    },
  })
  return val3dityPromise
}
