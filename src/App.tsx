import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileWarning,
  FolderOpen,
  Layers3,
  LocateFixed,
  Move3D,
  Search,
  SquareMousePointer,
  Workflow,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
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
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null)
  const [geometryRevision, setGeometryRevision] = useState(0)
  const [focusRevision, setFocusRevision] = useState(0)
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget>(null)
  const [annotationSourceName, setAnnotationSourceName] = useState<string | null>(null)
  const [cameraFocalLength, setCameraFocalLength] = useState(50)
  const [hideOccludedEditEdges, setHideOccludedEditEdges] = useState(true)
  const [showOnlyInvalidFeatures, setShowOnlyInvalidFeatures] = useState(false)
  const [isolateSelectedFeature, setIsolateSelectedFeature] = useState(false)

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
      applyDataset(mergeValidationAnnotations(nextDataset, annotations))
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

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

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
      event.target.value = ''
      setIsLoading(false)
    }
  }

  async function handleAnnotationSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!dataset) {
      setError('Open a CityJSON feature file before loading annotations.')
      event.target.value = ''
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const annotations = await loadValidationReportFromFile(file)
      setDataset((current) => (current ? mergeValidationAnnotations(current, annotations) : current))
      setAnnotationSourceName(file.name)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to parse annotation report.'
      setError(message)
    } finally {
      event.target.value = ''
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
    setSelectedVertexIndex(null)
    setEditMode(false)
  }

  function clearAnnotations() {
    setDataset((current) => (current ? mergeValidationAnnotations(current, new Map()) : current))
    setAnnotationSourceName(null)
  }

  function centerSelectedFeature() {
    if (!selectedFeature) {
      return
    }

    setFocusTarget({
      kind: 'feature',
      featureId: selectedFeature.id,
    })
    setFocusRevision((current) => current + 1)
  }

  function centerValidationError(error: ViewerValidationError) {
    if (!selectedFeature) {
      return
    }

    if (
      error.cityObjectId &&
      selectedFeature.objects.some((object) => object.id === error.cityObjectId)
    ) {
      setActiveObjectId(error.cityObjectId)
    }

    setSelectedVertexIndex(null)
    setFocusTarget({
      kind: 'error',
      featureId: selectedFeature.id,
      objectId: error.cityObjectId,
      faceIndex: error.faceIndex,
    })
    setFocusRevision((current) => current + 1)
  }

  const toggleEditMode = useCallback(() => {
    setEditMode((current) => {
      const next = !current
      if (!next) {
        setSelectedVertexIndex(null)
      }
      return next
    })
  }, [])

  const toggleIsolateSelectedFeature = useCallback(() => {
    setIsolateSelectedFeature((current) => !current)
  }, [])

  const handleSelectFeature = useCallback((featureId: string, objectId?: string | null) => {
    const feature = featureMap.get(featureId)
    if (!feature) {
      return
    }

    setSelectedFeatureId(featureId)
    setActiveObjectId(objectId ?? feature.objects[0]?.id ?? null)
    setSelectedVertexIndex(null)
  }, [featureMap])

  function handleSelectObject(objectId: string) {
    setActiveObjectId(objectId)
    setSelectedVertexIndex(null)
  }

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

  const handleVertexCommit = useCallback((featureId: string, vertices: Vec3[]) => {
    setDataset((current) => {
      if (!current) {
        return current
      }

      const feature = current.features.find((candidate) => candidate.id === featureId)
      if (!feature) {
        return current
      }

      feature.vertices = cloneVertices(vertices)
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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyFeatureVertices, selectedFeatureId, toggleEditMode])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          'panel-shell relative z-20 flex h-full shrink-0 border-r border-white/10 transition-[width] duration-300',
          isPaneCollapsed ? 'w-16' : 'w-[min(36rem,44vw)]',
        )}
      >
        <div className="pointer-events-auto flex h-full w-full">
          <div className="flex h-full w-16 shrink-0 flex-col items-center justify-between border-r border-white/10 bg-black/20 py-4">
            <div className="flex flex-col items-center gap-3">
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
            </div>

            <div className="flex flex-col items-center gap-3">
              <Badge variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">
                {dataset?.features.length ?? 0}
              </Badge>
              <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-100">
                {selectedFeature ? selectedFeature.objects.length : 0}
              </Badge>
            </div>
          </div>

          {!isPaneCollapsed && (
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2">
              <div className="flex min-h-0 min-w-0 flex-col border-r border-white/10">
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
                        CityJSON Webviewer
                      </p>
                      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                        Feature Index
                      </h1>
                    </div>
                    <Badge className="bg-white/10 text-white hover:bg-white/10">
                      {dataset?.sourceName ?? 'No file'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FolderOpen className="size-4" />
                      Open file
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => annotationInputRef.current?.click()}
                    >
                      <FileWarning className="size-4" />
                      Open annotations
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={toggleEditMode}>
                      <Move3D className="size-4" />
                      {editMode ? 'Leave edit mode' : 'Edit mode'}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/65">
                    <span className="font-mono uppercase tracking-[0.16em]">Annotations</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        annotationSourceName
                          ? 'border-red-300/30 bg-red-400/10 text-red-50'
                          : 'border-white/10 bg-white/5 text-white/55',
                      )}
                    >
                      {annotationSourceName ?? 'None loaded'}
                    </Badge>
                    {annotationSourceName && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAnnotations}>
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by id, type, identificatie"
                      className="pl-9"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/4 px-3 py-2.5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Feature filter</p>
                      <p className="mt-1 text-sm text-white/70">
                        {showOnlyInvalidFeatures ? 'Showing only features with validation errors.' : 'Showing all features.'}
                      </p>
                    </div>
                    <Switch
                      checked={showOnlyInvalidFeatures}
                      onCheckedChange={setShowOnlyInvalidFeatures}
                      className="shrink-0"
                      aria-label="Show only features with validation errors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard label="Features" value={dataset?.features.length ?? 0} icon={<Layers3 className="size-4" />} />
                    <MetricCard label="Objects" value={selectedFeature?.objects.length ?? 0} icon={<Workflow className="size-4" />} />
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-2 p-3">
                    {filteredFeatures.map((feature) => {
                      const isSelected = feature.id === selectedFeatureId
                      const errorCount = feature.errors.length
                      const isInvalid = feature.validity === false
                      return (
                        <button
                          key={feature.id}
                          type="button"
                          onClick={() => handleSelectFeature(feature.id)}
                          className={cn(
                            'w-full rounded-xl border px-3 py-3 text-left transition',
                            isSelected
                              ? 'border-cyan-300/40 bg-cyan-400/10 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)]'
                              : isInvalid
                                ? 'border-red-400/20 bg-red-500/8 text-white/88 hover:border-red-300/28 hover:bg-red-500/12'
                                : 'border-white/8 bg-white/3 text-white/78 hover:border-white/16 hover:bg-white/6',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{feature.label}</p>
                              <p className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
                                {feature.id}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'shrink-0',
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

                          <div className="mt-3 flex items-center gap-3 text-[11px] text-white/55">
                            <span>{feature.objects.length} cityobjects</span>
                            <span>{feature.vertices.length} vertices</span>
                            {errorCount > 0 && <span className="text-red-200">{errorCount} errors</span>}
                          </div>
                        </button>
                      )
                    })}

                    {!isLoading && filteredFeatures.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/3 px-4 py-6 text-sm text-white/55">
                        No features matched the current filter.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">
                        Selection
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                        {selectedFeature?.label ?? 'No feature selected'}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedFeature && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2"
                          onClick={centerSelectedFeature}
                        >
                          <LocateFixed className="size-4" />
                          Center view
                        </Button>
                      )}
                      {selectedFeature && (
                        <Button
                          variant={isolateSelectedFeature ? 'secondary' : 'outline'}
                          size="sm"
                          className="gap-2"
                          onClick={toggleIsolateSelectedFeature}
                        >
                          {isolateSelectedFeature ? 'Show all' : 'Isolate selected'}
                        </Button>
                      )}
                      {selectedFeature && (
                        <Button
                          variant={hideOccludedEditEdges ? 'secondary' : 'outline'}
                          size="sm"
                          className="gap-2"
                          onClick={() => setHideOccludedEditEdges((current) => !current)}
                          disabled={!editMode || !activeObject}
                        >
                          {hideOccludedEditEdges ? 'Cull hidden edges' : 'Show hidden edges'}
                        </Button>
                      )}
                      {selectedFeature && (
                        <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-amber-50">
                          {selectedFeature.type}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard label="Selected object" value={activeObject?.id ?? 'None'} icon={<SquareMousePointer className="size-4" />} compact />
                    <MetricCard
                      label="Selected vertex"
                      value={selectedVertexIndex != null ? `#${selectedVertexIndex}` : 'None'}
                      icon={<Crosshair className="size-4" />}
                      compact
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Lens</p>
                      <span className="font-mono text-xs text-white/65">{cameraFocalLength}mm</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={120}
                      step={1}
                      value={cameraFocalLength}
                      onChange={(event) => setCameraFocalLength(Number(event.target.value))}
                      className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 accent-cyan-300"
                      aria-label="Camera focal length"
                    />
                    <p className="mt-2 text-xs text-white/50">
                      12mm is wide-angle, 50mm is a standard lens, and longer lenses compress perspective.
                    </p>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-5 p-4">
                    {selectedFeature ? (
                      <>
                        <DetailSection title="CityObjects">
                          <div className="grid gap-2">
                            {selectedFeature.objects.map((object) => (
                              <button
                                key={object.id}
                                type="button"
                                onClick={() => handleSelectObject(object.id)}
                                className={cn(
                                  'rounded-xl border px-3 py-3 text-left transition',
                                  object.id === activeObjectId
                                    ? 'border-amber-300/40 bg-amber-400/10 text-white'
                                    : 'border-white/8 bg-white/3 text-white/75 hover:border-white/16 hover:bg-white/6',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{object.id}</p>
                                    <p className="truncate text-xs text-white/45">{object.type}</p>
                                  </div>
                                  <Badge variant="outline" className="border-white/10 bg-white/5 text-white/55">
                                    {object.geometryType ?? 'No geometry'}
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        </DetailSection>

                        {editMode && activeObject && (
                          <DetailSection title="Edit Mode">
                            <div className="space-y-3 rounded-2xl border border-amber-400/15 bg-amber-500/8 p-3">
                              <p className="text-sm leading-6 text-white/78">
                                Vertex handles are visible for <span className="font-semibold text-white">{activeObject.id}</span>. Click a
                                vertex, then drag the transform gizmo to move it.
                              </p>
                              {selectedVertex && (
                                <div className="rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs text-white/75">
                                  <p>x {selectedVertex[0].toFixed(3)}</p>
                                  <p>y {selectedVertex[1].toFixed(3)}</p>
                                  <p>z {selectedVertex[2].toFixed(3)}</p>
                                </div>
                              )}
                            </div>
                          </DetailSection>
                        )}

                        <DetailSection title="Validation">
                          <div className="space-y-3">
                            <div
                              className={cn(
                                'rounded-xl border px-3 py-3 text-sm',
                                selectedFeature.validity === false
                                  ? 'border-red-400/20 bg-red-500/10 text-red-50'
                                  : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-50',
                              )}
                            >
                              {selectedFeature.validity === false
                                ? `Invalid feature with ${selectedFeature.errors.length} reported errors.`
                                : 'No validation errors reported for this feature.'}
                            </div>

                            {selectedFeature.errors.length > 0 && (
                              <div className="grid gap-2">
                                {selectedFeature.errors.map((error) => (
                                  <button
                                    key={`${error.id}-${error.code}`}
                                    type="button"
                                    onClick={() => centerValidationError(error)}
                                    className="w-full rounded-xl border border-red-400/15 bg-red-500/8 px-3 py-3 text-left transition hover:border-red-300/28 hover:bg-red-500/12 focus-visible:border-red-300/32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/30"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-red-50">{error.description}</p>
                                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-red-200/65">
                                          code {error.code}
                                        </p>
                                      </div>
                                      <Badge variant="outline" className="border-red-300/30 bg-red-400/10 text-red-50">
                                        face {error.faceIndex ?? '—'}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 break-words font-mono text-[11px] text-red-100/70">
                                      {error.id}
                                    </p>
                                    {error.info && (
                                      <p className="mt-2 text-sm text-red-50/85">{error.info}</p>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </DetailSection>

                        <DetailSection title="Attributes">
                          <dl className="space-y-2">
                            {Object.entries(selectedFeature.attributes).map(([key, value]) => (
                              <div
                                key={key}
                                className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
                              >
                                <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">{key}</dt>
                                <dd className="mt-1 break-words text-sm text-white/80">{formatValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </DetailSection>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/12 bg-white/3 px-4 py-6 text-sm text-white/55">
                        Click a building in the scene or choose a feature from the left column.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
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
          selectedVertexIndex={selectedVertexIndex}
          onSelectFeature={handleSelectFeature}
          onSelectVertex={setSelectedVertexIndex}
          onVertexCommit={handleVertexCommit}
        />

        <div className="pointer-events-none absolute inset-0 canvas-fade" />

        <div className="pointer-events-none absolute bottom-4 right-4 z-10 max-w-md rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/70 backdrop-blur-md">
          {error ? (
            <span>{error}</span>
          ) : isLoading ? (
            <span>Loading CityJSON feature sequence…</span>
          ) : (
            <span>
              Hold Shift and click geometry to select. Double-click to recenter navigation. {editMode ? 'Tab exits edit mode and U resets the selected feature geometry.' : 'Tab enters edit mode for the current cityobject.'}
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
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/10" />
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{title}</p>
      </div>
      {children}
    </section>
  )
}

function MetricCard({
  label,
  value,
  icon,
  compact = false,
}: {
  label: string
  value: string | number
  icon: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/4',
        compact ? 'px-3 py-3' : 'px-3 py-3.5',
      )}
    >
      <div className="flex items-center gap-2 text-white/45">{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

function formatValue(value: unknown) {
  if (value == null) {
    return '—'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3)
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
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
