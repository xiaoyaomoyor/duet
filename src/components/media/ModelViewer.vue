<script setup lang="ts">
/**
 * 极简 glTF 查看器（M5）
 *
 * 取舍说明：**不引入 three.js**。
 *   我们只需要"把静态模型转起来、看清轮廓"，而 three.js 会让首屏包体积翻数倍，
 *   与 §15 的性能预算直接冲突。这里用约 150 行 WebGL 完成同样的事。
 *
 * 不支持蒙皮/动画/材质贴图——parseGltf 会把这类情况作为 warning 返回，
 * 由本组件在界面上如实告知，而不是显示一个空场景让人困惑。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { parseGltf, fitDistance, type ParsedModel } from '@/lib/gltf'
import {
  centerOf,
  computeVertexNormals,
  createMat4,
  lookAt,
  multiply,
  normalMatrix,
  perspective,
  rotationY,
  type Mat4,
  type Vec3,
} from '@/lib/mat4'
import { onRafTick } from '@/composables/useRafTicker'

interface Props {
  /** 模型二进制（由 useAssetBuffer 取到） */
  buffer?: ArrayBuffer | null | undefined
  /** 自动旋转 */
  autoRotate?: boolean | undefined
  /** 背景色（CSS 颜色） */
  background?: string | undefined
}

/**
 * 不用 withDefaults：在 exactOptionalPropertyTypes 下，
 * 把可选属性声明为接受 undefined 才能让调用方直接传 `:buffer="buffer"`。
 * 默认值在组件内部通过 computed 兜底。
 */
const props = defineProps<Props>()

const autoRotate = computed(() => props.autoRotate !== false)

const { t } = useI18n()

const canvas = ref<HTMLCanvasElement | null>(null)
const model = ref<ParsedModel | null>(null)
const error = ref<string | null>(null)
const warnings = ref<string[]>([])
const unsupported = ref(false)

let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let buffers: Array<{ position: WebGLBuffer; normal: WebGLBuffer; index: WebGLBuffer | null; count: number }> = []
let unsubscribeRaf: (() => void) | null = null
let angle = 0

const stats = computed(() => model.value?.stats ?? null)

/** 顶点着色器：MVP + 法线矩阵 */
const VERTEX_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform mat3 uNormalMatrix;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vNormal = uNormalMatrix * aNormal;
  vPosition = (uModel * vec4(aPosition, 1.0)).xyz;
  gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
}
`

/** 片元着色器：两个方向光 + 边缘提亮，让无材质的模型也能看清结构 */
const FRAGMENT_SOURCE = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPosition;
uniform vec3 uColorA;
uniform vec3 uColorB;
void main() {
  vec3 n = normalize(vNormal);
  vec3 key = normalize(vec3(0.5, 0.8, 0.6));
  vec3 fill = normalize(vec3(-0.6, -0.2, -0.5));
  float d1 = max(dot(n, key), 0.0);
  float d2 = max(dot(n, fill), 0.0) * 0.4;
  float rim = pow(1.0 - abs(n.z), 2.0) * 0.35;
  float light = 0.22 + d1 * 0.7 + d2 + rim;
  vec3 base = mix(uColorA, uColorB, clamp(vPosition.y * 0.5 + 0.5, 0.0, 1.0));
  gl_FragColor = vec4(base * light, 1.0);
}
`

