import { Pyramid } from 'lucide-react'
import materialIconUrl from '@/assets/blender-icons/material.svg'
import { MaskIcon } from '@/components/ui/mask-icon'
import {
  ArrowDown, Box, Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  CircleX,
  Copy,
  ExternalLink,
  Link2,
  Link2Off, Palette, Pin,
  RotateCcw,
  RotateCw,
  Ruler,
  SquareMousePointer
} from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import cubeIconUrl from '@/assets/blender-icons/cube.svg'
import editModeIconUrl from '@/assets/blender-icons/editmode_hlt.svg'
import faceSelectIconUrl from '@/assets/blender-icons/facesel.svg'
import objectOriginIconUrl from '@/assets/blender-icons/object_origin.svg'
import pointcloudPointIconUrl from '@/assets/blender-icons/pointcloud_point.svg'
import trackerIconUrl from '@/assets/blender-icons/tracker.svg'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  CAMERA_FOCAL_LENGTH_MIN,
  ORTHOGRAPHIC_CAMERA_VALUE,
  isOrthographicCameraValue,
} from '@/lib/camera'
import {
  getGeometryDisplayModeKey
} from '@/lib/object-geometry'
import { semanticSurfaceColor } from '@/lib/semantic-surface-colors'
import { cn } from '@/lib/utils'
import type {
  Vec3,
  ViewerAppearanceMode,
  ViewerGeometryDisplayMode,
  ViewerPickingMode
} from '@/types/cityjson'

import type { HelpItem, MobileInspectMode } from '../presentation'
import { APP_VERSION, VIEWER_APPEARANCE_MODES, formatDistanceValue, getAppearanceModeLabel, getAvailablePickingModes, getPickingModeIconUrl, getPickingModeLabel } from '../presentation'

