<script setup lang="ts">
/**
 * 导出对话框（§17 M3-3 / M3-4 / M3-5）
 *
 * 三种导出集中在一处，因为它们共享同一批前置条件：
 *   - 媒体是否内嵌（决定体积与可移植性）
 *   - 长图与只读页都必须在**演示视图下**截图，否则会把编辑器也截进去
 *
 * 纪律：
 *   1. 导出必须有进度与失败原因（点完没反应是最差的体验）
 *   2. 视图切换必须成对出现（finally 里还原），否则用户会发现界面莫名其妙变了
 */
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import PresentationExport from '@/components/studio/PresentationExport.vue'
import { exportFrames, type ExportFrame } from '@/services/presentationExport'
const portable = ref(true)
const runtimeFrames = ref<ExportFrame[]>([])
const currentStep = ref(false)
import { useModalFocus } from '@/composables/useModalFocus'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { duetFileName, exportDuet } from '@/services/exportService'
import { exportPagedPng } from '@/services/pagedImageExport'
import { assetInventory, exportProjectBundle, type AssetInventory } from '@/services/projectBundle'
import { exportReadonlyHtml } from '@/services/htmlExport'
import { waitForMediaResolutions } from '@/composables/useResolvedMedia'
import { loadLocalLogos } from '@/lib/localLogos'
import { downloadBlob, downloadText } from '@/lib/download'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()
const settings = useSettingsStore()

const inventory = shallowRef<AssetInventory | null>(null)
const inventoryError = ref('')
const paginate = ref(false)
const bundleBlocked = computed(
  () =>
    !inventory.value ||
    !!inventory.value.missing.length ||
    !!inventory.value.external ||
    inventory.value.bytes > 128 * 1024 * 1024,
)
async function refreshInventory() {
  inventory.value = null
  inventoryError.value = ''
  if (!project.value) return
  try {
    inventory.value = await assetInventory(project.value)
  } catch (e) {
    inventoryError.value = e instanceof Error ? e.message : String(e)
  }
}
async function doExportBundle() {
  if (!project.value) return
  busy.value = true
  warnings.value = []
  progress.value = '打包项目与本地媒体…'
  try {
    const r = await exportProjectBundle(project.value)
    if (!r.ok) warnings.value = [r.error]
    else downloadBlob(r.value, safeName('duetpack'))
  } finally {
    busy.value = false
    progress.value = ''
  }
}
const embedMedia = ref(true)
const reportExport = ref(true)
const busy = ref(false)
const progress = ref('')
const warnings = ref<string[]>([])

const project = computed(() => store.current)

