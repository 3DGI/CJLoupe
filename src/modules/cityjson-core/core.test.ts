import { vertexAt } from './buffers'
import { describe, expect, test } from 'bun:test'
import { collectAttributeValues } from './attributes'
import { resolveObjectGeometries } from './geometry'
import { combineViewerDatasets, parseCityJson, parseCityJsonSequence } from './parse'

const document = {
  type: 'CityJSON', version: '2.0',
  transform: { scale: [0.1, 0.1, 0.1], translate: [100000, 400000, 0] },
  vertices: [[0, 0, 0], [100, 0, 0], [0, 100, 0], [0, 0, 100]],
  CityObjects: {
    parent: { type: 'Building', attributes: { height: 12 }, children: ['child'] },
    child: { type: 'BuildingPart', parents: ['parent'], geometry: [
      { type: 'MultiSurface', lod: '1', boundaries: [[[0, 1, 2]]] },
      { type: 'MultiSurface', lod: '2', boundaries: [[[0, 1, 3]]], semantics: { surfaces: [{ type: 'WallSurface', name: 'wall' }], values: [0] } },
      { type: 'MultiSurface', lod: '2', boundaries: [[[1, 2, 3]]] },
    ] },
  },
}

describe('standalone CityJSON core', () => {
  test('preserves world coordinates, hierarchy, geometry indices and all geometries at a LoD', () => {
    const dataset = parseCityJson(JSON.stringify(document), 'sample')
    const feature = dataset.features[0]
    const child = feature.objects.find(object => object.id === 'child')!
    expect(vertexAt(feature.vertices, 1)).toEqual([100010, 400000, 0])
    expect(child.parentIds).toEqual(['parent'])
    expect(resolveObjectGeometries(child, { kind: 'best' }).map(geometry => geometry.index)).toEqual([1, 2])
    expect(resolveObjectGeometries(child, { kind: 'lod', lod: '1' })).toHaveLength(1)
    expect(child.geometries[1].semanticSurfaces[0]?.attributes.name).toBe('wall')
    expect([...collectAttributeValues(dataset, 'height', true)]).toEqual([['parent::parent', 12], ['parent::child', 12]])
    expect([...collectAttributeValues(dataset, 'height', false)][1][1]).toBeUndefined()
  })

  test('document and sequence inputs produce equivalent feature geometry', () => {
    const source = JSON.stringify(document)
    const sequence = JSON.stringify({ type: 'CityJSON', version: document.version, transform: document.transform }) + '\n' + JSON.stringify({ type: 'CityJSONFeature', id: 'parent', CityObjects: document.CityObjects, vertices: document.vertices })
    const doc = parseCityJson(source, 'document')
    const seq = parseCityJsonSequence(sequence, 'sequence')
    expect(seq.features[0].vertices).toEqual(doc.features[0].vertices)
    expect(seq.features[0].objects).toEqual(doc.features[0].objects)
    expect('sourceText' in seq).toBe(false)
    expect('sourceText' in seq.sources[0]).toBe(false)
  })

  test('combining duplicate feature IDs retains distinct, stable identities', () => {
    const left = parseCityJson(JSON.stringify(document), 'left')
    const right = parseCityJson(JSON.stringify(document), 'right')
    const combined = combineViewerDatasets([left, right])
    expect(new Set(combined.features.map(feature => feature.id)).size).toBe(2)
    expect(combineViewerDatasets([left, right]).features.map(feature => feature.id)).toEqual(combined.features.map(feature => feature.id))
    expect(left.features[0].id).toBe('parent')
  })

  test('inheritance terminates on cycles and preserves zero and false', () => {
    const dataset = parseCityJson(JSON.stringify(document), 'sample')
    const [parent, child] = dataset.features[0].objects
    parent.parentIds = [child.id]
    parent.attributes = { height: 0, flag: false }
    expect([...collectAttributeValues(dataset, 'height', true)].map(entry => entry[1])).toEqual([0, 0])
    expect([...collectAttributeValues(dataset, 'flag', true)].map(entry => entry[1])).toEqual([false, false])
    expect([...collectAttributeValues(dataset, 'absent', true)].map(entry => entry[1])).toEqual([null, null])
  })
})
