/**
 * 3D 矩阵工具单测（纯函数）
 *
 * 矩阵错误的特点是"看起来能跑"——模型转了个奇怪的角度、
 * 法线方向不对导致明暗错位，但页面不会报错。
 * 所以这里逐条验证数学性质（而不是记录当前输出当快照）。
 */
import { describe, expect, it } from 'vitest'
import {
  centerOf,
  composeTRS,
  computeVertexNormals,
  createMat4,
  cross,
  dot,
  fromQuaternion,
  isIdentity,
  lookAt,
  multiply,
  normalMatrix,
  normalize,
  perspective,
  rotationY,
  scaling,
  subtract,
  transformDirections,
  transformNormalsBy3,
  transformPoints,
  translation,
  type Mat4,
  type Vec3,
} from './mat4'

/** 便捷断言：浮点数组近似相等 */
function expectClose(actual: ArrayLike<number>, expected: number[], precision = 5): void {
  expect(actual.length, '长度不一致').toBe(expected.length)
  for (let i = 0; i < expected.length; i += 1) {
    expect(actual[i] ?? NaN, `第 ${i} 项`).toBeCloseTo(expected[i] ?? NaN, precision)
  }
}

/** 把矩阵当行主序打印出来，便于失败时阅读 */
function rows(m: Mat4): number[][] {
  return [0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((col) => m[col * 4 + row] ?? 0))
}

