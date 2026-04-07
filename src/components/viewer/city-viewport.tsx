import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

import type {
  PolygonRings,
  Vec3,
  ViewerDataset,
  ViewerFeature,
  ViewerFocusTarget,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'
import { errorColor } from '@/lib/error-palette'

type Theme = 'light' | 'dark'

const VIEWPORT_FOG_DENSITY = {
  light: 0.00008,
  dark: 0.00012,
} as const

type CityViewportProps = {
  data: ViewerDataset | null
  cameraFocalLength: number
  hideOccludedEditEdges: boolean
  isolateSelectedFeature: boolean
  geometryRevision: number
  viewportResetRevision: number
  focusRevision: number
  focusTarget: ViewerFocusTarget
  selectedFeatureId: string | null
  activeObjectId: string | null
  editMode: boolean
  selectedFaceIndex: number | null
  selectedFaceRingIndex: number
  selectedVertexIndex: number | null
  showSemanticSurfaces: boolean
  mobileInteraction: boolean
  mobileSelectionMode: 'object' | 'surface'
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  onSelectFace: (faceIndex: number | null) => void
  onSelectVertex: (vertexIndex: number | null) => void
  onSelectSemanticSurface: (surface: {
    featureId: string
    objectId: string
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null) => void
  onVertexCommit: (featureId: string, vertices: Vec3[]) => void
  theme: Theme
}

type Runtime = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  arcball: ArcballControls
  transform: TransformControls
  rootGroup: THREE.Group
  handleGroup: THREE.Group
  edgeGroup: THREE.Group
  annotationGroup: THREE.Group
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  meshesByObjectKey: Map<string, THREE.Mesh>
  editPoints: THREE.Points | null
  selectedEditPoint: THREE.Points | null
  transformProxy: THREE.Object3D | null
  editBaseEdges: LineSegments2 | null
  editHighlightEdges: LineSegments2 | null
  editActiveRingEdges: LineSegments2 | null
  annotationVertexMarkers: THREE.Points[]
  featureDrafts: Map<string, Vec3[]>
  sceneScale: number
  editPivot: Vec3 | null
  theme: Theme
  showSemanticSurfaces: boolean
  ambientLight: THREE.AmbientLight
  hemisphereLight: THREE.HemisphereLight
  keyLight: THREE.DirectionalLight
  fillLight: THREE.DirectionalLight
}

function CityViewport({
  data,
  cameraFocalLength,
  hideOccludedEditEdges,
  isolateSelectedFeature,
  geometryRevision,
  viewportResetRevision,
  focusRevision,
  focusTarget,
  selectedFeatureId,
  activeObjectId,
  editMode,
  selectedFaceIndex,
  selectedFaceRingIndex,
  selectedVertexIndex,
  showSemanticSurfaces,
  mobileInteraction,
  mobileSelectionMode,
  onSelectFeature,
  onSelectFace,
  onSelectVertex,
  onSelectSemanticSurface,
  onVertexCommit,
  theme,
}: CityViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const fittedDatasetKeyRef = useRef<string | null>(null)
  const dataRef = useRef<ViewerDataset | null>(data)
  const initialCameraFocalLengthRef = useRef(cameraFocalLength)
  const hideOccludedEditEdgesRef = useRef(hideOccludedEditEdges)
  const isolateSelectedFeatureRef = useRef(isolateSelectedFeature)
  const selectionRef = useRef({
    selectedFeatureId,
    activeObjectId,
    editMode,
    selectedFaceIndex,
    selectedFaceRingIndex,
    selectedVertexIndex,
  })
  const onSelectFeatureRef = useRef(onSelectFeature)
  const onSelectFaceRef = useRef(onSelectFace)
  const onSelectVertexRef = useRef(onSelectVertex)
  const onSelectSemanticSurfaceRef = useRef(onSelectSemanticSurface)
  const onVertexCommitRef = useRef(onVertexCommit)
  const themeRef = useRef(theme)
  const showSemanticSurfacesRef = useRef(showSemanticSurfaces)
  const mobileInteractionRef = useRef(mobileInteraction)
  const mobileSelectionModeRef = useRef(mobileSelectionMode)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    hideOccludedEditEdgesRef.current = hideOccludedEditEdges
  }, [hideOccludedEditEdges])

  useEffect(() => {
    isolateSelectedFeatureRef.current = isolateSelectedFeature
  }, [isolateSelectedFeature])

  useEffect(() => {
    selectionRef.current = {
      selectedFeatureId,
      activeObjectId,
      editMode,
      selectedFaceIndex,
      selectedFaceRingIndex,
      selectedVertexIndex,
    }
  }, [selectedFeatureId, activeObjectId, editMode, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex])

  useEffect(() => { onSelectFeatureRef.current = onSelectFeature }, [onSelectFeature])
  useEffect(() => { onSelectFaceRef.current = onSelectFace }, [onSelectFace])
  useEffect(() => { onSelectVertexRef.current = onSelectVertex }, [onSelectVertex])
  useEffect(() => { onSelectSemanticSurfaceRef.current = onSelectSemanticSurface }, [onSelectSemanticSurface])
  useEffect(() => { onVertexCommitRef.current = onVertexCommit }, [onVertexCommit])
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { showSemanticSurfacesRef.current = showSemanticSurfaces }, [showSemanticSurfaces])
  useEffect(() => { mobileInteractionRef.current = mobileInteraction }, [mobileInteraction])
  useEffect(() => { mobileSelectionModeRef.current = mobileSelectionMode }, [mobileSelectionMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#061120', VIEWPORT_FOG_DENSITY.dark)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500000)
    camera.filmGauge = 35
    camera.setFocalLength(initialCameraFocalLengthRef.current)
    camera.up.set(0, 0, 1)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.autoClear = true
    container.appendChild(renderer.domElement)

    const arcball = new ArcballControls(camera, renderer.domElement, scene)
    arcball.enableAnimations = false
    arcball.enableFocus = false
    arcball.enableGrid = false
    arcball.setGizmosVisible(false)
    arcball.rotateSpeed = 1.15
    arcball.scaleFactor = 1.04
    arcball.unsetMouseAction('WHEEL', 'SHIFT')
    arcball.unsetMouseAction(1, 'SHIFT')

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setSpace('world')
    transform.setMode('translate')
    transform.enabled = false
    scene.add(transform.getHelper())

    const ambientLight = new THREE.AmbientLight('#f6f8ff', 1.6)
    scene.add(ambientLight)

    const hemisphereLight = new THREE.HemisphereLight('#b9e4ff', '#09111c', 1.1)
    hemisphereLight.position.set(0, 0, 1)
    scene.add(hemisphereLight)

    const keyLight = new THREE.DirectionalLight('#fff2d7', 1.8)
    keyLight.position.set(1, -1, 2)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight('#78d6ff', 0.9)
    fillLight.position.set(-1, 1, 1.2)
    scene.add(fillLight)

    const rootGroup = new THREE.Group()
    scene.add(rootGroup)

    const handleGroup = new THREE.Group()
    scene.add(handleGroup)

    const edgeGroup = new THREE.Group()
    scene.add(edgeGroup)

    const annotationGroup = new THREE.Group()
    scene.add(annotationGroup)

    const runtime: Runtime = {
      renderer,
      scene,
      camera,
      arcball,
      transform,
      rootGroup,
      handleGroup,
      edgeGroup,
      annotationGroup,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      meshesByObjectKey: new Map(),
      editPoints: null,
      selectedEditPoint: null,
      transformProxy: null,
      editBaseEdges: null,
      editHighlightEdges: null,
      editActiveRingEdges: null,
      annotationVertexMarkers: [],
      featureDrafts: new Map(),
      sceneScale: 1,
      editPivot: null,
      theme: themeRef.current,
      showSemanticSurfaces: showSemanticSurfacesRef.current,
      ambientLight,
      hemisphereLight,
      keyLight,
      fillLight,
    }
    runtime.raycaster.params.Points.threshold = 1
    applyViewportTheme(runtime, themeRef.current)

    runtimeRef.current = runtime
    let pendingRenderFrame: number | null = null

    const renderNow = () => {
      const activeRuntime = runtimeRef.current
      if (!activeRuntime) {
        return
      }

      renderViewport(activeRuntime)
    }

    const requestRender = () => {
      if (pendingRenderFrame != null) {
        return
      }

      pendingRenderFrame = window.requestAnimationFrame(() => {
        pendingRenderFrame = null
        renderNow()
      })
    }

    const handleResize = () => {
      const target = containerRef.current
      const activeRuntime = runtimeRef.current
      if (!target || !activeRuntime) {
        return
      }

      const width = Math.max(target.clientWidth, 1)
      const height = Math.max(target.clientHeight, 1)

      activeRuntime.camera.aspect = width / height
      activeRuntime.camera.updateProjectionMatrix()
      activeRuntime.renderer.setSize(width, height)
      updateEditWireframeResolution(activeRuntime)
      syncArcballState(activeRuntime)
      requestRender()
    }

    const handleClick = (event: MouseEvent) => {
      const activeRuntime = runtimeRef.current
      const currentData = dataRef.current
      if (!activeRuntime || !currentData) {
        return
      }

      updateRaycastPointer(activeRuntime, event)

      const selection = selectionRef.current
      const isVertexSelectionModifier = event.ctrlKey || event.metaKey
      if (selection.editMode && isVertexSelectionModifier) {
        updateEditPointRaycastThreshold(activeRuntime, currentData, selection)
        const handleTargets = [activeRuntime.selectedEditPoint, activeRuntime.editPoints].filter(
          (entry): entry is THREE.Points => entry != null,
        )
        const handleHits = activeRuntime.raycaster.intersectObjects(handleTargets, false)
        const handleHit = handleHits[0]
        if (handleHit && typeof handleHit.index === 'number') {
          const indices = (handleHit.object.userData.vertexIndices as number[] | undefined) ?? []
          const vertexIndex = indices[handleHit.index]
          if (vertexIndex != null) {
            onSelectVertexRef.current(vertexIndex)
            return
          }
        }

        if (handleHit) {
          return
        }

        const activeFeature =
          selection.selectedFeatureId
            ? currentData.features.find((candidate) => candidate.id === selection.selectedFeatureId) ?? null
            : null
        const activeObject =
          activeFeature?.objects.find((candidate) => candidate.id === selection.activeObjectId) ?? null
        const activeMesh =
          selection.selectedFeatureId && selection.activeObjectId
            ? activeRuntime.meshesByObjectKey.get(
                objectKey(selection.selectedFeatureId, selection.activeObjectId),
              ) ?? null
            : null

        if (!activeFeature || !activeObject || !activeMesh) {
          return
        }

        const meshHits = activeRuntime.raycaster.intersectObject(activeMesh, false)
        const meshHit = meshHits[0]
        const triangleFaceIndices = (activeMesh.userData.triangleFaceIndices as number[] | undefined) ?? []
        const polygonIndex =
          meshHit && typeof meshHit.faceIndex === 'number'
            ? triangleFaceIndices[meshHit.faceIndex] ?? null
            : null
        const polygon = polygonIndex != null ? activeObject.polygons[polygonIndex] ?? null : null
        const nearestVertexIndex =
          meshHit && polygon
            ? findNearestVertexIndexOnPolygon(meshHit.point, polygon, activeFeature.vertices, currentData.center)
            : null

        if (nearestVertexIndex != null) {
          onSelectVertexRef.current(nearestVertexIndex)
        }
        return
      }

      const usesMobileTapSelection = mobileInteractionRef.current
      const mobileSurfaceSelection =
        usesMobileTapSelection &&
        showSemanticSurfacesRef.current &&
        mobileSelectionModeRef.current === 'surface'

      if (selection.editMode) {
        if (!event.shiftKey) {
          return
        }

        const activeMesh =
          selection.selectedFeatureId && selection.activeObjectId
            ? activeRuntime.meshesByObjectKey.get(
                objectKey(selection.selectedFeatureId, selection.activeObjectId),
              ) ?? null
            : null

        if (!activeMesh) {
          return
        }

        const meshHits = activeRuntime.raycaster.intersectObject(activeMesh, false)
        const meshHit = meshHits[0]
        const triangleFaceIndices = (activeMesh.userData.triangleFaceIndices as number[] | undefined) ?? []
        const faceIndex =
          meshHit && typeof meshHit.faceIndex === 'number'
            ? triangleFaceIndices[meshHit.faceIndex] ?? null
            : null

        onSelectFaceRef.current(faceIndex)
        return
      }

      if (showSemanticSurfacesRef.current && (mobileSurfaceSelection || event.shiftKey)) {
        if (!usesMobileTapSelection && !event.shiftKey) {
          return
        }

        const meshHits = activeRuntime.raycaster.intersectObjects(
          [...activeRuntime.meshesByObjectKey.values()],
          false,
        )
        const meshHit = meshHits[0]
        if (!meshHit) {
          onSelectSemanticSurfaceRef.current(null)
          return
        }

        const featureId = meshHit.object.userData.featureId as string
        const objectId = meshHit.object.userData.objectId as string
        const triangleFaceIndices = (meshHit.object.userData.triangleFaceIndices as number[] | undefined) ?? []
        const faceIndex =
          typeof meshHit.faceIndex === 'number'
            ? triangleFaceIndices[meshHit.faceIndex] ?? null
            : null
        const feature = currentData.features.find((candidate) => candidate.id === featureId) ?? null
        const object = feature?.objects.find((candidate) => candidate.id === objectId) ?? null
        const surface = faceIndex != null ? object?.semanticSurfaces[faceIndex] ?? null : null

        onSelectFeatureRef.current(featureId, objectId)
        onSelectSemanticSurfaceRef.current(
          faceIndex != null
            ? {
                featureId,
                objectId,
                faceIndex,
                surface,
              }
            : null,
        )
        return
      }

      if (!usesMobileTapSelection && !event.shiftKey) {
        return
      }

      const meshHits = activeRuntime.raycaster.intersectObjects(
        [...activeRuntime.meshesByObjectKey.values()],
        false,
      )
      const meshHit = meshHits[0]
      if (meshHit) {
        const featureId = meshHit.object.userData.featureId as string
        const objectId = meshHit.object.userData.objectId as string
        onSelectSemanticSurfaceRef.current(null)
        onSelectFeatureRef.current(featureId, objectId)
        return
      }

      if (usesMobileTapSelection) {
        onSelectSemanticSurfaceRef.current(null)
      }
      onSelectVertexRef.current(null)
    }

    const handleDoubleClick = (event: MouseEvent) => {
      const activeRuntime = runtimeRef.current
      if (!activeRuntime) {
        return
      }

      updateRaycastPointer(activeRuntime, event)
      const meshHits = activeRuntime.raycaster.intersectObjects(
        [...activeRuntime.meshesByObjectKey.values()],
        false,
      )
      const meshHit = meshHits[0]
      if (!meshHit) {
        return
      }

      const center = getArcballCenter(activeRuntime.arcball).clone()
      const delta = new THREE.Vector3().subVectors(meshHit.point, center)
      const nextPosition = activeRuntime.camera.position.clone().add(delta)
      setArcballPose(activeRuntime, meshHit.point, nextPosition)
      requestRender()
    }

    arcball.addEventListener('change', requestRender)

    transform.addEventListener('dragging-changed', (event) => {
      const isDragging = Boolean(event.value)
      arcball.enabled = !isDragging

      if (!isDragging) {
        const featureId = selectionRef.current.selectedFeatureId
        if (!featureId) {
          return
        }

        const committedVertices = runtime.featureDrafts.get(featureId)?.map((vertex) => [...vertex] as Vec3)
        if (committedVertices) {
          onVertexCommitRef.current(featureId, committedVertices)
        }
      }
    })

    transform.addEventListener('objectChange', () => {
      const activeRuntime = runtimeRef.current
      const currentData = dataRef.current
      const featureId = selectionRef.current.selectedFeatureId
      const vertexIndex = selectionRef.current.selectedVertexIndex
      if (!activeRuntime || !currentData || !featureId || vertexIndex == null) {
        return
      }

      const handle = activeRuntime.transformProxy
      const draftVertices = activeRuntime.featureDrafts.get(featureId)
      if (!handle || !draftVertices) {
        return
      }

      const pivot = activeRuntime.editPivot ?? currentData.center
      draftVertices[vertexIndex] = [
        handle.position.x + pivot[0],
        handle.position.y + pivot[1],
        handle.position.z + pivot[2],
      ]
      rebuildFeatureGeometry(activeRuntime, currentData, featureId, selectionRef.current)
      rebuildEditWireframe(
        activeRuntime,
        currentData,
        selectionRef.current,
        hideOccludedEditEdgesRef.current,
      )
      syncEditPointGeometry(activeRuntime, currentData, selectionRef.current)
      requestRender()
    })

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    window.addEventListener('resize', handleResize)
    renderer.domElement.addEventListener('click', handleClick)
    renderer.domElement.addEventListener('dblclick', handleDoubleClick)
    handleResize()

    return () => {
      if (pendingRenderFrame != null) {
        window.cancelAnimationFrame(pendingRenderFrame)
      }
      arcball.removeEventListener('change', requestRender)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick)
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      disposeSceneContents(runtime)
      transform.dispose()
      arcball.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !data) {
      return
    }

    rebuildScene(runtime, data, selectionRef.current)
    const datasetKey = getDatasetViewKey(data)
    if (fittedDatasetKeyRef.current !== datasetKey) {
      fitCameraToDataset(runtime, data)
      fittedDatasetKeyRef.current = datasetKey
    }
    rebuildAnnotations(runtime)
    syncSelection(
      runtime,
      data,
      selectionRef.current,
      hideOccludedEditEdgesRef.current,
      isolateSelectedFeatureRef.current,
    )
    renderViewport(runtime)
  }, [data])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData) {
      return
    }

    rebuildScene(runtime, currentData, selectionRef.current)
    rebuildAnnotations(runtime)
    syncSelection(
      runtime,
      currentData,
      selectionRef.current,
      hideOccludedEditEdgesRef.current,
      isolateSelectedFeatureRef.current,
    )
    renderViewport(runtime)
  }, [geometryRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData) {
      return
    }

    if (runtime.showSemanticSurfaces && !editMode) {
      rebuildScene(runtime, currentData, selectionRef.current)
      rebuildAnnotations(runtime)
    }

    syncSelection(
      runtime,
      currentData,
      selectionRef.current,
      hideOccludedEditEdgesRef.current,
      isolateSelectedFeatureRef.current,
    )
    renderViewport(runtime)
  }, [selectedFeatureId, activeObjectId, editMode, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex, hideOccludedEditEdges, isolateSelectedFeature])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData || !focusTarget) {
      return
    }

    if (focusTarget.kind === 'error') {
      centerViewOnValidationError(runtime, currentData, focusTarget)
    } else if (focusTarget.kind === 'vertex') {
      centerViewOnVertex(runtime, currentData, focusTarget)
    } else {
      const feature = currentData.features.find((candidate) => candidate.id === focusTarget.featureId)
      if (!feature) {
        return
      }

      centerViewOnFeature(runtime, currentData, feature)
    }

    renderViewport(runtime)
  }, [focusRevision, focusTarget])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }

    runtime.theme = theme
    applyViewportTheme(runtime, theme)

    const currentData = dataRef.current
    if (currentData) {
      syncSelection(
        runtime,
        currentData,
        selectionRef.current,
        hideOccludedEditEdgesRef.current,
        isolateSelectedFeatureRef.current,
      )
    }
    renderViewport(runtime)
  }, [theme])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime) {
      return
    }

    runtime.showSemanticSurfaces = showSemanticSurfaces

    if (currentData) {
      rebuildScene(runtime, currentData, selectionRef.current)
      rebuildAnnotations(runtime)
      syncSelection(
        runtime,
        currentData,
        selectionRef.current,
        hideOccludedEditEdgesRef.current,
        isolateSelectedFeatureRef.current,
      )
    }

    renderViewport(runtime)
  }, [showSemanticSurfaces])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData) {
      return
    }

    fitCameraToDataset(runtime, currentData)
    fittedDatasetKeyRef.current = getDatasetViewKey(currentData)
    renderViewport(runtime)
  }, [viewportResetRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }

    const center = getArcballCenter(runtime.arcball).clone()
    const distanceVector = new THREE.Vector3().subVectors(runtime.camera.position, center)
    const currentDistance = distanceVector.length()
    const currentFovRadians = THREE.MathUtils.degToRad(runtime.camera.fov)

    runtime.camera.setFocalLength(cameraFocalLength)
    runtime.camera.updateProjectionMatrix()

    if (currentDistance > 0) {
      const nextFovRadians = THREE.MathUtils.degToRad(runtime.camera.fov)
      const nextDistance =
        currentDistance * (Math.tan(currentFovRadians / 2) / Math.tan(nextFovRadians / 2))
      const nextPosition = center.clone().add(distanceVector.normalize().multiplyScalar(nextDistance))
      setArcballPose(runtime, center, nextPosition)
    } else {
      syncArcballState(runtime, center)
    }
    renderViewport(runtime)
  }, [cameraFocalLength])

  return <div ref={containerRef} className="absolute inset-0" />
}

