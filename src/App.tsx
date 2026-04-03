import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileWarning,
  FolderOpen,
  LocateFixed,
  Move3D,
  Search,
  SquareMousePointer,
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

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const annotationInputRef = useRef<HTMLInputElement>(null)
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
  const dragCountRef = useRef(0)

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
  const selectedFaceVertexIndices = useMemo(
    () => getFaceVertexCycle(selectedFace),
    [selectedFace],
  )

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
        feature.attributes.identificatie,
        feature.attributes.gebruiksdoel,
      ]
        .filter(Boolean)
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

  async function openCityJsonFile(file: File) {
    setIsLoading(true)
    setError(null)

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

    const firstFeature = nextDataset.features[0] ?? null
    setSelectedFeatureId(firstFeature?.id ?? null)
    setActiveObjectId(firstFeature?.objects[0]?.id ?? null)
    setSelectedFaceIndex(null)
    setSelectedVertexIndex(null)
    setEditMode(false)
  }

  function clearAnnotations() {
    setDataset((current) => (current ? mergeValidationAnnotations(current, new Map()) : current))
    setAnnotationSourceName(null)
  }

  function centerFeatureById(featureId: string) {
    const feature = featureMap.get(featureId)
    if (!feature) {
      return
    }

    setFocusTarget({
      kind: 'feature',
      featureId: feature.id,
    })
    setFocusRevision((current) => current + 1)
  }

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
  }, [activeObjectId, editMode, selectedFaceIndex, selectedFeature, selectedVertexIndex])

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
        setSelectedVertexIndex(null)
      }
      if (next) {
        setSelectedFaceIndex(null)
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
    setSelectedVertexIndex(null)
  }, [featureMap])

  const handleSelectFace = useCallback((faceIndex: number | null) => {
    setSelectedFaceIndex(faceIndex)
    setSelectedVertexIndex(null)
  }, [])

  const handleSelectVertex = useCallback((vertexIndex: number | null) => {
    setSelectedVertexIndex(vertexIndex)

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
  }, [activeObjectId, editMode, selectedFeature])

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
  }, [applyFeatureVertices, centerCurrentSelection, cycleSelectedFaceVertex, editMode, selectedFeatureId, toggleEditMode])

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
          'panel-shell relative z-20 flex h-full shrink-0 border-r border-white/10 transition-[width] duration-300',
          isPaneCollapsed ? 'w-16' : 'w-[min(29rem,34vw)]',
        )}
      >
        <div className="pointer-events-auto flex h-full w-full">
          <div className="flex h-full w-16 shrink-0 flex-col items-center justify-between border-r border-white/10 bg-black/20 py-3">
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full"
                onClick={() => setIsPaneCollapsed((current) => !current)}
                aria-label={isPaneCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isPaneCollapsed ? <ChevronRight /> : <ChevronLeft />}
              </Button>
              <Badge variant="secondary" className="rotate-90 rounded-full px-2 py-0.5 font-mono text-[10px]">
                cjvis
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Open CityJSON file"
                title="Open CityJSON file"
              >
                <FolderOpen className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full"
                onClick={() => annotationInputRef.current?.click()}
                aria-label="Open annotation file"
                title="Open annotation file"
              >
                <FileWarning className="size-4" />
              </Button>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Badge variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">
                {dataset?.features.length ?? 0}
              </Badge>
              <Badge variant="outline" className="border-red-400/30 bg-red-500/10 text-red-100">
                {dataset?.features.filter((feature) => feature.errors.length > 0).length ?? 0}
              </Badge>
            </div>
          </div>

          {!isPaneCollapsed && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <section className="flex min-h-0 flex-[1.05] flex-col border-b border-white/10">
                <div className="space-y-3 p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/75">
                        CityJSON Webviewer
                      </p>
                      <h1 className="mt-1 text-lg font-semibold tracking-tight text-white">
                        Features
                      </h1>
                    </div>
                    <Badge className="max-w-[12rem] truncate bg-white/10 text-white hover:bg-white/10">
                      {dataset?.sourceName ?? 'No file'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-white/65">
                    <Badge
                      variant="outline"
                      className={cn(
                        annotationSourceName
                          ? 'border-red-300/30 bg-red-400/10 text-red-50'
                          : 'border-white/10 bg-white/5 text-white/55',
                      )}
                    >
                      {annotationSourceName ?? 'No annotations'}
                    </Badge>
                    {annotationSourceName && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAnnotations}>
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/45" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search features"
                      className="h-9 pl-8"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/4 px-3 py-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Errors only</p>
                      <p className="text-xs text-white/60">
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
                            'flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 transition',
                            isSelected
                              ? 'border-cyan-300/40 bg-cyan-400/10 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)]'
                              : isInvalid
                                ? 'border-red-400/20 bg-red-500/8 text-white/88 hover:border-red-300/28 hover:bg-red-500/12'
                                : 'border-white/8 bg-white/3 text-white/78 hover:border-white/16 hover:bg-white/6',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectFeature(feature.id)}
                            className="min-w-0 flex-1 overflow-hidden text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{feature.label}</p>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/42">
                                    {feature.id}
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'shrink-0 px-1.5 py-0 text-[10px]',
                                      isSelected
                                        ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50'
                                        : isInvalid
                                          ? 'border-red-300/30 bg-red-400/12 text-red-50'
                                          : 'border-white/10 bg-white/5 text-white/60',
                                    )}
                                  >
                                    {feature.type}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/52">
                              <span>{feature.objects.length} obj</span>
                              <span>{feature.vertices.length} vtx</span>
                              {errorCount > 0 && (
                                <span className="text-red-200">
                                  {errorCount} err
                                  {' '}({[...new Set(feature.errors.map((e) => e.code))].join(', ')})
                                </span>
                              )}
                            </div>
                          </button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 self-center rounded-full"
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
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/3 px-4 py-6 text-sm text-white/55">
                        No features matched the current filter.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </section>

              <Tabs value={detailTab} onValueChange={setDetailTab} asChild>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="space-y-3 p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/80">
                          Selection
                        </p>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                          {selectedFeature?.label ?? 'No feature selected'}
                        </h2>
                        {selectedFeature && (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/42">
                            {selectedFeature.id}
                          </p>
                        )}
                      </div>
                      {selectedFeature && (
                        <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-amber-50">
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
                                setSelectedVertexIndex(null)
                              }}
                              className={cn(
                                'rounded-md border px-2 py-1 text-left text-xs transition',
                                object.id === activeObjectId
                                  ? 'border-amber-300/40 bg-amber-400/10 text-white'
                                  : 'border-white/8 bg-white/3 text-white/70 hover:border-white/16 hover:bg-white/6',
                              )}
                            >
                              <span className="block max-w-[12rem] truncate font-medium">{object.id}</span>
                              <span className="block text-[10px] text-white/45">{object.type}</span>
                            </button>
                          ))}
                        </div>

                        <TabsList>
                          <TabsTrigger value="errors">Errors</TabsTrigger>
                          <TabsTrigger value="attributes">Attributes</TabsTrigger>
                        </TabsList>
                      </>
                    )}
                  </div>

                  <ScrollArea className="min-h-0 min-w-0 flex-1">
                    <div className="min-w-0 space-y-4 p-4 pt-0">
                      {selectedFeature ? (
                        <>
                          <TabsContent value="errors">
                            <DetailSection title="Errors">
                              <div className="space-y-3">
                                <div
                                  className={cn(
                                    'rounded-lg border px-3 py-2.5 text-sm',
                                    selectedFeature.validity === false
                                      ? 'border-red-400/20 bg-red-500/10 text-red-50'
                                      : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-50',
                                  )}
                                >
                                  {selectedFeature.validity === false
                                    ? `Invalid feature with ${selectedFeature.errors.length} reported errors.`
                                    : 'No validation errors reported for this feature.'}
                                </div>

                                {selectedFeature.errors.length > 0 ? (
                                  <div className="grid gap-2">
                                    {selectedFeature.errors.map((error) => {
                                      const color = errorColor(error.code)
                                      return (
                                        <div
                                          key={`${error.id}-${error.code}`}
                                          className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition"
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
                                                  <p className="truncate text-sm font-semibold text-white/90">{error.description}</p>
                                                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                                                    code {error.code}
                                                  </p>
                                                </div>
                                              </div>
                                              {error.faceIndex != null && (
                                                <Badge
                                                  variant="outline"
                                                  className="shrink-0 text-white/70"
                                                  style={{ borderColor: `${color}50`, backgroundColor: `${color}20` }}
                                                >
                                                  face {error.faceIndex}
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="mt-1.5 break-words font-mono text-[10px] text-white/45">
                                              {error.id}
                                            </p>
                                            {error.info && (
                                              <p className="mt-1.5 text-sm text-white/65">{error.info}</p>
                                            )}
                                          </div>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 self-center rounded-full"
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
                                    className="min-w-0 w-full overflow-hidden rounded-lg border border-white/8 bg-white/3 px-2.5 py-1.5"
                                  >
                                    <dt className="m-0 min-w-0 font-mono text-[10px] uppercase tracking-[0.16em] text-white/38">
                                      {key}
                                    </dt>
                                    <dd className="m-0 mt-1 min-w-0 max-w-full">
                                      <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
                                        <div className="w-fit min-w-full pr-2 whitespace-nowrap text-[13px] leading-5 text-white/80">
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
                        <div className="rounded-xl border border-dashed border-white/12 bg-white/3 px-4 py-6 text-sm text-white/55">
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
        />

        <div className="pointer-events-none absolute inset-0 canvas-fade" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative size-7 opacity-80">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/65" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/65" />
            <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/75 bg-black/35" />
          </div>
        </div>

        {editMode && activeObject && (
          <div className="pointer-events-none absolute bottom-24 left-4 z-10 max-w-md">
            <div className="pointer-events-auto space-y-2 rounded-2xl border border-amber-400/15 bg-black/45 p-3 backdrop-blur-md">
              <p className="text-sm leading-5 text-white/78">
                Editing <span className="font-semibold text-white">{activeObject.id}</span>. Shift-click the active
                object to select a face, press <span className="font-semibold text-white">J</span>
                {' / '}
                <span className="font-semibold text-white">K</span> to step through its vertices, or Cmd/Ctrl-click a
                vertex and drag the gizmo.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-amber-50">
                  {selectedFaceIndex != null ? `Face ${selectedFaceIndex}` : 'No face selected'}
                </Badge>
                {selectedFaceVertexIndices.length > 0 && (
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-white/65">
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
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 backdrop-blur-md">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {isPaneCollapsed && (
                <>
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-white/70">
                    {selectedFeature?.label ?? 'No feature'}
                  </Badge>
                  <Badge variant="outline" className="border-amber-300/25 bg-amber-400/10 text-amber-50">
                    <SquareMousePointer className="mr-1 size-3.5" />
                    {activeObject?.id ?? 'No object'}
                  </Badge>
                </>
              )}
              {selectedVertex && (
                <span className="font-mono text-[11px] text-white/65">
                  vtx {selectedVertexIndex}
                  <span className="mx-1 text-white/30">|</span>
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
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-2.5 py-1.5">
                    <span className="text-xs text-white/70">Isolate</span>
                    <Switch
                      checked={isolateSelectedFeature}
                      onCheckedChange={setIsolateSelectedFeature}
                      aria-label="Toggle isolate selected feature"
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-2.5 py-1.5">
                    <span className={cn('text-xs', editMode && activeObject ? 'text-white/70' : 'text-white/40')}>
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
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-2.5 py-1.5">
                <span className="font-mono text-[11px] text-white/65">{cameraFocalLength}mm</span>
                <input
                  type="range"
                  min={12}
                  max={120}
                  step={1}
                  value={cameraFocalLength}
                  onChange={(event) => setCameraFocalLength(Number(event.target.value))}
                  className="h-2 w-32 cursor-pointer appearance-none rounded-full bg-white/12 accent-cyan-300"
                  aria-label="Camera focal length"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-md rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/70 backdrop-blur-md">
          {error ? (
            <span>{error}</span>
          ) : isLoading ? (
            <span>Loading CityJSON feature sequence…</span>
          ) : (
            <span>
              Hold Shift and click geometry to select. Double-click to recenter navigation. {editMode ? 'Tab exits edit mode, Shift-click selects a face, Ctrl-click selects a vertex, C centers the current selection, X toggles xray, J/K cycle face vertices, and U resets the selected feature geometry.' : 'Tab enters edit mode for the current cityobject. C centers the active mesh.'}
            </span>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.jsonl,.city.json,.city.jsonl"
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-cyan-300/50 bg-cyan-400/10 px-10 py-8 text-center">
            <p className="text-lg font-semibold text-white">Drop file to open</p>
            <p className="mt-1 text-sm text-white/60">
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
        <div className="h-px flex-1 bg-white/10" />
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{title}</p>
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

export default App

function cloneVertices(vertices: Vec3[]) {
  return vertices.map((vertex) => [...vertex] as Vec3)
}

function getFaceVertexCycle(rings: number[][] | null) {
  const outerRing = rings?.[0] ?? []
  const seen = new Set<number>()
  const vertexIndices: number[] = []

  for (const vertexIndex of outerRing) {
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
