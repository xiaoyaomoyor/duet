/**
 * glTF / GLB 解析单测（纯函数）
 *
 * 这里手工拼出真实的 GLB 二进制（而不是 mock），因为解析器最容易错的地方
 * 就是字节偏移、块对齐、步长这几件事——用假数据测不出来。
 *
 * 覆盖两个真实痛点：
 *   1. Tripo / Meshy 导出的根节点带 Y-up 旋转与归一化缩放，
 *      不烘焙节点变换的话模型会躺倒或尺寸离谱。
 *   2. 交错顶点数据（bufferView.byteStride）——不读步长会把法线读成垃圾。
 */
import { describe, expect, it } from 'vitest'
import { fitDistance, parseGltf } from './gltf'

// —— GLB 构造辅助 ————————————————————————————————————————————

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

/** 按 4 字节对齐补齐 */
function padTo4(bytes: Uint8Array, fill: number): Uint8Array {
  const remainder = bytes.length % 4
  if (remainder === 0) return bytes
  const padded = new Uint8Array(bytes.length + (4 - remainder))
  padded.set(bytes)
  padded.fill(fill, bytes.length)
  return padded
}

/** 拼一个合法的 GLB 容器 */
function buildGlb(json: unknown, bin?: ArrayBuffer): ArrayBuffer {
  const jsonBytes = padTo4(new TextEncoder().encode(JSON.stringify(json)), 0x20)
  const binBytes = bin ? padTo4(new Uint8Array(bin), 0x00) : null

  const total = 12 + 8 + jsonBytes.length + (binBytes ? 8 + binBytes.length : 0)
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)

  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)

  let offset = 12
  view.setUint32(offset, jsonBytes.length, true)
  view.setUint32(offset + 4, CHUNK_JSON, true)
  bytes.set(jsonBytes, offset + 8)
  offset += 8 + jsonBytes.length

  if (binBytes) {
    view.setUint32(offset, binBytes.length, true)
    view.setUint32(offset + 4, CHUNK_BIN, true)
    bytes.set(binBytes, offset + 8)
  }

  return out
}

/** 一个三角形（逆时针，位于 XY 平面） */
const TRIANGLE = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])