function rebuildScene(
  runtime: Runtime,
  data: ViewerDataset,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedFaceRingIndex: number
    selectedVertexIndex: number | null
  },
) {
  disposeSceneContents(runtime)
  runtime.featureDrafts = new Map(
    data.features.map((feature) => [feature.id, feature.vertices.map((vertex) => [...vertex] as Vec3)]),
  )

  const sizeX = data.extent[3] - data.extent[0]
  const sizeY = data.extent[4] - data.extent[1]
  const sizeZ = data.extent[5] - data.extent[2]
  runtime.sceneScale = Math.max(sizeX, sizeY, sizeZ)

  for (const feature of data.features) {
    const draftVertices = runtime.featureDrafts.get(feature.id)
    if (!draftVertices) {
      continue
    }

    // Center each feature's mesh geometry around the feature's own center
    // to keep float32 vertex buffer values small and avoid GPU precision jitter.
    const featureCenter: Vec3 = [
      (feature.extent[0] + feature.extent[3]) * 0.5,
      (feature.extent[1] + feature.extent[4]) * 0.5,
      (feature.extent[2] + feature.extent[5]) * 0.5,
    ]

    for (const object of feature.objects) {
      if (object.polygons.length === 0) {
        continue
      }

      const selectedSemanticFaceIndex =
        runtime.showSemanticSurfaces &&
        !selection.editMode &&
        selection.selectedFeatureId === feature.id &&
        selection.activeObjectId === object.id
          ? selection.selectedFaceIndex
          : null
      const { faceGroups, groupColors } = runtime.showSemanticSurfaces
        ? computeFaceSemanticGroups(object.semanticSurfaces, selectedSemanticFaceIndex)
        : computeFaceErrorGroups(feature.errors, object.id)
      const geometry = buildObjectGeometry(object.polygons, draftVertices, featureCenter, faceGroups)
      const baseMaterial = createMaterial(object.type, runtime.theme, runtime.showSemanticSurfaces)
      const materials = buildMaterialArray(
        baseMaterial,
        groupColors,
        runtime.showSemanticSurfaces ? createSemanticMaterial : createErrorMaterial,
      )
      const mesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : baseMaterial)
      mesh.position.set(
        featureCenter[0] - data.center[0],
        featureCenter[1] - data.center[1],
        featureCenter[2] - data.center[2],
      )
      mesh.userData = {
        featureId: feature.id,
        objectId: object.id,
        objectType: object.type,
        featureCenter,
        triangleFaceIndices: geometry.userData.triangleFaceIndices,
      }
      runtime.meshesByObjectKey.set(objectKey(feature.id, object.id), mesh)
      runtime.rootGroup.add(mesh)
    }
  }
}

