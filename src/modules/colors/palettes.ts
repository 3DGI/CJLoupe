export type ContinuousAttributeColorMapId = keyof typeof ATTRIBUTE_COLOR_MAPS
export type QualitativeAttributeColorMapId = keyof typeof QUALITATIVE_COLOR_MAPS
export type AttributeColorMapId = ContinuousAttributeColorMapId | QualitativeAttributeColorMapId | 'random'
export type AttributeColorDomain = { key: string; min: number; max: number }
export type ContinuousAttributeColorModel = {
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
export type CategoricalAttributeColorModel = {
  kind: 'categorical'
  key: string
  valuesByObjectKey: Record<string, number>
  directColorsByObjectKey: Record<string, string>
  categories: AttributeColorCategory[]
  valueCount: number
  missingCount: number
  objectCount: number
}
export type AttributeColorModel = ContinuousAttributeColorModel | CategoricalAttributeColorModel
export type AttributeColorBin = {
  start: number
  end: number
  count: number
  color: string
}
export type AttributeColorCategory = {
  key: string
  label: string
  count: number
  color: string
  index: number
}

export const ATTRIBUTE_COLOR_MISSING = '#94a3b8'
export const ATTRIBUTE_COLOR_BIN_COUNT = 24
export const ATTRIBUTE_COLOR_MAPS = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
  magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
  cividis: ['#00204d', '#173c6d', '#345d7e', '#4f7c7b', '#6c9974', '#8bb56b', '#accd66', '#d0e264', '#fdea45', '#ffffe5'],
  turbo: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#f9b233', '#7a0403'],
  coolwarm: ['#3b4cc0', '#5977e3', '#82a6fb', '#b1cbfc', '#dddcdc', '#f2cbb7', '#f7a889', '#e7745b', '#c53334', '#b40426'],
} as const
export const QUALITATIVE_COLOR_MAPS = {
  tableau10: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
  set3: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
  paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
  dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
} as const
export const DEFAULT_ATTRIBUTE_COLOR_MAP_ID: AttributeColorMapId = 'viridis'
export const DEFAULT_CATEGORICAL_COLOR_MAP_ID: AttributeColorMapId = 'tableau10'
export type ColorMapGroup = { label: string; options: readonly AttributeColorMapId[] }
export const CONTINUOUS_COLORMAP_GROUPS: readonly ColorMapGroup[] = [
  { label: 'Sequential', options: ['viridis', 'plasma', 'inferno', 'magma', 'cividis', 'turbo'] },
  { label: 'Diverging', options: ['coolwarm'] },
]
export const CATEGORICAL_COLORMAP_GROUPS: readonly ColorMapGroup[] = [
  { label: 'Qualitative', options: ['random', ...Object.keys(QUALITATIVE_COLOR_MAPS) as QualitativeAttributeColorMapId[]] },
  { label: 'Sequential', options: ['viridis', 'plasma', 'inferno', 'magma', 'cividis', 'turbo'] },
  { label: 'Diverging', options: ['coolwarm'] },
]
export const CATEGORICAL_ATTRIBUTE_DISPLAY_LIMIT = 32
export const CATEGORICAL_ATTRIBUTE_HIGH_CARDINALITY_LIMIT = 200
export const CATEGORICAL_ATTRIBUTE_SINGLETON_RATIO = 0.85

export function getDefaultAttributeColorDomain(model: ContinuousAttributeColorModel): AttributeColorDomain {
  return {
    key: model.key,
    min: model.dataMin,
    max: model.dataMax,
  }
}

export function parseContinuousAttributeValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseCategoricalAttributeValue(value: unknown): { key: string; label: string } | null {
  if ((value == null || (typeof value === 'string' && value.trim().length === 0))) {
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

export function getCategoricalAttributeColor(
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

export function randomColorFromString(value: string) {
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

export function hslToHex(hue: number, saturation: number, lightness: number) {
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

export function sampleColorMap(colors: readonly string[], t: number) {
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

export function mixHexColors(left: string, right: string, t: number) {
  const leftRgb = parseHexColor(left)
  const rightRgb = parseHexColor(right)
  const clampedT = Math.min(Math.max(t, 0), 1)
  const mixed = leftRgb.map((channel, index) =>
    Math.round(channel + (rightRgb[index] - channel) * clampedT),
  )
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function parseHexColor(value: string) {
  const normalized = value.replace('#', '')
  return [0, 1, 2].map((index) => Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16))
}

export function getContinuousAttributeColorMapColors(colorMapId: AttributeColorMapId) {
  return ATTRIBUTE_COLOR_MAPS[colorMapId as ContinuousAttributeColorMapId] ?? ATTRIBUTE_COLOR_MAPS.viridis
}

export function getColorMapPreviewBackground(colorMapId: AttributeColorMapId): string | null {
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

export function normalizeHexColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : ATTRIBUTE_COLOR_MISSING
}

export function isAttributeColorMapId(value: string): value is AttributeColorMapId {
  return value === 'random' ||
    Object.prototype.hasOwnProperty.call(ATTRIBUTE_COLOR_MAPS, value) ||
    Object.prototype.hasOwnProperty.call(QUALITATIVE_COLOR_MAPS, value)
}

export function formatColorMapName(colorMapId: AttributeColorMapId) {
  return colorMapId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (match) => match.toUpperCase())
}

export function formatValue(value: unknown) {
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

export function formatDimensionValue(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, '')
}

