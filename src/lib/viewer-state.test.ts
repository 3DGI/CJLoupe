import { describe, expect, test } from 'bun:test'
import { strFromU8, unzipSync } from 'fflate'

import {
  CJLOUPE_VIEWER_STATE_PROPERTY,
  createViewerShareOutput,
  decodeViewerState,
  embedViewerStateInCityJson,
  encodeViewerState,
  getViewerShareMode,
  resolveEmbeddedViewerState,
} from './viewer-state'
import type { ViewerDataset, ViewerDatasetSource } from '../types/cityjson'
import type { ViewerShareStateV1 } from './viewer-state'

const state: ViewerShareStateV1 = {
  version: 1,
  camera: {
    kind: 'perspective',
    position: [123.5, 456.25, 78],
    quaternion: [0, 0, 0, 1],
    up: [0, 0, 1],
    target: [120, 450, 0],
    focalLength: 50,
    orthographicHalfHeight: null,
  },
  selection: {
    featureId: 'gebouw-東京',
    objectId: 'object/één',
    geometryDisplayMode: { kind: 'lod', lod: '2.2' },
    geometryIndex: 1,
    faceIndex: 2,
    faceRingIndex: 0,
    vertexIndex: 4,
    faceVertexEntryIndex: 1,
    semanticSurfaceSelected: true,
  },
  appearance: {
    mode: 'colormap',
    attributeColor: {
      key: 'height',
      inheritsParent: true,
      domain: { min: 1, max: 20 },
      colorMapId: 'viridis',
      reversed: false,
      categoricalSeed: 3,
      customColors: { woning: '#123456' },
    },
  },
  interaction: {
    isolateSelectedFeature: true,
    editMode: true,
    pickingMode: 'vertex',
    hideOccludedEditEdges: false,
    showVertexGizmo: true,
    mobileInspectMode: 'surface',
  },
  filters: {
    searchQuery: '東京',
    showOnlyInvalidFeatures: true,
    selectedErrorCodes: [101, 203],
    pinnedAttributeKeys: ['height'],
  },
  measurement: {
    active: true,
    points: [[1, 2, 3], [4, 5, 6]],
  },
}

describe('viewer-state codec', () => {
  test('round-trips Unicode state through base64url', () => {
    const encoded = encodeViewerState(state)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeViewerState(encoded)).toEqual(state)
  })

  test('rejects malformed and unsupported state', () => {
    expect(() => decodeViewerState('not-json')).toThrow()
    const unsupported = encodeRawState({ ...state, version: 2 })
    expect(() => decodeViewerState(unsupported)).toThrow('version')
  })
})

describe('CityJSON state embedding', () => {
  test('embeds and replaces state in a formatted CityJSON document', () => {
    const source = '{\n  "type": "CityJSON",\n  "version": "2.0",\n  "CityObjects": {},\n  "vertices": []\n}\n'
    const encoded = encodeViewerState(state)
    const embedded = embedViewerStateInCityJson(source, 'CityJSON', encoded)
    const document = JSON.parse(embedded) as Record<string, unknown>

    expect(embedded.endsWith('\n')).toBe(true)
    expect(document[CJLOUPE_VIEWER_STATE_PROPERTY]).toEqual({
      version: 1,
      encoding: 'base64url',
      state: encoded,
    })

    const replacement = encodeViewerState({ ...state, filters: { ...state.filters, searchQuery: 'updated' } })
    const replaced = JSON.parse(embedViewerStateInCityJson(embedded, 'CityJSON', replacement)) as Record<string, unknown>
    expect(replaced[CJLOUPE_VIEWER_STATE_PROPERTY]).toEqual({
      version: 1,
      encoding: 'base64url',
      state: replacement,
    })
  })

  test('rewrites only the first non-empty CityJSONSeq header line', () => {
    const source = '\r\n{"type":"CityJSON","version":"2.0","CityObjects":{},"vertices":[]}\r\n' +
      '{"type":"CityJSONFeature","id":"a","CityObjects":{},"vertices":[]}\r\n'
    const encoded = encodeViewerState(state)
    const embedded = embedViewerStateInCityJson(source, 'CityJSONFeatures', encoded)
    const lines = embedded.split('\r\n')

    expect(lines[0]).toBe('')
    expect(JSON.parse(lines[1])[CJLOUPE_VIEWER_STATE_PROPERTY].state).toBe(encoded)
    expect(lines[2]).toBe('{"type":"CityJSONFeature","id":"a","CityObjects":{},"vertices":[]}')
  })

  test('warns on conflicting embedded states', () => {
    const first = source('a.city.json', 'file', encodeViewerState(state))
    const secondState = { ...state, filters: { ...state.filters, searchQuery: 'different' } }
    const second = source('b.city.json', 'file', encodeViewerState(secondState))
    const resolved = resolveEmbeddedViewerState(dataset([first, second]))

    expect(resolved.state).toBeNull()
    expect(resolved.warning).toContain('conflicting')
  })

})

