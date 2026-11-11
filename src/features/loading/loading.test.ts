import { describe, expect, test } from 'bun:test'
import { createLatestTaskRunner } from './latest-task'
import { assembleScene, loadSceneSources } from './load-scene'
import { parseCityJson } from '../../lib/cityjson'
import { loadDroppedFiles } from './drop-files'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const source = JSON.stringify({ type: 'CityJSON', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], CityObjects: { a: { type: 'Building', geometry: [{ type: 'MultiSurface', boundaries: [[[0, 1, 2]]] }] } } })

describe('dataset loading', () => {
  test('a slow obsolete result cannot replace a newer load or finish its loading state', async () => {
    const runner = createLatestTaskRunner(), slow = deferred<string>(), fast = deferred<string>()
    const events: string[] = []
    const callbacks = (name: string) => ({ start: () => events.push(`start:${name}`), apply: (value: string) => events.push(value), error: () => events.push(`error:${name}`), finish: () => events.push(`finish:${name}`) })
    let oldSignal!: AbortSignal
    const first = runner.run(signal => { oldSignal = signal; return slow.promise }, callbacks('old'))
    const second = runner.run(() => fast.promise, callbacks('new'))
    expect(oldSignal.aborted).toBe(true)
    fast.resolve('new-data'); await second
    slow.resolve('old-data'); await first
    expect(events).toEqual(['start:old', 'start:new', 'new-data', 'finish:new'])
  })

  test('obsolete errors and cancellation do not reach the application', async () => {
    const runner = createLatestTaskRunner(), work = deferred<string>()
    const events: unknown[] = []
    const pending = runner.run(() => work.promise, { start() {}, apply: value => events.push(value), error: error => events.push(error), finish: () => events.push('finish') })
    runner.cancel()
    work.reject(new Error('obsolete')); await pending
    expect(events).toEqual([])
  })

  test('current load failures finish and report an error', async () => {
    const runner = createLatestTaskRunner(), events: unknown[] = []
    await runner.run(async () => { throw new Error('failure') }, { start() {}, apply() {}, error: error => events.push((error as Error).message), finish: () => events.push('finish') })
    expect(events).toEqual(['failure', 'finish'])
  })

  test('file loading and append preserve source provenance and attach matching reports', async () => {
    const current = parseCityJson(source, 'first.city.json')
    const loaded = await loadSceneSources({ sources: [{ kind: 'file', file: new File([source.replaceAll('"a"', '"b"')], 'second.city.json') }], report: { kind: 'file', file: new File([JSON.stringify({ features: [{ id: 'b', validity: true, errors: [] }] })], 'report.json') } }, new AbortController().signal)
    const combined = assembleScene(loaded, current, true)
    expect(combined.sources.map(item => item.name)).toEqual(['first.city.json', 'second.city.json'])
    expect(combined.features.find(feature => feature.id === 'b')?.validity).toBe(true)
    expect(combined.validationSource?.name).toBe('report.json')
    expect(current.features).toHaveLength(1)
    expect(assembleScene(loaded, current, false).features).toHaveLength(1)
  })

  test('an old drop still classifying cannot overtake a newer file load', async () => {
    const runner = createLatestTaskRunner(), classification = deferred<string>()
    class SlowFile extends File { text() { return classification.promise } }
    const events: string[] = []
    const oldDrop = runner.run(
      signal => loadDroppedFiles([new SlowFile([], 'old.json')], false, false, signal),
      { start() {}, apply: () => events.push('old applied'), error: () => events.push('old error'), finish: () => events.push('old finished') },
    )
    await runner.run(
      signal => loadSceneSources({ sources: [{ kind: 'file', file: new File([source], 'new.city.json') }] }, signal),
      { start() {}, apply: () => events.push('new applied'), error: () => events.push('new error'), finish: () => events.push('new finished') },
    )
    classification.resolve(source)
    await oldDrop
    expect(events).toEqual(['new applied', 'new finished'])
  })

  test('drops classify CityJSON and reports within one load and preserve append policy', async () => {
    const signal = new AbortController().signal
    const city = new File([source], 'model.json')
    const report = new File([JSON.stringify({ features: [{ id: 'a', validity: true, errors: [] }] })], 'report.json')
    const together = await loadDroppedFiles([city, report], false, false, signal)
    expect(together?.kind).toBe('scene')
    if (together?.kind !== 'scene') throw new Error('Expected scene')
    expect(assembleScene(together.loaded, null, together.append).features[0].validity).toBe(true)
    expect((await loadDroppedFiles([report], true, false, signal))?.kind).toBe('report')
    const appended = await loadDroppedFiles([new File([source], 'model.CITY.JSON')], true, true, signal)
    expect(appended?.kind === 'scene' && appended.append).toBe(true)
    expect(await loadDroppedFiles([new File(['ignore'], 'notes.txt')], true, false, signal)).toBeNull()
  })
})
