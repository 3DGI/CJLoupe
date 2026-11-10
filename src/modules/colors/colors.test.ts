import { describe, expect, test } from 'bun:test'
import { analyzeAttributeValues, colorizeAttributeAnalysis } from './analysis'
import { ATTRIBUTE_COLOR_MAPS } from './palettes'

describe('attribute colours', () => {
  test('palette changes reuse analysed values and histogram counts', () => {
    let visits = 0
    function* entries(): Generator<readonly [string, unknown]> {
      for (const [id, value] of [['a', 0], ['b', 10], ['c', null], ['d', 20]] as const) { visits++; yield [id, value] }
    }
    const analysis = analyzeAttributeValues('height', entries())
    const viridis = colorizeAttributeAnalysis(analysis, 'viridis', ATTRIBUTE_COLOR_MAPS.viridis)!
    const plasma = colorizeAttributeAnalysis(analysis, 'plasma', ATTRIBUTE_COLOR_MAPS.plasma)!
    expect(visits).toBe(4)
    expect(analysis.dataMin).toBe(0)
    expect(analysis.dataMax).toBe(20)
    expect(analysis.missingCount).toBe(1)
    expect(plasma.valuesByObjectKey).toBe(viridis.valuesByObjectKey)
    expect(analysis.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3)
    if (plasma.kind === 'continuous' && viridis.kind === 'continuous') expect(plasma.bins[0].color).not.toBe(viridis.bins[0].color)
  })

  test('mixed values are categorical with stable identities and seeded overrides', () => {
    const analysis = analyzeAttributeValues('usage', [['a', 12], ['b', '12'], ['c', false], ['d', ''], ['__proto__', 'office']])
    expect(analysis.kind).toBe('categorical')
    expect(analysis.missingCount).toBe(1)
    expect(analysis.categories.map(category => category.key)).toContain('number:12')
    expect(analysis.categories.map(category => category.key)).toContain('string:12')
    const first = colorizeAttributeAnalysis(analysis, 'random', [], 42, { 'string:office': '#123456' })!
    const second = colorizeAttributeAnalysis(analysis, 'random', [], 42, { 'string:office': '#123456' })!
    expect(second).toEqual(first)
    if (first.kind === 'categorical') expect(first.directColorsByObjectKey['__proto__']).toBe('#123456')
  })

  test('empty, all-missing and constant domains remain finite', () => {
    for (const entries of [[], [['a', null], ['b', ' ']], [['a', 4], ['b', 4]]] as Array<Array<[string, unknown]>>) {
      const analysis = analyzeAttributeValues('value', entries)
      expect(Number.isFinite(analysis.dataMin)).toBe(true)
      expect(Number.isFinite(analysis.dataMax)).toBe(true)
      expect(analysis.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(analysis.values.length)
    }
  })

  test('large attributes do not exceed function argument limits', () => {
    function* entries(): Generator<readonly [string, unknown]> {
      for (let index = 0; index < 200000; index++) yield [String(index), index]
    }
    const analysis = analyzeAttributeValues('value', entries())
    expect([analysis.dataMin, analysis.dataMax, analysis.objectCount]).toEqual([0, 199999, 200000])
  })
})