describe('share output selection', () => {
  test('creates a URL for a fully remote scene', async () => {
    const remote = dataset([source('remote.city.json', 'url')])
    remote.sources[0].location = './data/remote.city.json'

    expect(getViewerShareMode(remote)).toBe('url')
    const output = await createViewerShareOutput(remote, state, 'https://example.test/viewer/?old=1&cameraFollow=x')
    expect(output.kind).toBe('url')
    if (output.kind !== 'url') return

    const url = new URL(output.url)
    expect(url.searchParams.getAll('cj')).toEqual(['https://example.test/viewer/data/remote.city.json'])
    expect(url.searchParams.get('state')).toBe(encodeViewerState(state))
    expect(url.searchParams.has('cameraFollow')).toBe(false)
  })

  test('creates a state-enriched file for one local source', async () => {
    const local = dataset([source('local.city.json', 'file')])
    expect(getViewerShareMode(local)).toBe('file')

    const output = await createViewerShareOutput(local, state, 'https://example.test/')
    expect(output.kind).toBe('file')
    if (output.kind !== 'file') return
    expect(output.name).toBe('local.cjloupe.city.json')
    const embedded = JSON.parse(await output.data.text())[CJLOUPE_VIEWER_STATE_PROPERTY]
    expect(embedded.state).toBe(encodeViewerState(state))
    expect(embedded.sourceName).toBe('local.city.json')
  })

  test('bundles multiple sources and a standalone report', async () => {
    const bundled = dataset([
      source('same.city.json', 'file'),
      source('same.city.json', 'url'),
    ])
    bundled.validationSource = {
      name: 'report.json',
      location: 'report.json',
      sourceKind: 'file',
      sourceText: '{"features":[]}',
    }

    expect(getViewerShareMode(bundled)).toBe('archive')
    const output = await createViewerShareOutput(bundled, state, 'https://example.test/')
    expect(output.kind).toBe('archive')
    if (output.kind !== 'archive') return

    const archive = unzipSync(new Uint8Array(await output.data.arrayBuffer()))
    expect(Object.keys(archive).toSorted()).toEqual([
      'README.txt',
      'report.json',
      'same-2.cjloupe.city.json',
      'same.cjloupe.city.json',
    ])
    expect(strFromU8(archive['report.json'])).toBe('{"features":[]}')
    expect(JSON.parse(strFromU8(archive['same.cjloupe.city.json']))[CJLOUPE_VIEWER_STATE_PROPERTY].state)
      .toBe(encodeViewerState(state))
  })
})

function source(
  name: string,
  sourceKind: ViewerDatasetSource['sourceKind'],
  embeddedViewerState: string | null = null,
): ViewerDatasetSource {
  return {
    name,
    location: name,
    sourceKind,
    sourceText: '{"type":"CityJSON","version":"2.0","CityObjects":{},"vertices":[]}',
    embeddedViewerState,
    embeddedViewerStateError: null,
    embeddedSourceName: null,
    cityJsonKind: 'CityJSON',
    cityJsonVersion: '2.0',
    featureCount: 0,
    transform: null,
    metadata: null,
  }
}

function dataset(sources: ViewerDatasetSource[]): ViewerDataset {
  return {
    sourceName: sources.length === 1 ? sources[0].name : `${sources.length} CityJSON files`,
    sourceLocation: sources.map((entry) => entry.location).join('\n'),
    sourceText: sources.length === 1 ? sources[0].sourceText : '',
    sources,
    validationSource: null,
    center: [0, 0, 0],
    extent: [0, 0, 0, 0, 0, 0],
    features: [],
    cityJsonVersion: '2.0',
    cityJsonKind: sources.length === 1 ? 'CityJSON' : 'Multiple',
    transform: null,
    metadata: null,
  }
}

function encodeRawState(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