function rebuildFeatureGeometry(
  runtime: Runtime,
  data: ViewerDataset,
  featureId: string,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedFaceRingIndex: number
    selectedVertexIndex: number | null
  },
) {
  const feature = data.features.find((candidate) => candidate.id === featureId)
  const vertices = runtime.featureDrafts.get(featureId)
  if (!feature || !vertices) {
    return
  }

  for (const object of feature.objects) {
    const mesh = runtime.meshesByObjectKey.get(objectKey(featureId, object.id))
    if (!mesh) {
      continue
    }

    const center = (mesh.userData.featureCenter as Vec3) ?? data.center
    const selectedSemanticFaceIndex =
      runtime.showSemanticSurfaces &&
      !selection.editMode &&
      selection.selectedFeatureId === featureId &&
      selection.activeObjectId === object.id
        ? selection.selectedFaceIndex
        : null
    const { faceGroups } = runtime.showSemanticSurfaces
      ? computeFaceSemanticGroups(object.semanticSurfaces, selectedSemanticFaceIndex)
      : computeFaceErrorGroups(feature.errors, object.id)
    const nextGeometry = buildObjectGeometry(object.polygons, vertices, center, faceGroups)
    mesh.geometry.dispose()
    mesh.geometry = nextGeometry
    mesh.userData.triangleFaceIndices = nextGeometry.userData.triangleFaceIndices
  }
}

