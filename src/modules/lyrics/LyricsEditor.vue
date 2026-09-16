<script setup lang="ts">
/**
 * 歌词编辑器
 *
 * 关键交互：
 *   - 导入 .txt / .lrc：**既能点按钮，也能直接把文件拖进来**
 *   - 实时显示"已识别 N 行 / 含时间轴"
 *   - 有时间轴时才显示"与音频同步"开关（避免无意义选项）
 *
 * 关于拖入（用户实测反馈"无法把 .txt 拖进歌词模块，但导入可以"）：
 *   MediaPicker 有拖放，但歌词是**文本**模块，走的是自己的编辑器，
 *   两边各写一套拖放逻辑，于是只有媒体那边生效。
 *   这里补上文本拖放，并明确区分"拖的是不是文本文件"——
 *   拖进来一张图片时给出说明，而不是静默忽略。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useUiStore } from '@/stores/useUiStore'
import { parseLrc } from '@/lib/lrc'
import type { ModuleEditorProps } from '../types'
import type { LyricsData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()
const ui = useUiStore()

const fileInput = ref<HTMLInputElement | null>(null)
/** 拖拽悬停中（用于给出明确的放置反馈） */
const dragging = ref(false)

const data = computed<LyricsData>(() => {
  const raw = props.module.data as Partial<LyricsData> | undefined
  return {
    text: typeof raw?.text === 'string' ? raw.text : '',
    syncWithAudio: raw?.syncWithAudio !== false,
    maxHeight: raw?.maxHeight ?? 240,
  }
})

const parsed = computed(() => parseLrc(data.value.text))
const lineCount = computed(() => parsed.value.lines.length)

/** 把一段文本写进模块（导入与拖入共用，保证反馈文案一致） */
function applyText(text: string): void {
  if (!text.trim()) {
    ui.notify(t('lyrics.emptyFile'), 'warning')
    return
  }
  props.patchData({ text })

  const result = parseLrc(text)
  ui.notify(
    result.timed
      ? t('lyrics.importedTimed', { n: result.lines.length })
      : t('lyrics.importedPlain', { n: result.lines.length }),
    'success',
  )
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    applyText(await file.text())
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), 'danger')
  }
}

// —— 拖放 ——

function onDragOver(event: DragEvent): void {
  if (props.readonly) return
  // 必须 preventDefault，否则浏览器会把文件当作"打开新页面"处理
  event.preventDefault()
  dragging.value = true
}

function onDragLeave(): void {
  dragging.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  if (props.readonly) return
  event.preventDefault()
  dragging.value = false

  const file = event.dataTransfer?.files?.[0]
  if (!file) return

  // 只接受文本类文件，并且明确告知为什么拒收——
  // 静默什么都不发生是最让人困惑的行为
  if (!isTextLike(file)) {
    ui.notify(t('lyrics.dropNotText', { name: file.name }), 'warning')
    return
  }

  try {
    applyText(await file.text())
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), 'danger')
  }
}

/** 是否是本模块能读的文本文件：按 MIME 或扩展名判断（很多 .lrc 没有 MIME） */
function isTextLike(file: File): boolean {
  if (file.type.startsWith('text/')) return true
  return /\.(txt|lrc|text)$/i.test(file.name)
}
</script>

<template>
  <div
    class="editor"
    :class="{ 'editor--dragging': dragging }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <textarea
      class="editor__area"
      :value="data.text"
      :readonly="readonly"
      :placeholder="t('lyrics.placeholder')"
      rows="5"
      @input="patchData({ text: ($event.target as HTMLTextAreaElement).value })"
    />

    <!-- 拖拽悬停提示：盖在输入区上，明确告诉用户"松手就导入" -->
    <p v-if="dragging" class="editor__drop">{{ t('lyrics.dropHint') }}</p>

    <div class="editor__bar">
      <button class="ghost-btn" type="button" :disabled="readonly" @click="fileInput?.click()">
        <AppIcon name="import" :size="13" />
        {{ t('lyrics.importFile') }}
      </button>

      <span class="editor__stat">
        {{ t('lyrics.lineCount', { n: lineCount }) }}
        <span v-if="parsed.timed" class="editor__badge">{{ t('lyrics.timed') }}</span>
        <span v-else-if="lineCount > 0" class="editor__badge editor__badge--muted">
          {{ t('lyrics.plain') }}
        </span>
      </span>
    </div>

    <label v-if="parsed.timed" class="editor__switch">
      <input
        type="checkbox"
        :checked="data.syncWithAudio"
        :disabled="readonly"
        @change="patchData({ syncWithAudio: ($event.target as HTMLInputElement).checked })"
      />
      <span>{{ t('lyrics.syncWithAudio') }}</span>
    </label>

    <p class="editor__hint">{{ t('lyrics.alignHint') }}</p>

    <input
      ref="fileInput"
      class="u-visually-hidden"
      type="file"
      accept=".txt,.lrc,text/plain"
      @change="onFileChosen"
    />
  </div>
</template>

<style scoped>
.editor {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

/* 拖拽悬停：整块高亮，明确表示"这里可以放" */
.editor--dragging .editor__area {
  border-color: var(--accent-500);
  border-style: dashed;
  background: var(--accent-soft);
}

.editor__drop {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 110px;
  font-size: var(--fs-sm);
  color: var(--accent-500);
  pointer-events: none; /* 别把 drop 事件吃掉 */
}

.editor__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__area {
  width: 100%;
  min-height: 110px;
  padding: var(--sp-3);
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  resize: vertical;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__area::placeholder {
  color: var(--text-disabled);
}

.editor__bar {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
}

.editor__stat {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__badge {
  padding: 0 6px;
  color: var(--success);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.editor__badge--muted {
  color: var(--text-muted);
}

.editor__switch {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.ghost-btn {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.ghost-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
