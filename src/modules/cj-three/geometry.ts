import * as THREE from 'three'
import { hasVertex, vertexAt, vertexComponent, polygonAt, polygonRings } from '../cityjson-core/buffers'
import type { IndexArray, VertexInput, PolygonInput, PolygonRings, Vec3 } from '../cityjson-core/types'
import type { ObjectGeometryBlueprint } from './types'

export const PLANARITY_DISTANCE_TOLERANCE = 0.0001
export const PLANARITY_RELATIVE_TOLERANCE = 1e-7
export const NON_PLANAR_NORMAL_EXTRA_VERTEX_RATIO = 0.1
export const NON_PLANAR_NORMAL_EXTRA_VERTEX_MIN_BUDGET = 10000
export const NON_PLANAR_NORMAL_EXTRA_VERTEX_MAX_BUDGET = 500000
export const EMPTY_FACE_INDEX_SET = new Set<number>()

export function buildObjectGeometryBlueprint(
  polygons: PolygonInput,
  vertices: VertexInput,
  center: Vec3,
  triangleNormalFaceIndices: ReadonlySet<number> = EMPTY_FACE_INDEX_SET,
): ObjectGeometryBlueprint {
  let vertexCapacity = countRenderablePolygonVertices(polygons, vertices)
  let positions = new Float32Array(vertexCapacity * 3)
  let normals = new Float32Array(vertexCapacity * 3)
  const polygonTriangleIndices: number[][] = []
  let offset = 0
  let nonPlanarNormalExtraVertexCount = 0
  const nonPlanarNormalExtraVertexBudget = Math.min(
    Math.max(
      Math.floor(vertexCapacity * NON_PLANAR_NORMAL_EXTRA_VERTEX_RATIO),
      NON_PLANAR_NORMAL_EXTRA_VERTEX_MIN_BUDGET,
    ),
    NON_PLANAR_NORMAL_EXTRA_VERTEX_MAX_BUDGET,
  )

  function ensureVertexCapacity(requiredVertexCount: number) {
    if (requiredVertexCount <= vertexCapacity) {
      return
    }

    const nextCapacity = Math.max(requiredVertexCount, Math.ceil(vertexCapacity * 1.5), vertexCapacity + 1024)
    const nextPositions = new Float32Array(nextCapacity * 3)
    const nextNormals = new Float32Array(nextCapacity * 3)
    nextPositions.set(positions)
    nextNormals.set(normals)
    positions = nextPositions
    normals = nextNormals
    vertexCapacity = nextCapacity
  }

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex += 1) {
    const sourcePolygon = polygonAt(polygons, polyIndex)!
    const allowTriangleNormals = triangleNormalFaceIndices.has(polyIndex)
    if (
      sourcePolygon.length === 1 &&
      !allowTriangleNormals &&
      !hasClosingDuplicateVertex(sourcePolygon[0], vertices)
    ) {
      const ring = sourcePolygon[0]
      const polygonVertexCount = countRenderableRingVertices(ring, vertices)
      if (polygonVertexCount < 3) {
        polygonTriangleIndices.push([])
        continue
      }

      const normal = computeIndexedRingNormal(ring, vertices)
      ensureVertexCapacity(offset + polygonVertexCount)
      fillIndexedRingBuffers(ring, vertices, center, normal, positions, normals, offset * 3)

      if (polygonVertexCount === 3) {
        polygonTriangleIndices.push([offset, offset + 1, offset + 2])
      } else if (polygonVertexCount === 4 && isConvexIndexedRing(ring, vertices, normal)) {
        polygonTriangleIndices.push([offset, offset + 1, offset + 2, offset, offset + 2, offset + 3])
      } else {
        const ringVertices = collectRingVertices(ring, vertices)
        const triangles = triangulatePolygon([ringVertices])
        const polygonIndices: number[] = []
        for (const triangle of triangles) {
          polygonIndices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
        }
        polygonTriangleIndices.push(polygonIndices)
      }

      offset += polygonVertexCount
      continue
    }

    const polygon = preparePolygonGeometry(
      sourcePolygon,
      vertices,
      allowTriangleNormals,
    )
    if (polygon.compactVertexCount === 0) {
      polygonTriangleIndices.push([])
      continue
    }

    const polygonIndices: number[] = []
    const extraTriangleVertexCount = polygon.triangleVertexCount - polygon.compactVertexCount
    const useTriangleVertices =
      polygon.isNonPlanar &&
      extraTriangleVertexCount > 0 &&
      nonPlanarNormalExtraVertexCount + extraTriangleVertexCount <= nonPlanarNormalExtraVertexBudget
    const outputVertexCount = useTriangleVertices ? polygon.triangleVertexCount : polygon.compactVertexCount
    ensureVertexCapacity(offset + outputVertexCount)
    if (useTriangleVertices) {
      const writtenVertexCount = appendTriangleRingVertexBuffers(
        polygon.rings,
        polygon.ringOffsets,
        polygon.triangles,
        center,
        polygon.normal,
        positions,
        normals,
        offset,
        polygonIndices,
      )
      offset += writtenVertexCount
      nonPlanarNormalExtraVertexCount += Math.max(writtenVertexCount - polygon.compactVertexCount, 0)
    } else {
      fillPolygonRingBuffers(polygon.rings, center, polygon.normal, positions, normals, offset * 3)
      for (const triangle of polygon.triangles) {
        polygonIndices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
      }
      offset += polygon.compactVertexCount
    }

    polygonTriangleIndices.push(polygonIndices)
  }

  const usedComponentCount = offset * 3

  const blueprint: ObjectGeometryBlueprint = {
    positions: usedComponentCount === positions.length ? positions : positions.slice(0, usedComponentCount),
    normals: usedComponentCount === normals.length ? normals : normals.slice(0, usedComponentCount),
    polygonTriangleIndices,
  }

  return blueprint
}

