import { describe, expect, test } from 'bun:test'
import { createLatestTaskRunner } from './latest-task'
import { assembleScene, loadSceneSources } from './load-scene'
import { parseCityJson } from '../../lib/cityjson'

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
})