function compileShader(glContext: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = glContext.createShader(type)
  if (!shader) return null
  glContext.shaderSource(shader, source)
  glContext.compileShader(shader)
  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    glContext.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(glContext: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(glContext, glContext.VERTEX_SHADER, VERTEX_SOURCE)
  const fs = compileShader(glContext, glContext.FRAGMENT_SHADER, FRAGMENT_SOURCE)
  if (!vs || !fs) return null

  const p = glContext.createProgram()
  if (!p) return null

  glContext.attachShader(p, vs)
  glContext.attachShader(p, fs)
  glContext.linkProgram(p)
  glContext.deleteShader(vs)
  glContext.deleteShader(fs)

  if (!glContext.getProgramParameter(p, glContext.LINK_STATUS)) {
    glContext.deleteProgram(p)
    return null
  }
  return p
}

/** 把解析结果上传成 GPU 缓冲 */
function uploadModel(glContext: WebGLRenderingContext, parsed: ParsedModel): void {
  buffers = []

  for (const mesh of parsed.meshes) {
    const positionBuffer = glContext.createBuffer()
    glContext.bindBuffer(glContext.ARRAY_BUFFER, positionBuffer)
    glContext.bufferData(glContext.ARRAY_BUFFER, mesh.positions, glContext.STATIC_DRAW)

    const normals = mesh.normals ?? computeVertexNormals(mesh.positions, mesh.indices)
    const normalBuffer = glContext.createBuffer()
    glContext.bindBuffer(glContext.ARRAY_BUFFER, normalBuffer)
    glContext.bufferData(glContext.ARRAY_BUFFER, normals, glContext.STATIC_DRAW)

    let indexBuffer: WebGLBuffer | null = null
    let count = mesh.positions.length / 3
    if (mesh.indices) {
      indexBuffer = glContext.createBuffer()
      glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, indexBuffer)
      glContext.bufferData(glContext.ELEMENT_ARRAY_BUFFER, mesh.indices, glContext.STATIC_DRAW)
      count = mesh.indices.length
    }

    if (positionBuffer && normalBuffer) {
      buffers.push({ position: positionBuffer, normal: normalBuffer, index: indexBuffer, count })
    }
  }
}

function draw(): void {
  const glContext = gl
  const canvasEl = canvas.value
  if (!glContext || !canvasEl || !program || !model.value) return

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.floor(canvasEl.clientWidth * dpr))
  const height = Math.max(1, Math.floor(canvasEl.clientHeight * dpr))
  if (canvasEl.width !== width || canvasEl.height !== height) {
    canvasEl.width = width
    canvasEl.height = height
  }

  glContext.viewport(0, 0, width, height)
  glContext.clearColor(0, 0, 0, 0)
  glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT)
  glContext.enable(glContext.DEPTH_TEST)
  glContext.enable(glContext.CULL_FACE)

  glContext.useProgram(program)

  const bounds = model.value.bounds
  const center = centerOf(bounds.min, bounds.max)
  const distance = fitDistance(bounds)

  const projection = perspective(45, width / height, 0.01, distance * 50)
  // 相机沿 +Z 方向后退，看向包围盒中心
  const view = lookAt([center[0], center[1], center[2] + distance], center as Vec3)
  const viewProjection = multiply(projection, view)

  const modelMatrix: Mat4 = autoRotate.value ? rotationY(angle) : createMat4()

  const uModel = glContext.getUniformLocation(program, 'uModel')
  const uViewProjection = glContext.getUniformLocation(program, 'uViewProjection')
  const uNormalMatrix = glContext.getUniformLocation(program, 'uNormalMatrix')
  const uColorA = glContext.getUniformLocation(program, 'uColorA')
  const uColorB = glContext.getUniformLocation(program, 'uColorB')

  glContext.uniformMatrix4fv(uModel, false, modelMatrix)
  glContext.uniformMatrix4fv(uViewProjection, false, viewProjection)
  glContext.uniformMatrix3fv(uNormalMatrix, false, normalMatrix(modelMatrix))
  glContext.uniform3f(uColorA, 0.65, 0.55, 0.98)
  glContext.uniform3f(uColorB, 0.13, 0.83, 0.93)

  const aPosition = glContext.getAttribLocation(program, 'aPosition')
  const aNormal = glContext.getAttribLocation(program, 'aNormal')

  for (const entry of buffers) {
    glContext.bindBuffer(glContext.ARRAY_BUFFER, entry.position)
    glContext.enableVertexAttribArray(aPosition)
    glContext.vertexAttribPointer(aPosition, 3, glContext.FLOAT, false, 0, 0)

    glContext.bindBuffer(glContext.ARRAY_BUFFER, entry.normal)
    glContext.enableVertexAttribArray(aNormal)
    glContext.vertexAttribPointer(aNormal, 3, glContext.FLOAT, false, 0, 0)

    if (entry.index) {
      glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, entry.index)
      glContext.drawElements(glContext.TRIANGLES, entry.count, glContext.UNSIGNED_INT, 0)
    } else {
      glContext.drawArrays(glContext.TRIANGLES, 0, entry.count)
    }
  }
}