/** 最简 glTF JSON：单网格单图元 */
function simpleGltf(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset: { version: '2.0' },
    buffers: [{ byteLength: TRIANGLE.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: TRIANGLE.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    ...extra,
  }
}

// —— 用例 ————————————————————————————————————————————————

describe('parseGltf —— 容器层', () => {
  it('解析最简 GLB', () => {
    const result = parseGltf(buildGlb(simpleGltf(), TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.model.meshes).toHaveLength(1)
    expect(result.model.meshes[0]?.positions).toHaveLength(9)
    expect(result.model.stats).toEqual({ vertices: 3, triangles: 1 })
  })

  it('非 GLB 内容返回 not-glb', () => {
    const result = parseGltf(new TextEncoder().encode('这不是模型').buffer as ArrayBuffer)
    expect(result).toMatchObject({ ok: false, error: 'not-glb' })
  })

  it('过短的文件返回 not-glb', () => {
    expect(parseGltf(new ArrayBuffer(4))).toMatchObject({ ok: false, error: 'not-glb' })
  })

  it('版本不是 2 时明确报错（而不是解析出半个模型）', () => {
    const glb = buildGlb(simpleGltf(), TRIANGLE.buffer)
    new DataView(glb).setUint32(4, 1, true)
    const result = parseGltf(glb)
    expect(result).toMatchObject({ ok: false, error: 'not-glb' })
    if (!result.ok) expect(result.detail).toContain('版本')
  })

  it('JSON 块损坏时返回 invalid-json', () => {
    const jsonBytes = padTo4(new TextEncoder().encode('{ 这不是 json'), 0x20)
    const out = new ArrayBuffer(12 + 8 + jsonBytes.length)
    const view = new DataView(out)
    view.setUint32(0, GLB_MAGIC, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, out.byteLength, true)
    view.setUint32(12, jsonBytes.length, true)
    view.setUint32(16, CHUNK_JSON, true)
    new Uint8Array(out).set(jsonBytes, 20)

    expect(parseGltf(out)).toMatchObject({ ok: false, error: 'invalid-json' })
  })

  it('没有 JSON 块时返回 invalid-json', () => {
    const out = new ArrayBuffer(12)
    const view = new DataView(out)
    view.setUint32(0, GLB_MAGIC, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, 12, true)
    expect(parseGltf(out)).toMatchObject({ ok: false, error: 'invalid-json' })
  })
})

describe('parseGltf —— .gltf 文本形式', () => {
  it('接受 JSON 字符串并在 JSON 非法时报错', () => {
    expect(parseGltf('{ 坏 json')).toMatchObject({ ok: false, error: 'invalid-json' })
  })

  it('支持内嵌 base64 的 data URI buffer', () => {
    const base64 = arrayBufferToBase64(TRIANGLE.buffer as ArrayBuffer)
    const json = simpleGltf({
      buffers: [{ byteLength: TRIANGLE.byteLength, uri: `data:application/octet-stream;base64,${base64}` }],
    })

    const result = parseGltf(JSON.stringify(json))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.stats.vertices).toBe(3)
    expect(Math.abs((result.model.meshes[0]?.positions[3] ?? 0) - 1)).toBeLessThan(1e-6)
  })

  it('引用外部 .bin 时给出提示（单文件场景拿不到数据）', () => {
    const json = simpleGltf({
      buffers: [{ byteLength: TRIANGLE.byteLength, uri: 'model.bin' }],
    })

    const result = parseGltf(JSON.stringify(json))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.warnings.join()).toContain('.bin')
  })

  it('第一个 buffer 没有 uri 且没有 bin 块时返回 unsupported-buffer', () => {
    const json = simpleGltf({ buffers: [{ byteLength: TRIANGLE.byteLength }] })
    expect(parseGltf(JSON.stringify(json))).toMatchObject({ ok: false, error: 'unsupported-buffer' })
  })
})

