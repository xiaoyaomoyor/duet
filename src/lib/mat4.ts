/**
 * 3D 用的最小矩阵工具（纯函数，零依赖）
 *
 * 只为 glTF 查看器服务：透视投影、观察矩阵、模型矩阵与法线矩阵。
 * 不引入 three.js 的原因：我们只需要渲染静态几何，
 * 而 three.js 会让首屏包体积翻数倍——与 §15 的性能预算冲突。
 *
 * 约定：列主序（与 WebGL 的 uniformMatrix4fv 一致），
 * 因此下面的索引写法是 m[列 * 4 + 行]。
 */

export type Mat4 = Float32Array
export type Vec3 = [number, number, number]

export function createMat4(): Mat4 {
  const m = new Float32Array(16)
  m[0] = 1
  m[5] = 1
  m[10] = 1
  m[15] = 1
  return m
}

/** 透视投影 */
export function perspective(fovDeg: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360)
  const nf = 1 / (near - far)
  const m = createMat4()
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) * nf
  m[11] = -1
  m[14] = 2 * far * near * nf
  m[15] = 0
  return m
}

/** 观察矩阵（相机看向 target） */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const z = normalize(subtract(eye, target))
  const x = normalize(cross(up, z))
  const y = cross(z, x)

  const m = createMat4()
  m[0] = x[0]
  m[1] = y[0]
  m[2] = z[0]
  m[3] = 0
  m[4] = x[1]
  m[5] = y[1]
  m[6] = z[1]
  m[7] = 0
  m[8] = x[2]
  m[9] = y[2]
  m[10] = z[2]
  m[11] = 0
  m[12] = -dot(x, eye)
  m[13] = -dot(y, eye)
  m[14] = -dot(z, eye)
  m[15] = 1
  return m
}

/** 绕 Y 轴旋转（自动旋转用） */
export function rotationY(radians: number): Mat4 {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  const m = createMat4()
  m[0] = c
  m[2] = -s
  m[8] = s
  m[10] = c
  return m
}

/** 平移 */
export function translation(x: number, y: number, z: number): Mat4 {
  const m = createMat4()
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}

/**
 * 从四元数 [x, y, z, w] 构造旋转矩阵（glTF 节点的 rotation 就是这个顺序）。
 * 四元数必须已归一化；这里仍做一次归一化以防上游数据不规范。
 */
export function fromQuaternion(q: readonly number[]): Mat4 {
  const rawX = q[0] ?? 0
  const rawY = q[1] ?? 0
  const rawZ = q[2] ?? 0
  const rawW = q[3] ?? 1

  const length = Math.hypot(rawX, rawY, rawZ, rawW) || 1
  const x = rawX / length
  const y = rawY / length
  const z = rawZ / length
  const w = rawW / length

  const m = createMat4()
  m[0] = 1 - 2 * (y * y + z * z)
  m[1] = 2 * (x * y + z * w)
  m[2] = 2 * (x * z - y * w)

  m[4] = 2 * (x * y - z * w)
  m[5] = 1 - 2 * (x * x + z * z)
  m[6] = 2 * (y * z + x * w)

  m[8] = 2 * (x * z + y * w)
  m[9] = 2 * (y * z - x * w)
  m[10] = 1 - 2 * (x * x + y * y)

  return m
}

/** 缩放 */
export function scaling(x: number, y: number, z: number): Mat4 {
  const m = createMat4()
  m[0] = x
  m[5] = y
  m[10] = z
  return m
}

/** 矩阵乘法（a × b） */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0)
      }
      out[col * 4 + row] = sum
    }
  }
  return out
}

/**
 * 组合 TRS：M = T · R · S（与 glTF 节点语义一致）。
 * 三者都可省略，省略即为单位变换。
 */