function parse(): void {
  error.value = null
  warnings.value = []
  unsupported.value = false
  model.value = null
  buffers = []

  const buffer = props.buffer
  if (!buffer) return

  const result = parseGltf(buffer)
  if (!result.ok) {
    error.value = result.detail ?? result.error
    unsupported.value = result.error === 'unsupported-buffer'
    return
  }

  model.value = result.model
  warnings.value = result.model.warnings
  if (gl) uploadModel(gl, result.model)
}

onMounted(() => {
  const canvasEl = canvas.value
  if (!canvasEl) return

  gl = (canvasEl.getContext('webgl', { antialias: true, alpha: true }) ??
    canvasEl.getContext('experimental-webgl', { alpha: true })) as WebGLRenderingContext | null

  if (!gl) {
    error.value = t('model3d.noWebgl')
    return
  }

  program = createProgram(gl)
  if (!program) {
    error.value = t('model3d.shaderFailed')
    return
  }

  parse()

  unsubscribeRaf = onRafTick((deltaMs) => {
    if (autoRotate.value) {
      angle += deltaMs * 0.0004
      if (angle > Math.PI * 2) angle -= Math.PI * 2
    }
    draw()
  })
})

onBeforeUnmount(() => {
  unsubscribeRaf?.()
  unsubscribeRaf = null
  buffers = []
  if (gl) {
    if (program) gl.deleteProgram(program)
    gl = null
  }
})

watch(() => props.buffer, parse)
</script>

<template>
  <div class="model3d" :style="{ background: props.background ?? undefined }">
    <canvas ref="canvas" class="model3d__canvas" />

    <!-- 解析失败/不支持：如实说明，不留空白 -->
    <div v-if="error" class="model3d__state model3d__state--error">
      <AppIcon name="cube" :size="18" />
      <span>{{ error }}</span>
      <span v-if="unsupported" class="model3d__hint">{{ t('model3d.unsupportedHint') }}</span>
    </div>

    <div v-else-if="!buffer" class="model3d__state">
      <AppIcon name="cube" :size="18" />
      <span>{{ t('model3d.empty') }}</span>
    </div>

    <div v-if="stats && !error" class="model3d__stats">
      {{ t('model3d.stats', { v: stats.vertices, t: stats.triangles }) }}
    </div>

    <ul v-if="warnings.length > 0" class="model3d__warnings">
      <li v-for="(warning, index) in warnings" :key="index">{{ warning }}</li>
    </ul>
  </div>
</template>

<style scoped>
.model3d {
  position: relative;
  width: 100%;
  min-height: 220px;
  overflow: hidden;
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.model3d__canvas {
  display: block;
  width: 100%;
  height: 260px;
}

.model3d__state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  justify-content: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.model3d__state--error {
  color: var(--danger);
}

.model3d__hint {
  max-width: 80%;
  font-size: 10px;
  color: var(--text-disabled);
  text-align: center;
}

.model3d__stats {
  position: absolute;
  bottom: var(--sp-2);
  left: var(--sp-2);
  padding: 0 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-disabled);
  background: rgb(0 0 0 / 45%);
  border-radius: var(--radius-xs);
}

.model3d__warnings {
  position: absolute;
  right: var(--sp-2);
  bottom: var(--sp-2);
  left: var(--sp-2);
  font-size: 10px;
  color: var(--warning);
  list-style: none;
}
</style>