export function EditSelectionOverlay({
  positionClassName,
  selectedFaceIndex,
  selectedFaceRingCount,
  selectedFaceRingLabel,
  selectedFaceRingIsHole,
  selectedFaceVertexCount,
  selectedFaceVertexEntryLabel,
  selectedFaceHoleCount,
  selectedFaceSemanticType,
  onCycleSelectedFaceRing,
  onCycleSelectedFaceVertex,
}: {
  positionClassName: string
  selectedFaceIndex: number | null
  selectedFaceRingCount: number
  selectedFaceRingLabel: string
  selectedFaceRingIsHole: boolean
  selectedFaceVertexCount: number
  selectedFaceVertexEntryLabel: string | null
  selectedFaceHoleCount: number
  selectedFaceSemanticType: string | null
  onCycleSelectedFaceRing: (direction: -1 | 1) => void
  onCycleSelectedFaceVertex: (direction: -1 | 1) => void
}) {
  const semanticColor = selectedFaceSemanticType ? semanticSurfaceColor(selectedFaceSemanticType) : null

  return (
    <div className={cn('pointer-events-none absolute z-10', positionClassName)}>
      <div className="floating-panel pointer-events-auto flex flex-col gap-2 rounded-sm border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {selectedFaceIndex != null ? `Face ${selectedFaceIndex}` : 'No face selected'}
            </Badge>
            {selectedFaceSemanticType && semanticColor && (
              <Badge
                variant="outline"
                className="min-w-0 truncate"
                style={{
                  borderColor: `${semanticColor}66`,
                  backgroundColor: `${semanticColor}22`,
                  color: semanticColor,
                }}
              >
                {selectedFaceSemanticType}
              </Badge>
            )}
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={() => onCycleSelectedFaceRing(-1)}
                disabled={selectedFaceHoleCount === 0}
                aria-label="Previous ring"
                title="Previous ring"
              >
                Previous ring
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={() => onCycleSelectedFaceRing(1)}
                disabled={selectedFaceHoleCount === 0}
                aria-label="Next ring"
                title="Next ring"
              >
                Next ring (R)
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={() => onCycleSelectedFaceVertex(-1)}
                disabled={selectedFaceVertexCount === 0}
              >
                {selectedFaceRingIsHole ? <RotateCcw className="size-3.5" /> : <RotateCw className="size-3.5" />}
                Previous vertex (J)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={() => onCycleSelectedFaceVertex(1)}
                disabled={selectedFaceVertexCount === 0}
              >
                {selectedFaceRingIsHole ? <RotateCw className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                Next vertex (K)
              </Button>
            </div>
          </div>
      </div>
    </div>
  )
}

export function MobileViewportToolbar({
  showObjectExtents,
  onToggleObjectExtents,
  hasSelectedFeature,
  appearanceMode,
  colormapAvailable,
  mobileInspectMode,
  onCycleAppearanceMode,
  onSelectAppearanceMode,
  onToggleMobileInspectMode,
  onCenterCurrentSelection,
}: {
  showObjectExtents: boolean
  onToggleObjectExtents: () => void
  hasSelectedFeature: boolean
  appearanceMode: ViewerAppearanceMode
  colormapAvailable: boolean
  mobileInspectMode: MobileInspectMode
  onCycleAppearanceMode: () => void
  onSelectAppearanceMode: (mode: ViewerAppearanceMode) => void
  onToggleMobileInspectMode: () => void
  onCenterCurrentSelection: () => void
}) {
  const [isAppearanceMenuOpen, setIsAppearanceMenuOpen] = useState(false)
  const showSemanticSurfaces = appearanceMode === 'semantic'

  return (
    <div className="floating-panel pointer-events-auto flex flex-col items-center gap-1 rounded-sm border p-1">
      <ToolbarAppearanceButton
        mode={appearanceMode}
        colormapAvailable={colormapAvailable}
        onClick={onCycleAppearanceMode}
        onSelectMode={onSelectAppearanceMode}
        isMenuOpen={isAppearanceMenuOpen}
        onMenuOpenChange={setIsAppearanceMenuOpen}
      />
      <ToolbarToggleButton
        active={showObjectExtents}
        onClick={onToggleObjectExtents}
        ariaLabel="Toggle geographical extents"
        icon={<Box />}
      >
        Geographical extents
      </ToolbarToggleButton>
      {showSemanticSurfaces && (
        <ToolbarToggleButton
          active={mobileInspectMode === 'surface'}
          onClick={onToggleMobileInspectMode}
          ariaLabel={
            mobileInspectMode === 'surface'
              ? 'Switch to object selection'
              : 'Switch to surface selection'
          }
          iconSrc={faceSelectIconUrl}
        >
          {mobileInspectMode === 'surface' ? 'Surface selection' : 'Object selection'}
        </ToolbarToggleButton>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={!hasSelectedFeature}
        onClick={onCenterCurrentSelection}
        aria-label="Center current selection"
        title="Center current selection"
      >
        <MaskIcon src={trackerIconUrl} className="size-3.5" />
      </Button>
    </div>
  )
}

export function VersionButton({
  className,
  onClick,
}: {
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-sm px-0.5 py-0 font-mono text-[10px] font-medium leading-none text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      )}
      onClick={onClick}
      aria-label={`Open changelog for version ${APP_VERSION}`}
      title={`CJLoupe ${APP_VERSION} changelog`}
    >
      v{APP_VERSION}
    </button>
  )
}

export function DesktopViewportToolbar({
  showObjectExtents,
  onToggleObjectExtents,
  editMode,
  xrayActive,
  xrayDisabled,
  hasSelectedFeature,
  appearanceMode,
  colormapAvailable,
  pickingMode,
  measurementActive,
  showVertexGizmo,
  hasSelectedVertex,
  isolateSelectedFeature,
  showTooltips,
  onToggleEditMode,
  onCyclePickingMode,
  onToggleMeasurement,
  onToggleVertexGizmo,
  onToggleXray,
  onCycleAppearanceMode,
  onSelectAppearanceMode,
  onToggleIsolateSelectedFeature,
  onSelectPickingMode,
  onCenterCurrentSelection,
  onRestoreGeometry,
  restoreGeometryDisabled,
  onClearSelection,
}: {
  showObjectExtents: boolean
  onToggleObjectExtents: () => void
  editMode: boolean
  xrayActive: boolean
  xrayDisabled: boolean
  hasSelectedFeature: boolean
  appearanceMode: ViewerAppearanceMode
  colormapAvailable: boolean
  pickingMode: ViewerPickingMode
  measurementActive: boolean
  showVertexGizmo: boolean
  hasSelectedVertex: boolean
  isolateSelectedFeature: boolean
  showTooltips: boolean
  onToggleEditMode: () => void
  onCyclePickingMode: () => void
  onToggleMeasurement: () => void
  onToggleVertexGizmo: () => void
  onToggleXray: () => void
  onCycleAppearanceMode: () => void
  onSelectAppearanceMode: (mode: ViewerAppearanceMode) => void
  onToggleIsolateSelectedFeature: () => void
  onSelectPickingMode: (mode: ViewerPickingMode) => void
  onCenterCurrentSelection: () => void
  onRestoreGeometry: () => void
  restoreGeometryDisabled: boolean
  onClearSelection: () => void
}) {
  const [isPickingMenuOpen, setIsPickingMenuOpen] = useState(false)
  const [isAppearanceMenuOpen, setIsAppearanceMenuOpen] = useState(false)
  const tooltipsVisible = showTooltips && !isPickingMenuOpen && !isAppearanceMenuOpen

  return (
    <div className="floating-panel pointer-events-auto flex flex-col items-center gap-1 rounded-sm border p-1">
      {hasSelectedFeature && (
        <div className="floating-chip flex flex-col items-center gap-1 rounded-sm border p-1">
          <ViewportControlTooltip
          show={tooltipsVisible}
          label={editMode ? 'Exit inspect' : 'Inspect'}
          hotkey="Tab"
        >
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-7',
              editMode
                ? 'border border-primary/35 bg-primary/14 text-primary hover:bg-primary/18 hover:text-primary'
                : 'text-muted-foreground hover:bg-accent/8 hover:text-foreground',
            )}
            onClick={onToggleEditMode}
            aria-label={editMode ? 'Exit inspect mode' : 'Enter inspect mode'}
            title={editMode ? 'Exit inspect' : 'Inspect'}
          >
            <MaskIcon src={editModeIconUrl} className="size-3.5" />
          </Button>
        </ViewportControlTooltip>
        <ToolbarToggleButton
          active={showVertexGizmo}
          disabled={!editMode || !hasSelectedVertex}
          onClick={onToggleVertexGizmo}
          ariaLabel="Toggle move vertex"
          iconSrc={objectOriginIconUrl}
          showTooltip={tooltipsVisible}
          tooltipHotkey="G"
        >
          Move vertex
        </ToolbarToggleButton>
        <ToolbarToggleButton
          active={xrayActive}
          disabled={xrayDisabled}
          onClick={onToggleXray}
          ariaLabel="Toggle xray view for edit mode"
          iconSrc={cubeIconUrl}
          showTooltip={tooltipsVisible}
          tooltipHotkey="X"
        >
          Xray
        </ToolbarToggleButton>
      </div>
      )}
      <ToolbarAppearanceButton
        mode={appearanceMode}
        colormapAvailable={colormapAvailable}
        onClick={onCycleAppearanceMode}
        onSelectMode={onSelectAppearanceMode}
        showTooltip={tooltipsVisible}
        isMenuOpen={isAppearanceMenuOpen}
        onMenuOpenChange={setIsAppearanceMenuOpen}
      />
      <ToolbarToggleButton
        active={showObjectExtents}
        onClick={onToggleObjectExtents}
        ariaLabel="Toggle geographical extents"
        icon={<Box />}
        showTooltip={tooltipsVisible}
      >
        Geographical extents
      </ToolbarToggleButton>
      <ToolbarPickingButton
        mode={pickingMode}
        editMode={editMode}
        onClick={onCyclePickingMode}
        onSelectMode={onSelectPickingMode}
        showTooltip={tooltipsVisible}
        isMenuOpen={isPickingMenuOpen}
        onMenuOpenChange={setIsPickingMenuOpen}
      />
      <ToolbarToggleButton
        active={measurementActive}
        onClick={onToggleMeasurement}
        ariaLabel="Toggle distance measurement"
        icon={<Ruler className="size-3.5" />}
        showTooltip={tooltipsVisible}
      >
        Measure distance
      </ToolbarToggleButton>
      {hasSelectedFeature && (
        <>
          <ToolbarToggleButton
            active={isolateSelectedFeature}
            onClick={onToggleIsolateSelectedFeature}
            ariaLabel="Toggle isolate selected feature"
            iconSrc={pointcloudPointIconUrl}
            showTooltip={tooltipsVisible}
            tooltipHotkey="I"
          >
            Isolate
          </ToolbarToggleButton>
          <ViewportControlTooltip show={tooltipsVisible} label="Clear selection">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onClearSelection}
              aria-label="Clear selection"
              title="Clear selection"
            >
              <CircleX className="size-3.5" />
            </Button>
          </ViewportControlTooltip>
          <ViewportControlTooltip show={tooltipsVisible} label="Center" hotkey="C">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onCenterCurrentSelection}
              aria-label="Center current selection"
              title="Center current selection"
            >
              <MaskIcon src={trackerIconUrl} className="size-3.5" />
            </Button>
          </ViewportControlTooltip>
          <ViewportControlTooltip show={tooltipsVisible} label="Reset geometry" hotkey="U">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={restoreGeometryDisabled}
              onClick={onRestoreGeometry}
              aria-label="Reset feature geometry"
              title="Reset feature geometry"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </ViewportControlTooltip>
        </>
      )}
    </div>
  )
}