describe('parseGltf —— 几何读取', () => {
  it('没有法线时按面计算出一套（否则光照下会全黑）', () => {
    const result = parseGltf(buildGlb(simpleGltf(), TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.meshes[0]?.normals).not.toBeNull()
    // 逆时针三角形在 XY 平面 → 法线 +Z
    expect(result.model.meshes[0]?.normals?.[2]).toBeCloseTo(1, 5)
  })

  it('带 NORMAL 访问器时直接使用模型自带的法线', () => {
    const data = new Float32Array([...TRIANGLE, 0, 0, 1, 0, 0, 1, 0, 0, 1])
    const json = simpleGltf({
      buffers: [{ byteLength: data.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: TRIANGLE.byteLength },
        { buffer: 0, byteOffset: TRIANGLE.byteLength, byteLength: TRIANGLE.byteLength },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    })

    const result = parseGltf(buildGlb(json, data.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.meshes[0]?.normals?.[2]).toBeCloseTo(1, 5)
  })

  it('读取索引（UNSIGNED_SHORT）', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
    const indicesValue = new Uint16Array([0, 1, 2, 1, 3, 2])
    const combined = new Uint8Array(positions.byteLength + indicesValue.byteLength)
    combined.set(new Uint8Array(positions.buffer))
    combined.set(new Uint8Array(indicesValue.buffer), positions.byteLength)

    const json = simpleGltf({
      buffers: [{ byteLength: combined.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: indicesValue.byteLength },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    })

    const result = parseGltf(buildGlb(json, combined.buffer as ArrayBuffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.from(result.model.meshes[0]?.indices ?? [])).toEqual([0, 1, 2, 1, 3, 2])
    expect(result.model.stats.triangles).toBe(2)
  })

  it('读取交错顶点数据（必须按 byteStride 步进）', () => {
    // 布局：[位置 12 字节][法线 12 字节] 每个顶点 24 字节
    const stride = 24
    const raw = new Float32Array(3 * 6)
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]
    for (let i = 0; i < 3; i += 1) {
      raw[i * 6] = positions[i * 3] ?? 0
      raw[i * 6 + 1] = positions[i * 3 + 1] ?? 0
      raw[i * 6 + 2] = positions[i * 3 + 2] ?? 0
      raw[i * 6 + 3] = 0
      raw[i * 6 + 4] = 0
      raw[i * 6 + 5] = 1
    }

    const json = simpleGltf({
      buffers: [{ byteLength: raw.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: raw.byteLength, byteStride: stride }],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 0, byteOffset: 12, componentType: 5126, count: 3, type: 'VEC3' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    })

    const result = parseGltf(buildGlb(json, raw.buffer as ArrayBuffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const mesh = result.model.meshes[0]
    // 步长读错的话，第 2、3 个顶点会读到法线数据（0,0,1）而不是位置
    expect(Array.from(mesh?.positions ?? [])).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect(Array.from(mesh?.normals ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
  })

  it('非三角形图元被跳过并给出提示（而不是画出错乱的几何）', () => {
    const json = simpleGltf({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 1 }] }],
    })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result).toMatchObject({ ok: false, error: 'empty' })
  })

  it('缺少 POSITION 的图元被跳过', () => {
    const json = simpleGltf({ meshes: [{ primitives: [{ attributes: {} }] }] })
    expect(parseGltf(buildGlb(json, TRIANGLE.buffer))).toMatchObject({ ok: false, error: 'empty' })
  })

  it('没有 meshes 时返回 no-meshes', () => {
    const json = simpleGltf({ meshes: [] })
    expect(parseGltf(buildGlb(json, TRIANGLE.buffer))).toMatchObject({ ok: false, error: 'no-meshes' })
  })
})

describe('parseGltf —— 节点变换', () => {
  it('根节点的平移会被烘焙进顶点（否则模型位置不对）', () => {
    const json = simpleGltf({ nodes: [{ mesh: 0, translation: [10, 20, 30] }] })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const positions = result.model.meshes[0]?.positions
    expect(positions?.[0]).toBeCloseTo(10, 5)
    expect(positions?.[1]).toBeCloseTo(20, 5)
    expect(positions?.[2]).toBeCloseTo(30, 5)
    expect(result.model.meshes[0]?.appliedTransform).toBe(true)
  })

  it('根节点的 Y-up 旋转会被烘焙（Tripo / Meshy 的常见布局）', () => {
    // 绕 X 轴 -90°：把 Z-up 模型转成 Y-up。点 (0,1,0) → (0,0,-1)
    const half = -Math.PI / 4
    const json = simpleGltf({
      nodes: [{ mesh: 0, rotation: [Math.sin(half), 0, 0, Math.cos(half)] }],
    })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const positions = result.model.meshes[0]?.positions
    // 第二个顶点原本是 (1,0,0)，绕 X 旋转不受影响
    expect(positions?.[3]).toBeCloseTo(1, 5)
    // 第三个顶点原本是 (0,1,0)，旋转后变成 (0,0,-1)
    expect(positions?.[6]).toBeCloseTo(0, 5)
    expect(positions?.[7]).toBeCloseTo(0, 5)
    expect(positions?.[8]).toBeCloseTo(-1, 5)
  })

  it('归一化缩放会被烘焙，包围盒随之变化', () => {
    const json = simpleGltf({ nodes: [{ mesh: 0, scale: [100, 100, 100] }] })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.bounds.max[0]).toBeCloseTo(100, 4)
    expect(result.model.bounds.max[1]).toBeCloseTo(100, 4)
  })

  it('父子层级会累乘（子节点继承父节点变换）', () => {
    const json = simpleGltf({
      nodes: [
        { children: [1], translation: [10, 0, 0] },
        { mesh: 0, translation: [0, 5, 0] },
      ],
      scenes: [{ nodes: [0] }],
    })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const positions = result.model.meshes[0]?.positions
    expect(positions?.[0]).toBeCloseTo(10, 5)
    expect(positions?.[1]).toBeCloseTo(5, 5)
  })

  it('node.matrix 优先于 TRS（规范如此）', () => {
    // 列主序：把 X 缩放 3 倍并平移 +5 X
    const matrix = [3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]
    const json = simpleGltf({ nodes: [{ mesh: 0, matrix, translation: [999, 999, 999] }] })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const positions = result.model.meshes[0]?.positions
    expect(positions?.[0]).toBeCloseTo(5, 5)
    expect(positions?.[3]).toBeCloseTo(8, 5) // 1 * 3 + 5
  })

  it('同一网格被两个节点引用时渲染两份（各自带自己的变换）', () => {
    const json = simpleGltf({
      nodes: [
        { mesh: 0, translation: [0, 0, 0] },
        { mesh: 0, translation: [10, 0, 0] },
      ],
      scenes: [{ nodes: [0, 1] }],
    })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.meshes).toHaveLength(2)
    expect(result.model.stats.vertices).toBe(6)
  })

  it('场景图成环时不会死循环', () => {
    const json = simpleGltf({
      nodes: [
        { mesh: 0, children: [1] },
        { children: [0] },
      ],
      scenes: [{ nodes: [0] }],
    })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.meshes).toHaveLength(1)
  })

  it('没有 nodes 时退化为一律用单位阵渲染（宁可朝向不对也不要空场景）', () => {
    const json = simpleGltf({ nodes: [], scenes: [] })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.meshes[0]?.appliedTransform).toBe(false)
  })
})