describe('createMat4 / isIdentity', () => {
  it('默认是单位阵', () => {
    expectClose(createMat4(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    expect(isIdentity(createMat4())).toBe(true)
  })

  it('列主序：m[12..14] 是平移分量', () => {
    const m = translation(1, 2, 3)
    expect(m[12]).toBe(1)
    expect(m[13]).toBe(2)
    expect(m[14]).toBe(3)
    expect(isIdentity(m)).toBe(false)
  })
})

describe('multiply', () => {
  it('单位阵是乘法幺元', () => {
    const a = translation(1, 2, 3)
    expectClose(multiply(a, createMat4()), Array.from(a))
    expectClose(multiply(createMat4(), a), Array.from(a))
  })

  it('先缩放后平移：平移不受缩放影响（T·S 的顺序）', () => {
    const ts = multiply(translation(10, 0, 0), scaling(2, 2, 2))
    expectClose(transformPoints(ts, new Float32Array([1, 0, 0])), [12, 0, 0])
  })

  it('先平移后缩放：平移量会被放大（S·T 的顺序）', () => {
    const st = multiply(scaling(2, 2, 2), translation(10, 0, 0))
    expectClose(transformPoints(st, new Float32Array([1, 0, 0])), [22, 0, 0])
  })

  it('顺序不可交换（上两条就是反例）', () => {
    const ts = multiply(translation(10, 0, 0), scaling(2, 2, 2))
    const st = multiply(scaling(2, 2, 2), translation(10, 0, 0))
    expect(Array.from(ts)).not.toEqual(Array.from(st))
  })
})

describe('transformPoints / transformDirections', () => {
  it('transformPoints 把 w 当 1，平移生效', () => {
    expectClose(transformPoints(translation(5, 6, 7), new Float32Array([1, 1, 1])), [6, 7, 8])
  })

  it('transformDirections 忽略平移（法线只跟着旋转/缩放走）', () => {
    expectClose(transformDirections(translation(5, 6, 7), new Float32Array([1, 1, 1])), [1, 1, 1])
  })

  it('单位阵直接返回原数组（省一次拷贝）', () => {
    const points = new Float32Array([1, 2, 3])
    expect(transformPoints(createMat4(), points)).toBe(points)
    expect(transformDirections(createMat4(), points)).toBe(points)
  })

  it('数组长度不是 3 的倍数时不会越界', () => {
    const result = transformPoints(scaling(2, 2, 2), new Float32Array([1, 2]))
    expect(Array.from(result)).toEqual([2, 4])
  })
})

describe('rotationY / fromQuaternion', () => {
  it('绕 Y 轴 90°：+X 转到 -Z', () => {
    expectClose(transformPoints(rotationY(Math.PI / 2), new Float32Array([1, 0, 0])), [0, 0, -1], 5)
  })

  it('绕 Y 轴 90°：+Z 转到 +X', () => {
    expectClose(transformPoints(rotationY(Math.PI / 2), new Float32Array([0, 0, 1])), [1, 0, 0], 5)
  })

  it('绕 Y 轴旋转不改变 Y 分量', () => {
    expectClose(transformPoints(rotationY(1.234), new Float32Array([0, 3, 0])), [0, 3, 0], 5)
  })

  it('单位四元数得到单位阵', () => {
    expect(isIdentity(fromQuaternion([0, 0, 0, 1]))).toBe(true)
  })

  it('缺省的四元数按单位处理', () => {
    expect(isIdentity(fromQuaternion([]))).toBe(true)
  })

  it('四元数与等价的角度矩阵一致（绕 Y 90°）', () => {
    const half = Math.PI / 4
    const q = fromQuaternion([0, Math.sin(half), 0, Math.cos(half)])
    expectClose(q, Array.from(rotationY(Math.PI / 2)))
  })

  it('未归一化的四元数会被归一化', () => {
    const half = Math.PI / 4
    const q = fromQuaternion([0, Math.sin(half) * 5, 0, Math.cos(half) * 5])
    expectClose(q, Array.from(rotationY(Math.PI / 2)))
  })

  it('绕 X 轴 90°：+Y 转到 +Z', () => {
    const half = Math.PI / 4
    const q = fromQuaternion([Math.sin(half), 0, 0, Math.cos(half)])
    expectClose(transformPoints(q, new Float32Array([0, 1, 0])), [0, 0, 1], 5)
  })
})

describe('composeTRS', () => {
  it('全缺省时是单位阵', () => {
    expect(isIdentity(composeTRS())).toBe(true)
    expect(isIdentity(composeTRS(undefined, undefined, undefined))).toBe(true)
  })

  it('语义是 T · R · S：先缩放，再旋转，最后平移', () => {
    // 点 (1,0,0)：缩放 2 倍 → (2,0,0)；绕 Y 90° → (0,0,-2)；平移 +X 10 → (10,0,-2)
    const m = composeTRS([10, 0, 0], [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)], [2, 2, 2])
    expectClose(transformPoints(m, new Float32Array([1, 0, 0])), [10, 0, -2], 5)
  })

  it('只给缩放时等同于缩放矩阵', () => {
    expectClose(composeTRS(undefined, undefined, [2, 3, 4]), Array.from(scaling(2, 3, 4)))
  })

  it('只给平移时等同于平移矩阵', () => {
    expectClose(composeTRS([1, 2, 3]), Array.from(translation(1, 2, 3)))
  })
})

describe('normalMatrix', () => {
  it('单位阵的法线矩阵是单位阵', () => {
    expectClose(normalMatrix(createMat4()), [1, 0, 0, 0, 1, 0, 0, 0, 1])
  })

  it('等比缩放时法线方向不变（只是长度变了，随后会归一化）', () => {
    const n = normalMatrix(scaling(2, 2, 2))
    const result = normalize([
      (n[0] ?? 0) * 1 + (n[3] ?? 0) * 1 + (n[6] ?? 0) * 0,
      (n[1] ?? 0) * 1 + (n[4] ?? 0) * 1 + (n[7] ?? 0) * 0,
      (n[2] ?? 0) * 1 + (n[5] ?? 0) * 1 + (n[8] ?? 0) * 0,
    ])
    expectClose(result, [Math.SQRT1_2, Math.SQRT1_2, 0])
  })

  it('非等比缩放用的是逆转置矩阵（这正是不能直接用模型矩阵的原因）', () => {
    const m = scaling(2, 1, 1)
    const n = normalMatrix(m)

    // (M^-1)^T = diag(0.5, 1, 1)
    expectClose(n, [0.5, 0, 0, 0, 1, 0, 0, 0, 1])

    // 直接拿模型矩阵当法线矩阵会得到 (2, 1, 0)：与正确结果 (0.5, 1, 0) 不同
    const wrong = applyNormal3(m, [1, 1, 0])
    const right = applyNormal3(n, [1, 1, 0])
    expect(right[0]).toBeCloseTo(0.5, 5)
    expect(wrong[0]).toBeCloseTo(2, 5)
  })

  it('法线变换后仍垂直于缩放后的切向', () => {
    const m = scaling(2, 1, 1)
    const n = normalMatrix(m)

    // 原法线 (1,1,0)，原切向 (1,-1,0)：两者点积为 0
    expect(dot([1, 1, 0], [1, -1, 0])).toBe(0)

    const scaledTangent = applyNormal3(m, [1, -1, 0])
    const scaledNormal = applyNormal3(n, [1, 1, 0])
    expect(dot(scaledTangent, scaledNormal)).toBeCloseTo(0, 5)
  })

  it('旋转矩阵的法线矩阵等于它自己（正交矩阵的逆转置就是自身）', () => {
    const c = Math.cos(Math.PI / 3)
    const s = Math.sin(Math.PI / 3)
    // 绕 Y 轴的旋转，列主序的 3×3
    expectClose(normalMatrix(rotationY(Math.PI / 3)), [c, 0, -s, 0, 1, 0, s, 0, c])
  })

  it('零缩放（不可逆）时退化为单位阵而不是 NaN', () => {
    const n = normalMatrix(scaling(0, 0, 0))
    expectClose(n, [1, 0, 0, 0, 1, 0, 0, 0, 1])
    expect(Array.from(n).every(Number.isFinite)).toBe(true)
  })
})

describe('transformNormalsBy3', () => {
  it('用 3×3 法线矩阵变换并归一化', () => {
    const n = normalMatrix(scaling(2, 1, 1))
    // (M^-1)^T = diag(0.5, 1, 1)；(1,1,0) → (0.5, 1, 0) → 归一化
    const length = Math.hypot(0.5, 1)
    expectClose(transformNormalsBy3(n, new Float32Array([1, 1, 0])), [0.5 / length, 1 / length, 0])
  })

  it('非等比缩放下法线方向确实变了（否则这条测试没有意义）', () => {
    const n = normalMatrix(scaling(2, 1, 1))
    const result = transformNormalsBy3(n, new Float32Array([1, 1, 0]))
    // 未经变换的 (1,1,0) 归一化是 (0.707, 0.707, 0)；变换后不是它
    expect(Math.abs((result[0] ?? 0) - Math.SQRT1_2)).toBeGreaterThan(0.1)
  })

  it('单位 3×3 不改变方向', () => {
    const identity3 = normalMatrix(createMat4())
    expectClose(transformNormalsBy3(identity3, new Float32Array([0, 0, 1])), [0, 0, 1])
  })

  it('九元素与十六元素的索引方式不同——混用会静默算错（回归用例）', () => {
    // 这正是曾经的 bug：把 9 元素的法线矩阵喂给吃 16 元素 Mat4 的函数，
    // 越界读到 undefined 被 `?? 1` 兜住，算出一个"看起来合理"的错值。
    const n = normalMatrix(createMat4())
    const input = new Float32Array([0, 0, 1])

    // 正确用法：单位法线矩阵不该改变法线方向
    expectClose(transformNormalsBy3(n, input), [0, 0, 1])

    // 错误用法：同一份 9 元素数组走 16 元素索引 → 结果不是 (0,0,1)
    const wrong = transformDirections(n, input)
    expect(Array.from(wrong)).not.toEqual([0, 0, 1])
  })

  it('零向量法线给朝上的默认值（零法线在光照下是全黑）', () => {
    const identity3 = normalMatrix(createMat4())
    expectClose(transformNormalsBy3(identity3, new Float32Array([0, 0, 0])), [0, 0, 1])
  })

  it('不修改输入数组', () => {
    const input = new Float32Array([1, 1, 0])
    transformNormalsBy3(normalMatrix(scaling(3, 1, 1)), input)
    expect(Array.from(input)).toEqual([1, 1, 0])
  })
})

describe('perspective / lookAt', () => {
  it('透视矩阵的 m[11] 为 -1、m[15] 为 0（透视除法的来源）', () => {
    const m = perspective(45, 1, 0.1, 100)
    expect(m[11]).toBe(-1)
    expect(m[15]).toBe(0)
  })

  it('宽高比越大，x 方向压缩越多', () => {
    const wide = perspective(45, 2, 0.1, 100)
    const square = perspective(45, 1, 0.1, 100)
    expect(wide[0]).toBeCloseTo((square[0] ?? 1) / 2, 6)
  })

  it('lookAt：相机在 +Z 看向原点时，原点变换到 (0,0,-5)', () => {
    const view = lookAt([0, 0, 5], [0, 0, 0])
    expectClose(transformPoints(view, new Float32Array([0, 0, 0])), [0, 0, -5])
  })

  it('lookAt：看向的物体落在 -Z 轴上', () => {
    const view = lookAt([0, 0, 5], [0, 0, 0])
    const target = transformPoints(view, new Float32Array([0, 0, 0]))
    expect(target[2]).toBeLessThan(0)
    expect(target[0]).toBeCloseTo(0, 6)
  })

  it('透视投影后，视野内的点落在裁剪空间内', () => {
    const proj = perspective(45, 1, 0.1, 100)
    const view = lookAt([0, 0, 5], [0, 0, 0])
    const mvp = multiply(proj, view)

    const clip = transformPoints(mvp, new Float32Array([0, 0, 0]))
    const w = -(clip[2] ?? 0) === 0 ? 1 : 5 // 这里直接用已知的 -z 作为 w
    // 近平面 0.1、远平面 100，深度应落在 [-1, 1]
    const ndcZ = (clip[2] ?? 0) / w
    expect(ndcZ).toBeGreaterThanOrEqual(-1)
    expect(ndcZ).toBeLessThanOrEqual(1)
  })

  it('相机在原点、看向 -Z 时观察矩阵接近单位阵', () => {
    expectClose(lookAt([0, 0, 0], [0, 0, -1]), Array.from(createMat4()))
  })
})

describe('computeVertexNormals', () => {
  it('逆时针三角形在 XY 平面上法线是 +Z', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const normals = computeVertexNormals(positions, null)
    expectClose(normals, [0, 0, 1, 0, 0, 1, 0, 0, 1])
  })

  it('顺时针三角形法线反向（-Z）', () => {
    const positions = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0])
    const normals = computeVertexNormals(positions, null)
    expect(normals[2]).toBeCloseTo(-1, 5)
  })

  it('带索引时按索引取顶点', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9])
    const normals = computeVertexNormals(positions, new Uint32Array([0, 1, 2]))
    // 未被引用的第 4 个顶点法线为零向量，归一化后仍是零
    expectClose([normals[0] ?? 0, normals[1] ?? 0, normals[2] ?? 0], [0, 0, 1])
    expectClose([normals[9] ?? 0, normals[10] ?? 0, normals[11] ?? 0], [0, 0, 0])
  })

  it('所有法线都是单位长度（或零向量，不会出现 NaN）', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
    const normals = computeVertexNormals(positions, null)
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0)
      expect(Number.isFinite(length)).toBe(true)
      expect(length === 0 || Math.abs(length - 1) < 1e-5).toBe(true)
    }
  })

  it('退化三角形（三点共线）不会产生 NaN', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0])
    const normals = computeVertexNormals(positions, null)
    expect(Array.from(normals).every(Number.isFinite)).toBe(true)
  })
})

