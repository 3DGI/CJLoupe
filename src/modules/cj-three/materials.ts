import * as THREE from 'three'
import { viewerObjectKey } from '../cityjson-core/identity'
import type { ViewerDataset, ViewerSemanticSurface, ViewerValidationError } from '../cityjson-core/types'
import { errorColor } from '../colors/error-palette'
import { semanticSurfaceColor } from '../colors/semantic-surface-colors'
import type { ViewerAttributeColorState } from '../colors/types'
import type { AttributeColorSharedUniforms, AttributeColorUniforms, BatchColorMode, LayerState, NormalColorUniforms, SelectionTintUniforms, SemanticSurfaceSharedUniforms, Theme, ViewerAppearanceMode } from './types'

export const OBJECT_TYPE_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    bridge: '#7aa6b8',
    bridgeconstructiveelement: '#6f99aa',
    bridgefurniture: '#96a7af',
    bridgeinstallation: '#89b6c4',
    bridgepart: '#86adbc',
    bridgeroom: '#9db5bf',
    building: '#b8aa94',
    buildingconstructiveelement: '#a99b86',
    buildingfurniture: '#c1b195',
    buildinginstallation: '#c3aa83',
    buildingpart: '#c2b29a',
    buildingroom: '#d0c0a4',
    cityfurniture: '#d1a14b',
    cityobjectgroup: '#8d98a6',
    genericcityobject: '#9aa3ad',
    landuse: '#9cad72',
    otherconstruction: '#9b9390',
    plantcover: '#77a66a',
    railway: '#646d76',
    relieffeature: '#a99a7c',
    road: '#6d747c',
    solitaryvegetationobject: '#5f9862',
    square: '#8a8177',
    tinrelief: '#a58f6c',
    transportationobject: '#737b84',
    transportsquare: '#8a8177',
    tunnel: '#8b7b9d',
    tunnelconstructiveelement: '#7e6f91',
    tunnelfurniture: '#9a8aa8',
    tunnelhollowspace: '#9b8caf',
    tunnelinstallation: '#8f80a2',
    tunnelpart: '#9484a7',
    waterbody: '#4f93b5',
    waterway: '#4d89aa',
  },
  dark: {
    bridge: '#6f9aae',
    bridgeconstructiveelement: '#638c9f',
    bridgefurniture: '#879aa4',
    bridgeinstallation: '#78a8b9',
    bridgepart: '#7ea2b2',
    bridgeroom: '#8fa9b5',
    building: '#9d927f',
    buildingconstructiveelement: '#918675',
    buildingfurniture: '#ab9b82',
    buildinginstallation: '#a98f6d',
    buildingpart: '#aa9b85',
    buildingroom: '#b7a98f',
    cityfurniture: '#b88939',
    cityobjectgroup: '#7f8b99',
    genericcityobject: '#8b96a1',
    landuse: '#879863',
    otherconstruction: '#89817f',
    plantcover: '#67945e',
    railway: '#5c6670',
    relieffeature: '#938568',
    road: '#626b74',
    solitaryvegetationobject: '#528857',
    square: '#7a736b',
    tinrelief: '#907d5f',
    transportationobject: '#68717b',
    transportsquare: '#7a736b',
    tunnel: '#7d6f93',
    tunnelconstructiveelement: '#716485',
    tunnelfurniture: '#897b9c',
    tunnelhollowspace: '#8a7ca1',
    tunnelinstallation: '#817397',
    tunnelpart: '#857697',
    waterbody: '#477f9f',
    waterway: '#467895',
  },
}

export const FALLBACK_OBJECT_TYPE_COLORS: Record<Theme, readonly string[]> = {
  light: ['#8b96a1', '#938c81', '#879672', '#7e97a3', '#998b9f'],
  dark: ['#7f8b97', '#827b72', '#788a67', '#728b98', '#887c93'],
}

