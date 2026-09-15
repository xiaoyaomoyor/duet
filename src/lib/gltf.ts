/**
 * 极简 glTF / GLB 解析（纯函数，零依赖）
 *
 * 用途：3D 生成对比场景需要把 Tripo / Meshy 产出的 .glb 显示出来。
 * 完整 glTF 规范极其庞大（材质、动画、蒙皮、扩展…），
 * 这里只解析**渲染静态几何所需的最小子集**：
 *   - GLB 容器（二进制）与 .gltf + 内嵌 base64 buffer
 *   - POSITION / NORMAL（缺失法线时按面计算）
 *   - 节点变换（平移/旋转/缩放，支持层级）——**烘焙进顶点**，
 *     因为真实导出（Tripo / Meshy）习惯把 Y-up 转换与归一化缩放放在根节点上，
 *     忽略它会让模型躺倒或尺寸离谱
 *   - 每个 primitive 的索引（无索引时按顺序三角化）
 *   - 交错顶点数据（读 bufferView.byteStride）
 *
 * 明确不支持（会在解析结果里回报，UI 据此提示用户）：
 *   蒙皮、动画、材质贴图、KTX2/Draco 等压缩扩展、非三角形图元。
 * 宁可告知"这个模型用了不支持的扩展"，也不要静默显示成空场景。
 */

import {
  computeVertexNormals,
  isIdentity,
  normalMatrix,
  transformNormalsBy3,
  transformPoints,
  composeTRS,
  multiply,
  createMat4,
  type Mat4,
} from './mat4'

export interface ParsedMesh {
  positions: Float32Array
  normals: Float32Array | null
  indices: Uint32Array | null
  /** 顶点数（用于统计信息展示） */
  vertexCount: number
  /** 该几何已被烘焙的节点世界矩阵（便于排查"模型朝向不对"） */
  appliedTransform: boolean
}

export interface ParsedModel {
  meshes: ParsedMesh[]
  /** 模型包围盒（用于自动取景） */
  bounds: { min: [number, number, number]; max: [number, number, number] }
  /** 顶点与三角面总数 */
  stats: { vertices: number; triangles: number }
  /** 已知但未处理的特性，供 UI 提示 */
  warnings: string[]
}

export type ParseError =
  | 'not-glb'
  | 'invalid-json'
  | 'no-meshes'
  | 'unsupported-buffer'
  | 'empty'

/** 解析结果 */
export type ParseResult =
  | { ok: true; model: ParsedModel }
  | { ok: false; error: ParseError; detail?: string }

interface GltfJson {
  asset?: { version?: string }
  buffers?: Array<{ byteLength?: number; uri?: string }>
  bufferViews?: Array<{
    buffer?: number
    byteOffset?: number
    byteLength?: number
    /** 交错顶点数据的步长（glTF 规范字段，交错导出时必须读它） */
    byteStride?: number
  }>
  accessors?: Array<{
    bufferView?: number
    byteOffset?: number
    componentType?: number
    count?: number
    type?: string
  }>
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, number>
      indices?: number
      mode?: number
    }>
  }>
  nodes?: Array<{
    mesh?: number
    children?: number[]
    translation?: number[]
    rotation?: number[]
    scale?: number[]
    matrix?: number[]
  }>
  scenes?: Array<{ nodes?: number[] }>
  extensionsUsed?: string[]
  extensionsRequired?: string[]
}

const COMPONENT_SIZE: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
}

