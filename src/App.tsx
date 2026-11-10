import type { CityViewportHandle } from '@/components/viewer/viewport-handle'
import { useAttributeColors } from '@/features/colors/use-attribute-colors'
import type { FeatureGeometryChange } from '@/features/editing/geometry-editor'
import { createGeometryEditor } from '@/features/editing/geometry-editor'
import type { DatasetInput, SceneLoadRequest } from '@/features/loading/load-scene'
import { assembleScene, loadReport, loadSceneSources } from '@/features/loading/load-scene'
import { useDatasetLoading } from '@/features/loading/use-dataset-loading'
import { useViewerSelection } from '@/features/selection/use-viewer-selection'
import { useViewerSharing } from '@/features/sharing/use-viewer-sharing'
import { DetailAttributePanel, DetailGeometryPanel, InfoPanel, SemanticSurfacePanel } from '@/features/viewer/components/detail-panels'
import { ChangelogDialogContent, InfoDialogContent, Val3dityParametersDialog } from '@/features/viewer/components/dialogs'
import { CopyIdButton, FeatureListPanel } from '@/features/viewer/components/feature-list'
import { DesktopViewportStatusBar, DesktopViewportToolbar, EditSelectionOverlay, MobileViewportToolbar, VersionButton, ViewportGeometryModeBar, ViewportHelpPanel } from '@/features/viewer/components/toolbar'
import type { DetailPaneMode, ErrorCodeFilterOption, FeatureListItem, HelpItem, InfoPanelSection, MobileInspectMode, MobilePanelView, Val3dityParameterForm } from '@/features/viewer/presentation'
import { CAMERA_FOLLOW_QUERY_PARAM, DEFAULT_CAMERA_FOCAL_LENGTH, DEFAULT_VAL3DITY_PARAMETERS, EMPTY_ATTRIBUTES, EMPTY_CITY_OBJECTS, GITHUB_REPO_URL, VIEWER_APPEARANCE_MODES, buildCameraFollowerUrl, buildVal3dityValidationOptions, collectObjectAncestors, countDatasetObjects, countErrorsByObjectId, createCameraSyncChannelId, distanceBetweenPoints, formatObjectDisplayId, getAvailablePickingModes, getCameraFollowChannelFromUrl, getCurrentFaceIndexForSourceFace, getFaceVertexCycle, getPickingModeDescription, getThemeModeLabel, isCityJsonFileName, isEditableTarget, isValidVal3dityParameters, nextPickingMode, tryParseHttpUrl, waitForNextPaint } from '@/features/viewer/presentation'
import { buildAttributeColorModel } from '@/lib/attribute-colors'
import type { AttributeColorDomain, AttributeColorMapId } from '@/modules/colors/palettes'
import { DEFAULT_ATTRIBUTE_COLOR_MAP_ID, DEFAULT_CATEGORICAL_COLOR_MAP_ID, getContinuousAttributeColorMapColors, getDefaultAttributeColorDomain, isAttributeColorMapId } from '@/modules/colors/palettes'
import {
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  FolderOpen,
  Maximize2,
  Minimize2,
  Moon,
  Share2,
  Sun,
  SunMoon,
  TriangleAlert,
  Upload,
  X
} from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import gitIconBlackUrl from '@/assets/git-icon-black.svg'
import gitIconWhiteUrl from '@/assets/git-icon-white.svg'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/components/use-theme'
import {
  ORTHOGRAPHIC_CAMERA_VALUE
} from '@/lib/camera'
import type { LoadedValidationReport } from '@/lib/cityjson'
import {
  assertValidationAnnotationsMatchDataset,
  classifyJsonFile,
  mergeValidationAnnotations
} from '@/lib/cityjson'
import {
  collectAvailableLods,
  getGeometryDisplayModeKey,
  getObjectGeometryByIndex,
  normalizeObjectGeometryIndex,
  resolveObjectGeometryIndex,
} from '@/lib/object-geometry'
import { cn } from '@/lib/utils'
import { validateDatasetWithVal3dity } from '@/lib/val3dity-wasm'
import type { ViewerCameraPose, ViewerShareStateV1 } from '@/lib/viewer-state'
import {
  VIEWER_STATE_VERSION,
  getViewerStateFromUrl,
  resolveViewerStateForDataset
} from '@/lib/viewer-state'
import type {
  Vec3,
  ViewerAppearanceMode,
  ViewerDataset,
  ViewerFocusTarget,
  ViewerGeometryDisplayMode,
  ViewerPickingMode,
  ViewerSemanticSurface,
  ViewerValidationError,
  ViewerValidationSource
} from '@/types/cityjson'
import changelogText from '../CHANGELOG.md?raw'

type ExampleDatasetConfig = {
  id: string
  name: string
  description: string
  formatBadges: readonly string[]
  cityJsonUrls: readonly string[]
  validationReportUrl?: string
}
const EXAMPLE_DATASETS: readonly ExampleDatasetConfig[] = [
  {
    id: 'rf-val3dity',
    name: 'Weesperstraat, Amsterdam',
    description: 'An old roofer reconstruction with a matching val3dity validation report.',
    formatBadges: ['CityJSONSeq', 'val3dity annotations'],
    cityJsonUrls: [`${import.meta.env.BASE_URL}samples/rf-val3dity.city.jsonl`],
    validationReportUrl: `${import.meta.env.BASE_URL}samples/val-report.json`,
  },
]
const CityViewport = lazy(() =>
  import('@/components/viewer/city-viewport').then((module) => ({ default: module.CityViewport })),
)

