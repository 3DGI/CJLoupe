import { expect, test } from 'bun:test'
import { editGeometryDisplayChanged, type GeometrySelection } from './geometry-display'

const empty: GeometrySelection = { editMode: false, selectedFeatureId: null, activeObjectId: null, activeGeometryIndex: null }
const picked = { ...empty, selectedFeatureId: 'building', activeObjectId: 'part', activeGeometryIndex: 0 }

test('first pick, switching objects/geometries and background clear only change selection', () => {
  const other = { ...picked, selectedFeatureId: 'other', activeObjectId: 'other-part', activeGeometryIndex: 2 }
  const changes = [empty, picked, other, { ...other, activeGeometryIndex: 1 }, empty, picked, empty]
  for (let i = 1; i < changes.length; i++) expect(editGeometryDisplayChanged(changes[i - 1], changes[i])).toBe(false)
})

test('editing still updates the displayed set on mode, object and geometry changes', () => {
  const editing = { ...picked, editMode: true }
  expect(editGeometryDisplayChanged(picked, editing)).toBe(true)
  expect(editGeometryDisplayChanged(editing, picked)).toBe(true)
  expect(editGeometryDisplayChanged(editing, { ...editing, activeGeometryIndex: 1 })).toBe(true)
  expect(editGeometryDisplayChanged(editing, { ...editing, selectedFeatureId: 'other' })).toBe(true)
  expect(editGeometryDisplayChanged(editing, { ...editing, activeObjectId: 'other-part' })).toBe(true)
  expect(editGeometryDisplayChanged(editing, { ...editing })).toBe(false)
})