function rebuildAnnotations(runtime: Runtime) {
  clearTransientGroup(runtime.annotationGroup)
  runtime.annotationVertexMarkers = []
}

function syncSelection(
  runtime: Runtime,
  data: ViewerDataset,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedFaceRingIndex: number
    selectedVertexIndex: number | null
  },
  hideOccludedEditEdges: boolean,
  isolateSelectedFeature: boolean,
) {
  const isolateActive = isolateSelectedFeature && selection.selectedFeatureId != null
  const palette = getViewportPalette(runtime.theme)
  const semanticHighlightLift = new THREE.Color('#f8fafc')
  const semanticShadow = new THREE.Color('#020617')
  const semanticObjectSelectionActive =
    runtime.showSemanticSurfaces && !selection.editMode && selection.activeObjectId != null

  for (const mesh of runtime.meshesByObjectKey.values()) {
    const featureId = mesh.userData.featureId as string
    const objectId = mesh.userData.objectId as string
    const objectType = mesh.userData.objectType as string
    const baseColor = baseColorForType(objectType, runtime.theme)
    const isSelectedFeature = featureId === selection.selectedFeatureId
    const isActiveObject = isSelectedFeature && objectId === selection.activeObjectId

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const mat = material as THREE.MeshStandardMaterial
      if (mat.userData.isError) {
        mat.emissive.set(isSelectedFeature ? palette.selectionEmissive : palette.errorEmissive)
        mat.emissiveIntensity = isSelectedFeature ? palette.errorSelectedIntensity : palette.errorIntensity
      } else if (mat.userData.isSemantic || mat.userData.isSemanticBase) {
        if (typeof mat.userData.semanticColor === 'string') {
          mat.color.set(mat.userData.semanticColor)
        }
        if (semanticObjectSelectionActive) {
          if (isActiveObject) {
            mat.color.lerp(semanticHighlightLift, 0.14)
          } else if (isSelectedFeature) {
            mat.color.lerp(semanticShadow, 0.14)
          } else {
            mat.color.lerp(semanticShadow, 0.28)
          }
          mat.emissive.set(isActiveObject ? palette.activeEmissive : '#000000')
          mat.emissiveIntensity = isActiveObject ? palette.semanticActiveEmissiveIntensity : 0
          mat.roughness = isActiveObject ? 0.58 : isSelectedFeature ? 0.8 : 0.86
        } else {
          mat.emissive.set(
            isActiveObject
              ? palette.activeEmissive
              : isSelectedFeature
                ? palette.selectionEmissive
                : '#000000',
          )
          mat.emissiveIntensity = isActiveObject
            ? palette.activeEmissiveIntensity
            : isSelectedFeature
              ? palette.selectionEmissiveIntensity
              : 0
          mat.roughness = 0.72
        }
      } else {
        mat.color.set(isActiveObject ? palette.activeObject : isSelectedFeature ? palette.selectedFeature : baseColor)
        mat.emissive.set(
          isActiveObject
            ? palette.activeEmissive
            : isSelectedFeature
              ? palette.selectionEmissive
              : palette.baseEmissive,
        )
        mat.emissiveIntensity = isActiveObject
          ? palette.activeEmissiveIntensity
          : isSelectedFeature
            ? palette.selectionEmissiveIntensity
            : palette.baseEmissiveIntensity
        mat.roughness = isActiveObject ? 0.38 : 0.72
      }
      mat.opacity = 1
      mat.transparent = false
      mat.depthWrite = true
    }
    mesh.visible = !isolateActive || isSelectedFeature
  }

  rebuildHandles(runtime, data, selection, hideOccludedEditEdges)
}

function rebuildHandles(
  runtime: Runtime,
  data: ViewerDataset,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedFaceRingIndex: number
    selectedVertexIndex: number | null
  },
  hideOccludedEditEdges: boolean,
) {
  hideEditWireframe(runtime)
  clearEditPointOverlays(runtime)
  runtime.transform.detach()
  runtime.transform.enabled = false
  runtime.editPivot = null
  runtime.handleGroup.position.set(0, 0, 0)
  runtime.edgeGroup.position.set(0, 0, 0)

  if (!selection.editMode || !selection.selectedFeatureId || !selection.activeObjectId) {
    return
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId)
  const draftVertices = selection.selectedFeatureId
    ? runtime.featureDrafts.get(selection.selectedFeatureId)
    : undefined

  if (!feature || !object || !draftVertices) {
    return
  }

  // Re-center edit geometry around the feature's own center to avoid
  // float32 precision jitter when zoomed in close and rotating.
  const editPivot: Vec3 = [
    (feature.extent[0] + feature.extent[3]) * 0.5,
    (feature.extent[1] + feature.extent[4]) * 0.5,
    (feature.extent[2] + feature.extent[5]) * 0.5,
  ]
  runtime.editPivot = editPivot
  runtime.handleGroup.position.set(
    editPivot[0] - data.center[0],
    editPivot[1] - data.center[1],
    editPivot[2] - data.center[2],
  )
  runtime.edgeGroup.position.set(
    editPivot[0] - data.center[0],
    editPivot[1] - data.center[1],
    editPivot[2] - data.center[2],
  )

  rebuildEditWireframe(
    runtime,
    data,
    selection,
    hideOccludedEditEdges,
  )

  runtime.editPoints = buildEditPoints(
    object.vertexIndices,
    draftVertices,
    editPivot,
    getViewportPalette(runtime.theme).editPoint,
    5.5,
    hideOccludedEditEdges,
  )
  runtime.handleGroup.add(runtime.editPoints)

  if (selection.selectedVertexIndex != null) {
    const selectedVertex = draftVertices[selection.selectedVertexIndex]
    if (selectedVertex) {
      runtime.selectedEditPoint = buildEditPoints(
        [selection.selectedVertexIndex],
        draftVertices,
        editPivot,
        getViewportPalette(runtime.theme).selectedEditPoint,
        7,
        hideOccludedEditEdges,
      )
      runtime.handleGroup.add(runtime.selectedEditPoint)

      runtime.transformProxy = new THREE.Object3D()
      runtime.transformProxy.position.set(
        selectedVertex[0] - editPivot[0],
        selectedVertex[1] - editPivot[1],
        selectedVertex[2] - editPivot[2],
      )
      runtime.handleGroup.add(runtime.transformProxy)
      runtime.transform.attach(runtime.transformProxy)
      runtime.transform.enabled = true
      runtime.transform.setSize(0.8)
    }
  }
}

function rebuildEditWireframe(
  runtime: Runtime,
  data: ViewerDataset,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedFaceRingIndex: number
    selectedVertexIndex: number | null
  },
  hideOccludedEditEdges: boolean,
) {
  if (!selection.editMode || !selection.selectedFeatureId || !selection.activeObjectId) {
    return
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId)
  const draftVertices = runtime.featureDrafts.get(selection.selectedFeatureId)

  if (!feature || !object || !draftVertices) {
    return
  }

  const edgeCenter = runtime.editPivot ?? data.center
  const edgeSegments = buildEdgeSegments(
    object.polygons,
    draftVertices,
    edgeCenter,
    selection.selectedFaceIndex,
    selection.selectedFaceRingIndex,
    selection.selectedVertexIndex,
  )
  ensureEditWireframeObjects(runtime)

  const baseMaterial = runtime.editBaseEdges?.material as LineMaterial | undefined
  if (baseMaterial) {
    baseMaterial.depthTest = hideOccludedEditEdges
    baseMaterial.needsUpdate = true
  }

  const highlightMaterial = runtime.editHighlightEdges?.material as LineMaterial | undefined
  if (highlightMaterial) {
    highlightMaterial.depthTest = selection.selectedFaceIndex == null ? hideOccludedEditEdges : false
    highlightMaterial.needsUpdate = true
  }

  const activeRingMaterial = runtime.editActiveRingEdges?.material as LineMaterial | undefined
  if (activeRingMaterial) {
    activeRingMaterial.depthTest = false
    activeRingMaterial.needsUpdate = true
  }

  setEditWireframeGeometry(runtime.editBaseEdges, edgeSegments.base)
  setEditWireframeGeometry(runtime.editHighlightEdges, edgeSegments.highlight)
  setEditWireframeGeometry(runtime.editActiveRingEdges, edgeSegments.activeRing)
}

