import type { AttributeColorCategory, AttributeColorDomain, AttributeColorMapId, AttributeColorModel, CategoricalAttributeColorModel, ColorMapGroup } from '@/modules/colors/palettes'
import { ATTRIBUTE_COLOR_MISSING, CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT, CATEGORICAL_ATTRIBUTE_HIGH_CARDINALITY_LIMIT, CATEGORICAL_ATTRIBUTE_SINGLETON_RATIO, CATEGORICAL_COLORMAP_GROUPS, CONTINUOUS_COLORMAP_GROUPS, DEFAULT_ATTRIBUTE_COLOR_MAP_ID, QUALITATIVE_COLOR_MAPS, formatColorMapName, getColorMapPreviewBackground, getContinuousAttributeColorMapColors, normalizeHexColor, sampleColorMap } from '@/modules/colors/palettes'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Columns3Cog,
  Crosshair,
  ListTree,
  Palette,
  Pin,
  PinOff,
  Pyramid,
  Search,
  Shuffle,
  TriangleAlert,
  X
} from 'lucide-react'
import type { ReactNode } from 'react'
import { memo, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColorPicker, ColorPickerHex, ColorPickerInput } from '@/components/ui/color-picker'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { errorColor } from '@/lib/error-palette'
import { semanticSurfaceColor } from '@/lib/semantic-surface-colors'
import { cn } from '@/lib/utils'
import type {
  ViewerCityObject,
  ViewerObjectGeometry,
  ViewerSemanticSurface,
  ViewerValidationError
} from '@/types/cityjson'

import type { InfoPanelSection } from '../presentation'
import { formatContinuousInputValue, formatDimensionValue, formatValue, getVal3dityErrorUrl } from '../presentation'
import { ObjectTreeGeometrySummary } from './feature-list'