export function DesktopViewportStatusBar({
  isPinnedAttributesOpen,
  pinnedAttributeCount,
  isPaneCollapsed,
  activeObjectId,
  viewportCenter,
  measurementActive,
  measurementPointCount,
  measurementDistance,
  selectedVertexIndex,
  cameraFocalLength,
  onCameraFocalLengthChange,
  onSetTopDownView,
  onSetCenter,
  onTogglePinnedAttributesOpen,
  cameraFollowerActive,
  isCameraFollower,
  onOpenCameraFollower,
  onBreakCameraFollow,
}: {
  isPinnedAttributesOpen: boolean
  pinnedAttributeCount: number
  isPaneCollapsed: boolean
  activeObjectId: string | null
  viewportCenter: Vec3 | null
  measurementActive: boolean
  measurementPointCount: number
  measurementDistance: number | null
  selectedVertexIndex: number | null
  cameraFocalLength: number
  onCameraFocalLengthChange: (value: number) => void
  onSetTopDownView: () => void
  onSetCenter: (center: Vec3) => void
  onTogglePinnedAttributesOpen: () => void
  cameraFollowerActive: boolean
  isCameraFollower: boolean
  onOpenCameraFollower: () => void
  onBreakCameraFollow: () => void
}) {
  const [didCopyObjectId, setDidCopyObjectId] = useState(false)
  const isOrthographicCamera = isOrthographicCameraValue(cameraFocalLength)

  useEffect(() => {
    if (!didCopyObjectId) {
      return
    }

    const timeout = window.setTimeout(() => {
      setDidCopyObjectId(false)
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [didCopyObjectId])

  return (
    <div className="floating-panel pointer-events-auto flex h-8 items-center justify-between gap-2 overflow-visible border border-x-0 border-b-0 px-1.5">
      <div className="flex min-w-0 items-center gap-1.5 overflow-visible">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'relative size-6 shrink-0 rounded-[3px] p-0',
            isPinnedAttributesOpen
              ? 'bg-primary/10 text-primary hover:bg-primary/14 hover:text-primary'
              : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
          )}
          onClick={onTogglePinnedAttributesOpen}
          aria-label={isPinnedAttributesOpen ? 'Hide info panel' : 'Show info panel'}
          aria-expanded={isPinnedAttributesOpen}
          title={isPinnedAttributesOpen ? 'Hide info panel' : 'Show info panel'}
        >
          <Pin  className="size-3" />
          {pinnedAttributeCount > 0 && (
            <span className="absolute right-0 top-0 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-semibold leading-none text-primary-foreground">
              {pinnedAttributeCount}
            </span>
          )}
        </Button>
        {isPaneCollapsed && (
          <Badge
            variant="outline"
            className="h-6 min-w-0 max-w-[min(16rem,30vw)] gap-1 overflow-visible border-primary/25 bg-primary/10 px-1.5 py-0 text-[10px] text-primary"
          >
            <SquareMousePointer className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{activeObjectId ?? 'No object'}</span>
            {activeObjectId && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-4.5 shrink-0 rounded-[3px] p-0 text-primary hover:bg-primary/12 hover:text-primary"
                aria-label={`Copy full object ID ${activeObjectId}`}
                title={didCopyObjectId ? 'Copied full object ID' : `Copy full object ID: ${activeObjectId}`}
                onClick={() => {
                  void navigator.clipboard.writeText(activeObjectId).then(() => {
                    setDidCopyObjectId(true)
                  })
                }}
              >
                {didCopyObjectId ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
              </Button>
            )}
          </Badge>
        )}
        <div className="flex h-6 min-w-0 items-center gap-1 overflow-hidden rounded-sm border border-border/70 bg-background/35 px-1.5 font-mono text-[10px] text-muted-foreground">
          <ViewportCenterEditor center={viewportCenter} onChange={onSetCenter} />
          {selectedVertexIndex != null && (
            <span className="shrink-0 text-foreground/75">[vtx {selectedVertexIndex}]</span>
          )}
          {measurementActive && (
            <span className="shrink-0 border-l border-border/70 pl-1 text-foreground/75">
              {measurementDistance != null
                ? `distance ${formatDistanceValue(measurementDistance)}`
                : measurementPointCount === 1
                  ? 'measure: click second point'
                  : 'measure: click first point'}
            </span>
          )}
        </div>
      </div>
      <div className="flex h-6 shrink-0 items-center gap-1">
        <div className="floating-chip flex h-6 shrink-0 items-center gap-1.5 rounded-sm border px-1.5">
          <Camera className="size-3 text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {isOrthographicCamera ? 'Ortho' : `${cameraFocalLength}mm`}
          </span>
          <input
            type="range"
            min={CAMERA_FOCAL_LENGTH_MIN}
            max={ORTHOGRAPHIC_CAMERA_VALUE}
            step={1}
            value={cameraFocalLength}
            onChange={(event) => onCameraFocalLengthChange(Number(event.target.value))}
            className="slider-accent h-2 w-20 cursor-pointer appearance-none rounded-none bg-input"
            aria-label="Camera projection and focal length"
            aria-valuetext={isOrthographicCamera ? 'Orthographic' : `${cameraFocalLength} millimeters`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 shrink-0 rounded-[3px] p-0"
            disabled={!viewportCenter}
            onClick={onSetTopDownView}
            aria-label="Set top-down view"
            title="Top-down view"
          >
            <ArrowDown className="size-3" />
          </Button>
        </div>
        <CameraFollowStatusButton
          isFollower={isCameraFollower}
          active={cameraFollowerActive}
          onOpenFollower={onOpenCameraFollower}
          onBreakFollow={onBreakCameraFollow}
        />
      </div>
    </div>
  )
}

export function CameraFollowStatusButton({
  isFollower,
  active,
  onOpenFollower,
  onBreakFollow,
}: {
  isFollower: boolean
  active: boolean
  onOpenFollower: () => void
  onBreakFollow: () => void
}) {
  const label = isFollower ? 'Break camera follow' : 'Open synced viewport tab'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'group size-6 shrink-0 rounded-[3px] border p-0',
        isFollower || active
          ? 'border-primary/35 bg-primary/10 text-primary hover:bg-primary/14 hover:text-primary'
          : 'border-border/70 bg-background/35 text-muted-foreground hover:bg-accent/8 hover:text-foreground',
      )}
      onClick={isFollower ? onBreakFollow : onOpenFollower}
      aria-label={label}
      aria-pressed={isFollower || active}
      title={label}
    >
      {isFollower ? (
        <>
          <Link2 className="size-3 group-hover:hidden" />
          <Link2Off className="hidden size-3 group-hover:block" />
        </>
      ) : (
        <ExternalLink className="size-3" />
      )}
    </Button>
  )
}

