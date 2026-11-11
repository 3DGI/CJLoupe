import type { ViewerDataset, ViewerDatasetSource, ViewerValidationSource } from '../modules/cityjson-core/types'

// App-owned provenance: source descriptors survive combining datasets and editing.
// Weak keys release the text when the app releases the corresponding source.
const texts = new WeakMap<ViewerDatasetSource | ViewerValidationSource, string>()
const files = new WeakMap<File, Promise<string>>()
export function readAppFileText(file: File): Promise<string> {
  let text = files.get(file)
  if (!text) { text = file.text(); files.set(file, text) }
  return text
}
export function retainDatasetText<T extends ViewerDataset>(dataset: T, text: string): T {
  if (dataset.sources.length !== 1) throw new Error('Source text must be attached before combining datasets.')
  retainSourceText(dataset.sources[0], text)
  return dataset
}
export function retainSourceText<T extends ViewerDatasetSource | ViewerValidationSource>(source: T, text: string): T {
  texts.set(source, text)
  return source
}
export function getSourceText(source: ViewerDatasetSource | ViewerValidationSource | null | undefined): string | null {
  return source ? texts.get(source) ?? null : null
}
export function getDatasetSourceText(dataset: ViewerDataset): string | null {
  return dataset.sources.length === 1 ? getSourceText(dataset.sources[0]) : null
}
export function retainValidationText(source: ViewerValidationSource & { sourceText?: string | null }): ViewerValidationSource {
  if (!('sourceText' in source)) return source
  const { sourceText, ...descriptor } = source
  if (sourceText != null) texts.set(descriptor, sourceText)
  return descriptor
}
export function requireSourceText(source: ViewerDatasetSource): string {
  const text = getSourceText(source)
  if (text == null) throw new Error(`The original CityJSON source is not available for ${source.name}.`)
  return text
}