export function preparePolygonGeometry(
  polygon: PolygonRings,
  vertices: VertexInput,
  allowTriangleNormals: boolean,
) {
  const rings: Vec3[][] = []
  for (const ring of polygon) {
    const preparedRing = removeClosingDuplicateVertex(collectRingVertices(ring, vertices))
    if (preparedRing.length >= 3) {
      rings.push(preparedRing)
    }
  }

  if (rings.length === 0) {
    return {
      rings: [],
      ringOffsets: [],
      triangles: [],
      normal: new THREE.Vector3(0, 0, 1),
      isNonPlanar: false,
      compactVertexCount: 0,
      triangleVertexCount: 0,
    }
  }

  const normal = computeNormal(rings[0])
  const triangles = triangulatePolygon(rings)
  let ringVertexCount = 0
  for (const ring of rings) {
    ringVertexCount += ring.length
  }
  const isNonPlanar = allowTriangleNormals && ringVertexCount > 3 && isNonPlanarPolygon(rings, normal)
  const ringOffsets = isNonPlanar ? collectRingOffsets(rings) : []

  return {
    rings,
    ringOffsets,
    triangles,
    normal,
    isNonPlanar,
    compactVertexCount: ringVertexCount,
    triangleVertexCount: triangles.length * 3,
  }
}

export function collectRingOffsets(rings: Vec3[][]) {
  const ringOffsets: number[] = []
  let offset = 0
  for (const ring of rings) {
    ringOffsets.push(offset)
    offset += ring.length
  }
  return ringOffsets
}

export function countRenderablePolygonVertices(polygons: PolygonInput, vertices: VertexInput) {
  let count = 0
  if (!Array.isArray(polygons)) {
    for (let r = 0; r < polygons.ringOffsets.length - 1; r++) {
      let ringCount = 0
      for (let i = polygons.ringOffsets[r]; i < polygons.ringOffsets[r + 1]; i++) {
        if (hasVertex(vertices, polygons.indices[i])) ringCount++
      }
      if (ringCount >= 3) count += ringCount
    }
    return count
  }

  for (const polygon of polygonRings(polygons)) {
    let polygonCount = 0
    for (const ring of polygon) {
      let ringCount = 0
      for (const index of ring) {
        if (hasVertex(vertices, index)) {
          ringCount += 1
        }
      }
      if (ringCount >= 3) {
        polygonCount += ringCount
      }
    }
    count += polygonCount
  }

  return count
}

export function countRenderableRingVertices(ring: IndexArray, vertices: VertexInput) {
  let count = 0
  for (const index of ring) {
    if (hasVertex(vertices, index)) {
      count += 1
    }
  }
  return count
}

export function collectRingVertices(ring: IndexArray, vertices: VertexInput) {
  const ringVertices: Vec3[] = []
  for (const index of ring) {
    const vertex = vertexAt(vertices, index)
    if (vertex) {
      ringVertices.push(vertex)
    }
  }
  return ringVertices
}