export const ATTRIBUTE_COLOR_STOP_COUNT = 10
export const SEMANTIC_SURFACE_COLOR_SLOT_COUNT = 64
export const SELECTION_TINT_COLOR = '#7ee7e7'
export const SELECTION_TINT_STRENGTH = 0.18
export const SEMANTIC_SELECTION_TINT_STRENGTH = 0.34
export function createBatchMaterial(
  mode: BatchColorMode,
  sharedUniforms: AttributeColorSharedUniforms,
  semanticUniforms: SemanticSurfaceSharedUniforms,
  selectionUniforms: SelectionTintUniforms,
  normalUniforms: NormalColorUniforms,
) {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.72,
    metalness: 0.02,
    vertexColors: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  material.userData.batchColorMode = mode
  if (mode === 'semantic') {
    applyBatchedSemanticColoringToMaterial(material, semanticUniforms, selectionUniforms)
  } else if (mode === 'continuous-attribute') {
    applyBatchedContinuousAttributeColorToMaterial(material, sharedUniforms, selectionUniforms)
  } else {
    applyBatchedSelectionTintToMaterial(material, selectionUniforms)
  }
  applyNormalColorToMaterial(material, normalUniforms)
  return material
}

export function createMaterial(objectType: string, theme: Theme, semanticMode = false) {
  const baseColor = semanticMode ? '#64748b' : baseColorForType(objectType, theme)
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.82,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })

  if (semanticMode) {
    material.userData.isSemanticBase = true
    material.userData.semanticColor = baseColor
  }

  return material
}

export function applyAttributeColorToScene(runtime: LayerState) {
  for (const mesh of runtime.meshesByRenderKey.values()) {
    const featureId = mesh.userData.featureId as string | undefined
    const objectId = mesh.userData.objectId as string | undefined
    const objectKey = featureId && objectId ? viewerObjectKey(featureId, objectId) : null
    const value = objectKey ? runtime.attributeColor?.valuesByObjectKey[objectKey] ?? null : null
    const directColor = objectKey ? runtime.attributeColor?.directColorsByObjectKey?.[objectKey] ?? null : null
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        applyAttributeColorToMaterial(
          material,
          runtime.attributeColor,
          value,
          directColor,
          runtime.attributeColorSharedUniforms,
          runtime.selectionTintUniforms,
        )
      }
    }
  }
}

export function applyAttributeColorToMaterial(
  material: THREE.MeshStandardMaterial,
  attributeColor: ViewerAttributeColorState | null,
  value: number | null,
  directColor: string | null,
  sharedUniforms: AttributeColorSharedUniforms,
  selectionUniforms: SelectionTintUniforms,
) {
  if (material.userData.isError || material.userData.isSemantic || material.userData.isSemanticBase) {
    return
  }

  const existingUniforms = material.userData.attributeColorUniforms as AttributeColorUniforms | undefined
  if (!attributeColor && !existingUniforms) {
    return
  }

  const uniforms = existingUniforms ?? ensureAttributeColorUniforms(material, sharedUniforms, selectionUniforms)
  uniforms.value.value = value ?? 0
  uniforms.hasValue.value = value == null ? 0 : 1
  uniforms.directColor.value.set(directColor ?? attributeColor?.missingColor ?? '#94a3b8')
}

