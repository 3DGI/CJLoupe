import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  Filter,
  Layers,
  Search,
  TableProperties,
  TriangleAlert
} from 'lucide-react'
import type { ChangeEvent } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { errorColor } from '@/lib/error-palette'
import { cn } from '@/lib/utils'
import type {
  ViewerCityObject
} from '@/types/cityjson'

import type { ErrorCodeFilterOption, FeatureListItem } from '../presentation'
import { CITY_OBJECT_TREE_ROW_HEIGHT, FEATURE_LIST_BOTTOM_PADDING, FEATURE_LIST_OVERSCAN, FEATURE_LIST_ROW_GAP, FEATURE_LIST_ROW_HEIGHT, FEATURE_LIST_TOP_PADDING, OBJECT_LIST_VISIBILITY_INSET, collectExpandedObjectIds, collectTreeRootIds, estimateFeatureListRowHeight, featureListRowHeightKey, formatObjectDisplayId, getObjectGeometryChips, getObjectGeometryTypeLabel, objectSelectionKey } from '../presentation'

export function ObjectTreeIndicators({
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
          <TableProperties className="size-3" />
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

export function ObjectTreeGeometrySummary({
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
    <div className="inline-flex translate-y-[-1px] items-center overflow-hidden rounded-sm border border-foreground/10 bg-background/45 align-middle leading-none">
      {geometryTypeLabel && (
        <span className="flex h-4 items-center bg-muted/70 px-1.5 text-[9px] font-medium leading-none text-foreground/80">
          {geometryTypeLabel}
        </span>
      )}
      {chips.map((chip, index) => (
        <span
          key={chip.key}
          className={cn(
            'flex h-4 items-center bg-background/70 px-1.5 text-[9px] font-medium uppercase tracking-[0.14em] leading-none text-muted-foreground',
            (geometryTypeLabel || index > 0) && 'border-l border-foreground/10',
          )}
        >
          {chip.label}
        </span>
      ))}
    </div>
  )
}

export const FeatureObjectTree = memo(function FeatureObjectTree({
  featureId,
  objects,
  activeObjectId,
  errorCountsByObjectId,
  onSelectObject,
  onCenterObject,
}: {
  featureId: string
  objects: ViewerCityObject[]
  activeObjectId: string | null
  errorCountsByObjectId: Map<string, number>
  onSelectObject: (objectId: string) => void
  onCenterObject: (featureId: string, objectId: string) => void
}) {
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects])
  const rootIds = useMemo(() => collectTreeRootIds(objects, objectById), [objectById, objects])
  const expandedIds = useMemo(
    () => collectExpandedObjectIds(activeObjectId, objectById),
    [activeObjectId, objectById],
  )

  return (
    <div className="flex flex-col gap-1">
      {rootIds.map((objectId) => (
        <FeatureObjectTreeNode
          key={objectId}
          featureId={featureId}
          objectId={objectId}
          objectById={objectById}
          activeObjectId={activeObjectId}
          errorCountsByObjectId={errorCountsByObjectId}
          expandedIds={expandedIds}
          onSelectObject={onSelectObject}
          onCenterObject={onCenterObject}
          depth={0}
        />
      ))}
    </div>
  )
})