export function hasClosingDuplicateVertex(ring: IndexArray, vertices: VertexInput) {
  if (ring.length < 2) {
    return false
  }

  const first = ring[0]
  const last = ring[ring.length - 1]
  return hasVertex(vertices, first) && hasVertex(vertices, last) &&
    vertexComponent(vertices, first, 0) === vertexComponent(vertices, last, 0) &&
    vertexComponent(vertices, first, 1) === vertexComponent(vertices, last, 1) &&
    vertexComponent(vertices, first, 2) === vertexComponent(vertices, last, 2)
}

export function removeClosingDuplicateVertex(ringVertices: Vec3[]) {
  if (ringVertices.length < 2) {
    return ringVertices
  }

  const first = ringVertices[0]
  const last = ringVertices[ringVertices.length - 1]
  return samePoint(first, last)
    ? ringVertices.slice(0, -1)
    : ringVertices
}

export function samePoint(first: Vec3, second: Vec3) {
  return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

export function fillIndexedRingBuffers(
  ring: IndexArray,
  vertices: VertexInput,
  center: Vec3,
  normal: THREE.Vector3,
  positions: Float32Array,
  normals: Float32Array,
  startOffset: number,
) {
  let componentOffset = startOffset

  for (const index of ring) {
    if (!hasVertex(vertices, index)) continue
    positions[componentOffset] = vertexComponent(vertices, index, 0) - center[0]
    normals[componentOffset++] = normal.x
    positions[componentOffset] = vertexComponent(vertices, index, 1) - center[1]
    normals[componentOffset++] = normal.y
    positions[componentOffset] = vertexComponent(vertices, index, 2) - center[2]
    normals[componentOffset++] = normal.z
  }
}

export function fillPolygonRingBuffers(
  rings: Vec3[][],
  center: Vec3,
  normal: THREE.Vector3,
  positions: Float32Array,
  normals: Float32Array,
  startOffset: number,
) {
  let componentOffset = startOffset

  for (const ring of rings) {
    for (const vertex of ring) {
      positions[componentOffset] = vertex[0] - center[0]
      normals[componentOffset++] = normal.x
      positions[componentOffset] = vertex[1] - center[1]
      normals[componentOffset++] = normal.y
      positions[componentOffset] = vertex[2] - center[2]
      normals[componentOffset++] = normal.z
    }
  }
}

export function appendTriangleRingVertexBuffers(
  rings: Vec3[][],
  ringOffsets: number[],
  triangles: number[][],
  center: Vec3,
  fallbackNormal: THREE.Vector3,
  positions: Float32Array,
  normals: Float32Array,
  startVertexOffset: number,
  polygonIndices: number[],
) {
  let vertexOffset = startVertexOffset
  let componentOffset = startVertexOffset * 3

  for (const triangle of triangles) {
    const first = getRingVertexAt(rings, ringOffsets, triangle[0])
    const second = getRingVertexAt(rings, ringOffsets, triangle[1])
    const third = getRingVertexAt(rings, ringOffsets, triangle[2])
    if (!first || !second || !third) {
      continue
    }

    const normal = computeTriangleNormal(first, second, third, fallbackNormal)
    for (const vertexIndex of triangle) {
      const vertex = getRingVertexAt(rings, ringOffsets, vertexIndex)
      if (!vertex) {
        continue
      }

      positions[componentOffset] = vertex[0] - center[0]
      normals[componentOffset++] = normal.x
      positions[componentOffset] = vertex[1] - center[1]
      normals[componentOffset++] = normal.y
      positions[componentOffset] = vertex[2] - center[2]
      normals[componentOffset++] = normal.z
      polygonIndices.push(vertexOffset++)
    }
  }

  return vertexOffset - startVertexOffset
}

export function getRingVertexAt(rings: Vec3[][], ringOffsets: number[], flatIndex: number) {
  for (let ringIndex = ringOffsets.length - 1; ringIndex >= 0; ringIndex -= 1) {
    const ringOffset = ringOffsets[ringIndex]
    if (flatIndex >= ringOffset) {
      return rings[ringIndex][flatIndex - ringOffset] ?? null
    }
  }

  return null
}

export function buildGroupedObjectGeometry(
  blueprint: ObjectGeometryBlueprint,
  faceGroups: Map<number, number>,
) {
  if (faceGroups.size === 0) {
    return buildUngroupedObjectGeometry(blueprint)
  }

  const groupedIndices = new Map<number, number[]>()
  const triangleFaceIndicesByGroup = new Map<number, number[]>()

  blueprint.polygonTriangleIndices.forEach((polygonIndices, polyIndex) => {
    if (polygonIndices.length === 0) {
      return
    }

    const groupIndex = faceGroups.get(polyIndex) ?? 0
    const groupIndices = groupedIndices.get(groupIndex) ?? []
    appendNumbers(groupIndices, polygonIndices)
    groupedIndices.set(groupIndex, groupIndices)

    const groupFaceIndices = triangleFaceIndicesByGroup.get(groupIndex) ?? []
    for (let triangleIndex = 0; triangleIndex < polygonIndices.length; triangleIndex += 3) {
      groupFaceIndices.push(polyIndex)
    }
    triangleFaceIndicesByGroup.set(groupIndex, groupFaceIndices)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(blueprint.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(blueprint.normals, 3))

  const allIndices: number[] = []
  const triangleFaceIndices: number[] = []
  const sortedKeys = Array.from(groupedIndices.keys()).toSorted((a, b) => a - b)
  for (const key of sortedKeys) {
    const groupIndices = groupedIndices.get(key) ?? []
    const groupFaceIndices = triangleFaceIndicesByGroup.get(key) ?? []
    const start = allIndices.length
    appendNumbers(allIndices, groupIndices)
    appendNumbers(triangleFaceIndices, groupFaceIndices)
    geometry.addGroup(start, groupIndices.length, key)
  }

  geometry.setIndex(allIndices)
  geometry.userData.triangleFaceIndices = triangleFaceIndices
  geometry.computeBoundingSphere()
  return geometry
}

export function buildUngroupedObjectGeometry(blueprint: ObjectGeometryBlueprint) {
  let indexCount = 0
  let triangleCount = 0
  for (const polygonIndices of blueprint.polygonTriangleIndices) {
    indexCount += polygonIndices.length
    triangleCount += polygonIndices.length / 3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(blueprint.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(blueprint.normals, 3))

  const vertexCount = blueprint.positions.length / 3
  const allIndices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount)
  const triangleFaceIndices = new Uint32Array(triangleCount)
  let indexOffset = 0
  let triangleOffset = 0

  blueprint.polygonTriangleIndices.forEach((polygonIndices, polyIndex) => {
    for (let index = 0; index < polygonIndices.length; index += 1) {
      allIndices[indexOffset++] = polygonIndices[index]
    }
    for (let index = 0; index < polygonIndices.length; index += 3) {
      triangleFaceIndices[triangleOffset++] = polyIndex
    }
  })

  geometry.setIndex(new THREE.BufferAttribute(allIndices, 1))
  geometry.userData.triangleFaceIndices = triangleFaceIndices
  geometry.computeBoundingSphere()
  return geometry
}

export function appendNumbers(target: number[], source: ArrayLike<number>) {
  for (let index = 0; index < source.length; index += 1) {
    target.push(source[index])
  }
}

export function triangulatePolygon(rings: Vec3[][]) {
  if (rings.length === 1 && rings[0].length === 3) {
    return [[0, 1, 2]]
  }

  const normal = computeNormal(rings[0])
  const { origin, axisU, axisV } = makeBasis(rings[0][0], normal)

  const outer = rings[0].map((vertex) => projectToPlane(vertex, origin, axisU, axisV))
  const holes = rings.slice(1).map((ring) => ring.map((vertex) => projectToPlane(vertex, origin, axisU, axisV)))

  if (holes.length === 0 && outer.length === 4 && isConvexProjectedRing(outer)) {
    return [[0, 1, 2], [0, 2, 3]]
  }

  return THREE.ShapeUtils.triangulateShape(outer, holes)
}

export function isConvexProjectedRing(points: THREE.Vector2[]) {
  let sign = 0

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[index]
    const current = points[(index + 1) % points.length]
    const next = points[(index + 2) % points.length]
    const cross =
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x)

    if (Math.abs(cross) <= Number.EPSILON) {
      continue
    }

    const currentSign = Math.sign(cross)
    if (sign !== 0 && currentSign !== sign) {
      return false
    }
    sign = currentSign
  }

  return sign !== 0
}

export function isConvexIndexedRing(ring: IndexArray, vertices: VertexInput, normal: THREE.Vector3) {
  if (ring.length !== 4 || countRenderableRingVertices(ring, vertices) !== 4) return false
  const { origin, axisU, axisV } = makeBasis(vertexAt(vertices, ring[0])!, normal)
  const points: THREE.Vector2[] = []
  for (const index of ring) {
    const x = vertexComponent(vertices, index, 0) - origin.x
    const y = vertexComponent(vertices, index, 1) - origin.y
    const z = vertexComponent(vertices, index, 2) - origin.z
    points.push(new THREE.Vector2(x * axisU.x + y * axisU.y + z * axisU.z, x * axisV.x + y * axisV.y + z * axisV.z))
  }
  return isConvexProjectedRing(points)
}

export function isNonPlanarPolygon(rings: Vec3[][], normal: THREE.Vector3) {
  const origin = rings[0]?.[0]
  if (!origin) {
    return false
  }

  let maxDistanceSquared = 0
  for (const ring of rings) {
    for (const vertex of ring) {
      const dx = vertex[0] - origin[0]
      const dy = vertex[1] - origin[1]
      const dz = vertex[2] - origin[2]
      maxDistanceSquared = Math.max(maxDistanceSquared, dx * dx + dy * dy + dz * dz)
    }
  }

  const tolerance = Math.max(
    PLANARITY_DISTANCE_TOLERANCE,
    Math.sqrt(maxDistanceSquared) * PLANARITY_RELATIVE_TOLERANCE,
  )

  for (const ring of rings) {
    for (const vertex of ring) {
      const signedDistance =
        (vertex[0] - origin[0]) * normal.x +
        (vertex[1] - origin[1]) * normal.y +
        (vertex[2] - origin[2]) * normal.z
      if (Math.abs(signedDistance) > tolerance) {
        return true
      }
    }
  }

  return false
}

export function computeNormal(points: Vec3[]) {
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

export function computeIndexedRingNormal(ring: IndexArray, vertices: VertexInput) {
  let nx = 0
  let ny = 0
  let nz = 0
  let first = -1
  let previous = -1
  function addEdge(a: number, b: number) {
    const ax = vertexComponent(vertices, a, 0), ay = vertexComponent(vertices, a, 1), az = vertexComponent(vertices, a, 2)
    const bx = vertexComponent(vertices, b, 0), by = vertexComponent(vertices, b, 1), bz = vertexComponent(vertices, b, 2)
    nx += (ay - by) * (az + bz)
    ny += (az - bz) * (ax + bx)
    nz += (ax - bx) * (ay + by)
  }
  for (const index of ring) {
    if (!hasVertex(vertices, index)) continue
    if (first < 0) first = index
    if (previous >= 0) addEdge(previous, index)
    previous = index
  }
  if (first >= 0 && previous >= 0) addEdge(previous, first)

  const normal = new THREE.Vector3(nx, ny, nz)
  if (normal.lengthSq() === 0) {
    return new THREE.Vector3(0, 0, 1)
  }

  return normal.normalize()
}

export function computeTriangleNormal(first: Vec3, second: Vec3, third: Vec3, fallbackNormal: THREE.Vector3) {
  const ux = second[0] - first[0]
  const uy = second[1] - first[1]
  const uz = second[2] - first[2]
  const vx = third[0] - first[0]
  const vy = third[1] - first[1]
  const vz = third[2] - first[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz)

  if (length === 0) {
    return fallbackNormal
  }

  nx /= length
  ny /= length
  nz /= length

  if (nx * fallbackNormal.x + ny * fallbackNormal.y + nz * fallbackNormal.z < 0) {
    nx *= -1
    ny *= -1
    nz *= -1
  }

  return new THREE.Vector3(nx, ny, nz)
}

export function makeBasis(originPoint: Vec3, normal: THREE.Vector3) {
  const origin = new THREE.Vector3(originPoint[0], originPoint[1], originPoint[2])
  const tangentSeed = Math.abs(normal.z) > 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const axisU = new THREE.Vector3().crossVectors(normal, tangentSeed).normalize()
  const axisV = new THREE.Vector3().crossVectors(normal, axisU).normalize()

  return { origin, axisU, axisV }
}

export function projectToPlane(
  point: Vec3,
  origin: THREE.Vector3,
  axisU: THREE.Vector3,
  axisV: THREE.Vector3,
) {
  const vector = new THREE.Vector3(point[0], point[1], point[2]).sub(origin)
  return new THREE.Vector2(vector.dot(axisU), vector.dot(axisV))
}

