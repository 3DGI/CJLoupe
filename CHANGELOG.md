# Changelog

## Unreleased

- Add support for loading CityJSON files from URLs via dialog, paste, or `?url=` parameter

## 0.3.0

- Add support for regular CityJSON files
- Do not pick hidden objects
- Remember picking mode when entering/exiting inspect mode
- Refine vertex cycle panel in inspect mode
- Refine inspect mode colors and selection appearance
- New open file dialog
- Refined the desktop viewport chrome with Blender-style tool icons, a vertical tool bar, a compact bottom status bar, viewport-center coordinates, and a pick-mode dropdown.

## 0.2.0

- LoD support
- Show object tree in features list items
- Simplify details panel and add tab for object geometries
- Show loading indicator when loading a file
- Automatically enter edit mode when centering on a val3dity error item
- Redesign how object/face/vertex picking works
- feature labels now use the feature ID directly, trimming a leading `NL.IMBAG.Pand.` prefix
- feature list is now virtualized for better sidebar performance with large datasets
- feature panel header was compacted
- desktop sidebar content is no longer kept mounted while the sidebar is collapsed, reducing panel toggle cost
- detail error and attribute panels now fully reset on feature/object selection changes, preventing stale error rows from persisting across selections
- details attributes now show both active object attributes and parent feature attributes in separate sections
- edit mode now cycles ordered face ring entries, including repeated vertices, and avoids duplicate closing edges on explicitly closed rings
- entering edit mode now disables semantic coloring
- details panel hides the error count when no val3dity report is loaded
- validation report uploads now fail fast for invalid val3dity JSON structure or non-matching datasets

## 0.1.0

Initial release.

- 3D CityJSONL viewer with feature browsing and inspection
- val3dity report loading and error inspection
- semantic surface visualisation
- edit mode with face, ring, and vertex inspection
- mobile-friendly read-only inspection UI
