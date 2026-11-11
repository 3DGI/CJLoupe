import { classifyJsonFile } from '../../lib/cityjson'
import { loadReport, loadSceneSources } from './load-scene'

function isCityJsonFileName(name: string) {
  return name.endsWith('.jsonl') || name.endsWith('.city.json') || name.endsWith('.cityjson')
}

/** Classification and loading share the caller's task, including cancellation. */
export async function loadDroppedFiles(files: File[], hasDataset: boolean, append: boolean, signal: AbortSignal) {
  signal.throwIfAborted()
  const cityFiles: File[] = []
  const ambiguousFiles: File[] = []
  let reportFile: File | null = null
  for (const file of files) {
    const name = file.name.toLowerCase()
    if (isCityJsonFileName(name)) cityFiles.push(file)
    else if (name.endsWith('.json')) ambiguousFiles.push(file)
  }

  const classified = await Promise.all(ambiguousFiles.map(async file => ({ file, kind: await classifyJsonFile(file) })))
  signal.throwIfAborted()
  const unknownFiles: File[] = []
  for (const { file, kind } of classified) {
    if (kind === 'cityjson') cityFiles.push(file)
    else if (kind === 'validation-report') reportFile = file
    else unknownFiles.push(file)
  }
  for (const file of unknownFiles) {
    if (hasDataset || cityFiles.length > 0) reportFile = file
    else cityFiles.push(file)
  }

  if (cityFiles.length > 0) {
    const loaded = await loadSceneSources({
      sources: cityFiles.map(file => ({ kind: 'file', file })),
      report: reportFile && !append ? { kind: 'file', file: reportFile } : undefined,
    }, signal)
    return { kind: 'scene' as const, loaded, append }
  }
  if (reportFile) {
    if (hasDataset) return { kind: 'report' as const, report: await loadReport({ kind: 'file', file: reportFile }, signal) }
    const loaded = await loadSceneSources({ sources: [{ kind: 'file', file: reportFile }] }, signal)
    return { kind: 'scene' as const, loaded, append }
  }
  return null
}
