import type { SetStateAction } from 'react'
import { useMemo, useReducer } from 'react'
import type { SelectionState } from './selection-state'
import { initialSelection, selectionReducer } from './selection-state'

export function useViewerSelection() {
  const [selection, dispatch] = useReducer(selectionReducer, initialSelection)
  const actions = useMemo(() => {
    function set<K extends keyof SelectionState>(key: K, value: SetStateAction<SelectionState[K]>) {
      dispatch({ type: 'update', update: state => ({ ...state, [key]: typeof value === 'function' ? value(state[key]) : value }) })
    }
    return {
      setSelectedFeatureId: (value: SetStateAction<SelectionState['selectedFeatureId']>) => set('selectedFeatureId', value),
      setActiveObjectId: (value: SetStateAction<SelectionState['activeObjectId']>) => set('activeObjectId', value),
      setGeometryDisplayMode: (value: SetStateAction<SelectionState['geometryDisplayMode']>) => set('geometryDisplayMode', value),
      setActiveGeometryIndex: (value: SetStateAction<SelectionState['activeGeometryIndex']>) => set('activeGeometryIndex', value),
      setSelectedFaceIndex: (value: SetStateAction<SelectionState['selectedFaceIndex']>) => set('selectedFaceIndex', value),
      setSelectedFaceRingIndex: (value: SetStateAction<SelectionState['selectedFaceRingIndex']>) => set('selectedFaceRingIndex', value),
      setSelectedVertexIndex: (value: SetStateAction<SelectionState['selectedVertexIndex']>) => set('selectedVertexIndex', value),
      setSelectedFaceVertexEntryIndex: (value: SetStateAction<SelectionState['selectedFaceVertexEntryIndex']>) => set('selectedFaceVertexEntryIndex', value),
      setSelectedSemanticSurface: (value: SetStateAction<SelectionState['selectedSemanticSurface']>) => set('selectedSemanticSurface', value),
      patchSelection: (patch: Partial<SelectionState>) => dispatch({ type: 'patch', patch }),
      resetSelection: () => dispatch({ type: 'reset' }),
    }
  }, [])
  return { ...selection, ...actions }
}
