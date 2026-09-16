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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { duetFileName, exportDuet } from '@/services/exportService'
import { exportElementToPng } from '@/services/imageExport'
import { collectDocumentCss, exportReadonlyHtml } from '@/services/htmlExport'
import { downloadBlob, downloadText } from '@/lib/download'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const store = useProjectStore()
const ui = useUiStore()
const settings = useSettingsStore()

const embedMedia = ref(true)
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
async function inPresentView<T>(fn: (root: HTMLElement) => Promise<T>): Promise<T | null> {
  const current = project.value
  if (!current) return null

  const previousMode = current.ui.mode
  const needsSwitch = previousMode !== 'present'

  if (needsSwitch) store.setMode('present')
  try {
    await nextFrames(needsSwitch ? 3 : 1)

    const root = document.querySelector<HTMLElement>('[data-present-root]')
    if (!root) {
      warnings.value = [...warnings.value, t('export.failed', { message: '未找到展示区域' })]
      return null
    }
    return await fn(root)
  } finally {
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
        return await exportElementToPng(root, {
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

    const name = safeName('png')
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
    // 样式在切换视图**之前**收集：切视图可能让部分样式表规则暂时不可读
    const css = collectDocumentCss()

    const result = await inPresentView(async (root) =>
      exportReadonlyHtml(current, {
        embedMedia: embedMedia.value,
        presentRoot: root,
        preCollectedCss: css,
        onProgress: (label) => {
          progress.value = label
        },
      }),
    )

    if (!result) return
    if (!result.ok) {
      warnings.value = [t('export.failed', { message: result.error })]
      return
    }

    const name = safeName('html')
    downloadText(result.value, name, 'text/html')
    ui.notify(t('export.done', { name }), 'success')
  } finally {
    busy.value = false
    progress.value = ''
  }
}

function close(): void {
  if (busy.value) return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click.self="close">
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="t('export.title')">
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

        <ul class="actions">
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

.dialog {
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