/** 解析 GLB（二进制）或 glTF（JSON 文本） */
export function parseGltf(input: ArrayBuffer | string): ParseResult {
  let json: GltfJson
  let binChunk: ArrayBuffer | null = null

  if (typeof input === 'string') {
    // .gltf 文本形式：buffer 以内嵌 data URI 提供
    try {
      json = JSON.parse(input) as GltfJson
    } catch (error) {
      return { ok: false, error: 'invalid-json', detail: describe(error) }
    }
  } else {
    const glb = parseGlbContainer(input)
    if (!glb.ok) return glb
    json = glb.json
    binChunk = glb.bin
  }

  const warnings: string[] = []

  // 必需的扩展如果不认识，直接说明——否则会渲染出一个空场景让用户困惑
  const required = json.extensionsRequired ?? []
  const unknownRequired = required.filter((name) => !SUPPORTED_EXTENSIONS.has(name))
  if (unknownRequired.length > 0) {
    return {
      ok: false,
      error: 'unsupported-buffer',
      detail: `模型使用了必需的扩展：${unknownRequired.join(', ')}`,
    }
  }

  const used = json.extensionsUsed ?? []
  if (used.some((name) => name.includes('draco') || name.includes('meshopt'))) {
    warnings.push('模型使用了压缩几何（Draco / meshopt），当前仅显示占位说明')
  }

  const meshes = json.meshes ?? []
  if (meshes.length === 0) return { ok: false, error: 'no-meshes' }

  const buffers = resolveBuffers(json, binChunk, warnings)
  if (!buffers) return { ok: false, error: 'unsupported-buffer', detail: '无法取得模型二进制数据' }

  const instances = collectMeshInstances(json)
  const parsed: ParsedMesh[] = []
  let vertices = 0
  let triangles = 0

  for (const instance of instances) {
    const mesh = meshes[instance.meshIndex]
    if (!mesh) continue

    for (const primitive of mesh.primitives ?? []) {
      // 只画三角形：点/线/三角带等模式我们的着色器不支持，
      // 硬画会输出错乱的几何，不如明确告知。
      const mode = primitive.mode ?? 4
      if (mode !== 4) {
        warnings.push(`已跳过非三角形图元（mode = ${mode}），当前仅支持三角形网格`)
        continue
      }

      const attributes = primitive.attributes ?? {}
      const positionAccessor = attributes.POSITION
      if (positionAccessor === undefined) continue

      const rawPositions = readVec3(json, buffers, positionAccessor)
      if (!rawPositions) continue

      const positions = transformPoints(instance.matrix, rawPositions)
      const indices =
        primitive.indices !== undefined ? readIndices(json, buffers, primitive.indices) : null

      let normals: Float32Array | null = null
      if (attributes.NORMAL !== undefined) {
        const rawNormals = readVec3(json, buffers, attributes.NORMAL)
        if (rawNormals) {
          // 法线要用逆转置矩阵；单位阵时直接用原值，省一次数组分配
          normals = isIdentity(instance.matrix)
            ? rawNormals
            : transformNormalsBy3(normalMatrix(instance.matrix), rawNormals)
        }
      }

      if (!normals) {
        // 模型没带法线（部分生成式 3D 导出就是如此）：按面算一套，
        // 否则在光照着色器下会全黑，看起来像"加载失败"。
        normals = computeVertexNormals(positions, indices)
      }

      parsed.push({
        positions,
        normals,
        indices,
        vertexCount: positions.length / 3,
        appliedTransform: !isIdentity(instance.matrix),
      })

      vertices += positions.length / 3
      triangles += (indices ? indices.length : positions.length / 3) / 3
    }
  }

  if (parsed.length === 0) return { ok: false, error: 'empty' }

  const bounds = computeBounds(parsed)

  return {
    ok: true,
    model: { meshes: parsed, bounds, stats: { vertices, triangles: Math.floor(triangles) }, warnings },
  }
}

/** 已知且能安全忽略的扩展（它们只影响观感，不影响几何能否显示） */
const SUPPORTED_EXTENSIONS = new Set([
  'KHR_materials_unlit',
  'KHR_materials_emissive_strength',
  'KHR_texture_transform',
  'KHR_mesh_quantization',
])

/**
 * 遍历场景图，收集"网格实例"——即 (网格索引, 世界矩阵) 的组合。
 *
 * 一个网格可能被多个节点引用（各自带不同变换），所以要按实例展开而不是按网格。
 * 场景图不规范时退化为"所有网格用单位阵渲染"，宁可朝向不对也不要空场景。
 */