export function composeTRS(
  t?: readonly number[] | undefined,
  r?: readonly number[] | undefined,
  s?: readonly number[] | undefined,
): Mat4 {
  const translate = translation(t?.[0] ?? 0, t?.[1] ?? 0, t?.[2] ?? 0)
  const rotate = r ? fromQuaternion(r) : createMat4()
  const scale = scaling(s?.[0] ?? 1, s?.[1] ?? 1, s?.[2] ?? 1)
  return multiply(multiply(translate, rotate), scale)
}

/** 判断是否为单位矩阵（用来跳过无意义的变换开销） */
export function isIdentity(m: Mat4): boolean {
  for (let i = 0; i < 16; i += 1) {
    const expected = i % 5 === 0 ? 1 : 0
    if (Math.abs((m[i] ?? 0) - expected) > 1e-6) return false
  }
  return true
}

/**
 * 变换一组顶点（w 视为 1），返回新数组。
 * 单位矩阵时直接返回原数组，避免为常见情况多做一次拷贝。
 */
export function transformPoints(m: Mat4, points: Float32Array): Float32Array {
  if (isIdentity(m)) return points

  const out = new Float32Array(points.length)
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i] ?? 0
    const y = points[i + 1] ?? 0
    const z = points[i + 2] ?? 0
    out[i] = (m[0] ?? 1) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0)
    out[i + 1] = (m[1] ?? 0) * x + (m[5] ?? 1) * y + (m[9] ?? 0) * z + (m[13] ?? 0)
    out[i + 2] = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 1) * z + (m[14] ?? 0)
  }
  return out
}

/** 变换一组方向（w 视为 0，忽略平移），用于法线 */
export function transformDirections(m: Mat4, directions: Float32Array): Float32Array {
  if (isIdentity(m)) return directions

  const out = new Float32Array(directions.length)
  for (let i = 0; i < directions.length; i += 3) {
    const x = directions[i] ?? 0
    const y = directions[i + 1] ?? 0
    const z = directions[i + 2] ?? 0
    out[i] = (m[0] ?? 1) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z
    out[i + 1] = (m[1] ?? 0) * x + (m[5] ?? 1) * y + (m[9] ?? 0) * z
    out[i + 2] = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 1) * z
  }
  return out
}

/**
 * 用 3×3 法线矩阵（normalMatrix 的输出）变换一组法线，并归一化。
 *
 * 为什么不复用 transformDirections：那个函数吃的是 16 元素的 Mat4，
 * 索引按 m[col * 4 + row] 走。把 9 元素的法线矩阵喂进去会越界读到 undefined
 * （`?? 1` 的兜底还会把结果伪装成一个"看起来合理"的值），
 * 法线就悄悄错了——这类错误在屏幕上只表现为明暗不对，极难发现。
 *
 * 退化的零向量给一个朝上的默认值：零法线在光照着色器里会算出全黑，
 * 看起来像加载失败。
 */
export function transformNormalsBy3(n: Float32Array, directions: Float32Array): Float32Array {
  const out = new Float32Array(directions.length)

  for (let i = 0; i < directions.length; i += 3) {
    const x = directions[i] ?? 0
    const y = directions[i + 1] ?? 0
    const z = directions[i + 2] ?? 0

    const nx = (n[0] ?? 1) * x + (n[3] ?? 0) * y + (n[6] ?? 0) * z
    const ny = (n[1] ?? 0) * x + (n[4] ?? 1) * y + (n[7] ?? 0) * z
    const nz = (n[2] ?? 0) * x + (n[5] ?? 0) * y + (n[8] ?? 1) * z

    const length = Math.hypot(nx, ny, nz)
    if (length > 1e-8) {
      out[i] = nx / length
      out[i + 1] = ny / length
      out[i + 2] = nz / length
    } else {
      out[i] = 0
      out[i + 1] = 0
      out[i + 2] = 1
    }
  }

  return out
}

/**
 * 法线矩阵：(M^-1)^T 的 3×3 部分（列主序展开成 9 个 float）。
 *
 * 为什么不能直接用模型矩阵：非等比缩放（例如 scale = [1, 2, 1]）会让法线
 * 不再垂直于表面，光照就错了。而 glTF 节点带非等比缩放是常见情况
 * （Tripo / Meshy 导出时经常用缩放把模型归一到单位盒），所以这里做完整求解。
 * 矩阵不可逆（含 0 缩放）时退化为单位阵，至少不会产生 NaN。
 */