function ensureEditWireframeObjects(runtime: Runtime) {
  if (!runtime.editBaseEdges) {
    const palette = getViewportPalette(runtime.theme)
    const edgeMaterial = new LineMaterial({
      color: palette.editBaseEdge,
      transparent: true,
      opacity: palette.editBaseOpacity,
      depthTest: true,
      depthWrite: false,
      linewidth: 3.2,
    })
    const edgeLines = new LineSegments2(new LineSegmentsGeometry(), edgeMaterial)
    edgeLines.renderOrder = 20
    edgeLines.visible = false
    runtime.edgeGroup.add(edgeLines)
    runtime.editBaseEdges = edgeLines
  }

  if (!runtime.editHighlightEdges) {
    const palette = getViewportPalette(runtime.theme)
    const highlightMaterial = new LineMaterial({
      color: palette.editHighlightEdge,
      transparent: true,
      opacity: palette.editHighlightOpacity,
      depthTest: true,
      depthWrite: false,
      linewidth: 4.8,
    })
    const highlightLines = new LineSegments2(new LineSegmentsGeometry(), highlightMaterial)
    highlightLines.renderOrder = 21
    highlightLines.visible = false
    runtime.edgeGroup.add(highlightLines)
    runtime.editHighlightEdges = highlightLines
  }

  if (!runtime.editActiveRingEdges) {
    const palette = getViewportPalette(runtime.theme)
    const activeRingMaterial = new LineMaterial({
      color: palette.editActiveRingEdge,
      transparent: true,
      opacity: palette.editActiveRingOpacity,
      depthTest: false,
      depthWrite: false,
      linewidth: 5.2,
    })
    const activeRingLines = new LineSegments2(new LineSegmentsGeometry(), activeRingMaterial)
    activeRingLines.renderOrder = 22
    activeRingLines.visible = false
    runtime.edgeGroup.add(activeRingLines)
    runtime.editActiveRingEdges = activeRingLines
  }

  updateEditWireframeResolution(runtime)
}

function updateEditWireframeResolution(runtime: Runtime) {
  const width = runtime.renderer.domElement.clientWidth
  const height = runtime.renderer.domElement.clientHeight

  if (runtime.editBaseEdges) {
    ;(runtime.editBaseEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editHighlightEdges) {
    ;(runtime.editHighlightEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editActiveRingEdges) {
    ;(runtime.editActiveRingEdges.material as LineMaterial).resolution.set(width, height)
  }
}

function setEditWireframeGeometry(line: LineSegments2 | null, positions: number[]) {
  if (!line) {
    return
  }

  const nextGeometry = new LineSegmentsGeometry()
  if (positions.length > 0) {
    nextGeometry.setPositions(positions)
    line.visible = true
  } else {
    line.visible = false
  }

  line.geometry.dispose()
  line.geometry = nextGeometry
}

function hideEditWireframe(runtime: Runtime) {
  if (runtime.editBaseEdges) {
    runtime.editBaseEdges.visible = false
  }

  if (runtime.editHighlightEdges) {
    runtime.editHighlightEdges.visible = false
  }

  if (runtime.editActiveRingEdges) {
    runtime.editActiveRingEdges.visible = false
  }
}

function buildObjectGeometry(
  polygons: PolygonRings[],
  vertices: Vec3[],
  center: Vec3,
  faceGroups?: Map<number, number>,
) {
  const positions: number[] = []
  const groupedIndices = new Map<number, number[]>()
  const groupedTriangleFaceIndices = new Map<number, number[]>()
  let offset = 0

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex++) {
    const polygon = polygons[polyIndex]
    const projectedPolygon = polygon
      .map((ring) =>
        ring
          .map((index) => vertices[index])
          .filter((vertex): vertex is Vec3 => Array.isArray(vertex)),
      )
      .filter((ring) => ring.length >= 3)

    if (projectedPolygon.length === 0) {
      continue
    }

    const flatVertices = projectedPolygon.flat()
    for (const vertex of flatVertices) {
      positions.push(vertex[0] - center[0], vertex[1] - center[1], vertex[2] - center[2])
    }

    const groupIndex = faceGroups?.get(polyIndex) ?? 0
    const bucket = groupedIndices.get(groupIndex) ?? []
    const bucketFaceIndices = groupedTriangleFaceIndices.get(groupIndex) ?? []
    const triangles = triangulatePolygon(projectedPolygon)
    for (const triangle of triangles) {
      bucket.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
      bucketFaceIndices.push(polyIndex)
    }
    groupedIndices.set(groupIndex, bucket)
    groupedTriangleFaceIndices.set(groupIndex, bucketFaceIndices)

    offset += flatVertices.length
  }

  const allIndices: number[] = []
  const triangleFaceIndices: number[] = []
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

  const sortedKeys = [...groupedIndices.keys()].sort((a, b) => a - b)
  for (const key of sortedKeys) {
    const bucket = groupedIndices.get(key)!
    const bucketFaceIndices = groupedTriangleFaceIndices.get(key) ?? []
    const start = allIndices.length
    allIndices.push(...bucket)
    triangleFaceIndices.push(...bucketFaceIndices)
    geometry.addGroup(start, bucket.length, key)
  }

  geometry.setIndex(allIndices)
  geometry.userData.triangleFaceIndices = triangleFaceIndices
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function buildEditPoints(
  vertexIndices: number[],
  vertices: Vec3[],
  center: Vec3,
  color: string,
  size: number,
  depthTest: boolean,
) {
  const positions: number[] = []

  for (const vertexIndex of vertexIndices) {
    const vertex = vertices[vertexIndex]
    if (!vertex) {
      continue
    }

    positions.push(
      vertex[0] - center[0],
      vertex[1] - center[1],
      vertex[2] - center[2],
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: false,
    depthTest,
    depthWrite: false,
    transparent: true,
    opacity: 0.96,
  })
  const points = new THREE.Points(geometry, material)
  points.userData.vertexIndices = vertexIndices.slice()
  points.renderOrder = 30
  return points
}

function syncEditPointGeometry(
  runtime: Runtime,
  data: ViewerDataset,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedVertexIndex: number | null
  },
) {
  if (!selection.selectedFeatureId || !selection.activeObjectId) {
    return
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId)
  const draftVertices = runtime.featureDrafts.get(selection.selectedFeatureId)
  if (!feature || !object || !draftVertices) {
    return
  }

  const pointCenter = runtime.editPivot ?? data.center
  updatePointPositions(runtime.editPoints, object.vertexIndices, draftVertices, pointCenter)
  updatePointPositions(
    runtime.selectedEditPoint,
    selection.selectedVertexIndex != null ? [selection.selectedVertexIndex] : [],
    draftVertices,
    pointCenter,
  )
}

function updatePointPositions(
  points: THREE.Points | null,
  vertexIndices: number[],
  vertices: Vec3[],
  center: Vec3,
) {
  if (!points) {
    return
  }

  const positions = points.geometry.getAttribute('position')
  if (!(positions instanceof THREE.BufferAttribute)) {
    return
  }

  for (let index = 0; index < vertexIndices.length; index += 1) {
    const vertex = vertices[vertexIndices[index]]
    if (!vertex) {
      continue
    }

    positions.setXYZ(
      index,
      vertex[0] - center[0],
      vertex[1] - center[1],
      vertex[2] - center[2],
    )
  }

  positions.needsUpdate = true
  points.geometry.computeBoundingSphere()
}

function updateEditPointRaycastThreshold(
  runtime: Runtime,
  data: ViewerDataset,
  selection: {
    selectedFeatureId: string | null
    activeObjectId: string | null
    editMode: boolean
    selectedFaceIndex: number | null
    selectedVertexIndex: number | null
  },
) {
  const feature = selection.selectedFeatureId
    ? data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
    : null
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId) ?? null
  if (!feature || !object) {
    runtime.raycaster.params.Points.threshold = 1
    return
  }

  const objectExtent = extentFromVertexIndices(object.vertexIndices, feature.vertices)
  const viewportHeight = runtime.renderer.domElement.clientHeight
  if (!objectExtent || viewportHeight <= 0) {
    runtime.raycaster.params.Points.threshold = 1
    return
  }

  const center = localCenterFromExtent(objectExtent, data.center)
  const distance = runtime.camera.position.distanceTo(center)
  const fovRadians = THREE.MathUtils.degToRad(runtime.camera.fov)
  const worldUnitsPerPixel = (2 * Math.tan(fovRadians / 2) * distance) / viewportHeight
  runtime.raycaster.params.Points.threshold = Math.max(worldUnitsPerPixel * 8, 0.05)
}