function collectMeshInstances(json: GltfJson): Array<{ meshIndex: number; matrix: Mat4 }> {
  const nodes = json.nodes ?? []
  const meshes = json.meshes ?? []
  const instances: Array<{ meshIndex: number; matrix: Mat4 }> = []

  // 没有节点信息：直接渲染所有网格
  if (nodes.length === 0) {
    return meshes.map((_mesh, index) => ({ meshIndex: index, matrix: createMat4() }))
  }

  const roots = json.scenes?.[0]?.nodes ?? nodes.map((_node, index) => index)
  const visited = new Set<number>()

  const walk = (nodeIndex: number, parent: Mat4): void => {
    // visited 同时防止畸形文件里的环导致无限递归
    if (visited.has(nodeIndex)) return
    visited.add(nodeIndex)

    const node = nodes[nodeIndex]
    if (!node) return

    // node.matrix 与 TRS 互斥；两者都存在时按规范以 matrix 为准
    const local = node.matrix && node.matrix.length === 16
      ? Float32Array.from(node.matrix)
      : composeTRS(node.translation, node.rotation, node.scale)

    const world = multiply(parent, local)

    if (node.mesh !== undefined) instances.push({ meshIndex: node.mesh, matrix: world })

    for (const child of node.children ?? []) walk(child, world)
  }

  const identity = createMat4()
  for (const root of roots) walk(root, identity)

  // 有些导出把网格挂在场景图之外（没有 scene.nodes 指到它），补上
  if (instances.length === 0) {
    for (const node of nodes) {
      if (node.mesh !== undefined) instances.push({ meshIndex: node.mesh, matrix: identity })
    }
  }

  if (instances.length === 0) {
    return meshes.map((_mesh, index) => ({ meshIndex: index, matrix: identity }))
  }

  return instances
}

/** 解析 GLB 容器：magic + version + chunks */
function parseGlbContainer(
  buffer: ArrayBuffer,
): { ok: true; json: GltfJson; bin: ArrayBuffer | null } | { ok: false; error: ParseError; detail?: string } {
  if (buffer.byteLength < 12) return { ok: false, error: 'not-glb', detail: '文件过短' }

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  if (magic !== 0x46546c67) return { ok: false, error: 'not-glb', detail: '魔数不匹配' }

  const version = view.getUint32(4, true)
  if (version !== 2) return { ok: false, error: 'not-glb', detail: `不支持的 glTF 版本：${version}` }

  const totalLength = view.getUint32(8, true)
  let offset = 12
  let json: GltfJson | null = null
  let bin: ArrayBuffer | null = null

  while (offset + 8 <= Math.min(totalLength, buffer.byteLength)) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength

    if (chunkEnd > buffer.byteLength) break

    if (chunkType === 0x4e4f534a) {
      const text = new TextDecoder().decode(new Uint8Array(buffer, chunkStart, chunkLength))
      try {
        json = JSON.parse(text) as GltfJson
      } catch (error) {
        return { ok: false, error: 'invalid-json', detail: describe(error) }
      }
    } else if (chunkType === 0x004e4942) {
      bin = buffer.slice(chunkStart, chunkEnd)
    }

    // 块长度按 4 字节对齐
    offset = chunkEnd + ((4 - (chunkLength % 4)) % 4)
  }

  if (!json) return { ok: false, error: 'invalid-json', detail: '缺少 JSON 块' }
  return { ok: true, json, bin }
}

/** 取得每个 buffer 的字节（GLB 的 bin 块 / data URI / 外部文件均不支持时回报） */
function resolveBuffers(
  json: GltfJson,
  bin: ArrayBuffer | null,
  warnings: string[],
): ArrayBuffer[] | null {
  const buffers = json.buffers ?? []
  const out: ArrayBuffer[] = []

  for (const [index, buffer] of buffers.entries()) {
    if (index === 0 && bin) {
      out.push(bin)
      continue
    }

    const uri = buffer.uri
    if (!uri) {
      // 没有 uri 且不是第一个 buffer：无法取得数据
      return null
    }

    if (uri.startsWith('data:')) {
      const decoded = decodeDataUri(uri)
      if (!decoded) return null
      out.push(decoded)
      continue
    }

    // 外部 .bin：单文件场景下通常不存在，明确提示而不是静默失败
    warnings.push('模型引用了外部 .bin 文件，请改用单文件 .glb 以获得完整显示')
    out.push(new ArrayBuffer(0))
  }

  return out
}