const VIEWPORT_CENTER_AXES = ['x', 'y', 'z'] as const

export function ViewportCenterEditor({
  center,
  onChange,
}: {
  center: Vec3 | null
  onChange: (center: Vec3) => void
}) {
  const [draft, setDraft] = useState<Record<(typeof VIEWPORT_CENTER_AXES)[number], string> | null>(null)
  const values = useMemo(() => ({
    x: center?.[0].toFixed(3) ?? '',
    y: center?.[1].toFixed(3) ?? '',
    z: center?.[2].toFixed(3) ?? '',
  }), [center])
  const displayedValues = draft ?? values

  const commit = useCallback(() => {
    const nextCenter = VIEWPORT_CENTER_AXES.map((axis) => Number.parseFloat(displayedValues[axis])) as Vec3
    setDraft(null)
    if (nextCenter.every(Number.isFinite)) {
      onChange(nextCenter)
    }
  }, [displayedValues, onChange])

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onFocus={() => setDraft((current) => current ?? values)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          commit()
        }
      }}
    >
      <span className="shrink-0 text-foreground/75">center</span>
      {VIEWPORT_CENTER_AXES.map((axis) => (
        <input
          key={axis}
          type="text"
          inputMode="decimal"
          value={displayedValues[axis]}
          onChange={(event) => setDraft((current) => ({ ...(current ?? values), [axis]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              setDraft(null)
            }
          }}
          className="w-16 min-w-0 bg-transparent text-center outline-none placeholder:text-muted-foreground/50"
          placeholder="-"
          aria-label={`Center ${axis.toUpperCase()} coordinate`}
        />
      ))}
    </div>
  )
}

