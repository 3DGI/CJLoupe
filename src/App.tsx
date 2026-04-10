import {
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Camera,
  CircleHelp,
  Crosshair,
  FileBox,
  FileWarning,
  FolderOpen,
  Github,
  Layers,
  LocateFixed,
  Maximize2,
  Minimize2,
  Moon,
  Move3D,
  Search,
  ScrollText,
  SquareMousePointer,
  Sun,
  X,
  TriangleAlert,
} from 'lucide-react'
import { Suspense, lazy, memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  collectAvailableLods,
  getGeometryDisplayModeKey,
  getObjectGeometryByIndex,
  normalizeObjectGeometryIndex,
  resolveObjectGeometryIndex,
} from '@/lib/object-geometry'
import { errorColor } from '@/lib/error-palette'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/components/use-theme'
import {
  assertValidationAnnotationsMatchDataset,
  loadCityJsonSequenceFromFile,
  loadCityJsonSequenceFromUrl,
  loadValidationReportFromFile,
  loadValidationReportFromUrl,
  mergeValidationAnnotations,
} from '@/lib/cityjson'
import { cn } from '@/lib/utils'
import type {
  Vec3,
  ViewerCityObject,
  ViewerDataset,
  ViewerFeature,
  ViewerFocusTarget,
  ViewerGeometryDisplayMode,
  ViewerObjectGeometry,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/rf-val3dity.city.jsonl`
const SAMPLE_REPORT_URL = `${import.meta.env.BASE_URL}samples/val-report.json`
const VAL3DITY_ERRORS_URL = 'https://val3dity.readthedocs.io/2.6.0/errors/'
const GITHUB_REPO_URL = 'https://github.com/3DGI/CJLoupe'
const DEFAULT_CAMERA_FOCAL_LENGTH = 50
const BAG_BUILDING_ID_PREFIX = 'NL.IMBAG.Pand.'

type DetailPaneMode = 'split' | 'collapsed' | 'fullscreen'
type MobileInspectMode = 'object' | 'surface'
type MobilePanelView = 'features' | 'details'
type HelpItem = { keys: string; description: string }

const FEATURE_LIST_ROW_HEIGHT = 58
const FEATURE_LIST_ROW_GAP = 6
const FEATURE_LIST_TOP_PADDING = 8
const FEATURE_LIST_BOTTOM_PADDING = 12
const FEATURE_LIST_OVERSCAN = 6

const CityViewport = lazy(() =>
  import('@/components/viewer/city-viewport').then((module) => ({ default: module.CityViewport })),
)

type FeatureListItem = {
  feature: ViewerFeature
  objectTypes: string[]
  errorCodeSummary: string
  errorCount: number
  isInvalid: boolean
  searchText: string
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const annotationInputRef = useRef<HTMLInputElement>(null)
  const fileActionMenuRef = useRef<HTMLDivElement>(null)
  const originalVerticesRef = useRef<Map<string, Vec3[]>>(new Map())

  const [dataset, setDataset] = useState<ViewerDataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaneCollapsed, setIsPaneCollapsed] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [activeObjectId, setActiveObjectId] = useState<string | null>(null)
  const [geometryDisplayMode, setGeometryDisplayMode] = useState<ViewerGeometryDisplayMode>({ kind: 'best' })
  const [activeGeometryIndex, setActiveGeometryIndex] = useState<number | null>(null)
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null)
  const [selectedFaceRingIndex, setSelectedFaceRingIndex] = useState(0)
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null)
  const [selectedFaceVertexEntryIndex, setSelectedFaceVertexEntryIndex] = useState<number | null>(null)
  const [geometryRevision, setGeometryRevision] = useState(0)
  const [viewportResetRevision, setViewportResetRevision] = useState(0)
  const [focusRevision, setFocusRevision] = useState(0)
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget>(null)
  const [annotationSourceName, setAnnotationSourceName] = useState<string | null>(null)
  const [cameraFocalLength, setCameraFocalLength] = useState(DEFAULT_CAMERA_FOCAL_LENGTH)
  const [hideOccludedEditEdges, setHideOccludedEditEdges] = useState(true)
  const [showOnlyInvalidFeatures, setShowOnlyInvalidFeatures] = useState(false)
  const [showSemanticSurfaces, setShowSemanticSurfaces] = useState(false)
  const [isolateSelectedFeature, setIsolateSelectedFeature] = useState(false)
  const [detailTab, setDetailTab] = useState('errors')
  const [detailPaneMode, setDetailPaneMode] = useState<DetailPaneMode>('split')
  const [isDragging, setIsDragging] = useState(false)
  const [isHelpCollapsed, setIsHelpCollapsed] = useState(false)
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [mobileInspectMode, setMobileInspectMode] = useState<MobileInspectMode>('object')
  const [mobilePanelView, setMobilePanelView] = useState<MobilePanelView>('features')
  const [dismissedErrorMessage, setDismissedErrorMessage] = useState<string | null>(null)
  const [selectedSemanticSurface, setSelectedSemanticSurface] = useState<{
    featureId: string
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null>(null)
  const dragCountRef = useRef(0)
  const { theme, toggleTheme } = useTheme()

  const featureMap = useMemo(() => {
    return new Map(dataset?.features.map((feature) => [feature.id, feature]) ?? [])
  }, [dataset])

  const selectedFeature = selectedFeatureId ? featureMap.get(selectedFeatureId) ?? null : null
  const selectedFeatureObjectCount = selectedFeature?.objects.length ?? 0
  const availableLods = useMemo(() => collectAvailableLods(dataset), [dataset])
  const activeObject =
    selectedFeature?.objects.find((object) => object.id === activeObjectId) ??
    selectedFeature?.objects[0] ??
    null
  const resolvedActiveGeometryIndex = activeObject
    ? resolveObjectGeometryIndex(activeObject, geometryDisplayMode, activeGeometryIndex)
    : null
  const activeObjectGeometry = getObjectGeometryByIndex(activeObject, resolvedActiveGeometryIndex)
  const activeObjectGeometryCount = activeObject?.geometries.length ?? 0
  const activeObjectAttributeCount = activeObject ? Object.keys(activeObject.attributes).length : 0
  const selectedVertex =
    selectedFeature && selectedVertexIndex != null
      ? selectedFeature.vertices[selectedVertexIndex] ?? null
      : null
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
  const selectedFaceRingLabel =
    selectedFaceRingCount === 0
      ? 'No ring selected'
      : activeFaceRingIndex === 0
        ? 'Outer ring'
        : `Hole ${activeFaceRingIndex}`
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
  const hasDetailAttributes = activeObjectAttributeCount > 0
  const hasDetailGeometries = activeObjectGeometryCount > 0
  const availableDetailTabs = [
    hasDetailErrors ? 'errors' : null,
    hasDetailAttributes ? 'attributes' : null,
    hasDetailGeometries ? 'geometries' : null,
  ].filter((value): value is string => value !== null)
  const hasDetailContent = availableDetailTabs.length > 0
  const resolvedDetailTab = availableDetailTabs.includes(detailTab) ? detailTab : (availableDetailTabs[0] ?? 'attributes')
  const detailSelectionKey = `${selectedFeature?.id ?? 'none'}::${activeObject?.id ?? 'none'}`
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

    return dataset.features.map((feature) => ({
      feature,
      objectTypes: [...new Set(feature.objects.map((object) => object.type))],
      errorCodeSummary: [...new Set(feature.errors.map((error) => error.code))].join(', '),
      errorCount: feature.errors.length,
      isInvalid: feature.validity === false,
      searchText: [
        feature.id,
        feature.label,
        ...feature.objects.map((object) => object.id),
        ...feature.objects.map((object) => object.type),
        ...Object.values(feature.attributes),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase(),
    }))
  }, [dataset])

  const filteredFeatureItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return featureListItems.filter((item) => {
      if (showOnlyInvalidFeatures && item.errorCount === 0) {
        return false
      }

      if (!query) {
        return true
      }

      return item.searchText.includes(query)
    })
  }, [featureListItems, searchQuery, showOnlyInvalidFeatures])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)')
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches)

    updateLayout()
    mediaQuery.addEventListener('change', updateLayout)
    return () => mediaQuery.removeEventListener('change', updateLayout)
  }, [])

  useEffect(() => {
    if (!isMobileLayout) {
      return
    }

    setIsPaneCollapsed(true)
    setIsHelpCollapsed(true)
    setDetailPaneMode('split')
    setEditMode(false)
    setHideOccludedEditEdges(true)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
  }, [isMobileLayout])

  useEffect(() => {
    if (!showSemanticSurfaces) {
      setMobileInspectMode('object')
    }
  }, [showSemanticSurfaces])

  useEffect(() => {
    if (!selectedFeatureId) {
      setMobilePanelView('features')
    }
  }, [selectedFeatureId])

  useEffect(() => {
    setDismissedErrorMessage(null)
  }, [error])

  useEffect(() => {
    if (geometryDisplayMode.kind === 'lod' && !availableLods.includes(geometryDisplayMode.lod)) {
      setGeometryDisplayMode({ kind: 'best' })
    }
  }, [availableLods, geometryDisplayMode])

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
  }, [activeGeometryIndex, activeObject])

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
  }, [
    activeObjectGeometry,
    activeObjectId,
    selectedFaceIndex,
    selectedFeatureId,
    selectedVertexIndex,
  ])

  useEffect(() => {
    if (!showSemanticSurfaces || editMode || !dataset) {
      setSelectedSemanticSurface(null)
      if (!editMode) {
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedVertexIndex(null)
        setSelectedFaceVertexEntryIndex(null)
      }
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
  }, [activeObjectId, dataset, editMode, selectedFeatureId, showSemanticSurfaces])

  useEffect(() => {
    if (!isFileMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (fileActionMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsFileMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isFileMenuOpen])

  async function openCityJsonFile(file: File) {
    setIsLoading(true)
    setError(null)
    setIsFileMenuOpen(false)

    try {
      const nextDataset = await loadCityJsonSequenceFromFile(file)
      applyDataset(nextDataset)
      setAnnotationSourceName(null)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to parse selected file.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  async function openAnnotationFile(file: File) {
    if (!dataset) {
      setError('Open a CityJSON feature file before loading annotations.')
      return
    }

    setIsLoading(true)
    setError(null)
    setIsFileMenuOpen(false)

    try {
      const annotations = await loadValidationReportFromFile(file)
      assertValidationAnnotationsMatchDataset(dataset, annotations)
      setDataset((current) => {
        if (!current) {
          return current
        }

        const nextDataset = mergeValidationAnnotations(current, annotations)
        setShowOnlyInvalidFeatures(nextDataset.features.some((feature) => feature.errors.length > 0))
        return nextDataset
      })
      setAnnotationSourceName(file.name)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to parse annotation report.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void openCityJsonFile(file)
    event.target.value = ''
  }

  function handleAnnotationSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void openAnnotationFile(file)
    event.target.value = ''
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return

    let cityFile: File | null = null
    let reportFile: File | null = null

    for (const file of files) {
      const name = file.name.toLowerCase()
      if (name.endsWith('.jsonl') || name.endsWith('.city.jsonl')) {
        cityFile = file
      } else if (name.endsWith('.json')) {
        reportFile = file
      }
    }

    if (cityFile && reportFile) {
      void openCityJsonAndReport(cityFile, reportFile)
    } else if (cityFile) {
      void openCityJsonFile(cityFile)
    } else if (reportFile) {
      if (dataset) {
        void openAnnotationFile(reportFile)
      } else {
        void openCityJsonFile(reportFile)
      }
    }
  }

  async function openCityJsonAndReport(cityFile: File, reportFile: File) {
    setIsLoading(true)
    setError(null)

    try {
      const [nextDataset, annotations] = await Promise.all([
        loadCityJsonSequenceFromFile(cityFile),
        loadValidationReportFromFile(reportFile),
      ])
      assertValidationAnnotationsMatchDataset(nextDataset, annotations)
      const mergedDataset = mergeValidationAnnotations(nextDataset, annotations)
      applyDataset(mergedDataset)
      setAnnotationSourceName(reportFile.name)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load dropped files.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const resetViewerState = useCallback(() => {
    setCameraFocalLength(DEFAULT_CAMERA_FOCAL_LENGTH)
    setGeometryDisplayMode({ kind: 'best' })
    setActiveGeometryIndex(null)
    setHideOccludedEditEdges(true)
    setShowOnlyInvalidFeatures(false)
    setShowSemanticSurfaces(false)
    setIsolateSelectedFeature(false)
    setDetailTab('errors')
    setDetailPaneMode('split')
    setSearchQuery('')
    setFocusTarget(null)
    setSelectedSemanticSurface(null)
    setViewportResetRevision((current) => current + 1)
  }, [])

  const applyDataset = useCallback((nextDataset: ViewerDataset) => {
    originalVerticesRef.current = new Map(
      nextDataset.features.map((feature) => [feature.id, cloneVertices(feature.vertices)]),
    )
    resetViewerState()
    setDataset(nextDataset)

    const firstFeature = nextDataset.features[0] ?? null
    setSelectedFeatureId(firstFeature?.id ?? null)
    setActiveObjectId(firstFeature?.objects[0]?.id ?? null)
    setActiveGeometryIndex(null)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setEditMode(false)
  }, [resetViewerState])

  const loadFromSample = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [nextDataset, annotations] = await Promise.all([
        loadCityJsonSequenceFromUrl(SAMPLE_URL, 'rf-val3dity sample'),
        loadValidationReportFromUrl(SAMPLE_REPORT_URL),
      ])
      assertValidationAnnotationsMatchDataset(nextDataset, annotations)
      const mergedDataset = mergeValidationAnnotations(nextDataset, annotations)
      applyDataset(mergedDataset)
      setAnnotationSourceName('val-report.json')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load sample file.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [applyDataset])

  useEffect(() => {
    void loadFromSample()
  }, [loadFromSample])

  function clearAnnotations() {
    setDataset((current) => (current ? mergeValidationAnnotations(current, new Map()) : current))
    setAnnotationSourceName(null)
    setShowOnlyInvalidFeatures(false)
  }

  function triggerCityJsonInput() {
    setIsFileMenuOpen(false)
    fileInputRef.current?.click()
  }

  function triggerAnnotationInput() {
    setIsFileMenuOpen(false)
    annotationInputRef.current?.click()
  }

  function handleFileAction() {
    if (!dataset) {
      triggerCityJsonInput()
      return
    }

    setIsFileMenuOpen((current) => !current)
  }

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

  const handleSelectSemanticSurface = useCallback((surface: {
    featureId: string
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null) => {
    setActiveGeometryIndex(surface?.geometryIndex ?? null)
    setSelectedFaceIndex(surface?.faceIndex ?? null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(surface?.surface ? surface : null)
  }, [])

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
        faceIndex: editMode ? selectedFaceIndex : null,
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
      setEditMode(true)
      setIsolateSelectedFeature(true)
      setShowSemanticSurfaces(false)
    }

    setSelectedFaceIndex(error.faceIndex)
    setSelectedFaceRingIndex(0)
    setActiveObjectId(inferredObjectId)
    setActiveGeometryIndex(
      inferredObjectId
        ? normalizeObjectGeometryIndex(
            selectedFeature.objects.find((object) => object.id === inferredObjectId) ?? null,
            error.geometryIndex,
          )
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
      faceIndex: error.faceIndex,
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
  }, [])

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

  const toggleEditMode = useCallback(() => {
    if (isMobileLayout) {
      return
    }

    setEditMode((current) => {
      const next = !current
      if (next) {
        setIsolateSelectedFeature(true)
        setShowSemanticSurfaces(false)
      } else {
        setIsolateSelectedFeature(false)
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedVertexIndex(null)
        setSelectedFaceVertexEntryIndex(null)
      }
      if (next) {
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedFaceVertexEntryIndex(null)
      }
      return next
    })
  }, [isMobileLayout])

  const handleSelectFeature = useCallback((featureId: string, objectId?: string | null) => {
    const feature = featureMap.get(featureId)
    if (!feature) {
      return
    }

    startTransition(() => {
      if (isMobileLayout) {
        setMobilePanelView('details')
      }
      setSelectedFeatureId(featureId)
      setActiveObjectId(objectId ?? feature.objects[0]?.id ?? null)
      setActiveGeometryIndex(null)
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
    })
  }, [featureMap, isMobileLayout])

  const handleSearchQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
  }, [])

  const handleShowOnlyInvalidFeaturesChange = useCallback((checked: boolean) => {
    setShowOnlyInvalidFeatures(checked)
  }, [])

  const handleCenterFeature = useCallback((featureId: string) => {
    handleSelectFeature(featureId)
    centerFeatureById(featureId)
  }, [centerFeatureById, handleSelectFeature])

  const handleSelectFace = useCallback((faceIndex: number | null) => {
    setSelectedFaceIndex(faceIndex)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
  }, [])

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

    if (!editMode || vertexIndex == null || !selectedFeature) {
      return
    }

    const vertex = selectedFeature.vertices[vertexIndex]
    if (!vertex) {
      return
    }

    setFocusTarget({
      kind: 'vertex',
      featureId: selectedFeature.id,
      objectId: activeObjectId,
      vertexIndex,
    })
    setFocusRevision((current) => current + 1)
  }, [activeObjectId, editMode, selectedFace, selectedFeature])

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

  const cycleSelectedFaceRing = useCallback(() => {
    if (selectedFaceRingCount <= 1) {
      return
    }

    setSelectedFaceRingIndex((current) => (current + 1) % selectedFaceRingCount)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
  }, [selectedFaceRingCount])

  const applyFeatureVertices = useCallback((featureId: string, vertices: Vec3[]) => {
    setDataset((current) => {
      if (!current) {
        return current
      }

      const feature = current.features.find((candidate) => candidate.id === featureId)
      if (feature) {
        feature.vertices = cloneVertices(vertices)
      }

      return current
    })
    setGeometryRevision((current) => current + 1)
  }, [])

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
        setShowSemanticSurfaces((current) => !current)
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

      if (editMode && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        cycleSelectedFaceRing()
        return
      }

      if (event.key.toLowerCase() === 'u') {
        if (!selectedFeatureId) {
          return
        }

        const originalVertices = originalVerticesRef.current.get(selectedFeatureId)
        if (!originalVertices) {
          return
        }

        event.preventDefault()
        applyFeatureVertices(selectedFeatureId, originalVertices)
        setSelectedVertexIndex(null)
        setSelectedFaceVertexEntryIndex(null)
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyFeatureVertices, centerCurrentSelection, cycleGeometryDisplayMode, cycleSelectedFaceRing, cycleSelectedFaceVertex, dataset, editMode, selectedFeatureId, toggleEditMode])

  const hasValidationReportLoaded = Boolean(annotationSourceName)
  const isErrorDialogVisible = Boolean(error && dismissedErrorMessage !== error)
  const isPaneContentVisible = !isPaneCollapsed
  const isFeaturePanelVisible = !isMobileLayout || mobilePanelView === 'features'
  const isDetailPanelVisible = !isMobileLayout || mobilePanelView === 'details'
  const detailOverlayPositionClass = isMobileLayout ? 'bottom-20 left-3 right-3' : 'bottom-20 left-4 max-w-md'
  const viewportToolbarPositionClass = isMobileLayout ? 'left-3 right-3 top-4' : 'bottom-4 left-4 right-4'
  const viewportGeometryBarPositionClass = isMobileLayout
    ? 'right-3 top-20'
    : 'bottom-20 right-4'
  const mobilePanelTabs: Array<{ view: MobilePanelView; label: string; disabled?: boolean }> = [
    { view: 'features', label: 'Features' },
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
        { keys: 'Panel', description: 'Browse features and details' },
        { keys: 'Sem', description: 'Toggle semantic colors' },
      ]
    : editMode
      ? [
          { keys: 'Tab', description: 'Exit edit mode' },
          { keys: 'C', description: 'Center selection' },
          { keys: 'S', description: 'Toggle semantic colors' },
          { keys: 'Shift + Click', description: 'Select face' },
          { keys: 'Ctrl/Cmd + Click', description: 'Select vertex' },
          { keys: 'J / K', description: 'Step active ring' },
          { keys: 'R', description: 'Cycle rings' },
          { keys: 'I', description: 'Toggle isolate' },
          { keys: 'X', description: 'Toggle xray' },
          { keys: 'U', description: 'Reset feature geometry' },
        ]
      : [
          { keys: 'Shift + Click', description: 'Select geometry' },
          { keys: 'Double Click', description: 'Recenter navigation' },
          { keys: 'Tab', description: 'Enter edit mode' },
          { keys: 'C', description: 'Center selection' },
          { keys: 'L', description: 'Cycle LoDs' },
          { keys: 'S', description: 'Toggle semantic colors' },
          { keys: 'I', description: 'Toggle isolate' },
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
                : 'flex h-full w-16 shrink-0 flex-col items-center justify-between border-r border-border py-3',
            )}
          >
            <div className={cn('flex items-center gap-2', isMobileLayout ? 'min-w-0 flex-1' : 'flex-col')}>
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
                <span className="truncate text-sm font-black uppercase tracking-[0.28em] text-foreground/86">
                  CJLoupe
                </span>
              ) : (
                <span
                  className="pointer-events-none select-none font-black uppercase tracking-[0.34em] text-foreground/86 [writing-mode:vertical-rl]"
                  style={{ textOrientation: 'mixed' }}
                >
                  CJLoupe
                </span>
              )}
              <div ref={fileActionMenuRef} className="relative">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleFileAction}
                  aria-label={dataset ? 'Open file actions' : 'Open CityJSONL file'}
                  title={dataset ? 'Open file actions' : 'Open CityJSONL file'}
                  aria-expanded={dataset ? isFileMenuOpen : undefined}
                  aria-haspopup={dataset ? 'menu' : undefined}
                >
                  <FolderOpen className="size-4" />
                </Button>

                {dataset && isFileMenuOpen && (
                  <div
                    className={cn(
                      'floating-panel absolute z-30 w-72 border py-2 px-3',
                      isMobileLayout ? 'bottom-full left-0 mb-2' : 'left-full top-0 ml-3',
                    )}
                  >
                    {/* CityJSONL row */}
                    <div className="group flex items-center gap-2.5">
                      <FileBox className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          CityJSONL
                        </p>
                        <p className="truncate text-xs text-foreground/85">
                          {dataset.sourceName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={triggerCityJsonInput}
                        aria-label="Replace CityJSONL file"
                        title="Replace CityJSONL file"
                      >
                        <FolderOpen className="size-3.5" />
                      </Button>
                    </div>

                    <div className="my-2 border-t border-foreground/8" />

                    {/* Val3dity Report row */}
                    <div className="group flex items-center gap-2.5">
                      <FileWarning
                        className={cn(
                          'size-4 shrink-0',
                          annotationSourceName ? 'text-destructive/70' : 'text-muted-foreground',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Val3dity Report
                        </p>
                        <p
                          className={cn(
                            'truncate text-xs',
                            annotationSourceName ? 'text-destructive' : 'text-foreground/45',
                          )}
                        >
                          {annotationSourceName ?? 'No report loaded'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={triggerAnnotationInput}
                          aria-label={annotationSourceName ? 'Replace val3dity report' : 'Load val3dity report'}
                          title={annotationSourceName ? 'Replace val3dity report' : 'Load val3dity report'}
                        >
                          <FolderOpen className="size-3.5" />
                        </Button>
                        {annotationSourceName && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-destructive hover:text-destructive"
                            onClick={clearAnnotations}
                            aria-label="Clear val3dity report"
                            title="Clear val3dity report"
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                asChild
              >
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open GitHub repository"
                  title="Open GitHub repository"
                >
                  <Github className="size-4" />
                </a>
              </Button>
            </div>

            <div className={cn('flex items-center gap-2', isMobileLayout ? 'shrink-0' : 'flex-col')}>
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                {dataset?.features.length ?? 0}
              </Badge>
            </div>
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
                    datasetFeatureCount={dataset?.features.length ?? 0}
                    showDesktopHeading={!isMobileLayout}
                    searchQuery={searchQuery}
                    selectedFeatureId={selectedFeatureId}
                    showOnlyInvalidFeatures={showOnlyInvalidFeatures}
                    onSearchQueryChange={handleSearchQueryChange}
                    onShowOnlyInvalidFeaturesChange={handleShowOnlyInvalidFeaturesChange}
                    onCenterFeature={handleCenterFeature}
                    onSelectFeature={handleSelectFeature}
                    activeObjectId={activeObject?.id ?? null}
                    activeGeometryIndex={resolvedActiveGeometryIndex}
                  />
                </section>
              )}

              {isDetailPanelVisible && (
              <Tabs value={resolvedDetailTab} onValueChange={setDetailTab} asChild>
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
                >
                  <div className="panel-header-surface space-y-2.5 p-4 pb-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center justify-center text-muted-foreground">
                            <Box className="size-3.5" />
                          </span>
                          <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {activeObject ? formatObjectDisplayId(activeObject.id) : selectedFeature?.label ?? 'No item selected'}
                          </p>
                          {activeObject && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              {activeObject.type}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          {!activeObject && <span>{selectedFeatureObjectCount} objects</span>}
                          {activeObject && <span>{activeObjectGeometryCount} geometries</span>}
                          {hasValidationReportLoaded && (
                            <span>{visibleDetailErrorCount} errors</span>
                          )}
                          <span>{activeObjectAttributeCount} attributes</span>
                        </div>
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
                      <div className="-mx-4 -mb-2.5 border-b border-border px-4 pt-1.5">
                        <TabsList className="gap-0">
                          {hasDetailErrors && (
                            <TabsTrigger value="errors" className="detail-tab">
                              Errors
                            </TabsTrigger>
                          )}
                          {hasDetailAttributes && (
                            <TabsTrigger value="attributes" className="detail-tab">
                              Attributes
                            </TabsTrigger>
                          )}
                          {hasDetailGeometries && (
                            <TabsTrigger value="geometries" className="detail-tab">
                              Geometries
                            </TabsTrigger>
                          )}
                        </TabsList>
                      </div>
                    )}
                  </div>

                  {detailPaneMode !== 'collapsed' && (
                    <ScrollArea key={detailSelectionKey} className="min-h-0 min-w-0 flex-1">
                      <div className="panel-body-surface min-w-0 space-y-2 p-4 pt-3">
                        {selectedFeature ? (
                          <>
                            {hasDetailContent ? (
                              <>
                                {hasDetailErrors && (
                                  <TabsContent key={`${detailSelectionKey}::errors`} value="errors">
                                    <div className="space-y-3">
                                      {visibleDetailErrorCount > 0 ? (
                                        <div className="grid gap-2">
                                          {visibleDetailErrors.map((error, errorIndex) => {
                                            const color = errorColor(error.code)
                                            return (
                                              <div
                                                key={`${error.id}-${error.code}-${errorIndex}`}
                                                className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-sm border px-3 py-2.5 text-left transition"
                                                style={{
                                                  borderColor: `${color}30`,
                                                  backgroundColor: `${color}18`,
                                                }}
                                              >
                                                <div className="min-w-0 flex-1 overflow-hidden">
                                                  <div className="flex min-w-0 items-start justify-between gap-3">
                                                    <div className="flex min-w-0 items-start gap-2.5">
                                                      <span
                                                        className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                                                        style={{ backgroundColor: color }}
                                                      />
                                                      <div className="min-w-0 overflow-hidden">
                                                        <p className="truncate text-sm font-semibold text-foreground/90">{error.description}</p>
                                                        <a
                                                          href={getVal3dityErrorUrl(error)}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground underline decoration-muted-foreground/35 underline-offset-3 transition hover:text-foreground"
                                                        >
                                                          code {error.code}
                                                        </a>
                                                      </div>
                                                    </div>
                                                    {error.faceIndex != null && (
                                                      <Badge
                                                        variant="outline"
                                                        className="shrink-0 text-foreground/70"
                                                        style={{ borderColor: `${color}50`, backgroundColor: `${color}20` }}
                                                      >
                                                        face {error.faceIndex}
                                                      </Badge>
                                                    )}
                                                  </div>
                                                  <p className="mt-1.5 break-words font-mono text-[10px] text-muted-foreground">
                                                    {error.id}
                                                  </p>
                                                  {error.info && (
                                                    <p className="mt-1.5 text-sm text-foreground/65">{error.info}</p>
                                                  )}
                                                </div>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8 shrink-0 self-center"
                                                  aria-label={`Center ${error.description}`}
                                                  title={`Center ${error.description}`}
                                                  onClick={() => centerValidationError(error)}
                                                >
                                                  <Crosshair className="size-4" />
                                                </Button>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  </TabsContent>
                                )}

                                {hasDetailAttributes && (
                                  <TabsContent key={`${detailSelectionKey}::attributes`} value="attributes">
                                    <DetailAttributePanel
                                      objectAttributes={activeObject?.attributes ?? {}}
                                    />
                                  </TabsContent>
                                )}

                                {hasDetailGeometries && (
                                  <TabsContent key={`${detailSelectionKey}::geometries`} value="geometries">
                                    <DetailGeometryPanel
                                      geometries={activeObject?.geometries ?? []}
                                      activeGeometryIndex={resolvedActiveGeometryIndex}
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
                            Click a building in the scene or choose a feature from the left column.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </section>
              </Tabs>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="relative h-full min-w-0 flex-1">
        <Suspense fallback={<div className="h-full w-full bg-canvas" />}>
          <CityViewport
            key={viewportResetRevision}
            data={dataset}
            cameraFocalLength={cameraFocalLength}
            hideOccludedEditEdges={hideOccludedEditEdges}
            isolateSelectedFeature={isolateSelectedFeature}
            geometryDisplayMode={geometryDisplayMode}
            activeGeometryIndex={activeGeometryIndex}
            geometryRevision={geometryRevision}
            viewportResetRevision={viewportResetRevision}
            focusRevision={focusRevision}
            focusTarget={focusTarget}
            selectedFeatureId={selectedFeatureId}
            activeObjectId={activeObjectId}
            editMode={editMode}
            selectedFaceIndex={selectedFaceIndex}
            selectedFaceRingIndex={activeFaceRingIndex}
            selectedVertexIndex={selectedVertexIndex}
            showSemanticSurfaces={showSemanticSurfaces}
            mobileInteraction={isMobileLayout}
            mobileSelectionMode={mobileInspectMode}
            onSelectFeature={handleSelectFeature}
            onSelectFace={handleSelectFace}
            onSelectVertex={handleSelectVertex}
            onSelectSemanticSurface={handleSelectSemanticSurface}
            onVertexCommit={applyFeatureVertices}
            theme={theme}
          />
        </Suspense>

        <div className="pointer-events-none absolute inset-0 canvas-fade" />
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
            selectedVertex={selectedVertex}
            selectedVertexIndex={selectedVertexIndex}
            selectedFaceIndex={selectedFaceIndex}
            selectedFaceRingCount={selectedFaceRingCount}
            selectedFaceRingLabel={selectedFaceRingLabel}
            selectedFaceVertexCount={selectedFaceVertexCount}
            selectedFaceVertexEntryLabel={selectedFaceVertexEntryLabel}
            selectedFaceHoleCount={selectedFaceHoleCount}
            onCycleSelectedFaceRing={cycleSelectedFaceRing}
            onCycleSelectedFaceVertex={cycleSelectedFaceVertex}
          />
        )}

        {!editMode && showSemanticSurfaces && activeSemanticSurface && (
          <SemanticSurfaceOverlay
            positionClassName={detailOverlayPositionClass}
            semanticSurface={activeSemanticSurface}
          />
        )}

        <div
          className={cn(
            'pointer-events-none absolute z-10',
            viewportToolbarPositionClass,
          )}
        >
          {isMobileLayout ? (
            <MobileViewportToolbar
              hasSelectedFeature={Boolean(selectedFeature)}
              showSemanticSurfaces={showSemanticSurfaces}
              mobileInspectMode={mobileInspectMode}
              onToggleSemanticSurfaces={() => setShowSemanticSurfaces((current) => !current)}
              onToggleMobileInspectMode={() =>
                setMobileInspectMode((current) => (current === 'object' ? 'surface' : 'object'))
              }
              onCenterCurrentSelection={centerCurrentSelection}
            />
          ) : (
            <DesktopViewportToolbar
              isPaneCollapsed={isPaneCollapsed}
              activeObjectId={activeObject?.id ?? null}
              editMode={editMode}
              xrayActive={!hideOccludedEditEdges}
              xrayDisabled={!editMode || !activeObjectGeometry}
              hasSelectedFeature={Boolean(selectedFeature)}
              showSemanticSurfaces={showSemanticSurfaces}
              isolateSelectedFeature={isolateSelectedFeature}
              cameraFocalLength={cameraFocalLength}
              onToggleEditMode={toggleEditMode}
              onToggleXray={() => setHideOccludedEditEdges((current) => !current)}
              onToggleSemanticSurfaces={() => setShowSemanticSurfaces((current) => !current)}
              onToggleIsolateSelectedFeature={() => setIsolateSelectedFeature((current) => !current)}
              onCenterCurrentSelection={centerCurrentSelection}
              onCameraFocalLengthChange={setCameraFocalLength}
            />
          )}
        </div>

        {Boolean(selectedFeature) && !editMode && (
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
            subtitle={editMode ? 'Edit mode controls' : 'Navigation and selection'}
            helpItems={helpItems}
            onToggleCollapsed={() => setIsHelpCollapsed((current) => !current)}
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jsonl,.city.jsonl"
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

      {isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/42 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-sm border border-border/40 bg-background/94 p-5 shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                  Loading
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground/92">
                  Loading...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isErrorDialogVisible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/42 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-sm border border-destructive/35 bg-background/94 p-5 shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]">
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
                onClick={() => setDismissedErrorMessage(error)}
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-sm border-2 border-dashed border-accent/35 bg-card/85 px-10 py-8 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Drop file to open</p>
            <p className="mt-1 text-sm text-muted-foreground">
              .city.jsonl for features, .json for val3dity report
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function EditSelectionOverlay({
  positionClassName,
  selectedVertex,
  selectedVertexIndex,
  selectedFaceIndex,
  selectedFaceRingCount,
  selectedFaceRingLabel,
  selectedFaceVertexCount,
  selectedFaceVertexEntryLabel,
  selectedFaceHoleCount,
  onCycleSelectedFaceRing,
  onCycleSelectedFaceVertex,
}: {
  positionClassName: string
  selectedVertex: Vec3 | null
  selectedVertexIndex: number | null
  selectedFaceIndex: number | null
  selectedFaceRingCount: number
  selectedFaceRingLabel: string
  selectedFaceVertexCount: number
  selectedFaceVertexEntryLabel: string | null
  selectedFaceHoleCount: number
  onCycleSelectedFaceRing: () => void
  onCycleSelectedFaceVertex: (direction: -1 | 1) => void
}) {
  return (
    <div className={cn('pointer-events-none absolute z-10', positionClassName)}>
      <div className="space-y-2">
        {selectedVertex && (
          <div className="floating-panel pointer-events-auto rounded-sm border px-3 py-2 font-mono text-[11px] text-muted-foreground">
            vtx {selectedVertexIndex}
            <span className="mx-1 text-border">|</span>
            {selectedVertex[0].toFixed(3)}, {selectedVertex[1].toFixed(3)}, {selectedVertex[2].toFixed(3)}
          </div>
        )}
        <div className="floating-panel pointer-events-auto space-y-2 rounded-sm border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {selectedFaceIndex != null ? `Face ${selectedFaceIndex}` : 'No face selected'}
            </Badge>
            {selectedFaceRingCount > 0 && (
              <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
                {selectedFaceRingLabel}
              </Badge>
            )}
            {selectedFaceVertexCount > 0 && (
              <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
                {selectedFaceVertexCount} vertices
              </Badge>
            )}
            {selectedFaceVertexEntryLabel && (
              <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
                {selectedFaceVertexEntryLabel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              onClick={onCycleSelectedFaceRing}
              disabled={selectedFaceHoleCount === 0}
            >
              Next ring (R)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              onClick={() => onCycleSelectedFaceVertex(-1)}
              disabled={selectedFaceVertexCount === 0}
            >
              Prev vertex (J)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              onClick={() => onCycleSelectedFaceVertex(1)}
              disabled={selectedFaceVertexCount === 0}
            >
              Next vertex (K)
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SemanticSurfaceOverlay({
  positionClassName,
  semanticSurface,
}: {
  positionClassName: string
  semanticSurface: {
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface
  }
}) {
  const surfaceColor = semanticSurfaceColor(semanticSurface.surface.type)

  return (
    <div className={cn('pointer-events-none absolute z-10', positionClassName)}>
      <div className="floating-panel pointer-events-auto space-y-3 rounded-sm border p-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-foreground"
            style={{
              borderColor: `${surfaceColor}66`,
              backgroundColor: `${surfaceColor}22`,
              color: surfaceColor,
            }}
          >
            {semanticSurface.surface.type}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
            {formatObjectDisplayId(semanticSurface.objectId)}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
            geom {semanticSurface.geometryIndex}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
            face {semanticSurface.faceIndex}
          </Badge>
        </div>

        {Object.keys(semanticSurface.surface.attributes).length > 0 ? (
          <dl className="m-0 space-y-2">
            {Object.entries(semanticSurface.surface.attributes).map(([key, value]) => (
              <div
                key={key}
                className="rounded-sm border border-foreground/8 bg-foreground/3 px-2.5 py-1.5"
              >
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  {key}
                </dt>
                <dd className="mt-1 text-sm text-foreground/80">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No semantic surface attributes.</p>
        )}
      </div>
    </div>
  )
}

function MobileViewportToolbar({
  hasSelectedFeature,
  showSemanticSurfaces,
  mobileInspectMode,
  onToggleSemanticSurfaces,
  onToggleMobileInspectMode,
  onCenterCurrentSelection,
}: {
  hasSelectedFeature: boolean
  showSemanticSurfaces: boolean
  mobileInspectMode: MobileInspectMode
  onToggleSemanticSurfaces: () => void
  onToggleMobileInspectMode: () => void
  onCenterCurrentSelection: () => void
}) {
  return (
    <div className="floating-panel pointer-events-auto flex max-w-[min(100vw-2rem,28rem)] flex-wrap items-center gap-2 rounded-sm border px-2 py-2">
      {hasSelectedFeature && (
        <Button
          variant={showSemanticSurfaces ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2.5"
          onClick={onToggleSemanticSurfaces}
        >
          Sem
        </Button>
      )}
      {hasSelectedFeature && showSemanticSurfaces && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5"
          onClick={onToggleMobileInspectMode}
        >
          {mobileInspectMode === 'surface' ? 'Surface' : 'Object'}
        </Button>
      )}
      {hasSelectedFeature && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 gap-1.5 px-2.5"
          onClick={onCenterCurrentSelection}
        >
          <LocateFixed className="size-3.5" />
          Center
        </Button>
      )}
    </div>
  )
}

function DesktopViewportToolbar({
  isPaneCollapsed,
  activeObjectId,
  editMode,
  xrayActive,
  xrayDisabled,
  hasSelectedFeature,
  showSemanticSurfaces,
  isolateSelectedFeature,
  cameraFocalLength,
  onToggleEditMode,
  onToggleXray,
  onToggleSemanticSurfaces,
  onToggleIsolateSelectedFeature,
  onCenterCurrentSelection,
  onCameraFocalLengthChange,
}: {
  isPaneCollapsed: boolean
  activeObjectId: string | null
  editMode: boolean
  xrayActive: boolean
  xrayDisabled: boolean
  hasSelectedFeature: boolean
  showSemanticSurfaces: boolean
  isolateSelectedFeature: boolean
  cameraFocalLength: number
  onToggleEditMode: () => void
  onToggleXray: () => void
  onToggleSemanticSurfaces: () => void
  onToggleIsolateSelectedFeature: () => void
  onCenterCurrentSelection: () => void
  onCameraFocalLengthChange: (value: number) => void
}) {
  return (
    <div className="floating-panel pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-sm border px-2.5 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {isPaneCollapsed && (
          <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
            <SquareMousePointer className="mr-1 size-3.5" />
            {activeObjectId ?? 'No object'}
          </Badge>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <div className="floating-chip flex items-center gap-1 rounded-sm border p-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={onToggleEditMode}>
            <Move3D className="size-3.5" />
            {editMode ? 'Exit edit' : 'Edit'}
          </Button>
          <ToolbarToggleButton
            active={xrayActive}
            disabled={xrayDisabled}
            onClick={onToggleXray}
            ariaLabel="Toggle xray view for edit mode"
          >
            Xray
          </ToolbarToggleButton>
        </div>
        {hasSelectedFeature && (
          <>
            <ToolbarToggleButton
              active={showSemanticSurfaces}
              onClick={onToggleSemanticSurfaces}
              ariaLabel="Toggle semantic surface colors"
            >
              Semantics
            </ToolbarToggleButton>
            <ToolbarToggleButton
              active={isolateSelectedFeature}
              onClick={onToggleIsolateSelectedFeature}
              ariaLabel="Toggle isolate selected feature"
            >
              Isolate
            </ToolbarToggleButton>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onCenterCurrentSelection}
              aria-label="Center current selection"
              title="Center current selection"
            >
              <LocateFixed className="size-3.5" />
            </Button>
          </>
        )}
        <div className="floating-chip flex items-center gap-1.5 rounded-sm border px-2 py-1">
          <Camera className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">{cameraFocalLength}mm</span>
          <input
            type="range"
            min={12}
            max={120}
            step={1}
            value={cameraFocalLength}
            onChange={(event) => onCameraFocalLengthChange(Number(event.target.value))}
            className="slider-accent h-2 w-24 cursor-pointer appearance-none rounded-none bg-input"
            aria-label="Camera focal length"
          />
        </div>
      </div>
    </div>
  )
}

function ViewportHelpPanel({
  isCollapsed,
  subtitle,
  helpItems,
  onToggleCollapsed,
}: {
  isCollapsed: boolean
  subtitle: string
  helpItems: HelpItem[]
  onToggleCollapsed: () => void
}) {
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-md">
      <div
        className={cn(
          'floating-panel pointer-events-auto flex items-start gap-3 rounded-sm border text-sm',
          isCollapsed ? 'px-2 py-2' : 'max-w-sm px-3 py-3',
        )}
      >
        {!isCollapsed && (
          <div id="viewport-help-panel" className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Hotkeys
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </div>

            <div className="grid gap-1.5">
              {helpItems.map((hotkey) => (
                <div key={hotkey.keys} className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px] text-foreground/80">
                    {hotkey.keys}
                  </Badge>
                  <span className="text-right text-xs leading-5 text-foreground/76">
                    {hotkey.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-start gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-8 shrink-0 gap-1 px-2"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? 'Expand hotkey panel' : 'Collapse hotkey panel'}
            aria-expanded={!isCollapsed}
            aria-controls="viewport-help-panel"
          >
            <CircleHelp className="size-4" />
            {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatObjectDisplayId(objectId: string) {
  return objectId.startsWith(BAG_BUILDING_ID_PREFIX)
    ? objectId.slice(BAG_BUILDING_ID_PREFIX.length)
    : objectId
}

function collectTreeRootIds(objects: ViewerCityObject[], objectById: Map<string, ViewerCityObject>) {
  const roots = objects
    .filter((object) => object.parentIds.length === 0 || object.parentIds.every((parentId) => !objectById.has(parentId)))
    .map((object) => object.id)

  return roots.length > 0 ? roots : objects.map((object) => object.id)
}

function collectExpandedObjectIds(activeObjectId: string | null, objectById: Map<string, ViewerCityObject>) {
  if (!activeObjectId) {
    return new Set<string>()
  }

  const expandedIds = new Set<string>()
  const visit = (objectId: string | null | undefined) => {
    if (!objectId || expandedIds.has(objectId)) {
      return
    }

    const object = objectById.get(objectId)
    if (!object) {
      return
    }

    expandedIds.add(objectId)
    object.parentIds.forEach(visit)
  }

  visit(activeObjectId)
  return expandedIds
}

function getObjectGeometryChips(geometries: ViewerObjectGeometry[]) {
  const chips = new Map<string, { key: string; label: string }>()

  for (const geometry of geometries) {
    const label = geometry.lod ?? `g${geometry.index}`
    if (chips.has(label)) {
      continue
    }

    chips.set(label, {
      key: `${label}:${geometry.index}`,
      label,
    })
  }

  return [...chips.values()]
}

function getObjectGeometryTypeLabel(geometries: ViewerObjectGeometry[]) {
  const types = [...new Set(geometries.map((geometry) => geometry.geometryType).filter(Boolean))]

  if (types.length === 0) {
    return null
  }

  if (types.length === 1) {
    return types[0]
  }

  if (types.length === 2) {
    return `${types[0]} + ${types[1]}`
  }

  return `${types[0]} +${types.length - 1}`
}

function ObjectTreeIndicators({
  hasAttributes,
  errorCount,
}: {
  hasAttributes: boolean
  errorCount: number
}) {
  if (!hasAttributes && errorCount === 0) {
    return null
  }

  return (
    <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {hasAttributes && (
        <span title="Has attributes" aria-label="Has attributes" className="inline-flex items-center justify-center">
          <ScrollText className="size-3" />
        </span>
      )}
      {errorCount > 0 && (
        <span
          title={`${errorCount} errors`}
          aria-label={`${errorCount} errors`}
          className="inline-flex items-center gap-1 text-[9px] font-medium text-destructive"
        >
          <TriangleAlert className="size-3" />
          <span>{errorCount}</span>
        </span>
      )}
    </div>
  )
}

function ObjectTreeGeometrySummary({
  geometryTypeLabel,
  chips,
}: {
  geometryTypeLabel: string | null
  chips: Array<{ key: string; label: string }>
}) {
  if (!geometryTypeLabel && chips.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {geometryTypeLabel && (
        <span className="rounded-sm border border-foreground/10 bg-background/45 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {geometryTypeLabel}
        </span>
      )}
      {chips.length > 0 && (
        <div className="inline-flex overflow-hidden rounded-sm border border-foreground/10 bg-background/45">
          {chips.map((chip, index) => (
            <span
              key={chip.key}
              className={cn(
                'px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground',
                index > 0 && 'border-l border-foreground/10',
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const FeatureObjectTree = memo(function FeatureObjectTree({
  objects,
  activeObjectId,
  activeGeometryIndex,
  errorCountsByObjectId,
  onSelectObject,
}: {
  objects: ViewerCityObject[]
  activeObjectId: string | null
  activeGeometryIndex: number | null
  errorCountsByObjectId: Map<string, number>
  onSelectObject: (objectId: string) => void
}) {
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects])
  const rootIds = useMemo(() => collectTreeRootIds(objects, objectById), [objectById, objects])
  const expandedIds = useMemo(
    () => collectExpandedObjectIds(activeObjectId, objectById),
    [activeObjectId, objectById],
  )

  return (
    <div className="space-y-1">
      {rootIds.map((objectId) => (
        <FeatureObjectTreeNode
          key={objectId}
          objectId={objectId}
          objectById={objectById}
          activeObjectId={activeObjectId}
          activeGeometryIndex={activeGeometryIndex}
          errorCountsByObjectId={errorCountsByObjectId}
          expandedIds={expandedIds}
          onSelectObject={onSelectObject}
          depth={0}
        />
      ))}
    </div>
  )
})

const FeatureObjectTreeNode = memo(function FeatureObjectTreeNode({
  objectId,
  objectById,
  activeObjectId,
  activeGeometryIndex,
  errorCountsByObjectId,
  expandedIds,
  onSelectObject,
  depth,
  visited = new Set<string>(),
}: {
  objectId: string
  objectById: Map<string, ViewerCityObject>
  activeObjectId: string | null
  activeGeometryIndex: number | null
  errorCountsByObjectId: Map<string, number>
  expandedIds: Set<string>
  onSelectObject: (objectId: string) => void
  depth: number
  visited?: Set<string>
}) {
  const object = objectById.get(objectId)
  const isVisited = visited.has(objectId)
  const childIds = object?.childIds.filter((childId) => objectById.has(childId)) ?? []
  const hasChildren = childIds.length > 0
  const isActive = objectId === activeObjectId
  const hasAttributes = Object.keys(object?.attributes ?? {}).length > 0
  const errorCount = errorCountsByObjectId.get(objectId) ?? 0
  const chips = getObjectGeometryChips(object?.geometries ?? [])
  const geometryTypeLabel = getObjectGeometryTypeLabel(object?.geometries ?? [])
  const nextVisited = new Set(visited)
  nextVisited.add(objectId)
  const [open, setOpen] = useState(depth === 0 || expandedIds.has(objectId))
  const wasExpandedBySelectionRef = useRef(expandedIds.has(objectId))

  useEffect(() => {
    const isExpandedBySelection = expandedIds.has(objectId)

    if (isExpandedBySelection && !wasExpandedBySelectionRef.current) {
      setOpen(true)
    }
    wasExpandedBySelectionRef.current = isExpandedBySelection
  }, [expandedIds, objectId])

  if (isVisited || !object) {
    return null
  }

  if (!hasChildren) {
    return (
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <button
          type="button"
          onClick={() => onSelectObject(object.id)}
          className={cn(
            'flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 text-left transition',
            isActive
              ? 'bg-primary/10 text-foreground'
              : 'text-foreground/72 hover:bg-foreground/6',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="min-w-0 truncate text-[11px] font-medium">{formatObjectDisplayId(object.id)}</span>
          </div>
          <ObjectTreeIndicators hasAttributes={hasAttributes} errorCount={errorCount} />
          <span className="shrink-0 text-[10px] text-muted-foreground">{object.type}</span>
          {(geometryTypeLabel || chips.length > 0) && (
            <div className="hidden shrink-0 md:block">
              <ObjectTreeGeometrySummary geometryTypeLabel={geometryTypeLabel} chips={chips} />
            </div>
          )}
        </button>
        {(geometryTypeLabel || chips.length > 0) && (
          <div className="mt-1 pl-7 md:hidden">
            <ObjectTreeGeometrySummary geometryTypeLabel={geometryTypeLabel} chips={chips} />
          </div>
        )}
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <div
          className={cn(
            'flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 transition',
            isActive
              ? 'bg-primary/10 text-foreground'
              : 'text-foreground/72 hover:bg-foreground/6',
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={open ? `Collapse ${formatObjectDisplayId(object.id)}` : `Expand ${formatObjectDisplayId(object.id)}`}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition hover:bg-foreground/6 hover:text-foreground"
              onClick={(event) => event.stopPropagation()}
            >
              <ChevronRight
                className={cn('size-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
              />
            </button>
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={() => onSelectObject(object.id)}
            className="flex min-h-6 min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="min-w-0 truncate text-[11px] font-medium">{formatObjectDisplayId(object.id)}</span>
            </div>
            <ObjectTreeIndicators hasAttributes={hasAttributes} errorCount={errorCount} />
            <span className="shrink-0 text-[10px] text-muted-foreground">{object.type}</span>
            {(geometryTypeLabel || chips.length > 0) && (
              <div className="hidden shrink-0 md:block">
                <ObjectTreeGeometrySummary geometryTypeLabel={geometryTypeLabel} chips={chips} />
              </div>
            )}
          </button>
        </div>
        {(geometryTypeLabel || chips.length > 0) && (
          <div className="mt-1 pl-8 md:hidden">
            <ObjectTreeGeometrySummary geometryTypeLabel={geometryTypeLabel} chips={chips} />
          </div>
        )}
        <CollapsibleContent className="overflow-hidden">
          <div className="mt-1 space-y-1 border-l border-border/55 pl-3">
            {childIds.map((childId) => (
              <FeatureObjectTreeNode
                key={childId}
                objectId={childId}
                objectById={objectById}
                activeObjectId={activeObjectId}
                activeGeometryIndex={activeGeometryIndex}
                errorCountsByObjectId={errorCountsByObjectId}
                expandedIds={expandedIds}
                onSelectObject={onSelectObject}
                depth={depth + 1}
                visited={nextVisited}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
})

function ViewportGeometryModeBar({
  geometryDisplayMode,
  availableLods,
  onSelectGeometryDisplayMode,
}: {
  geometryDisplayMode: ViewerGeometryDisplayMode
  availableLods: string[]
  onSelectGeometryDisplayMode: (mode: ViewerGeometryDisplayMode) => void
}) {
  const modeKey = getGeometryDisplayModeKey(geometryDisplayMode)
  const modes: Array<{ key: string; label: string; mode: ViewerGeometryDisplayMode }> = [
    { key: 'best', label: 'Best', mode: { kind: 'best' } },
    ...availableLods.map((lod) => ({
      key: `lod:${lod}`,
      label: lod,
      mode: { kind: 'lod', lod } satisfies ViewerGeometryDisplayMode,
    })),
  ]

  return (
    <div className="floating-panel pointer-events-auto flex flex-col items-stretch gap-1.5 rounded-sm border px-2 py-2">
      <div className="flex items-center justify-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">LoD</span>
      </div>
      <div className="flex flex-col items-stretch gap-1">
        {modes.map((entry) => {
          const isActive = entry.key === modeKey

          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelectGeometryDisplayMode(entry.mode)}
              className={cn(
                'rounded-sm px-2 py-1 text-[11px] text-left transition',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:bg-foreground/6 hover:text-foreground',
              )}
              title={entry.label}
            >
              {entry.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const FeatureListRow = memo(function FeatureListRow({
  item,
  selected,
  activeObjectId,
  activeGeometryIndex,
  onCenterFeature,
  onSelectFeature,
  onHeightChange,
}: {
  item: FeatureListItem
  selected: boolean
  activeObjectId: string | null
  activeGeometryIndex: number | null
  onCenterFeature: (featureId: string) => void
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  onHeightChange: (height: number) => void
}) {
  const { feature, objectTypes, errorCodeSummary, errorCount, isInvalid } = item
  const rowRef = useRef<HTMLDivElement | null>(null)
  const errorCountsByObjectId = useMemo(() => {
    const counts = new Map<string, number>()

    for (const error of feature.errors) {
      if (!error.cityObjectId) {
        continue
      }

      counts.set(error.cityObjectId, (counts.get(error.cityObjectId) ?? 0) + 1)
    }

    return counts
  }, [feature.errors])

  useEffect(() => {
    if (!selected) {
      return
    }

    const element = rowRef.current
    if (!element) {
      return
    }

    const reportHeight = () => {
      onHeightChange(Math.max(Math.ceil(element.getBoundingClientRect().height), FEATURE_LIST_ROW_HEIGHT))
    }

    reportHeight()
    const resizeObserver = new ResizeObserver(reportHeight)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [onHeightChange, selected])

  return (
    <Collapsible open={selected}>
      <div
        ref={rowRef}
        aria-pressed={selected}
        style={{ minHeight: FEATURE_LIST_ROW_HEIGHT }}
        onClick={() => {
          if (!selected) {
            onSelectFeature(feature.id)
          }
        }}
        className={cn(
          'w-full min-w-0 overflow-hidden rounded-sm border px-2.5 pt-2 transition focus-within:ring-2 focus-within:ring-accent/30',
          !selected && 'cursor-pointer',
          selected ? 'pb-2' : 'pb-1.5',
          selected
            ? 'border-accent/40 bg-accent/10 text-foreground shadow-[0_0_0_1px] shadow-accent/25'
            : isInvalid
              ? 'border-destructive/20 bg-destructive/8 text-foreground/88 hover:border-destructive/28 hover:bg-destructive/12'
              : 'border-foreground/8 bg-foreground/3 text-foreground/78 hover:border-foreground/16 hover:bg-foreground/6',
        )}
      >
        <div className="flex items-start gap-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onClick={() => onSelectFeature(feature.id)}
              className={cn('min-w-0 flex-1 text-left focus-visible:outline-none', !selected && 'cursor-pointer')}
            >
              <div className="min-w-0 flex-1 overflow-hidden text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium leading-5">{feature.label}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {objectTypes.length > 0 ? (
                      objectTypes.map((objectType) => (
                        <Badge
                          key={objectType}
                          variant="outline"
                          className={cn(
                            'px-1.5 py-0 text-[10px]',
                            selected
                              ? 'border-accent/30 bg-accent/10 text-accent'
                              : isInvalid
                                ? 'border-destructive/30 bg-destructive/12 text-destructive'
                                : 'border-foreground/10 bg-foreground/5 text-foreground/60',
                          )}
                        >
                          {objectType}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No object types</span>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>{feature.objects.length} obj</span>
                  <span>{feature.vertices.length} vtx</span>
                  {errorCount > 0 ? (
                    <span className="text-destructive">
                      {errorCount} err ({errorCodeSummary})
                    </span>
                  ) : (
                    <span>0 err</span>
                  )}
                </div>
              </div>
            </button>
          </CollapsibleTrigger>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-7 w-7 shrink-0 self-start"
            aria-label={`Center ${feature.label}`}
            title={`Center ${feature.label}`}
            onClick={(event) => {
              event.stopPropagation()
              onCenterFeature(feature.id)
            }}
          >
            <Crosshair className="size-3.5" />
          </Button>
        </div>

        <CollapsibleContent className="overflow-hidden">
          <div className="mt-2 border-t border-border/55 pt-2">
            <FeatureObjectTree
              objects={feature.objects}
              activeObjectId={activeObjectId}
              activeGeometryIndex={activeGeometryIndex}
              errorCountsByObjectId={errorCountsByObjectId}
              onSelectObject={(objectId) => onSelectFeature(feature.id, objectId)}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
})

const FeatureListPanel = memo(function FeatureListPanel({
  filteredFeatureItems,
  isLoading,
  annotationSourceName,
  datasetFeatureCount,
  showDesktopHeading,
  searchQuery,
  selectedFeatureId,
  showOnlyInvalidFeatures,
  onSearchQueryChange,
  onShowOnlyInvalidFeaturesChange,
  onCenterFeature,
  onSelectFeature,
  activeObjectId,
  activeGeometryIndex,
}: {
  filteredFeatureItems: FeatureListItem[]
  isLoading: boolean
  annotationSourceName: string | null
  datasetFeatureCount: number
  showDesktopHeading: boolean
  searchQuery: string
  selectedFeatureId: string | null
  showOnlyInvalidFeatures: boolean
  onSearchQueryChange: (event: ChangeEvent<HTMLInputElement>) => void
  onShowOnlyInvalidFeaturesChange: (checked: boolean) => void
  onCenterFeature: (featureId: string) => void
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  activeObjectId: string | null
  activeGeometryIndex: number | null
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [measuredSelectedRow, setMeasuredSelectedRow] = useState<{
    featureId: string | null
    height: number
  }>({
    featureId: null,
    height: FEATURE_LIST_ROW_HEIGHT,
  })

  const selectedIndex = useMemo(
    () => filteredFeatureItems.findIndex((item) => item.feature.id === selectedFeatureId),
    [filteredFeatureItems, selectedFeatureId],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const updateMetrics = () => {
      setScrollTop(viewport.scrollTop)
      setViewportHeight(viewport.clientHeight)
    }

    updateMetrics()
    viewport.addEventListener('scroll', updateMetrics, { passive: true })

    const resizeObserver = new ResizeObserver(updateMetrics)
    resizeObserver.observe(viewport)

    return () => {
      viewport.removeEventListener('scroll', updateMetrics)
      resizeObserver.disconnect()
    }
  }, [])

  const selectedRowHeight =
    measuredSelectedRow.featureId === selectedFeatureId
      ? measuredSelectedRow.height
      : FEATURE_LIST_ROW_HEIGHT
  const handleSelectedRowHeightChange = useCallback((featureId: string, height: number) => {
    setMeasuredSelectedRow((current) => {
      if (current.featureId === featureId && current.height === height) {
        return current
      }

      return { featureId, height }
    })
  }, [])

  const scrollSelectedFeatureIntoView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || selectedIndex < 0) {
      return
    }

    const rowStride = FEATURE_LIST_ROW_HEIGHT + FEATURE_LIST_ROW_GAP
    const rowStart = FEATURE_LIST_TOP_PADDING + selectedIndex * rowStride
    const rowEnd = rowStart + selectedRowHeight
    const viewportStart = viewport.scrollTop
    const viewportEnd = viewportStart + viewport.clientHeight

    if (rowStart >= viewportStart && rowEnd <= viewportEnd) {
      return
    }

    const nextTop =
      rowStart < viewportStart
        ? Math.max(rowStart - FEATURE_LIST_ROW_GAP, 0)
        : rowEnd - viewport.clientHeight + FEATURE_LIST_ROW_GAP

    viewport.scrollTo({
      top: Math.max(nextTop, 0),
      behavior: 'auto',
    })
  }, [selectedIndex, selectedRowHeight])

  useEffect(() => {
    if (selectedIndex < 0) {
      return
    }

    scrollSelectedFeatureIntoView()
  }, [scrollSelectedFeatureIntoView, selectedIndex])

  const rowStride = FEATURE_LIST_ROW_HEIGHT + FEATURE_LIST_ROW_GAP
  const selectedRowDelta = selectedIndex >= 0 ? Math.max(selectedRowHeight - FEATURE_LIST_ROW_HEIGHT, 0) : 0
  const selectedRowTop = selectedIndex >= 0 ? FEATURE_LIST_TOP_PADDING + selectedIndex * rowStride : null
  const normalizeOffset = (offset: number) => {
    const adjustedOffset =
      selectedRowTop != null && offset > selectedRowTop + selectedRowHeight + FEATURE_LIST_ROW_GAP
        ? offset - selectedRowDelta
        : offset

    return Math.max(adjustedOffset - FEATURE_LIST_TOP_PADDING, 0)
  }
  const contentHeight =
    FEATURE_LIST_TOP_PADDING +
    Math.max(filteredFeatureItems.length * rowStride - FEATURE_LIST_ROW_GAP, 0) +
    FEATURE_LIST_BOTTOM_PADDING +
    selectedRowDelta
  const startIndex = Math.max(Math.floor(normalizeOffset(scrollTop) / rowStride) - FEATURE_LIST_OVERSCAN, 0)
  const endIndex = Math.min(
    filteredFeatureItems.length,
    Math.ceil((normalizeOffset(scrollTop + viewportHeight + selectedRowDelta) + selectedRowDelta) / rowStride) +
      FEATURE_LIST_OVERSCAN,
  )

  return (
    <>
      <div className="panel-header-surface space-y-2.5 border-b p-4 pb-3">
        {showDesktopHeading && (
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <Layers className="size-4 text-muted-foreground" />
              Features ({datasetFeatureCount})
            </h1>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={onSearchQueryChange}
              placeholder="Search features"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {annotationSourceName && (
          <div className="flex items-center justify-between rounded-sm bg-foreground/4 px-3 py-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Show errors only</p>
              <p className="text-xs text-foreground/60">
                Showing {filteredFeatureItems.length} of {datasetFeatureCount}
              </p>
            </div>
            <Switch
              checked={showOnlyInvalidFeatures}
              onCheckedChange={onShowOnlyInvalidFeaturesChange}
              className="shrink-0"
              aria-label="Show only features with validation errors"
            />
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        {filteredFeatureItems.length > 0 ? (
          <div className="relative" style={{ height: `${contentHeight}px` }}>
            {filteredFeatureItems.slice(startIndex, endIndex).map((item, visibleIndex) => {
              const itemIndex = startIndex + visibleIndex
              const top =
                FEATURE_LIST_TOP_PADDING +
                itemIndex * rowStride +
                (selectedIndex >= 0 && itemIndex > selectedIndex ? selectedRowDelta : 0)
              const isSelected = item.feature.id === selectedFeatureId

              return (
                <div
                  key={item.feature.id}
                  className="absolute left-3 right-3"
                  style={
                    isSelected
                      ? { top: `${top}px` }
                      : { top: `${top}px`, height: `${FEATURE_LIST_ROW_HEIGHT}px` }
                  }
                >
                  <FeatureListRow
                    item={item}
                    selected={isSelected}
                    activeObjectId={isSelected ? activeObjectId : null}
                    activeGeometryIndex={isSelected ? activeGeometryIndex : null}
                    onCenterFeature={onCenterFeature}
                    onSelectFeature={onSelectFeature}
                    onHeightChange={(height) => handleSelectedRowHeightChange(item.feature.id, height)}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          !isLoading && (
            <div className="p-3 pt-2">
              <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                No features matched the current filter.
              </div>
            </div>
          )
        )}
      </ScrollArea>
    </>
  )
})

function ToolbarToggleButton({
  active,
  disabled = false,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  ariaLabel: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        'h-7 gap-1.5 rounded-sm border px-2 text-[11px] font-medium',
        active
          ? 'border-primary/35 bg-primary/14 text-primary hover:bg-primary/18 hover:text-primary'
          : 'border-border/70 bg-background/35 text-muted-foreground hover:bg-accent/8 hover:text-foreground',
        disabled && 'border-border/45 bg-transparent text-muted-foreground/45 hover:bg-transparent hover:text-muted-foreground/45',
      )}
    >
      <span className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/45')} />
      <span>{children}</span>
    </Button>
  )
}

const DetailAttributePanel = memo(function DetailAttributePanel({
  objectAttributes,
}: {
  objectAttributes: Record<string, unknown>
}) {
  const hasObjectAttributes = Object.keys(objectAttributes).length > 0

  if (!hasObjectAttributes) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
        No attributes available for the selected object.
      </div>
    )
  }

  return (
    <AttributeSection
      attributes={objectAttributes}
      emptyText="No attributes on the active object."
    />
  )
})

const DetailGeometryPanel = memo(function DetailGeometryPanel({
  geometries,
  activeGeometryIndex,
}: {
  geometries: ViewerObjectGeometry[]
  activeGeometryIndex: number | null
}) {
  if (geometries.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
        No geometries available for the selected object.
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {geometries.map((geometry) => {
        const hasSemantics = geometry.semanticSurfaces.some((surface) => surface != null)
        const isActive = geometry.index === activeGeometryIndex

        return (
          <div
            key={geometry.index}
            className={cn(
              'rounded-sm border px-3 py-2',
              isActive
                ? 'border-primary/35 bg-primary/8'
                : 'border-foreground/8 bg-foreground/3',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground/90">
                  {geometry.geometryType ?? `Geometry ${geometry.index}`}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{geometry.lod ?? 'No LoD'}</span>
                  <span>{geometry.vertexIndices.length} vtx</span>
                  <span>{hasSemantics ? 'Semantics' : 'No semantics'}</span>
                </div>
              </div>
              <Badge variant="outline" className={cn('shrink-0 text-[10px]', isActive && 'border-primary/35 text-primary')}>
                geom {geometry.index}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
})

function AttributeSection({
  attributes,
  emptyText,
}: {
  attributes: Record<string, unknown>
  emptyText: string
}) {
  const entries = Object.entries(attributes)

  return (
    <section>
      {entries.length > 0 ? (
        <AttributeList attributes={attributes} />
      ) : (
        <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-3 py-4 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </section>
  )
}

const AttributeList = memo(function AttributeList({ attributes }: { attributes: Record<string, unknown> }) {
  return (
    <dl className="m-0 min-w-0 space-y-2">
      {Object.entries(attributes).map(([key, value]) => (
        <div
          key={key}
          className="min-w-0 w-full overflow-hidden rounded-sm border border-foreground/8 bg-foreground/3 px-2.5 py-1.5"
        >
          <dt className="m-0 min-w-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            {key}
          </dt>
          <dd className="m-0 mt-1 min-w-0 max-w-full">
            <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
              <div className="w-fit min-w-full pr-2 whitespace-nowrap text-[13px] leading-5 text-foreground/80">
                {formatValue(value)}
              </div>
            </div>
          </dd>
        </div>
      ))}
    </dl>
  )
})

function formatValue(value: unknown) {
  if (value == null) {
    return '—'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3)
  }

  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function semanticSurfaceColor(surfaceType: string) {
  const paletteByType: Record<string, string> = {
    groundsurface: '#65a30d',
    wallsurface: '#94a3b8',
    roofsurface: '#ef4444',
    closuresurface: '#a855f7',
    outerceilingsurface: '#ec4899',
    outerfloorsurface: '#14b8a6',
    interiorwallsurface: '#60a5fa',
    interiorceilingsurface: '#f472b6',
    interiorfloorsurface: '#10b981',
  }

  const key = surfaceType.trim().toLowerCase()
  const matched = paletteByType[key]
  if (matched) {
    return matched
  }

  const fallbackPalette = ['#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899']
  const hash = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return fallbackPalette[hash % fallbackPalette.length]
}

function getVal3dityErrorUrl(error: ViewerValidationError) {
  const anchor = error.description
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return anchor ? `${VAL3DITY_ERRORS_URL}#${anchor}` : VAL3DITY_ERRORS_URL
}

export default App

function cloneVertices(vertices: Vec3[]) {
  return vertices.map((vertex) => [...vertex] as Vec3)
}

function getFaceVertexCycle(rings: number[][] | null, ringIndex: number) {
  const targetRing = rings?.[ringIndex] ?? []
  return [...targetRing]
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}