function App() {
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const { selectedFeatureId, activeObjectId, geometryDisplayMode, activeGeometryIndex, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex, selectedFaceVertexEntryIndex, selectedSemanticSurface, setSelectedFeatureId, setActiveObjectId, setGeometryDisplayMode, setActiveGeometryIndex, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedVertexIndex, setSelectedFaceVertexEntryIndex, setSelectedSemanticSurface, patchSelection, resetSelection } = useViewerSelection()
  const viewportRef = useRef<CityViewportHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const annotationInputRef = useRef<HTMLInputElement>(null)
  const fileDialogTriggerRef = useRef<HTMLButtonElement>(null)
  const preInspectPickingModeRef = useRef<ViewerPickingMode>('object')
  const inspectPickingModeRef = useRef<ViewerPickingMode>('face')
  const pendingViewportDatasetRef = useRef<ViewerDataset | null>(null)
  const appendNextCityJsonFileSelectionRef = useRef(false)
  const datasetRef = useRef<ViewerDataset | null>(null)
  const [initialViewerStateResolution] = useState(() => getViewerStateFromUrl(window.location.href))
  const pendingUrlViewerStateRef = useRef<ReturnType<typeof getViewerStateFromUrl> | null>(
    initialViewerStateResolution,
  )
  const pendingCameraPoseRef = useRef<ViewerCameraPose | null>(null)
  const latestCameraPoseRef = useRef<ViewerCameraPose | null>(null)

  const [cameraFollowChannel, setCameraFollowChannel] = useState(() => getCameraFollowChannelFromUrl())
  const [cameraPublishChannel, setCameraPublishChannel] = useState<string | null>(null)
  const [dataset, setDataset] = useState<ViewerDataset | null>(null)
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).has('cj') ? null : initialViewerStateResolution.warning)
  const [isLoading, setIsLoading] = useState(() => new URLSearchParams(window.location.search).has('cj'))
  const [isPaneCollapsed, setIsPaneCollapsed] = useState(isMobileLayout)
  const [editMode, setEditMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [geometryEditor] = useState(createGeometryEditor)
  const [geometryChange, setGeometryChange] = useState<FeatureGeometryChange | null>(null)
  const geometryRevision = geometryChange?.revision ?? 0
  const [viewportResetRevision, setViewportResetRevision] = useState(0)
  const [topDownViewRevision, setTopDownViewRevision] = useState(0)
  const [focusRevision, setFocusRevision] = useState(0)
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget>(null)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [cameraFocalLength, setCameraFocalLength] = useState(DEFAULT_CAMERA_FOCAL_LENGTH)
  const [viewportCenter, setViewportCenter] = useState<Vec3 | null>(null)
  const [measurementActive, setMeasurementActive] = useState(false)
  const [measurementPoints, setMeasurementPoints] = useState<Vec3[]>([])
  const [hideOccludedEditEdges, setHideOccludedEditEdges] = useState(true)
  const [showOnlyInvalidFeatures, setShowOnlyInvalidFeatures] = useState(false)
  const [selectedErrorCodes, setSelectedErrorCodes] = useState<number[] | null>(null)
  const [appearanceMode, setAppearanceMode] = useState<ViewerAppearanceMode>('semantic')
  const { attributeColorDomainsByKeyRef, attributeColorMapIdsByKeyRef, attributeColorMapReversedByKeyRef, attributeColorSeedsByKeyRef, attributeColorKey, setAttributeColorKey, attributeColorInheritsParent, setAttributeColorInheritsParent, setAttributeColorDomain, attributeColorMapId, setAttributeColorMapId, attributeColorMapReversed, setAttributeColorMapReversed, attributeCategoricalColorSeed, setAttributeCategoricalColorSeed, customCategoricalColorMaps, setCustomCategoricalColorMaps, attributeColorModel, activeAttributeColorDomain, availableAttributeColorViewportState, attributeColorViewportState } = useAttributeColors(dataset, appearanceMode)
  const [isolateSelectedFeature, setIsolateSelectedFeature] = useState(false)
  const [showObjectExtents, setShowObjectExtents] = useState(false)
  const [pinnedAttributeKeys, setPinnedAttributeKeys] = useState<string[]>([])
  const [isPinnedAttributesOpen, setIsPinnedAttributesOpen] = useState(false)
  const [infoPanelOpenSections, setInfoPanelOpenSections] = useState<Record<InfoPanelSection, boolean>>({
    pinned: true,
    attribute: true,
    semantic: false,
  })
  const [detailTab, setDetailTab] = useState('attributes')
  const [detailPaneMode, setDetailPaneMode] = useState<DetailPaneMode>('split')
  const [isDragging, setIsDragging] = useState(false)
  const [isHelpCollapsed, setIsHelpCollapsed] = useState(true)
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(() => !new URLSearchParams(window.location.search).has('cj') && !initialViewerStateResolution.warning)
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false)
  const [isChangelogDialogOpen, setIsChangelogDialogOpen] = useState(false)
  const [isVal3dityDialogOpen, setIsVal3dityDialogOpen] = useState(false)
  const [cityJsonUrlInput, setCityJsonUrlInput] = useState('')
  const [annotationUrlInput, setAnnotationUrlInput] = useState('')
  const [val3dityParameters, setVal3dityParameters] = useState<Val3dityParameterForm>(DEFAULT_VAL3DITY_PARAMETERS)
  const [mobileInspectMode, setMobileInspectMode] = useState<MobileInspectMode>('object')
  const [mobilePanelView, setMobilePanelView] = useState<MobilePanelView>('features')
  const [dismissedErrorMessage, setDismissedErrorMessage] = useState<string | null>(null)
  const [pickingMode, setPickingMode] = useState<ViewerPickingMode>('object')
  const [showVertexGizmo, setShowVertexGizmo] = useState(false)
  const [cameraRestoreRequest, setCameraRestoreRequest] = useState<{
    revision: number
    pose: ViewerCameraPose
  } | null>(null)
  const [hasCameraPose, setHasCameraPose] = useState(false)
  const runLoad = useDatasetLoading({ pendingDataset: pendingViewportDatasetRef, setError, setIsLoading, setLoadingMessage, setIsFileDialogOpen })
  const dragCountRef = useRef(0)
  const { theme, themeMode, toggleTheme } = useTheme()
  const annotationSourceName = dataset?.validationSource?.name ?? null
  const annotationSourceLocation = dataset?.validationSource?.location ?? null

  const featureMap = useMemo(() => {
    void geometryRevision
    return new Map(dataset?.features.map((feature) => [feature.id, feature]) ?? [])
  }, [dataset, geometryRevision])

  useEffect(() => {
    datasetRef.current = dataset
  }, [dataset])

  const selectedFeature = selectedFeatureId ? featureMap.get(selectedFeatureId) ?? null : null
  const availableLods = useMemo(() => collectAvailableLods(dataset), [dataset])
  const selectedFeatureObjects = selectedFeature?.objects ?? EMPTY_CITY_OBJECTS
  const activeObject =
    selectedFeatureObjects.find((object) => object.id === activeObjectId) ??
    selectedFeatureObjects[0] ??
    null
  const activeObjectAttributes = activeObject?.attributes ?? EMPTY_ATTRIBUTES
  const parentAttributeObjects = useMemo(
    () => collectObjectAncestors(activeObject, selectedFeatureObjects)
      .filter((object) => Object.keys(object.attributes).length > 0),
    [activeObject, selectedFeatureObjects],
  )
  const detailTitleLabel = activeObject ? formatObjectDisplayId(activeObject.id) : selectedFeature?.label ?? 'No item selected'
  const resolvedActiveGeometryIndex = activeObject
    ? resolveObjectGeometryIndex(activeObject, geometryDisplayMode, activeGeometryIndex)
    : null
  const activeObjectGeometry = getObjectGeometryByIndex(activeObject, resolvedActiveGeometryIndex)
  const activeObjectGeometryCount = activeObject?.geometries.length ?? 0
  const activeObjectAttributeCount = activeObject ? Object.keys(activeObject.attributes).length : 0
  const detailAttributeCount = activeObjectAttributeCount + parentAttributeObjects.reduce(
    (count, object) => count + Object.keys(object.attributes).length,
    0,
  )
  const selectedFace =
    activeObjectGeometry && selectedFaceIndex != null
      ? activeObjectGeometry.polygons[selectedFaceIndex] ?? null
      : null
  const selectedFaceRingCount = selectedFace?.length ?? 0
  const selectedFaceHoleCount = Math.max(selectedFaceRingCount - 1, 0)
  const activeFaceRingIndex =
    selectedFaceRingCount > 0
      ? Math.min(selectedFaceRingIndex, selectedFaceRingCount - 1)
      : 0
  const selectedFaceVertexIndices = useMemo(
    () => getFaceVertexCycle(selectedFace, activeFaceRingIndex),
    [activeFaceRingIndex, selectedFace],
  )
  const selectedFaceVertexCount = selectedFaceVertexIndices.length
  const activeSelectedFaceVertexEntryIndex =
    selectedFaceVertexEntryIndex != null &&
    selectedFaceVertexEntryIndex >= 0 &&
    selectedFaceVertexEntryIndex < selectedFaceVertexCount
      ? selectedFaceVertexEntryIndex
      : null
  const selectedFaceVertexEntryLabel =
    activeSelectedFaceVertexEntryIndex != null
      ? `vtx entry   ${activeSelectedFaceVertexEntryIndex + 1}/${selectedFaceVertexCount}`
      : null
  const measurementDistance = measurementPoints.length === 2
    ? distanceBetweenPoints(measurementPoints[0], measurementPoints[1])
    : null
  const selectedFaceRingLabel =
    selectedFaceRingCount === 0
      ? 'No ring selected'
      : activeFaceRingIndex === 0
        ? 'Outer ring'
        : `Hole ${activeFaceRingIndex}/${selectedFaceHoleCount}`
  const effectivePickingMode = pickingMode
  const visibleDetailErrors = useMemo(() => {
    if (!selectedFeature) {
      return []
    }

    return selectedFeature.errors.filter((error) => {
      if (activeObjectId && error.cityObjectId && error.cityObjectId !== activeObjectId) {
        return false
      }

      return true
    })
  }, [activeObjectId, selectedFeature])
  const visibleDetailErrorCount = visibleDetailErrors.length
  const hasDetailErrors = visibleDetailErrorCount > 0
  const hasDetailAttributes = detailAttributeCount > 0
  const hasDetailGeometries = activeObjectGeometryCount > 0
  const hasDetailGeometryInfo = hasDetailGeometries || hasDetailErrors
  const pinnableAttributeOptions = useMemo(() => {
    if (!activeObject) {
      return []
    }

    const pinnedSet = new Set(pinnedAttributeKeys)
    const optionMap = new Map<string, { key: string; isInherited: boolean }>()
    for (const key of Object.keys(activeObject.attributes).toSorted((left, right) => left.localeCompare(right))) {
      if (!pinnedSet.has(key)) {
        optionMap.set(key, { key, isInherited: false })
      }
    }

    if (attributeColorInheritsParent) {
      for (const ancestor of collectObjectAncestors(activeObject, selectedFeatureObjects)) {
        for (const key of Object.keys(ancestor.attributes)) {
          if (!optionMap.has(key) && !pinnedSet.has(key)) {
            optionMap.set(key, { key, isInherited: true })
          }
        }
      }
    }

    return Array.from(optionMap.values()).toSorted((left, right) =>
      Number(left.isInherited) - Number(right.isInherited) ||
      left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [activeObject, attributeColorInheritsParent, pinnedAttributeKeys, selectedFeatureObjects])
  const pinnedAttributes = useMemo(() => {
    const activeObjectAncestors = pinnedAttributeKeys.length > 0 && attributeColorInheritsParent
      ? collectObjectAncestors(activeObject, selectedFeatureObjects)
      : EMPTY_CITY_OBJECTS
    const inheritedAttributes = new Map<string, unknown>()
    for (const ancestor of activeObjectAncestors) {
      for (const [key, value] of Object.entries(ancestor.attributes)) {
        if (!inheritedAttributes.has(key)) {
          inheritedAttributes.set(key, value)
        }
      }
    }

    return pinnedAttributeKeys.map((key) => {
      if (Object.prototype.hasOwnProperty.call(activeObjectAttributes, key)) {
        return { key, hasValue: true, value: activeObjectAttributes[key], isInherited: false }
      }

      if (inheritedAttributes.has(key)) {
        return { key, hasValue: true, value: inheritedAttributes.get(key), isInherited: true }
      }

      return { key, hasValue: false, value: undefined, isInherited: false }
    })
  }, [activeObject, activeObjectAttributes, attributeColorInheritsParent, pinnedAttributeKeys, selectedFeatureObjects])
  const pinnedAttributeCount = pinnedAttributeKeys.length
  const showSemanticSurfaces = appearanceMode === 'semantic'
  const availableDetailTabs = [
    hasDetailAttributes ? 'attributes' : null,
    hasDetailGeometryInfo ? 'geometries' : null,
  ].filter((value): value is string => value !== null)
  const hasDetailContent = availableDetailTabs.length > 0
  const resolvedDetailTab = availableDetailTabs.includes(detailTab) ? detailTab : (availableDetailTabs[0] ?? 'attributes')
  const detailSelectionKey = `${selectedFeature?.id ?? 'none'}::${activeObject?.id ?? 'none'}`
  const selectedFaceSemanticSurface =
    editMode && activeObjectGeometry && selectedFaceIndex != null
      ? activeObjectGeometry.semanticSurfaces[selectedFaceIndex] ?? null
      : null
  const activeSemanticSurface = selectedSemanticSurface?.surface
    ? {
        objectId: selectedSemanticSurface.objectId,
        geometryIndex: selectedSemanticSurface.geometryIndex,
        faceIndex: selectedSemanticSurface.faceIndex,
        surface: selectedSemanticSurface.surface,
      }
    : null

  const featureListItems = useMemo<FeatureListItem[]>(() => {
    if (!dataset) {
      return []
    }

    return dataset.features.map((feature) => {
      const errorCountsByObjectId = countErrorsByObjectId(feature.errors)

      return {
        feature,
        objects: feature.objects,
        errorCountsByObjectId,
        errorCount: feature.errors.length,
        isInvalid: feature.validity === false,
        searchText: [
          feature.id,
          feature.label,
          ...feature.objects.map((object) => object.id),
          ...feature.objects.map((object) => object.type),
          ...Object.values(feature.attributes),
          ...feature.objects.flatMap((object) => Object.values(object.attributes)),
        ]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLowerCase(),
      }
    })
  }, [dataset])

  const availableErrorCodeFilters = useMemo<ErrorCodeFilterOption[]>(() => {
    if (!dataset) {
      return []
    }

    const optionsByCode = new Map<number, ErrorCodeFilterOption>()
    for (const feature of dataset.features) {
      for (const error of feature.errors) {
        if (!error.cityObjectId) {
          continue
        }

        const option = optionsByCode.get(error.code)
        if (option) {
          option.count += 1
        } else {
          optionsByCode.set(error.code, {
            code: error.code,
            description: error.description,
            count: 1,
          })
        }
      }
    }

    return Array.from(optionsByCode.values()).toSorted((left, right) => left.code - right.code)
  }, [dataset])

  const selectedErrorCodeSet = useMemo(
    () => selectedErrorCodes === null ? null : new Set(selectedErrorCodes),
    [selectedErrorCodes],
  )

  const filteredFeatureItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return featureListItems.flatMap((item) => {
      if (!query) {
        if (!showOnlyInvalidFeatures) {
          return [item]
        }
      } else if (!item.searchText.includes(query)) {
        return []
      }

      if (!showOnlyInvalidFeatures) {
        return [item]
      }

      const errorCountsByObjectId = countErrorsByObjectId(item.feature.errors, selectedErrorCodeSet)
      if (errorCountsByObjectId.size === 0) {
        return []
      }

      const objects = item.objects.filter((object) => errorCountsByObjectId.has(object.id))
      if (objects.length === 0) {
        return []
      }

      return [{
        ...item,
        objects,
        errorCountsByObjectId,
        errorCount: Array.from(errorCountsByObjectId.values()).reduce((total, count) => total + count, 0),
      }]
    })
  }, [featureListItems, searchQuery, selectedErrorCodeSet, showOnlyInvalidFeatures])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)')
    const updateLayout = () => {
      setIsMobileLayout(mediaQuery.matches)
      if (!mediaQuery.matches) return
      setIsPaneCollapsed(true)
      setIsHelpCollapsed(true)
      setDetailPaneMode('split')
      setEditMode(false)
      setHideOccludedEditEdges(true)
      patchSelection({ selectedFaceIndex: null, selectedFaceRingIndex: 0, selectedVertexIndex: null, selectedFaceVertexEntryIndex: null })
      setMeasurementActive(false)
      setMeasurementPoints([])
    }
    mediaQuery.addEventListener('change', updateLayout)
    return () => mediaQuery.removeEventListener('change', updateLayout)
  }, [patchSelection])

  useEffect(() => {
    document.title = dataset?.sourceName ? `CJLoupe - ${dataset.sourceName}` : 'CJLoupe'
  }, [dataset?.sourceName])

  // Reconcile dependent preferences before committing a render, instead of effects
  // that first render stale controls and then schedule another commit.
  const [previousAppearanceMode, setPreviousAppearanceMode] = useState(appearanceMode)
  if (previousAppearanceMode !== appearanceMode) {
    setPreviousAppearanceMode(appearanceMode)
    if (!showSemanticSurfaces) {
      setMobileInspectMode('object')
      setSelectedSemanticSurface(null)
    }
  }
  if (appearanceMode === 'colormap' && !availableAttributeColorViewportState) setAppearanceMode('regular')
  if (!selectedFeatureId && mobilePanelView !== 'features') setMobilePanelView('features')

  useEffect(() => {
    if (attributeColorKey && !pinnedAttributeKeys.includes(attributeColorKey)) {
      setAttributeColorKey(null)
      setAttributeColorDomain(null)
    }
  }, [attributeColorKey, pinnedAttributeKeys, setAttributeColorDomain, setAttributeColorKey])

  useEffect(() => {
    if (!attributeColorKey || !attributeColorModel) return
    if (attributeColorMapIdsByKeyRef.current.has(attributeColorKey)) return
    const wanted =
      attributeColorModel.kind === 'categorical'
        ? DEFAULT_CATEGORICAL_COLOR_MAP_ID
        : DEFAULT_ATTRIBUTE_COLOR_MAP_ID
    if (attributeColorMapId !== wanted) {
      setAttributeColorMapId(wanted)
    }
  }, [attributeColorKey, attributeColorModel, attributeColorMapId, attributeColorMapIdsByKeyRef, setAttributeColorMapId])

  useEffect(() => {
    if (!attributeColorModel || attributeColorModel.kind !== 'continuous') {
      setAttributeColorDomain(null)
      return
    }

    setAttributeColorDomain((current) => {
      if (current?.key === attributeColorModel.key) {
        return current
      }

      const cachedDomain = attributeColorDomainsByKeyRef.current.get(attributeColorModel.key)
      return cachedDomain
        ? cachedDomain
        : getDefaultAttributeColorDomain(attributeColorModel)
    })
  }, [attributeColorDomainsByKeyRef, attributeColorModel, setAttributeColorDomain])

  const [previousError, setPreviousError] = useState(error)
  if (previousError !== error) {
    setPreviousError(error)
    setDismissedErrorMessage(null)
  }

  useEffect(() => {
    if (geometryDisplayMode.kind === 'lod' && !availableLods.includes(geometryDisplayMode.lod)) {
      setGeometryDisplayMode({ kind: 'best' })
    }
  }, [availableLods, geometryDisplayMode, setGeometryDisplayMode])

  useEffect(() => {
    if (!activeObject) {
      if (activeGeometryIndex != null) {
        setActiveGeometryIndex(null)
      }
      return
    }

    const normalizedGeometryIndex = normalizeObjectGeometryIndex(activeObject, activeGeometryIndex)
    if (normalizedGeometryIndex !== activeGeometryIndex) {
      setActiveGeometryIndex(normalizedGeometryIndex)
    }
  }, [activeGeometryIndex, activeObject, setActiveGeometryIndex])

  useEffect(() => {
    if (!activeObjectGeometry) {
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
      setSelectedSemanticSurface(null)
      return
    }

    const activeVertexIndices = new Set(activeObjectGeometry.vertexIndices)
    if (selectedFaceIndex != null && !activeObjectGeometry.polygons[selectedFaceIndex]) {
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
    } else if (selectedVertexIndex != null && !activeVertexIndices.has(selectedVertexIndex)) {
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
    }

    setSelectedSemanticSurface((current) => {
      if (!current) {
        return current
      }

      if (
        current.featureId !== selectedFeatureId ||
        current.objectId !== activeObjectId ||
        current.geometryIndex !== activeObjectGeometry.index
      ) {
        return null
      }

      const surface = activeObjectGeometry.semanticSurfaces[current.faceIndex] ?? null
      if (!surface) {
        return null
      }

      return {
        ...current,
        surface,
      }
    })
  }, [activeObjectGeometry, activeObjectId, selectedFaceIndex, selectedFeatureId, selectedVertexIndex, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedSemanticSurface, setSelectedVertexIndex])

  useEffect(() => {
    if (editMode || !dataset) {
      setSelectedSemanticSurface(null)
      return
    }

    setSelectedSemanticSurface((current) => {
      if (!current) {
        return current
      }

      if (current.featureId !== selectedFeatureId || current.objectId !== activeObjectId) {
        return null
      }

      const feature = dataset.features.find((candidate) => candidate.id === current.featureId)
      const object = feature?.objects.find((candidate) => candidate.id === current.objectId)
      const geometry = getObjectGeometryByIndex(object, current.geometryIndex)
      const surface = geometry?.semanticSurfaces[current.faceIndex] ?? null
      if (!surface) {
        return null
      }

      return {
        ...current,
        surface,
      }
    })
  }, [activeObjectId, dataset, editMode, selectedFeatureId, setSelectedSemanticSurface])

  const waitForViewportDataset = useCallback((nextDataset: ViewerDataset) => {
    pendingViewportDatasetRef.current = nextDataset
  }, [])



  const handleViewportDataRendered = useCallback((renderedDataset: ViewerDataset) => {
    if (pendingViewportDatasetRef.current !== renderedDataset) {
      return
    }

    pendingViewportDatasetRef.current = null
    const pendingCameraPose = pendingCameraPoseRef.current
    if (pendingCameraPose) {
      pendingCameraPoseRef.current = null
      setCameraRestoreRequest((current) => ({
        revision: (current?.revision ?? 0) + 1,
        pose: pendingCameraPose,
      }))
    }
    setIsLoading(false)
  }, [])

  async function openCityJsonFiles(files: File[], append = false) {
    if (files.length) await loadScene({ sources: files.map(file => ({ kind: 'file', file })), append })
  }
  async function openCityJsonFile(file: File, append = false) { await openCityJsonFiles([file], append) }

  const applyLoadedAnnotations = useCallback((
    expectedDataset: ViewerDataset,
    report: LoadedValidationReport,
    source: Omit<ViewerValidationSource, 'sourceText'>,
  ) => {
    const current = datasetRef.current
    if (!current || current !== expectedDataset) return
    assertValidationAnnotationsMatchDataset(current, report.annotations)
    const nextDataset = mergeValidationAnnotations(current, report.annotations, { ...source, sourceText: report.sourceText })
    datasetRef.current = nextDataset
    waitForViewportDataset(nextDataset)
    setShowOnlyInvalidFeatures(false)
    setSelectedErrorCodes(null)
    setDataset(nextDataset)
  }, [waitForViewportDataset])

  async function openAnnotations(source: DatasetInput) {
    const current = datasetRef.current
    if (!current) { setError('Open a CityJSON file before loading annotations.'); return }
    await runLoad({
      load: signal => loadReport(source, signal),
      apply: report => applyLoadedAnnotations(current, report, report.source),
      fallback: 'Failed to load annotation report.',
    })
  }
  async function openAnnotationFile(file: File) { await openAnnotations({ kind: 'file', file }) }
  async function openAnnotationFromUrl(url: string) {
    if (!url.trim()) return
    setAnnotationUrlInput('')
    await openAnnotations({ kind: 'url', url: url.trim() })
  }
  async function validateCurrentDatasetWithVal3dity() {
    const current = datasetRef.current
    if (!current) return
    setIsInfoDialogOpen(false)
    await runLoad({
      message: 'Validating…',
      fallback: 'Failed to run val3dity validation.',
      load: async signal => {
        if (!isValidVal3dityParameters(val3dityParameters)) throw new Error('Fix the val3dity parameters before running validation.')
        await waitForNextPaint()
        signal.throwIfAborted()
        return validateDatasetWithVal3dity(current, buildVal3dityValidationOptions(val3dityParameters))
      },
      apply: report => applyLoadedAnnotations(current, report, { name: 'val3dity wasm', location: 'val3dity wasm', sourceKind: 'generated' }),
    })
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) {
      void openCityJsonFiles(files, appendNextCityJsonFileSelectionRef.current)
    }
    appendNextCityJsonFileSelectionRef.current = false
    event.target.value = ''
  }

  function handleAnnotationSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void openAnnotationFile(file)
    event.target.value = ''
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    const appendToCurrentScene = event.shiftKey

    const cityFiles: File[] = []
    const ambiguousJsonFiles: File[] = []
    let reportFile: File | null = null

    for (const file of files) {
      const name = file.name.toLowerCase()
      if (isCityJsonFileName(name)) {
        cityFiles.push(file)
      } else if (name.endsWith('.json')) {
        ambiguousJsonFiles.push(file)
      }
    }

    const classifiedJsonFiles = await Promise.all(
      ambiguousJsonFiles.map(async (file) => ({ file, kind: await classifyJsonFile(file) })),
    )
    const unknownJsonFiles: File[] = []
    for (const { file, kind } of classifiedJsonFiles) {
      if (kind === 'cityjson') {
        cityFiles.push(file)
      } else if (kind === 'validation-report') {
        reportFile = file
      } else {
        unknownJsonFiles.push(file)
      }
    }

    for (const file of unknownJsonFiles) {
      if (dataset || cityFiles.length > 0) {
        reportFile = file
      } else {
        cityFiles.push(file)
      }
    }

    if (cityFiles.length > 0 && reportFile && !appendToCurrentScene) {
      void openCityJsonFilesAndReport(cityFiles, reportFile)
    } else if (cityFiles.length > 0) {
      void openCityJsonFiles(cityFiles, appendToCurrentScene)
    } else if (reportFile) {
      if (dataset) {
        void openAnnotationFile(reportFile)
      } else {
        void openCityJsonFile(reportFile, appendToCurrentScene)
      }
    }
  }

  async function openCityJsonFilesAndReport(files: File[], report: File) {
    await loadScene({ sources: files.map(file => ({ kind: 'file', file })), report: { kind: 'file', file: report } })
  }

  const resetViewerState = useCallback(() => {
    resetSelection()
    setCameraFocalLength(DEFAULT_CAMERA_FOCAL_LENGTH)
    setEditMode(false)
    setHideOccludedEditEdges(true)
    setShowOnlyInvalidFeatures(false)
    setSelectedErrorCodes(null)
    setAppearanceMode('semantic')
    setIsolateSelectedFeature(false)
    setShowObjectExtents(false)
    setDetailTab('attributes')
    setDetailPaneMode('split')
    setSearchQuery('')
    setFocusTarget(null)
    setPickingMode('object')
    setMobileInspectMode('object')
    setMeasurementActive(false)
    setMeasurementPoints([])
    setShowVertexGizmo(false)
    setPinnedAttributeKeys([])
    setIsPinnedAttributesOpen(false)
    setAttributeColorKey(null)
    setAttributeColorDomain(null)
    setAttributeColorInheritsParent(true)
    setAttributeColorMapId(DEFAULT_ATTRIBUTE_COLOR_MAP_ID)
    setAttributeColorMapReversed(false)
    setAttributeCategoricalColorSeed(0)
    setCustomCategoricalColorMaps({})
    attributeColorDomainsByKeyRef.current = new Map()
    attributeColorMapIdsByKeyRef.current = new Map()
    attributeColorMapReversedByKeyRef.current = new Map()
    attributeColorSeedsByKeyRef.current = new Map()
    preInspectPickingModeRef.current = 'object'
    inspectPickingModeRef.current = 'face'
    setViewportCenter(null)
    setViewportResetRevision((current) => current + 1)
  }, [attributeColorDomainsByKeyRef, attributeColorMapIdsByKeyRef, attributeColorMapReversedByKeyRef, attributeColorSeedsByKeyRef, resetSelection, setAttributeCategoricalColorSeed, setAttributeColorDomain, setAttributeColorInheritsParent, setAttributeColorKey, setAttributeColorMapId, setAttributeColorMapReversed, setCustomCategoricalColorMaps])

  const restoreViewerState = useCallback((nextDataset: ViewerDataset, state: ViewerShareStateV1) => {
    const availableLodSet = new Set(collectAvailableLods(nextDataset))
    const restoredGeometryDisplayMode =
      state.selection.geometryDisplayMode.kind === 'lod' &&
      availableLodSet.has(state.selection.geometryDisplayMode.lod)
        ? state.selection.geometryDisplayMode
        : { kind: 'best' } satisfies ViewerGeometryDisplayMode
    const restoredFeature = state.selection.featureId
      ? nextDataset.features.find((feature) => feature.id === state.selection.featureId) ?? null
      : null
    const restoredObject = restoredFeature && state.selection.objectId
      ? restoredFeature.objects.find((object) => object.id === state.selection.objectId) ?? null
      : null
    const restoredGeometryIndex = resolveObjectGeometryIndex(
      restoredObject,
      restoredGeometryDisplayMode,
      state.selection.geometryIndex,
    )
    const restoredGeometry = getObjectGeometryByIndex(restoredObject, restoredGeometryIndex)
    const restoredFaceIndex = restoredGeometry && state.selection.faceIndex != null &&
      state.selection.faceIndex < restoredGeometry.polygons.length
        ? state.selection.faceIndex
        : null
    const restoredFace = restoredFaceIndex != null ? restoredGeometry?.polygons[restoredFaceIndex] ?? null : null
    const restoredFaceRingIndex = restoredFace && state.selection.faceRingIndex < restoredFace.length
      ? state.selection.faceRingIndex
      : 0
    const restoredRing = restoredFace?.[restoredFaceRingIndex] ?? null
    const restoredVertexIndex = state.selection.vertexIndex != null &&
      restoredGeometry?.vertexIndices.includes(state.selection.vertexIndex)
      ? state.selection.vertexIndex
      : null
    let restoredFaceVertexEntryIndex: number | null = null
    if (restoredVertexIndex != null && restoredRing?.includes(restoredVertexIndex)) {
      restoredFaceVertexEntryIndex = state.selection.faceVertexEntryIndex != null &&
        restoredRing[state.selection.faceVertexEntryIndex] === restoredVertexIndex
        ? state.selection.faceVertexEntryIndex
        : restoredRing.indexOf(restoredVertexIndex)
    }
    const restoredSemanticSurface = state.selection.semanticSurfaceSelected &&
      restoredFeature && restoredObject && restoredGeometry && restoredFaceIndex != null
        ? restoredGeometry.semanticSurfaces[restoredFaceIndex]
          ? {
              featureId: restoredFeature.id,
              objectId: restoredObject.id,
              geometryIndex: restoredGeometry.index,
              faceIndex: restoredFaceIndex,
              surface: restoredGeometry.semanticSurfaces[restoredFaceIndex],
            }
          : null
        : null

    const availableAttributeKeys = new Set(
      nextDataset.features.flatMap((feature) => feature.objects.flatMap((object) => Object.keys(object.attributes))),
    )
    const attributeSettings = state.appearance.attributeColor
    const restoredCustomColors: Record<string, Record<string, string>> = {}
    for (const settings of state.appearance.attributeColors ?? []) {
      if (!availableAttributeKeys.has(settings.key)) continue
      if (isAttributeColorMapId(settings.colorMapId)) {
        attributeColorMapIdsByKeyRef.current.set(settings.key, settings.colorMapId)
      }
      if (settings.domain) {
        attributeColorDomainsByKeyRef.current.set(settings.key, { key: settings.key, ...settings.domain })
      }
      attributeColorMapReversedByKeyRef.current.set(settings.key, settings.reversed)
      attributeColorSeedsByKeyRef.current.set(settings.key, settings.categoricalSeed)
      restoredCustomColors[settings.key] = settings.customColors
    }
    const restoredAttributeKey = attributeSettings && availableAttributeKeys.has(attributeSettings.key)
      ? attributeSettings.key
      : null
    const restoredPinnedAttributeKeys = [...new Set(state.filters.pinnedAttributeKeys)]
      .filter((key) => availableAttributeKeys.has(key))
    if (restoredAttributeKey && !restoredPinnedAttributeKeys.includes(restoredAttributeKey)) {
      restoredPinnedAttributeKeys.push(restoredAttributeKey)
    }
    const restoredColorMapId = attributeSettings && isAttributeColorMapId(attributeSettings.colorMapId)
      ? attributeSettings.colorMapId
      : DEFAULT_ATTRIBUTE_COLOR_MAP_ID
    const restoredColorMapColors = getContinuousAttributeColorMapColors(restoredColorMapId)
    const restoredAttributeModel = buildAttributeColorModel(
      nextDataset,
      restoredAttributeKey,
      attributeSettings?.inheritsParent ?? true,
      restoredColorMapId,
      attributeSettings?.reversed ? [...restoredColorMapColors].reverse() : restoredColorMapColors,
      attributeSettings?.categoricalSeed ?? 0,
      attributeSettings?.customColors ?? {},
    )
    const restoredAttributeDomain = restoredAttributeKey && attributeSettings?.domain &&
      restoredAttributeModel?.kind === 'continuous'
        ? { key: restoredAttributeKey, ...attributeSettings.domain }
        : null
    const restoredAppearanceMode = state.appearance.mode === 'colormap' && !restoredAttributeKey
      ? 'regular'
      : state.appearance.mode
    const availableErrorCodes = new Set(
      nextDataset.features.flatMap((feature) => feature.errors.map((entry) => entry.code)),
    )
    const restoredErrorCodes = state.filters.selectedErrorCodes === null
      ? null
      : [...new Set(state.filters.selectedErrorCodes)].filter((code) => availableErrorCodes.has(code))
    const mobileLayout = window.matchMedia('(max-width: 900px)').matches
    const restoredEditMode = state.interaction.editMode && Boolean(restoredFeature && restoredObject) && !mobileLayout
    const restoredPickingMode = getAvailablePickingModes(restoredEditMode).includes(state.interaction.pickingMode)
      ? state.interaction.pickingMode
      : restoredEditMode ? 'face' : 'object'

    setGeometryDisplayMode(restoredGeometryDisplayMode)
    setIsPaneCollapsed(state.panels?.leftPanelCollapsed ?? false)
    setSelectedFeatureId(restoredFeature?.id ?? null)
    setActiveObjectId(restoredObject?.id ?? null)
    setActiveGeometryIndex(restoredGeometryIndex)
    setSelectedFaceIndex(restoredFaceIndex)
    setSelectedFaceRingIndex(restoredFaceRingIndex)
    setSelectedVertexIndex(restoredVertexIndex)
    setSelectedFaceVertexEntryIndex(restoredFaceVertexEntryIndex)
    setSelectedSemanticSurface(restoredSemanticSurface)
    setEditMode(restoredEditMode)
    setIsolateSelectedFeature(state.interaction.isolateSelectedFeature && Boolean(restoredFeature))
    setPickingMode(restoredPickingMode)
    setHideOccludedEditEdges(state.interaction.hideOccludedEditEdges)
    setShowVertexGizmo(state.interaction.showVertexGizmo && restoredEditMode && restoredVertexIndex != null)
    setMobileInspectMode(state.interaction.mobileInspectMode)
    setAppearanceMode(restoredAppearanceMode)
    setPinnedAttributeKeys(restoredPinnedAttributeKeys)
    setIsPinnedAttributesOpen(state.panels?.pinnedAttributesOpen ?? restoredPinnedAttributeKeys.length > 0)
    setInfoPanelOpenSections((current) => ({
      ...current,
      semantic: state.panels?.semanticSurfaceOpen ?? false,
    }))
    setAttributeColorKey(restoredAttributeKey)
    setAttributeColorInheritsParent(attributeSettings?.inheritsParent ?? true)
    setAttributeColorDomain(restoredAttributeDomain)
    setAttributeColorMapId(restoredColorMapId)
    setAttributeColorMapReversed(attributeSettings?.reversed ?? false)
    setAttributeCategoricalColorSeed(attributeSettings?.categoricalSeed ?? 0)
    setCustomCategoricalColorMaps(
      restoredAttributeKey && attributeSettings
        ? { ...restoredCustomColors, [restoredAttributeKey]: attributeSettings.customColors }
        : restoredCustomColors,
    )
    if (restoredAttributeKey && restoredAttributeDomain) {
      attributeColorDomainsByKeyRef.current.set(restoredAttributeKey, restoredAttributeDomain)
    }
    if (restoredAttributeKey) {
      attributeColorSeedsByKeyRef.current.set(restoredAttributeKey, attributeSettings?.categoricalSeed ?? 0)
      attributeColorMapIdsByKeyRef.current.set(restoredAttributeKey, restoredColorMapId)
      attributeColorMapReversedByKeyRef.current.set(restoredAttributeKey, attributeSettings?.reversed ?? false)
    }
    setSearchQuery(state.filters.searchQuery)
    setShowOnlyInvalidFeatures(
      state.filters.showOnlyInvalidFeatures && nextDataset.features.some((feature) => feature.validity != null),
    )
    setSelectedErrorCodes(restoredErrorCodes)
    setMeasurementActive(state.measurement.active)
    setMeasurementPoints(state.measurement.points)
    preInspectPickingModeRef.current = restoredEditMode ? 'object' : restoredPickingMode
    inspectPickingModeRef.current = restoredEditMode ? restoredPickingMode : 'face'
    setCameraFocalLength(
      state.camera.kind === 'orthographic'
        ? ORTHOGRAPHIC_CAMERA_VALUE
        : state.camera.focalLength ?? DEFAULT_CAMERA_FOCAL_LENGTH,
    )
    pendingCameraPoseRef.current = state.camera
  }, [attributeColorDomainsByKeyRef, attributeColorMapIdsByKeyRef, attributeColorMapReversedByKeyRef, attributeColorSeedsByKeyRef, setActiveGeometryIndex, setActiveObjectId, setAttributeCategoricalColorSeed, setAttributeColorDomain, setAttributeColorInheritsParent, setAttributeColorKey, setAttributeColorMapId, setAttributeColorMapReversed, setCustomCategoricalColorMaps, setGeometryDisplayMode, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedFeatureId, setSelectedSemanticSurface, setSelectedVertexIndex])

  const applyDataset = useCallback((
    nextDataset: ViewerDataset,
    options?: { restoreEmbeddedState?: boolean },
  ) => {
    const viewerStateResolution = resolveViewerStateForDataset(
      nextDataset,
      pendingUrlViewerStateRef.current,
      options?.restoreEmbeddedState !== false,
    )
    pendingUrlViewerStateRef.current = null

    datasetRef.current = nextDataset
    latestCameraPoseRef.current = null
    pendingCameraPoseRef.current = null
    setCameraRestoreRequest(null)
    setHasCameraPose(false)
    geometryEditor.reset()
    setGeometryChange(null)
    waitForViewportDataset(nextDataset)
    resetViewerState()
    setDataset(nextDataset)

    if (viewerStateResolution.state) {
      restoreViewerState(nextDataset, viewerStateResolution.state)
    }
    if (viewerStateResolution.warning) {
      setError(viewerStateResolution.warning)
    }
  }, [geometryEditor, resetViewerState, restoreViewerState, waitForViewportDataset])

  const loadScene = useCallback(async (request: SceneLoadRequest) => {
    if (!request.sources.length) return
    await runLoad({
      message: request.sources.length > 1 ? `Loading ${request.sources.length} CityJSON sources…` : null,
      fallback: 'Failed to load CityJSON sources.',
      load: signal => loadSceneSources(request, signal),
      apply: loaded => applyDataset(assembleScene(loaded, datasetRef.current, Boolean(request.append)), { restoreEmbeddedState: !request.append }),
    })
  }, [runLoad, applyDataset])
  const loadExampleDataset = useCallback(async (example: ExampleDatasetConfig) => {
    await loadScene({
      sources: example.cityJsonUrls.map(url => ({ kind: 'url', url, name: example.cityJsonUrls.length === 1 ? example.name : undefined })),
      report: example.validationReportUrl ? { kind: 'url', url: example.validationReportUrl } : undefined,
    })
  }, [loadScene])
  const loadFromUrlParams = useCallback(async (urls: string[], reportUrl: string) => {
    await loadScene({ sources: urls.map(url => url.trim()).filter(Boolean).map(url => ({ kind: 'url', url })), report: { kind: 'url', url: reportUrl.trim() } })
  }, [loadScene])
  const openCityJsonFromUrls = useCallback(async (urls: string[], append = false) => {
    setCityJsonUrlInput('')
    await loadScene({ sources: urls.map(url => url.trim()).filter(Boolean).map(url => ({ kind: 'url', url })), append })
  }, [loadScene])

  const openCityJsonFromUrl = useCallback(async (url: string, appendToCurrentScene = false) => {
    await openCityJsonFromUrls([url], appendToCurrentScene)
  }, [openCityJsonFromUrls])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sources = params.getAll('cj')
    const report = params.get('val')
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || !sources.length) return
      if (report) void loadFromUrlParams(sources, report)
      else void openCityJsonFromUrls(sources)
    })
    return () => { cancelled = true }
  }, [loadFromUrlParams, openCityJsonFromUrls])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      const text = event.clipboardData?.getData('text') ?? ''
      const url = tryParseHttpUrl(text)
      if (!url) {
        return
      }

      event.preventDefault()
      void openCityJsonFromUrl(url)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [openCityJsonFromUrl])

  function clearAnnotations() {
    setDataset((current) => (current ? mergeValidationAnnotations(current, new Map(), null) : current))
    setShowOnlyInvalidFeatures(false)
    setSelectedErrorCodes(null)
  }

  function triggerCityJsonInput(appendToCurrentScene = false) {
    appendNextCityJsonFileSelectionRef.current = appendToCurrentScene
    fileInputRef.current?.click()
  }

  function triggerAnnotationInput() {
    annotationInputRef.current?.click()
  }

  function dismissError() {
    setDismissedErrorMessage(error)
    if (!dataset) {
      setIsFileDialogOpen(true)
    }
  }

  const openCameraFollower = useCallback(() => {
    if (cameraFollowChannel) {
      return
    }

    const channel = cameraPublishChannel ?? createCameraSyncChannelId()
    const followerUrl = buildCameraFollowerUrl(channel)

    const openedWindow = window.open(followerUrl, '_blank')
    if (!openedWindow) {
      setError('The browser blocked the synced follower tab.')
      return
    }

    if (!cameraPublishChannel) {
      setCameraPublishChannel(channel)
    }
    openedWindow.focus()
  }, [cameraFollowChannel, cameraPublishChannel])

  const breakCameraFollow = useCallback(() => {
    setCameraFollowChannel(null)

    const url = new URL(window.location.href)
    url.searchParams.delete(CAMERA_FOLLOW_QUERY_PARAM)
    window.history.replaceState(null, '', url)
  }, [])

  function toggleDetailPaneCollapse() {
    startTransition(() => {
      setDetailPaneMode((current) => (current === 'collapsed' ? 'split' : 'collapsed'))
    })
  }

  function toggleDetailPaneFullscreen() {
    startTransition(() => {
      setDetailPaneMode((current) => (current === 'fullscreen' ? 'split' : 'fullscreen'))
    })
  }

  function toggleSidebarVisibility() {
    startTransition(() => {
      setIsPaneCollapsed((current) => !current)
    })
  }

  const handlePinAttribute = useCallback((key: string) => {
    setPinnedAttributeKeys((current) => {
      if (current.includes(key)) {
        return current
      }

      return [...current, key]
    })
    setIsPinnedAttributesOpen(true)
  }, [])

  const handleUnpinAttribute = useCallback((key: string) => {
    setPinnedAttributeKeys((current) => current.filter((entry) => entry !== key))
  }, [])

  const handleSelectAttributeColorKey = useCallback((key: string) => {
    if (attributeColorKey) {
      attributeColorMapIdsByKeyRef.current.set(attributeColorKey, attributeColorMapId)
      attributeColorMapReversedByKeyRef.current.set(attributeColorKey, attributeColorMapReversed)
      attributeColorSeedsByKeyRef.current.set(attributeColorKey, attributeCategoricalColorSeed)
      if (activeAttributeColorDomain) {
        attributeColorDomainsByKeyRef.current.set(attributeColorKey, activeAttributeColorDomain)
      }
    }
    const categoricalSeed = attributeColorSeedsByKeyRef.current.get(key) ?? 0
    const cachedColorMapId = attributeColorMapIdsByKeyRef.current.get(key)
    const colorMapId = cachedColorMapId ?? DEFAULT_ATTRIBUTE_COLOR_MAP_ID
    const colorMapColors = getContinuousAttributeColorMapColors(colorMapId)
    const model = buildAttributeColorModel(
      dataset,
      key,
      attributeColorInheritsParent,
      colorMapId,
      colorMapColors,
      categoricalSeed,
      customCategoricalColorMaps[key] ?? EMPTY_ATTRIBUTES,
    )
    const resolvedColorMapId = cachedColorMapId
      ?? (model?.kind === 'categorical' ? DEFAULT_CATEGORICAL_COLOR_MAP_ID : DEFAULT_ATTRIBUTE_COLOR_MAP_ID)
    const resolvedDomain = model?.kind === 'continuous'
      ? attributeColorDomainsByKeyRef.current.get(key) ?? getDefaultAttributeColorDomain(model)
      : null

    attributeColorMapIdsByKeyRef.current.set(key, resolvedColorMapId)
    setAttributeColorKey(key)
    setAttributeColorDomain(resolvedDomain)
    setAttributeColorMapId(resolvedColorMapId)
    setAttributeColorMapReversed(attributeColorMapReversedByKeyRef.current.get(key) ?? false)
    setAttributeCategoricalColorSeed(categoricalSeed)
    setAppearanceMode('colormap')
  }, [attributeColorKey, attributeColorSeedsByKeyRef, attributeColorMapIdsByKeyRef, dataset, attributeColorInheritsParent, customCategoricalColorMaps, attributeColorDomainsByKeyRef, setAttributeColorKey, setAttributeColorDomain, setAttributeColorMapId, setAttributeColorMapReversed, attributeColorMapReversedByKeyRef, setAttributeCategoricalColorSeed, attributeColorMapId, attributeColorMapReversed, attributeCategoricalColorSeed, activeAttributeColorDomain])

  const handleClearAttributeColor = useCallback(() => {
    setAttributeColorKey(null)
    setAttributeColorDomain(null)
    setAppearanceMode((current) => current === 'colormap' ? 'regular' : current)
  }, [setAttributeColorDomain, setAttributeColorKey])

  const handleCommitAttributeColorDomain = useCallback((domain: AttributeColorDomain) => {
    attributeColorDomainsByKeyRef.current.set(domain.key, domain)
    setAttributeColorDomain(domain)
  }, [attributeColorDomainsByKeyRef, setAttributeColorDomain])

  const handleRerandomizeCategoricalColors = useCallback(() => {
    if (attributeColorKey) attributeColorSeedsByKeyRef.current.set(attributeColorKey, attributeCategoricalColorSeed + 1)
    setAttributeCategoricalColorSeed((current) => current + 1)
    if (attributeColorKey) {
      setCustomCategoricalColorMaps((current) => {
        const rest = { ...current }
        delete rest[attributeColorKey]
        return rest
      })
    }
  }, [attributeColorKey, attributeColorSeedsByKeyRef, attributeCategoricalColorSeed, setAttributeCategoricalColorSeed, setCustomCategoricalColorMaps])

  const handleCustomCategoricalColorChange = useCallback((attributeKey: string, categoryKey: string, color: string) => {
    setCustomCategoricalColorMaps((current) => ({
      ...current,
      [attributeKey]: {
        ...(current[attributeKey] ?? {}),
        [categoryKey]: color,
      },
    }))
  }, [setCustomCategoricalColorMaps])

  const handleAttributeColorMapChange = useCallback((colorMapId: AttributeColorMapId) => {
    setAttributeColorMapId(colorMapId)
    if (attributeColorKey) {
      attributeColorMapIdsByKeyRef.current.set(attributeColorKey, colorMapId)
    }
  }, [attributeColorKey, attributeColorMapIdsByKeyRef, setAttributeColorMapId])

  const handleToggleAttributeColorMapReversed = useCallback(() => {
    setAttributeColorMapReversed((current) => {
      const next = !current
      if (attributeColorKey) {
        attributeColorMapReversedByKeyRef.current.set(attributeColorKey, next)
      }
      return next
    })
  }, [attributeColorKey, attributeColorMapReversedByKeyRef, setAttributeColorMapReversed])

  const handleToggleInfoPanelSection = useCallback((section: InfoPanelSection) => {
    setInfoPanelOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }, [])

  const handlePreviewAttributeColorDomain = useCallback((domain: AttributeColorDomain) => {
    viewportRef.current?.previewColorDomain(domain)
  }, [])

  const availableAppearanceModes = useMemo(
    () => VIEWER_APPEARANCE_MODES.filter(
      (mode) => mode !== 'colormap' || availableAttributeColorViewportState != null,
    ),
    [availableAttributeColorViewportState],
  )

  const cycleAppearanceMode = useCallback(() => {
    setAppearanceMode((current) => {
      const currentIndex = availableAppearanceModes.indexOf(current)
      return availableAppearanceModes[(currentIndex + 1) % availableAppearanceModes.length] ?? 'regular'
    })
  }, [availableAppearanceModes])

  const handleSelectSemanticSurface = useCallback((surface: {
    featureId: string
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null) => {
    if (!surface) {
      setSelectedSemanticSurface(null)
      return
    }

    setSelectedFeatureId(surface.featureId)
    setActiveObjectId(surface.objectId)
    setActiveGeometryIndex(surface.geometryIndex)
    setSelectedFaceIndex(surface.faceIndex)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(surface.surface ? surface : null)
  }, [setActiveGeometryIndex, setActiveObjectId, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedFeatureId, setSelectedSemanticSurface, setSelectedVertexIndex])

  const centerFeatureById = useCallback((featureId: string) => {
    const feature = featureMap.get(featureId)
    if (!feature) {
      return
    }

    setFocusTarget({
      kind: 'feature',
      featureId: feature.id,
    })
    setFocusRevision((current) => current + 1)
  }, [featureMap])

  const handleSetViewportCenter = useCallback((center: Vec3) => {
    setFocusTarget({ kind: 'location', location: center })
    setFocusRevision((current) => current + 1)
  }, [])

  const handleViewportCenterChange = useCallback((center: Vec3 | null) => {
    if (!center) {
      setViewportCenter(null)
      return
    }

    setViewportCenter(center)
  }, [])

  const centerCurrentSelection = useCallback(() => {
    if (!selectedFeature) {
      return
    }

    if (editMode && selectedVertexIndex != null) {
      setFocusTarget({
        kind: 'vertex',
        featureId: selectedFeature.id,
        objectId: activeObjectId,
        vertexIndex: selectedVertexIndex,
      })
      setFocusRevision((current) => current + 1)
      return
    }

    if (activeObjectId) {
      setFocusTarget({
        kind: 'error',
        featureId: selectedFeature.id,
        objectId: activeObjectId,
        geometryIndex: resolvedActiveGeometryIndex,
        faceIndex: selectedFaceIndex,
        location: null,
        preserveCameraOffset: editMode,
      })
      setFocusRevision((current) => current + 1)
      return
    }

    centerFeatureById(selectedFeature.id)
  }, [activeObjectId, centerFeatureById, editMode, resolvedActiveGeometryIndex, selectedFaceIndex, selectedFeature, selectedVertexIndex])

  function centerValidationError(error: ViewerValidationError) {
    if (!selectedFeature) {
      return
    }

    const matchingObjectId =
      error.cityObjectId &&
      selectedFeature.objects.some((object) => object.id === error.cityObjectId)
        ? error.cityObjectId
        : null
    const inferredObjectId =
      matchingObjectId ??
      (selectedFeature.objects.length === 1 ? selectedFeature.objects[0]?.id ?? null : activeObjectId)

    if (!isMobileLayout) {
      if (!editMode) {
        preInspectPickingModeRef.current = pickingMode
        setPickingMode(inspectPickingModeRef.current)
      }
      setEditMode(true)
      setIsolateSelectedFeature(true)
      setAppearanceMode('regular')
    }

    setActiveObjectId(inferredObjectId)
    const normalizedErrorGeometryIndex = inferredObjectId
      ? normalizeObjectGeometryIndex(
          selectedFeature.objects.find((object) => object.id === inferredObjectId) ?? null,
          error.geometryIndex,
        )
      : null
    const errorObject = selectedFeature.objects.find((object) => object.id === inferredObjectId) ?? null
    const errorGeometry = getObjectGeometryByIndex(errorObject, normalizedErrorGeometryIndex)
    const currentErrorFaceIndex =
      error.faceIndex != null && errorGeometry
        ? getCurrentFaceIndexForSourceFace(errorGeometry, error.faceIndex)
        : null

    setSelectedFaceIndex(currentErrorFaceIndex)
    setSelectedFaceRingIndex(0)
    setActiveGeometryIndex(
      inferredObjectId
        ? normalizedErrorGeometryIndex
        : null,
    )
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(null)
    setFocusTarget({
      kind: 'error',
      featureId: selectedFeature.id,
      objectId: inferredObjectId,
      geometryIndex: error.geometryIndex,
      faceIndex: currentErrorFaceIndex,
      location: error.location,
      preserveCameraOffset: editMode,
    })
    setFocusRevision((current) => current + 1)
  }

  const handleSelectGeometryDisplayMode = useCallback((mode: ViewerGeometryDisplayMode) => {
    setGeometryDisplayMode(mode)
    setActiveGeometryIndex(null)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(null)
  }, [setActiveGeometryIndex, setGeometryDisplayMode, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedSemanticSurface, setSelectedVertexIndex])

  const cycleGeometryDisplayMode = useCallback(() => {
    const modes: ViewerGeometryDisplayMode[] = [
      { kind: 'best' },
      ...availableLods.map((lod) => ({ kind: 'lod', lod }) satisfies ViewerGeometryDisplayMode),
    ]
    if (modes.length <= 1) {
      return
    }

    const currentIndex = modes.findIndex((mode) => getGeometryDisplayModeKey(mode) === getGeometryDisplayModeKey(geometryDisplayMode))
    const nextMode = modes[(currentIndex + 1 + modes.length) % modes.length]
    if (!nextMode) {
      return
    }

    handleSelectGeometryDisplayMode(nextMode)
  }, [availableLods, geometryDisplayMode, handleSelectGeometryDisplayMode])

  const cyclePickingMode = useCallback(() => {
    setPickingMode((current) => nextPickingMode(current, editMode))
  }, [editMode])

  const handleSelectPickingMode = useCallback((mode: ViewerPickingMode) => {
    if (!getAvailablePickingModes(editMode).includes(mode)) {
      return
    }

    setPickingMode(mode)
  }, [editMode])

  const handlePickingModeShortcut = useCallback((mode: ViewerPickingMode) => {
    if (!getAvailablePickingModes(editMode).includes(mode)) {
      return
    }

    setPickingMode((current) => (current === mode ? 'none' : mode))
  }, [editMode])

  const toggleMeasurement = useCallback(() => {
    setMeasurementActive((current) => {
      setMeasurementPoints([])
      return !current
    })
  }, [])

  const handleMeasurePoint = useCallback((point: Vec3) => {
    setMeasurementPoints((current) => current.length === 2 ? [point] : [...current, point])
  }, [])

  const toggleEditMode = useCallback(() => {
    if (isMobileLayout) return
    const next = !editMode
    setEditMode(next)
    setIsolateSelectedFeature(next)
    if (next) {
      preInspectPickingModeRef.current = pickingMode
      setPickingMode(inspectPickingModeRef.current)
    } else {
      inspectPickingModeRef.current = pickingMode
      setPickingMode(preInspectPickingModeRef.current)
      setShowVertexGizmo(false)
    }
    patchSelection({ selectedFaceIndex: null, selectedFaceRingIndex: 0, selectedFaceVertexEntryIndex: null, ...(next ? {} : { selectedVertexIndex: null }) })
  }, [isMobileLayout, editMode, pickingMode, patchSelection])

  const handleSelectFeature = useCallback((
    featureId: string,
    objectId?: string | null,
    options?: { preserveEditMode?: boolean; geometryIndex?: number | null },
  ) => {
    const feature = featureMap.get(featureId)
    if (!feature) {
      return
    }

    startTransition(() => {
      const shouldExitEditMode =
        !options?.preserveEditMode &&
        editMode &&
        isolateSelectedFeature &&
        featureId !== selectedFeatureId

      if (shouldExitEditMode) {
        setEditMode(false)
        setIsolateSelectedFeature(false)
        setShowVertexGizmo(false)
      }

      const nextObjectId = objectId ?? feature.objects[0]?.id ?? null
      const nextObject = feature.objects.find((candidate) => candidate.id === nextObjectId) ?? null
      const nextGeometryIndex = options?.geometryIndex != null
        ? normalizeObjectGeometryIndex(nextObject, options.geometryIndex)
        : null

      patchSelection({ selectedFeatureId: featureId, activeObjectId: nextObjectId, activeGeometryIndex: nextGeometryIndex, selectedFaceIndex: null, selectedFaceRingIndex: 0, selectedVertexIndex: null, selectedFaceVertexEntryIndex: null, selectedSemanticSurface: null })
    })
  }, [editMode, featureMap, isolateSelectedFeature, patchSelection, selectedFeatureId])

  const handleClearSelection = useCallback(() => {
    startTransition(() => patchSelection({
      ...(editMode ? {} : { selectedFeatureId: null, activeObjectId: null, activeGeometryIndex: null }),
      selectedFaceIndex: null, selectedFaceRingIndex: 0, selectedVertexIndex: null,
      selectedFaceVertexEntryIndex: null, selectedSemanticSurface: null,
    }))
  }, [editMode, patchSelection])

  const handleSearchQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
  }, [])

  const handleShowOnlyInvalidFeaturesChange = useCallback((checked: boolean) => {
    setShowOnlyInvalidFeatures(checked)
  }, [])

  const handleToggleErrorCodeFilter = useCallback((code: number) => {
    setSelectedErrorCodes((current) => {
      const availableCodes = availableErrorCodeFilters.map((option) => option.code)
      const currentSet = new Set(current ?? availableCodes)

      if (currentSet.has(code)) {
        currentSet.delete(code)
      } else {
        currentSet.add(code)
      }

      const nextCodes = availableCodes.filter((availableCode) => currentSet.has(availableCode))
      return nextCodes.length === availableCodes.length ? null : nextCodes
    })
  }, [availableErrorCodeFilters])

  const handleToggleAllErrorCodeFilters = useCallback(() => {
    setSelectedErrorCodes((current) => {
      const availableCodes = availableErrorCodeFilters.map((option) => option.code)
      const selectedCount = current?.length ?? availableCodes.length
      return selectedCount === availableCodes.length ? [] : null
    })
  }, [availableErrorCodeFilters])

  const handleCenterObject = useCallback((
    featureId: string,
    objectId: string,
  ) => {
    const feature = featureMap.get(featureId)
    const object = feature?.objects.find((candidate) => candidate.id === objectId)
    if (!feature || !object) {
      return
    }

    startTransition(() => {
      const shouldExitEditMode =
        editMode &&
        isolateSelectedFeature &&
        featureId !== selectedFeatureId

      if (shouldExitEditMode) {
        setEditMode(false)
        setIsolateSelectedFeature(false)
        setShowVertexGizmo(false)
      }

      setSelectedFeatureId(featureId)
      setActiveObjectId(objectId)
      setActiveGeometryIndex(null)
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
    })

    setFocusTarget({
      kind: 'error',
      featureId,
      objectId,
      geometryIndex: null,
      faceIndex: null,
      location: null,
    })
    setFocusRevision((current) => current + 1)
  }, [editMode, featureMap, isolateSelectedFeature, selectedFeatureId, setActiveGeometryIndex, setActiveObjectId, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedFeatureId, setSelectedVertexIndex])

  const handleViewportSelectFeature = useCallback((
    featureId: string,
    objectId?: string | null,
    geometryIndex?: number | null,
  ) => {
    handleSelectFeature(featureId, objectId, { geometryIndex })
  }, [handleSelectFeature])

  const handleSelectFace = useCallback((faceIndex: number | null) => {
    setSelectedFaceIndex(faceIndex)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
  }, [setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedVertexIndex])

  const selectFaceVertex = useCallback((vertexIndex: number | null, options?: {
    ringIndex?: number
    entryIndex?: number | null
  }) => {
    setSelectedVertexIndex(vertexIndex)
    let nextEntryIndex = options?.entryIndex ?? null

    if (selectedFace && vertexIndex != null) {
      const ringIndex = options?.ringIndex ?? selectedFace.findIndex((ring) => ring.includes(vertexIndex))
      if (ringIndex >= 0) {
        setSelectedFaceRingIndex(ringIndex)
        if (nextEntryIndex == null) {
          const ringEntryIndex = selectedFace[ringIndex]?.indexOf(vertexIndex) ?? -1
          nextEntryIndex = ringEntryIndex >= 0 ? ringEntryIndex : null
        }
      }
    }
    setSelectedFaceVertexEntryIndex(nextEntryIndex)
  }, [selectedFace, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedVertexIndex])

  const handleSelectVertex = useCallback((vertexIndex: number | null) => {
    selectFaceVertex(vertexIndex)
  }, [selectFaceVertex])

  const cycleSelectedFaceVertex = useCallback((direction: -1 | 1) => {
    if (selectedFaceVertexIndices.length === 0) {
      return
    }

    const currentIndex = activeSelectedFaceVertexEntryIndex != null
      ? activeSelectedFaceVertexEntryIndex
      : selectedVertexIndex != null
        ? selectedFaceVertexIndices.indexOf(selectedVertexIndex)
      : -1

    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : selectedFaceVertexIndices.length - 1
        : (currentIndex + direction + selectedFaceVertexIndices.length) % selectedFaceVertexIndices.length

    selectFaceVertex(selectedFaceVertexIndices[nextIndex] ?? null, {
      ringIndex: activeFaceRingIndex,
      entryIndex: nextIndex,
    })
  }, [
    activeFaceRingIndex,
    activeSelectedFaceVertexEntryIndex,
    selectFaceVertex,
    selectedFaceVertexIndices,
    selectedVertexIndex,
  ])

  const cycleSelectedFaceRing = useCallback((direction: -1 | 1 = 1) => {
    if (selectedFaceRingCount <= 1) {
      return
    }

    setSelectedFaceRingIndex((current) => (current + direction + selectedFaceRingCount) % selectedFaceRingCount)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
  }, [selectedFaceRingCount, setSelectedFaceRingIndex, setSelectedFaceVertexEntryIndex, setSelectedVertexIndex])

  const applyFeatureVertices = useCallback((featureId: string, vertices: Vec3[]) => {
    const current = datasetRef.current
    if (current) setGeometryChange(geometryEditor.commitVertices(current, featureId, vertices))
  }, [geometryEditor])

  const deleteSelectedFace = useCallback(() => {
    const current = datasetRef.current
    if (!current || !selectedFeatureId || !activeObjectId || resolvedActiveGeometryIndex == null || selectedFaceIndex == null) return
    const change = geometryEditor.deleteFace(current, selectedFeatureId, activeObjectId, resolvedActiveGeometryIndex, selectedFaceIndex)
    if (!change) return
    setGeometryChange(change)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(null)
  }, [selectedFeatureId, activeObjectId, resolvedActiveGeometryIndex, selectedFaceIndex, geometryEditor, setSelectedFaceIndex, setSelectedFaceRingIndex, setSelectedVertexIndex, setSelectedFaceVertexEntryIndex, setSelectedSemanticSurface])

  const restoreSelectedFeatureGeometry = useCallback(() => {
    const current = datasetRef.current
    if (!current || !selectedFeatureId) return
    const change = geometryEditor.restoreFeature(current, selectedFeatureId)
    if (!change) return
    setGeometryChange(change)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(null)
  }, [geometryEditor, selectedFeatureId, setSelectedFaceVertexEntryIndex, setSelectedSemanticSurface, setSelectedVertexIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        toggleEditMode()
        return
      }

      if (
        (event.key === '0' || event.key === '1' || event.key === '2' || event.key === '3') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        const mode: ViewerPickingMode = event.key === '0' ? 'none' : event.key === '1' ? 'object' : event.key === '2' ? 'face' : 'vertex'
        handlePickingModeShortcut(mode)
        return
      }

      if (
        event.key.toLowerCase() === 'c' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        centerCurrentSelection()
        return
      }

      if (
        event.key.toLowerCase() === 's' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        dataset
      ) {
        event.preventDefault()
        cycleAppearanceMode()
        return
      }

      if (
        event.key.toLowerCase() === 't' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        dataset
      ) {
        event.preventDefault()
        setTopDownViewRevision((current) => current + 1)
        return
      }

      if (
        event.key.toLowerCase() === 'l' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !editMode &&
        dataset
      ) {
        event.preventDefault()
        cycleGeometryDisplayMode()
        return
      }

      if (editMode && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        cycleSelectedFaceVertex(-1)
        return
      }

      if (editMode && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        cycleSelectedFaceVertex(1)
        return
      }

      if (editMode && event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        cycleSelectedFaceRing()
        return
      }

      if (
        editMode &&
        event.key.toLowerCase() === 'd' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (selectedFaceIndex == null) {
          return
        }

        event.preventDefault()
        deleteSelectedFace()
        return
      }

      if (
        editMode &&
        event.key.toLowerCase() === 'g' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        setShowVertexGizmo((current) => !current)
        return
      }

      if (event.key.toLowerCase() === 'u') {
        if (
          !selectedFeatureId ||
          (
            !geometryEditor.hasChanges(selectedFeatureId)
          )
        ) {
          return
        }

        event.preventDefault()
        restoreSelectedFeatureGeometry()
        return
      }

      if (event.key.toLowerCase() === 'x' && editMode) {
        event.preventDefault()
        setHideOccludedEditEdges((current) => !current)
        return
      }

      if (
        event.key.toLowerCase() === 'i' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        selectedFeatureId
      ) {
        event.preventDefault()
        setIsolateSelectedFeature((current) => !current)
      }

      if (
        event.key.toLowerCase() === 'v' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        dataset
      ) {
        event.preventDefault()
        setIsVal3dityDialogOpen(true)
        return
      }

      if (
        event.key.toLowerCase() === 'b' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        toggleSidebarVisibility()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [centerCurrentSelection, cycleAppearanceMode, cycleGeometryDisplayMode, cycleSelectedFaceRing, cycleSelectedFaceVertex, dataset, deleteSelectedFace, editMode, geometryEditor, handlePickingModeShortcut, restoreSelectedFeatureGeometry, selectedFaceIndex, selectedFeatureId, toggleEditMode])

  const handleCameraPoseChange = useCallback((pose: ViewerCameraPose) => {
    latestCameraPoseRef.current = pose
    setHasCameraPose(true)
  }, [])

  const createCurrentViewerState = useCallback((): ViewerShareStateV1 => {
    const camera = latestCameraPoseRef.current
    if (!camera) {
      throw new Error('The camera is not ready to share yet.')
    }

    return {
      version: VIEWER_STATE_VERSION,
      camera,
      panels: {
        leftPanelCollapsed: isPaneCollapsed,
        pinnedAttributesOpen: isPinnedAttributesOpen,
        semanticSurfaceOpen: infoPanelOpenSections.semantic,
      },
      selection: {
        featureId: selectedFeatureId,
        objectId: activeObject?.id ?? null,
        geometryDisplayMode,
        geometryIndex: resolvedActiveGeometryIndex,
        faceIndex: selectedFaceIndex,
        faceRingIndex: activeFaceRingIndex,
        vertexIndex: selectedVertexIndex,
        faceVertexEntryIndex: activeSelectedFaceVertexEntryIndex,
        semanticSurfaceSelected: selectedSemanticSurface != null,
      },
      appearance: {
        mode: appearanceMode,
        attributeColors: [...new Set([
          ...attributeColorMapIdsByKeyRef.current.keys(),
          ...attributeColorDomainsByKeyRef.current.keys(),
          ...attributeColorSeedsByKeyRef.current.keys(),
          ...Object.keys(customCategoricalColorMaps),
        ])].filter((key) => key !== attributeColorKey).map((key) => {
          const domain = attributeColorDomainsByKeyRef.current.get(key)
          return {
            key,
            inheritsParent: attributeColorInheritsParent,
            domain: domain ? { min: domain.min, max: domain.max } : null,
            colorMapId: attributeColorMapIdsByKeyRef.current.get(key) ?? DEFAULT_ATTRIBUTE_COLOR_MAP_ID,
            reversed: attributeColorMapReversedByKeyRef.current.get(key) ?? false,
            categoricalSeed: attributeColorSeedsByKeyRef.current.get(key) ?? 0,
            customColors: customCategoricalColorMaps[key] ?? {},
          }
        }),
        attributeColor: attributeColorKey
          ? {
              key: attributeColorKey,
              inheritsParent: attributeColorInheritsParent,
              domain: activeAttributeColorDomain
                ? { min: activeAttributeColorDomain.min, max: activeAttributeColorDomain.max }
                : null,
              colorMapId: attributeColorMapId,
              reversed: attributeColorMapReversed,
              categoricalSeed: attributeCategoricalColorSeed,
              customColors: customCategoricalColorMaps[attributeColorKey] ?? {},
            }
          : null,
      },
      interaction: {
        isolateSelectedFeature,
        editMode,
        pickingMode,
        hideOccludedEditEdges,
        showVertexGizmo,
        mobileInspectMode,
      },
      filters: {
        searchQuery,
        showOnlyInvalidFeatures,
        selectedErrorCodes,
        pinnedAttributeKeys,
      },
      measurement: {
        active: measurementActive,
        points: measurementPoints,
      },
    }
  }, [activeAttributeColorDomain, activeFaceRingIndex, activeObject?.id, activeSelectedFaceVertexEntryIndex, appearanceMode, attributeCategoricalColorSeed, attributeColorDomainsByKeyRef, attributeColorInheritsParent, attributeColorKey, attributeColorMapId, attributeColorMapIdsByKeyRef, attributeColorMapReversed, attributeColorMapReversedByKeyRef, attributeColorSeedsByKeyRef, customCategoricalColorMaps, editMode, geometryDisplayMode, hideOccludedEditEdges, infoPanelOpenSections.semantic, isPaneCollapsed, isPinnedAttributesOpen, isolateSelectedFeature, measurementActive, measurementPoints, mobileInspectMode, pickingMode, pinnedAttributeKeys, resolvedActiveGeometryIndex, searchQuery, selectedErrorCodes, selectedFaceIndex, selectedFeatureId, selectedSemanticSurface, selectedVertexIndex, showOnlyInvalidFeatures, showVertexGizmo])

  const { isSharing, shareStatus, didCopyShareLink, shareButtonLabel, handleShare } = useViewerSharing(dataset, createCurrentViewerState, setError)

  const isErrorDialogVisible = Boolean(error && dismissedErrorMessage !== error)
  const hasModalScrim =
    isFileDialogOpen ||
    isInfoDialogOpen ||
    isChangelogDialogOpen ||
    isVal3dityDialogOpen ||
    isErrorDialogVisible ||
    isLoading ||
    isDragging
  const isPaneContentVisible = !isPaneCollapsed
  const isFeaturePanelVisible = !isMobileLayout || mobilePanelView === 'features'
  const isDetailPanelVisible = !isMobileLayout || mobilePanelView === 'details'
  const detailOverlayPositionClass = isMobileLayout ? 'bottom-20 left-3 right-3' : 'bottom-12 left-4 max-w-md'
  const infoPanelPositionClass = isMobileLayout ? 'bottom-20 left-3 right-3 top-4' : 'bottom-12 left-4 right-4 top-4 max-w-[30rem]'
  const showInfoPanelPinnedSection = isPinnedAttributesOpen && !isMobileLayout
  const showInfoPanelAttributeSection = isPinnedAttributesOpen && Boolean(attributeColorKey) && !isMobileLayout
  const showSemanticPanel = Boolean(!editMode && activeSemanticSurface)
  const showInfoPanel = isPinnedAttributesOpen && !isMobileLayout
  const showInfoPanelStack = showInfoPanel || showSemanticPanel
  const mobileViewportHeightClass = isPaneCollapsed
    ? 'h-[calc(100dvh_-_(3.5rem+env(safe-area-inset-bottom)))]'
    : detailPaneMode === 'fullscreen'
      ? 'h-0'
      : 'h-[calc(100dvh_-_min(76dvh,42rem))]'
  const mobileViewportToolbarPositionClass = 'bottom-3 right-3'
  const viewportStatusBarPositionClass = 'bottom-0 left-0 right-0'
  const viewportGeometryBarPositionClass = isMobileLayout
    ? 'bottom-3 left-3'
    : 'right-4'
  const showViewportTooltips = !isMobileLayout && !isHelpCollapsed && !hasModalScrim
  const cameraSyncChannel = cameraFollowChannel ?? cameraPublishChannel
  const cameraSyncRole: 'publish' | 'follow' | null = cameraFollowChannel
    ? 'follow'
    : cameraPublishChannel
      ? 'publish'
      : null
  const mobilePanelTabs: Array<{ view: MobilePanelView; label: string; disabled?: boolean }> = [
    { view: 'features', label: 'Objects' },
    { view: 'details', label: 'Details', disabled: !selectedFeature },
  ]
  const helpItems: HelpItem[] = isMobileLayout
    ? [
        {
          keys: 'Tap',
          description:
            showSemanticSurfaces && mobileInspectMode === 'surface'
              ? 'Inspect semantic surface'
              : 'Select object',
        },
        { keys: 'Drag', description: 'Orbit the model' },
        { keys: 'Pinch', description: 'Zoom' },
        { keys: 'Panel', description: 'Browse objects and details' },
        { keys: 'S', description: 'Cycle appearance' },
        { keys: 'V', description: 'Experimental val3dity runner' },
        { keys: 'B', description: 'Toggle sidebar' },
      ]
    : editMode
      ? [
          { keys: 'Click', description: getPickingModeDescription(effectivePickingMode) },
          { keys: 'J / K', description: 'Step active ring' },
          { keys: 'R', description: 'Cycle rings' },
          { keys: 'D', description: 'Delete selected face' },
          { keys: 'T', description: 'Top-down view' },
          { keys: 'V', description: 'Experimental val3dity runner' },
          { keys: 'B', description: 'Toggle sidebar' },
        ]
      : [
          { keys: 'Click', description: getPickingModeDescription(effectivePickingMode) },
          { keys: 'Double Click', description: 'Recenter navigation' },
          { keys: 'T', description: 'Top-down view' },
          { keys: 'V', description: 'Experimental val3dity runner' },
          { keys: 'B', description: 'Toggle sidebar' },
        ]

  return (
    <div
      className={cn(
        'relative h-dvh w-screen overflow-hidden bg-background text-foreground',
        isMobileLayout ? 'block' : 'flex',
      )}
      onDragEnter={(event) => { event.preventDefault(); dragCountRef.current++; setIsDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => { dragCountRef.current--; if (dragCountRef.current === 0) setIsDragging(false) }}
      onDrop={(event) => { dragCountRef.current = 0; handleDrop(event) }}
    >
      <aside
        className={cn(
          'panel-shell z-20 flex shrink-0 border-border',
          isMobileLayout
            ? (
                isPaneCollapsed
                  ? 'absolute inset-x-0 bottom-0 h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t pb-[env(safe-area-inset-bottom)]'
                  : detailPaneMode === 'fullscreen'
                    ? 'absolute inset-0 h-auto border-t-0 pb-[env(safe-area-inset-bottom)]'
                    : 'absolute inset-x-0 bottom-0 h-[min(76dvh,42rem)] border-t pb-[env(safe-area-inset-bottom)]'
              )
            : (isPaneCollapsed ? 'relative h-full w-16 border-r' : 'relative h-full w-[min(29rem,34vw)] border-r'),
        )}
      >
        <div className={cn('pointer-events-auto flex h-full w-full', isMobileLayout && 'flex-col')}>
          <div
            className={cn(
              'bg-background/40',
              isMobileLayout
                ? 'flex h-14 w-full items-center justify-between gap-3 border-b border-border px-3'
                : 'flex h-full w-16 shrink-0 flex-col items-center justify-between border-r border-border',
            )}
          >
            <div className={cn('flex items-center gap-2', isMobileLayout ? 'min-w-0 flex-1' : 'flex-col py-3')}>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleSidebarVisibility}
                aria-label={isPaneCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isMobileLayout
                  ? (isPaneCollapsed ? <ChevronUp /> : <ChevronDown />)
                  : (isPaneCollapsed ? <ChevronRight /> : <ChevronLeft />)}
              </Button>
              {isMobileLayout ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-black uppercase tracking-[0.28em] text-foreground/86">
                    CJLoupe
                  </span>
                  <VersionButton
                    className="hidden min-[420px]:inline-flex"
                    onClick={() => setIsChangelogDialogOpen(true)}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="pointer-events-none select-none font-black uppercase tracking-[0.34em] text-foreground/86 [writing-mode:vertical-rl]"
                    style={{ textOrientation: 'mixed' }}
                  >
                    CJLoupe
                  </span>
                  <VersionButton
                    className="[writing-mode:vertical-rl]"
                    onClick={() => setIsChangelogDialogOpen(true)}
                  />
                </div>
              )}
              <div className="relative">
                <Button
                  ref={fileDialogTriggerRef}
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsFileDialogOpen(true)}
                  aria-label="Open files"
                  title="Open files"
                  aria-expanded={isFileDialogOpen}
                  aria-haspopup="dialog"
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
              <Button
                size="icon"
                variant={didCopyShareLink ? 'secondary' : 'ghost'}
                onClick={() => void handleShare()}
                disabled={!dataset || !hasCameraPose || isSharing}
                aria-label={shareButtonLabel}
                title={shareButtonLabel}
              >
                {didCopyShareLink
                  ? <Check className="size-4 text-primary" />
                  : <Share2 className="size-4" />}
              </Button>
              <span className="sr-only" role="status" aria-live="polite">
                {shareStatus}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleTheme}
                aria-label={`Theme: ${getThemeModeLabel(themeMode)}`}
                title={`Theme: ${getThemeModeLabel(themeMode)}`}
              >
                {themeMode === 'system'
                  ? <SunMoon className="size-4" />
                  : themeMode === 'dark'
                    ? <Moon className="size-4" />
                    : <Sun className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                render={(
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open GitHub repository"
                    title="Open GitHub repository"
                  />
                )}
                nativeButton={false}
              >
                <img
                  src={theme === 'dark' ? gitIconWhiteUrl : gitIconBlackUrl}
                  alt=""
                  className="size-4"
                  aria-hidden="true"
                />
              </Button>
            </div>

            {isMobileLayout ? (
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                  {dataset ? countDatasetObjects(dataset) : 0}
                </Badge>
              </div>
            ) : (
              <div className="flex h-8 w-full items-center justify-center border-t border-accent/30 bg-accent/10 text-accent">
                <span className="font-mono text-sm font-medium leading-none">
                  {dataset ? countDatasetObjects(dataset) : 0}
                </span>
              </div>
            )}
          </div>

          {isPaneContentVisible && (
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {isMobileLayout && (
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <div className="floating-chip flex items-center gap-1 rounded-sm border p-1">
                    {mobilePanelTabs.map(({ view, label, disabled = false }) => (
                      <Button
                        key={view}
                        type="button"
                        variant={mobilePanelView === view ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-8 px-2.5"
                        onClick={() => setMobilePanelView(view)}
                        disabled={disabled}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-8"
                    onClick={() => setIsInfoDialogOpen(true)}
                    disabled={!dataset}
                    aria-label="Show file information"
                    title="Show file information"
                  >
                    <FileText className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={toggleDetailPaneFullscreen}
                    aria-label={detailPaneMode === 'fullscreen' ? 'Exit full panel view' : 'Expand panel to fullscreen'}
                    title={detailPaneMode === 'fullscreen' ? 'Exit full panel view' : 'Expand panel to fullscreen'}
                  >
                    {detailPaneMode === 'fullscreen' ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </Button>
                </div>
              )}

              {isFeaturePanelVisible && (
                <section
                  aria-hidden={!isMobileLayout && detailPaneMode === 'fullscreen'}
                  className={cn(
                    'flex min-h-0 flex-col border-b border-border',
                    isMobileLayout
                      ? 'flex-1'
                      : detailPaneMode === 'fullscreen'
                        ? 'pointer-events-none h-0 shrink overflow-hidden border-b-0 opacity-0'
                      : 'flex-[1.05]',
                  )}
                >
                  <FeatureListPanel
                    filteredFeatureItems={filteredFeatureItems}
                    isLoading={isLoading}
                    annotationSourceName={annotationSourceName}
                    datasetFeatureCount={dataset ? countDatasetObjects(dataset) : 0}
                    showFeatureSeparators={dataset?.cityJsonKind === 'CityJSONFeatures'}
                    showDesktopHeading={!isMobileLayout}
                    searchQuery={searchQuery}
                    selectedFeatureId={selectedFeatureId}
                    showOnlyInvalidFeatures={showOnlyInvalidFeatures}
                    errorCodeFilters={availableErrorCodeFilters}
                    selectedErrorCodes={selectedErrorCodes}
                    onSearchQueryChange={handleSearchQueryChange}
                    onShowOnlyInvalidFeaturesChange={handleShowOnlyInvalidFeaturesChange}
                    onToggleErrorCodeFilter={handleToggleErrorCodeFilter}
                    onToggleAllErrorCodeFilters={handleToggleAllErrorCodeFilters}
                    onSelectFeature={handleSelectFeature}
                    onCenterObject={handleCenterObject}
                    onShowInfo={dataset ? () => setIsInfoDialogOpen(true) : null}
                    activeObjectId={activeObject?.id ?? null}
                  />
                </section>
              )}

              {isDetailPanelVisible && (
              <Tabs
                value={resolvedDetailTab}
                onValueChange={setDetailTab}
                render={(
                  <section
                    className={cn(
                      'flex min-w-0 flex-col border-t border-border',
                      isMobileLayout
                        ? 'min-h-0 flex-1 border-t-0'
                        : detailPaneMode === 'collapsed'
                        ? 'shrink-0'
                        : detailPaneMode === 'fullscreen'
                          ? 'min-h-0 flex-1 border-t-0'
                          : 'min-h-0 flex-1',
                    )}
                  />
                )}
              >
                  <div className="panel-header-surface flex flex-col gap-1 p-4 pb-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex items-center justify-center text-muted-foreground">
                            <Box className="size-3.5" />
                          </span>
                          <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {detailTitleLabel}
                          </p>
                          {activeObject && <CopyIdButton value={activeObject.id} label="object ID" />}
                        </div>
                        {activeObject && (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {activeObject.type}
                          </Badge>
                        )}
                      </div>

                      {!isMobileLayout && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={toggleDetailPaneCollapse}
                          aria-label={detailPaneMode === 'collapsed' ? 'Expand feature details' : 'Collapse feature details'}
                          title={detailPaneMode === 'collapsed' ? 'Expand feature details' : 'Collapse feature details'}
                        >
                          {detailPaneMode === 'collapsed' ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={toggleDetailPaneFullscreen}
                          aria-label={detailPaneMode === 'fullscreen' ? 'Exit full detail view' : 'Expand details to full panel'}
                          title={detailPaneMode === 'fullscreen' ? 'Exit full detail view' : 'Expand details to full panel'}
                        >
                          {detailPaneMode === 'fullscreen' ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                        </Button>
                      </div>
                      )}
                    </div>

                    {detailPaneMode !== 'collapsed' && selectedFeature && hasDetailContent && (
                      <div className="-mx-4 -mb-2.5 border-b border-border px-4">
                        <TabsList className="gap-0">
                          {hasDetailAttributes && (
                            <TabsTrigger value="attributes" className="detail-tab gap-1.5">
                              <span>Attributes</span>
                              <span className="rounded-sm bg-foreground/8 px-1.5 py-0 text-[10px] text-muted-foreground">
                                {detailAttributeCount}
                              </span>
                            </TabsTrigger>
                          )}
                          {hasDetailGeometryInfo && (
                            <TabsTrigger value="geometries" className="detail-tab gap-1.5">
                              <span>Geometries</span>
                              <span className="rounded-sm bg-foreground/8 px-1.5 py-0 text-[10px] text-muted-foreground">
                                {activeObjectGeometryCount}
                              </span>
                              {visibleDetailErrorCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0 text-[10px] font-medium text-destructive">
                                  <TriangleAlert className="size-3" />
                                  <span>{visibleDetailErrorCount}</span>
                                </span>
                              )}
                            </TabsTrigger>
                          )}
                        </TabsList>
                      </div>
                    )}
                  </div>

                  {detailPaneMode !== 'collapsed' && (
                    <ScrollArea key={detailSelectionKey} className="min-h-0 min-w-0 flex-1">
                      <div className="panel-body-surface flex min-w-0 flex-col gap-2 p-4 pt-3">
                        {selectedFeature ? (
                          <>
                            {hasDetailContent ? (
                              <>
                                {hasDetailAttributes && (
                                  <TabsContent key={`${detailSelectionKey}::attributes`} value="attributes">
                                    <DetailAttributePanel
                                      objectAttributes={activeObjectAttributes}
                                      parentObjects={parentAttributeObjects}
                                      canPinAttributes={!isMobileLayout}
                                      canPinParentAttributes={!isMobileLayout && attributeColorInheritsParent}
                                      pinnedAttributeKeys={pinnedAttributeKeys}
                                      onPinAttribute={handlePinAttribute}
                                      onUnpinAttribute={handleUnpinAttribute}
                                    />
                                  </TabsContent>
                                )}

                                {hasDetailGeometryInfo && (
                                  <TabsContent key={`${detailSelectionKey}::geometries`} value="geometries">
                                    <DetailGeometryPanel
                                      geometries={activeObject?.geometries ?? []}
                                      errors={visibleDetailErrors}
                                      activeGeometryIndex={resolvedActiveGeometryIndex}
                                      onCenterError={centerValidationError}
                                    />
                                  </TabsContent>
                                )}
                              </>
                            ) : (
                              <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                                No attributes, errors, or geometries to show for the selected item.
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                            Click a building in the scene or choose a feature from the feature list.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  )}
              </Tabs>
              )}
            </div>
          )}
        </div>
      </aside>

      <div
        className={cn(
          'relative min-w-0 flex-1',
          isMobileLayout ? mobileViewportHeightClass : 'h-full',
        )}
      >
        <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
          <CityViewport
            ref={viewportRef}
            key={viewportResetRevision}
            data={dataset}
            cameraFocalLength={cameraFocalLength}
            hideOccludedEditEdges={hideOccludedEditEdges}
            isolateSelectedFeature={isolateSelectedFeature}
            showObjectExtents={showObjectExtents}
            geometryDisplayMode={geometryDisplayMode}
            activeGeometryIndex={activeGeometryIndex}
            geometryChange={geometryChange}
            viewportResetRevision={viewportResetRevision}
            topDownViewRevision={topDownViewRevision}
            focusRevision={focusRevision}
            focusTarget={focusTarget}
            selectedFeatureId={selectedFeatureId}
            activeObjectId={activeObjectId}
            editMode={editMode}
            selectedFaceIndex={selectedFaceIndex}
            selectedFaceRingIndex={activeFaceRingIndex}
            selectedVertexIndex={selectedVertexIndex}
            appearanceMode={appearanceMode}
            attributeColor={attributeColorViewportState}
            pickingMode={effectivePickingMode}
            measurementActive={measurementActive}
            measurementPoints={measurementPoints}
            showVertexGizmo={showVertexGizmo}
            mobileInteraction={isMobileLayout}
            mobileSelectionMode={mobileInspectMode}
            cameraSyncChannel={cameraSyncChannel}
            cameraSyncRole={cameraSyncRole}
            cameraRestoreRequest={cameraRestoreRequest}
            onSelectFeature={handleViewportSelectFeature}
            onClearSelection={handleClearSelection}
            onSelectFace={handleSelectFace}
            onSelectVertex={handleSelectVertex}
            onSelectSemanticSurface={handleSelectSemanticSurface}
            onVertexCommit={applyFeatureVertices}
            onCameraFocalLengthSync={setCameraFocalLength}
            onCameraPoseChange={handleCameraPoseChange}
            onViewportCenterChange={handleViewportCenterChange}
            onMeasurePoint={handleMeasurePoint}
            onDataRendered={handleViewportDataRendered}
            theme={theme}
          />
        </Suspense>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative size-7 opacity-80">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/65" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-foreground/65" />
            <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/75 bg-background/35" />
          </div>
        </div>

        {editMode && activeObject && activeObjectGeometry && (
          <EditSelectionOverlay
            positionClassName={detailOverlayPositionClass}
            selectedFaceIndex={selectedFaceIndex}
            selectedFaceRingCount={selectedFaceRingCount}
            selectedFaceRingLabel={selectedFaceRingLabel}
            selectedFaceRingIsHole={activeFaceRingIndex > 0}
            selectedFaceVertexCount={selectedFaceVertexCount}
            selectedFaceVertexEntryLabel={selectedFaceVertexEntryLabel}
            selectedFaceHoleCount={selectedFaceHoleCount}
            selectedFaceSemanticType={selectedFaceSemanticSurface?.type ?? null}
            onCycleSelectedFaceRing={(direction) => cycleSelectedFaceRing(direction)}
            onCycleSelectedFaceVertex={cycleSelectedFaceVertex}
          />
        )}

        {showInfoPanelStack && (
          <div className={cn('pointer-events-none absolute z-20 flex flex-col gap-2', isMobileLayout ? 'justify-start' : 'justify-end', infoPanelPositionClass)}>
            {showSemanticPanel && activeSemanticSurface && (
              <SemanticSurfacePanel
                isOpen={infoPanelOpenSections.semantic}
                semanticSurface={activeSemanticSurface}
                isMobileLayout={isMobileLayout}
                onToggle={() => handleToggleInfoPanelSection('semantic')}
              />
            )}
            {showInfoPanel && (
              <InfoPanel
                openSections={infoPanelOpenSections}
                showPinnedSection={showInfoPanelPinnedSection}
                showAttributeSection={showInfoPanelAttributeSection}
                pinnedAttributes={pinnedAttributes}
                pinnableAttributeOptions={pinnableAttributeOptions}
                activeAttributeColorKey={attributeColorKey}
                attributeColorModel={attributeColorModel}
                attributeColorDomain={activeAttributeColorDomain}
                attributeColorMapId={attributeColorMapId}
                attributeColorMapReversed={attributeColorMapReversed}
                attributeColorInheritsParent={attributeColorInheritsParent}
                onToggleSection={handleToggleInfoPanelSection}
                onPinAttribute={handlePinAttribute}
                onUnpinAttribute={handleUnpinAttribute}
                onColorAttribute={handleSelectAttributeColorKey}
                onColorMapChange={handleAttributeColorMapChange}
                onToggleColorMapReversed={handleToggleAttributeColorMapReversed}
                onInheritsParentChange={setAttributeColorInheritsParent}
                onDomainPreview={handlePreviewAttributeColorDomain}
                onDomainChange={handleCommitAttributeColorDomain}
                onRerandomizeCategoricalColors={handleRerandomizeCategoricalColors}
                onCustomCategoricalColorChange={handleCustomCategoricalColorChange}
                onClearAttributeColor={handleClearAttributeColor}
                onClose={() => setIsPinnedAttributesOpen(false)}
              />
            )}
          </div>
        )}

        {isMobileLayout ? (
          <div
            className={cn(
              'pointer-events-none absolute z-10',
              mobileViewportToolbarPositionClass,
            )}
          >
            <MobileViewportToolbar
              showObjectExtents={showObjectExtents}
              onToggleObjectExtents={() => setShowObjectExtents((current) => !current)}
              hasSelectedFeature={Boolean(selectedFeature)}
              appearanceMode={appearanceMode}
              colormapAvailable={availableAttributeColorViewportState != null}
              mobileInspectMode={mobileInspectMode}
              onCycleAppearanceMode={cycleAppearanceMode}
              onSelectAppearanceMode={setAppearanceMode}
              onToggleMobileInspectMode={() =>
                setMobileInspectMode((current) => (current === 'object' ? 'surface' : 'object'))
              }
              onCenterCurrentSelection={centerCurrentSelection}
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-12 right-4 z-10 flex flex-col items-end gap-4">
            {!editMode && (
              <ViewportGeometryModeBar
                geometryDisplayMode={geometryDisplayMode}
                availableLods={availableLods}
                showTooltips={showViewportTooltips}
                onSelectGeometryDisplayMode={handleSelectGeometryDisplayMode}
              />
            )}
            <DesktopViewportToolbar
              showObjectExtents={showObjectExtents}
              onToggleObjectExtents={() => setShowObjectExtents((current) => !current)}
              editMode={editMode}
              xrayActive={!hideOccludedEditEdges}
              xrayDisabled={!editMode || !activeObjectGeometry}
              hasSelectedFeature={Boolean(selectedFeature)}
              appearanceMode={appearanceMode}
              colormapAvailable={availableAttributeColorViewportState != null}
              pickingMode={effectivePickingMode}
              measurementActive={measurementActive}
              showVertexGizmo={showVertexGizmo}
              hasSelectedVertex={selectedVertexIndex != null}
              isolateSelectedFeature={isolateSelectedFeature}
              showTooltips={showViewportTooltips}
              onToggleEditMode={toggleEditMode}
              onCyclePickingMode={cyclePickingMode}
              onToggleMeasurement={toggleMeasurement}
              onToggleVertexGizmo={() => setShowVertexGizmo((current) => !current)}
              onToggleXray={() => setHideOccludedEditEdges((current) => !current)}
              onCycleAppearanceMode={cycleAppearanceMode}
              onSelectAppearanceMode={setAppearanceMode}
              onToggleIsolateSelectedFeature={() => setIsolateSelectedFeature((current) => !current)}
              onSelectPickingMode={handleSelectPickingMode}
              onCenterCurrentSelection={centerCurrentSelection}
              onRestoreGeometry={restoreSelectedFeatureGeometry}
              onClearSelection={handleClearSelection}
              restoreGeometryDisabled={
                !selectedFeatureId ||
                (
                  !geometryEditor.hasChanges(selectedFeatureId)
                )
              }
            />
          </div>
        )}

        {!isMobileLayout && (
          <div
            className={cn(
              'pointer-events-none absolute z-10',
              viewportStatusBarPositionClass,
            )}
          >
            <DesktopViewportStatusBar
              isPinnedAttributesOpen={isPinnedAttributesOpen}
              pinnedAttributeCount={pinnedAttributeCount}
              isPaneCollapsed={isPaneCollapsed}
              activeObjectId={activeObject?.id ?? null}
              viewportCenter={viewportCenter}
              measurementActive={measurementActive}
              measurementPointCount={measurementPoints.length}
              measurementDistance={measurementDistance}
              selectedVertexIndex={selectedVertexIndex}
              cameraFocalLength={cameraFocalLength}
              onCameraFocalLengthChange={setCameraFocalLength}
              onSetTopDownView={() => setTopDownViewRevision((current) => current + 1)}
              onSetCenter={handleSetViewportCenter}
              onTogglePinnedAttributesOpen={() => setIsPinnedAttributesOpen((current) => !current)}
              cameraFollowerActive={Boolean(cameraPublishChannel)}
              isCameraFollower={Boolean(cameraFollowChannel)}
              onOpenCameraFollower={openCameraFollower}
              onBreakCameraFollow={breakCameraFollow}
            />
          </div>
        )}

        {isMobileLayout && !editMode && (
          <div
            className={cn(
              'pointer-events-none absolute z-10',
              viewportGeometryBarPositionClass,
            )}
          >
            <ViewportGeometryModeBar
              geometryDisplayMode={geometryDisplayMode}
              availableLods={availableLods}
              onSelectGeometryDisplayMode={handleSelectGeometryDisplayMode}
            />
          </div>
        )}

        {!isMobileLayout && (
          <ViewportHelpPanel
            isCollapsed={isHelpCollapsed}
            subtitle={editMode ? 'Inspect mode controls' : 'Navigation and selection'}
            helpItems={helpItems}
            onToggleCollapsed={() => setIsHelpCollapsed((current) => !current)}
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.city.json,.cityjson,.jsonl,.city.jsonl"
        multiple
        className="hidden"
        onChange={handleFileSelection}
      />
      <input
        ref={annotationInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleAnnotationSelection}
      />

      <Dialog
        open={isFileDialogOpen}
        onOpenChange={(open) => {
          if (open || dataset) setIsFileDialogOpen(open)
        }}
      >
        <DialogContent
          showCloseButton={Boolean(dataset)}
          closeLabel="Close file dialog"
          className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0"
          finalFocus={fileDialogTriggerRef}
        >
          <DialogHeader className="shrink-0 border-b border-border/40 p-5 pr-14">
            <DialogTitle className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              Open files
            </DialogTitle>
            <DialogDescription>
              Choose an example or open your own CityJSON data.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
            <section aria-labelledby="example-datasets-title">
              <p
                id="example-datasets-title"
                className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
              >
                Examples
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {EXAMPLE_DATASETS.map((example) => (
                  <Card key={example.id} className="gap-3 bg-background/45">
                    <CardHeader className="gap-1.5 px-3 pt-3">
                      <CardTitle className="text-sm">{example.name}</CardTitle>
                      <CardDescription className="text-xs">{example.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-1.5 px-3">
                      {example.formatBadges.map((format) => (
                        <Badge key={format} variant="outline" className="px-2 py-0.5 text-[10px]">
                          {format}
                        </Badge>
                      ))}
                    </CardContent>
                    <CardFooter className="px-3 pb-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void loadExampleDataset(example)}
                        aria-label={`Open ${example.name}`}
                      >
                        Open example
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                CityJSON
              </p>
              <form
                className="mt-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void openCityJsonFromUrl(cityJsonUrlInput)
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="cityjson-url" className="sr-only">
                      CityJSON URL
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="cityjson-url"
                        type="url"
                        inputMode="url"
                        placeholder="Paste a URL…"
                        value={cityJsonUrlInput}
                        onChange={(event) => setCityJsonUrlInput(event.target.value)}
                      />
                      <InputGroupAddon align="inline-end" className="gap-1 pr-1">
                        <InputGroupButton
                          type="submit"
                          variant="outline"
                          size="sm"
                          disabled={tryParseHttpUrl(cityJsonUrlInput) === null}
                        >
                          Open URL
                        </InputGroupButton>
                        <InputGroupButton
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={(event) => triggerCityJsonInput(event.shiftKey)}
                          aria-label={dataset ? 'Upload a CityJSON file to replace the current one' : 'Upload a CityJSON file'}
                          title="Upload files"
                        >
                          <Upload data-icon="inline-start" />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>
              </form>
            </section>

            <section>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Val3dity report
              </p>
              <form
                className="mt-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void openAnnotationFromUrl(annotationUrlInput)
                }}
              >
                <FieldGroup>
                  <Field data-disabled={!dataset}>
                    <FieldLabel htmlFor="val3dity-report-url" className="sr-only">
                      Val3dity report URL
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="val3dity-report-url"
                        type="url"
                        inputMode="url"
                        placeholder={dataset ? 'Paste a URL…' : 'Load a CityJSON file first'}
                        value={annotationUrlInput}
                        onChange={(event) => setAnnotationUrlInput(event.target.value)}
                        disabled={!dataset}
                      />
                      <InputGroupAddon align="inline-end" className="gap-1 pr-1">
                        <InputGroupButton
                          type="submit"
                          variant="outline"
                          size="sm"
                          disabled={!dataset || tryParseHttpUrl(annotationUrlInput) === null}
                        >
                          Open URL
                        </InputGroupButton>
                        <InputGroupButton
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={triggerAnnotationInput}
                          disabled={!dataset}
                          aria-label={annotationSourceName ? 'Upload a val3dity report to replace the current one' : 'Upload a val3dity report'}
                          title="Upload file"
                        >
                          <Upload data-icon="inline-start" />
                        </InputGroupButton>
                        {annotationSourceName && (
                          <InputGroupButton
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={clearAnnotations}
                            aria-label="Clear val3dity report"
                            title="Clear val3dity report"
                          >
                            <X data-icon="inline-start" />
                          </InputGroupButton>
                        )}
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>
              </form>
            </section>

            <p className="text-xs text-muted-foreground">
              Tip: select or drop multiple CityJSON files. Hold Shift while dropping or pressing upload to add to the current scene.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/42 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-sm border border-border/40 bg-background p-5 shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                  {loadingMessage ? 'Validation' : 'Loading'}
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground/92">
                  {loadingMessage ?? 'Loading…'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
        {isInfoDialogOpen && dataset && (
          <InfoDialogContent
            dataset={dataset}
            annotationSourceName={annotationSourceName}
            annotationSourceLocation={annotationSourceLocation}
          />
        )}
      </Dialog>

      <Dialog open={isVal3dityDialogOpen} onOpenChange={setIsVal3dityDialogOpen}>
        {isVal3dityDialogOpen && dataset && (
          <Val3dityParametersDialog
            parameters={val3dityParameters}
            onChange={setVal3dityParameters}
            onRun={() => {
              setIsVal3dityDialogOpen(false)
              void validateCurrentDatasetWithVal3dity()
            }}
          />
        )}
      </Dialog>

      <Dialog open={isChangelogDialogOpen} onOpenChange={setIsChangelogDialogOpen}>
        {isChangelogDialogOpen && <ChangelogDialogContent changelog={changelogText} />}
      </Dialog>

      {isErrorDialogVisible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/42 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-sm border border-destructive/35 bg-background p-5 shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-destructive">
                  Error
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground/92">{error}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={dismissError}
                aria-label="Dismiss error"
                title="Dismiss error"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isDragging && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-sm border-2 border-dashed border-accent/35 bg-card px-10 py-8 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Drop files to open</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Hold Shift to add to the current scene
            </p>
          </div>
        </div>
      )}
    </div>
  )
}


export default App