describe('向量小工具', () => {
  it('subtract / dot / cross / normalize', () => {
    expectClose(subtract([3, 2, 1], [1, 1, 1]), [2, 1, 0])
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32)
    expectClose(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1])
    expectClose(normalize([0, 3, 4]), [0, 0.6, 0.8])
  })

  it('零向量归一化不会产生 NaN', () => {
    const result = normalize([0, 0, 0])
    expect(result.every(Number.isFinite)).toBe(true)
  })

  it('centerOf 取包围盒中心', () => {
    expectClose(centerOf([-1, 0, 2], [1, 2, 4]), [0, 1, 3])
  })
})

/** 只用 3×3 部分作用于向量（测试辅助） */
function applyNormal3(m: ArrayLike<number>, v: Vec3): Vec3 {
  const is9 = m.length === 9
  const at = (row: number, col: number): number =>
    (is9 ? m[col * 3 + row] : m[col * 4 + row]) ?? 0

  return [
    at(0, 0) * v[0] + at(0, 1) * v[1] + at(0, 2) * v[2],
    at(1, 0) * v[0] + at(1, 1) * v[1] + at(1, 2) * v[2],
    at(2, 0) * v[0] + at(2, 1) * v[1] + at(2, 2) * v[2],
  ]
}

/** 保留：失败时打印矩阵的工具（调试用，避免未使用告警） */
void rows
