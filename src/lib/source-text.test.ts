import { expect, test } from 'bun:test'
import { parseCityJson, loadCityJsonFromFile, combineViewerDatasets, mergeValidationAnnotations } from './cityjson'
import { getDatasetSourceText, getSourceText } from './source-text'
import { parseCityJson as parseCore } from '../modules/cityjson-core/parse'

const text = JSON.stringify({ type: 'CityJSON', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], CityObjects: { a: { type: 'Building', geometry: [{ type: 'MultiSurface', boundaries: [[[0, 1, 2]]] }] } } })

test('source ownership is app-only and follows source descriptors through loading and combining', async () => {
  const core = parseCore(text, 'core')
  expect(getDatasetSourceText(core)).toBeNull()
  const app = parseCityJson(text, 'inline')
  expect(getDatasetSourceText(app)).toBe(text)
  expect('sourceText' in app).toBe(false)
  expect('sourceText' in app.sources[0]).toBe(false)
  const file = await loadCityJsonFromFile(new File([text], 'sample.city.json'))
  expect(getDatasetSourceText(file)).toBe(text)
  expect(file.sources[0].sourceKind).toBe('file')
  const combined = combineViewerDatasets([app, file])
  expect(getDatasetSourceText(combined)).toBeNull()
  expect(combined.sources.map(getSourceText)).toEqual([text, text])
  const report = '{"features":[]}'
  const validated = mergeValidationAnnotations(combined, new Map(), { name: 'report', location: 'report', sourceKind: 'generated', sourceText: report })
  expect(getSourceText(validated.validationSource)).toBe(report)
  expect('sourceText' in validated.validationSource!).toBe(false)
  expect(validated.sources.map(getSourceText)).toEqual([text, text])
})