describe('parseGltf —— 扩展与提示', () => {
  it('必需的扩展不认识时直接报错（不静默显示空场景）', () => {
    const json = simpleGltf({ extensionsRequired: ['KHR_draco_mesh_compression'] })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result).toMatchObject({ ok: false, error: 'unsupported-buffer' })
    if (!result.ok) expect(result.detail).toContain('KHR_draco_mesh_compression')
  })

  it('已知可忽略的扩展不报错', () => {
    const json = simpleGltf({ extensionsRequired: ['KHR_materials_unlit'] })
    expect(parseGltf(buildGlb(json, TRIANGLE.buffer)).ok).toBe(true)
  })

  it('用了 Draco / meshopt 但非必需时给出提示', () => {
    const json = simpleGltf({ extensionsUsed: ['KHR_draco_mesh_compression'] })
    const result = parseGltf(buildGlb(json, TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.warnings.join()).toMatch(/Draco|压缩/)
  })
})

describe('computeBounds / fitDistance', () => {
  it('包围盒覆盖所有顶点', () => {
    const result = parseGltf(buildGlb(simpleGltf(), TRIANGLE.buffer))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.bounds.min).toEqual([0, 0, 0])
    expect(result.model.bounds.max).toEqual([1, 1, 0])
  })

  it('fitDistance 随模型尺寸增大而增大', () => {
    const small = fitDistance({ min: [-1, -1, -1], max: [1, 1, 1] })
    const big = fitDistance({ min: [-10, -10, -10], max: [10, 10, 10] })
    expect(big).toBeGreaterThan(small)
  })

  it('退化尺寸（所有点重合）不会产生除零', () => {
    const distance = fitDistance({ min: [5, 5, 5], max: [5, 5, 5] })
    expect(Number.isFinite(distance)).toBe(true)
    expect(distance).toBeGreaterThan(0)
  })
})

/** base64 编码（测试环境没有 btoa 之外的依赖，这里手写以免受 Buffer 影响） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]

    out += chars[b0 >> 2] ?? ''
    out += chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)] ?? ''
    out += b1 === undefined ? '=' : (chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] ?? '')
    out += b2 === undefined ? '=' : (chars[b2 & 63] ?? '')
  }

  return out
}