export function ViewportHelpPanel({
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
          <div id="viewport-help-panel" className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Hotkeys
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </div>

            <div className="grid gap-1.5">
              {helpItems.map((hotkey) => (
                <div key={hotkey.keys} className="flex items-center justify-between gap-3">
                  <Kbd className="shrink-0">{hotkey.keys}</Kbd>
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

export function ViewportGeometryModeBar({
  geometryDisplayMode,
  availableLods,
  showTooltips = false,
  onSelectGeometryDisplayMode,
}: {
  geometryDisplayMode: ViewerGeometryDisplayMode
  availableLods: string[]
  showTooltips?: boolean
  onSelectGeometryDisplayMode: (mode: ViewerGeometryDisplayMode) => void
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const modeKey = getGeometryDisplayModeKey(geometryDisplayMode)
  const modes: Array<{ key: string; label: string; mode: ViewerGeometryDisplayMode }> = [
    { key: 'best', label: 'Best', mode: { kind: 'best' } },
    ...availableLods.map((lod) => ({
      key: `lod:${lod}`,
      label: lod,
      mode: { kind: 'lod', lod } satisfies ViewerGeometryDisplayMode,
    })),
  ]
  const activeMode = modes.find((entry) => entry.key === modeKey) ?? modes[0]

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <ViewportControlTooltip show={showTooltips && !isMenuOpen} label="LoD" hotkey="L">
        <DropdownMenuTrigger
          render={(
            <Button
              type="button"
              variant="ghost"
              className="floating-panel pointer-events-auto gap-2 rounded-sm border px-2 font-mono"
              aria-label={`Choose level of detail, currently ${activeMode.label}`}
              title={`LoD: ${activeMode.label}`}
            />
          )}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="text-[9px] leading-none uppercase tracking-[0.16em] text-muted-foreground">LoD</span>
            <span className="text-[11px] leading-none">{activeMode.label}</span>
          </span>
          <ChevronDown
            data-icon="inline-end"
            className={cn('transition-transform', isMenuOpen && 'rotate-180')}
          />
        </DropdownMenuTrigger>
      </ViewportControlTooltip>
      <DropdownMenuContent side="top" align="end" className="min-w-28 rounded-sm">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={modeKey}
            onValueChange={(value) => {
              const selectedMode = modes.find((entry) => entry.key === value)
              if (selectedMode) {
                onSelectGeometryDisplayMode(selectedMode.mode)
              }
            }}
          >
            {modes.map((entry) => (
              <DropdownMenuRadioItem
                key={entry.key}
                value={entry.key}
                className="h-8 rounded-sm text-xs"
              >
                {entry.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ViewportControlTooltip({
  show,
  label,
  hotkey,
  children,
}: {
  show: boolean
  label: string
  hotkey?: string
  children: ReactElement
}) {
  return (
    <TooltipProvider>
      <Tooltip open={show}>
        <TooltipTrigger render={children} />
        <TooltipContent side="left">
          <span className="inline-flex items-center gap-2">
            <span>{label}</span>
            {hotkey && (
              <Kbd className="h-4 border-primary-foreground/25 bg-primary-foreground/15 px-1 text-[9px] text-primary-foreground">
                {hotkey}
              </Kbd>
            )}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ToolbarToggleButton({
  active,
  disabled = false,
  onClick,
  children,
  ariaLabel,
  iconSrc,
  icon,
  showTooltip = false,
  tooltipHotkey,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  ariaLabel: string
  iconSrc?: string
  icon?: ReactNode
  showTooltip?: boolean
  tooltipHotkey?: string
}) {
  const label = typeof children === 'string' ? children : ariaLabel

  return (
    <ViewportControlTooltip show={showTooltip} label={label} hotkey={tooltipHotkey}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        title={label}
        className={cn(
          'size-7 justify-center rounded-sm border p-0',
          active
            ? 'border-primary/35 bg-primary/14 text-primary hover:bg-primary/18 hover:text-primary'
            : 'border-border/70 bg-background/35 text-muted-foreground hover:bg-accent/8 hover:text-foreground',
          disabled && 'border-border/45 bg-transparent text-muted-foreground/45 hover:bg-transparent hover:text-muted-foreground/45',
        )}
      >
        {icon ?? (iconSrc ? (
          <MaskIcon src={iconSrc} className="size-3.5" />
        ) : (
          <span className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/45')} />
        ))}
      </Button>
    </ViewportControlTooltip>
  )
}

export function ToolbarPickingButton({
  mode,
  editMode,
  onClick,
  onSelectMode,
  showTooltip = false,
  isMenuOpen,
  onMenuOpenChange,
}: {
  mode: ViewerPickingMode
  editMode: boolean
  onClick: () => void
  onSelectMode: (mode: ViewerPickingMode) => void
  showTooltip?: boolean
  isMenuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
}) {
  const active = mode !== 'none'
  const iconSrc = getPickingModeIconUrl(mode)
  const availableModes = getAvailablePickingModes(editMode)
  const activeClassName = active
    ? 'border-primary/35 bg-primary/14 text-primary hover:bg-primary/18 hover:text-primary'
    : 'border-border/70 bg-background/35 text-muted-foreground hover:bg-accent/8 hover:text-foreground'

  return (
    <ViewportControlTooltip show={showTooltip} label="Picking mode" hotkey="0-3">
      <div className="inline-flex">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={`Cycle picking mode, currently ${getPickingModeLabel(mode).toLowerCase()}`}
          title={`Pick: ${getPickingModeLabel(mode)}`}
          className={cn('size-7 justify-center rounded-r-none border p-0', activeClassName)}
        >
          <MaskIcon src={iconSrc} className="size-3.5" />
        </Button>
        <DropdownMenu open={isMenuOpen} onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger
            render={(
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Choose picking mode"
                title="Choose picking mode"
                className={cn('h-7 w-5 justify-center rounded-l-none border border-l-0 p-0', activeClassName)}
              >
                <ChevronDown className={cn('size-3 transition-transform', isMenuOpen && 'rotate-180')} />
              </Button>
            )}
          />
          <DropdownMenuContent side="top" align="end" className="min-w-40 rounded-sm">
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={mode}
                onValueChange={(value) => onSelectMode(value as ViewerPickingMode)}
              >
                {availableModes.map((entry) => (
                  <DropdownMenuRadioItem
                    key={entry}
                    value={entry}
                    className="h-8 rounded-sm text-xs"
                  >
                    <MaskIcon src={getPickingModeIconUrl(entry)} className="size-3.5" />
                    <span>{getPickingModeLabel(entry)}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ViewportControlTooltip>
  )
}

export function ToolbarAppearanceButton({
  mode,
  colormapAvailable,
  onClick,
  onSelectMode,
  showTooltip = false,
  isMenuOpen,
  onMenuOpenChange,
}: {
  mode: ViewerAppearanceMode
  colormapAvailable: boolean
  onClick: () => void
  onSelectMode: (mode: ViewerAppearanceMode) => void
  showTooltip?: boolean
  isMenuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
}) {
  const activeClassName = mode === 'regular'
    ? 'border-border/70 bg-background/35 text-muted-foreground hover:bg-accent/8 hover:text-foreground'
    : 'border-primary/35 bg-primary/14 text-primary hover:bg-primary/18 hover:text-primary'

  return (
    <ViewportControlTooltip show={showTooltip} label="Appearance" hotkey="S">
      <div className="inline-flex">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={`Cycle appearance, currently ${getAppearanceModeLabel(mode).toLowerCase()}`}
          title={`Appearance: ${getAppearanceModeLabel(mode)}`}
          className={cn('size-7 justify-center rounded-r-none border p-0', activeClassName)}
        >
          {getAppearanceModeIcon(mode)}
        </Button>
        <DropdownMenu open={isMenuOpen} onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger
            render={(
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Choose appearance"
                title="Choose appearance"
                className={cn('h-7 w-5 justify-center rounded-l-none border border-l-0 p-0', activeClassName)}
              >
                <ChevronDown className={cn('size-3 transition-transform', isMenuOpen && 'rotate-180')} />
              </Button>
            )}
          />
          <DropdownMenuContent side="top" align="end" className="min-w-40 rounded-sm">
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={mode}
                onValueChange={(value) => onSelectMode(value as ViewerAppearanceMode)}
              >
                {VIEWER_APPEARANCE_MODES.map((entry) => {
                  const isAvailable = entry !== 'colormap' || colormapAvailable

                  return (
                    <DropdownMenuRadioItem
                      key={entry}
                      value={entry}
                      disabled={!isAvailable}
                      title={!isAvailable ? 'Select an attribute to enable colormap coloring' : undefined}
                      className="h-8 rounded-sm text-xs"
                    >
                      {getAppearanceModeIcon(entry)}
                      <span>{getAppearanceModeLabel(entry)}</span>
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ViewportControlTooltip>
  )
}


function getAppearanceModeIcon(mode: ViewerAppearanceMode) {
  switch (mode) {
    case 'regular':
      return <Box className="size-3.5" />
    case 'normal':
      return <Pyramid className="size-3.5" />
    case 'semantic':
      return <MaskIcon src={materialIconUrl} className="size-3.5" />
    case 'colormap':
      return <Palette className="size-3.5" />
  }
}

