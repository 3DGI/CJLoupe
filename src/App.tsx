import {
  Box,
  Layers,
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
  LocateFixed,
  Maximize2,
  Minimize2,
  Moon,
  Move3D,
  Search,
  SquareMousePointer,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { Suspense, lazy, memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { errorColor } from '@/lib/error-palette'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/components/use-theme'
import {
  loadCityJsonSequenceFromFile,
  loadCityJsonSequenceFromUrl,
  loadValidationReportFromFile,
  loadValidationReportFromUrl,
  mergeValidationAnnotations,
} from '@/lib/cityjson'
import { cn } from '@/lib/utils'
import type {
  Vec3,
  ViewerDataset,
  ViewerFeature,
  ViewerFocusTarget,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/rf-val3dity.city.jsonl`
const SAMPLE_REPORT_URL = `${import.meta.env.BASE_URL}samples/val-report.json`
const VAL3DITY_ERRORS_URL = 'https://val3dity.readthedocs.io/2.6.0/errors/'
const GITHUB_REPO_URL = 'https://github.com/3DGI/CJLoupe'
const DEFAULT_CAMERA_FOCAL_LENGTH = 50

type DetailPaneMode = 'split' | 'collapsed' | 'fullscreen'
type MobileInspectMode = 'object' | 'surface'
type MobilePanelView = 'features' | 'details'

const CityViewport = lazy(() =>
  import('@/components/viewer/city-viewport').then((module) => ({ default: module.CityViewport })),
)

type FeatureListItem = {
  feature: ViewerFeature
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
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null)
  const [selectedFaceRingIndex, setSelectedFaceRingIndex] = useState(0)
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null)
  const [geometryRevision, setGeometryRevision] = useState(0)
  const [viewportResetRevision, setViewportResetRevision] = useState(0)
  const [focusRevision, setFocusRevision] = useState(0)
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget>(null)
  const [annotationSourceName, setAnnotationSourceName] = useState<string | null>(null)
  const [cameraFocalLength, setCameraFocalLength] = useState(50)
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
  const selectedFeatureErrorCount = selectedFeature?.errors.length ?? 0
  const selectedFeatureAttributeCount = selectedFeature ? Object.keys(selectedFeature.attributes).length : 0
  const activeObject =
    selectedFeature?.objects.find((object) => object.id === activeObjectId) ??
    selectedFeature?.objects[0] ??
    null
  const selectedVertex =
    selectedFeature && selectedVertexIndex != null
      ? selectedFeature.vertices[selectedVertexIndex] ?? null
      : null
  const selectedFace =
    activeObject && selectedFaceIndex != null
      ? activeObject.polygons[selectedFaceIndex] ?? null
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
      if (!activeObjectId || selectedFeature.objects.length <= 1) {
        return true
      }

      return !error.cityObjectId || error.cityObjectId === activeObjectId
    })
  }, [activeObjectId, selectedFeature])
  const visibleDetailErrorCount = visibleDetailErrors.length
  const showErrorTabs = visibleDetailErrorCount > 0

  const featureListItems = useMemo<FeatureListItem[]>(() => {
    if (!dataset) {
      return []
    }

    return dataset.features.map((feature) => ({
      feature,
      errorCodeSummary: [...new Set(feature.errors.map((error) => error.code))].join(', '),
      errorCount: feature.errors.length,
      isInvalid: feature.validity === false,
      searchText: [
        feature.id,
        feature.label,
        feature.type,
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
    if (!showSemanticSurfaces || editMode || !dataset) {
      setSelectedSemanticSurface(null)
      if (!editMode) {
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedVertexIndex(null)
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
      const surface = object?.semanticSurfaces[current.faceIndex] ?? null
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
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
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
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null) => {
    setSelectedFaceIndex(surface?.faceIndex ?? null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
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
        faceIndex: editMode ? selectedFaceIndex : null,
        location: null,
        preserveCameraOffset: editMode,
      })
      setFocusRevision((current) => current + 1)
      return
    }

    centerFeatureById(selectedFeature.id)
  }, [activeObjectId, centerFeatureById, editMode, selectedFaceIndex, selectedFeature, selectedVertexIndex])

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

    setSelectedFaceIndex(error.faceIndex)
    setSelectedFaceRingIndex(0)
    setActiveObjectId(inferredObjectId)
    setSelectedVertexIndex(null)
    setFocusTarget({
      kind: 'error',
      featureId: selectedFeature.id,
      objectId: inferredObjectId,
      faceIndex: error.faceIndex,
      location: error.location,
      preserveCameraOffset: editMode,
    })
    setFocusRevision((current) => current + 1)
  }

  const toggleEditMode = useCallback(() => {
    if (isMobileLayout) {
      return
    }

    setEditMode((current) => {
      const next = !current
      if (next) {
        setIsolateSelectedFeature(true)
      } else {
        setIsolateSelectedFeature(false)
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedVertexIndex(null)
      }
      if (next) {
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
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
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
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
  }, [])

  const handleSelectVertex = useCallback((vertexIndex: number | null) => {
    setSelectedVertexIndex(vertexIndex)

    if (selectedFace && vertexIndex != null) {
      const ringIndex = selectedFace.findIndex((ring) => ring.includes(vertexIndex))
      if (ringIndex >= 0) {
        setSelectedFaceRingIndex(ringIndex)
      }
    }

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

  const cycleSelectedFaceVertex = useCallback((direction: -1 | 1) => {
    if (selectedFaceVertexIndices.length === 0) {
      return
    }

    const currentIndex = selectedVertexIndex != null
      ? selectedFaceVertexIndices.indexOf(selectedVertexIndex)
      : -1

    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : selectedFaceVertexIndices.length - 1
        : (currentIndex + direction + selectedFaceVertexIndices.length) % selectedFaceVertexIndices.length

    handleSelectVertex(selectedFaceVertexIndices[nextIndex] ?? null)
  }, [handleSelectVertex, selectedFaceVertexIndices, selectedVertexIndex])

  const cycleSelectedFaceRing = useCallback(() => {
    if (selectedFaceRingCount <= 1) {
      return
    }

    setSelectedFaceRingIndex((current) => (current + 1) % selectedFaceRingCount)
    setSelectedVertexIndex(null)
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
  }, [applyFeatureVertices, centerCurrentSelection, cycleSelectedFaceRing, cycleSelectedFaceVertex, dataset, editMode, selectedFeatureId, toggleEditMode])

  const helpStatusText = isLoading ? 'Loading CityJSON feature sequence…' : null
  const isErrorDialogVisible = Boolean(error && dismissedErrorMessage !== error)
  const helpItems = isMobileLayout
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

          {(isMobileLayout ? !isPaneCollapsed : true) && (
            <div
              aria-hidden={!isMobileLayout && isPaneCollapsed}
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col',
                !isMobileLayout && isPaneCollapsed && 'pointer-events-none w-0 min-w-0 shrink overflow-hidden opacity-0',
              )}
            >
              {isMobileLayout && (
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <div className="floating-chip flex items-center gap-1 rounded-sm border p-1">
                    <Button
                      type="button"
                      variant={mobilePanelView === 'features' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={() => setMobilePanelView('features')}
                    >
                      Features
                    </Button>
                    <Button
                      type="button"
                      variant={mobilePanelView === 'details' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={() => setMobilePanelView('details')}
                      disabled={!selectedFeature}
                    >
                      Details
                    </Button>
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

              {(isMobileLayout ? mobilePanelView === 'features' : true) && (
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
                  <div className="space-y-3 p-4 pb-3">
                  {!isMobileLayout && (
                    <>
                      <div>
                        <div>
                          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                            <Layers className="size-4 text-muted-foreground" />
                            Features ({dataset?.features.length ?? 0})
                          </h1>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={handleSearchQueryChange}
                      placeholder="Search features"
                      className="h-9 pl-8"
                    />
                  </div>

                  {annotationSourceName && (
                    <div className="flex items-center justify-between rounded-sm border border-border bg-foreground/4 px-3 py-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Show errors only</p>
                        <p className="text-xs text-foreground/60">
                          Showing {filteredFeatureItems.length} of {dataset?.features.length ?? 0}
                        </p>
                      </div>
                      <Switch
                        checked={showOnlyInvalidFeatures}
                        onCheckedChange={handleShowOnlyInvalidFeaturesChange}
                        className="shrink-0"
                        aria-label="Show only features with validation errors"
                      />
                    </div>
                  )}
                  </div>

                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-1.5 p-3 pt-0">
                      {filteredFeatureItems.map((item) => (
                        <FeatureListRow
                          key={item.feature.id}
                          item={item}
                          selected={item.feature.id === selectedFeatureId}
                          onCenterFeature={handleCenterFeature}
                          onSelectFeature={handleSelectFeature}
                        />
                      ))}

                      {!isLoading && filteredFeatureItems.length === 0 && (
                        <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                          No features matched the current filter.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </section>
              )}

              {(!isMobileLayout || mobilePanelView === 'details') && (
              <Tabs value={detailTab} onValueChange={setDetailTab} asChild>
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
                  <div className="space-y-3 p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center text-muted-foreground">
                            <Box className="size-3.5" />
                          </span>
                          <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {selectedFeature?.label ?? 'No feature selected'}
                          </p>
                          {selectedFeature && (
                            <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 text-primary">
                              {selectedFeature.type}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{selectedFeatureObjectCount} objects</span>
                          <span>{selectedFeatureObjectCount > 1 ? visibleDetailErrorCount : selectedFeatureErrorCount} errors</span>
                          <span>{selectedFeatureAttributeCount} attributes</span>
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

                    {detailPaneMode !== 'collapsed' && selectedFeature && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedFeature.objects.map((object) => (
                            <button
                              key={object.id}
                              type="button"
                              onClick={() => {
                                setActiveObjectId(object.id)
                                setSelectedFaceIndex(null)
                                setSelectedFaceRingIndex(0)
                                setSelectedVertexIndex(null)
                              }}
                              className={cn(
                                'flex items-center gap-1.5 rounded-sm border px-2 py-1 text-left text-xs transition',
                                object.id === activeObjectId
                                  ? 'border-primary/40 bg-primary/10 text-foreground'
                                  : 'border-foreground/8 bg-foreground/3 text-foreground/70 hover:border-foreground/16 hover:bg-foreground/6',
                              )}
                            >
                              <span className="truncate font-medium">{object.id}</span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">{object.type}</span>
                            </button>
                          ))}
                        </div>

                      </>
                    )}
                  </div>

                  {detailPaneMode !== 'collapsed' && (
                    <ScrollArea className="min-h-0 min-w-0 flex-1">
                      <div className="min-w-0 space-y-4 p-4 pt-0">
                        {selectedFeature ? (
                          <>
                            {showErrorTabs ? (
                              <>
                                <div className="flex items-center gap-3">
                                  <TabsList className="floating-chip shrink-0 rounded-sm border p-1">
                                    <TabsTrigger
                                      value="errors"
                                      className="h-8 border-transparent bg-transparent px-2.5 text-foreground/72 hover:border-transparent hover:bg-accent/8 data-[state=active]:border-transparent data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground"
                                    >
                                      Errors{visibleDetailErrorCount > 0 ? ` (${visibleDetailErrorCount})` : ''}
                                    </TabsTrigger>
                                    <TabsTrigger
                                      value="attributes"
                                      className="h-8 border-transparent bg-transparent px-2.5 text-foreground/72 hover:border-transparent hover:bg-accent/8 data-[state=active]:border-transparent data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground"
                                    >
                                      Attributes ({selectedFeatureAttributeCount})
                                    </TabsTrigger>
                                  </TabsList>
                                  <div className="detail-rule h-px flex-1" />
                                </div>

                                <TabsContent value="errors">
                                  <div className="space-y-3">
                                    {visibleDetailErrorCount > 0 ? (
                                      <div className="grid gap-2">
                                        {visibleDetailErrors.map((error) => {
                                          const color = errorColor(error.code)
                                          return (
                                            <div
                                              key={`${error.id}-${error.code}`}
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

                                <TabsContent value="attributes">
                                  <AttributeList attributes={selectedFeature.attributes} />
                                </TabsContent>
                              </>
                            ) : (
                              <DetailSection title="Attributes">
                                <AttributeList attributes={selectedFeature.attributes} />
                              </DetailSection>
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

        {editMode && activeObject && (
          <div className={cn(
            'pointer-events-none absolute z-10',
            isMobileLayout ? 'bottom-20 left-3 right-3' : 'bottom-20 left-4 max-w-md',
          )}>
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
                {selectedFaceVertexIndices.length > 0 && (
                  <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
                    {selectedFaceVertexIndices.length} vertices
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={cycleSelectedFaceRing}
                  disabled={selectedFaceHoleCount === 0}
                >
                  Next ring (R)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() => cycleSelectedFaceVertex(-1)}
                  disabled={selectedFaceVertexIndices.length === 0}
                >
                  Prev vertex (J)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() => cycleSelectedFaceVertex(1)}
                  disabled={selectedFaceVertexIndices.length === 0}
                >
                  Next vertex (K)
                </Button>
              </div>
              </div>
            </div>
          </div>
        )}

        {!editMode && showSemanticSurfaces && selectedSemanticSurface?.surface && (
          <div className={cn(
            'pointer-events-none absolute z-10',
            isMobileLayout ? 'bottom-20 left-3 right-3' : 'bottom-20 left-4 max-w-md',
          )}>
            <div className="floating-panel pointer-events-auto space-y-3 rounded-sm border p-3">
              {(() => {
                const surfaceColor = semanticSurfaceColor(selectedSemanticSurface.surface.type)
                return (
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
                  {selectedSemanticSurface.surface.type}
                </Badge>
                <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
                  {selectedSemanticSurface.objectId}
                </Badge>
                <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
                  face {selectedSemanticSurface.faceIndex}
                </Badge>
              </div>
                )
              })()}

              {Object.keys(selectedSemanticSurface.surface.attributes).length > 0 ? (
                <dl className="m-0 space-y-2">
                  {Object.entries(selectedSemanticSurface.surface.attributes).map(([key, value]) => (
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
        )}

        <div
          className={cn(
            'pointer-events-none absolute z-10',
            isMobileLayout ? 'left-3 right-3 top-4' : 'bottom-4 left-4 right-4',
          )}
        >
          {isMobileLayout ? (
            <div className="floating-panel pointer-events-auto flex items-center gap-2 rounded-sm border px-2 py-2">
              {selectedFeature && (
                <Button
                  variant={showSemanticSurfaces ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() => setShowSemanticSurfaces((current) => !current)}
                >
                  Sem
                </Button>
              )}
              {selectedFeature && showSemanticSurfaces && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() =>
                    setMobileInspectMode((current) => (current === 'object' ? 'surface' : 'object'))
                  }
                >
                  {mobileInspectMode === 'surface' ? 'Surface' : 'Object'}
                </Button>
              )}
              {selectedFeature && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 gap-1.5 px-2.5"
                  onClick={centerCurrentSelection}
                >
                  <LocateFixed className="size-3.5" />
                  Center
                </Button>
              )}
            </div>
          ) : (
            <div className="floating-panel pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-sm border px-2.5 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {isPaneCollapsed && (
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                    <SquareMousePointer className="mr-1 size-3.5" />
                    {activeObject?.id ?? 'No object'}
                  </Badge>
                )}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <div className="floating-chip flex items-center gap-1 rounded-sm border p-1">
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={toggleEditMode}>
                    <Move3D className="size-3.5" />
                    {editMode ? 'Exit edit' : 'Edit'}
                  </Button>
                  <ToolbarToggleButton
                    active={!hideOccludedEditEdges}
                    disabled={!editMode || !activeObject}
                    onClick={() => setHideOccludedEditEdges((current) => !current)}
                    ariaLabel="Toggle xray view for edit mode"
                  >
                    Xray
                  </ToolbarToggleButton>
                </div>
                {selectedFeature && (
                  <>
                    <ToolbarToggleButton
                      active={showSemanticSurfaces}
                      onClick={() => setShowSemanticSurfaces((current) => !current)}
                      ariaLabel="Toggle semantic surface colors"
                    >
                      Semantics
                    </ToolbarToggleButton>
                    <ToolbarToggleButton
                      active={isolateSelectedFeature}
                      onClick={() => setIsolateSelectedFeature((current) => !current)}
                      ariaLabel="Toggle isolate selected feature"
                    >
                      Isolate
                    </ToolbarToggleButton>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={centerCurrentSelection}
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
                    onChange={(event) => setCameraFocalLength(Number(event.target.value))}
                    className="slider-accent h-2 w-24 cursor-pointer appearance-none rounded-none bg-input"
                    aria-label="Camera focal length"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {!isMobileLayout && (
        <div
          className="pointer-events-none absolute right-4 top-4 z-10 max-w-md"
        >
          <div
            className={cn(
              'floating-panel pointer-events-auto flex items-start gap-3 rounded-sm border text-sm',
              isHelpCollapsed ? 'px-2 py-2' : 'max-w-sm px-3 py-3',
            )}
          >
            {!isHelpCollapsed && (
              <div id="viewport-help-panel" className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {isMobileLayout ? 'Mobile' : 'Hotkeys'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isMobileLayout ? 'Touch inspection' : (editMode ? 'Edit mode controls' : 'Navigation and selection')}
                  </p>
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

                {helpStatusText && (
                  <p className="border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
                    {helpStatusText}
                  </p>
                )}
              </div>
            )}

            <div className="ml-auto flex shrink-0 items-start gap-1">
              <Button
                type="button"
                variant="ghost"
                className="h-8 shrink-0 gap-1 px-2"
                onClick={() => setIsHelpCollapsed((current) => !current)}
                aria-label={isHelpCollapsed ? 'Expand hotkey panel' : 'Collapse hotkey panel'}
                aria-expanded={!isHelpCollapsed}
                aria-controls="viewport-help-panel"
              >
                <CircleHelp className="size-4" />
                {isHelpCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
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

const FeatureListRow = memo(function FeatureListRow({
  item,
  selected,
  onCenterFeature,
  onSelectFeature,
}: {
  item: FeatureListItem
  selected: boolean
  onCenterFeature: (featureId: string) => void
  onSelectFeature: (featureId: string, objectId?: string | null) => void
}) {
  const { feature, errorCodeSummary, errorCount, isInvalid } = item

  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-sm border px-2.5 py-2 transition',
        selected
          ? 'border-accent/40 bg-accent/10 text-foreground shadow-[0_0_0_1px] shadow-accent/25'
          : isInvalid
            ? 'border-destructive/20 bg-destructive/8 text-foreground/88 hover:border-destructive/28 hover:bg-destructive/12'
            : 'border-foreground/8 bg-foreground/3 text-foreground/78 hover:border-foreground/16 hover:bg-foreground/6',
      )}
    >
      <button
        type="button"
        onClick={() => onSelectFeature(feature.id)}
        className="min-w-0 flex-1 overflow-hidden text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium">{feature.label}</p>
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 px-1.5 py-0 text-[10px]',
                  selected
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : isInvalid
                      ? 'border-destructive/30 bg-destructive/12 text-destructive'
                      : 'border-foreground/10 bg-foreground/5 text-foreground/60',
                )}
              >
                {feature.type}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{feature.objects.length} obj</span>
          <span>{feature.vertices.length} vtx</span>
          {errorCount > 0 && (
            <span className="text-destructive">
              {errorCount} err ({errorCodeSummary})
            </span>
          )}
        </div>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 self-center"
        aria-label={`Center ${feature.label}`}
        title={`Center ${feature.label}`}
        onClick={() => onCenterFeature(feature.id)}
      >
        <Crosshair className="size-4" />
      </Button>
    </div>
  )
})

const DetailSection = memo(function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <div className="detail-rule h-px flex-1" />
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      </div>
      {children}
    </section>
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
  const seen = new Set<number>()
  const vertexIndices: number[] = []

  for (const vertexIndex of targetRing) {
    if (seen.has(vertexIndex)) {
      continue
    }

    seen.add(vertexIndex)
    vertexIndices.push(vertexIndex)
  }

  return vertexIndices
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