export const DetailAttributePanel = memo(function DetailAttributePanel({
  objectAttributes,
  parentObjects,
  canPinAttributes,
  canPinParentAttributes,
  pinnedAttributeKeys,
  onPinAttribute,
  onUnpinAttribute,
}: {
  objectAttributes: Record<string, unknown>
  parentObjects: ViewerCityObject[]
  canPinAttributes: boolean
  canPinParentAttributes: boolean
  pinnedAttributeKeys: string[]
  onPinAttribute: (key: string) => void
  onUnpinAttribute: (key: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="flex min-w-0 flex-col gap-2">
        {parentObjects.length > 0 && (
          <h3 className="text-xs font-medium text-muted-foreground">Object attributes</h3>
        )}
        <AttributeSection
          attributes={objectAttributes}
          emptyText="No attributes on the active object."
          canPinAttributes={canPinAttributes}
          pinnedAttributeKeys={pinnedAttributeKeys}
          onPinAttribute={onPinAttribute}
          onUnpinAttribute={onUnpinAttribute}
        />
      </section>
      {parentObjects.map((parent) => (
        <section key={parent.id} className="flex min-w-0 flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Parent attributes · {parent.type}</h3>
          <AttributeSection
            attributes={parent.attributes}
            emptyText="No attributes on this parent."
            canPinAttributes={canPinParentAttributes}
            pinnedAttributeKeys={pinnedAttributeKeys}
            onPinAttribute={onPinAttribute}
            onUnpinAttribute={onUnpinAttribute}
          />
        </section>
      ))}
    </div>
  )
})

export const DetailGeometryPanel = memo(function DetailGeometryPanel({
  geometries,
  errors,
  activeGeometryIndex,
  onCenterError,
}: {
  geometries: ViewerObjectGeometry[]
  errors: ViewerValidationError[]
  activeGeometryIndex: number | null
  onCenterError: (error: ViewerValidationError) => void
}) {
  const geometryIndexSet = new Set(geometries.map((geometry) => geometry.index))
  const errorsByGeometryIndex = new Map<number, ViewerValidationError[]>()
  const unassignedErrors: ViewerValidationError[] = []

  for (const error of errors) {
    if (error.geometryIndex != null && geometryIndexSet.has(error.geometryIndex)) {
      const geometryErrors = errorsByGeometryIndex.get(error.geometryIndex) ?? []
      geometryErrors.push(error)
      errorsByGeometryIndex.set(error.geometryIndex, geometryErrors)
      continue
    }

    unassignedErrors.push(error)
  }

  if (geometries.length === 0 && errors.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-6 text-sm text-muted-foreground">
        No geometries available for the selected object.
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-2">
      {geometries.length === 0 && (
        <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-4 py-4 text-sm text-muted-foreground">
          No geometries available for the selected object.
        </div>
      )}
      {geometries.map((geometry) => {
        const hasSemantics = geometry.semanticSurfaces.some((surface) => surface != null)
        const isActive = geometry.index === activeGeometryIndex
        const geometryErrors = errorsByGeometryIndex.get(geometry.index) ?? []
        const lodChip = {
          key: `lod:${geometry.index}:${geometry.lod ?? 'none'}`,
          label: geometry.lod ? `LoD ${geometry.lod}` : 'No LoD',
        }

        return (
          <div
            key={geometry.index}
            className="min-w-0 overflow-hidden rounded-sm"
          >
            <div
              className={cn(
                'flex min-w-0 items-start justify-between gap-3 border px-3 py-2',
                geometryErrors.length > 0 ? 'rounded-t-sm border-b-0' : 'rounded-sm',
                isActive
                  ? 'border-primary/35 bg-primary/8'
                  : 'border-foreground/8 bg-foreground/3',
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/90">
                  <Pyramid className="size-3.5 text-muted-foreground" />
                  geom {geometry.index}
                  {geometryErrors.length > 0 && (
                    <span
                      title={`${geometryErrors.length} errors`}
                      aria-label={`${geometryErrors.length} errors`}
                      className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                    >
                      <TriangleAlert className="size-3" />
                      <span>{geometryErrors.length}</span>
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{geometry.vertexIndices.length} vtx</span>
                  <span>{hasSemantics ? 'Semantics' : 'No semantics'}</span>
                </div>
              </div>
              <div className="shrink-0">
                <ObjectTreeGeometrySummary geometryTypeLabel={geometry.geometryType} chips={[lodChip]} />
              </div>
            </div>
            {geometryErrors.length > 0 && (
              <DetailValidationErrorList
                className={cn(
                  'overflow-hidden rounded-b-sm border-y border-r',
                  isActive ? 'border-primary/35' : 'border-foreground/15',
                )}
                errors={geometryErrors}
                onCenterError={onCenterError}
              />
            )}
          </div>
        )
      })}
      {unassignedErrors.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-sm">
          <div className="flex items-center gap-1.5 rounded-t-sm border border-b-0 border-destructive/25 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
            <TriangleAlert className="size-3.5" />
            <span>Other validation errors</span>
            <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px]">
              {unassignedErrors.length}
            </span>
          </div>
          <DetailValidationErrorList
            className="overflow-hidden rounded-b-sm border-y border-r border-destructive/25"
            errors={unassignedErrors}
            onCenterError={onCenterError}
          />
        </div>
      )}
    </div>
  )
})

export function DetailValidationErrorList({
  errors,
  className,
  onCenterError,
}: {
  errors: ViewerValidationError[]
  className?: string
  onCenterError: (error: ViewerValidationError) => void
}) {
  return (
    <div className={cn('min-w-0 divide-y divide-foreground/20', className)}>
      {errors.map((error, errorIndex) => (
        <DetailValidationErrorCard
          key={`${error.id}-${error.code}-${errorIndex}`}
          error={error}
          onCenterError={onCenterError}
        />
      ))}
    </div>
  )
}

export function DetailValidationErrorCard({
  error,
  onCenterError,
}: {
  error: ViewerValidationError
  onCenterError: (error: ViewerValidationError) => void
}) {
  const color = errorColor(error.code)

  return (
    <div
      className="flex w-full min-w-0 items-center gap-2 overflow-hidden px-3 py-2 text-left transition"
      style={{
        backgroundColor: `${color}12`,
        boxShadow: `inset 3px 0 ${color}a0`,
      }}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-1 size-3 shrink-0 rounded-sm"
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
        className="size-7 shrink-0 self-center"
        aria-label={`Center ${error.description}`}
        title={`Center ${error.description}`}
        onClick={() => onCenterError(error)}
      >
        <Crosshair className="size-4" />
      </Button>
    </div>
  )
}

export function AttributeSection({
  attributes,
  emptyText,
  canPinAttributes,
  pinnedAttributeKeys,
  onPinAttribute,
  onUnpinAttribute,
}: {
  attributes: Record<string, unknown>
  emptyText: string
  canPinAttributes: boolean
  pinnedAttributeKeys: string[]
  onPinAttribute: (key: string) => void
  onUnpinAttribute: (key: string) => void
}) {
  const entries = Object.entries(attributes)

  return (
    <section>
      {entries.length > 0 ? (
        <AttributeList
          attributes={attributes}
          canPinAttributes={canPinAttributes}
          pinnedAttributeKeys={pinnedAttributeKeys}
          onPinAttribute={onPinAttribute}
          onUnpinAttribute={onUnpinAttribute}
        />
      ) : (
        <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-3 py-4 text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}
    </section>
  )
}

export const AttributeList = memo(function AttributeList({
  attributes,
  canPinAttributes,
  pinnedAttributeKeys,
  onPinAttribute,
  onUnpinAttribute,
}: {
  attributes: Record<string, unknown>
  canPinAttributes: boolean
  pinnedAttributeKeys: string[]
  onPinAttribute: (key: string) => void
  onUnpinAttribute: (key: string) => void
}) {
  const pinnedAttributeSet = useMemo(
    () => (canPinAttributes ? new Set(pinnedAttributeKeys) : null),
    [canPinAttributes, pinnedAttributeKeys],
  )

  return (
    <dl className="m-0 flex min-w-0 flex-col gap-2">
      {Object.entries(attributes).map(([key, value]) => (
        <div
          key={key}
          className={cn(
            'min-w-0 w-full overflow-hidden rounded-sm border px-2.5 py-1.5 transition',
            pinnedAttributeSet?.has(key)
              ? 'border-primary/25 bg-primary/7'
              : 'border-foreground/8 bg-foreground/3',
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
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
            {canPinAttributes && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'mt-0.5 h-7 w-7 shrink-0 rounded-[3px]',
                  pinnedAttributeSet?.has(key)
                    ? 'text-primary hover:bg-primary/12 hover:text-primary'
                    : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                )}
                onClick={() => (pinnedAttributeSet?.has(key) ? onUnpinAttribute(key) : onPinAttribute(key))}
                aria-label={pinnedAttributeSet?.has(key) ? `Unpin ${key}` : `Pin ${key}`}
                title={pinnedAttributeSet?.has(key) ? `Unpin ${key}` : `Pin ${key}`}
              >
                {pinnedAttributeSet?.has(key) ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </Button>
            )}
          </div>
        </div>
      ))}
    </dl>
  )
})

export function InfoPanel({
  openSections,
  showPinnedSection,
  showAttributeSection,
  pinnedAttributes,
  pinnableAttributeOptions,
  activeAttributeColorKey,
  attributeColorModel,
  attributeColorDomain,
  attributeColorMapId,
  attributeColorMapReversed,
  attributeColorInheritsParent,
  onToggleSection,
  onPinAttribute,
  onUnpinAttribute,
  onColorAttribute,
  onColorMapChange,
  onToggleColorMapReversed,
  onInheritsParentChange,
  onDomainPreview,
  onDomainChange,
  onRerandomizeCategoricalColors,
  onCustomCategoricalColorChange,
  onClearAttributeColor,
  onClose,
}: {
  openSections: Record<InfoPanelSection, boolean>
  showPinnedSection: boolean
  showAttributeSection: boolean
  pinnedAttributes: Array<{
    key: string
    hasValue: boolean
    value: unknown
    isInherited: boolean
  }>
  pinnableAttributeOptions: Array<{
    key: string
    isInherited: boolean
  }>
  activeAttributeColorKey: string | null
  attributeColorModel: AttributeColorModel | null
  attributeColorDomain: AttributeColorDomain | null
  attributeColorMapId: AttributeColorMapId
  attributeColorMapReversed: boolean
  attributeColorInheritsParent: boolean
  onToggleSection: (section: InfoPanelSection) => void
  onPinAttribute: (key: string) => void
  onUnpinAttribute: (key: string) => void
  onColorAttribute: (key: string) => void
  onColorMapChange: (colorMapId: AttributeColorMapId) => void
  onToggleColorMapReversed: () => void
  onInheritsParentChange: (value: boolean) => void
  onDomainPreview: (domain: AttributeColorDomain) => void
  onDomainChange: (domain: AttributeColorDomain) => void
  onRerandomizeCategoricalColors: () => void
  onCustomCategoricalColorChange: (attributeKey: string, categoryKey: string, color: string) => void
  onClearAttributeColor: () => void
  onClose: () => void
}) {
  return (
    <div className="floating-panel pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-sm border">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/55 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Pinned attributes
          </p>
          <Popover>
            <PopoverTrigger
              render={(
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0 rounded-[3px] p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Configure pinned attributes"
                  title="Configure pinned attributes"
                >
                  <Columns3Cog className="size-3" />
                </Button>
              )}
            />
            <PopoverContent align="start" side="bottom" className="w-72 p-0">
              <PinnedAttributesSettingsPopover
                inheritsParent={attributeColorInheritsParent}
                onInheritsParentChange={onInheritsParentChange}
                pinnableAttributeOptions={pinnableAttributeOptions}
                onPinAttribute={onPinAttribute}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 rounded-[3px] p-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close info panel"
          title="Close info panel"
        >
          <X className="size-3" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-1.5">
          {showPinnedSection && (
            <div className={cn(showAttributeSection && 'border-b border-border/45 pb-1')}>
              <PinnedAttributesInfoSection
                pinnedAttributes={pinnedAttributes}
                activeAttributeColorKey={activeAttributeColorKey}
                onUnpinAttribute={onUnpinAttribute}
                onColorAttribute={onColorAttribute}
              />
            </div>
          )}

          {showAttributeSection && (
            <InfoPanelSectionBlock
              section="attribute"
              title="Attribute colors"
              detail={attributeColorModel?.kind ?? 'No values'}
              isOpen={openSections.attribute}
              onToggle={onToggleSection}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClearAttributeColor()
                  }}
                  aria-label="Disable attribute colors"
                  title="Disable attribute colors"
                >
                  <X className="size-3.5" />
                </Button>
              }
            >
              <AttributeColorSection
                model={attributeColorModel}
                domain={attributeColorDomain}
                colorMapId={attributeColorMapId}
                colorMapReversed={attributeColorMapReversed}
                onColorMapChange={onColorMapChange}
                onToggleColorMapReversed={onToggleColorMapReversed}
                onDomainPreview={onDomainPreview}
                onDomainChange={onDomainChange}
                onRerandomizeCategoricalColors={onRerandomizeCategoricalColors}
                onCustomCategoricalColorChange={onCustomCategoricalColorChange}
              />
            </InfoPanelSectionBlock>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export function PinnedAttributesSettingsPopover({
  inheritsParent,
  onInheritsParentChange,
  pinnableAttributeOptions,
  onPinAttribute,
}: {
  inheritsParent: boolean
  onInheritsParentChange: (value: boolean) => void
  pinnableAttributeOptions: Array<{ key: string; isInherited: boolean }>
  onPinAttribute: (key: string) => void
}) {
  const [search, setSearch] = useState('')
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return pinnableAttributeOptions
    return pinnableAttributeOptions.filter((entry) => entry.key.toLowerCase().includes(query))
  }, [pinnableAttributeOptions, search])

  return (
    <div className="flex flex-col">
      <Field orientation="horizontal" className="border-b border-border/55 px-3 py-2.5">
        <FieldContent>
          <FieldLabel htmlFor="inherit-parent-attributes" className="text-xs text-foreground/86">
            Inherited values
          </FieldLabel>
          <FieldDescription className="text-[11px]">Use parent value when missing</FieldDescription>
        </FieldContent>
        <Switch
          id="inherit-parent-attributes"
          checked={inheritsParent}
          onCheckedChange={onInheritsParentChange}
        />
      </Field>
      <div className="border-b border-border/55 p-2">
        <InputGroup className="h-8">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search attributes…"
            aria-label="Search attributes"
            className="text-xs"
            autoFocus
          />
        </InputGroup>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {filteredOptions.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {pinnableAttributeOptions.length === 0 ? 'No attributes to pin.' : 'No matches.'}
          </p>
        ) : (
          filteredOptions.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="flex w-full min-w-0 items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => onPinAttribute(entry.key)}
            >
              {entry.isInherited ? (
                <ListTree className="size-3 shrink-0 text-accent" />
              ) : (
                <Pin className="size-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[0.12em] text-foreground/82">
                {entry.key}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export function InfoPanelSectionBlock({
  section,
  title,
  detail,
  isOpen,
  action,
  onToggle,
  children,
}: {
  section: InfoPanelSection
  title: string
  detail: string
  isOpen: boolean
  action?: ReactNode
  onToggle: (section: InfoPanelSection) => void
  children: ReactNode
}) {
  return (
    <section className="rounded-sm border border-border/60 bg-foreground/3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
          onClick={() => onToggle(section)}
          aria-expanded={isOpen}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-0.5 truncate text-xs text-foreground/78">{detail}</p>
          </div>
          {isOpen ? <ChevronDown className="size-4 shrink-0" /> : <ChevronUp className="size-4 shrink-0" />}
        </button>
        {action && <div className="flex shrink-0 items-center pr-2">{action}</div>}
      </div>
      {isOpen && <div className="border-t border-border/45 p-2">{children}</div>}
    </section>
  )
}

export function SemanticSurfacePanel({
  semanticSurface,
  isOpen,
  isMobileLayout,
  onToggle,
}: {
  semanticSurface: {
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface
  }
  isOpen: boolean
  isMobileLayout: boolean
  onToggle: () => void
}) {
  const surfaceColor = semanticSurfaceColor(semanticSurface.surface.type)
  const ExpandIcon = isMobileLayout ? ChevronDown : ChevronUp
  const CollapseIcon = isMobileLayout ? ChevronUp : ChevronDown

  return (
    <div className="floating-panel pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-sm border">
      <button
        type="button"
        className="flex w-full min-w-0 shrink-0 items-center gap-2 px-3 py-2 text-left"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Semantic surface
        </p>
        <Badge
          variant="outline"
          className="min-w-0 truncate text-foreground"
          style={{
            borderColor: `${surfaceColor}66`,
            backgroundColor: `${surfaceColor}22`,
            color: surfaceColor,
          }}
        >
          {semanticSurface.surface.type}
        </Badge>
        <Badge variant="outline" className="shrink-0 border-border bg-background/60 text-muted-foreground">
          face {semanticSurface.faceIndex}
        </Badge>
        <div className="flex-1" />
        {isOpen ? <CollapseIcon className="size-4 shrink-0" /> : <ExpandIcon className="size-4 shrink-0" />}
      </button>
      {isOpen && (
        <ScrollArea className="min-h-0 flex-1 border-t border-border/45">
          <div className="p-2">
            <SemanticSurfaceInfoSection semanticSurface={semanticSurface} />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export function PinnedAttributesInfoSection({
  pinnedAttributes,
  activeAttributeColorKey,
  onUnpinAttribute,
  onColorAttribute,
}: {
  pinnedAttributes: Array<{
    key: string
    hasValue: boolean
    value: unknown
    isInherited: boolean
  }>
  activeAttributeColorKey: string | null
  onUnpinAttribute: (key: string) => void
  onColorAttribute: (key: string) => void
}) {
  return (
    <div className="grid min-w-0">
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1.45fr)_auto] items-center gap-1 border-b border-border/55 px-1.5 py-1">
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Attribute
        </div>
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Value
        </div>
        <div aria-hidden className="h-5 w-[2.625rem]" />
      </div>
      {pinnedAttributes.length > 0 ? (
        pinnedAttributes.map((entry) => {
          const isActiveColorAttribute = activeAttributeColorKey === entry.key

          return (
            <div
              key={entry.key}
              className={cn(
                'grid min-w-0 grid-cols-[minmax(0,1.25fr)_minmax(0,1.45fr)_auto] items-center gap-1 border-b border-border/35 px-1.5 py-1 last:border-b-0',
                isActiveColorAttribute && 'bg-primary/8',
              )}
            >
              <div className="flex min-w-0 items-center gap-1">
                {entry.isInherited && (
                  <ListTree
                    className="size-3 shrink-0 text-accent"
                    aria-label="Resolved from parent attribute"
                  />
                )}
                <span
                  className={cn(
                    'min-w-0 truncate font-mono text-[10px] uppercase leading-5 tracking-[0.12em]',
                    isActiveColorAttribute ? 'text-primary' : 'text-muted-foreground/78',
                  )}
                >
                  {entry.key}
                </span>
              </div>
              <div className="min-w-0 truncate text-[12px] leading-5 text-foreground/82">
                {entry.hasValue ? formatValue(entry.value) : '—'}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0 rounded-[3px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onUnpinAttribute(entry.key)}
                  aria-label={`Unpin ${entry.key}`}
                  title={`Unpin ${entry.key}`}
                >
                  <PinOff className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-5 w-5 shrink-0 rounded-[3px]',
                    isActiveColorAttribute && 'border border-primary text-primary hover:bg-primary/10 hover:text-primary',
                  )}
                  onClick={() => onColorAttribute(entry.key)}
                  aria-label={`Color objects by ${entry.key}`}
                  title={`Color objects by ${entry.key}`}
                >
                  <Palette className="size-3" />
                </Button>
              </div>
            </div>
          )
        })
      ) : (
        <div className="px-2 py-3 text-sm text-muted-foreground">
          No pinned attributes.
        </div>
      )}
    </div>
  )
}

export function SemanticSurfaceInfoSection({
  semanticSurface,
}: {
  semanticSurface: {
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface
  }
}) {
  const attributeEntries = Object.entries(semanticSurface.surface.attributes)

  if (attributeEntries.length === 0) {
    return <p className="text-sm text-muted-foreground">No semantic surface attributes.</p>
  }

  return (
    <div className="grid min-w-0">
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1.45fr)] items-center gap-1 border-b border-border/55 px-1.5 py-1">
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Attribute
        </div>
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Value
        </div>
      </div>
      {attributeEntries.map(([key, value]) => (
        <div
          key={key}
          className="grid min-w-0 grid-cols-[minmax(0,1.25fr)_minmax(0,1.45fr)] items-center gap-1 border-b border-border/35 px-1.5 py-1 last:border-b-0"
        >
          <span className="min-w-0 truncate font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-muted-foreground/78">
            {key}
          </span>
          <span className="min-w-0 truncate text-[12px] leading-5 text-foreground/82">
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ColorMapSwatch({ colorMapId, className }: { colorMapId: AttributeColorMapId; className?: string }) {
  if (colorMapId === 'random') {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-[2px] border border-border/60 bg-foreground/5 text-muted-foreground',
          className,
        )}
      >
        <Shuffle className="size-3" />
      </div>
    )
  }

  const background = getColorMapPreviewBackground(colorMapId)
  return (
    <div
      className={cn('rounded-[2px] border border-border/60 bg-foreground/5', className)}
      style={background ? { backgroundImage: background } : undefined}
    />
  )
}

export function ColorMapSelect({
  value,
  groups,
  onChange,
}: {
  value: AttributeColorMapId
  groups: readonly ColorMapGroup[]
  onChange: (colorMapId: AttributeColorMapId) => void
}) {
  return (
    <Select
      items={groups.flatMap((group) =>
        group.options.map((entry) => ({
          label: formatColorMapName(entry),
          value: entry,
        })),
      )}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue as AttributeColorMapId)
        }
      }}
    >
      <SelectTrigger
        size="lg"
        variant="surface"
        aria-label="Attribute color map"
        className="min-w-0 flex-1 px-2.5"
      >
        <SelectValue className="min-w-0">
          <ColorMapSwatch colorMapId={value} className="h-3 w-12 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">{formatColorMapName(value)}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="rounded-sm">
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel className="text-[10px] font-medium uppercase tracking-[0.14em]">
              {group.label}
            </SelectLabel>
            {group.options.map((entry) => (
              <SelectItem key={entry} value={entry} className="rounded-[3px]">
                <ColorMapSwatch colorMapId={entry} className="h-3 w-12 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{formatColorMapName(entry)}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AttributeColorSection({
  model,
  domain,
  colorMapId,
  colorMapReversed,
  onColorMapChange,
  onToggleColorMapReversed,
  onDomainPreview,
  onDomainChange,
  onRerandomizeCategoricalColors,
  onCustomCategoricalColorChange,
}: {
  model: AttributeColorModel | null
  domain: AttributeColorDomain | null
  colorMapId: AttributeColorMapId
  colorMapReversed: boolean
  onColorMapChange: (colorMapId: AttributeColorMapId) => void
  onToggleColorMapReversed: () => void
  onDomainPreview: (domain: AttributeColorDomain) => void
  onDomainChange: (domain: AttributeColorDomain) => void
  onRerandomizeCategoricalColors: () => void
  onCustomCategoricalColorChange: (attributeKey: string, categoryKey: string, color: string) => void
}) {
  const [draftDomain, setDraftDomain] = useState<AttributeColorDomain | null>(domain)
  const canAdjust = Boolean(model?.kind === 'continuous' && domain && model.continuousCount > 0)
  const rangeMin = model?.kind === 'continuous' ? model.dataMin : 0
  const rangeMax = model?.kind === 'continuous' ? model.dataMax : 1
  const rangeSpan = Math.max(rangeMax - rangeMin, 0.000001)
  const maxBinCount = Math.max(...(model?.kind === 'continuous' ? model.bins.map((bin) => bin.count) : [1]), 1)
  const visibleDomain = draftDomain?.key === domain?.key ? draftDomain : domain
  const baseColorMapColors = getContinuousAttributeColorMapColors(colorMapId)
  const colorMapColors = colorMapReversed ? [...baseColorMapColors].reverse() : baseColorMapColors
  const colorMapGroups = model?.kind === 'categorical'
    ? CATEGORICAL_COLORMAP_GROUPS
    : CONTINUOUS_COLORMAP_GROUPS
  const colorMapValue = model?.kind === 'continuous' && colorMapId === 'random'
    ? DEFAULT_ATTRIBUTE_COLOR_MAP_ID
    : colorMapId
  const canReverseColorMap = colorMapId !== 'random' && !(colorMapId in QUALITATIVE_COLOR_MAPS)

  useEffect(() => {
    setDraftDomain(domain)
  }, [domain])

  const previewDomain = (nextDomain: AttributeColorDomain) => {
    setDraftDomain(nextDomain)
    onDomainPreview(nextDomain)
  }

  const commitDomain = (nextDomain: AttributeColorDomain) => {
    setDraftDomain(nextDomain)
    onDomainPreview(nextDomain)
    onDomainChange(nextDomain)
  }

  const updateDomainMin = (value: number) => {
    if (model?.kind !== 'continuous' || !visibleDomain) return
    commitDomain({
      key: model.key,
      min: Math.min(value, visibleDomain.max),
      max: visibleDomain.max,
    })
  }

  const updateDomainMax = (value: number) => {
    if (model?.kind !== 'continuous' || !visibleDomain) return
    commitDomain({
      key: model.key,
      min: visibleDomain.min,
      max: Math.max(value, visibleDomain.min),
    })
  }

  return (
    <div className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Colormap
          </span>
          <div className="flex gap-2">
            <ColorMapSelect
              value={colorMapValue}
              groups={colorMapGroups}
              onChange={onColorMapChange}
            />
            {model?.kind === 'categorical' && colorMapId === 'random' && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                onClick={onRerandomizeCategoricalColors}
                aria-label="Rerandomize categorical colors"
                title="Rerandomize colors"
              >
                <Shuffle className="size-4" />
              </Button>
            )}
            {canReverseColorMap && (
              <Button
                type="button"
                variant={colorMapReversed ? 'default' : 'outline'}
                size="icon"
                className="size-9 shrink-0"
                onClick={onToggleColorMapReversed}
                aria-pressed={colorMapReversed}
                aria-label="Reverse colormap"
                title="Reverse colormap"
              >
                <ArrowLeftRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {model?.kind === 'categorical' ? (
          <CategoricalAttributeColorSection
            model={model}
            isEditableRandomMap={colorMapId === 'random'}
            onCustomColorChange={onCustomCategoricalColorChange}
          />
        ) : model?.kind === 'continuous' && canAdjust && domain && visibleDomain ? (
          <>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{model.continuousCount} colored</span>
                <span>{model.missingCount} missing</span>
              </div>
              <div className="flex h-24 items-end gap-1 rounded-sm border border-border/60 bg-foreground/3 p-2">
                {model.bins.map((bin, index) => {
                  const isInsideDomain = bin.end >= visibleDomain.min && bin.start <= visibleDomain.max
                  const binCenter = (bin.start + bin.end) / 2
                  const colorT = (binCenter - visibleDomain.min) / Math.max(visibleDomain.max - visibleDomain.min, 0.000001)
                  return (
                    <div
                      key={`${bin.start}-${bin.end}-${index}`}
                      className="min-w-0 flex-1 rounded-[2px] transition-opacity"
                      style={{
                        height: `${Math.max((bin.count / maxBinCount) * 100, bin.count > 0 ? 4 : 0)}%`,
                        backgroundColor: sampleColorMap(colorMapColors, colorT),
                        opacity: isInsideDomain ? 0.95 : 0.22,
                      }}
                      title={`${formatDimensionValue(bin.start)} - ${formatDimensionValue(bin.end)}: ${bin.count}`}
                    />
                  )
                })}
              </div>
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-muted-foreground">
                <span>{formatDimensionValue(rangeMin)}</span>
                <span>{formatDimensionValue(rangeMax)}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-2 py-1">
                <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Min</span>
                  <span>Max</span>
                </div>
                <Slider
                  min={rangeMin}
                  max={rangeMax}
                  step={rangeSpan / 200}
                  value={[visibleDomain.min, visibleDomain.max]}
                  minStepsBetweenValues={0}
                  onValueChange={(value) => {
                    const [nextMin, nextMax] = value as readonly number[]
                    if (nextMin == null || nextMax == null) return
                    previewDomain({
                      key: model.key,
                      min: Math.min(nextMin, nextMax),
                      max: Math.max(nextMin, nextMax),
                    })
                  }}
                  onValueCommitted={(value) => {
                    const [nextMin, nextMax] = value as readonly number[]
                    if (nextMin == null || nextMax == null) return
                    commitDomain({
                      key: model.key,
                      min: Math.min(nextMin, nextMax),
                      max: Math.max(nextMin, nextMax),
                    })
                  }}
                  aria-label="Attribute color range"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={formatContinuousInputValue(visibleDomain.min)}
                  onChange={(event) => updateDomainMin(Number(event.target.value))}
                  aria-label="Attribute color minimum"
                />
                <Input
                  type="number"
                  value={formatContinuousInputValue(visibleDomain.max)}
                  onChange={(event) => updateDomainMax(Number(event.target.value))}
                  aria-label="Attribute color maximum"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-3 py-4 text-sm text-muted-foreground">
            The selected pinned attribute has no numeric values to color.
          </div>
        )}
    </div>
  )
}

export function CategoricalAttributeColorSection({
  model,
  isEditableRandomMap,
  onCustomColorChange,
}: {
  model: CategoricalAttributeColorModel
  isEditableRandomMap: boolean
  onCustomColorChange: (attributeKey: string, categoryKey: string, color: string) => void
}) {
  const sortedCategories = model.categories.toSorted((left, right) =>
    right.count - left.count || left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  )
  const singletonCount = model.categories.filter((category) => category.count === 1).length
  const singletonRatio = model.categories.length > 0 ? singletonCount / model.categories.length : 0
  const isHighCardinality =
    model.categories.length > CATEGORICAL_ATTRIBUTE_HIGH_CARDINALITY_LIMIT ||
    (
      model.categories.length > CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT &&
      singletonRatio >= CATEGORICAL_ATTRIBUTE_SINGLETON_RATIO
    )
  const repeatedCategories = sortedCategories.filter((category) => category.count > 1)

  if (isHighCardinality) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{model.valueCount} colored</span>
          <span>{model.missingCount} missing</span>
        </div>
        <div className="rounded-sm border border-border/60 bg-foreground/3 px-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="font-mono text-sm text-foreground">{model.categories.length}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">unique</p>
            </div>
            <div>
              <p className="font-mono text-sm text-foreground">{singletonCount}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">single</p>
            </div>
            <div>
              <p className="font-mono text-sm text-foreground">{repeatedCategories.length}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">repeated</p>
            </div>
          </div>
        </div>
        {repeatedCategories.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Top repeated values
            </p>
            <CategoryLegend
              attributeKey={model.key}
              categories={repeatedCategories.slice(0, 8)}
              isEditable={isEditableRandomMap}
              onCustomColorChange={onCustomColorChange}
            />
          </div>
        ) : (
          <div className="rounded-sm border border-dashed border-border bg-foreground/3 px-3 py-2 text-xs text-muted-foreground">
            High-cardinality categorical attribute: colors are assigned per value, but the chart is hidden because most values are unique.
          </div>
        )}
      </div>
    )
  }

  const visibleCategories = sortedCategories.slice(0, CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT)
  const hiddenCategories = sortedCategories.slice(CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT)
  const hiddenCount = hiddenCategories.reduce((sum, category) => sum + category.count, 0)
  const displayCategories: AttributeColorCategory[] = hiddenCategories.length > 0
    ? [
        ...visibleCategories.slice(0, Math.max(CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT - 1, 0)),
        {
          key: '__other__',
          label: `Other (${hiddenCategories.length} values)`,
          count: hiddenCount,
          color: ATTRIBUTE_COLOR_MISSING,
          index: -1,
        },
      ]
    : visibleCategories
  const maxCategoryCount = Math.max(...displayCategories.map((category) => category.count), 1)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>{model.valueCount} colored</span>
        <span>{model.categories.length} unique / {model.missingCount} missing</span>
      </div>
      <div className="flex h-24 items-end gap-1 rounded-sm border border-border/60 bg-foreground/3 p-2">
        {displayCategories.map((category) => (
          <div
            key={category.key}
            className="min-w-0 flex-1 rounded-[2px]"
            style={{
              height: `${Math.max((category.count / maxCategoryCount) * 100, category.count > 0 ? 4 : 0)}%`,
              backgroundColor: category.color,
            }}
            title={`${category.label}: ${category.count}`}
          />
        ))}
      </div>
      <CategoryLegend
        attributeKey={model.key}
        categories={displayCategories}
        isEditable={isEditableRandomMap}
        onCustomColorChange={onCustomColorChange}
      />
    </div>
  )
}

export function CategoryLegend({
  attributeKey,
  categories,
  isEditable,
  onCustomColorChange,
}: {
  attributeKey: string
  categories: AttributeColorCategory[]
  isEditable: boolean
  onCustomColorChange: (attributeKey: string, categoryKey: string, color: string) => void
}) {
  return (
    <div className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1">
      {categories.map((category) => (
        <div key={category.key} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
          {isEditable && category.index >= 0 ? (
            <CategoryColorPicker
              color={category.color}
              label={category.label}
              onChange={(color) => onCustomColorChange(attributeKey, category.key, color)}
            />
          ) : (
            <span
              className="size-3 rounded-[2px]"
              style={{ backgroundColor: category.color }}
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 truncate text-foreground/82" title={category.label}>
            {category.label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">{category.count}</span>
        </div>
      ))}
    </div>
  )
}

export function CategoryColorPicker({
  color,
  label,
  onChange,
}: {
  color: string
  label: string
  onChange: (color: string) => void
}) {
  const normalizedColor = normalizeHexColor(color)

  return (
    <Popover>
      <PopoverTrigger
        render={(
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-4 shrink-0 rounded-[2px] border-border p-0"
            style={{ backgroundColor: normalizedColor }}
            aria-label={`Set color for ${label}`}
            title={`Set color for ${label}`}
          >
            <span className="sr-only">Set color</span>
          </Button>
        )}
      />
      <PopoverContent align="start" side="right" className="w-fit p-2">
        <ColorPicker>
          <ColorPickerHex color={normalizedColor} onChange={onChange} />
          <ColorPickerInput
            value={normalizedColor}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`Hex color for ${label}`}
          />
        </ColorPicker>
      </PopoverContent>
    </Popover>
  )
}

