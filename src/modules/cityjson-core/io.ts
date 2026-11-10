import type { CityJsonParseOptions } from './parse'
import { parseCityJson } from './parse'
import { measureAsyncPerformance } from './performance'
import type { ViewerDataset, ViewerDatasetSource } from './types'

const fileTextCache = new WeakMap<File, Promise<string>>()

export async function loadCityJsonSequenceFromUrl(url: string, sourceName: string) {
  return loadCityJsonFromUrl(url, sourceName, { cityJsonKind: 'sequence' })
}

export async function loadCityJsonFromUrl(
  url: string,
  sourceName: string,
  options?: CityJsonParseOptions & { cityJsonKind?: 'auto' | 'document' | 'sequence'; signal?: AbortSignal },
) {
  return measureAsyncPerformance('cjvis:cityjson:load-url-total', async () => {
    const response = await measureAsyncPerformance('cjvis:cityjson:fetch-url', () => fetch(url, { signal: options?.signal }))
    if (!response.ok) {
      throw new Error(`Could not fetch ${sourceName}.`)
    }

    const text = await measureAsyncPerformance('cjvis:cityjson:read-url-text', () => response.text())
    return withDatasetSourceLocation(
      parseCityJson(text, sourceName, { ...options, kind: options?.cityJsonKind ?? options?.kind ?? inferCityJsonKindFromSource(url) }),
      url,
      'url',
    )
  })
}

export async function loadCityJsonSequenceFromFile(file: File) {
  return loadCityJsonFromFile(file, { cityJsonKind: 'sequence' })
}

export async function loadCityJsonFromFile(
  file: File,
  options?: CityJsonParseOptions & { cityJsonKind?: 'auto' | 'document' | 'sequence'; signal?: AbortSignal },
) {
  return measureAsyncPerformance('cjvis:cityjson:load-file-total', async () => {
    let text: string
    try {
      text = await measureAsyncPerformance('cjvis:cityjson:read-file-text', () => readFileText(file))
    } catch (caughtError) {
      throw new Error(
        `Could not read ${file.name} (${formatByteSize(file.size)}). Very large CityJSON files can exceed browser memory limits.`,
        { cause: caughtError },
      )
    }

    if (!hasNonWhitespace(text) && file.size > 0) {
      throw new Error(
        `Could not read text from ${file.name} (${formatByteSize(file.size)}). The browser returned an empty text buffer for a non-empty file, which usually means the file is too large to read this way.`,
      )
    }

    return withDatasetSourceLocation(
      parseCityJson(text, file.name, { ...options, kind: options?.cityJsonKind ?? options?.kind ?? inferCityJsonKindFromSource(file.name) }),
      getFileSourceLocation(file),
      'file',
    )
  })
}

export async function classifyJsonFile(file: File): Promise<'cityjson' | 'validation-report' | 'unknown'> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFileText(file)) as unknown
  } catch {
    return 'unknown'
  }

  if (!isRecord(parsed)) {
    return 'unknown'
  }

  if (parsed.type === 'CityJSON') {
    return 'cityjson'
  }

  return Array.isArray(parsed.features) ? 'validation-report' : 'unknown'
}

export function readFileText(file: File) {
  const cached = fileTextCache.get(file)
  if (cached) {
    return cached
  }

  const pending = file.text()
  fileTextCache.set(file, pending)
  return pending
}

function formatByteSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function inferCityJsonKindFromSource(source: string): 'auto' | 'sequence' {
  const normalized = source
    .split(/[?#]/, 1)[0]
    .toLowerCase()
    .replace(/\.gz$/, '')

  return normalized.endsWith('.jsonl') || normalized.endsWith('.city.jsonl')
    ? 'sequence'
    : 'auto'
}

function withDatasetSourceLocation(
  dataset: ViewerDataset,
  sourceLocation: string,
  sourceKind: ViewerDatasetSource['sourceKind'],
): ViewerDataset {
  const restoredSourceName = dataset.sources[0]?.embeddedSourceName?.trim() || dataset.sourceName
  return {
    ...dataset,
    sourceName: restoredSourceName,
    sourceLocation,
    validationSource: dataset.validationSource
      ? { ...dataset.validationSource, location: sourceLocation }
      : null,
    sources: dataset.sources.map((source, index) =>
      index === 0
        ? { ...source, name: source.embeddedSourceName?.trim() || source.name, location: sourceLocation, sourceKind }
        : source,
    ),
  }
}

function getFileSourceLocation(file: File) {
  return file.webkitRelativePath || file.name
}

function hasNonWhitespace(text: string) {
  return /\S/.test(text)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