export function applySelectionTintToMaterial(
  material: THREE.MeshStandardMaterial,
  uniforms: SelectionTintUniforms,
  semantic = false,
) {
  if (material.userData.isError || material.userData.hasSelectionTintShader) {
    return
  }

  material.userData.hasSelectionTintShader = true
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSelectionTintObjectId = uniforms.selectedObjectId
    shader.uniforms.uSelectionTintFaceIndex = uniforms.selectedFaceIndex
    shader.uniforms.uSelectionTintColor = uniforms.color
    shader.uniforms.uSelectionTintStrength = semantic ? uniforms.semanticStrength : uniforms.strength
    shader.vertexShader = `
      attribute float shaderObjectId;
      attribute float selectionFaceIndex;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vSelectionShaderObjectId = shaderObjectId;
      vSelectionFaceIndex = selectionFaceIndex;
      `,
    )
    shader.fragmentShader = `
      uniform float uSelectionTintObjectId;
      uniform float uSelectionTintFaceIndex;
      uniform vec3 uSelectionTintColor;
      uniform float uSelectionTintStrength;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (
        uSelectionTintFaceIndex >= 0.0 &&
        abs(floor(vSelectionShaderObjectId + 0.5) - uSelectionTintObjectId) < 0.5 &&
        abs(floor(vSelectionFaceIndex + 0.5) - uSelectionTintFaceIndex) < 0.5
      ) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSelectionTintColor, uSelectionTintStrength);
      }
      `,
    )
  }
  material.customProgramCacheKey = () => `selection-face-tint-${semantic ? 'semantic' : 'base'}-v1`
  material.needsUpdate = true
}

export function applyBatchedSemanticColoringToMaterial(
  material: THREE.MeshStandardMaterial,
  semanticUniforms: SemanticSurfaceSharedUniforms,
  selectionUniforms: SelectionTintUniforms,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSemanticSurfaceEnabled = semanticUniforms.enabled
    shader.uniforms.uSemanticSurfaceColors = semanticUniforms.colors
    shader.uniforms.uSelectionTintObjectId = selectionUniforms.selectedObjectId
    shader.uniforms.uSelectionTintFaceIndex = selectionUniforms.selectedFaceIndex
    shader.uniforms.uSelectionTintColor = selectionUniforms.color
    shader.uniforms.uSelectionTintStrength = selectionUniforms.semanticStrength
    shader.vertexShader = `
      attribute float shaderObjectId;
      attribute float selectionFaceIndex;
      attribute float semanticSurfaceTypeId;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
      varying float vSemanticSurfaceTypeId;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vSelectionShaderObjectId = shaderObjectId;
      vSelectionFaceIndex = selectionFaceIndex;
      vSemanticSurfaceTypeId = semanticSurfaceTypeId;
      `,
    )
    shader.fragmentShader = `
      uniform float uSemanticSurfaceEnabled;
      uniform vec3 uSemanticSurfaceColors[${SEMANTIC_SURFACE_COLOR_SLOT_COUNT}];
      uniform float uSelectionTintObjectId;
      uniform float uSelectionTintFaceIndex;
      uniform vec3 uSelectionTintColor;
      uniform float uSelectionTintStrength;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
      varying float vSemanticSurfaceTypeId;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (uSemanticSurfaceEnabled > 0.5) {
        vec3 semanticInstanceTint = diffuseColor.rgb;
        float semanticSelectionTint = distance(semanticInstanceTint, vec3(1.0));
        int semanticSurfaceTypeIndex = int(clamp(
          floor(vSemanticSurfaceTypeId + 0.5),
          0.0,
          float(${SEMANTIC_SURFACE_COLOR_SLOT_COUNT - 1})
        ));
        diffuseColor.rgb = uSemanticSurfaceColors[semanticSurfaceTypeIndex];
        if (semanticSelectionTint > 0.001) {
          diffuseColor.rgb = mix(diffuseColor.rgb, semanticInstanceTint, ${SEMANTIC_SELECTION_TINT_STRENGTH.toFixed(2)});
        }
      }
      if (
        uSelectionTintFaceIndex >= 0.0 &&
        abs(floor(vSelectionShaderObjectId + 0.5) - uSelectionTintObjectId) < 0.5 &&
        abs(floor(vSelectionFaceIndex + 0.5) - uSelectionTintFaceIndex) < 0.5
      ) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSelectionTintColor, uSelectionTintStrength);
      }
      `,
    )
  }
  material.customProgramCacheKey = () => 'batched-semantic-color-selection-tint-v3'
  material.needsUpdate = true
}

