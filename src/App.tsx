import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Crosshair,
  FolderOpen,
  LocateFixed,
  Moon,
  Move3D,
  Search,
  SquareMousePointer,
  Sun,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { errorColor } from '@/lib/error-palette'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/components/use-theme'
import { CityViewport } from '@/components/viewer/city-viewport'
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
  ViewerFocusTarget,
  ViewerValidationError,
} from '@/types/cityjson'

const SAMPLE_URL = '/samples/rf-val3dity.city.jsonl'
const SAMPLE_REPORT_URL = '/samples/val-report.json'
const VAL3DITY_ERRORS_URL = 'https://val3dity.readthedocs.io/2.6.0/errors/'

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
  const [focusRevision, setFocusRevision] = useState(0)
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget>(null)
  const [annotationSourceName, setAnnotationSourceName] = useState<string | null>(null)
  const [cameraFocalLength, setCameraFocalLength] = useState(50)
  const [hideOccludedEditEdges, setHideOccludedEditEdges] = useState(true)
  const [showOnlyInvalidFeatures, setShowOnlyInvalidFeatures] = useState(false)
  const [isolateSelectedFeature, setIsolateSelectedFeature] = useState(false)
  const [detailTab, setDetailTab] = useState('errors')
  const [isDragging, setIsDragging] = useState(false)
  const [isHelpCollapsed, setIsHelpCollapsed] = useState(false)
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const dragCountRef = useRef(0)
  const { theme, toggleTheme } = useTheme()

  const featureMap = useMemo(() => {
    return new Map(dataset?.features.map((feature) => [feature.id, feature]) ?? [])
  }, [dataset])

  const selectedFeature = selectedFeatureId ? featureMap.get(selectedFeatureId) ?? null : null
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

  const filteredFeatures = useMemo(() => {
    if (!dataset) {
      return []
    }

    const query = searchQuery.trim().toLowerCase()

    return dataset.features.filter((feature) => {
      if (showOnlyInvalidFeatures && feature.errors.length === 0) {
        return false
      }

      if (!query) {
        return true
      }

      const haystack = [
        feature.id,
        feature.label,
        feature.type,
        ...Object.values(feature.attributes),
      ]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [dataset, searchQuery, showOnlyInvalidFeatures])

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
      setShowOnlyInvalidFeatures(mergedDataset.features.some((feature) => feature.errors.length > 0))
      setAnnotationSourceName('val-report.json')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load sample file.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFromSample()
  }, [loadFromSample])

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
      if (name.endsWith('.jsonl') || name.endsWith('.city.json') || name.endsWith('.city.jsonl')) {
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
      setShowOnlyInvalidFeatures(mergedDataset.features.some((feature) => feature.errors.length > 0))
      setAnnotationSourceName(reportFile.name)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load dropped files.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  function applyDataset(nextDataset: ViewerDataset) {
    originalVerticesRef.current = new Map(
      nextDataset.features.map((feature) => [feature.id, cloneVertices(feature.vertices)]),
    )
    setDataset(nextDataset)
    setShowOnlyInvalidFeatures(nextDataset.features.some((feature) => feature.errors.length > 0))

    const firstFeature = nextDataset.features[0] ?? null
    setSelectedFeatureId(firstFeature?.id ?? null)
    setActiveObjectId(firstFeature?.objects[0]?.id ?? null)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setEditMode(false)
  }

  function clearAnnotations() {
    setDataset((current) => (current ? mergeValidationAnnotations(current, new Map()) : current))
    setAnnotationSourceName(null)
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
  }, [])

  const handleSelectFeature = useCallback((featureId: string, objectId?: string | null) => {
    const feature = featureMap.get(featureId)
    if (!feature) {
      return
    }

    setSelectedFeatureId(featureId)
    setActiveObjectId(objectId ?? feature.objects[0]?.id ?? null)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
  }, [featureMap])

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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyFeatureVertices, centerCurrentSelection, cycleSelectedFaceRing, cycleSelectedFaceVertex, editMode, selectedFeatureId, toggleEditMode])

  const helpStatusText = error
    ? error
    : isLoading
      ? 'Loading CityJSON feature sequence…'
      : null
  const hotkeys = editMode
    ? [
        { keys: 'Tab', description: 'Exit edit mode' },
        { keys: 'C', description: 'Center selection' },
        { keys: 'Shift + Click', description: 'Select face' },
        { keys: 'Ctrl/Cmd + Click', description: 'Select vertex' },
        { keys: 'J / K', description: 'Step active ring' },
        { keys: 'R', description: 'Cycle rings' },
        { keys: 'X', description: 'Toggle xray' },
        { keys: 'U', description: 'Reset feature geometry' },
      ]
    : [
        { keys: 'Shift + Click', description: 'Select geometry' },
        { keys: 'Double Click', description: 'Recenter navigation' },
        { keys: 'Tab', description: 'Enter edit mode' },
        { keys: 'C', description: 'Center selection' },
      ]

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-background text-foreground"
      onDragEnter={(event) => { event.preventDefault(); dragCountRef.current++; setIsDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => { dragCountRef.current--; if (dragCountRef.current === 0) setIsDragging(false) }}
      onDrop={(event) => { dragCountRef.current = 0; handleDrop(event) }}
    >
      <aside
        className={cn(
          'panel-shell relative z-20 flex h-full shrink-0 border-r border-border transition-[width] duration-300',
          isPaneCollapsed ? 'w-16' : 'w-[min(29rem,34vw)]',
        )}
      >
        <div className="pointer-events-auto flex h-full w-full">
          <div className="flex h-full w-16 shrink-0 flex-col items-center justify-between border-r border-border bg-background/40 py-3">
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsPaneCollapsed((current) => !current)}
                aria-label={isPaneCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isPaneCollapsed ? <ChevronRight /> : <ChevronLeft />}
              </Button>
              <span
                className="pointer-events-none select-none font-black uppercase tracking-[0.34em] text-foreground/86 [writing-mode:vertical-rl]"
                style={{ textOrientation: 'mixed' }}
              >
                Loupe
              </span>
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
                  <div className="floating-panel absolute left-full top-0 z-30 ml-3 w-60 border p-1.5">
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-accent/8"
                      onClick={triggerCityJsonInput}
                    >
                      <span className="text-sm font-medium text-foreground">Upload new CityJSONL</span>
                      <span className="text-xs text-muted-foreground">Replace the current city model</span>
                    </button>
                    <button
                      type="button"
                      className="mt-1 flex w-full flex-col items-start gap-0.5 border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-accent/8"
                      onClick={triggerAnnotationInput}
                    >
                      <span className="text-sm font-medium text-foreground">Upload val3dity report</span>
                      <span className="text-xs text-muted-foreground">Attach a matching validation report</span>
                    </button>
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
            </div>

            <div className="flex flex-col items-center gap-2">
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                {dataset?.features.length ?? 0}
              </Badge>
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                {dataset?.features.filter((feature) => feature.errors.length > 0).length ?? 0}
              </Badge>
            </div>
          </div>

          {!isPaneCollapsed && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <section className="flex min-h-0 flex-[1.05] flex-col border-b border-border">
                <div className="space-y-3 p-4 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 rounded-sm border border-foreground/10 bg-foreground/5 px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            CityJSONL
                          </p>
                          <p className="mt-0.5 break-all text-xs leading-4.5 text-foreground/85">
                            {dataset?.sourceName ?? 'No file loaded'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={triggerCityJsonInput}
                          aria-label="Open CityJSONL file"
                          title="Open CityJSONL file"
                        >
                          <FolderOpen className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'min-w-0 rounded-sm border px-2.5 py-2',
                        annotationSourceName
                          ? 'border-destructive/30 bg-destructive/10'
                          : 'border-foreground/10 bg-foreground/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Val3dity Report
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 break-all text-xs leading-4.5',
                              annotationSourceName ? 'text-destructive' : 'text-foreground/55',
                            )}
                          >
                            {annotationSourceName ?? 'No report loaded'}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            onClick={triggerAnnotationInput}
                            aria-label="Open val3dity report"
                            title="Open val3dity report"
                            disabled={!dataset}
                          >
                            <FolderOpen className="size-3.5" />
                          </Button>
                          {annotationSourceName && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              onClick={clearAnnotations}
                              aria-label="Clear val3dity report"
                              title="Clear val3dity report"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div>
                      <h1 className="text-lg font-semibold tracking-tight text-foreground">Features</h1>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dataset?.features.length ?? 0} features loaded
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search features"
                      className="h-9 pl-8"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-sm border border-border bg-foreground/4 px-3 py-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Errors only</p>
                      <p className="text-xs text-foreground/60">
                        {filteredFeatures.length} of {dataset?.features.length ?? 0}
                      </p>
                    </div>
                    <Switch
                      checked={showOnlyInvalidFeatures}
                      onCheckedChange={setShowOnlyInvalidFeatures}
                      className="shrink-0"
                      aria-label="Show only features with validation errors"
                    />
                  </div>
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-1.5 p-3 pt-0">
                    {filteredFeatures.map((feature) => {
                      const isSelected = feature.id === selectedFeatureId
                      const errorCount = feature.errors.length
                      const isInvalid = feature.validity === false
                      return (
                        <div
                          key={feature.id}
                          className={cn(
                            'flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-sm border px-2.5 py-2 transition',
                            isSelected
                              ? 'border-accent/40 bg-accent/10 text-foreground shadow-[0_0_0_1px] shadow-accent/25'
                              : isInvalid
                                ? 'border-destructive/20 bg-destructive/8 text-foreground/88 hover:border-destructive/28 hover:bg-destructive/12'
                                : 'border-foreground/8 bg-foreground/3 text-foreground/78 hover:border-foreground/16 hover:bg-foreground/6',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectFeature(feature.id)}
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
                                      isSelected
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
                                  {errorCount} err ({[...new Set(feature.errors.map((e) => e.code))].join(', ')})
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
                            onClick={() => {
                              handleSelectFeature(feature.id)
                              centerFeatureById(feature.id)
                            }}
                          >
                            <Crosshair className="size-4" />
                          </Button>
                        </div>
                      )
                    })}

                    {!isLoading && filteredFeatures.length === 0 && (
                      <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                        No features matched the current filter.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </section>

              <Tabs value={detailTab} onValueChange={setDetailTab} asChild>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="space-y-3 p-4 pb-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {selectedFeature?.label ?? 'No feature selected'}
                      </p>
                      {selectedFeature && (
                        <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 text-primary">
                          {selectedFeature.type}
                        </Badge>
                      )}
                    </div>

                    {selectedFeature && (
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

                        <TabsList>
                          <TabsTrigger value="errors">
                            Errors{selectedFeature.errors.length > 0 ? ` (${selectedFeature.errors.length})` : ''}
                          </TabsTrigger>
                          <TabsTrigger value="attributes">
                            Attributes ({Object.keys(selectedFeature.attributes).length})
                          </TabsTrigger>
                        </TabsList>
                      </>
                    )}
                  </div>

                  <ScrollArea key={selectedFeatureId} className="min-h-0 min-w-0 flex-1">
                    <div className="min-w-0 space-y-4 p-4 pt-0">
                      {selectedFeature ? (
                        <>
                          <TabsContent value="errors">
                            <DetailSection title="Errors">
                              <div className="space-y-3">
                                {selectedFeature.errors.length > 0 ? (
                                  <div className="grid gap-2">
                                    {selectedFeature.errors
                                      .filter((error) => {
                                        if (!activeObjectId || selectedFeature.objects.length <= 1) {
                                          return true
                                        }
                                        return !error.cityObjectId || error.cityObjectId === activeObjectId
                                      })
                                      .map((error) => {
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
                            </DetailSection>
                          </TabsContent>

                          <TabsContent value="attributes">
                            <DetailSection title="Attributes">
                              <dl className="m-0 min-w-0 space-y-2">
                                {Object.entries(selectedFeature.attributes).map(([key, value]) => (
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
                            </DetailSection>
                          </TabsContent>
                        </>
                      ) : (
                        <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                          Click a building in the scene or choose a feature from the left column.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </section>
              </Tabs>
            </div>
          )}
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        <CityViewport
          data={dataset}
          cameraFocalLength={cameraFocalLength}
          hideOccludedEditEdges={hideOccludedEditEdges}
          isolateSelectedFeature={isolateSelectedFeature}
          geometryRevision={geometryRevision}
          focusRevision={focusRevision}
          focusTarget={focusTarget}
          selectedFeatureId={selectedFeatureId}
          activeObjectId={activeObjectId}
          editMode={editMode}
          selectedFaceIndex={selectedFaceIndex}
          selectedVertexIndex={selectedVertexIndex}
          onSelectFeature={handleSelectFeature}
          onSelectFace={handleSelectFace}
          onSelectVertex={handleSelectVertex}
          onVertexCommit={applyFeatureVertices}
          theme={theme}
        />

        <div className="pointer-events-none absolute inset-0 canvas-fade" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative size-7 opacity-80">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/65" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-foreground/65" />
            <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/75 bg-background/35" />
          </div>
        </div>

        {editMode && activeObject && (
          <div className="pointer-events-none absolute bottom-24 left-4 z-10 max-w-md">
            <div className="floating-panel pointer-events-auto space-y-2 rounded-sm border p-3">
              <p className="text-sm leading-5 text-foreground/78">
                Editing <span className="font-semibold text-foreground">{activeObject.id}</span>. Shift-click the active
                object to select a face, press <span className="font-semibold text-foreground">J</span>
                {' / '}
                <span className="font-semibold text-foreground">K</span> to step through the current ring, press
                <span className="font-semibold text-foreground"> R</span> to cycle rings, or Cmd/Ctrl-click a vertex and
                drag the gizmo.
              </p>
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
        )}

        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10">
          <div className="floating-panel pointer-events-auto flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {isPaneCollapsed && (
                <>
                  <Badge variant="outline" className="border-border bg-background/60 text-foreground/75">
                    {selectedFeature?.label ?? 'No feature'}
                  </Badge>
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                    <SquareMousePointer className="mr-1 size-3.5" />
                    {activeObject?.id ?? 'No object'}
                  </Badge>
                </>
              )}
              {selectedVertex && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  vtx {selectedVertexIndex}
                  <span className="mx-1 text-border">|</span>
                  {selectedVertex[0].toFixed(3)}, {selectedVertex[1].toFixed(3)}, {selectedVertex[2].toFixed(3)}
                </span>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5" onClick={toggleEditMode}>
                <Move3D className="size-3.5" />
                {editMode ? 'Exit edit' : 'Edit'}
              </Button>
              {selectedFeature && (
                <>
                  <div className="floating-chip flex items-center gap-2 rounded-sm border px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground">Isolate</span>
                    <Switch
                      checked={isolateSelectedFeature}
                      onCheckedChange={setIsolateSelectedFeature}
                      aria-label="Toggle isolate selected feature"
                    />
                  </div>
                  <div className="floating-chip flex items-center gap-2 rounded-sm border px-2.5 py-1.5">
                    <span className={cn('text-xs', editMode && activeObject ? 'text-muted-foreground' : 'text-muted-foreground/55')}>
                      Xray
                    </span>
                    <Switch
                      checked={!hideOccludedEditEdges}
                      onCheckedChange={(checked) => setHideOccludedEditEdges(!checked)}
                      disabled={!editMode || !activeObject}
                      aria-label="Toggle xray view for edit mode"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5"
                    onClick={centerCurrentSelection}
                  >
                    <LocateFixed className="size-3.5" />
                    Center
                  </Button>
                </>
              )}
              <div className="floating-chip flex items-center gap-2 rounded-sm border px-2.5 py-1.5">
                <span className="font-mono text-[11px] text-muted-foreground">{cameraFocalLength}mm</span>
                <input
                  type="range"
                  min={12}
                  max={120}
                  step={1}
                  value={cameraFocalLength}
                  onChange={(event) => setCameraFocalLength(Number(event.target.value))}
                  className="slider-accent h-2 w-32 cursor-pointer appearance-none rounded-none bg-input"
                  aria-label="Camera focal length"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-md">
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
                    Hotkeys
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {editMode ? 'Edit mode controls' : 'Navigation and selection'}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  {hotkeys.map((hotkey) => (
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

      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-sm border-2 border-dashed border-accent/35 bg-card/85 px-10 py-8 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Drop file to open</p>
            <p className="mt-1 text-sm text-muted-foreground">
              .city.jsonl / .city.json for features, .json for val3dity report
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailSection({
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
}

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