export function normalMatrix(model: Mat4): Float32Array {
  // 上左 3×3，列主序读取：aN 对应 M[row][col]
  const a00 = model[0] ?? 1
  const a10 = model[1] ?? 0
  const a20 = model[2] ?? 0
  const a01 = model[4] ?? 0
  const a11 = model[5] ?? 1
  const a21 = model[6] ?? 0
  const a02 = model[8] ?? 0
  const a12 = model[9] ?? 0
  const a22 = model[10] ?? 1

  // 代数余子式
  const c00 = a11 * a22 - a12 * a21
  const c01 = a12 * a20 - a10 * a22
  const c02 = a10 * a21 - a11 * a20
  const c10 = a02 * a21 - a01 * a22
  const c11 = a00 * a22 - a02 * a20
  const c12 = a01 * a20 - a00 * a21
  const c20 = a01 * a12 - a02 * a11
  const c21 = a02 * a10 - a00 * a12
  const c22 = a00 * a11 - a01 * a10

  const det = a00 * c00 + a01 * c01 + a02 * c02
  const out = new Float32Array(9)

  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    out[0] = 1
    out[4] = 1
    out[8] = 1
    return out
  }

  const inv = 1 / det

  // (M^-1)^T 的第 row 行第 col 列 = 余子式 C_row,col / det
  // 而列主序存储要求 out[col * 3 + row] 写第 row 行第 col 列的值。
  out[0] = c00 * inv
  out[1] = c10 * inv
  out[2] = c20 * inv
  out[3] = c01 * inv
  out[4] = c11 * inv
  out[5] = c21 * inv
  out[6] = c02 * inv
  out[7] = c12 * inv
  out[8] = c22 * inv
  return out
}

/** 按面计算平滑法线（模型没带 NORMAL 时使用） */
export function computeVertexNormals(positions: Float32Array, indices: Uint32Array | null): Float32Array {
  const normals = new Float32Array(positions.length)
  const triangleCount = indices ? indices.length / 3 : positions.length / 9

  const accumulate = (ia: number, ib: number, ic: number): void => {
    const ax = positions[ia * 3] ?? 0
    const ay = positions[ia * 3 + 1] ?? 0
    const az = positions[ia * 3 + 2] ?? 0
    const bx = positions[ib * 3] ?? 0
    const by = positions[ib * 3 + 1] ?? 0
    const bz = positions[ib * 3 + 2] ?? 0
    const cx = positions[ic * 3] ?? 0
    const cy = positions[ic * 3 + 1] ?? 0
    const cz = positions[ic * 3 + 2] ?? 0

    // 面法线 = (B-A) × (C-A)，面积加权
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    for (const index of [ia, ib, ic]) {
      normals[index * 3] = (normals[index * 3] ?? 0) + nx
      normals[index * 3 + 1] = (normals[index * 3 + 1] ?? 0) + ny
      normals[index * 3 + 2] = (normals[index * 3 + 2] ?? 0) + nz
    }
  }

  for (let t = 0; t < triangleCount; t += 1) {
    const ia = indices ? (indices[t * 3] ?? 0) : t * 3
    const ib = indices ? (indices[t * 3 + 1] ?? 0) : t * 3 + 1
    const ic = indices ? (indices[t * 3 + 2] ?? 0) : t * 3 + 2
    accumulate(ia, ib, ic)
  }

  // 归一化
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i] ?? 0
    const y = normals[i + 1] ?? 0
    const z = normals[i + 2] ?? 0
    const length = Math.hypot(x, y, z) || 1
    normals[i] = x / length
    normals[i + 1] = y / length
    normals[i + 2] = z / length
  }

  return normals
}

// —— 向量小工具 ——

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** 包围盒中心 */
export function centerOf(min: Vec3, max: Vec3): Vec3 {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}