export function applyBatchedContinuousAttributeColorToMaterial(
  material: THREE.MeshStandardMaterial,
  sharedUniforms: AttributeColorSharedUniforms,
  selectionUniforms: SelectionTintUniforms,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAttributeColorEnabled = sharedUniforms.enabled
    shader.uniforms.uAttributeColorMin = sharedUniforms.min
    shader.uniforms.uAttributeColorMax = sharedUniforms.max
    shader.uniforms.uAttributeColorStops = sharedUniforms.colors
    shader.uniforms.uAttributeColorMissing = sharedUniforms.missingColor
    shader.uniforms.uAttributeColorValueMap = sharedUniforms.valueMap
    shader.uniforms.uAttributeColorValueMapSize = sharedUniforms.valueMapSize
    shader.uniforms.uSelectionTintObjectId = selectionUniforms.selectedObjectId
    shader.uniforms.uSelectionTintFaceIndex = selectionUniforms.selectedFaceIndex
    shader.uniforms.uSelectionTintColor = selectionUniforms.color
    shader.uniforms.uSelectionTintStrength = selectionUniforms.strength
    shader.vertexShader = `
      attribute float shaderObjectId;
      attribute float selectionFaceIndex;
      varying float vShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vShaderObjectId = shaderObjectId;
      vSelectionFaceIndex = selectionFaceIndex;
      `,
    )
    shader.fragmentShader = `
      uniform float uAttributeColorEnabled;
      uniform float uAttributeColorMin;
      uniform float uAttributeColorMax;
      uniform vec3 uAttributeColorStops[${ATTRIBUTE_COLOR_STOP_COUNT}];
      uniform vec3 uAttributeColorMissing;
      uniform sampler2D uAttributeColorValueMap;
      uniform vec2 uAttributeColorValueMapSize;
      uniform float uSelectionTintObjectId;
      uniform float uSelectionTintFaceIndex;
      uniform vec3 uSelectionTintColor;
      uniform float uSelectionTintStrength;
      varying float vShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 attributeInstanceTint = diffuseColor.rgb;
      if (uAttributeColorEnabled > 0.5) {
        float attributeObjectId = floor(vShaderObjectId + 0.5);
        vec2 attributeMapUv = (
          vec2(
            mod(attributeObjectId, uAttributeColorValueMapSize.x),
            floor(attributeObjectId / uAttributeColorValueMapSize.x)
          ) + 0.5
        ) / uAttributeColorValueMapSize;
        vec4 attributeValueSample = texture2D(uAttributeColorValueMap, attributeMapUv);
        if (attributeValueSample.g < 0.5) {
          diffuseColor.rgb = uAttributeColorMissing;
        } else {
          float attributeValue = attributeValueSample.r;
          float attributeRange = max(uAttributeColorMax - uAttributeColorMin, 0.000001);
          float attributeT = clamp((attributeValue - uAttributeColorMin) / attributeRange, 0.0, 1.0);
          float attributeMapPosition = attributeT * float(${ATTRIBUTE_COLOR_STOP_COUNT - 1});
          float attributeStopFloor = min(floor(attributeMapPosition), float(${ATTRIBUTE_COLOR_STOP_COUNT - 2}));
          int attributeStopIndex = int(attributeStopFloor);
          float attributeMix = attributeMapPosition - attributeStopFloor;
          diffuseColor.rgb = mix(
            uAttributeColorStops[attributeStopIndex],
            uAttributeColorStops[attributeStopIndex + 1],
            attributeMix
          );
        }
        if (distance(attributeInstanceTint, vec3(1.0)) > 0.001) {
          diffuseColor.rgb = mix(diffuseColor.rgb, attributeInstanceTint, 0.42);
        }
      }
      if (
        uSelectionTintFaceIndex >= 0.0 &&
        abs(floor(vShaderObjectId + 0.5) - uSelectionTintObjectId) < 0.5 &&
        abs(floor(vSelectionFaceIndex + 0.5) - uSelectionTintFaceIndex) < 0.5
      ) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSelectionTintColor, uSelectionTintStrength);
      }
      `,
    )
  }
  material.customProgramCacheKey = () => 'batched-continuous-attribute-texture-selection-v2'
  material.needsUpdate = true
}