function clearEditPointOverlays(runtime: Runtime) {
  if (runtime.editPoints) {
    runtime.editPoints.geometry.dispose()
    ;(runtime.editPoints.material as THREE.Material).dispose()
    runtime.handleGroup.remove(runtime.editPoints)
    runtime.editPoints = null
  }

  if (runtime.selectedEditPoint) {
    runtime.selectedEditPoint.geometry.dispose()
    ;(runtime.selectedEditPoint.material as THREE.Material).dispose()
    runtime.handleGroup.remove(runtime.selectedEditPoint)
    runtime.selectedEditPoint = null
  }

  if (runtime.transformProxy) {
    runtime.handleGroup.remove(runtime.transformProxy)
    runtime.transformProxy = null
  }
}

function renderViewport(runtime: Runtime) {
  updateCameraClipping(runtime)
  runtime.renderer.clear(true, true, true)
  runtime.renderer.render(runtime.scene, runtime.camera)
}

function buildEdgeSegments(
  polygons: PolygonRings[],
  vertices: Vec3[],
  center: Vec3,
  selectedFaceIndex: number | null,
  selectedFaceRingIndex: number,
  selectedVertexIndex: number | null,
) {
  const base: number[] = []
  const highlight: number[] = []
  const activeRing: number[] = []
  const edgeMap = new Map<string, { positions: number[]; tier: 0 | 1 | 2 }>()

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex += 1) {
    const polygon = polygons[polyIndex]
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex]
      if (ring.length < 2) {
        continue
      }

      for (let index = 0; index < ring.length; index += 1) {
        const startIndex = ring[index]
        const endIndex = ring[(index + 1) % ring.length]
        const start = vertices[startIndex]
        const end = vertices[endIndex]
        if (!start || !end) {
          continue
        }

        const edgeKey =
          startIndex < endIndex ? `${startIndex}:${endIndex}` : `${endIndex}:${startIndex}`
        const isSelectedFace = selectedFaceIndex === polyIndex
        const isActiveRing = isSelectedFace && ringIndex === selectedFaceRingIndex
        const touchesSelectedVertex =
          selectedVertexIndex != null &&
          (startIndex === selectedVertexIndex || endIndex === selectedVertexIndex)
        const edgeTier: 0 | 1 | 2 =
          isActiveRing
            ? 2
            : isSelectedFace || touchesSelectedVertex
              ? 1
              : 0
        const edgePositions = [
          start[0] - center[0],
          start[1] - center[1],
          start[2] - center[2],
          end[0] - center[0],
          end[1] - center[1],
          end[2] - center[2],
        ]
        const existing = edgeMap.get(edgeKey)
        if (existing) {
          existing.tier = Math.max(existing.tier, edgeTier) as 0 | 1 | 2
        } else {
          edgeMap.set(edgeKey, {
            positions: edgePositions,
            tier: edgeTier,
          })
        }
      }
    }
  }

  for (const edge of edgeMap.values()) {
    if (edge.tier === 2) {
      activeRing.push(...edge.positions)
    } else if (edge.tier === 1) {
      highlight.push(...edge.positions)
    } else {
      base.push(...edge.positions)
    }
  }

  return { base, highlight, activeRing }
}

function triangulatePolygon(rings: Vec3[][]) {
  const normal = computeNormal(rings[0])
  const { origin, axisU, axisV } = makeBasis(rings[0][0], normal)

  const outer = rings[0].map((vertex) => projectToPlane(vertex, origin, axisU, axisV))
  const holes = rings.slice(1).map((ring) => ring.map((vertex) => projectToPlane(vertex, origin, axisU, axisV)))

  return THREE.ShapeUtils.triangulateShape(outer, holes)
}

function computeNormal(points: Vec3[]) {
  let nx = 0
  let ny = 0
  let nz = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    nx += (current[1] - next[1]) * (current[2] + next[2])
    ny += (current[2] - next[2]) * (current[0] + next[0])
    nz += (current[0] - next[0]) * (current[1] + next[1])
  }

  const normal = new THREE.Vector3(nx, ny, nz)
  if (normal.lengthSq() === 0) {
    return new THREE.Vector3(0, 0, 1)
  }

  return normal.normalize()
}

function makeBasis(originPoint: Vec3, normal: THREE.Vector3) {
  const origin = new THREE.Vector3(originPoint[0], originPoint[1], originPoint[2])
  const tangentSeed = Math.abs(normal.z) > 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const axisU = new THREE.Vector3().crossVectors(normal, tangentSeed).normalize()
  const axisV = new THREE.Vector3().crossVectors(normal, axisU).normalize()

  return { origin, axisU, axisV }
}

function projectToPlane(
  point: Vec3,
  origin: THREE.Vector3,
  axisU: THREE.Vector3,
  axisV: THREE.Vector3,
) {
  const vector = new THREE.Vector3(point[0], point[1], point[2]).sub(origin)
  return new THREE.Vector2(vector.dot(axisU), vector.dot(axisV))
}

function fitCameraToDataset(runtime: Runtime, data: ViewerDataset) {
  const sizeX = data.extent[3] - data.extent[0]
  const sizeY = data.extent[4] - data.extent[1]
  const sizeZ = data.extent[5] - data.extent[2]
  const size = Math.max(sizeX, sizeY, sizeZ)
  const focusPoint = new THREE.Vector3(0, 0, size * 0.15)
  const direction = new THREE.Vector3(0.75, -1.35, 0.85).normalize()
  const distance =
    size * 1.76 * lensDistanceScale(runtime.camera.fov)

  runtime.camera.position.copy(focusPoint).add(direction.multiplyScalar(distance))
  runtime.camera.lookAt(focusPoint)
  runtime.camera.updateMatrix()
  runtime.camera.updateMatrixWorld(true)
  runtime.arcball.minDistance = Math.max(size * 0.000002, 0.001)
  runtime.arcball.maxDistance = size * 18
  syncArcballState(runtime, focusPoint)
  updateCameraClipping(runtime)
}

function centerViewOnFeature(
  runtime: Runtime,
  data: ViewerDataset,
  feature: ViewerFeature,
) {
  const extent = feature.extent
  const center = localCenterFromExtent(extent, data.center)
  const direction = getCurrentViewDirection(runtime)
  const sizeX = extent[3] - extent[0]
  const sizeY = extent[4] - extent[1]
  const sizeZ = extent[5] - extent[2]
  const featureSize = Math.max(sizeX, sizeY, sizeZ)
  const baseDistance = Math.max(featureSize * 2.4, runtime.sceneScale * 0.06, 8)
  const distance = baseDistance * lensDistanceScale(runtime.camera.fov)

  const nextPosition = center.clone().add(direction.multiplyScalar(distance))
  setArcballPose(runtime, center, nextPosition)
}

function centerViewOnVertex(
  runtime: Runtime,
  data: ViewerDataset,
  focusTarget: Extract<ViewerFocusTarget, { kind: 'vertex' }>,
) {
  const feature = data.features.find((candidate) => candidate.id === focusTarget.featureId)
  if (!feature) {
    return
  }

  const vertex = feature.vertices[focusTarget.vertexIndex]
  if (!vertex) {
    return
  }

  const center = new THREE.Vector3(
    vertex[0] - data.center[0],
    vertex[1] - data.center[1],
    vertex[2] - data.center[2],
  )
  const currentCenter = getArcballCenter(runtime.arcball).clone()
  const cameraOffset = runtime.camera.position.clone().sub(currentCenter)
  const nextPosition = center.clone().add(cameraOffset)
  setArcballPose(runtime, center, nextPosition)
}

