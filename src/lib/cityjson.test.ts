import { describe, expect, test } from 'bun:test'

import { parseCityJson, parseCityJsonSequence } from './cityjson'

const extensionReport = {
  val3dity_version: '2.7.0',
  validity: false,
}

describe('val3dity CityJSON extension v0.3.0', () => {
  test('reads snake_case report metadata and cross-feature errors', () => {
    const dataset = parseCityJson(JSON.stringify({
      type: 'CityJSON',
      version: '2.0',
      '+val3dity-report': extensionReport,
      CityObjects: {
        building: {
          type: 'Building',
          children: ['part-a', 'part-b'],
          attributes: {
            '+val3dity-validation': {
              validity: false,
              geometries: [],
              features: [{
                code: 601,
                description: 'BUILDINGPARTS_OVERLAP',
                info: 'geometries overlap',
                sourceId: 'coid=part-a|geom=0&&coid=part-b|geom=0',
                location: {},
              }],
            },
          },
        },
        'part-a': {
          type: 'BuildingPart',
          parents: ['building'],
          geometry: [solidGeometry()],
        },
        'part-b': {
          type: 'BuildingPart',
          parents: ['building'],
          geometry: [solidGeometry()],
        },
      },
      vertices: cubeVertices,
    }), 'buildingparts_re.city.json')

    expect(dataset.validationSource?.name).toBe('embedded val3dity 2.7.0 report')
    expect(dataset.features).toHaveLength(1)
    expect(dataset.features[0]).toMatchObject({ validity: false })
    expect(dataset.features[0]?.errors).toEqual([
      expect.objectContaining({ code: 601, cityObjectId: 'part-a', geometryIndex: 0 }),
      expect.objectContaining({ code: 601, cityObjectId: 'part-b', geometryIndex: 0 }),
    ])
  })

  test('marks objects without per-object validation as valid when the v0.3.0 report is present', () => {
    const dataset = parseCityJson(JSON.stringify({
      type: 'CityJSON',
      version: '2.0',
      '+val3dity-report': { val3dity_version: '2.7.0', validity: true },
      CityObjects: {
        building: { type: 'Building', geometry: [solidGeometry()] },
      },
      vertices: cubeVertices,
    }), 'valid.city.json')

    expect(dataset.validationSource?.name).toBe('embedded val3dity 2.7.0 report')
    expect(dataset.features[0]).toMatchObject({ validity: true, errors: [] })
  })

  test('reads v0.3.0 reports in CityJSON feature sequences', () => {
    const sequence = [
      JSON.stringify({ type: 'CityJSON', version: '2.0', '+val3dity-report': extensionReport }),
      JSON.stringify({
        type: 'CityJSONFeature',
        id: 'building',
        CityObjects: {
          building: {
            type: 'Building',
            attributes: {
              '+val3dity-validation': {
                validity: false,
                geometries: [{
                  geometryIndex: 0,
                  errors: [{
                    code: 203,
                    description: 'NON_PLANAR_POLYGON_DISTANCE_PLANE',
                    sourceId: 'coid=building|geom=0|shell=0|face=1',
                    location: { shellIndex: 0, faceIndex: 1 },
                  }],
                }],
              },
            },
            geometry: [solidGeometry()],
          },
        },
        vertices: cubeVertices,
      }),
    ].join('\n')

    const dataset = parseCityJsonSequence(sequence, 'invalid.city.jsonl')

    expect(dataset.validationSource?.name).toBe('embedded val3dity 2.7.0 report')
    expect(dataset.features[0]?.errors).toEqual([expect.objectContaining({
      cityObjectId: 'building',
      geometryIndex: 0,
      shellIndex: 0,
      faceIndex: 1,
    })])
  })
})

const cubeVertices = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
]

function solidGeometry() {
  return {
    type: 'Solid',
    boundaries: [[[
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 3, 7, 4],
      [3, 2, 6, 7],
      [2, 1, 5, 6],
      [1, 0, 4, 5],
    ]]],
  }
}