export function applyBatchedSelectionTintToMaterial(
  material: THREE.MeshStandardMaterial,
  selectionUniforms: SelectionTintUniforms,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSelectionTintObjectId = selectionUniforms.selectedObjectId
    shader.uniforms.uSelectionTintFaceIndex = selectionUniforms.selectedFaceIndex
    shader.uniforms.uSelectionTintColor = selectionUniforms.color
    shader.uniforms.uSelectionTintStrength = selectionUniforms.strength
    shader.vertexShader = `
      attribute float shaderObjectId;
      attribute float selectionFaceIndex;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vSelectionShaderObjectId = shaderObjectId;
      vSelectionFaceIndex = selectionFaceIndex;
      `,
    )
    shader.fragmentShader = `
      uniform float uSelectionTintObjectId;
      uniform float uSelectionTintFaceIndex;
      uniform vec3 uSelectionTintColor;
      uniform float uSelectionTintStrength;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (
        uSelectionTintFaceIndex >= 0.0 &&
        abs(floor(vSelectionShaderObjectId + 0.5) - uSelectionTintObjectId) < 0.5 &&
        abs(floor(vSelectionFaceIndex + 0.5) - uSelectionTintFaceIndex) < 0.5
      ) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSelectionTintColor, uSelectionTintStrength);
      }
      `,
    )
  }
  material.customProgramCacheKey = () => 'batched-selection-face-tint-v1'
  material.needsUpdate = true
}

export function createAttributeColorSharedUniforms(): AttributeColorSharedUniforms {
  const valueMap = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  valueMap.magFilter = THREE.NearestFilter
  valueMap.minFilter = THREE.NearestFilter
  valueMap.wrapS = THREE.ClampToEdgeWrapping
  valueMap.wrapT = THREE.ClampToEdgeWrapping
  valueMap.generateMipmaps = false
  valueMap.needsUpdate = true

  return {
    enabled: { value: 0 },
    direct: { value: 0 },
    min: { value: 0 },
    max: { value: 1 },
    colors: {
      value: Array.from({ length: ATTRIBUTE_COLOR_STOP_COUNT }, () => new THREE.Color('#440154')),
    },
    missingColor: { value: new THREE.Color('#94a3b8') },
    valueMap: { value: valueMap },
    valueMapSize: { value: new THREE.Vector2(1, 1) },
  }
}

export function createSelectionTintUniforms(): SelectionTintUniforms {
  return {
    selectedObjectId: { value: -1 },
    selectedFaceIndex: { value: -1 },
    color: { value: new THREE.Color(SELECTION_TINT_COLOR) },
    strength: { value: SELECTION_TINT_STRENGTH },
    semanticStrength: { value: SEMANTIC_SELECTION_TINT_STRENGTH },
  }
}

export function createNormalColorUniforms(appearanceMode: ViewerAppearanceMode): NormalColorUniforms {
  return {
    enabled: { value: appearanceMode === 'normal' ? 1 : 0 },
  }
}

export function applyNormalColorToMaterial(
  material: THREE.MeshStandardMaterial,
  uniforms: NormalColorUniforms,
) {
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousProgramCacheKey = material.customProgramCacheKey()

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(material, shader, renderer)
    shader.uniforms.uNormalColorEnabled = uniforms.enabled
    shader.vertexShader = `
      varying vec3 vWorldNormalColor;
    ${shader.vertexShader}`.replace(
      '#include <normal_vertex>',
      `
      #include <normal_vertex>
      vWorldNormalColor = normalize(transpose(mat3(viewMatrix)) * transformedNormal);
      `,
    )
    shader.fragmentShader = `
      uniform float uNormalColorEnabled;
      varying vec3 vWorldNormalColor;
    ${shader.fragmentShader}`.replace(
      '#include <tonemapping_fragment>',
      `
      #include <tonemapping_fragment>
      vec3 normalColorDirection = normalize(vWorldNormalColor);
      #ifdef DOUBLE_SIDED
        normalColorDirection *= gl_FrontFacing ? 1.0 : -1.0;
      #endif
      gl_FragColor.rgb = mix(
        gl_FragColor.rgb,
        normalColorDirection * 0.5 + 0.5,
        uNormalColorEnabled
      );
      `,
    )
  }
  material.customProgramCacheKey = () => `${previousProgramCacheKey}-normal-color-v1`
  material.needsUpdate = true
}