export const FeatureObjectTreeNode = memo(function FeatureObjectTreeNode({
  featureId,
  objectId,
  objectById,
  activeObjectId,
  errorCountsByObjectId,
  expandedIds,
  onSelectObject,
  onCenterObject,
  depth,
  visited = new Set<string>(),
}: {
  featureId: string
  objectId: string
  objectById: Map<string, ViewerCityObject>
  activeObjectId: string | null
  errorCountsByObjectId: Map<string, number>
  expandedIds: Set<string>
  onSelectObject: (objectId: string) => void
  onCenterObject: (featureId: string, objectId: string) => void
  depth: number
  visited?: Set<string>
}) {
  const object = objectById.get(objectId)
  const isVisited = visited.has(objectId)
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

  const childIds = object.childIds.filter((childId) => objectById.has(childId))
  const hasChildren = childIds.length > 0
  const isActive = objectId === activeObjectId
  const hasAttributes = Object.keys(object.attributes).length > 0
  const hasGeometry = object.geometries.length > 0
  const errorCount = errorCountsByObjectId.get(objectId) ?? 0
  const chips = getObjectGeometryChips(object.geometries)
  const geometryTypeLabel = getObjectGeometryTypeLabel(object.geometries)
  const nextVisited = new Set(visited)
  nextVisited.add(objectId)
  const objectLabel = formatObjectDisplayId(object.id)
  const objectContents = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate text-[11px] font-medium">{objectLabel}</span>
      </div>
      <ObjectTreeIndicators hasAttributes={hasAttributes} errorCount={errorCount} />
      <span className="shrink-0 text-[10px] text-muted-foreground">{object.type}</span>
      {!hasGeometry && <span className="shrink-0 text-[10px] text-muted-foreground/70">no geom</span>}
      {(geometryTypeLabel || chips.length > 0) && (
        <div className="shrink-0">
          <ObjectTreeGeometrySummary
            geometryTypeLabel={geometryTypeLabel}
            chips={chips}
          />
        </div>
      )}
    </>
  )

  if (!hasChildren) {
    return (
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <button
          type="button"
          data-active-object-list-item={isActive ? 'true' : undefined}
          onClick={() => onSelectObject(object.id)}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onCenterObject(featureId, object.id)
          }}
          className={cn(
            'flex min-h-7 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-sm px-2 py-1 text-left transition',
            isActive
              ? 'bg-primary/10 text-foreground'
              : 'text-foreground/72 hover:bg-foreground/6',
          )}
        >
          {objectContents}
        </button>
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
          <CollapsibleTrigger
            render={(
              <button
                type="button"
                aria-label={open ? `Collapse ${objectLabel}` : `Expand ${objectLabel}`}
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition hover:bg-foreground/6 hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
              />
            )}
          >
            <ChevronRight
              className={cn('size-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
            />
          </CollapsibleTrigger>
          <button
            type="button"
            data-active-object-list-item={isActive ? 'true' : undefined}
            onClick={() => onSelectObject(object.id)}
            onDoubleClick={(event) => {
              event.stopPropagation()
              onCenterObject(featureId, object.id)
            }}
            className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left"
          >
            {objectContents}
          </button>
        </div>
        <CollapsibleContent className="overflow-hidden">
          <div className="mt-1 flex flex-col gap-1 border-l border-border/55 pl-3">
            {childIds.map((childId) => (
              <FeatureObjectTreeNode
                key={childId}
                featureId={featureId}
                objectId={childId}
                objectById={objectById}
                activeObjectId={activeObjectId}
                errorCountsByObjectId={errorCountsByObjectId}
                expandedIds={expandedIds}
                onSelectObject={onSelectObject}
                onCenterObject={onCenterObject}
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

export function CopyIdButton({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const [didCopy, setDidCopy] = useState(false)

  useEffect(() => {
    if (!didCopy) {
      return
    }

    const timeout = window.setTimeout(() => {
      setDidCopy(false)
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [didCopy])

  return (
    <span
      className="inline-flex"
      onClick={(event) => {
        event.stopPropagation()
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5 rounded-[3px] text-muted-foreground hover:text-foreground"
        aria-label={`Copy full ${label} ${value}`}
        title={didCopy ? `Copied full ${label}` : `Copy full ${label}: ${value}`}
        onClick={(event) => {
          event.stopPropagation()

          void navigator.clipboard.writeText(value).then(() => {
            setDidCopy(true)
          })
        }}
      >
        {didCopy ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
    </span>
  )
}

export const FeatureListRow = memo(function FeatureListRow({
  item,
  selected,
  showFeatureSeparator,
  activeObjectId,
  onSelectFeature,
  onCenterObject,
  onHeightChange,
}: {
  item: FeatureListItem
  selected: boolean
  showFeatureSeparator: boolean
  activeObjectId: string | null
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  onCenterObject: (featureId: string, objectId: string) => void
  onHeightChange: (rowHeightKey: string, height: number) => void
}) {
  const { feature, isInvalid } = item
  const rowRef = useRef<HTMLDivElement | null>(null)
  const rowHeightKey = featureListRowHeightKey(item)

  useEffect(() => {
    const element = rowRef.current
    if (!element) {
      return
    }

    const reportHeight = () => {
      // ResizeObserver callbacks can already be queued when virtualization
      // detaches a row. A detached element measures as zero and must not be
      // allowed to collapse the virtual layout.
      if (!element.isConnected) {
        return
      }

      const measuredHeight = Math.ceil(element.getBoundingClientRect().height)
      if (measuredHeight <= 0) {
        return
      }

      onHeightChange(
        rowHeightKey,
        showFeatureSeparator
          ? Math.max(measuredHeight, FEATURE_LIST_ROW_HEIGHT)
          : measuredHeight,
      )
    }

    reportHeight()
    const resizeObserver = new ResizeObserver(reportHeight)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [onHeightChange, rowHeightKey, showFeatureSeparator])

  return (
    <div
      ref={rowRef}
      style={showFeatureSeparator ? { minHeight: `max(${FEATURE_LIST_ROW_HEIGHT}px, 3.75rem)` } : undefined}
      className="w-full min-w-0 overflow-hidden"
    >
      {showFeatureSeparator && (
        <div className="flex min-w-0 items-center gap-1.5 pt-0.5 text-[9px] text-muted-foreground">
          <span
            className={cn(
              'min-w-0 truncate font-medium',
              selected ? 'text-accent' : isInvalid ? 'text-destructive' : 'text-muted-foreground',
            )}
            title={feature.id}
          >
            {feature.id}
          </span>
          <div className="min-w-6 flex-1 border-t border-border/70" />
        </div>
      )}

      <div
        className={cn(
          'transition',
          showFeatureSeparator ? 'mt-0.5' : 'mt-0',
        )}
      >
        <FeatureObjectTree
          featureId={feature.id}
          objects={item.objects}
          activeObjectId={activeObjectId}
          errorCountsByObjectId={item.errorCountsByObjectId}
          onSelectObject={(objectId) => onSelectFeature(feature.id, objectId)}
          onCenterObject={onCenterObject}
        />
      </div>
    </div>
  )
})

export const FeatureListPanel = memo(function FeatureListPanel({
  filteredFeatureItems,
  isLoading,
  annotationSourceName,
  datasetFeatureCount,
  showFeatureSeparators,
  showDesktopHeading,
  searchQuery,
  selectedFeatureId,
  showOnlyInvalidFeatures,
  errorCodeFilters,
  selectedErrorCodes,
  onSearchQueryChange,
  onShowOnlyInvalidFeaturesChange,
  onToggleErrorCodeFilter,
  onToggleAllErrorCodeFilters,
  onSelectFeature,
  onCenterObject,
  onShowInfo,
  activeObjectId,
}: {
  filteredFeatureItems: FeatureListItem[]
  isLoading: boolean
  annotationSourceName: string | null
  datasetFeatureCount: number
  showFeatureSeparators: boolean
  showDesktopHeading: boolean
  searchQuery: string
  selectedFeatureId: string | null
  showOnlyInvalidFeatures: boolean
  errorCodeFilters: ErrorCodeFilterOption[]
  selectedErrorCodes: number[] | null
  onSearchQueryChange: (event: ChangeEvent<HTMLInputElement>) => void
  onShowOnlyInvalidFeaturesChange: (checked: boolean) => void
  onToggleErrorCodeFilter: (code: number) => void
  onToggleAllErrorCodeFilters: () => void
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  onCenterObject: (featureId: string, objectId: string) => void
  onShowInfo: (() => void) | null
  activeObjectId: string | null
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const handledAutoScrollKeyRef = useRef<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [rowHeights, setRowHeights] = useState<Map<string, number>>(() => new Map())
  const selectedErrorCodeSet = useMemo(
    () => selectedErrorCodes === null ? null : new Set(selectedErrorCodes),
    [selectedErrorCodes],
  )
  const selectedErrorCodeCount = selectedErrorCodeSet?.size ?? errorCodeFilters.length

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

  const rowLayout = useMemo(() => {
    const rows: Array<{ top: number; height: number }> = []
    let nextTop = FEATURE_LIST_TOP_PADDING
    const rowGap = showFeatureSeparators ? FEATURE_LIST_ROW_GAP : 0

    for (const item of filteredFeatureItems) {
      const height = rowHeights.get(featureListRowHeightKey(item)) ?? estimateFeatureListRowHeight(item, showFeatureSeparators)
      rows.push({ top: nextTop, height })
      nextTop += height + rowGap
    }

    const totalHeight =
      rows.length > 0
        ? rows[rows.length - 1].top + rows[rows.length - 1].height + FEATURE_LIST_BOTTOM_PADDING
        : FEATURE_LIST_TOP_PADDING + FEATURE_LIST_BOTTOM_PADDING

    return { rows, totalHeight }
  }, [filteredFeatureItems, rowHeights, showFeatureSeparators])
  const rowLayoutRef = useRef(rowLayout)
  useEffect(() => {
    rowLayoutRef.current = rowLayout
  }, [rowLayout])

  const filteredObjectCount = useMemo(
    () => filteredFeatureItems.reduce((count, item) => count + item.objects.length, 0),
    [filteredFeatureItems],
  )

  const handleRowHeightChange = useCallback((rowHeightKey: string, height: number) => {
    setRowHeights((current) => {
      if (current.get(rowHeightKey) === height) {
        return current
      }

      const next = new Map(current)
      next.set(rowHeightKey, height)
      return next
    })
  }, [])

  const handleListSelectFeature = useCallback((
    featureId: string,
    objectId?: string | null,
  ) => {
    handledAutoScrollKeyRef.current = objectSelectionKey(featureId, objectId)
    onSelectFeature(featureId, objectId)
  }, [onSelectFeature])

  const handleListCenterObject = useCallback((
    featureId: string,
    objectId: string,
  ) => {
    handledAutoScrollKeyRef.current = objectSelectionKey(featureId, objectId)
    onCenterObject(featureId, objectId)
  }, [onCenterObject])

  const scrollSelectedFeatureIntoView = useCallback((featureIndex: number) => {
    const viewport = viewportRef.current
    if (!viewport || featureIndex < 0) {
      return
    }

    const selectedRow = rowLayoutRef.current.rows[featureIndex]
    if (!selectedRow) {
      return
    }

    const rowStart = selectedRow.top
    const rowEnd = selectedRow.top + selectedRow.height
    const viewportStart = viewport.scrollTop
    const viewportEnd = viewportStart + viewport.clientHeight

    if (rowStart >= viewportStart && rowEnd <= viewportEnd) {
      return
    }

    const nextTop =
      rowStart < viewportStart
        ? Math.max(rowStart - (showFeatureSeparators ? FEATURE_LIST_ROW_GAP : 0), 0)
        : rowEnd - viewport.clientHeight + (showFeatureSeparators ? FEATURE_LIST_ROW_GAP : 0)

    viewport.scrollTo({
      top: Math.max(nextTop, 0),
      behavior: 'auto',
    })
  }, [showFeatureSeparators])

  const scrollActiveObjectIntoView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return false
    }

    const activeElement = viewport.querySelector<HTMLElement>('[data-active-object-list-item="true"]')
    if (!activeElement) {
      return false
    }

    const viewportRect = viewport.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()
    if (activeRect.height <= 0) {
      return false
    }

    const visibilityInset = Math.min(
      OBJECT_LIST_VISIBILITY_INSET,
      Math.max((viewport.clientHeight - activeRect.height) / 2, 0),
    )
    if (
      activeRect.top >= viewportRect.top + visibilityInset &&
      activeRect.bottom <= viewportRect.bottom - visibilityInset
    ) {
      return true
    }

    const viewportCenter = viewportRect.top + viewport.clientHeight / 2
    const activeCenter = activeRect.top + activeRect.height / 2
    const nextTop = viewport.scrollTop + activeCenter - viewportCenter

    viewport.scrollTo({
      top: Math.max(nextTop, 0),
      behavior: 'auto',
    })
    return true
  }, [])

  useEffect(() => {
    if (!selectedFeatureId) {
      handledAutoScrollKeyRef.current = null
      return
    }

    const selectionKey = objectSelectionKey(selectedFeatureId, activeObjectId)
    if (selectedIndex < 0 || handledAutoScrollKeyRef.current === selectionKey) {
      return
    }

    handledAutoScrollKeyRef.current = selectionKey
    scrollSelectedFeatureIntoView(selectedIndex)
    if (!activeObjectId) {
      return
    }

    const frameIds: number[] = []
    const scheduleObjectScroll = (attempt: number) => {
      const frameId = window.requestAnimationFrame(() => {
        if (scrollActiveObjectIntoView()) {
          return
        }

        if (attempt <= 0) {
          return
        }

        scrollSelectedFeatureIntoView(selectedIndex)
        scheduleObjectScroll(attempt - 1)
      })
      frameIds.push(frameId)
    }

    scheduleObjectScroll(12)

    return () => {
      for (const frameId of frameIds) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [
    activeObjectId,
    scrollActiveObjectIntoView,
    scrollSelectedFeatureIntoView,
    selectedFeatureId,
    selectedIndex,
  ])

  const overscanDistance = FEATURE_LIST_OVERSCAN * (
    (showFeatureSeparators ? FEATURE_LIST_ROW_HEIGHT : CITY_OBJECT_TREE_ROW_HEIGHT) +
    (showFeatureSeparators ? FEATURE_LIST_ROW_GAP : 0)
  )
  const visibleStart = Math.max(scrollTop - overscanDistance, 0)
  const visibleEnd = scrollTop + viewportHeight + overscanDistance
  let startIndex = 0
  while (
    startIndex < rowLayout.rows.length &&
    rowLayout.rows[startIndex].top + rowLayout.rows[startIndex].height < visibleStart
  ) {
    startIndex += 1
  }

  let endIndex = startIndex
  while (endIndex < rowLayout.rows.length && rowLayout.rows[endIndex].top <= visibleEnd) {
    endIndex += 1
  }
  const renderedItemIndices = Array.from(
    { length: Math.max(endIndex - startIndex, 0) },
    (_, index) => startIndex + index,
  )
  if (selectedIndex >= 0 && (selectedIndex < startIndex || selectedIndex >= endIndex)) {
    renderedItemIndices.push(selectedIndex)
    renderedItemIndices.sort((left, right) => left - right)
  }
  return (
    <>
      <div className="panel-header-surface flex flex-col gap-2.5 border-b p-4 pb-3">
        {showDesktopHeading && (
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <Layers className="size-4 text-muted-foreground" />
              CityObjects ({datasetFeatureCount})
            </h1>
            <div className="flex items-center gap-1">
              {onShowInfo && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={onShowInfo}
                  aria-label="Show file information"
                  title="Show file information"
                >
                  <FileText className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        <InputGroup className="h-9">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={onSearchQueryChange}
            placeholder="Search objects"
            aria-label="Search objects"
          />
        </InputGroup>

        {annotationSourceName && (
          <Field orientation="horizontal" className="rounded-sm bg-foreground/4 px-3 py-2">
            <FieldContent>
              <FieldLabel
                htmlFor="show-invalid-features"
                className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
              >
                Show errors only
              </FieldLabel>
              <FieldDescription className="text-xs text-foreground/60">
                Showing {filteredObjectCount} of {datasetFeatureCount}
              </FieldDescription>
            </FieldContent>
            <div className="flex shrink-0 self-center items-center gap-1.5">
              {showOnlyInvalidFeatures && errorCodeFilters.length > 0 && (
                <Popover>
                  <PopoverTrigger
                    render={(
                      <Button
                        size="icon"
                        variant={selectedErrorCodeCount === errorCodeFilters.length ? 'ghost' : 'outline'}
                        className="size-8"
                        aria-label="Filter validation error codes"
                        title="Filter validation error codes"
                      >
                        <Filter data-icon />
                      </Button>
                    )}
                  />
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Error codes
                        </p>
                        <p className="text-xs text-foreground/60">
                          {selectedErrorCodeCount} of {errorCodeFilters.length} selected
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={onToggleAllErrorCodeFilters}
                      >
                        {selectedErrorCodeCount === errorCodeFilters.length ? 'None' : 'All'}
                      </Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      {errorCodeFilters.map((option) => {
                        const isSelected = selectedErrorCodeSet === null || selectedErrorCodeSet.has(option.code)
                        const checkboxId = `error-code-${option.code}`

                        return (
                          <Field
                            key={option.code}
                            orientation="horizontal"
                            className="items-start rounded-sm px-2 py-1.5 transition hover:bg-foreground/5"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={isSelected}
                              onCheckedChange={() => onToggleErrorCodeFilter(option.code)}
                              className="mt-0.5"
                            />
                            <FieldLabel
                              htmlFor={checkboxId}
                              className="min-w-0 flex-1 cursor-pointer items-start font-normal"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: errorColor(option.code) }}
                                  />
                                  <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                                    code {option.code}
                                  </span>
                                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                    {option.count}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-foreground/62" title={option.description}>
                                  {option.description}
                                </p>
                              </div>
                            </FieldLabel>
                          </Field>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Switch
                id="show-invalid-features"
                checked={showOnlyInvalidFeatures}
                onCheckedChange={onShowOnlyInvalidFeaturesChange}
                className="shrink-0"
              />
            </div>
          </Field>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        {filteredFeatureItems.length > 0 ? (
          <div
            className="relative"
            style={{ height: `${rowLayout.totalHeight}px`, overflowAnchor: 'none' }}
          >
            {renderedItemIndices.map((itemIndex) => {
              const item = filteredFeatureItems[itemIndex]
              if (!item) {
                return null
              }
              const top = rowLayout.rows[itemIndex]?.top ?? FEATURE_LIST_TOP_PADDING
              const isSelected = item.feature.id === selectedFeatureId

              return (
                <div
                  key={item.feature.id}
                  className="absolute left-3 right-3"
                  style={{ top: `${top}px` }}
                >
                  <FeatureListRow
                    item={item}
                    selected={isSelected}
                    showFeatureSeparator={showFeatureSeparators}
                    activeObjectId={isSelected ? activeObjectId : null}
                    onSelectFeature={handleListSelectFeature}
                    onCenterObject={handleListCenterObject}
                    onHeightChange={handleRowHeightChange}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          !isLoading && (
            <div className="p-3 pt-2">
              <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
                No objects matched the current filter.
              </div>
            </div>
          )
        )}
      </ScrollArea>
    </>
  )
})

