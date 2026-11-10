import { assertValidationAnnotationsMatchDataset, combineViewerDatasets, loadCityJsonFromFile, loadCityJsonFromUrl, loadValidationReportFromFile, loadValidationReportFromUrl, mergeValidationAnnotations } from '../../lib/cityjson'
import type { ViewerDataset } from '../../types/cityjson'

export type DatasetInput = { kind: 'file'; file: File } | { kind: 'url'; url: string; name?: string }
export type SceneLoadRequest = { sources: DatasetInput[]; report?: DatasetInput; append?: boolean }

export function deriveSourceNameFromUrl(url: string) {
  try { return decodeURIComponent(new URL(url, 'https://cjloupe.invalid').pathname.split('/').filter(Boolean).pop() || 'CityJSON') }
  catch { return url }
}

export async function loadSceneSources(request: SceneLoadRequest, signal: AbortSignal) {
  const [datasets, report] = await Promise.all([
    Promise.all(request.sources.map(source => source.kind === 'file'
      ? loadCityJsonFromFile(source.file)
      : loadCityJsonFromUrl(source.url, source.name ?? deriveSourceNameFromUrl(source.url), { signal }))),
    request.report ? loadReport(request.report, signal) : null,
  ])
  signal.throwIfAborted()
  return { datasets, report }
}

export async function loadReport(source: DatasetInput, signal: AbortSignal) {
  const report = source.kind === 'file' ? await loadValidationReportFromFile(source.file) : await loadValidationReportFromUrl(source.url, { signal })
  signal.throwIfAborted()
  return {
    ...report,
    source: source.kind === 'file'
      ? { name: source.file.name, location: source.file.webkitRelativePath || source.file.name, sourceKind: 'file' as const }
      : { name: source.name ?? deriveSourceNameFromUrl(source.url), location: source.url, sourceKind: 'url' as const },
  }
}

export function assembleScene(loaded: Awaited<ReturnType<typeof loadSceneSources>>, current: ViewerDataset | null, append: boolean) {
  const dataset = combineViewerDatasets(append && current ? [current, ...loaded.datasets] : loaded.datasets)
  if (!loaded.report) return dataset
  assertValidationAnnotationsMatchDataset(dataset, loaded.report.annotations)
  return mergeValidationAnnotations(dataset, loaded.report.annotations, { ...loaded.report.source, sourceText: loaded.report.sourceText })
}