export function createSemanticSurfaceSharedUniforms(): SemanticSurfaceSharedUniforms {
  const colors = Array.from(
    { length: SEMANTIC_SURFACE_COLOR_SLOT_COUNT },
    () => new THREE.Color('#64748b'),
  )
  return {
    enabled: { value: 0 },
    colors: { value: colors },
  }
}

export function syncSemanticSurfaceSharedUniforms(runtime: LayerState, data: ViewerDataset) {
  runtime.semanticSurfaceSharedUniforms.enabled.value = runtime.appearanceMode === 'semantic' ? 1 : 0
  runtime.semanticSurfaceTypeIds.clear()

  const colors = runtime.semanticSurfaceSharedUniforms.colors.value
  for (const color of colors) {
    color.set('#64748b')
  }

  let nextTypeId = 1
  for (const feature of data.features) {
    for (const object of feature.objects) {
      for (const geometry of object.geometries) {
        for (const surface of geometry.semanticSurfaces) {
          if (!surface || nextTypeId >= SEMANTIC_SURFACE_COLOR_SLOT_COUNT) {
            continue
          }

          const key = semanticSurfaceTypeKey(surface.type)
          if (runtime.semanticSurfaceTypeIds.has(key)) {
            continue
          }

          runtime.semanticSurfaceTypeIds.set(key, nextTypeId)
          colors[nextTypeId]?.set(semanticSurfaceColor(surface.type))
          nextTypeId += 1
        }
      }
    }
  }
}

export function getShaderObjectId(runtime: LayerState, objectKey: string) {
  const existing = runtime.shaderObjectIdsByObjectKey.get(objectKey)
  if (existing != null) {
    return existing
  }

  const nextId = runtime.nextShaderObjectId++
  runtime.shaderObjectIdsByObjectKey.set(objectKey, nextId)
  return nextId
}

export function semanticSurfaceTypeKey(surfaceType: string) {
  return surfaceType.trim().toLowerCase()
}

export function syncAttributeColorSharedUniforms(
  uniforms: AttributeColorSharedUniforms,
  attributeColor: ViewerAttributeColorState | null,
) {
  uniforms.enabled.value = attributeColor ? 1 : 0
  if (!attributeColor) {
    return
  }

  uniforms.min.value = attributeColor.domainMin
  uniforms.max.value = attributeColor.domainMax
  uniforms.direct.value = attributeColor.mode === 'direct' ? 1 : 0
  syncAttributeColorStops(uniforms.colors.value, attributeColor.colors)
  uniforms.missingColor.value.set(attributeColor.missingColor)
}