function centerViewOnValidationError(
  runtime: Runtime,
  data: ViewerDataset,
  focusTarget: Extract<ViewerFocusTarget, { kind: 'error' }>,
) {
  const feature = data.features.find((candidate) => candidate.id === focusTarget.featureId)
  if (!feature) {
    return
  }

  const object = focusTarget.objectId
    ? feature.objects.find((candidate) => candidate.id === focusTarget.objectId)
    : null

  const face =
    object && focusTarget.faceIndex != null ? object.polygons[focusTarget.faceIndex] ?? null : null
  const faceExtent = face
    ? extentFromVertexIndices(uniqueVertexIndices(face), feature.vertices)
    : null
  const objectExtent =
    object ? extentFromVertexIndices(object.vertexIndices, feature.vertices) : null
  const featureSize = extentMaxDimension(feature.extent)
  const objectSize = objectExtent ? extentMaxDimension(objectExtent) : featureSize
  const preserveCameraOffset = focusTarget.preserveCameraOffset === true

  if (faceExtent) {
    if (preserveCameraOffset) {
      centerViewOnExtentPreservingOffset(runtime, data, faceExtent)
    } else {
      centerViewOnExtent(runtime, data, faceExtent, Math.max(objectSize * 0.35, runtime.sceneScale * 0.015, 3))
    }
    return
  }

  if (focusTarget.location) {
    const center = new THREE.Vector3(
      focusTarget.location[0] - data.center[0],
      focusTarget.location[1] - data.center[1],
      focusTarget.location[2] - data.center[2],
    )
    const nextPosition = preserveCameraOffset
      ? center.clone().add(runtime.camera.position.clone().sub(getArcballCenter(runtime.arcball).clone()))
      : center.clone().add(
          getCurrentViewDirection(runtime).multiplyScalar(
            Math.max(objectSize * 0.85, featureSize * 0.18, runtime.sceneScale * 0.02, 4) *
              lensDistanceScale(runtime.camera.fov),
          ),
        )
    setArcballPose(runtime, center, nextPosition)
    return
  }

  if (objectExtent) {
    if (preserveCameraOffset) {
      centerViewOnExtentPreservingOffset(runtime, data, objectExtent)
    } else {
      centerViewOnExtent(runtime, data, objectExtent, Math.max(objectSize * 0.35, runtime.sceneScale * 0.015, 3))
    }
    return
  }

  centerViewOnFeature(runtime, data, feature)
}

function centerViewOnExtent(
  runtime: Runtime,
  data: ViewerDataset,
  extent: ViewerFeature['extent'],
  minimumDistance: number,
) {
  const center = localCenterFromExtent(extent, data.center)
  const direction = getCurrentViewDirection(runtime)
  const sizeX = extent[3] - extent[0]
  const sizeY = extent[4] - extent[1]
  const sizeZ = extent[5] - extent[2]
  const targetSize = Math.max(sizeX, sizeY, sizeZ)
  const baseDistance = Math.max(targetSize * 4.2, minimumDistance)
  const distance = baseDistance * lensDistanceScale(runtime.camera.fov)
  const nextPosition = center.clone().add(direction.multiplyScalar(distance))
  setArcballPose(runtime, center, nextPosition)
}

function centerViewOnExtentPreservingOffset(
  runtime: Runtime,
  data: ViewerDataset,
  extent: ViewerFeature['extent'],
) {
  const center = localCenterFromExtent(extent, data.center)
  const currentCenter = getArcballCenter(runtime.arcball).clone()
  const cameraOffset = runtime.camera.position.clone().sub(currentCenter)
  const nextPosition = center.clone().add(cameraOffset)
  setArcballPose(runtime, center, nextPosition)
}

function createMaterial(objectType: string, theme: Theme, semanticMode = false) {
  const material = new THREE.MeshStandardMaterial({
    color: semanticMode ? '#64748b' : baseColorForType(objectType, theme),
    roughness: 0.72,
    metalness: 0.08,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })

  if (semanticMode) {
    material.userData.isSemanticBase = true
  }

  return material
}

function baseColorForType(objectType: string, theme: Theme) {
  const palette =
    theme === 'light'
      ? ['#5f7690', '#58708b', '#506884', '#697f98', '#61768f']
      : ['#577590', '#5b7c99', '#516f88', '#617f98', '#64748b']
  const hash = [...objectType].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function createErrorMaterial(color: string) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.18,
    roughness: 0.5,
    metalness: 0.05,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  mat.userData.isError = true
  return mat
}

function createSemanticMaterial(color: string) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.08,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  mat.userData.isSemantic = true
  mat.userData.semanticColor = color
  return mat
}

function applyViewportTheme(runtime: Runtime, theme: Theme) {
  const palette = getViewportPalette(theme)

  if (runtime.scene.fog instanceof THREE.FogExp2) {
    runtime.scene.fog.color.set(palette.fog)
    runtime.scene.fog.density = palette.fogDensity
  }

  runtime.ambientLight.color.set(palette.ambient)
  runtime.ambientLight.intensity = palette.ambientIntensity
  runtime.hemisphereLight.color.set(palette.hemisphereSky)
  runtime.hemisphereLight.groundColor.set(palette.hemisphereGround)
  runtime.hemisphereLight.intensity = palette.hemisphereIntensity
  runtime.keyLight.color.set(palette.keyLight)
  runtime.keyLight.intensity = palette.keyIntensity
  runtime.fillLight.color.set(palette.fillLight)
  runtime.fillLight.intensity = palette.fillIntensity

  const edgeMaterial = runtime.editBaseEdges?.material as LineMaterial | undefined
  if (edgeMaterial) {
    edgeMaterial.color.set(palette.editBaseEdge)
    edgeMaterial.opacity = palette.editBaseOpacity
    edgeMaterial.needsUpdate = true
  }

  const highlightMaterial = runtime.editHighlightEdges?.material as LineMaterial | undefined
  if (highlightMaterial) {
    highlightMaterial.color.set(palette.editHighlightEdge)
    highlightMaterial.opacity = palette.editHighlightOpacity
    highlightMaterial.needsUpdate = true
  }

  const activeRingMaterial = runtime.editActiveRingEdges?.material as LineMaterial | undefined
  if (activeRingMaterial) {
    activeRingMaterial.color.set(palette.editActiveRingEdge)
    activeRingMaterial.opacity = palette.editActiveRingOpacity
    activeRingMaterial.needsUpdate = true
  }
}

function getViewportPalette(theme: Theme) {
  if (theme === 'light') {
    return {
      fog: '#c7d4e5',
      fogDensity: VIEWPORT_FOG_DENSITY.light,
      ambient: '#f6f9fd',
      ambientIntensity: 1.35,
      hemisphereSky: '#edf5ff',
      hemisphereGround: '#a8bccf',
      hemisphereIntensity: 0.92,
      keyLight: '#fff0d2',
      keyIntensity: 1.45,
      fillLight: '#5aa7cc',
      fillIntensity: 0.68,
      selectedFeature: '#7dd3fc',
      selectionEmissive: '#082f49',
      selectionEmissiveIntensity: 0.18,
      activeObject: '#f59e0b',
      activeEmissive: '#78350f',
      activeEmissiveIntensity: 0.22,
      semanticActiveEmissiveIntensity: 0.46,
      baseEmissive: '#020617',
      baseEmissiveIntensity: 0.18,
      errorEmissive: '#000000',
      errorIntensity: 0.18,
      errorSelectedIntensity: 0.12,
      editPoint: '#f8fafc',
      selectedEditPoint: '#f59e0b',
      editBaseEdge: '#e2e8f0',
      editBaseOpacity: 0.72,
      editHighlightEdge: '#d6d3c7',
      editHighlightOpacity: 0.96,
      editActiveRingEdge: '#475569',
      editActiveRingOpacity: 1,
    }
  }

  return {
    fog: '#061120',
    fogDensity: VIEWPORT_FOG_DENSITY.dark,
    ambient: '#f6f8ff',
    ambientIntensity: 1.6,
    hemisphereSky: '#b9e4ff',
    hemisphereGround: '#09111c',
    hemisphereIntensity: 1.1,
    keyLight: '#fff2d7',
    keyIntensity: 1.8,
    fillLight: '#78d6ff',
    fillIntensity: 0.9,
    selectedFeature: '#7dd3fc',
    selectionEmissive: '#082f49',
    selectionEmissiveIntensity: 0.18,
    activeObject: '#f59e0b',
    activeEmissive: '#78350f',
    activeEmissiveIntensity: 0.22,
    semanticActiveEmissiveIntensity: 0.46,
    baseEmissive: '#020617',
    baseEmissiveIntensity: 0.18,
    errorEmissive: '#000000',
    errorIntensity: 0.18,
    errorSelectedIntensity: 0.12,
    editPoint: '#f8fafc',
    selectedEditPoint: '#f59e0b',
    editBaseEdge: '#f8fafc',
    editBaseOpacity: 0.45,
    editHighlightEdge: '#d6d3c7',
    editHighlightOpacity: 0.95,
    editActiveRingEdge: '#475569',
    editActiveRingOpacity: 1,
  }
}

