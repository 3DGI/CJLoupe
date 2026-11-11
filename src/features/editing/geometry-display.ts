/** Selection identifies a geometry without changing the rendered set outside edit mode. */
export type GeometrySelection = {
  editMode: boolean
  selectedFeatureId: string | null
  activeObjectId: string | null
  activeGeometryIndex: number | null
}

export function editGeometryDisplayChanged(previous: GeometrySelection, next: GeometrySelection): boolean {
  return previous.editMode !== next.editMode || (
    next.editMode && (
      previous.selectedFeatureId !== next.selectedFeatureId ||
      previous.activeObjectId !== next.activeObjectId ||
      previous.activeGeometryIndex !== next.activeGeometryIndex
    )
  )
}