function safeName(ext: string): string {
  const title = project.value?.title?.trim() || 'duet'
  return `${title.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    warnings.value = []
    progress.value = ''
    embedMedia.value = true
    void refreshInventory()
  },
)

/** 等两帧：第一帧完成视图切换，第二帧让渲染器内的媒体解析完成 */
function nextFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count
    const tick = (): void => {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * 在演示视图下执行 fn，结束后无条件还原视图态。
 * @param fn 收到展示态画布根节点（已等渲染完成）
 */
async function inPresentView<T>(
  fn: (root: HTMLElement) => Promise<T>,
  report = reportExport.value,
): Promise<T | null> {
  const current = project.value
  if (!current) return null

  const previousMode = current.ui.mode
  const previousExport = ui.presentationExport
  const previousStep = ui.presentationCurrentStep
  ui.presentationCurrentStep = !report && currentStep.value
  if (current.workspace === 'modern')
    ui.presentationExport = report ? 'report' : 'scene'
  const needsSwitch = previousMode !== 'present' && current.workspace === 'legacy'

  if (needsSwitch) store.setMode('present')
  try {
    await nextFrames(needsSwitch ? 3 : 1)

    const root =
      document.querySelector<HTMLElement>('[data-runtime-export]') ??
      document.querySelector<HTMLElement>('[data-present-root]')
    if (!root) {
      warnings.value = [...warnings.value, t('export.failed', { message: '未找到展示区域' })]
      return null
    }
    const started = performance.now()
    while (root.querySelector('[data-render-pending]')) {
      if (performance.now() - started > 15000) throw new Error('展示模块尚未加载完成，请重试')
      await nextFrames(1)
    }
    await Promise.all([waitForMediaResolutions(), loadLocalLogos()])
    await nextTick()
    await nextFrames(1)
    return await fn(root)
  } catch (error) {
    warnings.value = [
      t('export.failed', { message: error instanceof Error ? error.message : String(error) }),
    ]
    return null
  } finally {
    ui.presentationExport = previousExport
    ui.presentationCurrentStep = previousStep
    if (needsSwitch) store.setMode('edit')
  }
}

// ————————————————————————————————————————————————————————
// 三种导出
// ————————————————————————————————————————————————————————

async function doExportDuet(): Promise<void> {
  const current = project.value
  if (!current) return

  busy.value = true
  warnings.value = []
  progress.value = t('export.exporting')
  try {
    const result = await exportDuet([current], {
      embedMedia: embedMedia.value,
      onProgress: (ratio, label) => {
        progress.value = `${Math.round(ratio * 100)}% · ${label}`
      },
    })

    if (!result.ok) {
      warnings.value = [t('export.failed', { message: result.error })]
      return
    }

    const name = duetFileName()
    downloadText(JSON.stringify(result.value, null, 2), name)
    if (result.value.warnings.length > 0) warnings.value = result.value.warnings
    ui.notify(t('export.done', { name }), 'success')
  } finally {
    busy.value = false
    progress.value = ''
  }
}

async function exportMigrationSnapshot() {
  const p = project.value,
    snapshot = p?.migrationSnapshot
  if (!p || !snapshot) return
  busy.value = true
  try {
    const {
      comparison: _comparison,
      migrationSnapshot: _snapshot,
      appearance: _appearance,
      workspace: _workspace,
      ...original
    } = p
    const legacy = {
      ...original,
      schemaVersion: snapshot.schemaVersion,
      sheet: snapshot.sheet,
      ...(snapshot.comparison ? { comparison: snapshot.comparison } : {}),
      ...(snapshot.appearance ? { appearance: snapshot.appearance } : {}),
      ...(snapshot.workspace ? { workspace: snapshot.workspace } : {}),
    }
    const result = await exportDuet([legacy], { embedMedia: true })
    if (!result.ok) {
      warnings.value = [result.error]
      return
    }
    result.value.schemaVersion = snapshot.schemaVersion
    downloadText(JSON.stringify(result.value), `${p.title}-升级前-v${snapshot.schemaVersion}.duet`)
    warnings.value = result.value.warnings
  } finally {
    busy.value = false
  }
}

async function doExportImage(): Promise<void> {
  if (!project.value) return

  busy.value = true
  warnings.value = []
  progress.value = t('export.exporting')
  try {
    const result = await inPresentView(async (root) => {
      // 导出态样式：隐藏工具栏等 .no-export 元素
      document.body.dataset.exporting = '1'
      try {
        await nextFrames(1)
        return await exportPagedPng(root, {
          paginate: paginate.value,
          scale: settings.settings.exportScale,
          onProgress: (label) => {
            progress.value = label
          },
        })
      } finally {
        delete document.body.dataset.exporting
      }
    })

    if (!result) return
    if (!result.ok) {
      warnings.value = [t('export.failed', { message: result.error })]
      return
    }

    const name = safeName(result.value.extension)
    downloadBlob(result.value.blob, name)
    if (result.value.warnings.length > 0) warnings.value = result.value.warnings
    ui.notify(t('export.done', { name }), 'success')
  } finally {
    busy.value = false
    progress.value = ''
  }
}

async function doExportHtml(): Promise<void> {
  const current = project.value
  if (!current) return

  busy.value = true
  warnings.value = []
  progress.value = t('export.exporting')
  try {
    if (portable.value && current.comparison && current.workspace === 'modern') {
      if (!embedMedia.value) {
        warnings.value = [
          '演示网页需要内嵌媒体才能离线切换。请开启内嵌媒体，或取消“包含作品切换与步骤”。',
        ]
        return
      }
      runtimeFrames.value = exportFrames(current)
    }
    const result = await inPresentView(
      async (root) =>
        exportReadonlyHtml(current, {
          embedMedia: embedMedia.value,
          portable: runtimeFrames.value.length > 0,
          presentRoot: root,
          onProgress: (label) => {
            progress.value = label
          },
        }),
      true,
    )

    if (!result) return
    if (!result.ok) {
      warnings.value = [t('export.failed', { message: result.error })]
      return
    }

    const name = safeName('html')
    downloadText(result.value, name, 'text/html')
    ui.notify(t('export.done', { name }), 'success')
  } catch (error) {
    warnings.value = [error instanceof Error ? error.message : String(error)]
  } finally {
    runtimeFrames.value = []
    busy.value = false
    progress.value = ''
  }
}

function close(): void {
  if (busy.value) return
  emit('close')
}
const dialogRoot = ref<HTMLElement | null>(null)
useModalFocus(dialogRoot, close)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="runtimeFrames.length && project"
      style="position: fixed; left: -100000px; top: 0; pointer-events: none"
      aria-hidden="true"
    >
      <PresentationExport :project="project" :frames="runtimeFrames" />
    </div>
    <div v-if="open" class="mask" @click.self="close">
      <div
        ref="dialogRoot"
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('export.title')"
      >
        <header class="dialog__head">
          <h2 class="dialog__title">{{ t('export.title') }}</h2>
          <button
            class="dialog__close"
            type="button"
            :disabled="busy"
            :aria-label="t('common.close')"
            @click="close"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <label class="option">
          <input v-model="embedMedia" type="checkbox" :disabled="busy" />
          <span class="option__text">
            <span class="option__label">{{ t('export.embedMedia') }}</span>
            <span class="option__hint">{{ t('export.embedMediaHint') }}</span>
          </span>
        </label>

        <label v-if="project?.workspace === 'modern'" class="option">
          <input v-model="reportExport" type="checkbox" :disabled="busy" />
          <span class="option__text"
            ><span class="option__label">{{ t('studio.reportExport') }}</span
            ><span class="option__hint">{{ t('studio.reportExportHint') }}</span></span
          >
        </label>
        <label v-if="project?.workspace === 'modern'" class="option"
          ><input v-model="portable" type="checkbox" :disabled="busy" /><span class="option__text"
            ><span class="option__label">网页包含作品切换与演示步骤</span
            ><span class="option__hint"
              >导出所有测试题的可见场景与作品；超过 120
              个画面组合时，请取消此项导出当前题的阅读页。</span
            ></span
          ></label
        >
        <label v-if="project?.workspace === 'modern' && !reportExport" class="option"
          ><input v-model="currentStep" type="checkbox" :disabled="busy" /><span
            class="option__text"
            ><span class="option__label">图片只保留当前步骤</span
            ><span class="option__hint"
              >默认显示完整场景；勾选后保留当前隐藏和聚焦状态。</span
            ></span
          ></label
        >
        <button
          v-if="project?.migrationSnapshot"
          class="option"
          :disabled="busy"
          @click="exportMigrationSnapshot"
        >
          下载升级前的恢复工程（v{{ project.migrationSnapshot.schemaVersion }}）
        </button>
        <label class="option"
          ><input
            aria-label="图片按场景分页"
            v-model="paginate"
            type="checkbox"
            :disabled="busy"
          /><span class="option__text"
            ><span class="option__label">图片按场景分页</span
            ><span class="option__hint"
              >多页合并为 ZIP。超长报告会自动分页，保留导出倍率。</span
            ></span
          ></label
        >
        <div class="inventory" role="status">
          <strong>素材交付检查</strong>
          <p v-if="inventory">
            本地 {{ inventory.assets.length }} 项 · {{ (inventory.bytes / 1048576).toFixed(1) }} MiB
            · 缺失 {{ inventory.missing.length }} 项 · 外链 {{ inventory.external }} 项
          </p>
          <p v-else>{{ inventoryError || '正在检查…' }}</p>
          <small
            >完整素材包包含所有作品和恢复快照引用，限 128
            MiB；外链需先镜像，在线嵌入页不随包离线。普通工程单个内嵌媒体上限 20 MiB。</small
          >
        </div>
        <ul class="actions">
          <li>
            <button
              class="action"
              type="button"
              :disabled="busy || bundleBlocked"
              @click="doExportBundle"
            >
              <AppIcon name="export" :size="16" class="action__icon" /><span class="action__text"
                ><span class="action__label">完整素材包 .duetpack</span
                ><span class="action__hint">工程与本地媒体一起交付，可直接导入恢复。</span></span
              >
            </button>
          </li>
          <li>
            <button class="action" type="button" :disabled="busy" @click="doExportDuet">
              <AppIcon name="export" :size="16" class="action__icon" />
              <span class="action__text">
                <span class="action__label">{{ t('export.duet') }}</span>
                <span class="action__hint">{{ t('export.duetHint') }}</span>
              </span>
            </button>
          </li>
          <li>
            <button class="action" type="button" :disabled="busy" @click="doExportImage">
              <AppIcon name="image" :size="16" class="action__icon" />
              <span class="action__text">
                <span class="action__label">{{ t('export.image') }}</span>
                <span class="action__hint">
                  {{ t('export.imageHint') }} · {{ t('export.scale') }}
                  {{ settings.settings.exportScale }}×
                </span>
              </span>
            </button>
          </li>
          <li>
            <button class="action" type="button" :disabled="busy" @click="doExportHtml">
              <AppIcon name="link" :size="16" class="action__icon" />
              <span class="action__text">
                <span class="action__label">{{ t('export.html') }}</span>
                <span class="action__hint">{{ t('export.htmlHint') }}</span>
              </span>
            </button>
          </li>
        </ul>

        <p v-if="busy" class="status" role="status">
          <AppIcon name="import" :size="13" />
          {{ progress || t('export.exporting') }}
        </p>

        <div v-if="warnings.length > 0" class="warn" role="alert">
          <p class="warn__title">{{ t('export.warnTitle') }}</p>
          <ul>
            <li v-for="(item, index) in warnings" :key="index">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
}

.inventory {
  padding: 12px 14px;
  margin: 12px 0;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.8;
}
.inventory small {
  color: var(--text-muted);
}
.dialog {
  max-height: calc(100dvh - 40px);
  overflow: auto;
  width: min(520px, calc(100vw - 48px));
  padding: var(--sp-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
}

.dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-4);
}

.dialog__title {
  font-size: var(--fs-lg);
}

.dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.dialog__close:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.option {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  padding: var(--sp-3);
  margin-bottom: var(--sp-4);
  background: var(--bg-surface-2);
  border-radius: var(--radius-md);
}

.option input {
  margin-top: 2px;
  accent-color: var(--accent-solid);
}

.option__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option__label {
  font-size: var(--fs-sm);
}

.option__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.action {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  width: 100%;
  padding: var(--sp-3);
  text-align: left;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.action:hover:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.action__icon {
  flex: none;
  color: var(--accent-500);
}

.action__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action__label {
  font-size: var(--fs-sm);
}

.action__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.status {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-top: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--accent-500);
}

.warn {
  padding: var(--sp-3);
  margin-top: var(--sp-3);
  border: 1px solid var(--warning);
  border-radius: var(--radius-md);
}

.warn__title {
  font-size: var(--fs-xs);
  color: var(--warning);
}

.warn ul {
  padding-left: var(--sp-4);
  margin-top: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  list-style: disc;
}
</style>