export function ensureAttributeColorUniforms(
  material: THREE.MeshStandardMaterial,
  sharedUniforms: AttributeColorSharedUniforms,
  selectionUniforms: SelectionTintUniforms,
): AttributeColorUniforms {
  const existing = material.userData.attributeColorUniforms as AttributeColorUniforms | undefined
  if (existing) {
    return existing
  }

  const uniforms: AttributeColorUniforms = {
    value: { value: 0 },
    hasValue: { value: 0 },
    directColor: { value: new THREE.Color('#94a3b8') },
    selectionTint: { value: new THREE.Color(SELECTION_TINT_COLOR) },
    selectionTintStrength: { value: 0 },
  }

  material.userData.attributeColorUniforms = uniforms
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAttributeColorEnabled = sharedUniforms.enabled
    shader.uniforms.uAttributeColorValue = uniforms.value
    shader.uniforms.uAttributeColorHasValue = uniforms.hasValue
    shader.uniforms.uAttributeColorDirect = sharedUniforms.direct
    shader.uniforms.uAttributeColorDirectColor = uniforms.directColor
    shader.uniforms.uAttributeColorMin = sharedUniforms.min
    shader.uniforms.uAttributeColorMax = sharedUniforms.max
    shader.uniforms.uAttributeColorStops = sharedUniforms.colors
    shader.uniforms.uAttributeColorMissing = sharedUniforms.missingColor
    shader.uniforms.uSelectionTint = uniforms.selectionTint
    shader.uniforms.uSelectionTintStrength = uniforms.selectionTintStrength
    shader.uniforms.uSelectionTintObjectId = selectionUniforms.selectedObjectId
    shader.uniforms.uSelectionTintFaceIndex = selectionUniforms.selectedFaceIndex
    shader.uniforms.uSelectionFaceTintStrength = selectionUniforms.strength
    shader.fragmentShader = `
      uniform float uAttributeColorEnabled;
      uniform float uAttributeColorValue;
      uniform float uAttributeColorHasValue;
      uniform float uAttributeColorDirect;
      uniform vec3 uAttributeColorDirectColor;
      uniform float uAttributeColorMin;
      uniform float uAttributeColorMax;
      uniform vec3 uAttributeColorStops[${ATTRIBUTE_COLOR_STOP_COUNT}];
      uniform vec3 uAttributeColorMissing;
      uniform vec3 uSelectionTint;
      uniform float uSelectionTintStrength;
      uniform float uSelectionTintObjectId;
      uniform float uSelectionTintFaceIndex;
      uniform float uSelectionFaceTintStrength;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (uAttributeColorEnabled > 0.5) {
        if (uAttributeColorHasValue < 0.5) {
          diffuseColor.rgb = uAttributeColorMissing;
        } else if (uAttributeColorDirect > 0.5) {
          diffuseColor.rgb = uAttributeColorDirectColor;
        } else {
          float attributeRange = max(uAttributeColorMax - uAttributeColorMin, 0.000001);
          float attributeT = clamp((uAttributeColorValue - uAttributeColorMin) / attributeRange, 0.0, 1.0);
          float attributeMapPosition = attributeT * float(${ATTRIBUTE_COLOR_STOP_COUNT - 1});
          float attributeStopFloor = min(floor(attributeMapPosition), float(${ATTRIBUTE_COLOR_STOP_COUNT - 2}));
          int attributeStopIndex = int(attributeStopFloor);
          float attributeMix = attributeMapPosition - attributeStopFloor;
          diffuseColor.rgb = mix(
            uAttributeColorStops[attributeStopIndex],
            uAttributeColorStops[attributeStopIndex + 1],
            attributeMix
          );
        }
      }
      if (uSelectionTintStrength > 0.0) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSelectionTint, uSelectionTintStrength);
      }
      if (
        uSelectionTintFaceIndex >= 0.0 &&
        abs(floor(vSelectionShaderObjectId + 0.5) - uSelectionTintObjectId) < 0.5 &&
        abs(floor(vSelectionFaceIndex + 0.5) - uSelectionTintFaceIndex) < 0.5
      ) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uSelectionTint, uSelectionFaceTintStrength);
      }
      `,
    )
    shader.vertexShader = `
      attribute float shaderObjectId;
      attribute float selectionFaceIndex;
      varying float vSelectionShaderObjectId;
      varying float vSelectionFaceIndex;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vSelectionShaderObjectId = shaderObjectId;
      vSelectionFaceIndex = selectionFaceIndex;
      `,
    )
  }
  material.customProgramCacheKey = () => 'attribute-color-v6-selection-face-tint'
  material.needsUpdate = true
  return uniforms
}

