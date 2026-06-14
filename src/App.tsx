import {
  ArrowDown,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Camera,
  Check,
  CircleHelp,
  Copy,
  Crosshair,
  FolderOpen,
  FileText,
  Layers,
  Maximize2,
  Minimize2,
  Moon,
  ListTree,
  Palette,
  Pin,
  PinOff,
  Pyramid,
  ArrowLeftRight,
  RotateCcw,
  RotateCw,
  Search,
  SearchAlert,
  Columns3Cog,
  Shuffle,
  SquareMousePointer,
  CircleX,
  Sun,
  SunMoon,
  TableProperties,
  Upload,
  X,
  TriangleAlert,
} from 'lucide-react'
import { Suspense, lazy, memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { ColorPicker, ColorPickerHex, ColorPickerInput } from '@/components/ui/color-picker'
import { Kbd } from '@/components/ui/kbd'
import {
  collectAvailableLods,
  getGeometryDisplayModeKey,
  getObjectGeometryByIndex,
  normalizeObjectGeometryIndex,
  resolveObjectGeometryIndex,
} from '@/lib/object-geometry'
import { errorColor } from '@/lib/error-palette'
import {
  CAMERA_FOCAL_LENGTH_MIN,
  ORTHOGRAPHIC_CAMERA_VALUE,
  isOrthographicCameraValue,
} from '@/lib/camera'
import { semanticSurfaceColor } from '@/lib/semantic-surface-colors'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { MaskIcon } from '@/components/ui/mask-icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ThemeMode } from '@/components/theme-context'
import { useTheme } from '@/components/use-theme'
import cubeIconUrl from '@/assets/blender-icons/cube.svg'
import editModeIconUrl from '@/assets/blender-icons/editmode_hlt.svg'
import faceSelectIconUrl from '@/assets/blender-icons/facesel.svg'
import gitIconBlackUrl from '@/assets/git-icon-black.svg'
import gitIconWhiteUrl from '@/assets/git-icon-white.svg'
import materialIconUrl from '@/assets/blender-icons/material.svg'
import objectOriginIconUrl from '@/assets/blender-icons/object_origin.svg'
import pointcloudPointIconUrl from '@/assets/blender-icons/pointcloud_point.svg'
import restrictSelectOffIconUrl from '@/assets/blender-icons/restrict_select_off.svg'
import restrictSelectOnIconUrl from '@/assets/blender-icons/restrict_select_on.svg'
import trackerIconUrl from '@/assets/blender-icons/tracker.svg'
import vertexSelectIconUrl from '@/assets/blender-icons/vertexsel.svg'
import changelogText from '../CHANGELOG.md?raw'
import packageJson from '../package.json'
import {
  assertValidationAnnotationsMatchDataset,
  loadCityJsonFromFile,
  loadCityJsonFromUrl,
  loadValidationReportFromFile,
  loadValidationReportFromUrl,
  mergeValidationAnnotations,
} from '@/lib/cityjson'
import { validateDatasetWithVal3dity } from '@/lib/val3dity-wasm'
import type { Val3dityValidationOptions } from '@/lib/val3dity-wasm'
import { cn, viewerObjectKey } from '@/lib/utils'
import type {
  PolygonRings,
  Vec3,
  ViewerAttributeColorState,
  ViewerCityObject,
  ViewerDataset,
  ViewerFeature,
  ViewerFocusTarget,
  ViewerGeometryDisplayMode,
  ViewerObjectGeometry,
  ViewerPickingMode,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/rf-val3dity.city.jsonl`
const SAMPLE_REPORT_URL = `${import.meta.env.BASE_URL}samples/val-report.json`
const VAL3DITY_ERRORS_URL = 'https://val3dity.readthedocs.io/2.6.0/errors/'
const GITHUB_REPO_URL = 'https://github.com/3DGI/CJLoupe'
const APP_VERSION = packageJson.version
const DEFAULT_CAMERA_FOCAL_LENGTH = 50
const BAG_BUILDING_ID_PREFIX = 'NL.IMBAG.Pand.'
const DEFAULT_VAL3DITY_PARAMETERS: Val3dityParameterForm = {
  tolSnap: '0.001',
  planarityD2pTol: '0.01',
  planarityNTol: '20.0',
  overlapTol: '-1.0',
  primitive: 'Solid',
}

type DetailPaneMode = 'split' | 'collapsed' | 'fullscreen'
type MobileInspectMode = 'object' | 'surface'
type MobilePanelView = 'features' | 'details'
type InfoPanelSection = 'pinned' | 'attribute' | 'semantic'
type Val3dityPrimitiveOption = 'auto' | 'Solid' | 'MultiSurface' | 'CompositeSurface'
type Val3dityParameterForm = {
  tolSnap: string
  planarityD2pTol: string
  planarityNTol: string
  overlapTol: string
  primitive: Val3dityPrimitiveOption
}
type HelpItem = { keys: string; description: string }
type ContinuousAttributeColorMapId = keyof typeof ATTRIBUTE_COLOR_MAPS
type QualitativeAttributeColorMapId = keyof typeof QUALITATIVE_COLOR_MAPS
type AttributeColorMapId = ContinuousAttributeColorMapId | QualitativeAttributeColorMapId | 'random'
type AttributeColorDomain = { key: string; min: number; max: number }
type ContinuousAttributeColorModel = {
  kind: 'continuous'
  key: string
  valuesByObjectKey: Record<string, number>
  values: number[]
  dataMin: number
  dataMax: number
  continuousCount: number
  missingCount: number
  objectCount: number
  bins: AttributeColorBin[]
}
type CategoricalAttributeColorModel = {
  kind: 'categorical'
  key: string
  valuesByObjectKey: Record<string, number>
  directColorsByObjectKey: Record<string, string>
  categories: AttributeColorCategory[]
  valueCount: number
  missingCount: number
  objectCount: number
}
type AttributeColorModel = ContinuousAttributeColorModel | CategoricalAttributeColorModel
type AttributeColorBin = {
  start: number
  end: number
  count: number
  color: string
}
type AttributeColorCategory = {
  key: string
  label: string
  count: number
  color: string
  index: number
}

const VIEW_PICKING_MODES: ViewerPickingMode[] = ['none', 'object', 'face']
const EDIT_PICKING_MODES: ViewerPickingMode[] = ['none', 'face', 'vertex']

const FEATURE_LIST_ROW_HEIGHT = 58
const CITY_OBJECT_TREE_ROW_ESTIMATE = 31
const FEATURE_SEPARATOR_HEIGHT_ESTIMATE = 18
const FEATURE_LIST_ROW_GAP = 6
const FEATURE_LIST_TOP_PADDING = 8
const FEATURE_LIST_BOTTOM_PADDING = 12
const FEATURE_LIST_OVERSCAN = 6
const OBJECT_LIST_VISIBILITY_INSET = 4
const EMPTY_CITY_OBJECTS: ViewerCityObject[] = []
const EMPTY_ATTRIBUTES: Record<string, unknown> = {}
const ATTRIBUTE_COLOR_MISSING = '#94a3b8'
const ATTRIBUTE_COLOR_BIN_COUNT = 24
const ATTRIBUTE_COLOR_MAPS = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
  magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
  cividis: ['#00204d', '#173c6d', '#345d7e', '#4f7c7b', '#6c9974', '#8bb56b', '#accd66', '#d0e264', '#fdea45', '#ffffe5'],
  turbo: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#f9b233', '#7a0403'],
  coolwarm: ['#3b4cc0', '#5977e3', '#82a6fb', '#b1cbfc', '#dddcdc', '#f2cbb7', '#f7a889', '#e7745b', '#c53334', '#b40426'],
} as const
const QUALITATIVE_COLOR_MAPS = {
  tableau10: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
  set3: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
  paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
  dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
} as const
const DEFAULT_ATTRIBUTE_COLOR_MAP_ID: AttributeColorMapId = 'viridis'
const DEFAULT_CATEGORICAL_COLOR_MAP_ID: AttributeColorMapId = 'tableau10'
type ColorMapGroup = { label: string; options: readonly AttributeColorMapId[] }
const CONTINUOUS_COLORMAP_GROUPS: readonly ColorMapGroup[] = [
  { label: 'Sequential', options: ['viridis', 'plasma', 'inferno', 'magma', 'cividis', 'turbo'] },
  { label: 'Diverging', options: ['coolwarm'] },
]
const CATEGORICAL_COLORMAP_GROUPS: readonly ColorMapGroup[] = [
  { label: 'Qualitative', options: ['random', ...Object.keys(QUALITATIVE_COLOR_MAPS) as QualitativeAttributeColorMapId[]] },
  { label: 'Sequential', options: ['viridis', 'plasma', 'inferno', 'magma', 'cividis', 'turbo'] },
  { label: 'Diverging', options: ['coolwarm'] },
]
const ATTRIBUTE_COLOR_DOMAIN_PREVIEW_EVENT = 'cjloupe:attribute-color-domain-preview'
const CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT = 32
const CATEGORICAL_ATTRIBUTE_HIGH_CARDINALITY_LIMIT = 200
const CATEGORICAL_ATTRIBUTE_SINGLETON_RATIO = 0.85

const CityViewport = lazy(() =>
  import('@/components/viewer/city-viewport').then((module) => ({ default: module.CityViewport })),
)

type FeatureListItem = {
  feature: ViewerFeature
  errorCount: number
  isInvalid: boolean
  searchText: string
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const annotationInputRef = useRef<HTMLInputElement>(null)
  const originalVerticesRef = useRef<Map<string, Vec3[]>>(new Map())
  const originalObjectGeometriesRef = useRef<Map<string, Map<string, ViewerObjectGeometry[]>>>(new Map())
  const attributeColorDomainsByKeyRef = useRef<Map<string, AttributeColorDomain>>(new Map())
  const attributeColorMapIdsByKeyRef = useRef<Map<string, AttributeColorMapId>>(new Map())
  const attributeColorMapReversedByKeyRef = useRef<Map<string, boolean>>(new Map())
  const preInspectPickingModeRef = useRef<ViewerPickingMode>('object')
  const inspectPickingModeRef = useRef<ViewerPickingMode>('face')
  const pendingViewportDatasetRef = useRef<ViewerDataset | null>(null)

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
  const [topDownViewRevision, setTopDownViewRevision] = useState(0)
  const [focusRevision, setFocusRevision] = useState(0)
  const [focusTarget, setFocusTarget] = useState<ViewerFocusTarget>(null)
  const [annotationSourceName, setAnnotationSourceName] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [cameraFocalLength, setCameraFocalLength] = useState(DEFAULT_CAMERA_FOCAL_LENGTH)
  const [viewportCenter, setViewportCenter] = useState<Vec3 | null>(null)
  const [hideOccludedEditEdges, setHideOccludedEditEdges] = useState(true)
  const [showOnlyInvalidFeatures, setShowOnlyInvalidFeatures] = useState(false)
  const [showSemanticSurfaces, setShowSemanticSurfaces] = useState(false)
  const [isolateSelectedFeature, setIsolateSelectedFeature] = useState(false)
  const [pinnedAttributeKeys, setPinnedAttributeKeys] = useState<string[]>([])
  const [isPinnedAttributesOpen, setIsPinnedAttributesOpen] = useState(false)
  const [infoPanelOpenSections, setInfoPanelOpenSections] = useState<Record<InfoPanelSection, boolean>>({
    pinned: true,
    attribute: true,
    semantic: false,
  })
  const [attributeColorKey, setAttributeColorKey] = useState<string | null>(null)
  const [attributeColorInheritsParent, setAttributeColorInheritsParent] = useState(true)
  const [attributeColorDomain, setAttributeColorDomain] = useState<AttributeColorDomain | null>(null)
  const [attributeColorMapId, setAttributeColorMapId] = useState<AttributeColorMapId>(DEFAULT_ATTRIBUTE_COLOR_MAP_ID)
  const [attributeColorMapReversed, setAttributeColorMapReversed] = useState(false)
  const [attributeCategoricalColorSeed, setAttributeCategoricalColorSeed] = useState(0)
  const [customCategoricalColorMaps, setCustomCategoricalColorMaps] = useState<Record<string, Record<string, string>>>({})
  const [detailTab, setDetailTab] = useState('errors')
  const [detailPaneMode, setDetailPaneMode] = useState<DetailPaneMode>('split')
  const [isDragging, setIsDragging] = useState(false)
  const [isHelpCollapsed, setIsHelpCollapsed] = useState(true)
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false)
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false)
  const [isChangelogDialogOpen, setIsChangelogDialogOpen] = useState(false)
  const [cityJsonUrlInput, setCityJsonUrlInput] = useState('')
  const [annotationUrlInput, setAnnotationUrlInput] = useState('')
  const [val3dityParameters, setVal3dityParameters] = useState<Val3dityParameterForm>(DEFAULT_VAL3DITY_PARAMETERS)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [mobileInspectMode, setMobileInspectMode] = useState<MobileInspectMode>('object')
  const [mobilePanelView, setMobilePanelView] = useState<MobilePanelView>('features')
  const [dismissedErrorMessage, setDismissedErrorMessage] = useState<string | null>(null)
  const [pickingMode, setPickingMode] = useState<ViewerPickingMode>('object')
  const [showVertexGizmo, setShowVertexGizmo] = useState(false)
  const [selectedSemanticSurface, setSelectedSemanticSurface] = useState<{
    featureId: string
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null>(null)
  const dragCountRef = useRef(0)
  const { theme, themeMode, toggleTheme } = useTheme()

  const featureMap = useMemo(() => {
    return new Map(dataset?.features.map((feature) => [feature.id, feature]) ?? [])
  }, [dataset, geometryRevision])

  const selectedFeature = selectedFeatureId ? featureMap.get(selectedFeatureId) ?? null : null
  const availableLods = useMemo(() => collectAvailableLods(dataset), [dataset])
  const selectedFeatureObjects = selectedFeature?.objects ?? EMPTY_CITY_OBJECTS
  const activeObject =
    selectedFeatureObjects.find((object) => object.id === activeObjectId) ??
    selectedFeatureObjects[0] ??
    null
  const activeObjectAttributes = activeObject?.attributes ?? EMPTY_ATTRIBUTES
  const detailTitleLabel = activeObject ? formatObjectDisplayId(activeObject.id) : selectedFeature?.label ?? 'No item selected'
  const resolvedActiveGeometryIndex = activeObject
    ? resolveObjectGeometryIndex(activeObject, geometryDisplayMode, activeGeometryIndex)
    : null
  const activeObjectGeometry = getObjectGeometryByIndex(activeObject, resolvedActiveGeometryIndex)
  const activeObjectGeometryCount = activeObject?.geometries.length ?? 0
  const activeObjectAttributeCount = activeObject ? Object.keys(activeObject.attributes).length : 0
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
  const hasDetailAttributes = activeObjectAttributeCount > 0
  const hasDetailGeometries = activeObjectGeometryCount > 0
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
  const attributeColorMapColors = useMemo(() => {
    const base = getContinuousAttributeColorMapColors(attributeColorMapId)
    return attributeColorMapReversed ? [...base].reverse() : base
  }, [attributeColorMapId, attributeColorMapReversed])
  const customCategoricalColorsForAttribute = attributeColorKey
    ? customCategoricalColorMaps[attributeColorKey] ?? EMPTY_ATTRIBUTES
    : EMPTY_ATTRIBUTES
  const attributeColorModel = useMemo(
    () => buildAttributeColorModel(
      dataset,
      attributeColorKey,
      attributeColorInheritsParent,
      attributeColorMapId,
      attributeColorMapColors,
      attributeCategoricalColorSeed,
      customCategoricalColorsForAttribute as Record<string, string>,
    ),
    [
      attributeColorInheritsParent,
      attributeColorKey,
      attributeColorMapColors,
      attributeColorMapId,
      attributeCategoricalColorSeed,
      customCategoricalColorsForAttribute,
      dataset,
    ],
  )
  const activeAttributeColorDomain = useMemo(() => {
    if (!attributeColorModel || attributeColorModel.kind !== 'continuous') {
      return null
    }

    if (attributeColorDomain?.key === attributeColorModel.key) {
      return attributeColorDomain
    }

    return {
      key: attributeColorModel.key,
      min: attributeColorModel.dataMin,
      max: attributeColorModel.dataMax,
    }
  }, [attributeColorDomain, attributeColorModel])
  const attributeColorViewportState = useMemo<ViewerAttributeColorState | null>(() => {
    if (!attributeColorModel || showSemanticSurfaces) {
      return null
    }

    if (attributeColorModel.kind === 'categorical') {
      if (attributeColorModel.valueCount === 0) {
        return null
      }

      return {
        mode: 'direct',
        valuesByObjectKey: attributeColorModel.valuesByObjectKey,
        directColorsByObjectKey: attributeColorModel.directColorsByObjectKey,
        domainMin: 0,
        domainMax: Math.max(attributeColorModel.categories.length - 1, 1),
        dataMin: 0,
        dataMax: Math.max(attributeColorModel.categories.length - 1, 1),
        colors: attributeColorModel.categories.slice(0, 10).map((category) => category.color),
        missingColor: ATTRIBUTE_COLOR_MISSING,
      }
    }

    if (!activeAttributeColorDomain || attributeColorModel.continuousCount === 0) {
      return null
    }

    return {
      mode: 'continuous',
      valuesByObjectKey: attributeColorModel.valuesByObjectKey,
      domainMin: activeAttributeColorDomain.min,
      domainMax: activeAttributeColorDomain.max,
      dataMin: attributeColorModel.dataMin,
      dataMax: attributeColorModel.dataMax,
      colors: attributeColorMapColors,
      missingColor: ATTRIBUTE_COLOR_MISSING,
    }
  }, [activeAttributeColorDomain, attributeColorMapColors, attributeColorModel, showSemanticSurfaces])
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
    document.title = dataset?.sourceName ? `CJLoupe - ${dataset.sourceName}` : 'CJLoupe'
  }, [dataset?.sourceName])

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
    if (attributeColorKey && !pinnedAttributeKeys.includes(attributeColorKey)) {
      setAttributeColorKey(null)
      setAttributeColorDomain(null)
    }
  }, [attributeColorKey, pinnedAttributeKeys])

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
  }, [attributeColorKey, attributeColorModel, attributeColorMapId])

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
        ? clampAttributeColorDomain(cachedDomain, attributeColorModel.dataMin, attributeColorModel.dataMax)
        : getDefaultAttributeColorDomain(attributeColorModel)
    })
  }, [attributeColorModel])

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
  }, [activeObjectId, dataset, editMode, selectedFeatureId])

  useEffect(() => {
    if (!isFileDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFileDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isFileDialogOpen])

  useEffect(() => {
    if (!isInfoDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInfoDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isInfoDialogOpen])

  useEffect(() => {
    if (!isChangelogDialogOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsChangelogDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isChangelogDialogOpen])

  const waitForViewportDataset = useCallback((nextDataset: ViewerDataset) => {
    pendingViewportDatasetRef.current = nextDataset
  }, [])

  const finishLoadingIfViewportIsReady = useCallback(() => {
    if (!pendingViewportDatasetRef.current) {
      setIsLoading(false)
    }
  }, [])

  const handleViewportDataRendered = useCallback((renderedDataset: ViewerDataset) => {
    if (pendingViewportDatasetRef.current !== renderedDataset) {
      return
    }

    pendingViewportDatasetRef.current = null
    setIsLoading(false)
  }, [])

  async function openCityJsonFile(file: File) {
    setIsLoading(true)
    setError(null)
    setIsFileDialogOpen(false)

    try {
      const nextDataset = await loadCityJsonFromFile(file)
      applyDataset(nextDataset)
      setAnnotationSourceName(null)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to parse selected file.'
      setError(message)
    } finally {
      finishLoadingIfViewportIsReady()
    }
  }

  function applyLoadedAnnotations(
    currentDataset: ViewerDataset,
    annotations: Map<string, { validity: boolean; errors: ViewerValidationError[] }>,
    sourceName: string,
  ) {
    assertValidationAnnotationsMatchDataset(currentDataset, annotations)
    setDataset((current) => {
      if (!current) {
        return current
      }

      const nextDataset = mergeValidationAnnotations(current, annotations)
      waitForViewportDataset(nextDataset)
      setShowOnlyInvalidFeatures(nextDataset.features.some((feature) => feature.errors.length > 0))
      return nextDataset
    })
    setAnnotationSourceName(sourceName)
  }

  async function openAnnotationFile(file: File) {
    if (!dataset) {
      setError('Open a CityJSON file before loading annotations.')
      return
    }

    setIsLoading(true)
    setError(null)
    setIsFileDialogOpen(false)

    try {
      const annotations = await loadValidationReportFromFile(file)
      applyLoadedAnnotations(dataset, annotations, file.name)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to parse annotation report.'
      setError(message)
    } finally {
      finishLoadingIfViewportIsReady()
    }
  }

  async function openAnnotationFromUrl(url: string) {
    if (!dataset) {
      setError('Open a CityJSON file before loading annotations.')
      return
    }

    const trimmed = stripGzSuffix(url.trim())
    if (!trimmed) {
      return
    }

    setIsLoading(true)
    setError(null)
    setIsFileDialogOpen(false)
    setAnnotationUrlInput('')

    try {
      const annotations = await loadValidationReportFromUrl(trimmed)
      applyLoadedAnnotations(dataset, annotations, deriveSourceNameFromUrl(trimmed))
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load val3dity report from URL.'
      setError(message)
    } finally {
      finishLoadingIfViewportIsReady()
    }
  }

  async function validateCurrentDatasetWithVal3dity() {
    if (!dataset) {
      return
    }

    setIsLoading(true)
    setLoadingMessage('Validating…')
    setError(null)
    setIsInfoDialogOpen(false)

    try {
      if (!isValidVal3dityParameters(val3dityParameters)) {
        throw new Error('Fix the val3dity parameters before running validation.')
      }
      await waitForNextPaint()
      const annotations = await validateDatasetWithVal3dity(dataset, buildVal3dityValidationOptions(val3dityParameters))
      applyLoadedAnnotations(dataset, annotations, 'val3dity wasm')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to run val3dity validation.'
      setError(message)
    } finally {
      setLoadingMessage(null)
      finishLoadingIfViewportIsReady()
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
      if (isCityJsonFileName(name)) {
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
    setIsFileDialogOpen(false)

    try {
      const [nextDataset, annotations] = await Promise.all([
        loadCityJsonFromFile(cityFile),
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
      finishLoadingIfViewportIsReady()
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
    setPickingMode('object')
    setShowVertexGizmo(false)
    setSelectedSemanticSurface(null)
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
    setViewportResetRevision((current) => current + 1)
  }, [])

  const applyDataset = useCallback((nextDataset: ViewerDataset) => {
    originalVerticesRef.current = new Map()
    originalObjectGeometriesRef.current = new Map()
    waitForViewportDataset(nextDataset)
    resetViewerState()
    setDataset(nextDataset)

    setSelectedFeatureId(null)
    setActiveObjectId(null)
    setActiveGeometryIndex(null)
    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setEditMode(false)
  }, [resetViewerState, waitForViewportDataset])

  const loadFromSample = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [nextDataset, annotations] = await Promise.all([
        loadCityJsonFromUrl(SAMPLE_URL, 'rf-val3dity sample'),
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
      finishLoadingIfViewportIsReady()
    }
  }, [applyDataset, finishLoadingIfViewportIsReady])

  const loadFromUrlParams = useCallback(async (cjUrl: string, valUrl: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const cleanCjUrl = stripGzSuffix(cjUrl.trim())
      const cleanValUrl = stripGzSuffix(valUrl.trim())
      const [nextDataset, annotations] = await Promise.all([
        loadCityJsonFromUrl(cleanCjUrl, deriveSourceNameFromUrl(cleanCjUrl)),
        loadValidationReportFromUrl(cleanValUrl),
      ])
      assertValidationAnnotationsMatchDataset(nextDataset, annotations)
      const mergedDataset = mergeValidationAnnotations(nextDataset, annotations)
      applyDataset(mergedDataset)
      setAnnotationSourceName(deriveSourceNameFromUrl(cleanValUrl))
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load files from URL parameters.'
      setError(message)
    } finally {
      finishLoadingIfViewportIsReady()
    }
  }, [applyDataset, finishLoadingIfViewportIsReady])

  const openCityJsonFromUrl = useCallback(async (url: string) => {
    const trimmed = stripGzSuffix(url.trim())
    if (!trimmed) {
      return
    }

    setIsLoading(true)
    setError(null)
    setIsFileDialogOpen(false)
    setCityJsonUrlInput('')

    try {
      const sourceName = deriveSourceNameFromUrl(trimmed)
      const nextDataset = await loadCityJsonFromUrl(trimmed, sourceName)
      applyDataset(nextDataset)
      setAnnotationSourceName(null)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load file from URL.'
      setError(message)
    } finally {
      finishLoadingIfViewportIsReady()
    }
  }, [applyDataset, finishLoadingIfViewportIsReady])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cjParam = params.get('cj')
    const valParam = params.get('val')

    if (cjParam && valParam) {
      void loadFromUrlParams(cjParam, valParam)
    } else if (cjParam) {
      void openCityJsonFromUrl(cjParam)
    } else {
      void loadFromSample()
    }
  }, [loadFromSample, loadFromUrlParams, openCityJsonFromUrl])

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
    setDataset((current) => (current ? mergeValidationAnnotations(current, new Map()) : current))
    setAnnotationSourceName(null)
    setShowOnlyInvalidFeatures(false)
  }

  function triggerCityJsonInput() {
    fileInputRef.current?.click()
  }

  function triggerAnnotationInput() {
    annotationInputRef.current?.click()
  }

  function handleFileAction() {
    setIsFileDialogOpen(true)
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
    setAttributeColorKey(key)
    setShowSemanticSurfaces(false)
    setAttributeColorDomain(attributeColorDomainsByKeyRef.current.get(key) ?? null)
    setAttributeColorMapId(
      attributeColorMapIdsByKeyRef.current.get(key) ?? DEFAULT_ATTRIBUTE_COLOR_MAP_ID,
    )
    setAttributeColorMapReversed(attributeColorMapReversedByKeyRef.current.get(key) ?? false)
  }, [])

  const handleClearAttributeColor = useCallback(() => {
    setAttributeColorKey(null)
    setAttributeColorDomain(null)
  }, [])

  const handleCommitAttributeColorDomain = useCallback((domain: AttributeColorDomain) => {
    attributeColorDomainsByKeyRef.current.set(domain.key, domain)
    setAttributeColorDomain(domain)
  }, [])

  const handleRerandomizeCategoricalColors = useCallback(() => {
    setAttributeCategoricalColorSeed((current) => current + 1)
    if (attributeColorKey) {
      setCustomCategoricalColorMaps((current) => {
        const rest = { ...current }
        delete rest[attributeColorKey]
        return rest
      })
    }
  }, [attributeColorKey])

  const handleCustomCategoricalColorChange = useCallback((attributeKey: string, categoryKey: string, color: string) => {
    setCustomCategoricalColorMaps((current) => ({
      ...current,
      [attributeKey]: {
        ...(current[attributeKey] ?? {}),
        [categoryKey]: color,
      },
    }))
  }, [])

  const handleAttributeColorMapChange = useCallback((colorMapId: AttributeColorMapId) => {
    setAttributeColorMapId(colorMapId)
    if (attributeColorKey) {
      attributeColorMapIdsByKeyRef.current.set(attributeColorKey, colorMapId)
    }
  }, [attributeColorKey])

  const handleToggleAttributeColorMapReversed = useCallback(() => {
    setAttributeColorMapReversed((current) => {
      const next = !current
      if (attributeColorKey) {
        attributeColorMapReversedByKeyRef.current.set(attributeColorKey, next)
      }
      return next
    })
  }, [attributeColorKey])

  const handleToggleInfoPanelSection = useCallback((section: InfoPanelSection) => {
    setInfoPanelOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }, [])

  const handlePreviewAttributeColorDomain = useCallback((domain: AttributeColorDomain) => {
    window.dispatchEvent(
      new CustomEvent(ATTRIBUTE_COLOR_DOMAIN_PREVIEW_EVENT, {
        detail: {
          min: domain.min,
          max: domain.max,
        },
      }),
    )
  }, [])

  const toggleSemanticSurfaces = useCallback(() => {
    setShowSemanticSurfaces((current) => {
      const next = !current
      if (next) {
        setAttributeColorKey(null)
        setAttributeColorDomain(null)
      }
      return next
    })
  }, [])

  const handleSelectSemanticSurface = useCallback((surface: {
    featureId: string
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null) => {
    if (surface) {
      setSelectedFeatureId(surface.featureId)
      setActiveObjectId(surface.objectId)
    }
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

  const handleSetViewportCenter = useCallback((center: Vec3) => {
    setFocusTarget({ kind: 'location', location: center })
    setFocusRevision((current) => current + 1)
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
      setShowSemanticSurfaces(false)
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

  const toggleEditMode = useCallback(() => {
    if (isMobileLayout) {
      return
    }

    setEditMode((current) => {
      const next = !current
      if (next) {
        preInspectPickingModeRef.current = pickingMode
        setIsolateSelectedFeature(true)
        setPickingMode(inspectPickingModeRef.current)
      } else {
        inspectPickingModeRef.current = pickingMode
        setIsolateSelectedFeature(false)
        setPickingMode(preInspectPickingModeRef.current)
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedVertexIndex(null)
        setSelectedFaceVertexEntryIndex(null)
        setShowVertexGizmo(false)
      }
      if (next) {
        setSelectedFaceIndex(null)
        setSelectedFaceRingIndex(0)
        setSelectedFaceVertexEntryIndex(null)
      }
      return next
    })
  }, [isMobileLayout, pickingMode])

  const handleSelectFeature = useCallback((
    featureId: string,
    objectId?: string | null,
    options?: { preserveEditMode?: boolean },
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

      setSelectedFeatureId(featureId)
      setActiveObjectId(objectId ?? feature.objects[0]?.id ?? null)
      setActiveGeometryIndex(null)
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
    })
  }, [editMode, featureMap, isolateSelectedFeature, selectedFeatureId])

  const handleClearSelection = useCallback(() => {
    startTransition(() => {
      setSelectedFeatureId(null)
      setActiveObjectId(null)
      setActiveGeometryIndex(null)
      setSelectedFaceIndex(null)
      setSelectedFaceRingIndex(0)
      setSelectedVertexIndex(null)
      setSelectedFaceVertexEntryIndex(null)
      setSelectedSemanticSurface(null)
    })
  }, [])

  const handleSearchQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
  }, [])

  const handleShowOnlyInvalidFeaturesChange = useCallback((checked: boolean) => {
    setShowOnlyInvalidFeatures(checked)
  }, [])

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
  }, [editMode, featureMap, isolateSelectedFeature, selectedFeatureId])

  const handleViewportSelectFeature = useCallback((
    featureId: string,
    objectId?: string | null,
  ) => {
    handleSelectFeature(featureId, objectId)
  }, [handleSelectFeature])

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
  }, [selectedFace])

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
  }, [selectedFaceRingCount])

  const applyFeatureVertices = useCallback((featureId: string, vertices: Vec3[]) => {
    setDataset((current) => {
      if (!current) {
        return current
      }

      const feature = current.features.find((candidate) => candidate.id === featureId)
      if (feature) {
        if (!originalVerticesRef.current.has(featureId)) {
          originalVerticesRef.current.set(featureId, cloneVertices(feature.vertices))
        }
        feature.vertices = cloneVertices(vertices)
      }

      return current
    })
    setGeometryRevision((current) => current + 1)
  }, [])

  const deleteSelectedFace = useCallback(() => {
    if (
      !selectedFeatureId ||
      !activeObjectId ||
      resolvedActiveGeometryIndex == null ||
      selectedFaceIndex == null ||
      !activeObjectGeometry?.polygons[selectedFaceIndex]
    ) {
      return
    }

    setDataset((current) => {
      if (!current) {
        return current
      }

      const feature = current.features.find((candidate) => candidate.id === selectedFeatureId)
      if (!feature) {
        return current
      }

      const object = feature.objects.find((candidate) => candidate.id === activeObjectId)
      if (!object) {
        return current
      }

      const targetGeometry = object.geometries.find(
        (geometry) => geometry.index === resolvedActiveGeometryIndex,
      )
      if (!targetGeometry?.polygons[selectedFaceIndex]) {
        return current
      }

      let featureGeometrySnapshots = originalObjectGeometriesRef.current.get(selectedFeatureId)
      if (!featureGeometrySnapshots) {
        featureGeometrySnapshots = new Map()
        originalObjectGeometriesRef.current.set(selectedFeatureId, featureGeometrySnapshots)
      }
      if (!featureGeometrySnapshots.has(object.id)) {
        featureGeometrySnapshots.set(object.id, cloneObjectGeometries(object.geometries))
      }

      targetGeometry.polygons = targetGeometry.polygons.filter((_, index) => index !== selectedFaceIndex)
      targetGeometry.semanticSurfaces = targetGeometry.semanticSurfaces.filter((_, index) => index !== selectedFaceIndex)
      targetGeometry.sourceFaceIndices = targetGeometry.sourceFaceIndices.filter((_, index) => index !== selectedFaceIndex)
      targetGeometry.vertexIndices = collectGeometryVertexIndices(targetGeometry.polygons)

      return current
    })

    setSelectedFaceIndex(null)
    setSelectedFaceRingIndex(0)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(null)
    setGeometryRevision((current) => current + 1)
  }, [
    activeObjectGeometry,
    activeObjectId,
    resolvedActiveGeometryIndex,
    selectedFaceIndex,
    selectedFeatureId,
  ])

  const restoreSelectedFeatureGeometry = useCallback(() => {
    if (!selectedFeatureId) {
      return
    }

    const originalVertices = originalVerticesRef.current.get(selectedFeatureId)
    const originalObjectGeometries = originalObjectGeometriesRef.current.get(selectedFeatureId)
    if (!originalVertices && !originalObjectGeometries) {
      return
    }

    setDataset((current) => {
      if (!current) {
        return current
      }

      const feature = current.features.find((candidate) => candidate.id === selectedFeatureId)
      if (!feature) {
        return current
      }

      if (originalVertices) {
        feature.vertices = cloneVertices(originalVertices)
      }

      for (const object of feature.objects) {
        const geometries = originalObjectGeometries?.get(object.id)
        if (geometries) {
          object.geometries = cloneObjectGeometries(geometries)
        }
      }

      return current
    })
    originalVerticesRef.current.delete(selectedFeatureId)
    originalObjectGeometriesRef.current.delete(selectedFeatureId)
    setSelectedVertexIndex(null)
    setSelectedFaceVertexEntryIndex(null)
    setSelectedSemanticSurface(null)
    setGeometryRevision((current) => current + 1)
  }, [selectedFeatureId])

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
        toggleSemanticSurfaces()
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
            !originalVerticesRef.current.has(selectedFeatureId) &&
            !originalObjectGeometriesRef.current.has(selectedFeatureId)
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
  }, [centerCurrentSelection, cycleGeometryDisplayMode, cycleSelectedFaceRing, cycleSelectedFaceVertex, dataset, deleteSelectedFace, editMode, handlePickingModeShortcut, restoreSelectedFeatureGeometry, selectedFaceIndex, selectedFeatureId, toggleEditMode, toggleSemanticSurfaces])

  const isErrorDialogVisible = Boolean(error && dismissedErrorMessage !== error)
  const hasModalScrim =
    isFileDialogOpen ||
    isInfoDialogOpen ||
    isChangelogDialogOpen ||
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
        { keys: 'Sem', description: 'Toggle semantic colors' },
        { keys: 'B', description: 'Toggle sidebar' },
      ]
    : editMode
      ? [
          { keys: 'Click', description: getPickingModeDescription(effectivePickingMode) },
          { keys: 'J / K', description: 'Step active ring' },
          { keys: 'R', description: 'Cycle rings' },
          { keys: 'D', description: 'Delete selected face' },
          { keys: 'B', description: 'Toggle sidebar' },
        ]
      : [
          { keys: 'Click', description: getPickingModeDescription(effectivePickingMode) },
          { keys: 'Double Click', description: 'Recenter navigation' },
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
                  size="icon"
                  variant="ghost"
                  onClick={handleFileAction}
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
                asChild
              >
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open GitHub repository"
                  title="Open GitHub repository"
                >
                  <img
                    src={theme === 'dark' ? gitIconWhiteUrl : gitIconBlackUrl}
                    alt=""
                    className="size-4"
                    aria-hidden="true"
                  />
                </a>
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
                    onSearchQueryChange={handleSearchQueryChange}
                    onShowOnlyInvalidFeaturesChange={handleShowOnlyInvalidFeaturesChange}
                    val3dityParameters={val3dityParameters}
                    onVal3dityParametersChange={setVal3dityParameters}
                    onValidate={dataset ? () => void validateCurrentDatasetWithVal3dity() : null}
                    onSelectFeature={handleSelectFeature}
                    onCenterObject={handleCenterObject}
                    onShowInfo={dataset ? () => setIsInfoDialogOpen(true) : null}
                    activeObjectId={activeObject?.id ?? null}
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
                  <div className="panel-header-surface space-y-1 p-4 pb-2.5">
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
                          {hasDetailErrors && (
                            <TabsTrigger value="errors" className="detail-tab gap-1.5">
                              <span>Errors</span>
                              <span className="rounded-sm bg-foreground/8 px-1.5 py-0 text-[10px] text-muted-foreground">
                                {visibleDetailErrorCount}
                              </span>
                            </TabsTrigger>
                          )}
                          {hasDetailAttributes && (
                            <TabsTrigger value="attributes" className="detail-tab gap-1.5">
                              <span>Attributes</span>
                              <span className="rounded-sm bg-foreground/8 px-1.5 py-0 text-[10px] text-muted-foreground">
                                {activeObjectAttributeCount}
                              </span>
                            </TabsTrigger>
                          )}
                          {hasDetailGeometries && (
                            <TabsTrigger value="geometries" className="detail-tab gap-1.5">
                              <span>Geometries</span>
                              <span className="rounded-sm bg-foreground/8 px-1.5 py-0 text-[10px] text-muted-foreground">
                                {activeObjectGeometryCount}
                              </span>
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
                                                  className="size-8 shrink-0 self-center"
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
                                      objectAttributes={activeObjectAttributes}
                                      canPinAttributes={!isMobileLayout}
                                      pinnedAttributeKeys={pinnedAttributeKeys}
                                      onPinAttribute={handlePinAttribute}
                                      onUnpinAttribute={handleUnpinAttribute}
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
                            Click a building in the scene or choose a feature from the feature list.
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

      <div
        className={cn(
          'relative min-w-0 flex-1',
          isMobileLayout ? mobileViewportHeightClass : 'h-full',
        )}
      >
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
            topDownViewRevision={topDownViewRevision}
            focusRevision={focusRevision}
            focusTarget={focusTarget}
            selectedFeatureId={selectedFeatureId}
            activeObjectId={activeObjectId}
            editMode={editMode}
            selectedFaceIndex={selectedFaceIndex}
            selectedFaceRingIndex={activeFaceRingIndex}
            selectedVertexIndex={selectedVertexIndex}
            showSemanticSurfaces={showSemanticSurfaces}
            attributeColor={attributeColorViewportState}
            pickingMode={effectivePickingMode}
            showVertexGizmo={showVertexGizmo}
            mobileInteraction={isMobileLayout}
            mobileSelectionMode={mobileInspectMode}
            onSelectFeature={handleViewportSelectFeature}
            onClearSelection={handleClearSelection}
            onSelectFace={handleSelectFace}
            onSelectVertex={handleSelectVertex}
            onSelectSemanticSurface={handleSelectSemanticSurface}
            onVertexCommit={applyFeatureVertices}
            onViewportCenterChange={setViewportCenter}
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
              hasSelectedFeature={Boolean(selectedFeature)}
              showSemanticSurfaces={showSemanticSurfaces}
              mobileInspectMode={mobileInspectMode}
              onToggleSemanticSurfaces={toggleSemanticSurfaces}
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
              editMode={editMode}
              xrayActive={!hideOccludedEditEdges}
              xrayDisabled={!editMode || !activeObjectGeometry}
              hasSelectedFeature={Boolean(selectedFeature)}
              showSemanticSurfaces={showSemanticSurfaces}
              pickingMode={effectivePickingMode}
              showVertexGizmo={showVertexGizmo}
              hasSelectedVertex={selectedVertexIndex != null}
              isolateSelectedFeature={isolateSelectedFeature}
              showTooltips={showViewportTooltips}
              onToggleEditMode={toggleEditMode}
              onCyclePickingMode={cyclePickingMode}
              onToggleVertexGizmo={() => setShowVertexGizmo((current) => !current)}
              onToggleXray={() => setHideOccludedEditEdges((current) => !current)}
              onToggleSemanticSurfaces={toggleSemanticSurfaces}
              onToggleIsolateSelectedFeature={() => setIsolateSelectedFeature((current) => !current)}
              onSelectPickingMode={handleSelectPickingMode}
              onCenterCurrentSelection={centerCurrentSelection}
              onRestoreGeometry={restoreSelectedFeatureGeometry}
              onClearSelection={handleClearSelection}
              restoreGeometryDisabled={
                !selectedFeatureId ||
                (
                  !originalVerticesRef.current.has(selectedFeatureId) &&
                  !originalObjectGeometriesRef.current.has(selectedFeatureId)
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
              selectedVertexIndex={selectedVertexIndex}
              cameraFocalLength={cameraFocalLength}
              onCameraFocalLengthChange={setCameraFocalLength}
              onSetTopDownView={() => setTopDownViewRevision((current) => current + 1)}
              onSetCenter={handleSetViewportCenter}
              onTogglePinnedAttributesOpen={() => setIsPinnedAttributesOpen((current) => !current)}
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

      {isFileDialogOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/42 px-4 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-dialog-title"
            className="w-full max-w-lg rounded-sm border border-border/45 bg-background p-5 shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]"
          >
            <div className="flex items-center justify-between gap-4">
              <p
                id="file-dialog-title"
                className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary"
              >
                Open files
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setIsFileDialogOpen(false)}
                aria-label="Close file dialog"
                title="Close file dialog"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-5 space-y-5">
              <section>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  CityJSON
                </p>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void openCityJsonFromUrl(cityJsonUrlInput)
                  }}
                >
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="Paste a URL…"
                    value={cityJsonUrlInput}
                    onChange={(event) => setCityJsonUrlInput(event.target.value)}
                    aria-label="CityJSON URL"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={tryParseHttpUrl(cityJsonUrlInput) === null}
                  >
                    Open URL
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={triggerCityJsonInput}
                    aria-label={dataset ? 'Upload a CityJSON file to replace the current one' : 'Upload a CityJSON file'}
                    title="Upload file"
                  >
                    <Upload className="size-4" />
                  </Button>
                </form>
              </section>

              <section>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Val3dity report
                </p>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void openAnnotationFromUrl(annotationUrlInput)
                  }}
                >
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder={dataset ? 'Paste a URL…' : 'Load a CityJSON file first'}
                    value={annotationUrlInput}
                    onChange={(event) => setAnnotationUrlInput(event.target.value)}
                    aria-label="Val3dity report URL"
                    className="min-w-0 flex-1"
                    disabled={!dataset}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!dataset || tryParseHttpUrl(annotationUrlInput) === null}
                  >
                    Open URL
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={triggerAnnotationInput}
                    disabled={!dataset}
                    aria-label={annotationSourceName ? 'Upload a val3dity report to replace the current one' : 'Upload a val3dity report'}
                    title="Upload file"
                  >
                    <Upload className="size-4" />
                  </Button>
                  {annotationSourceName && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={clearAnnotations}
                      aria-label="Clear val3dity report"
                      title="Clear val3dity report"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </form>
              </section>

              <p className="text-xs text-muted-foreground">
                Tip: drop files or paste URLs anywhere in the window.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {isInfoDialogOpen && dataset && (
        <InfoDialog
          dataset={dataset}
          annotationSourceName={annotationSourceName}
          onClose={() => setIsInfoDialogOpen(false)}
        />
      )}

      {isChangelogDialogOpen && (
        <ChangelogDialog
          changelog={changelogText}
          onClose={() => setIsChangelogDialogOpen(false)}
        />
      )}

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
          <div className="rounded-sm border-2 border-dashed border-accent/35 bg-card px-10 py-8 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Drop file to open</p>
            <p className="mt-1 text-sm text-muted-foreground">
              .city.json, .city.jsonl, or a val3dity report
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function EditSelectionOverlay({
  positionClassName,
  selectedFaceIndex,
  selectedFaceRingCount,
  selectedFaceRingLabel,
  selectedFaceRingIsHole,
  selectedFaceVertexCount,
  selectedFaceVertexEntryLabel,
  selectedFaceHoleCount,
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
  onCycleSelectedFaceRing: (direction: -1 | 1) => void
  onCycleSelectedFaceVertex: (direction: -1 | 1) => void
}) {
  return (
    <div className={cn('pointer-events-none absolute z-10', positionClassName)}>
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
          <div className="space-y-2">
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
    <div className="floating-panel pointer-events-auto flex flex-col items-center gap-1 rounded-sm border p-1">
      <ToolbarToggleButton
        active={showSemanticSurfaces}
        onClick={onToggleSemanticSurfaces}
        ariaLabel="Toggle semantic surface colors"
        iconSrc={materialIconUrl}
      >
        Semantics
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

function VersionButton({
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

function DesktopViewportToolbar({
  editMode,
  xrayActive,
  xrayDisabled,
  hasSelectedFeature,
  showSemanticSurfaces,
  pickingMode,
  showVertexGizmo,
  hasSelectedVertex,
  isolateSelectedFeature,
  showTooltips,
  onToggleEditMode,
  onCyclePickingMode,
  onToggleVertexGizmo,
  onToggleXray,
  onToggleSemanticSurfaces,
  onToggleIsolateSelectedFeature,
  onSelectPickingMode,
  onCenterCurrentSelection,
  onRestoreGeometry,
  restoreGeometryDisabled,
  onClearSelection,
}: {
  editMode: boolean
  xrayActive: boolean
  xrayDisabled: boolean
  hasSelectedFeature: boolean
  showSemanticSurfaces: boolean
  pickingMode: ViewerPickingMode
  showVertexGizmo: boolean
  hasSelectedVertex: boolean
  isolateSelectedFeature: boolean
  showTooltips: boolean
  onToggleEditMode: () => void
  onCyclePickingMode: () => void
  onToggleVertexGizmo: () => void
  onToggleXray: () => void
  onToggleSemanticSurfaces: () => void
  onToggleIsolateSelectedFeature: () => void
  onSelectPickingMode: (mode: ViewerPickingMode) => void
  onCenterCurrentSelection: () => void
  onRestoreGeometry: () => void
  restoreGeometryDisabled: boolean
  onClearSelection: () => void
}) {
  const [isPickingMenuOpen, setIsPickingMenuOpen] = useState(false)
  const tooltipsVisible = showTooltips && !isPickingMenuOpen

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
      <ToolbarToggleButton
        active={showSemanticSurfaces}
        onClick={onToggleSemanticSurfaces}
        ariaLabel="Toggle semantic surface colors"
        iconSrc={materialIconUrl}
        showTooltip={tooltipsVisible}
        tooltipHotkey="S"
      >
        Semantics
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
              disabled={editMode}
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

function DesktopViewportStatusBar({
  isPinnedAttributesOpen,
  pinnedAttributeCount,
  isPaneCollapsed,
  activeObjectId,
  viewportCenter,
  selectedVertexIndex,
  cameraFocalLength,
  onCameraFocalLengthChange,
  onSetTopDownView,
  onSetCenter,
  onTogglePinnedAttributesOpen,
}: {
  isPinnedAttributesOpen: boolean
  pinnedAttributeCount: number
  isPaneCollapsed: boolean
  activeObjectId: string | null
  viewportCenter: Vec3 | null
  selectedVertexIndex: number | null
  cameraFocalLength: number
  onCameraFocalLengthChange: (value: number) => void
  onSetTopDownView: () => void
  onSetCenter: (center: Vec3) => void
  onTogglePinnedAttributesOpen: () => void
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
            <span className="shrink-0 text-foreground/75">vtx {selectedVertexIndex}</span>
          )}
        </div>
      </div>
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
    </div>
  )
}

const VIEWPORT_CENTER_AXES = ['x', 'y', 'z'] as const

function ViewportCenterEditor({
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

function formatObjectDisplayId(objectId: string) {
  return objectId.startsWith(BAG_BUILDING_ID_PREFIX)
    ? objectId.slice(BAG_BUILDING_ID_PREFIX.length)
    : objectId
}

function countDatasetObjects(dataset: ViewerDataset) {
  return dataset.features.reduce((count, feature) => count + feature.objects.length, 0)
}

function objectSelectionKey(featureId: string, objectId?: string | null) {
  return `${featureId}::${objectId ?? ''}`
}

function estimateFeatureListRowHeight(item: FeatureListItem, showFeatureSeparator: boolean) {
  const objectRowsHeight = Math.max(item.feature.objects.length, 1) * CITY_OBJECT_TREE_ROW_ESTIMATE
  return showFeatureSeparator
    ? Math.max(FEATURE_LIST_ROW_HEIGHT, objectRowsHeight + FEATURE_SEPARATOR_HEIGHT_ESTIMATE)
    : objectRowsHeight
}

function collectTreeRootIds(objects: ViewerCityObject[], objectById: Map<string, ViewerCityObject>) {
  const roots: string[] = []
  for (const object of objects) {
    if (object.parentIds.length === 0 || object.parentIds.every((parentId) => !objectById.has(parentId))) {
      roots.push(object.id)
    }
  }

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

function collectObjectAncestors(
  object: ViewerCityObject | null,
  objects: ViewerCityObject[],
) {
  if (!object || object.parentIds.length === 0) {
    return []
  }

  const objectById = new Map(objects.map((entry) => [entry.id, entry]))
  const ancestors: ViewerCityObject[] = []
  const visited = new Set<string>()

  const visit = (objectId: string) => {
    if (visited.has(objectId)) {
      return
    }

    visited.add(objectId)
    const parent = objectById.get(objectId)
    if (!parent) {
      return
    }

    ancestors.push(parent)
    parent.parentIds.forEach(visit)
  }

  object.parentIds.forEach(visit)
  return ancestors
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
  const types = new Set<string>()
  for (const geometry of geometries) {
    if (geometry.geometryType) {
      types.add(geometry.geometryType)
    }
  }
  const typeList = Array.from(types)

  if (typeList.length === 0) {
    return null
  }

  if (typeList.length === 1) {
    return typeList[0]
  }

  if (typeList.length === 2) {
    return `${typeList[0]} + ${typeList[1]}`
  }

  return `${typeList[0]} +${typeList.length - 1}`
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

const FeatureObjectTree = memo(function FeatureObjectTree({
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
    <div className="space-y-1">
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

const FeatureObjectTreeNode = memo(function FeatureObjectTreeNode({
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
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={open ? `Collapse ${objectLabel}` : `Expand ${objectLabel}`}
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
          <div className="mt-1 space-y-1 border-l border-border/55 pl-3">
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

function ViewportGeometryModeBar({
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
    <div className="floating-panel pointer-events-auto flex flex-col items-stretch gap-1.5 rounded-sm border p-2">
      <ViewportControlTooltip show={showTooltips} label="LoD" hotkey="L">
        <div className="flex items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">LoD</span>
        </div>
      </ViewportControlTooltip>
      <div className="flex flex-col items-stretch gap-1">
        {modes.map((entry) => {
          const isActive = entry.key === modeKey

          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelectGeometryDisplayMode(entry.mode)}
              className={cn(
                'rounded-sm px-2 py-1 text-left text-[11px] transition',
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

function CopyIdButton({
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

const FeatureListRow = memo(function FeatureListRow({
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
  onHeightChange: (featureId: string, height: number) => void
}) {
  const { feature, isInvalid } = item
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
    const element = rowRef.current
    if (!element) {
      return
    }

    const reportHeight = () => {
      const measuredHeight = Math.ceil(element.getBoundingClientRect().height)
      onHeightChange(
        feature.id,
        showFeatureSeparator
          ? Math.max(measuredHeight, FEATURE_LIST_ROW_HEIGHT)
          : measuredHeight,
      )
    }

    reportHeight()
    const resizeObserver = new ResizeObserver(reportHeight)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [feature.id, onHeightChange, showFeatureSeparator])

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
          objects={feature.objects}
          activeObjectId={activeObjectId}
          errorCountsByObjectId={errorCountsByObjectId}
          onSelectObject={(objectId) => onSelectFeature(feature.id, objectId)}
          onCenterObject={onCenterObject}
        />
      </div>
    </div>
  )
})

const FeatureListPanel = memo(function FeatureListPanel({
  filteredFeatureItems,
  isLoading,
  annotationSourceName,
  datasetFeatureCount,
  showFeatureSeparators,
  showDesktopHeading,
  searchQuery,
  selectedFeatureId,
  showOnlyInvalidFeatures,
  onSearchQueryChange,
  onShowOnlyInvalidFeaturesChange,
  val3dityParameters,
  onVal3dityParametersChange,
  onValidate,
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
  onSearchQueryChange: (event: ChangeEvent<HTMLInputElement>) => void
  onShowOnlyInvalidFeaturesChange: (checked: boolean) => void
  val3dityParameters: Val3dityParameterForm
  onVal3dityParametersChange: (parameters: Val3dityParameterForm) => void
  onValidate: (() => void) | null
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  onCenterObject: (featureId: string, objectId: string) => void
  onShowInfo: (() => void) | null
  activeObjectId: string | null
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const completedAutoScrollKeyRef = useRef<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [rowHeights, setRowHeights] = useState<Map<string, number>>(() => new Map())

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
      const height = rowHeights.get(item.feature.id) ?? estimateFeatureListRowHeight(item, showFeatureSeparators)
      rows.push({ top: nextTop, height })
      nextTop += height + rowGap
    }

    const totalHeight =
      rows.length > 0
        ? rows[rows.length - 1].top + rows[rows.length - 1].height + FEATURE_LIST_BOTTOM_PADDING
        : FEATURE_LIST_TOP_PADDING + FEATURE_LIST_BOTTOM_PADDING

    return { rows, totalHeight }
  }, [filteredFeatureItems, rowHeights, showFeatureSeparators])

  const filteredObjectCount = useMemo(
    () => filteredFeatureItems.reduce((count, item) => count + item.feature.objects.length, 0),
    [filteredFeatureItems],
  )

  const handleRowHeightChange = useCallback((featureId: string, height: number) => {
    setRowHeights((current) => {
      if (current.get(featureId) === height) {
        return current
      }

      const next = new Map(current)
      next.set(featureId, height)
      return next
    })
  }, [])

  const handleListSelectFeature = useCallback((
    featureId: string,
    objectId?: string | null,
  ) => {
    completedAutoScrollKeyRef.current = objectSelectionKey(featureId, objectId)
    onSelectFeature(featureId, objectId)
  }, [onSelectFeature])

  const handleListCenterObject = useCallback((
    featureId: string,
    objectId: string,
  ) => {
    completedAutoScrollKeyRef.current = objectSelectionKey(featureId, objectId)
    onCenterObject(featureId, objectId)
  }, [onCenterObject])

  const scrollSelectedFeatureIntoView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || selectedIndex < 0) {
      return
    }

    const selectedRow = rowLayout.rows[selectedIndex]
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
  }, [rowLayout.rows, selectedIndex, showFeatureSeparators])

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
      completedAutoScrollKeyRef.current = null
      return
    }

    const selectionKey = objectSelectionKey(selectedFeatureId, activeObjectId)
    if (selectedIndex < 0 || completedAutoScrollKeyRef.current === selectionKey) {
      return
    }

    scrollSelectedFeatureIntoView()
    if (!activeObjectId) {
      completedAutoScrollKeyRef.current = selectionKey
      return
    }

    const frameIds: number[] = []
    const scheduleObjectScroll = (attempt: number) => {
      const frameId = window.requestAnimationFrame(() => {
        if (scrollActiveObjectIntoView()) {
          completedAutoScrollKeyRef.current = selectionKey
          return
        }

        if (attempt <= 0) {
          return
        }

        scrollSelectedFeatureIntoView()
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
    (showFeatureSeparators ? FEATURE_LIST_ROW_HEIGHT : CITY_OBJECT_TREE_ROW_ESTIMATE) +
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
  const hasInvalidVal3dityParameters = !isValidVal3dityParameters(val3dityParameters)

  return (
    <>
      <div className="panel-header-surface space-y-2.5 border-b p-4 pb-3">
        {showDesktopHeading && (
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              <Layers className="size-4 text-muted-foreground" />
              CityObjects ({datasetFeatureCount})
            </h1>
            <div className="flex items-center gap-1">
              {onValidate && (
                <div className="flex shrink-0 overflow-hidden rounded-sm border border-input bg-background/55">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-none border-r border-border/55"
                    onClick={onValidate}
                    disabled={hasInvalidVal3dityParameters}
                    aria-label="Run val3dity validation (experimental)"
                    title={hasInvalidVal3dityParameters ? 'Fix val3dity parameters' : 'Run val3dity validation'}
                  >
                    <SearchAlert className="size-4" />
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-6 rounded-none"
                        aria-label="Set val3dity parameters"
                        title="Set val3dity parameters"
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-96 p-0">
                      <Val3dityParametersPopover
                        parameters={val3dityParameters}
                        onChange={onVal3dityParametersChange}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
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

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={onSearchQueryChange}
              placeholder="Search objects"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {annotationSourceName && (
          <div className="flex items-center justify-between rounded-sm bg-foreground/4 px-3 py-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Show errors only</p>
              <p className="text-xs text-foreground/60">
                Showing {filteredObjectCount} of {datasetFeatureCount}
              </p>
            </div>
            <Switch
              checked={showOnlyInvalidFeatures}
              onCheckedChange={onShowOnlyInvalidFeaturesChange}
              className="shrink-0"
              aria-label="Show only objects with validation errors"
            />
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        {filteredFeatureItems.length > 0 ? (
          <div className="relative" style={{ height: `${rowLayout.totalHeight}px` }}>
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

function ViewportControlTooltip({
  show,
  label,
  hotkey,
  children,
}: {
  show: boolean
  label: string
  hotkey?: string
  children: ReactNode
}) {
  return (
    <TooltipProvider>
      <Tooltip open={show}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
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

function ToolbarToggleButton({
  active,
  disabled = false,
  onClick,
  children,
  ariaLabel,
  iconSrc,
  showTooltip = false,
  tooltipHotkey,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  ariaLabel: string
  iconSrc?: string
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
        {iconSrc ? (
          <MaskIcon src={iconSrc} className="size-3.5" />
        ) : (
          <span className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/45')} />
        )}
      </Button>
    </ViewportControlTooltip>
  )
}

function ToolbarPickingButton({
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
      <div
        className="relative inline-flex"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            onMenuOpenChange(false)
          }
        }}
      >
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMenuOpenChange(!isMenuOpen)}
          aria-label="Choose picking mode"
          aria-expanded={isMenuOpen}
          title="Choose picking mode"
          className={cn('h-7 w-5 justify-center rounded-l-none border border-l-0 p-0', activeClassName)}
        >
          <ChevronDown className={cn('size-3 transition-transform', isMenuOpen && 'rotate-180')} />
        </Button>
        {isMenuOpen && (
          <div className="absolute bottom-full right-0 z-30 mb-1 min-w-40 rounded-sm border border-border bg-popover p-1 shadow-lg">
            {availableModes.map((entry) => {
              const isSelected = entry === mode
              const isAvailable = availableModes.includes(entry)

              return (
                <button
                  key={entry}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    onSelectMode(entry)
                    onMenuOpenChange(false)
                  }}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs',
                    isSelected
                      ? 'bg-primary/14 text-primary'
                      : 'text-foreground hover:bg-accent/10',
                    !isAvailable && 'cursor-not-allowed text-muted-foreground/35 hover:bg-transparent',
                  )}
                >
                  <MaskIcon src={getPickingModeIconUrl(entry)} className="size-3.5" />
                  <span>{getPickingModeLabel(entry)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </ViewportControlTooltip>
  )
}

const DetailAttributePanel = memo(function DetailAttributePanel({
  objectAttributes,
  canPinAttributes,
  pinnedAttributeKeys,
  onPinAttribute,
  onUnpinAttribute,
}: {
  objectAttributes: Record<string, unknown>
  canPinAttributes: boolean
  pinnedAttributeKeys: string[]
  onPinAttribute: (key: string) => void
  onUnpinAttribute: (key: string) => void
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
      canPinAttributes={canPinAttributes}
      pinnedAttributeKeys={pinnedAttributeKeys}
      onPinAttribute={onPinAttribute}
      onUnpinAttribute={onUnpinAttribute}
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
        const lodChip = {
          key: `lod:${geometry.index}:${geometry.lod ?? 'none'}`,
          label: geometry.lod ? `LoD ${geometry.lod}` : 'No LoD',
        }

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
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/90">
                  <Pyramid className="size-3.5 text-muted-foreground" />
                  geom {geometry.index}
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
          </div>
        )
      })}
    </div>
  )
})

function AttributeSection({
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

const AttributeList = memo(function AttributeList({
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
    <dl className="m-0 min-w-0 space-y-2">
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

function InfoPanel({
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
            <PopoverTrigger asChild>
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
            </PopoverTrigger>
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
        <div className="space-y-1.5 p-1.5">
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

function PinnedAttributesSettingsPopover({
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
      <div className="flex items-center justify-between gap-2 border-b border-border/55 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground/86">Inherited values</p>
          <p className="text-[11px] text-muted-foreground">Use parent value when missing</p>
        </div>
        <Switch
          checked={inheritsParent}
          onCheckedChange={onInheritsParentChange}
          aria-label="Use parent attributes"
        />
      </div>
      <div className="border-b border-border/55 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search attributes…"
            className="h-8 pl-7 text-xs"
            autoFocus
          />
        </div>
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

function InfoPanelSectionBlock({
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

function SemanticSurfacePanel({
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

function PinnedAttributesInfoSection({
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

function SemanticSurfaceInfoSection({
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

function ColorMapSwatch({ colorMapId, className }: { colorMapId: AttributeColorMapId; className?: string }) {
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

function ColorMapSelect({
  value,
  groups,
  onChange,
}: {
  value: AttributeColorMapId
  groups: readonly ColorMapGroup[]
  onChange: (colorMapId: AttributeColorMapId) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Attribute color map"
          className="h-9 min-w-0 flex-1 justify-between gap-2 px-2.5 font-normal"
        >
          <ColorMapSwatch colorMapId={value} className="h-3 w-12 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left text-sm">{formatColorMapName(value)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-[var(--radix-popover-trigger-width)] p-1">
        <div className="max-h-72 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </div>
              {group.options.map((entry) => {
                const isSelected = entry === value
                return (
                  <button
                    key={entry}
                    type="button"
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                      isSelected && 'bg-accent/15',
                    )}
                    onClick={() => {
                      onChange(entry)
                      setOpen(false)
                    }}
                  >
                    <ColorMapSwatch colorMapId={entry} className="h-3 w-12 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{formatColorMapName(entry)}</span>
                    {isSelected && <Check className="size-3.5 shrink-0 text-accent" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AttributeColorSection({
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
    <div className="space-y-3">
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
            <div className="space-y-1">
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
                  minStepsBetweenThumbs={0}
                  onValueChange={(value) => {
                    const [nextMin, nextMax] = value
                    if (nextMin == null || nextMax == null) return
                    previewDomain({
                      key: model.key,
                      min: Math.min(nextMin, nextMax),
                      max: Math.max(nextMin, nextMax),
                    })
                  }}
                  onValueCommit={(value) => {
                    const [nextMin, nextMax] = value
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

function CategoricalAttributeColorSection({
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
      <div className="space-y-2">
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
          <div className="space-y-1">
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
    <div className="space-y-2">
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

function CategoryLegend({
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
    <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
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

function CategoryColorPicker({
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
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
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

function getAvailablePickingModes(editMode: boolean) {
  if (editMode) return EDIT_PICKING_MODES
  return VIEW_PICKING_MODES
}

function nextPickingMode(mode: ViewerPickingMode, editMode: boolean): ViewerPickingMode {
  const modes = getAvailablePickingModes(editMode)
  const currentIndex = modes.indexOf(mode)
  return modes[(currentIndex + 1) % modes.length] ?? modes[0]
}

function isCityJsonFileName(name: string) {
  return (
    name.endsWith('.jsonl') ||
    name.endsWith('.city.jsonl') ||
    name.endsWith('.city.json') ||
    name.endsWith('.cityjson')
  )
}

function stripGzSuffix(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.toLowerCase().endsWith('.gz')) {
      parsed.pathname = parsed.pathname.slice(0, -3)
      return parsed.toString()
    }
    return url
  } catch {
    return url.toLowerCase().endsWith('.gz') ? url.slice(0, -3) : url
  }
}

function tryParseHttpUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

function buildVal3dityValidationOptions(parameters: Val3dityParameterForm): Val3dityValidationOptions {
  const options: Val3dityValidationOptions = {}
  const tolSnap = parseVal3dityParameterValue(parameters.tolSnap, 0)
  const planarityD2pTol = parseVal3dityParameterValue(parameters.planarityD2pTol, 0)
  const planarityNTol = parseVal3dityParameterValue(parameters.planarityNTol, 0)
  const overlapTol = parseVal3dityParameterValue(parameters.overlapTol, -Infinity)

  if (tolSnap != null) {
    options.tolSnap = tolSnap
  }
  if (planarityD2pTol != null) {
    options.planarityD2pTol = planarityD2pTol
  }
  if (planarityNTol != null) {
    options.planarityNTol = planarityNTol
  }
  if (overlapTol != null) {
    options.overlapTol = overlapTol
  }
  if (parameters.primitive !== 'auto') {
    options.primitive = parameters.primitive
  }

  return options
}

function parseVal3dityParameterValue(value: string, min: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= min ? parsed : null
}

function isValidVal3dityParameterValue(value: string, min: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= min
}

function isValidVal3dityParameters(parameters: Val3dityParameterForm) {
  return (
    isValidVal3dityParameterValue(parameters.tolSnap, 0) &&
    isValidVal3dityParameterValue(parameters.planarityD2pTol, 0) &&
    isValidVal3dityParameterValue(parameters.planarityNTol, 0) &&
    isValidVal3dityParameterValue(parameters.overlapTol, -Infinity)
  )
}

function deriveSourceNameFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last) {
      return decodeURIComponent(last)
    }
    return parsed.host || url
  } catch {
    return url
  }
}

function getPickingModeIconUrl(mode: ViewerPickingMode) {
  switch (mode) {
    case 'none':
      return restrictSelectOnIconUrl
    case 'object':
      return restrictSelectOffIconUrl
    case 'face':
      return faceSelectIconUrl
    case 'vertex':
      return vertexSelectIconUrl
  }
}

function getPickingModeLabel(mode: ViewerPickingMode) {
  switch (mode) {
    case 'none':
      return 'Off'
    case 'object':
      return 'Object'
    case 'face':
      return 'Face'
    case 'vertex':
      return 'Vertex'
  }
}

function getPickingModeDescription(mode: ViewerPickingMode) {
  switch (mode) {
    case 'none':
      return 'Picking disabled'
    case 'object':
      return 'Pick object'
    case 'face':
      return 'Pick face'
    case 'vertex':
      return 'Pick vertex'
  }
}

function getThemeModeLabel(themeMode: ThemeMode) {
  switch (themeMode) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    case 'system':
      return 'Auto'
  }
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

function InfoDialog({
  dataset,
  annotationSourceName,
  onClose,
}: {
  dataset: ViewerDataset
  annotationSourceName: string | null
  onClose: () => void
}) {
  const metadataEntries = dataset.metadata
    ? Object.entries(dataset.metadata).filter(([, value]) => !isEmptyMetadataValue(value))
    : []

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/42 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
        className="flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-border/45 bg-background shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]"
      >
        <div className="border-b border-border/40 bg-gradient-to-r from-primary/8 via-transparent to-transparent">
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p
                  id="info-dialog-title"
                  className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary"
                >
                  File information
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="min-w-0 max-w-full truncate text-sm text-muted-foreground">{dataset.sourceName}</p>
                  <Badge variant="secondary" className="border-primary/10 bg-primary/10 text-primary">
                    {dataset.cityJsonKind}
                  </Badge>
                  {annotationSourceName && <Badge variant="outline">Validation loaded</Badge>}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onClose}
              aria-label="Close information dialog"
              title="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            <section>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                CityJSON
              </p>
              <dl className="mt-2.5 space-y-2 text-sm">
                <InfoRow label="Version" value={dataset.cityJsonVersion ?? '—'} />
                <InfoRow label="Features" value={dataset.features.length.toString()} mono />
                {dataset.transform && (
                  <>
                    <InfoRow
                      label="Scale"
                      value={formatCoordinateTriple(dataset.transform.scale)}
                      mono
                    />
                    <InfoRow
                      label="Translate"
                      value={formatCoordinateTriple(dataset.transform.translate)}
                      mono
                    />
                  </>
                )}
              </dl>
            </section>

            {metadataEntries.length > 0 && (
              <section>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Metadata
                </p>
                <dl className="mt-2.5 space-y-2 text-sm">
                  {metadataEntries.map(([key, value]) => (
                    <InfoRow
                      key={key}
                      label={formatMetadataKey(key)}
                      value={<MetadataValue metadataKey={key} value={value} />}
                    />
                  ))}
                </dl>
              </section>
            )}

            {annotationSourceName && (
              <section>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Val3dity report
                </p>
                <p className="mt-2.5 truncate text-sm font-medium text-foreground">{annotationSourceName}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Val3dityParametersPopover({
  parameters,
  onChange,
}: {
  parameters: Val3dityParameterForm
  onChange: (parameters: Val3dityParameterForm) => void
}) {
  const hasInvalidNumber =
    !isValidVal3dityParameterValue(parameters.tolSnap, 0) ||
    !isValidVal3dityParameterValue(parameters.planarityD2pTol, 0) ||
    !isValidVal3dityParameterValue(parameters.planarityNTol, 0) ||
    !isValidVal3dityParameterValue(parameters.overlapTol, -Infinity)

  const updateDraft = (key: keyof Val3dityParameterForm, value: string) => {
    onChange({ ...parameters, [key]: value })
  }

  return (
    <div>
      <div className="border-b border-border/40 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
          Val3dity parameters (experimental)
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Val3dityNumberInput
            id="val3dity-tol-snap"
            label="Snap tolerance"
            min="0"
            step="0.001"
            value={parameters.tolSnap}
            onChange={(value) => updateDraft('tolSnap', value)}
          />
          <Val3dityNumberInput
            id="val3dity-overlap-tol"
            label="Overlap tolerance"
            step="0.1"
            value={parameters.overlapTol}
            onChange={(value) => updateDraft('overlapTol', value)}
          />
          <Val3dityNumberInput
            id="val3dity-planarity-d2p-tol"
            label="Planarity distance"
            min="0"
            step="0.01"
            value={parameters.planarityD2pTol}
            onChange={(value) => updateDraft('planarityD2pTol', value)}
          />
          <Val3dityNumberInput
            id="val3dity-planarity-n-tol"
            label="Planarity normal"
            min="0"
            step="0.1"
            value={parameters.planarityNTol}
            onChange={(value) => updateDraft('planarityNTol', value)}
          />
        </div>

        <label className="block space-y-1.5" htmlFor="val3dity-primitive">
          <span className="text-xs font-medium text-muted-foreground">Primitive</span>
          <select
            id="val3dity-primitive"
            value={parameters.primitive}
            onChange={(event) =>
              onChange({
                ...parameters,
                primitive: event.target.value as Val3dityPrimitiveOption,
              })}
            className="flex h-10 w-full rounded-sm border border-input bg-background/70 px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="auto">Auto</option>
            <option value="Solid">Solid</option>
            <option value="MultiSurface">MultiSurface</option>
            <option value="CompositeSurface">CompositeSurface</option>
          </select>
        </label>

        {hasInvalidNumber && (
          <p className="rounded-sm border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            Snap and planarity tolerances must be non-negative numbers; overlap tolerance must be numeric.
          </p>
        )}
      </div>

      <div className="flex justify-end border-t border-border/40 p-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(DEFAULT_VAL3DITY_PARAMETERS)}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}

function Val3dityNumberInput({
  id,
  label,
  min,
  step,
  value,
  onChange,
}: {
  id: string
  label: string
  min?: string
  step: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ChangelogDialog({
  changelog,
  onClose,
}: {
  changelog: string
  onClose: () => void
}) {
  const sections = parseChangelog(changelog)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/42 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-dialog-title"
        className="flex min-h-0 max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-border/45 bg-background shadow-[0_28px_100px_rgb(0_0_0_/_0.28)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/40 p-5">
          <div className="min-w-0">
            <p
              id="changelog-dialog-title"
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary"
            >
              Changelog
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-sm text-muted-foreground">CJLoupe</p>
              <span className="text-sm font-bold text-foreground">
                v{APP_VERSION}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onClose}
            aria-label="Close changelog"
            title="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-sm font-semibold text-foreground">{section.heading}</h2>
                {section.items.length > 0 && (
                  <ul className="mt-2 space-y-1.5 text-sm leading-6 text-foreground/82">
                    {section.items.map((item, index) => (
                      <li key={`${section.heading}:${index}`} className="flex gap-2">
                        <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-sm border border-border/45 bg-foreground/[0.03] px-2.5 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words text-sm leading-5 text-foreground',
          mono && 'font-mono text-[12px]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function MetadataValue({
  metadataKey,
  value,
}: {
  metadataKey?: string
  value: unknown
}): ReactNode {
  if (value == null) {
    return <span className="text-muted-foreground">—</span>
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-[12px]">{String(value)}</span>
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'true' : 'false'}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">—</span>
    }

    if (isGeographicalExtentKey(metadataKey) && isNumberArray(value) && value.length >= 6) {
      return (
        <ExtentCoordinates min={value.slice(0, 3)} max={value.slice(3, 6)} />
      )
    }

    const allPrimitive = value.every(
      (entry) =>
        entry == null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
    )

    if (allPrimitive) {
      const isContinuousArray = isNumberArray(value)
      const rendered = value.map((entry) => formatMetadataPrimitive(entry)).join(', ')
      return <span className={isContinuousArray ? 'font-mono text-[12px]' : undefined}>{rendered}</span>
    }

    return (
      <div className="space-y-2">
        {value.map((entry, index) => (
          <div key={index} className="rounded-sm border border-border/45 bg-background/60 px-2.5 py-2">
            <MetadataValue value={entry} />
          </div>
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    return (
      <dl className="mt-1 space-y-2 border-l border-border/45 pl-3">
        {Object.entries(value as Record<string, unknown>)
          .filter(([, nested]) => !isEmptyMetadataValue(nested))
          .map(([nestedKey, nestedValue]) => (
            <div key={nestedKey}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {formatMetadataKey(nestedKey)}
              </dt>
              <dd className="mt-0.5 break-words text-foreground">
                <MetadataValue metadataKey={nestedKey} value={nestedValue} />
              </dd>
            </div>
          ))}
      </dl>
    )
  }

  return String(value)
}

function parseChangelog(markdown: string): Array<{ heading: string; items: string[] }> {
  const sections: Array<{ heading: string; items: string[] }> = []
  let current: { heading: string; items: string[] } | null = null

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()

    if (line.startsWith('## ')) {
      current = { heading: line.replace(/^##\s+/, ''), items: [] }
      sections.push(current)
      continue
    }

    if (!current || !line.startsWith('- ')) {
      continue
    }

    current.items.push(line.replace(/^-\s+/, ''))
  }

  return sections
}

function ExtentCoordinates({
  min,
  max,
}: {
  min: number[]
  max: number[]
}) {
  const dimensions = min.map((entry, index) => (max[index] ?? entry) - entry)
  const rows = [
    { label: 'min', values: min, formatValue: String },
    { label: 'max', values: max, formatValue: String },
    { label: 'dim', values: dimensions, formatValue: formatDimensionValue },
  ]

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="grid w-max grid-cols-[2.5rem_repeat(3,max-content)] gap-x-2 gap-y-0.5 font-mono text-[12px]">
        {rows.map((row) => (
          <span key={row.label} className="contents">
            <span aria-hidden="true" className="select-none text-muted-foreground">
              {row.label}:
            </span>
            {row.values.map((entry, index) => (
              <span key={index}>
                {row.formatValue(entry)}
                {index < row.values.length - 1 ? ',' : ''}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

function isEmptyMetadataValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.every(isEmptyMetadataValue)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isEmptyMetadataValue)
  }
  return false
}

function formatMetadataKey(key: string) {
  const withSpaces = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase()
}

function isGeographicalExtentKey(key: string | undefined) {
  return key?.toLowerCase() === 'geographicalextent'
}

function isNumberArray(value: unknown[]): value is number[] {
  return value.every((entry) => typeof entry === 'number')
}

function formatDimensionValue(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, '')
}

function formatContinuousInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(8)).toString()
}

function formatColorMapName(colorMapId: AttributeColorMapId) {
  return colorMapId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (match) => match.toUpperCase())
}

function getContinuousAttributeColorMapColors(colorMapId: AttributeColorMapId) {
  return ATTRIBUTE_COLOR_MAPS[colorMapId as ContinuousAttributeColorMapId] ?? ATTRIBUTE_COLOR_MAPS.viridis
}

function getColorMapPreviewBackground(colorMapId: AttributeColorMapId): string | null {
  const continuous = ATTRIBUTE_COLOR_MAPS[colorMapId as ContinuousAttributeColorMapId]
  if (continuous) {
    return `linear-gradient(to right, ${continuous.join(', ')})`
  }

  const qualitative = QUALITATIVE_COLOR_MAPS[colorMapId as QualitativeAttributeColorMapId]
  if (qualitative) {
    const stops: string[] = []
    qualitative.forEach((color, index) => {
      const start = (index / qualitative.length) * 100
      const end = ((index + 1) / qualitative.length) * 100
      stops.push(`${color} ${start}%`, `${color} ${end}%`)
    })
    return `linear-gradient(to right, ${stops.join(', ')})`
  }

  return null
}

function normalizeHexColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : ATTRIBUTE_COLOR_MISSING
}

function formatMetadataPrimitive(value: string | number | boolean | null): string {
  if (value == null) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

export default App

function cloneVertices(vertices: Vec3[]) {
  return vertices.map((vertex) => [...vertex] as Vec3)
}

function cloneObjectGeometries(geometries: ViewerObjectGeometry[]) {
  return geometries.map((geometry) => ({
    ...geometry,
    polygons: clonePolygonRingsList(geometry.polygons),
    semanticSurfaces: geometry.semanticSurfaces.map((surface) =>
      surface
        ? {
            ...surface,
            attributes: { ...surface.attributes },
          }
        : null,
    ),
    sourceFaceIndices: [...geometry.sourceFaceIndices],
    vertexIndices: [...geometry.vertexIndices],
  }))
}

function clonePolygonRingsList(polygons: PolygonRings[]) {
  return polygons.map((polygon) => polygon.map((ring) => [...ring]))
}

function formatCoordinateTriple(coordinates: Vec3) {
  return `${coordinates[0].toFixed(3)}, ${coordinates[1].toFixed(3)}, ${coordinates[2].toFixed(3)}`
}

function getFaceVertexCycle(rings: number[][] | null, ringIndex: number) {
  const targetRing = rings?.[ringIndex] ?? []
  return [...targetRing]
}

function collectGeometryVertexIndices(polygons: PolygonRings[]) {
  const indices = new Set<number>()

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const index of ring) {
        if (typeof index === 'number') {
          indices.add(index)
        }
      }
    }
  }

  return Array.from(indices).toSorted((left, right) => left - right)
}

function buildAttributeColorModel(
  dataset: ViewerDataset | null,
  key: string | null,
  inheritFromParents: boolean,
  colorMapId: AttributeColorMapId,
  colorMapColors: readonly string[],
  categoricalColorSeed: number,
  customCategoricalColors: Record<string, string>,
): AttributeColorModel | null {
  if (!dataset || !key) {
    return null
  }

  const valuesByObjectKey: Record<string, number> = {}
  const values: number[] = []
  const categoricalValuesByObjectKey: Record<string, string> = {}
  const categoricalLabelsByKey = new Map<string, string>()
  const categoricalCountsByKey = new Map<string, number>()
  let objectCount = 0
  let missingCount = 0
  let hasCategoricalValue = false
  let hasNonMissingValue = false

  for (const feature of dataset.features) {
    const objectById = inheritFromParents
      ? new Map(feature.objects.map((object) => [object.id, object]))
      : null

    for (const object of feature.objects) {
      objectCount += 1
      const rawValue = resolveObjectAttribute(object, key, objectById)
      const value = parseContinuousAttributeValue(rawValue)
      const objectKey = viewerObjectKey(feature.id, object.id)
      if (value == null) {
        const categoricalValue = parseCategoricalAttributeValue(rawValue)
        if (!categoricalValue) {
          missingCount += 1
          continue
        }

        hasCategoricalValue = true
        hasNonMissingValue = true
        categoricalValuesByObjectKey[objectKey] = categoricalValue.key
        categoricalLabelsByKey.set(categoricalValue.key, categoricalValue.label)
        categoricalCountsByKey.set(categoricalValue.key, (categoricalCountsByKey.get(categoricalValue.key) ?? 0) + 1)
        continue
      }

      hasNonMissingValue = true
      valuesByObjectKey[objectKey] = value
      values.push(value)
      const categoricalValue = parseCategoricalAttributeValue(rawValue)
      if (categoricalValue) {
        categoricalValuesByObjectKey[objectKey] = categoricalValue.key
        categoricalLabelsByKey.set(categoricalValue.key, categoricalValue.label)
        categoricalCountsByKey.set(categoricalValue.key, (categoricalCountsByKey.get(categoricalValue.key) ?? 0) + 1)
      }
    }
  }

  if (hasCategoricalValue) {
    return buildCategoricalAttributeColorModel({
      key,
      categoricalValuesByObjectKey,
      categoricalLabelsByKey,
      categoricalCountsByKey,
      missingCount,
      objectCount,
      colorMapId,
      colorMapColors,
      categoricalColorSeed,
      customCategoricalColors,
    })
  }

  if (values.length === 0) {
    return {
      kind: 'continuous',
      key,
      valuesByObjectKey,
      values,
      dataMin: 0,
      dataMax: 1,
      continuousCount: 0,
      missingCount: hasNonMissingValue ? missingCount : objectCount,
      objectCount,
      bins: [],
    }
  }

  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const bins = buildAttributeColorBins(values, dataMin, dataMax, colorMapColors)

  return {
    kind: 'continuous',
    key,
    valuesByObjectKey,
    values,
    dataMin,
    dataMax,
    continuousCount: values.length,
    missingCount,
    objectCount,
    bins,
  }
}

function buildCategoricalAttributeColorModel({
  key,
  categoricalValuesByObjectKey,
  categoricalLabelsByKey,
  categoricalCountsByKey,
  missingCount,
  objectCount,
  colorMapId,
  colorMapColors,
  categoricalColorSeed,
  customCategoricalColors,
}: {
  key: string
  categoricalValuesByObjectKey: Record<string, string>
  categoricalLabelsByKey: Map<string, string>
  categoricalCountsByKey: Map<string, number>
  missingCount: number
  objectCount: number
  colorMapId: AttributeColorMapId
  colorMapColors: readonly string[]
  categoricalColorSeed: number
  customCategoricalColors: Record<string, string>
}): CategoricalAttributeColorModel {
  const sortedCategoryKeys = Array.from(categoricalCountsByKey.keys()).toSorted((left, right) =>
    (categoricalLabelsByKey.get(left) ?? left).localeCompare(categoricalLabelsByKey.get(right) ?? right, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  )
  const categories = sortedCategoryKeys.map((categoryKey, index) => {
    const label = categoricalLabelsByKey.get(categoryKey) ?? categoryKey
    return {
      key: categoryKey,
      label,
      count: categoricalCountsByKey.get(categoryKey) ?? 0,
      color: getCategoricalAttributeColor(
        key,
        categoryKey,
        index,
        sortedCategoryKeys.length,
        colorMapId,
        colorMapColors,
        categoricalColorSeed,
        customCategoricalColors[categoryKey],
      ),
      index,
    }
  })
  const categoryByKey = new Map(categories.map((category) => [category.key, category]))
  const valuesByObjectKey: Record<string, number> = {}
  const directColorsByObjectKey: Record<string, string> = {}

  for (const [objectKey, categoryKey] of Object.entries(categoricalValuesByObjectKey)) {
    const category = categoryByKey.get(categoryKey)
    if (!category) {
      continue
    }

    valuesByObjectKey[objectKey] = category.index
    directColorsByObjectKey[objectKey] = category.color
  }

  return {
    kind: 'categorical',
    key,
    valuesByObjectKey,
    directColorsByObjectKey,
    categories,
    valueCount: Object.keys(valuesByObjectKey).length,
    missingCount,
    objectCount,
  }
}

function getDefaultAttributeColorDomain(model: ContinuousAttributeColorModel): AttributeColorDomain {
  return {
    key: model.key,
    min: model.dataMin,
    max: model.dataMax,
  }
}

function clampAttributeColorDomain(
  domain: AttributeColorDomain,
  dataMin: number,
  dataMax: number,
): AttributeColorDomain {
  const min = clampNumber(domain.min, dataMin, dataMax)
  const max = clampNumber(domain.max, dataMin, dataMax)
  return {
    key: domain.key,
    min: Math.min(min, max),
    max: Math.max(min, max),
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveObjectAttribute(
  object: ViewerCityObject,
  key: string,
  objectById: Map<string, ViewerCityObject> | null,
) {
  const direct = object.attributes[key]
  if (!isMissingAttributeValue(direct) || !objectById) {
    return direct
  }

  const visited = new Set<string>()
  const visit = (objectId: string): unknown => {
    if (visited.has(objectId)) {
      return null
    }

    visited.add(objectId)
    const parent = objectById.get(objectId)
    if (!parent) {
      return null
    }

    const value = parent.attributes[key]
    if (!isMissingAttributeValue(value)) {
      return value
    }

    for (const parentId of parent.parentIds) {
      const inheritedValue = visit(parentId)
      if (inheritedValue != null) {
        return inheritedValue
      }
    }

    return null
  }

  for (const parentId of object.parentIds) {
    const inheritedValue = visit(parentId)
    if (inheritedValue != null) {
      return inheritedValue
    }
  }

  return null
}

function isMissingAttributeValue(value: unknown) {
  return value == null || (typeof value === 'string' && value.trim().length === 0)
}

function parseContinuousAttributeValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseCategoricalAttributeValue(value: unknown): { key: string; label: string } | null {
  if (isMissingAttributeValue(value)) {
    return null
  }

  if (typeof value === 'string') {
    const label = value.trim()
    return { key: `string:${label}`, label }
  }

  if (typeof value === 'boolean') {
    const label = value ? 'true' : 'false'
    return { key: `boolean:${label}`, label }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const label = formatDimensionValue(value)
    return { key: `number:${value}`, label }
  }

  const label = formatValue(value)
  return { key: `value:${label}`, label }
}

function getCategoricalAttributeColor(
  attributeKey: string,
  categoryKey: string,
  categoryIndex: number,
  categoryCount: number,
  colorMapId: AttributeColorMapId,
  colorMapColors: readonly string[],
  categoricalColorSeed: number,
  customColor: string | undefined,
) {
  if (colorMapId === 'random') {
    return customColor ?? randomColorFromString(`${categoricalColorSeed}:${attributeKey}:${categoryKey}`)
  }

  const qualitativeColors = QUALITATIVE_COLOR_MAPS[colorMapId as QualitativeAttributeColorMapId]
  if (qualitativeColors) {
    return qualitativeColors[categoryIndex % qualitativeColors.length] ?? ATTRIBUTE_COLOR_MISSING
  }

  const t = categoryCount <= 1 ? 0.5 : categoryIndex / (categoryCount - 1)
  return sampleColorMap(colorMapColors, t)
}

function randomColorFromString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  const hue = Math.abs(hash % 360)
  const saturation = 58 + Math.abs((hash >>> 8) % 24)
  const lightness = 42 + Math.abs((hash >>> 16) % 18)
  return hslToHex(hue, saturation / 100, lightness / 100)
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const huePrime = hue / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  const [red1, green1, blue1] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]
  const match = lightness - chroma / 2
  const channels = [red1, green1, blue1].map((channel) =>
    Math.round((channel + match) * 255),
  )
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function buildAttributeColorBins(
  values: number[],
  dataMin: number,
  dataMax: number,
  colorMapColors: readonly string[],
) {
  const binCount = Math.min(ATTRIBUTE_COLOR_BIN_COUNT, Math.max(values.length, 1))
  const span = Math.max(dataMax - dataMin, 0.000001)
  const bins: AttributeColorBin[] = Array.from({ length: binCount }, (_, index) => {
    const start = dataMin + (span * index) / binCount
    const end = index === binCount - 1 ? dataMax : dataMin + (span * (index + 1)) / binCount
    const t = binCount === 1 ? 0.5 : index / (binCount - 1)
    return {
      start,
      end,
      count: 0,
      color: sampleColorMap(colorMapColors, t),
    }
  })

  for (const value of values) {
    const index = Math.min(Math.floor(((value - dataMin) / span) * binCount), binCount - 1)
    bins[Math.max(index, 0)].count += 1
  }

  return bins
}

function sampleColorMap(colors: readonly string[], t: number) {
  if (colors.length === 0) {
    return ATTRIBUTE_COLOR_MISSING
  }

  if (colors.length === 1) {
    return colors[0] ?? ATTRIBUTE_COLOR_MISSING
  }

  const clampedT = Math.min(Math.max(t, 0), 1)
  const scaledIndex = clampedT * (colors.length - 1)
  const leftIndex = Math.floor(scaledIndex)
  const rightIndex = Math.min(leftIndex + 1, colors.length - 1)
  return mixHexColors(colors[leftIndex] ?? colors[0], colors[rightIndex] ?? colors[colors.length - 1], scaledIndex - leftIndex)
}

function mixHexColors(left: string, right: string, t: number) {
  const leftRgb = parseHexColor(left)
  const rightRgb = parseHexColor(right)
  const clampedT = Math.min(Math.max(t, 0), 1)
  const mixed = leftRgb.map((channel, index) =>
    Math.round(channel + (rightRgb[index] - channel) * clampedT),
  )
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function parseHexColor(value: string) {
  const normalized = value.replace('#', '')
  return [0, 1, 2].map((index) => Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16))
}

function getCurrentFaceIndexForSourceFace(geometry: ViewerObjectGeometry, sourceFaceIndex: number) {
  const currentFaceIndex = geometry.sourceFaceIndices.indexOf(sourceFaceIndex)
  return currentFaceIndex >= 0 ? currentFaceIndex : null
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
