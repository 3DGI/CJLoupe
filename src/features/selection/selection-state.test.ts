import { expect, test } from 'bun:test'
import { initialSelection, selectionReducer } from './selection-state'

test('selection transitions update related fields atomically and reset without mutating defaults', () => {
  const selected = selectionReducer(initialSelection, { type: 'patch', patch: { selectedFeatureId: 'a', activeObjectId: 'b', selectedFaceIndex: 2 } })
  const next = selectionReducer(selected, { type: 'patch', patch: { activeObjectId: 'c', selectedFaceIndex: null } })
  expect(next.selectedFeatureId).toBe('a')
  expect(next.activeObjectId).toBe('c')
  expect(next.selectedFaceIndex).toBeNull()
  expect(selected.selectedFaceIndex).toBe(2)
  expect(selectionReducer(next, { type: 'reset' })).toEqual(initialSelection)
  expect(initialSelection.selectedFeatureId).toBeNull()
})
