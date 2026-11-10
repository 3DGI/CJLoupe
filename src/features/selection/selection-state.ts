import type { ViewerGeometryDisplayMode, ViewerSemanticSurface } from '../../types/cityjson'

export type SelectionState = {
  selectedFeatureId: string | null
  activeObjectId: string | null
  geometryDisplayMode: ViewerGeometryDisplayMode
  activeGeometryIndex: number | null
  selectedFaceIndex: number | null
  selectedFaceRingIndex: number
  selectedVertexIndex: number | null
  selectedFaceVertexEntryIndex: number | null
  selectedSemanticSurface: { featureId: string; objectId: string; geometryIndex: number; faceIndex: number; surface: ViewerSemanticSurface | null } | null
}

export const initialSelection: SelectionState = {
  selectedFeatureId: null,
  activeObjectId: null,
  geometryDisplayMode: { kind: 'best' },
  activeGeometryIndex: null,
  selectedFaceIndex: null,
  selectedFaceRingIndex: 0,
  selectedVertexIndex: null,
  selectedFaceVertexEntryIndex: null,
  selectedSemanticSurface: null,
}

export type SelectionAction =
  | { type: 'patch'; patch: Partial<SelectionState> }
  | { type: 'reset' }
  | { type: 'update'; update: (state: SelectionState) => SelectionState }

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  if (action.type === 'reset') return { ...initialSelection }
  if (action.type === 'patch') return { ...state, ...action.patch }
  return action.update(state)
}