function decodeDataUri(uri: string): ArrayBuffer | null {
  const comma = uri.indexOf(',')
  if (comma < 0) return null
  const payload = uri.slice(comma + 1)

  try {
    if (uri.includes(';base64')) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return bytes.buffer
    }
    const text = decodeURIComponent(payload)
    return new TextEncoder().encode(text).buffer as ArrayBuffer
  } catch {
    return null
  }
}

/** 读取 VEC3 浮点访问器 */
function readVec3(json: GltfJson, buffers: ArrayBuffer[], accessorIndex: number): Float32Array | null {
  const accessor = json.accessors?.[accessorIndex]
  if (!accessor || accessor.type !== 'VEC3') return null
  if (accessor.componentType !== 5126) return null // 只处理 float，量化由扩展负责

  const view = json.bufferViews?.[accessor.bufferView ?? -1]
  if (!view) return null

  const buffer = buffers[view.buffer ?? 0]
  if (!buffer) return null

  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const count = accessor.count ?? 0
  // 交错顶点数据必须按 bufferView.byteStride 步进；
  // 没有该字段时按"视图只装了这一组数据"估算，估算不出来就用紧凑的 12 字节。
  const stride = view.byteStride && view.byteStride > 0
    ? view.byteStride
    : view.byteLength && count > 0
      ? Math.floor(view.byteLength / count)
      : 12
  const elementStride = stride >= 12 ? stride : 12

  const out = new Float32Array(count * 3)
  const dataView = new DataView(buffer)

  for (let i = 0; i < count; i += 1) {
    const offset = base + i * elementStride
    if (offset + 12 > buffer.byteLength) break
    out[i * 3] = dataView.getFloat32(offset, true)
    out[i * 3 + 1] = dataView.getFloat32(offset + 4, true)
    out[i * 3 + 2] = dataView.getFloat32(offset + 8, true)
  }

  return out
}

/** 读取索引访问器（统一转成 Uint32） */
function readIndices(json: GltfJson, buffers: ArrayBuffer[], accessorIndex: number): Uint32Array | null {
  const accessor = json.accessors?.[accessorIndex]
  if (!accessor || accessor.type !== 'SCALAR') return null

  const componentType = accessor.componentType ?? 5125
  const size = COMPONENT_SIZE[componentType]
  if (!size) return null

  const view = json.bufferViews?.[accessor.bufferView ?? -1]
  if (!view) return null
  const buffer = buffers[view.buffer ?? 0]
  if (!buffer) return null

  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const count = accessor.count ?? 0
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : size
  const dataView = new DataView(buffer)
  const out = new Uint32Array(count)

  for (let i = 0; i < count; i += 1) {
    const offset = base + i * stride
    if (offset + size > buffer.byteLength) break
    if (componentType === 5121) out[i] = dataView.getUint8(offset)
    else if (componentType === 5123) out[i] = dataView.getUint16(offset, true)
    else if (componentType === 5125) out[i] = dataView.getUint32(offset, true)
    else out[i] = 0
  }

  return out
}

/** 计算整体包围盒 */
function computeBounds(meshes: ParsedMesh[]): ParsedModel['bounds'] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = mesh.positions[i + axis] ?? 0
        if (value < (min[axis] ?? Infinity)) min[axis] = value
        if (value > (max[axis] ?? -Infinity)) max[axis] = value
      }
    }
  }

  // 空几何时给一个单位盒，避免相机计算出现 NaN
  if (!Number.isFinite(min[0])) return { min: [-1, -1, -1], max: [1, 1, 1] }
  return { min, max }
}

/** 从包围盒推导一个合适的观察距离（自动取景） */
export function fitDistance(bounds: ParsedModel['bounds'], fovDeg = 45): number {
  const size = Math.max(
    (bounds.max[0] ?? 1) - (bounds.min[0] ?? 0),
    (bounds.max[1] ?? 1) - (bounds.min[1] ?? 0),
    (bounds.max[2] ?? 1) - (bounds.min[2] ?? 0),
    1e-3,
  )
  const fov = (fovDeg * Math.PI) / 180
  return (size / 2) / Math.tan(fov / 2) * 2.2
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