function computeFaceErrorGroups(
  errors: ViewerValidationError[],
  objectId: string,
): { faceGroups: Map<number, number>; groupColors: Map<number, string> } {
  const codeToGroup = new Map<number, number>()
  let nextGroup = 1
  const faceGroups = new Map<number, number>()
  const groupColors = new Map<number, string>()

  for (const error of errors) {
    if (error.cityObjectId !== objectId || error.faceIndex == null) {
      continue
    }
    if (faceGroups.has(error.faceIndex)) {
      continue
    }

    let group = codeToGroup.get(error.code)
    if (group == null) {
      group = nextGroup++
      codeToGroup.set(error.code, group)
      groupColors.set(group, errorColor(error.code))
    }
    faceGroups.set(error.faceIndex, group)
  }

  return { faceGroups, groupColors }
}

function computeFaceSemanticGroups(
  semanticSurfaces: Array<ViewerSemanticSurface | null>,
  selectedFaceIndex: number | null,
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

  if (selectedFaceIndex != null && selectedFaceIndex >= 0 && selectedFaceIndex < semanticSurfaces.length) {
    const selectedGroup = nextGroup++
    faceGroups.set(selectedFaceIndex, selectedGroup)
    groupColors.set(selectedGroup, '#f59e0b')
  }

  return { faceGroups, groupColors }
}

function buildMaterialArray(
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

function objectKey(featureId: string, objectId: string) {
  return `${featureId}::${objectId}`
}

function updateRaycastPointer(runtime: Runtime, event: MouseEvent) {
  const rect = runtime.renderer.domElement.getBoundingClientRect()
  runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera)
}

function getDatasetViewKey(data: ViewerDataset) {
  const firstId = data.features[0]?.id ?? ''
  const lastId = data.features.at(-1)?.id ?? ''
  return `${data.sourceName}:${data.features.length}:${firstId}:${lastId}`
}

function setArcballPose(runtime: Runtime, center: THREE.Vector3, cameraPosition: THREE.Vector3) {
  runtime.camera.position.copy(cameraPosition)
  syncArcballState(runtime, center)
}

function syncArcballState(runtime: Runtime, center = getArcballCenter(runtime.arcball).clone()) {
  const internals = getArcballInternals(runtime.arcball)
  const target = getArcballTarget(runtime.arcball)

  target.copy(center)
  internals._currentTarget.copy(center)
  internals._gizmos.position.copy(center)
  internals._gizmos.updateMatrix()
  runtime.camera.updateMatrix()
  runtime.camera.updateMatrixWorld(true)
  internals._tbRadius = internals.calculateTbRadius(runtime.camera)
  internals.makeGizmos(center, internals._tbRadius)
  internals.updateMatrixState()
}

function getArcballTarget(arcball: ArcballControls) {
  return (arcball as ArcballControls & { target: THREE.Vector3 }).target
}

function getArcballInternals(arcball: ArcballControls) {
  return arcball as ArcballControls & {
    _currentTarget: THREE.Vector3
    _gizmos: THREE.Group
    _tbRadius: number
    calculateTbRadius: (camera: THREE.Camera) => number
    makeGizmos: (center: THREE.Vector3, radius: number) => void
    updateMatrixState: () => void
  }
}

function getArcballCenter(arcball: ArcballControls) {
  return getArcballInternals(arcball)._gizmos.position
}

function lensDistanceScale(verticalFovDegrees: number) {
  const referenceFovRadians = THREE.MathUtils.degToRad(50)
  const currentFovRadians = THREE.MathUtils.degToRad(verticalFovDegrees)
  return Math.tan(referenceFovRadians / 2) / Math.tan(currentFovRadians / 2)
}

function findNearestVertexIndexOnPolygon(
  hitPoint: THREE.Vector3,
  polygon: PolygonRings,
  vertices: Vec3[],
  dataCenter: Vec3,
) {
  let nearestVertexIndex: number | null = null
  let nearestDistanceSquared = Number.POSITIVE_INFINITY

  for (const vertexIndex of uniqueVertexIndices(polygon)) {
    const vertex = vertices[vertexIndex]
    if (!vertex) {
      continue
    }

    const localVertex = new THREE.Vector3(
      vertex[0] - dataCenter[0],
      vertex[1] - dataCenter[1],
      vertex[2] - dataCenter[2],
    )
    const distanceSquared = localVertex.distanceToSquared(hitPoint)
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared
      nearestVertexIndex = vertexIndex
    }
  }

  return nearestVertexIndex
}

function updateCameraClipping(runtime: Runtime) {
  const center = getArcballCenter(runtime.arcball)
  const distance = Math.max(runtime.camera.position.distanceTo(center), 0.001)
  const sceneScale = Math.max(runtime.sceneScale, 1)
  const nextNear = Math.max(Math.min(distance * 0.01, sceneScale / 1500), 0.0005)
  const nextFar = Math.max(sceneScale * 8, distance * 8, 50)

  if (
    Math.abs(runtime.camera.near - nextNear) > 1e-7 ||
    Math.abs(runtime.camera.far - nextFar) > 1e-4
  ) {
    runtime.camera.near = nextNear
    runtime.camera.far = nextFar
    runtime.camera.updateProjectionMatrix()
  }
}

function getCurrentViewDirection(runtime: Runtime) {
  const currentDirection = new THREE.Vector3().subVectors(
    runtime.camera.position,
    getArcballCenter(runtime.arcball),
  )

  return currentDirection.lengthSq() > 0
    ? currentDirection.normalize()
    : new THREE.Vector3(0.45, -0.8, 0.42).normalize()
}

function localCenterFromExtent(extent: ViewerFeature['extent'], center: Vec3) {
  return new THREE.Vector3(
    (extent[0] + extent[3]) * 0.5 - center[0],
    (extent[1] + extent[4]) * 0.5 - center[1],
    (extent[2] + extent[5]) * 0.5 - center[2],
  )
}

function extentFromVertexIndices(indices: number[], vertices: Vec3[]): ViewerFeature['extent'] | null {
  const extent: ViewerFeature['extent'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  let hasVertex = false

  for (const index of indices) {
    const vertex = vertices[index]
    if (!vertex) {
      continue
    }

    hasVertex = true
    extent[0] = Math.min(extent[0], vertex[0])
    extent[1] = Math.min(extent[1], vertex[1])
    extent[2] = Math.min(extent[2], vertex[2])
    extent[3] = Math.max(extent[3], vertex[0])
    extent[4] = Math.max(extent[4], vertex[1])
    extent[5] = Math.max(extent[5], vertex[2])
  }

  return hasVertex ? extent : null
}

function uniqueVertexIndices(polygon: PolygonRings) {
  return [...new Set(polygon.flat())]
}

function extentMaxDimension(extent: ViewerFeature['extent']) {
  return Math.max(extent[3] - extent[0], extent[4] - extent[1], extent[5] - extent[2])
}

function clearTransientGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    if (
      'geometry' in child &&
      (child.geometry instanceof THREE.BufferGeometry || child.geometry instanceof LineSegmentsGeometry)
    ) {
      child.geometry.dispose()
    }

    const material =
      child instanceof THREE.Mesh ||
      child instanceof THREE.Points ||
      child instanceof THREE.LineSegments ||
      child instanceof LineSegments2
        ? child.material
        : null
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose()
      }
    } else {
      material?.dispose()
    }

    group.remove(child)
  }
}

function disposeSceneContents(runtime: Runtime) {
  for (const mesh of runtime.meshesByObjectKey.values()) {
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) mat.dispose()
    runtime.rootGroup.remove(mesh)
  }
  runtime.meshesByObjectKey.clear()

  clearEditPointOverlays(runtime)
  clearTransientGroup(runtime.annotationGroup)
  runtime.annotationVertexMarkers = []

  clearTransientGroup(runtime.edgeGroup)
  runtime.editBaseEdges = null
  runtime.editHighlightEdges = null
  runtime.editActiveRingEdges = null
}

export { CityViewport }