export function syncAttributeColorStops(target: THREE.Color[], colors: readonly string[]) {
  const fallback = colors[0] ?? '#440154'
  for (let index = 0; index < ATTRIBUTE_COLOR_STOP_COUNT; index += 1) {
    target[index]?.set(colors[index] ?? fallback)
  }
}

export function baseColorForType(objectType: string, theme: Theme) {
  const key = objectType.trim().toLowerCase()
  const matchedColor = OBJECT_TYPE_COLORS[theme][key]
  if (matchedColor) {
    return matchedColor
  }

  const fallbackPalette = FALLBACK_OBJECT_TYPE_COLORS[theme]
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash += key.charCodeAt(index)
  }
  return fallbackPalette[hash % fallbackPalette.length]
}

export function createErrorMaterial(color: string) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.08,
    roughness: 0.64,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  mat.userData.isError = true
  mat.userData.errorColor = color
  return mat
}

export function createSemanticMaterial(color: string) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  mat.userData.isSemantic = true
  mat.userData.semanticColor = color
  return mat
}

export function computeFaceErrorGroups(
  errors: ViewerValidationError[],
  objectId: string,
  geometryIndex: number,
  sourceFaceIndices: number[],
): { faceGroups: Map<number, number>; groupColors: Map<number, string> } {
  const codeToGroup = new Map<number, number>()
  let nextGroup = 1
  const faceGroups = new Map<number, number>()
  const groupColors = new Map<number, string>()

  for (const error of errors) {
    if (
      error.cityObjectId !== objectId ||
      error.faceIndex == null ||
      (error.geometryIndex != null && error.geometryIndex !== geometryIndex)
    ) {
      continue
    }

    const currentFaceIndex = getCurrentFaceIndexForSourceFace(sourceFaceIndices, error.faceIndex)
    if (currentFaceIndex == null || faceGroups.has(currentFaceIndex)) {
      continue
    }

    let group = codeToGroup.get(error.code)
    if (group == null) {
      group = nextGroup++
      codeToGroup.set(error.code, group)
      groupColors.set(group, errorColor(error.code))
    }
    faceGroups.set(currentFaceIndex, group)
  }

  return { faceGroups, groupColors }
}

export function getCurrentFaceIndexForSourceFace(sourceFaceIndices: number[], sourceFaceIndex: number) {
  const currentFaceIndex = sourceFaceIndices.indexOf(sourceFaceIndex)
  return currentFaceIndex >= 0 ? currentFaceIndex : null
}

export function computeFaceSemanticGroups(
  semanticSurfaces: Array<ViewerSemanticSurface | null>,
): { faceGroups: Map<number, number>; groupColors: Map<number, string> } {
  const typeToGroup = new Map<string, number>()
  const faceGroups = new Map<number, number>()
  const groupColors = new Map<number, string>()
  let nextGroup = 1

  semanticSurfaces.forEach((surface, faceIndex) => {
    if (!surface) {
      return
    }

    let group = typeToGroup.get(surface.type)
    if (group == null) {
      group = nextGroup++
      typeToGroup.set(surface.type, group)
      groupColors.set(group, semanticSurfaceColor(surface.type))
    }

    faceGroups.set(faceIndex, group)
  })

  return { faceGroups, groupColors }
}

export function buildMaterialArray(
  baseMaterial: THREE.MeshStandardMaterial,
  groupColors: Map<number, string>,
  createGroupMaterial: (color: string) => THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial[] {
  if (groupColors.size === 0) {
    return [baseMaterial]
  }
  const maxGroup = Math.max(...groupColors.keys())
  const materials: THREE.MeshStandardMaterial[] = [baseMaterial]
  for (let i = 1; i <= maxGroup; i++) {
    const color = groupColors.get(i)
    materials.push(color ? createGroupMaterial(color) : baseMaterial)
  }
  return materials
}

